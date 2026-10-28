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
  // The description is the tagline followed by " · " facts (Official/Community, hosted/local,
  // auth, verified date). It must open with the tagline, or a word-boundary prefix of it.
  for (const key of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    const match = html.match(new RegExp(`<meta ${key} content="([^"]*)"`));
    const description = decode(match?.[1] ?? "");
    const tagline = server.tagline.trim();
    const head = description.split(" · ")[0];
    const boundary = tagline[head.length];
    check(`${server.slug} ${key}`, description.length <= 155 && /[\p{L}\p{N}.)]$/u.test(description)
      && tagline.startsWith(head) && (!boundary || !/[\p{L}\p{N}]/u.test(boundary))
      ? null : `description is missing, over 155 characters, ends mid-word, or does not open with the tagline (${JSON.stringify(description)})`);
  }
  const pairs = html.match(/<h2 id="pairs">Pairs well with<\/h2>([\s\S]*?)<\/section>/)?.[1];
  check(`${server.slug} pairings block`, pairs ? null : "missing Pairs well with block");
  if (pairs?.includes('href="/mcps/martini/"')) martiniPairings++;
  // Connect is per client: a reader lands on "Connect X to Cursor", not a wall of snippets.
  check(`${server.slug} connect headings`, /<h3 id="connect-claude-code">/.test(html) ? null : "missing per-client connect heading");
  // A dead listing never claims to be freshly checked and never pairs with anything live.
  if (server.status) {
    check(`${server.slug} status notice`, html.includes('class="status-notice') ? null : "missing status notice");
    check(`${server.slug} not freshly checked`, html.includes("verify-fresh") ? "dead listing shows Freshly checked" : null);
  }
  check(`${server.slug} no installer snippet`, /davinci-resolve-mcp setup<\/code>/.test(html) && !/connect-local/.test(html) ? "installer wizard rendered as a connect command" : null);
}
check("featured placement is not a pairing signal", martiniPairings < 40 ? null : `${martiniPairings} pages pair the featured listing`);

// 8. Dead, archived and deprecated servers stay out of every list an agent acts on, and their
//    status survives every projection build.mjs makes.
const inactive = registry.servers.filter((s) => s.status);
const playbooksDoc = JSON.parse(read("dist/api/playbooks.json"));
const recommendationsDoc = JSON.parse(read("dist/api/recommendations.json"));
const remotesDoc = JSON.parse(read("dist/api/remotes.json"));
const clientProfiles = JSON.parse(read("dist/api/client-profiles.json"));
const mcpRegistry = JSON.parse(read("dist/api/mcp-registry.json"));
for (const s of inactive) {
  const listed = [
    ...playbooksDoc.playbooks.flatMap((p) => [...p.primary_servers, ...p.fallback_servers, ...p.steps.flatMap((st) => st.servers)]),
    ...recommendationsDoc.recommendations.flatMap((r) => [...r.primary.map((p) => p.server), ...r.fallback_servers]),
    ...remotesDoc.remotes,
    ...clientProfiles.starter_examples,
  ].filter((x) => x.slug === s.slug);
  check(`${s.slug} excluded from action lists`, listed.length ? `${s.status} listing appears in ${listed.length} agent list(s)` : null);
  const sub = mcpRegistry.servers.find((r) => r.server._meta["film.mcp/directory"].slug === s.slug);
  check(`${s.slug} subregistry status`, sub && sub._meta["film.mcp/subregistry"].status !== "active" && sub._meta["film.mcp/subregistry"].directoryStatus === s.status
    ? null : "subregistry output still says active");
  check(`${s.slug} markdown twin marks status`, read(`dist/mcps/${s.slug}.md`).includes(`**Status:** ${s.status}`) ? null : "status missing from .md");
}
const summaryStatuses = playbooksDoc.playbooks.flatMap((p) => p.primary_servers).every((x) => typeof x.status === "string");
check("server summaries carry status", summaryStatuses ? null : "playbook server summaries lack status");
check("remotes carry status", remotesDoc.remotes.every((r) => typeof r.status === "string") ? null : "remote summaries lack status");
check("mcp-registry never exports the installer wizard", /davinci-resolve-mcp"/.test(read("dist/api/mcp-registry.json")) && read("dist/api/mcp-registry.json").includes('"identifier": "davinci-resolve-mcp"') ? "davinci-resolve-mcp exported as a runnable package" : null);

// 8b. Evidence levels are derived for every listing, and probe facts reach the surfaces that
//     show them. A probe result never rewrites a status (that is checked in data, not here).
const EVIDENCE = new Set(["endpoint_answered", "package_resolves", "docs_checked"]);
check("every server has an evidence level", registry.servers.every((s) => EVIDENCE.has(s.evidence) && "last_probe" in s && "package_check" in s) ? null : "registry.json server without evidence/last_probe/package_check");
check("evidence levels are defined", registry.evidence_levels?.map((l) => l.id).join() === [...EVIDENCE].join() ? null : "registry.json evidence_levels missing or out of order");
if (fs.existsSync(path.join(ROOT, "data/health.json"))) {
  check("remotes headline", /class="probe-headline"/.test(read("dist/remotes/index.html")) ? null : "/remotes/ lacks the endpoint-check headline");
  const probedServer = registry.servers.find((s) => s.last_probe);
  check("server page endpoint check", probedServer && read(`dist/mcps/${probedServer.slug}/index.html`).includes("Endpoint check,") ? null : "server page lacks the endpoint-check line");
  check("pulse agenda carries failing checks", JSON.parse(read("dist/api/pulse.json")).curator_agenda.some((a) => a.id === "recheck-failing-checks") ? null : "pulse.json has no recheck-failing-checks agenda item");
}

// 9. Sitemap lists HTML pages only; the 404 is unindexed and claims no canonical.
const sitemap = read("dist/sitemap.xml");
check("sitemap is HTML only", /<loc>[^<]*\.(md|json|txt)<\/loc>/.test(sitemap) ? "sitemap lists a machine twin" : null);
check("sitemap lists playbook pages", sitemap.includes("/playbooks/commercial-sprint/</loc>") ? null : "missing /playbooks/{id}/");
const notFound = read("dist/404.html");
check("404 is noindex", /<meta name="robots" content="noindex,follow/.test(notFound) ? null : "404 lacks noindex");
check("404 has no canonical", notFound.includes('rel="canonical"') ? "404 claims a canonical" : null);
for (const p of playbooksDoc.playbooks) check(`playbook page ${p.id}`, fs.existsSync(path.join(ROOT, `dist/playbooks/${p.id}/index.html`)) && fs.existsSync(path.join(ROOT, `dist/playbooks/${p.id}.md`)) ? null : "missing page or twin");
for (const r of recommendationsDoc.recommendations) check(`recommendation page ${r.id}`, fs.existsSync(path.join(ROOT, `dist/recommendations/${r.id}/index.html`)) ? null : "missing page");
for (const c of registry.categories) check(`category twin ${c.id}`, fs.existsSync(path.join(ROOT, `dist/categories/${c.id}.md`)) ? null : "missing .md twin");

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

// Header search is rendered once on every page and hidden on home, which has #search.
function checkHeaderSearch(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    // The registry API stores JSON as index.html for static-host routing.
    if (file === "dist/v0.1") continue;
    if (entry.isDirectory()) checkHeaderSearch(file);
    else if (entry.name.endsWith(".html")) {
      const forms = read(file).match(/<form\b[^>]*class="head-search"[^>]*>/g) ?? [];
      check(`${file} header search`, forms.length === 1 ? null : `expected one form, got ${forms.length}`);
      check(`${file} search destination`, forms[0]?.includes('action="/#directory"') && forms[0]?.includes('method="get"')
        ? null : "search must GET /?q=…#directory");
    }
  }
}
checkHeaderSearch("dist");
const app = read("dist/assets/app.js");
for (const marker of ["mcpfilm_search_submit", "no_match: true"]) {
  check(`client analytics ${marker}`, app.includes(marker) ? null : "missing from dist/assets/app.js");
}

if (failures.length) {
  console.error("✗ build checks failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("✓ build checks passed");
