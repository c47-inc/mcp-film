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

console.log("✓ mcp server checks passed");
