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
 * bundled snapshot as offline fallback.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const VERSION = "1.0.0";
const REGISTRY_URL = "https://mcp.film/api/registry.min.json";
const SNAPSHOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "registry.snapshot.json");

let registry = null;
async function loadRegistry() {
  if (registry) return registry;
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      registry = await res.json();
      registry._source = "live";
      return registry;
    }
  } catch { /* offline — fall through to snapshot */ }
  registry = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  registry._source = "bundled snapshot";
  return registry;
}

const compact = (s) => ({
  slug: s.slug,
  name: s.name,
  vendor: s.vendor,
  official: s.official,
  category: s.category,
  tagline: s.tagline,
  pricing: s.pricing,
  remote: Boolean(s.install?.remote_url),
  capabilities: s.capabilities,
});

const cmdLike = (cmd) =>
  typeof cmd === "string" && !cmd.includes("(") && !/\bafter\b|\bclone\b|\bthen\b/i.test(cmd);

function installConfig(s, client) {
  const out = { slug: s.slug, client };
  if (client === "claude_code") {
    if (s.install?.claude_code && cmdLike(s.install.claude_code)) out.command = s.install.claude_code;
    else if (s.install?.remote_url) out.command = `claude mcp add --transport http ${s.slug} ${s.install.remote_url}`;
    else if (cmdLike(s.install?.stdio_command)) out.command = `claude mcp add ${s.slug} -- ${s.install.stdio_command}`;
  } else if (s.install?.remote_url) {
    out.config =
      client === "cursor"
        ? { mcpServers: { [s.slug]: { url: s.install.remote_url } } }
        : { mcpServers: { [s.slug]: { command: "npx", args: ["-y", "mcp-remote", s.install.remote_url] } } };
  } else if (cmdLike(s.install?.stdio_command) && !/["']/.test(s.install.stdio_command)) {
    const parts = s.install.stdio_command.split(/\s+/);
    const conf = { command: parts[0], args: parts.slice(1) };
    if (s.auth?.env_var) conf.env = { [s.auth.env_var]: "YOUR_KEY_HERE" };
    out.config = { mcpServers: { [s.slug]: conf } };
  }
  if (!out.command && !out.config) {
    out.note = `No mechanical install available — follow the vendor instructions: ${s.install?.docs_url ?? s.links?.docs ?? s.links?.site ?? "see mcp.film/mcps/" + s.slug}`;
  }
  if (s.auth?.env_var) out.required_env = s.auth.env_var;
  if (s.auth?.type) out.auth = s.auth.type;
  return out;
}

// The pipeline stages and which categories serve them (mirrors mcp.film/stack).
const STAGES = [
  { stage: "develop", categories: ["story-preproduction"] },
  { stage: "visualize", categories: ["image-generation"] },
  { stage: "shoot", categories: ["studio", "video-generation", "model-hub", "3d-vfx", "avatars-performance"] },
  { stage: "sound", categories: ["voice-speech", "music", "sound-design"] },
  { stage: "cut", categories: ["editing-post", "transcription"] },
  { stage: "finish", categories: ["enhancement"] },
  { stage: "ship", categories: ["distribution", "production-ops"] },
];

const TOOLS = [
  {
    name: "search_film_mcps",
    description:
      "Search the mcp.film directory of MCP servers for AI filmmaking. Filter by free-text query (matches name, vendor, tagline, capabilities), category id, or capability. Returns compact entries; use get_film_mcp for full detail.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search, e.g. 'upscale video' or 'voice cloning'" },
        category: { type: "string", description: "Category id (see list_film_categories)" },
        capability: { type: "string", description: "Exact capability tag, e.g. 'image-to-video'" },
        official_only: { type: "boolean", description: "Only vendor-maintained servers" },
        remote_only: { type: "boolean", description: "Only hosted remote MCPs (no local install)" },
      },
    },
  },
  {
    name: "get_film_mcp",
    description:
      "Get the full mcp.film entry for one server by slug: description, install commands, auth requirements, sample tools, links, and field notes (caveats).",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Server slug, e.g. 'martini' or 'elevenlabs'" } },
      required: ["slug"],
    },
  },
  {
    name: "list_film_categories",
    description: "List all mcp.film categories with ids, pipeline stage, and per-category agent hints.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_install_config",
    description:
      "Get a copy-paste install command or JSON config for a server, for a specific MCP client (claude_code, claude_desktop, or cursor). Includes required env vars and auth type.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        client: { type: "string", enum: ["claude_code", "claude_desktop", "cursor"] },
      },
      required: ["slug", "client"],
    },
  },
  {
    name: "plan_film_stack",
    description:
      "Get a recommended set of MCP servers covering the whole film pipeline (develop → visualize → shoot → sound → cut → finish → ship). Returns 1-3 picks per stage, ranked by official status and hosting. Pass a brief to bias picks (matched against capabilities and taglines).",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "Optional: what you're making, e.g. 'a 60s commercial with a consistent character and licensed music'" },
      },
    },
  },
];

async function callTool(name, args = {}) {
  const reg = await loadRegistry();
  const servers = reg.servers;

  if (name === "search_film_mcps") {
    const q = (args.query ?? "").toLowerCase();
    let hits = servers.filter((s) => {
      if (args.category && s.category !== args.category) return false;
      if (args.capability && !(s.capabilities ?? []).includes(args.capability)) return false;
      if (args.official_only && !s.official) return false;
      if (args.remote_only && !s.install?.remote_url) return false;
      if (q) {
        const hay = [s.name, s.vendor, s.tagline, s.description, ...(s.capabilities ?? [])].join(" ").toLowerCase();
        return q.split(/\s+/).every((w) => hay.includes(w));
      }
      return true;
    });
    return { count: hits.length, source: reg._source, servers: hits.map(compact) };
  }

  if (name === "get_film_mcp") {
    const s = servers.find((x) => x.slug === args.slug);
    if (!s) return { error: `No server with slug '${args.slug}'. Try search_film_mcps first.` };
    return { ...s, page: `https://mcp.film/mcps/${s.slug}/` };
  }

  if (name === "list_film_categories") {
    return { categories: reg.categories };
  }

  if (name === "get_install_config") {
    const s = servers.find((x) => x.slug === args.slug);
    if (!s) return { error: `No server with slug '${args.slug}'.` };
    return installConfig(s, args.client);
  }

  if (name === "plan_film_stack") {
    const brief = (args.brief ?? "").toLowerCase();
    const score = (s) => {
      let sc = 0;
      if (s.featured) sc += 4;
      if (s.official) sc += 3;
      if (s.install?.remote_url) sc += 1;
      if (brief) {
        const hay = [s.tagline, s.description, ...(s.capabilities ?? [])].join(" ").toLowerCase();
        for (const w of brief.split(/\s+/)) if (w.length > 3 && hay.includes(w)) sc += 2;
      }
      return sc;
    };
    const plan = STAGES.map(({ stage, categories }) => {
      const pool = servers.filter((s) => categories.includes(s.category));
      const picks = pool.sort((a, b) => score(b) - score(a)).slice(0, 3);
      return { stage, picks: picks.map((p) => ({ ...compact(p), why: p.tagline })) };
    });
    return {
      brief: args.brief ?? null,
      plan,
      note: "Picks are ranked by editorial featuring, official status, hosted availability, and brief match. Full entries: get_film_mcp.",
    };
  }

  return { error: `Unknown tool ${name}` };
}

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
