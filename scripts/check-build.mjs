#!/usr/bin/env node
// Post-build assertions for behaviour that is easy to break silently and impossible to
// see in a diff. Run after `node build.mjs`. Exits non-zero on the first broken contract.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isConnectIntent } from "../src/edge-analytics-worker.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const failures = [];
const check = (name, problem) => {
  if (problem) failures.push(`${name}: ${problem}`);
};

// 1. Search and the quick filters set `card.hidden`, but `.card { display: flex }` in the
//    author sheet outranks the UA sheet's [hidden] rule. Without this declaration the
//    filters compute correctly, report correctly to analytics, and hide nothing on screen.
check(
  "filters can hide cards",
  /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/.test(read("dist/assets/styles.css"))
    ? null
    : "dist/assets/styles.css is missing `[hidden] { display: none !important }`"
);

// 2. A section whose cards all hide must hide too, or the heading and count survive alone.
const orphanSections = [...read("dist/index.html").matchAll(/<section class="[^"]*\bcat-section\b[^"]*"([^>]*)>/g)]
  .filter(([, attrs]) => !attrs.includes("data-cat-section"));
check(
  "every card section is filterable",
  orphanSections.length ? `${orphanSections.length} .cat-section without data-cat-section` : null
);

// 3. mcp.film is a subregistry. Stamping the upstream registry's own provenance key would
//    assert official-registry publication for servers that were never published there.
check(
  "no forged registry provenance",
  read("dist/api/mcp-registry.json").includes("io.modelcontextprotocol.registry/official")
    ? "mcp-registry.json claims io.modelcontextprotocol.registry/official"
    : null
);

// 4. The sponsor relationship must be legible on the surfaces machines actually read,
//    not only in the HTML footer humans never reach.
const registry = JSON.parse(read("dist/api/registry.json"));
check(
  "registry.json discloses the sponsor",
  registry.sponsor?.disclosure && registry.sponsor?.featured_slug ? null : "registry.json has no sponsor disclosure"
);
check(
  "llms.txt discloses the sponsor",
  /^Disclosure:/m.test(read("dist/llms.txt")) ? null : "llms.txt has no disclosure line"
);

// 5. Referral tagging is for every vendor, not just the sponsor. If this regresses, the
//    directory is tagging its own owner's links and nobody else's.
const sample = JSON.parse(read("dist/api/registry.json")).servers.filter((s) => s.links?.site && !s.featured);
const untagged = sample.filter((s) => !read(`dist/mcps/${s.slug}.md`).includes("utm_source=mcp.film"));
check(
  "all vendors get referral tags",
  untagged.length ? `${untagged.length}/${sample.length} vendors have untagged links (e.g. ${untagged[0].slug})` : null
);

// 6. Handoff placements decide where a click lands. Someone arriving from a capability or
//    server page has chosen a tool and needs connect instructions, not a marketing homepage.
for (const p of ["capability:text-to-video", "playbook:commercial-sprint", "server-links:martini:site", "agents-fast-path"]) {
  check(`placement ${p} routes to connect docs`, isConnectIntent(p) ? null : "routed to homepage");
}
for (const p of ["footer", "about-sponsor", "", "llms-txt"]) {
  check(`placement ${p || "(empty)"} routes to homepage`, isConnectIntent(p) ? "routed to connect docs" : null);
}

// 7. Server metadata stays concise and is derived from the listing.
const decode = (text) => text.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
let martiniPairings = 0;
for (const server of registry.servers) {
  const html = read(`dist/mcps/${server.slug}/index.html`);
  const title = decode(html.match(/<title>(.*?)<\/title>/)?.[1] ?? "");
  check(`${server.slug} title`, title && title.length <= 80 ? null : `title has ${title.length} characters`);
  for (const key of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    const match = html.match(new RegExp(`<meta ${key} content="([^"]*)"`));
    if (key === 'name="twitter:description"' && !match) continue;
    const description = decode(match?.[1] ?? "");
    const original = `${server.tagline} ${server.description}`;
    const boundary = original[description.length];
    check(`${server.slug} ${key}`, description.length <= 160 && /[\p{L}\p{N}.)]$/u.test(description)
      && original.startsWith(description) && (!boundary || !/[\p{L}\p{N}]/u.test(boundary))
      ? null : "description is missing, over 160 characters, or ends mid-word");
  }
  const pairs = html.match(/<h2>Pairs well with<\/h2>([\s\S]*?)<\/section>/)?.[1];
  check(`${server.slug} pairings block`, pairs ? null : "missing Pairs well with block");
  if (pairs?.includes('href="/mcps/martini/"')) martiniPairings++;
}
check("featured placement is not a pairing signal", martiniPairings < 40 ? null : `${martiniPairings} pages pair the featured listing`);

const latestVerified = registry.servers.map((s) => s.verified).sort().at(-1);
const verifiedLabel = new Date(`${latestVerified}T00:00:00Z`).toLocaleDateString("en-US", {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
});
const homeVerified = read("dist/index.html").match(/<b>([^<]+)<\/b> last verified/)?.[1];
check("homepage verification date", homeVerified === verifiedLabel ? null : `expected ${verifiedLabel}, got ${homeVerified}`);
const routerHtml = read("dist/router/index.html");
check("router renders one sponsor link at most", (routerHtml.match(/Connect Martini/g) ?? []).length <= 1 ? null : "repeated sponsor link");
const sponsorPrimary = [...routerHtml.matchAll(/<a\b[^>]*>/g)].some(([a]) =>
  /class="[^"]*\bbtn-primary\b/.test(a) && /href="[^"]*martini/i.test(a));
check("router primary action is the top pick", sponsorPrimary ? "sponsor link has btn-primary" : null);
console.log(`Metadata checks: ${registry.servers.length} server pages; last verified ${latestVerified}`);

if (failures.length) {
  console.error("✗ build checks failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ build checks passed");
