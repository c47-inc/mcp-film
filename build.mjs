#!/usr/bin/env node
/**
 * mcp.film static site generator — zero dependencies, by design.
 * Everything the site needs is generated from data/ by this script.
 *
 *   node build.mjs                 build into dist/
 *   node build.mjs --validate-only validate data files and exit
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./src/templates.mjs";
import { renderOgPng } from "./scripts/og.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data");
const DIST = path.join(ROOT, "dist");

// ---------------------------------------------------------------- load data
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const site = readJson(path.join(DATA, "site.json"));
const categories = readJson(path.join(DATA, "categories.json"));
const ratings = readJson(path.join(DATA, "ratings.json"));

const servers = fs
  .readdirSync(path.join(DATA, "registry"))
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => readJson(path.join(DATA, "registry", f)))
  .sort((a, b) => a.name.localeCompare(b.name));

// ------------------------------------------------------------------ validate
const errors = [];
const catIds = new Set(categories.map((c) => c.id));
const slugs = new Set();
const REQUIRED = [
  "slug", "name", "vendor", "official", "category", "tagline",
  "description", "capabilities", "install", "auth", "pricing",
  "links", "added", "verified",
];
const PRICING = new Set(["free", "freemium", "paid", "credits"]);
const isUrl = (u) => typeof u === "string" && /^https:\/\/\S+$/.test(u);

for (const s of servers) {
  const where = `registry entry "${s.slug ?? s.name ?? "?"}"`;
  for (const k of REQUIRED) {
    if (s[k] === undefined) errors.push(`${where}: missing field "${k}"`);
  }
  if (s.slug) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s.slug)) errors.push(`${where}: bad slug format`);
    if (slugs.has(s.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(s.slug);
  }
  if (s.category && !catIds.has(s.category)) errors.push(`${where}: unknown category "${s.category}"`);
  if (s.tagline && s.tagline.length > 120) errors.push(`${where}: tagline over 120 chars`);
  if (s.pricing && !PRICING.has(s.pricing)) errors.push(`${where}: pricing must be one of ${[...PRICING].join("/")}`);
  if (typeof s.official !== "boolean") errors.push(`${where}: "official" must be boolean`);
  for (const d of ["added", "verified"]) {
    if (s[d] && !/^\d{4}-\d{2}-\d{2}$/.test(s[d])) errors.push(`${where}: "${d}" must be YYYY-MM-DD`);
  }
  if (s.install?.remote_url && !isUrl(s.install.remote_url)) errors.push(`${where}: remote_url must be https`);
  for (const [k, v] of Object.entries(s.links ?? {})) {
    if (v !== null && !isUrl(v)) errors.push(`${where}: links.${k} must be https or null`);
  }
}

if (errors.length) {
  console.error(`✗ data validation failed (${errors.length} problem${errors.length > 1 ? "s" : ""}):\n`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✓ data valid: ${servers.length} servers, ${categories.length} categories`);
if (process.argv.includes("--validate-only")) process.exit(0);

// ------------------------------------------------------------------ context
const ctx = {
  site,
  categories,
  servers,
  ratings: ratings.ratings ?? {},
  trending: ratings.trending ?? [],
  built: new Date().toISOString(),
  officialCount: servers.filter((s) => s.official).length,
  remoteCount: servers.filter((s) => s.install?.remote_url).length,
};

// ------------------------------------------------------------------- emit
fs.rmSync(DIST, { recursive: true, force: true });
const write = (rel, content) => {
  const p = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};

// pages
write("index.html", T.renderHome(ctx));
write("stack/index.html", T.renderStack(ctx));
write("for-agents/index.html", T.renderForAgents(ctx));
write("about/index.html", T.renderAbout(ctx));
write("submit/index.html", T.renderSubmit(ctx));
write("404.html", T.render404(ctx));

for (const cat of categories) {
  write(`categories/${cat.id}/index.html`, T.renderCategory(ctx, cat));
}
for (const s of servers) {
  write(`mcps/${s.slug}/index.html`, T.renderServer(ctx, s));
  write(`mcps/${s.slug}.md`, T.renderServerMd(ctx, s));
  write(`api/mcps/${s.slug}.json`, JSON.stringify(s, null, 2));
}

// agent-readable surfaces
write("llms.txt", T.renderLlmsTxt(ctx));
write("llms-full.txt", T.renderLlmsFull(ctx));
write("stack.md", T.renderStackMd(ctx));
write("for-agents.md", T.renderForAgentsMd(ctx));
write("index.md", T.renderIndexMd(ctx));

// machine API (static JSON, stable URLs)
const registryDoc = {
  $schema: "https://mcp.film/api/schema.json",
  name: "mcp.film",
  description: site.description,
  updated: ctx.built,
  count: servers.length,
  categories,
  servers,
  ratings: ctx.ratings,
};
write("api/registry.json", JSON.stringify(registryDoc, null, 2));
write("api/registry.min.json", JSON.stringify(registryDoc));
write("api/categories.json", JSON.stringify(categories, null, 2));
write("api/stats.json", JSON.stringify({
  servers: servers.length,
  official: ctx.officialCount,
  remote: ctx.remoteCount,
  categories: categories.length,
  updated: ctx.built,
}, null, 2));

// crawler surfaces
write("sitemap.xml", T.renderSitemap(ctx));
write("robots.txt", T.renderRobots(ctx));
write("feed.xml", T.renderFeed(ctx));

// hosting glue (GitHub Pages)
write("CNAME", site.domain + "\n");
write(".nojekyll", "");

// static assets
write("assets/styles.css", fs.readFileSync(path.join(ROOT, "src/styles.css"), "utf8"));
write("assets/app.js", fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8"));
for (const f of fs.readdirSync(path.join(ROOT, "public"))) {
  fs.copyFileSync(path.join(ROOT, "public", f), path.join(DIST, "assets", f));
}

// social card — generated pixel-art PNG, zero dependencies
write("assets/og.png", renderOgPng());

// snapshot of registry for the npx mcp-film fallback data
fs.mkdirSync(path.join(ROOT, "packages/mcp-server"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "packages/mcp-server/registry.snapshot.json"),
  JSON.stringify(registryDoc),
);

const pages = servers.length + categories.length + 6;
console.log(`✓ built ${pages} pages + API + agent surfaces → dist/`);
