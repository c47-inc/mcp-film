#!/usr/bin/env node
/**
 * mcp-film — the mcp.film directory as an MCP server.
 *
 * Lets any agent query the curated catalog of MCP servers for AI filmmaking:
 * search by capability, fetch full entries, get copy-paste install configs,
 * and plan a full production stack.
 *
 * Zero dependencies: speaks MCP's stdio transport (newline-delimited
 * JSON-RPC 2.0) directly. Registry data is fetched live from mcp.film with a
 * bundled snapshot as offline fallback. The directory logic itself lives in
 * core.mjs, shared with the hosted endpoint at https://mcp.film/mcp.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { TOOLS, makeCallTool } from "./core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth for the version: package.json
const VERSION = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8")).version;

const SOURCES = {
  registry: ["https://mcp.film/api/registry.min.json", "registry.snapshot.json"],
  playbooks: ["https://mcp.film/api/playbooks.json", "playbooks.snapshot.json"],
  recommendations: ["https://mcp.film/api/recommendations.json", "recommendations.snapshot.json"],
  pulse: ["https://mcp.film/api/pulse.json", "pulse.snapshot.json"],
};

const cache = {};
const loaderFor = (key) => async () => {
  if (cache[key]) return cache[key];
  const [url, snapshot] = SOURCES[key];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      cache[key] = await res.json();
      cache[key]._source = "live";
      return cache[key];
    }
  } catch { /* offline — fall through to snapshot */ }
  cache[key] = JSON.parse(fs.readFileSync(path.join(HERE, snapshot), "utf8"));
  cache[key]._source = "bundled snapshot";
  return cache[key];
};

const callTool = makeCallTool(
  {
    loadRegistry: loaderFor("registry"),
    loadPlaybooks: loaderFor("playbooks"),
    loadRecommendations: loaderFor("recommendations"),
    loadPulse: loaderFor("pulse"),
  },
  VERSION,
);

// ------------------------------------------------- stdio JSON-RPC plumbing
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", async (line) => {
  line = line.trim();
  if (!line) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;

  try {
    if (method === "initialize") {
      const offered = params?.protocolVersion;
      send({
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: typeof offered === "string" ? offered : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mcp-film", title: "mcp.film directory", version: VERSION },
        },
      });
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (method === "tools/call") {
      const result = await callTool(params.name, params.arguments);
      send({
        jsonrpc: "2.0", id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: Boolean(result?.error),
        },
      });
    } else if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
    // notifications (no id) are silently accepted
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(e?.message ?? e) } });
  }
});
