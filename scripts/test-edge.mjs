#!/usr/bin/env node
// Edge worker checks that need no Cloudflare bindings. Run after `node build.mjs`.
import assert from "node:assert/strict";
import fs from "node:fs";
import { TOOLS } from "../packages/mcp-server/core.mjs";
import worker, { markdownTwinPath, prefersMarkdown, mcpGetResponse, SCANNER_PROBE, registryApiResponse, canonicalPageFor, sponsorDestinationFor, isConnectIntent, routePropertiesFor, classifyTraffic } from "../dist/_worker.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// Markdown twins: HTML page paths map to <path>.md; machine files and assets do not.
assert.equal(markdownTwinPath("/"), "/index.md");
assert.equal(markdownTwinPath("/mcps/davinci-resolve/"), "/mcps/davinci-resolve.md");
assert.equal(markdownTwinPath("/capabilities/text-to-video"), "/capabilities/text-to-video.md");
for (const p of ["/llms.txt", "/api/registry.json", "/mcps/x.md", "/assets/app.js", "/v0.1/servers"]) {
  assert.equal(markdownTwinPath(p), null, p);
}

// Accept negotiation: markdown wins only when it outranks html, or text/plain stands alone.
assert.equal(prefersMarkdown("text/markdown"), true);
assert.equal(prefersMarkdown("text/markdown, text/html;q=0.9"), true);
assert.equal(prefersMarkdown("text/plain"), true);
assert.equal(prefersMarkdown("text/html, text/markdown;q=0.8"), false);
assert.equal(prefersMarkdown("text/html,application/xhtml+xml,*/*;q=0.8"), false);
assert.equal(prefersMarkdown("text/plain, text/html"), false);
assert.equal(prefersMarkdown("*/*"), false);
assert.equal(prefersMarkdown(null), false);

// GET /mcp: SSE clients get 405 + Allow; everyone else gets the markdown description.
for (const [method, accept] of [["GET", "text/event-stream"], ["PUT", "*/*"]]) {
  const res = mcpGetResponse(method, accept, TOOLS);
  assert.equal(res.status, 405, method);
  assert.equal(res.headers.get("allow"), "POST, OPTIONS");
  assert.deepEqual(await res.json(), { error: "Use POST with JSON-RPC 2.0", docs: "https://mcp.film/for-agents.md" });
}
for (const accept of ["text/html", "*/*", "text/markdown", null]) {
  const res = mcpGetResponse("GET", accept, TOOLS);
  assert.equal(res.status, 200, accept);
  assert.equal(res.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(res.headers.get("x-robots-tag"), "noindex", "the endpoint is not a page to index");
  const body = await res.text();
  for (const t of TOOLS) assert.ok(body.includes(`\`${t.name}\` — ${t.title}`), t.name);
  for (const s of ["claude mcp add --transport http mcp-film https://mcp.film/mcp", "/for-agents.md", "/llms.txt"]) assert.ok(body.includes(s), s);
}

// Every tool carries annotations; only submit_listing is non-idempotent.
for (const t of TOOLS) {
  assert.ok(t.title, `${t.name} title`);
  assert.deepEqual(t.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: t.name !== "submit_listing", openWorldHint: false }, t.name);
}

// Scanner probes are dropped from 404 analytics; real paths are not.
for (const p of ["/.env", "/wp-admin/", "/phpinfo.php", "/_profiler/phpinfo", "/.well-known/traffic-advice", "/backend/.git/config", "/laravel/.env"]) {
  assert.ok(SCANNER_PROBE.test(p), p);
}
for (const p of ["/mcps/missing-server/", "/capabilities/", "/for-agents.md", "/.well-known/mcp/server.json"]) {
  assert.ok(!SCANNER_PROBE.test(p), p);
}

// Direct markdown/text twins carry a canonical Link to their HTML page; nothing is noindexed.
for (const [twin, page] of [
  ["/mcps/davinci-resolve.md", "/mcps/davinci-resolve/"],
  ["/categories/editing-post.md", "/categories/editing-post/"],
  ["/capabilities/text-to-video.md", "/capabilities/text-to-video/"],
  ["/playbooks.md", "/playbooks/"], ["/router.md", "/router/"], ["/stack.md", "/stack/"], ["/clients.md", "/clients/"],
  ["/for-agents.md", "/for-agents/"], ["/recommendations.md", "/recommendations/"], ["/remotes.md", "/remotes/"], ["/pulse.md", "/pulse/"],
  ["/index.md", "/"], ["/llms.txt", "/"], ["/llms-full.txt", "/"],
]) assert.equal(canonicalPageFor(twin), page, twin);
for (const p of ["/", "/mcps/davinci-resolve/", "/api/registry.json", "/assets/app.js", "/feed.xml", "/README.md.bak"]) assert.equal(canonicalPageFor(p), null, p);
const distFile = (pathname) => {
  const file = pathname === "/" ? "/index.html" : pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  try {
    const body = fs.readFileSync(new URL(`../dist${file}`, import.meta.url));
    const type = file.endsWith(".md") ? "text/markdown; charset=utf-8" : file.endsWith(".txt") ? "text/plain; charset=utf-8" : file.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
    return new Response(body, { status: 200, headers: { "content-type": type } });
  } catch {
    return new Response("not found", { status: 404 });
  }
};
const siteEnv = { ASSETS: { fetch: async (req) => distFile(new URL(req.url).pathname) }, POSTHOG_KEY: "", CANONICAL_HOST: "mcp.film" };
const ctx = { waitUntil: () => {} };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => { throw new Error(`network call in test: ${typeof input === "string" ? input : input.url}`); };
try {
  for (const [twin, page] of [["/mcps/martini.md", "/mcps/martini/"], ["/llms.txt", "/"], ["/index.md", "/"], ["/playbooks.md", "/playbooks/"], ["/capabilities/text-to-video.md", "/capabilities/text-to-video/"]]) {
    const res = await worker.fetch(new Request(`https://mcp.film${twin}`, { headers: { accept: "*/*" } }), siteEnv, ctx);
    assert.equal(res.status, 200, twin);
    assert.equal(res.headers.get("link"), `<https://mcp.film${page}>; rel="canonical"`, twin);
    assert.ok(!/noindex/i.test(res.headers.get("x-robots-tag") || ""), twin);
  }
  const html = await worker.fetch(new Request("https://mcp.film/mcps/martini/", { headers: { accept: "text/html" } }), siteEnv, ctx);
  assert.equal(html.status, 200);
  assert.equal(html.headers.get("link"), null, "the HTML page itself carries no Link canonical");
  const negotiated = await worker.fetch(new Request("https://mcp.film/mcps/martini/", { headers: { accept: "text/markdown" } }), siteEnv, ctx);
  assert.equal(negotiated.headers.get("link"), "<https://mcp.film/mcps/martini/>; rel=\"canonical\"", "Accept-negotiated twins keep their canonical");
  const missing = await worker.fetch(new Request("https://mcp.film/mcps/nope.md"), siteEnv, ctx);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("link"), null);
} finally {
  globalThis.fetch = realFetch;
}
console.log("E2: canonical Link on direct markdown twins");

// /go/martini?from=<placement> passes attribution through to the sponsor, merged with the
// configured URL's own query string; the placement is sanitised and capped at 64 chars.
const handoffEnv = { SPONSOR_URL: "https://www.martini.film/?existing=1", SPONSOR_CONNECT_URL: "https://www.martini.film/docs/mcp?lang=en" };
const handoff = (from, ua = "Mozilla/5.0") => sponsorDestinationFor(new Request(`https://mcp.film/go/martini?from=${encodeURIComponent(from)}`, { headers: { "user-agent": ua } }), handoffEnv);
const home = handoff("home-featured");
assert.equal(home.origin + home.pathname, "https://www.martini.film/");
assert.equal(home.searchParams.get("existing"), "1", "the configured query string survives");
assert.equal(home.searchParams.get("ref"), "mcp-film");
assert.equal(home.searchParams.get("utm_source"), "mcp.film");
assert.equal(home.searchParams.get("utm_medium"), "referral");
assert.equal(home.searchParams.get("utm_content"), "home-featured");
const connect = handoff("recommendation:character-series");
assert.equal(connect.pathname, "/docs/mcp");
assert.equal(connect.searchParams.get("lang"), "en");
assert.equal(connect.searchParams.get("ref"), "mcp-film");
assert.equal(connect.searchParams.get("utm_content"), "recommendation:character-series");
const dirty = handoff(`Weird Place/${"x".repeat(100)}?<script>`);
assert.match(dirty.searchParams.get("utm_content"), /^[a-z0-9:_-]{1,64}$/);
assert.equal(handoff("").searchParams.get("utm_content"), null);
assert.equal(handoff("").searchParams.get("ref"), "mcp-film");
const redirect = await worker.fetch(new Request("https://mcp.film/go/martini?from=playbook:commercial-sprint"), { ...siteEnv, ...handoffEnv }, ctx);
assert.equal(redirect.status, 302);
const location = new URL(redirect.headers.get("location"));
assert.equal(location.searchParams.get("ref"), "mcp-film");
assert.equal(location.searchParams.get("utm_content"), "playbook:commercial-sprint");
console.log(`E3: ${location}`);

// The /martini/connect runbook: its placements are connect intent (signup goes home), its
// markdown twin is an agent surface in the martini route group with a canonical Link.
for (const p of ["martini-connect:cli", "martini-connect:mcp", "martini-connect:claude-code"]) assert.ok(isConnectIntent(p), p);
assert.ok(!isConnectIntent("martini-connect:signup"), "signup is account creation, not connect docs");
assert.ok(!isConnectIntent("martini-connect"), "bare prefix is not connect intent");
assert.equal(handoff("martini-connect:cli").pathname, "/docs/mcp");
assert.equal(handoff("martini-connect:signup").pathname, "/");
assert.equal(handoff("martini-connect:signup").searchParams.get("ref"), "mcp-film");
assert.deepEqual(routePropertiesFor("/martini/connect.md"), { surface: "martini-runbook", group: "martini", slug: "martini", category: null, capability: null });
assert.equal(routePropertiesFor("/martini/connect/").group, "martini");
assert.equal(routePropertiesFor("/martini/connect/").surface, "martini-runbook-page");
assert.equal(classifyTraffic("/martini/connect.md", "Mozilla/5.0", new Headers()).kind, "agent");
assert.equal(markdownTwinPath("/martini/connect/"), "/martini/connect.md");
assert.equal(canonicalPageFor("/martini/connect.md"), "/martini/connect/");
const runbookMd = await worker.fetch(new Request("https://mcp.film/martini/connect.md"), siteEnv, ctx);
assert.equal(runbookMd.status, 200);
assert.equal(runbookMd.headers.get("link"), "<https://mcp.film/martini/connect/>; rel=\"canonical\"");
console.log("E4: martini-connect placements and runbook surface");

// /changes/: page, markdown twin and feed are their own surfaces; the twin is an agent
// surface with a canonical. README badges are static assets the worker passes through.
assert.equal(routePropertiesFor("/changes/").surface, "changes-page");
assert.equal(routePropertiesFor("/changes.md").surface, "changes-markdown");
assert.equal(routePropertiesFor("/changes.xml").surface, "changes-feed");
assert.equal(classifyTraffic("/changes.md", "Mozilla/5.0", new Headers()).kind, "agent");
assert.equal(markdownTwinPath("/changes/"), "/changes.md");
assert.equal(canonicalPageFor("/changes.md"), "/changes/");
assert.equal(markdownTwinPath("/badge/runway.svg"), null);
assert.equal(canonicalPageFor("/badge/runway.svg"), null);
console.log("E5: changes surfaces and badge pass-through");

// /v0.1/servers?search= filters by name/description substring, case-insensitively, before paging.
const builtRegistry = JSON.parse(read("dist/api/mcp-registry.json"));
const registryEnv = { ASSETS: { fetch: async () => Response.json(builtRegistry) } };
const registryPage = (params) => registryApiResponse(new Request(`https://mcp.film/v0.1/servers?${new URLSearchParams(params)}`), registryEnv);
const martiniHits = await (await registryPage({ search: "MARTINI" })).json();
assert.ok(martiniHits.servers.length >= 1);
assert.ok(martiniHits.servers.every((s) => /martini/i.test(`${s.server.name} ${s.server.description}`)));
assert.ok(martiniHits.servers.some((s) => s.server.name === "film.mcp/martini"));
const lipHits = await (await registryPage({ search: "lip-sync", limit: "2" })).json();
assert.ok(lipHits.servers.length <= 2 && lipHits.servers.every((s) => /lip-sync/i.test(`${s.server.name} ${s.server.description}`)));
const none = await (await registryPage({ search: "zzqxzzqx" })).json();
assert.deepEqual(none, { servers: [], metadata: { count: 0, nextCursor: null } });
assert.equal((await (await registryPage({ search: "" })).json()).metadata.count, 30, "empty search is no filter");
console.log(`E1: ${JSON.stringify({ martini: martiniHits.servers.length, lip_sync: lipHits.servers.length })}`);

console.log("✓ edge checks passed");
