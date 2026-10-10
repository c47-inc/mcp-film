#!/usr/bin/env node
// Edge worker checks that need no Cloudflare bindings. Run after `node build.mjs`.
import assert from "node:assert/strict";
import { TOOLS } from "../packages/mcp-server/core.mjs";
import { markdownTwinPath, prefersMarkdown, mcpGetResponse, SCANNER_PROBE } from "../dist/_worker.js";

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

console.log("✓ edge checks passed");
