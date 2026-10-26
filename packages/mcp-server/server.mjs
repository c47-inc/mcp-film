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
import { TOOLS, makeCallTool, initializeResult, toolResult } from "./core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth for the version: package.json
const VERSION = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8")).version;

// MCP_FILM_API_BASE points the live fetch elsewhere (a staging build, a test fixture server).
const API_BASE = (process.env.MCP_FILM_API_BASE || "https://mcp.film").replace(/\/+$/, "");
const SOURCES = {
  registry: [`${API_BASE}/api/registry.min.json`, "registry.snapshot.json"],
  playbooks: [`${API_BASE}/api/playbooks.json`, "playbooks.snapshot.json"],
  recommendations: [`${API_BASE}/api/recommendations.json`, "recommendations.snapshot.json"],
  pulse: [`${API_BASE}/api/pulse.json`, "pulse.snapshot.json"],
};

// MCP_FILM_OFFLINE=1 skips the live fetch (tests, air-gapped runs) and serves the bundled snapshots.
const OFFLINE = /^(1|true|yes)$/i.test(process.env.MCP_FILM_OFFLINE ?? "");

// A long-lived server process must not pin the catalogue it saw at first call.
// Live data is good for an hour (MCP_FILM_CACHE_TTL_MS to change), then the
// stale copy is served once more while a background fetch replaces it. A
// snapshot fallback is retried sooner, since it only means the network failed.
const TTL_MS = Number(process.env.MCP_FILM_CACHE_TTL_MS) > 0 ? Number(process.env.MCP_FILM_CACHE_TTL_MS) : 60 * 60 * 1000;
const SNAPSHOT_RETRY_MS = Math.min(TTL_MS, 5 * 60 * 1000);

const cache = {};

async function fetchLive(key) {
  if (OFFLINE) return null;
  const [url] = SOURCES[key];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    data._source = "live";
    data._observed_at = new Date().toISOString();
    return data;
  } catch {
    return null; // offline — the caller falls back to the snapshot
  }
}

function readSnapshot(key) {
  const [, snapshot] = SOURCES[key];
  const data = JSON.parse(fs.readFileSync(path.join(HERE, snapshot), "utf8"));
  data._source = "bundled snapshot";
  data._observed_at = new Date().toISOString();
  return data;
}

const loaderFor = (key) => async () => {
  const now = Date.now();
  const entry = cache[key];
  if (entry && now < entry.expires) return entry.data;
  if (entry) {
    // Stale: answer from the copy we have and refresh behind the request.
    if (!entry.refreshing) {
      entry.refreshing = fetchLive(key)
        .then((live) => { if (live) cache[key] = { data: live, expires: Date.now() + TTL_MS, refreshing: null }; })
        .catch(() => {})
        .finally(() => { if (cache[key] === entry) entry.refreshing = null; });
    }
    return entry.data;
  }
  const live = await fetchLive(key);
  cache[key] = live
    ? { data: live, expires: now + TTL_MS, refreshing: null }
    : { data: readSnapshot(key), expires: now + SNAPSHOT_RETRY_MS, refreshing: null };
  return cache[key].data;
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
      send({ jsonrpc: "2.0", id, result: initializeResult(params?.protocolVersion, VERSION) });
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (method === "tools/call") {
      send({ jsonrpc: "2.0", id, result: toolResult(await callTool(params.name, params.arguments)) });
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
