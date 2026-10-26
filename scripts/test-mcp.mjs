#!/usr/bin/env node
// Meta-MCP server checks: protocol negotiation, response shapes, search quality,
// status filtering, install validation and the Martini runbook. Run after `node build.mjs`.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { makeCallTool, TOOLS, PROTOCOL_VERSIONS, negotiateProtocolVersion, initializeResult, SERVER_INSTRUCTIONS } from "../packages/mcp-server/core.mjs";
import { mcpHandleMessage } from "../dist/_worker.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const json = (file) => JSON.parse(read(file));
const registry = json("dist/api/registry.json");
const loaders = {
  loadRegistry: async () => registry,
  loadRecommendations: async () => json("dist/api/recommendations.json"),
  loadPlaybooks: async () => json("dist/api/playbooks.json"),
  loadPulse: async () => json("dist/api/pulse.json"),
};
const call = makeCallTool(loaders, "test");

// ---- 1. Protocol negotiation: a supported version is echoed, anything else gets the latest.
assert.deepEqual(PROTOCOL_VERSIONS, ["2025-11-25", "2025-06-18", "2025-03-26"]);
for (const v of PROTOCOL_VERSIONS) assert.equal(negotiateProtocolVersion(v), v);
for (const v of ["2024-11-05", "9999-01-01", "", undefined, null, 42]) assert.equal(negotiateProtocolVersion(v), "2025-11-25", String(v));
const init = initializeResult("2025-06-18", "1.2.3");
assert.equal(init.protocolVersion, "2025-06-18");
assert.equal(init.serverInfo.version, "1.2.3");
assert.equal(init.instructions, SERVER_INSTRUCTIONS);
assert.ok(SERVER_INSTRUCTIONS.length < 600, `instructions ${SERVER_INSTRUCTIONS.length} chars`);
for (const s of ["recommend_film_mcps", "search_film_mcps", "get_install_config", "list_client_profiles", "get_martini_setup"]) {
  assert.ok(SERVER_INSTRUCTIONS.includes(s), s);
}

// Edge worker: same result through the JSON-RPC handler.
const edgeInit = await mcpHandleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }, call);
assert.equal(edgeInit.result.protocolVersion, "2025-11-25");
assert.equal(edgeInit.result.instructions, SERVER_INSTRUCTIONS);
assert.equal((await mcpHandleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-03-26" } }, call)).result.protocolVersion, "2025-03-26");

// Stdio server: spawn it offline and drive one initialize + tools/list.
async function stdio(messages) {
  const child = spawn(process.execPath, [new URL("../packages/mcp-server/server.mjs", import.meta.url).pathname], {
    env: { ...process.env, MCP_FILM_OFFLINE: "1" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  let out = "";
  const wanted = messages.filter((m) => m.id !== undefined).length;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stdio server timed out")), 15000);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.split("\n").filter(Boolean).length >= wanted) { clearTimeout(timer); resolve(); }
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
  });
  child.kill();
  return out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const [stdioInit, stdioList] = await stdio([
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2030-01-01" } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
]);
assert.equal(stdioInit.result.protocolVersion, "2025-11-25");
assert.equal(stdioInit.result.instructions, SERVER_INSTRUCTIONS);
assert.deepEqual(stdioList.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
console.log(`M1: ${JSON.stringify({ negotiated: stdioInit.result.protocolVersion, instructions_chars: SERVER_INSTRUCTIONS.length })}`);

// ---- 2. Token diet: compact JSON text + structuredContent, paged lists, lean picks.
const size = (x) => JSON.stringify(x).length;
const sizes = {};
for (const [tool, args] of [
  ["search_film_mcps", {}],
  ["list_film_capabilities", {}],
  ["recommend_film_mcps", { brief: "avatar UGC ad with voiceover" }],
  ["get_film_capability", { capability: "text-to-video" }],
]) sizes[`${tool}${Object.keys(args).length ? ":" + Object.values(args)[0] : ""}`] = size(await call(tool, args));
assert.ok(sizes.search_film_mcps < 20000, `no-arg search_film_mcps is ${sizes.search_film_mcps} chars`);
assert.ok(sizes.list_film_capabilities < 12000, `list_film_capabilities is ${sizes.list_film_capabilities} chars`);
assert.ok(sizes["recommend_film_mcps:avatar UGC ad with voiceover"] < 8000, "recommend_film_mcps");

const firstPage = await call("search_film_mcps", {});
assert.equal(firstPage.count, 20);
assert.equal(firstPage.total, registry.servers.length);
assert.equal(firstPage.offset, 0);
assert.equal(firstPage.next_offset, 20);
assert.equal(Object.hasOwn(firstPage.servers[0], "markdown_url"), false);
assert.ok(firstPage.servers[0].url.startsWith("https://mcp.film/mcps/"));
const secondPage = await call("search_film_mcps", { offset: firstPage.next_offset, limit: 5 });
assert.equal(secondPage.count, 5);
assert.equal(secondPage.servers[0].slug, (await call("search_film_mcps", { limit: 25 })).servers[20].slug);
const lastPage = await call("search_film_mcps", { offset: registry.servers.length - 3, limit: 100 });
assert.equal(lastPage.count, 3);
assert.equal(lastPage.next_offset, null);
assert.equal((await call("search_film_mcps", { limit: 0 })).count, 20, "non-positive limit falls back to the default");
assert.equal((await call("search_film_mcps", { limit: 9999 })).count, 100);

const caps = await call("list_film_capabilities", {});
assert.equal(caps.min_count, 2);
assert.ok(caps.capabilities.every((c) => c.count >= 2 && c.url && !("markdown" in c) && !("json" in c)));
assert.ok(caps.total > caps.count || caps.next_offset === null);
const capOne = await call("list_film_capabilities", { min_count: 1, limit: 1 });
assert.equal(capOne.count, 1);
assert.equal(capOne.next_offset, 1);
assert.ok(capOne.total > caps.total);
const t2v = await call("get_film_capability", { capability: "text-to-video", limit: 3 });
assert.equal(t2v.servers.length, 3);
assert.ok(t2v.total >= 3 && t2v.next_offset === 3);

const rpc = await mcpHandleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_film_mcps", arguments: { limit: 2 } } }, call);
assert.equal(rpc.result.content[0].text, JSON.stringify(rpc.result.structuredContent));
assert.ok(!rpc.result.content[0].text.includes("\n  "), "compact JSON, not pretty-printed");
assert.equal(rpc.result.structuredContent.count, 2);
assert.equal(rpc.result.isError, false);
const rpcErr = await mcpHandleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_film_mcp", arguments: { slug: "nope" } } }, call);
assert.equal(rpcErr.result.isError, true);
assert.ok(rpcErr.result.structuredContent.error);
const [stdioCall] = await stdio([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_client_profiles", arguments: {} } }]);
assert.deepEqual(JSON.parse(stdioCall.result.content[0].text), stdioCall.result.structuredContent);
assert.ok(stdioCall.result.structuredContent.clients.length >= 4);
console.log(`M2: ${JSON.stringify(sizes)}`);

console.log("✓ mcp server checks passed");
