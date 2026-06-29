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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, "data");
const DIST = path.join(ROOT, "dist");

// ---------------------------------------------------------------- load data
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const site = readJson(path.join(DATA, "site.json"));
const categories = readJson(path.join(DATA, "categories.json"));
const playbooks = readJson(path.join(DATA, "playbooks.json"));
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
const STAGES = new Set(["develop", "visualize", "shoot", "sound", "cut", "finish", "ship"]);
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

const allPlaybookSlugs = (p) => [
  ...(p.primary_slugs ?? []),
  ...(p.fallback_slugs ?? []),
  ...(p.steps ?? []).flatMap((step) => step.slugs ?? []),
];
const playbookIds = new Set();
for (const p of playbooks) {
  const where = `playbook "${p.id ?? p.title ?? "?"}"`;
  for (const k of ["id", "title", "summary", "best_for", "constraints", "primary_slugs", "steps", "fallback_slugs"]) {
    if (p[k] === undefined) errors.push(`${where}: missing field "${k}"`);
  }
  if (p.id) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id)) errors.push(`${where}: bad id format`);
    if (playbookIds.has(p.id)) errors.push(`${where}: duplicate id`);
    playbookIds.add(p.id);
  }
  if (!Array.isArray(p.constraints) || p.constraints.length < 1) errors.push(`${where}: constraints must be a non-empty array`);
  if (!Array.isArray(p.primary_slugs) || p.primary_slugs.length < 3) errors.push(`${where}: primary_slugs must include at least 3 servers`);
  if (!Array.isArray(p.steps) || p.steps.length < 1) errors.push(`${where}: steps must be a non-empty array`);
  for (const [i, step] of (p.steps ?? []).entries()) {
    if (!STAGES.has(step.stage)) errors.push(`${where}: steps[${i}].stage must be a known pipeline stage`);
    if (!step.intent) errors.push(`${where}: steps[${i}].intent is required`);
    if (!Array.isArray(step.slugs) || step.slugs.length < 1) errors.push(`${where}: steps[${i}].slugs must be non-empty`);
  }
  for (const slug of allPlaybookSlugs(p)) {
    if (!slugs.has(slug)) errors.push(`${where}: unknown server slug "${slug}"`);
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
const logosDir = path.join(DATA, "logos");
const logos = new Set(
  fs.existsSync(logosDir)
    ? fs.readdirSync(logosDir).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4))
    : [],
);

const ctx = {
  site,
  categories,
  playbooks,
  servers,
  logos,
  ratings: ratings.ratings ?? {},
  trending: ratings.trending ?? [],
  built: new Date().toISOString(),
  officialCount: servers.filter((s) => s.official).length,
  remoteCount: servers.filter((s) => s.install?.remote_url).length,
};

const dayMs = 24 * 60 * 60 * 1000;
const builtDate = new Date(ctx.built);
const serverSummary = (s) => ({
  slug: s.slug,
  name: s.name,
  url: `${site.url}/mcps/${s.slug}/`,
  markdown: `${site.url}/mcps/${s.slug}.md`,
  category: s.category,
  official: s.official,
  remote: Boolean(s.install?.remote_url),
  added: s.added,
  verified: s.verified,
  tagline: s.tagline,
});
const serverBySlug = new Map(servers.map((s) => [s.slug, s]));
const playbookSummary = (p) => ({
  id: p.id,
  title: p.title,
  url: `${site.url}/playbooks/#${p.id}`,
  summary: p.summary,
  best_for: p.best_for,
  primary_servers: p.primary_slugs.map((slug) => serverSummary(serverBySlug.get(slug))),
  steps: p.steps.map((step) => ({
    stage: step.stage,
    intent: step.intent,
    servers: step.slugs.map((slug) => serverSummary(serverBySlug.get(slug))),
  })),
  fallback_servers: p.fallback_slugs.map((slug) => serverSummary(serverBySlug.get(slug))),
  constraints: p.constraints,
});
ctx.playbookDoc = {
  $schema: `${site.url}/api/playbooks.schema.json`,
  name: "mcp.film production playbooks",
  description: "Curated MCP stacks for common AI filmmaking workflows.",
  updated: ctx.built,
  count: playbooks.length,
  playbooks: playbooks.map(playbookSummary),
};
const daysSince = (yyyyMmDd) =>
  Math.max(0, Math.floor((builtDate - new Date(`${yyyyMmDd}T00:00:00Z`)) / dayMs));
const categoryCounts = categories.map((c) => {
  const list = servers.filter((s) => s.category === c.id);
  return {
    id: c.id,
    name: c.name,
    stage: c.stage,
    servers: list.length,
    official: list.filter((s) => s.official).length,
    remote: list.filter((s) => s.install?.remote_url).length,
  };
});
const capabilityCounts = new Map();
for (const s of servers) {
  for (const c of s.capabilities ?? []) capabilityCounts.set(c, (capabilityCounts.get(c) ?? 0) + 1);
}
ctx.pulse = {
  $schema: `${site.url}/api/pulse.schema.json`,
  name: "mcp.film catalog pulse",
  generated: ctx.built,
  summary: {
    servers: servers.length,
    official: ctx.officialCount,
    community: servers.length - ctx.officialCount,
    remote: ctx.remoteCount,
    local_or_stdio: servers.length - ctx.remoteCount,
    categories: categories.length,
    newest_added: servers.reduce((m, s) => (s.added > m ? s.added : m), "0000-00-00"),
    oldest_verified: servers.reduce((m, s) => (s.verified < m ? s.verified : m), "9999-99-99"),
  },
  newest: [...servers]
    .sort((a, b) => b.added.localeCompare(a.added) || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map(serverSummary),
  verification_queue: [...servers]
    .sort((a, b) => a.verified.localeCompare(b.verified) || a.name.localeCompare(b.name))
    .slice(0, 18)
    .map((s) => ({ ...serverSummary(s), verification_age_days: daysSince(s.verified) })),
  categories: categoryCounts,
  top_capabilities: [...capabilityCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([capability, servers]) => ({ capability, servers })),
  machine_surfaces: [
    { label: "llms.txt", url: `${site.url}/llms.txt`, kind: "llms-index" },
    { label: "llms-full.txt", url: `${site.url}/llms-full.txt`, kind: "full-markdown" },
    { label: "registry.json", url: `${site.url}/api/registry.json`, kind: "json-registry" },
    { label: "pulse.json", url: `${site.url}/api/pulse.json`, kind: "catalog-pulse" },
    { label: "playbooks.json", url: `${site.url}/api/playbooks.json`, kind: "production-playbooks" },
    { label: "stack.md", url: `${site.url}/stack.md`, kind: "pipeline-guide" },
    { label: "playbooks.md", url: `${site.url}/playbooks.md`, kind: "stack-recipes" },
    { label: "feed.xml", url: `${site.url}/feed.xml`, kind: "new-additions-feed" },
    { label: "server-card", url: `${site.url}/.well-known/mcp/server-card`, kind: "mcp-discovery" },
    { label: "MCP Registry API", url: `${site.url}/v0.1/servers`, kind: "mcp-registry-api" },
  ],
  operations: {
    github_repo: `https://github.com/${site.github_repo}`,
    posthog_dashboard: "https://us.posthog.com/project/292112/dashboard/1772277",
    cloudflare_pages: "mcp-film",
  },
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
write("playbooks/index.html", T.renderPlaybooks(ctx));
write("for-agents/index.html", T.renderForAgents(ctx));
write("pulse/index.html", T.renderPulse(ctx));
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
write("playbooks.md", T.renderPlaybooksMd(ctx));
write("for-agents.md", T.renderForAgentsMd(ctx));
write("pulse.md", T.renderPulseMd(ctx));
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
write("api/pulse.json", JSON.stringify(ctx.pulse, null, 2));
write("api/playbooks.json", JSON.stringify(ctx.playbookDoc, null, 2));
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

// IndexNow key file (deploy workflow pings api.indexnow.org after publishing)
if (site.indexnow_key) write(`${site.indexnow_key}.txt`, site.indexnow_key);

// MCP discovery: the meta-MCP described in the official registry's
// server.json shape, served both at /api/server.json and at the
// SEP-2127 draft server-card location.
const mcpPkg = readJson(path.join(ROOT, "packages/mcp-server/package.json"));
const serverJson = {
  $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  name: "film.mcp/directory",
  title: "mcp.film directory",
  description: "Search the curated directory of MCP servers for AI filmmaking, get install configs for any client, and plan a full production stack.",
  version: mcpPkg.version,
  websiteUrl: site.url,
  repository: { url: `https://github.com/${site.github_repo}`, source: "github", subfolder: "packages/mcp-server" },
  packages: [{
    registryType: "npm",
    registryBaseUrl: "https://registry.npmjs.org",
    identifier: "mcp-film",
    version: mcpPkg.version,
    runtimeHint: "npx",
    transport: { type: "stdio" },
  }],
};
write("api/server.json", JSON.stringify(serverJson, null, 2));
write(".well-known/mcp/server-card", JSON.stringify(serverJson, null, 2));
write(".well-known/mcp/server.json", JSON.stringify(serverJson, null, 2));

// MCP Registry-compatible read-only API. This implements the generic
// subregistry browse shape from the official registry OpenAPI spec while
// preserving mcp.film's richer editorial fields under custom _meta.
const mcpRegistryResponses = servers.map((s) => mcpRegistryResponse(s));
const mcpRegistryList = {
  servers: mcpRegistryResponses,
  metadata: { count: mcpRegistryResponses.length, nextCursor: null },
};
write("api/mcp-registry.json", JSON.stringify(mcpRegistryList, null, 2));
write("v0.1/servers/index.html", JSON.stringify(mcpRegistryList, null, 2));
for (const response of mcpRegistryResponses) {
  const name = response.server.name;
  const version = response.server.version;
  const slug = response.server._meta["film.mcp/directory"].slug;
  const versions = { servers: [response], metadata: { count: 1, nextCursor: null } };
  for (const base of [`v0.1/servers/${name}`, `v0.1/servers/${encodeURIComponent(name)}`]) {
    write(`${base}/versions/index.html`, JSON.stringify(versions, null, 2));
    write(`${base}/versions/latest`, JSON.stringify(response, null, 2));
    write(`${base}/versions/${encodeURIComponent(version)}`, JSON.stringify(response, null, 2));
  }
  write(`api/mcp-registry/${slug}.json`, JSON.stringify(response, null, 2));
}

// hosting glue (GitHub Pages)
write("CNAME", site.domain + "\n");
write(".nojekyll", "");
write("_headers", `# Cloudflare Pages response headers for extensionless machine endpoints.
/v0.1/*
  Content-Type: application/json; charset=utf-8
  Access-Control-Allow-Origin: *

/.well-known/mcp/*
  Content-Type: application/json; charset=utf-8
  Access-Control-Allow-Origin: *
`);

// Cloudflare Pages glue. When deployed to Cloudflare Pages, _worker.js runs in
// advanced mode and records server-side request analytics for agent/API traffic
// that browser JavaScript cannot see. GitHub Pages simply serves it as a file.
const edgeWorker = fs
  .readFileSync(path.join(ROOT, "src/edge-analytics-worker.js"), "utf8")
  .replaceAll("__MCPFILM_POSTHOG_KEY__", site.analytics?.posthog_key ?? "")
  .replaceAll("__MCPFILM_POSTHOG_HOST__", site.analytics?.posthog_host ?? "https://us.i.posthog.com");
write("_worker.js", edgeWorker);

// static assets
write("assets/styles.css", fs.readFileSync(path.join(ROOT, "src/styles.css"), "utf8"));
write("assets/app.js", fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8"));
for (const f of fs.readdirSync(path.join(ROOT, "public"))) {
  fs.copyFileSync(path.join(ROOT, "public", f), path.join(DIST, "assets", f));
}
if (fs.existsSync(logosDir)) {
  fs.mkdirSync(path.join(DIST, "assets/logos"), { recursive: true });
  for (const f of fs.readdirSync(logosDir)) {
    if (f.endsWith(".png")) fs.copyFileSync(path.join(logosDir, f), path.join(DIST, "assets/logos", f));
  }
}

// snapshot of registry for the npx mcp-film fallback data
fs.mkdirSync(path.join(ROOT, "packages/mcp-server"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "packages/mcp-server/registry.snapshot.json"),
  JSON.stringify(registryDoc),
);
fs.writeFileSync(
  path.join(ROOT, "packages/mcp-server/playbooks.snapshot.json"),
  JSON.stringify(ctx.playbookDoc),
);

const pages = servers.length + categories.length + 8;
console.log(`✓ built ${pages} pages + API + agent surfaces → dist/`);

function mcpRegistryResponse(s) {
  const version = `0.0.0+${s.verified.replaceAll("-", "")}`;
  const server = {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: `film.mcp/${s.slug}`,
    title: clamp(s.name, 100),
    description: clamp(s.tagline.replace(/\.$/, ""), 100),
    version,
    websiteUrl: `${site.url}/mcps/${s.slug}/`,
  };
  const repository = repositoryFor(s.links?.repo);
  if (repository) server.repository = repository;
  if (logos.has(s.slug)) {
    server.icons = [{
      src: `${site.url}/assets/logos/${s.slug}.png`,
      mimeType: "image/png",
      sizes: ["128x128"],
    }];
  }
  const packages = packageFor(s);
  if (packages.length) server.packages = packages;
  if (s.install?.remote_url) {
    server.remotes = [{
      type: /\bsse\b/i.test(new URL(s.install.remote_url).pathname) ? "sse" : "streamable-http",
      url: s.install.remote_url,
    }];
  }
  server._meta = {
    "film.mcp/directory": {
      slug: s.slug,
      page: `${site.url}/mcps/${s.slug}/`,
      markdown: `${site.url}/mcps/${s.slug}.md`,
      json: `${site.url}/api/mcps/${s.slug}.json`,
      category: s.category,
      vendor: s.vendor,
      vendorMaintained: s.official,
      featured: Boolean(s.featured),
      pricing: s.pricing,
      capabilities: s.capabilities,
      toolsSample: s.tools_sample,
      install: s.install,
      auth: s.auth,
      links: s.links,
      notes: s.notes,
      added: s.added,
      verified: s.verified,
      verificationAgeDays: daysSince(s.verified),
    },
  };
  return {
    server,
    _meta: {
      "io.modelcontextprotocol.registry/official": {
        status: "active",
        publishedAt: `${s.added}T00:00:00Z`,
        updatedAt: `${s.verified}T00:00:00Z`,
        isLatest: true,
      },
      "film.mcp/subregistry": {
        source: "mcp.film",
        category: s.category,
        official: s.official,
        remote: Boolean(s.install?.remote_url),
      },
    },
  };
}

function repositoryFor(url) {
  if (!url) return null;
  const github = /^https:\/\/github\.com\/[^/]+\/[^/]+/.exec(url);
  if (github) return { url, source: "github" };
  return { url, source: "web" };
}

function packageFor(s) {
  const cmd = s.install?.stdio_command;
  if (!cmd || typeof cmd !== "string") return [];
  const npxPackage = /(?:^|\s)--package=([^\s]+)|^npx\s+(?:-y\s+)?([@a-zA-Z0-9._/-]+)/.exec(cmd);
  if (npxPackage) {
    return [{
      registryType: "npm",
      registryBaseUrl: "https://registry.npmjs.org",
      identifier: cleanupPackageId(npxPackage[1] || npxPackage[2]),
      transport: { type: "stdio" },
      ...(s.auth?.env_var ? { environmentVariables: [secretEnv(s.auth.env_var)] } : {}),
    }];
  }
  const uvxFrom = /^uvx\s+--from\s+([^\s]+)\s+/.exec(cmd);
  const uvxPackage = /^uvx\s+(.+)$/.exec(cmd);
  const pyPackage = uvxFrom?.[1] || uvxPackage?.[1];
  if (pyPackage) {
    return [{
      registryType: "pypi",
      registryBaseUrl: "https://pypi.org",
      identifier: cleanupPackageId(pyPackage.split(/\s+/)[0]),
      transport: { type: "stdio" },
      ...(s.auth?.env_var ? { environmentVariables: [secretEnv(s.auth.env_var)] } : {}),
    }];
  }
  return [];
}

function cleanupPackageId(value) {
  return String(value)
    .replace(/^["']|["']$/g, "")
    .replace(/\[.*\]$/, "")
    .replace(/@latest$/, "");
}

function secretEnv(name) {
  return { name, isRequired: true, isSecret: true, format: "string" };
}

function clamp(value, max) {
  const s = String(value ?? "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
