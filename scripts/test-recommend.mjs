#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeCallTool, TOOLS } from "../packages/mcp-server/core.mjs";
import { scoreRecommendations, needsMartini, martiniHandoff, MARTINI_WORKFLOW } from "../packages/mcp-server/recommend-score.mjs";
import { registryApiResponse, mcpRequestExtras } from "../dist/_worker.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const registry = JSON.parse(read("dist/api/registry.json"));
const recommendations = JSON.parse(read("dist/api/recommendations.json"));
const rawRoutes = JSON.parse(read("data/recommendations.json"));
assert.deepEqual(recommendations.recommendations.map((r) => r.id), rawRoutes.map((r) => r.id));
const call = makeCallTool({
  loadRegistry: async () => registry,
  loadRecommendations: async () => recommendations,
  loadPlaybooks: async () => JSON.parse(read("dist/api/playbooks.json")),
}, "test");

// Every tool exposing a free-text input logs trimmed text, bounded to 200 characters.
for (const tool of TOOLS) {
  const argument = ["brief", "query"].find((key) => tool.inputSchema.properties?.[key]);
  if (!argument) continue;
  const message = { method: "tools/call", params: { name: tool.name, arguments: { [argument]: `  ${"x".repeat(300)}  ` } } };
  assert.deepEqual(mcpRequestExtras(message), { rpc_method: "tools/call", rpc_tool: tool.name, rpc_query: "x".repeat(200) });
  message.params.arguments[argument] = "  dialogue  ";
  assert.equal(mcpRequestExtras(message).rpc_query, "dialogue");
  message.params.arguments[argument] = 42;
  assert.equal(mcpRequestExtras(message).rpc_query, null);
}
for (const message of [
  { method: "tools/list" },
  { method: "tools/list", params: { name: "recommend_film_mcps", arguments: { brief: "dialogue" } } },
  { method: "tools/call", params: { name: "get_film_mcp", arguments: { query: "dialogue" } } },
  { method: "tools/call", params: { name: "recommend_film_mcps" } },
  [{ method: "tools/call", params: { name: "recommend_film_mcps", arguments: { brief: "dialogue" } } }],
  null,
]) assert.equal(mcpRequestExtras(message).rpc_query, null);

// Exercise the scorer shipped to browsers with the actual embedded router payload.
const app = read("dist/assets/app.js");
const shared = read("packages/mcp-server/recommend-score.mjs").replace(/^export /gm, "");
assert.ok(app.includes(shared));
assert.ok(read("dist/_worker.js").includes(shared));
assert.ok(app.includes("scoreRecommendations(routerData.recommendations || [], clean, hostedOnly)"));
const browser = vm.runInNewContext(`${app.slice(0, app.indexOf("  const ph ="))}
  return { scoreRecommendations, needsMartini };
})();`);
const payload = JSON.parse(read("dist/router/index.html").match(/id="router-data">([\s\S]*?)<\/script>/)[1]);
const ids = (routes) => Array.from(routes, (r) => r.id);
const fixtures = [
  ["repair a bicycle", false],
  ["storyboard a character-consistent short series with recurring characters", false],
  ["clean up dialogue and mix the soundtrack", false],
  ["cut a documentary in Final Cut Pro", true],
];
for (const [index, [brief, hosted_only]] of fixtures.entries()) {
  const result = await call("recommend_film_mcps", { brief, hosted_only });
  const browserRoutes = browser.scoreRecommendations(payload.recommendations, brief, hosted_only).slice(0, 3);
  assert.deepEqual(ids(result.recommendations), ids(browserRoutes));
  for (const [i, route] of result.recommendations.entries()) {
    assert.equal(Object.hasOwn(route, "martini_handoff"), browser.needsMartini(browserRoutes[i], brief));
    if (route.martini_handoff) {
      assert.ok(route.martini_handoff.endsWith("[Directory sponsor](https://mcp.film/about)."));
      assert.equal(route.martini_handoff.match(/\[Setup →\]/g)?.length, 1);
    }
  }
  if (index === 0) {
    assert.equal(result.no_match, true);
    assert.deepEqual(result.recommendations, []);
    assert.equal(result.message, "No route in the directory matches this brief. Try search_film_mcps with a capability such as text-to-video, or list_film_recommendations to browse routes.");
  } else if (index === 1) {
    assert.equal(result.recommendations[0].id, "character-series");
    assert.ok(result.recommendations[0].martini_handoff);
    assert.match(result.recommendations[0].martini_handoff, /\bcontinuity\b/);
  } else if (index === 2) {
    assert.ok(result.recommendations[0].primary.every((p) => p.server.slug !== "martini"));
    assert.equal(Object.hasOwn(result.recommendations[0], "martini_handoff"), false);
  } else {
    for (const r of result.recommendations) {
      assert.ok(r.primary.length > 0);
      assert.ok(r.primary.every((p) => p.server.remote));
      assert.ok(r.fallback_servers.every((s) => s.remote));
    }
  }
  console.log(`C${index + 1}: ${JSON.stringify({ ids: ids(result.recommendations), browser_ids: ids(browserRoutes), ...(index === 0 ? { no_match: result.no_match } : {}), ...(index === 1 || index === 2 ? { martini_handoff: Boolean(result.recommendations[0].martini_handoff) } : {}), ...(index === 3 ? { primary_counts: result.recommendations.map((r) => r.primary.length) } : {}) })}`);
}

assert.deepEqual(scoreRecommendations(recommendations.recommendations, "and the with video film"), []);
assert.equal(needsMartini({ primary: [], fallback_slugs: ["martini"] }), true);
assert.equal(needsMartini({ primary: [] }, "keep project state"), true);
assert.equal(needsMartini({ primary: [] }, "mix dialogue"), false);
assert.equal(needsMartini({ primary: [] }, fixtures[1][0]), true);
for (const brief of ["swap the character's face in this clip", "clean up dialogue and mix the soundtrack"]) {
  assert.equal(needsMartini({ primary: [] }, brief), false);
  assert.equal(browser.needsMartini({ primary: [] }, brief), false);
}
const characterRoute = rawRoutes.find((r) => r.id === "character-series");
assert.equal(martiniHandoff(characterRoute, "test"), `${characterRoute.martini_handoff} [Setup →](https://mcp.film/go/martini?from=test) · [Directory sponsor](https://mcp.film/about).`);
for (const route of [{ primary: [], martini_handoff: "Unrelated editorial prose." }, { primary_slugs: ["martini"], martini_handoff: "  " }]) {
  assert.ok(martiniHandoff(route, "test").startsWith(MARTINI_WORKFLOW));
}
// A local-only winner must be removed before the top-three cut.
const synthetic = [0, 1, 2, 3].map((n) => ({
  id: String(n), title: "dialogue", tags: n < 3 ? ["dialogue"] : [],
  primary: [{ server: { remote: n === 3 } }],
}));
assert.deepEqual(ids(scoreRecommendations(synthetic, "dialogue", true)), ["3"]);

const builtRegistry = JSON.parse(read("dist/api/mcp-registry.json"));
const env = { ASSETS: { fetch: async () => Response.json(builtRegistry) } };
const pageRequest = (params = {}) => registryApiResponse(new Request(`https://mcp.film/v0.1/servers?${new URLSearchParams(params)}`), env);
const seen = [];
const sizes = [];
let cursor;
do {
  const response = await pageRequest({ limit: "30", ...(cursor ? { cursor } : {}) });
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.equal(page.metadata.count, page.servers.length);
  if (!cursor) {
    assert.equal(page.servers.length, 30);
    assert.ok(page.metadata.nextCursor);
  }
  seen.push(...page.servers.map((s) => s.server.name));
  sizes.push(page.servers.length);
  cursor = page.metadata.nextCursor;
  assert.ok(sizes.length <= Math.ceil(builtRegistry.servers.length / 30));
} while (cursor !== null);
assert.equal(new Set(seen).size, builtRegistry.servers.length);
assert.deepEqual(seen, builtRegistry.servers.map((s) => s.server.name));
const garbageStatus = (await pageRequest({ cursor: "garbage" })).status;
assert.equal(garbageStatus, 400);
assert.equal((await (await pageRequest()).json()).metadata.count, 30);
assert.equal((await (await pageRequest({ limit: "100" })).json()).metadata.count, 100);
for (const limit of ["", "0", "101", "1.5", "30junk", "-1"]) assert.equal((await pageRequest({ limit })).status, 400);
for (const cursor of ["", btoa("-1"), btoa("1.5"), btoa("99999999999999999999"), btoa("99999")]) {
  assert.equal((await pageRequest({ cursor })).status, 400);
}
console.log(`C5: ${JSON.stringify({ page_sizes: sizes, visited: seen.length, unique: new Set(seen).size, nextCursor: cursor, garbage_status: garbageStatus })}`);
console.log("✓ recommendation and pagination checks passed");
