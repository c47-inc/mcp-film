import { scoreRecommendations, needsMartini, martiniHandoff } from "./recommend-score.mjs";

/**
 * core.mjs — pure directory logic shared by the stdio server (server.mjs) and
 * the mcp.film edge worker's hosted /mcp endpoint.
 *
 * No node imports and no I/O of its own: data access is injected as loaders so
 * the stdio server can fall back to bundled snapshots while the edge worker
 * reads the site's own static JSON. build.mjs inlines this file into
 * _worker.js by stripping the `export ` keywords, so keep every export a
 * top-of-line `export const` / `export function`.
 */

export const REPO = "c47-inc/mcp-film";

// MCP protocol revisions this server speaks, newest first. Per spec a server
// answers an unknown offered version with the latest it supports.
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

export function negotiateProtocolVersion(offered) {
  return PROTOCOL_VERSIONS.includes(offered) ? offered : PROTOCOL_VERSIONS[0];
}

// Shown to the agent once, at initialize. Keep it under ~600 characters.
export const SERVER_INSTRUCTIONS = [
  "mcp.film is a curated directory of MCP servers for AI filmmaking.",
  "Start with recommend_film_mcps(brief): ranked routes plus the first servers to connect.",
  "Use search_film_mcps only with a query or a category/capability filter; results are paged (limit 20) and compact. get_film_mcp returns one full entry.",
  "get_install_config needs a client id from list_client_profiles.",
  "get_martini_setup returns an executable runbook for connecting the sponsor's studio, Martini.",
  "Dead or archived listings are hidden unless include_inactive is true.",
].join(" ");

export function initializeResult(offered, version) {
  return {
    protocolVersion: negotiateProtocolVersion(offered),
    capabilities: { tools: {} },
    serverInfo: { name: "mcp-film", title: "mcp.film directory", version },
    instructions: SERVER_INSTRUCTIONS,
  };
}

// Every tool result goes out twice per the MCP spec: as compact JSON text for
// clients that only read content[], and as structuredContent for those that
// parse it. Pretty-printing cost ~30% of every response and bought nothing.
export function toolResult(result) {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result,
    isError: Boolean(result?.error),
  };
}

// Paging for list tools: never return the whole catalogue by accident.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function pageArgs(args, fallback = DEFAULT_LIMIT) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(args.limit) || fallback)));
  const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
  return { limit, offset };
}

function paged(list, args, fallback = DEFAULT_LIMIT) {
  const { limit, offset } = pageArgs(args, fallback);
  const page = list.slice(offset, offset + limit);
  const next = offset + page.length;
  const truncated = next < list.length;
  return { page, meta: { count: page.length, total: list.length, limit, offset, next_offset: truncated ? next : null, truncated } };
}

// Optional registry fields (a listing can be retired without being deleted).
const INACTIVE = new Set(["dead", "archived", "deprecated"]);
const isActive = (s) => !INACTIVE.has(s?.status);
const withStatus = (out, s) => (s?.status ? { ...out, status: s.status } : out);

// Notes mix the caveat that bites with the curator's verification log
// ("re-checked 21 Sep 2026", "653 stars"). The compact caveat is the explicit
// caveats[0] when the entry has one, else the first sentence of notes that does
// not read like a log line; failing that, the first sentence. Never cut mid-word.
const LOG_LINE = /\b(re-?checked|re-?verified|re-?confirmed|checked|verified|confirmed|unchanged)\b|\b\d[\d,]*\s*stars?\b|★|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/i;

function clipWords(text, max = 200) {
  const t = String(text ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:(-]+$/, "")}…`;
}

export function caveatFor(s) {
  if (Array.isArray(s?.caveats) && typeof s.caveats[0] === "string" && s.caveats[0].trim()) return clipWords(s.caveats[0]);
  const notes = String(s?.notes ?? "").trim();
  if (!notes) return "";
  const sentences = notes.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((x) => x.trim()).filter(Boolean);
  const caveat = sentences.find((x) => !LOG_LINE.test(x)) ?? sentences[0] ?? "";
  return clipWords(caveat);
}

const compact = (s) => withStatus({
  slug: s.slug,
  url: `https://mcp.film/mcps/${s.slug}/`,
  verified: s.verified,
  caveat: caveatFor(s),
  name: s.name,
  vendor: s.vendor,
  official: s.official,
  category: s.category,
  tagline: s.tagline,
  pricing: s.pricing,
  remote: Boolean(s.install?.remote_url),
  capabilities: s.capabilities,
}, s);

// One line per pick: the registry entry (looked up by slug) supplies the
// fields the recommendation doc does not carry.
const compactPick = (p, bySlug) => {
  const s = bySlug?.get(p.server?.slug) ?? {};
  const out = withStatus({
    slug: p.server?.slug,
    name: p.server?.name,
    role: p.role,
    why: p.why,
    remote: p.server?.remote,
    official: p.server?.official,
    verified: s.verified ?? p.server?.verified,
  }, s);
  if (Array.isArray(s.caveats) && s.caveats.length) out.caveats = s.caveats.slice(0, 1);
  return out;
};

const compactFallback = (f, bySlug) => {
  const s = bySlug?.get(f.slug) ?? {};
  return withStatus({ slug: f.slug, name: f.name, remote: f.remote, official: f.official, verified: s.verified ?? f.verified }, s);
};

const compactPlaybook = (p) => ({
  id: p.id,
  title: p.title,
  summary: p.summary,
  best_for: p.best_for,
  url: p.url,
  setup_order: p.setup_order,
  failure_modes: p.failure_modes,
  martini_handoff: p.martini_handoff,
  primary_servers: (p.primary_servers ?? []).map((s) => s.slug),
});

const compactRecommendation = (r, bySlug) => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  best_for: r.best_for,
  tags: r.tags,
  url: r.url,
  primary_servers: (r.primary ?? []).map((p) => compactPick(p, bySlug)),
  fallback_servers: (r.fallback_servers ?? []).map((f) => compactFallback(f, bySlug)),
  playbook: r.playbook,
});

function capabilityIndex(servers) {
  const groups = new Map();
  for (const s of servers) {
    for (const capability of s.capabilities ?? []) {
      if (!groups.has(capability)) groups.set(capability, []);
      groups.get(capability).push(s);
    }
  }
  const sortServers = (list) =>
    [...list].sort((a, b) =>
      Number(Boolean(b.official)) - Number(Boolean(a.official))
      || Number(Boolean(b.install?.remote_url)) - Number(Boolean(a.install?.remote_url))
      || a.name.localeCompare(b.name)
    );
  return [...groups.entries()]
    .map(([capability, list]) => {
      const sorted = sortServers(list);
      const published = sorted.length >= 2;
      return {
        capability,
        url: published ? `https://mcp.film/capabilities/${capability}/` : null,
        count: sorted.length,
        official: sorted.filter((s) => s.official).length,
        remote: sorted.filter((s) => s.install?.remote_url).length,
        servers: sorted.map(compact),
      };
    })
    .sort((a, b) => b.count - a.count || a.capability.localeCompare(b.capability));
}

// ---- Search tokens. Queries and haystacks go through the same normaliser, so
// "lip sync", "lip-sync" and "lipsync" become one token and "lip" can no longer
// match the middle of "clip". The registry may ship its own alias map
// (capability_aliases, from data/capability-aliases.json); this built-in one
// is the floor when it does not.
const BUILTIN_ALIASES = {
  "lip-sync": ["lipsync", "lip sync", "lip syncing", "lip-syncing", "lipsyncing"],
  "tts": ["text-to-speech", "text to speech", "speech synthesis"],
  "captions": ["caption", "captioning", "subtitles", "subtitle", "subtitling", "closed captions"],
  "upscaling": ["upscale", "upscaler", "upscaled", "4k", "video-upscaling", "super-resolution", "super resolution"],
  "speech-to-text": ["stt", "transcription", "transcribe", "transcript"],
  "text-to-video": ["t2v"],
  "image-to-video": ["i2v"],
  "text-to-image": ["t2i"],
  "voice-cloning": ["voice clone", "clone voice", "clone a voice"],
  "sound-effects": ["sfx", "sound effect", "foley"],
};

const SEARCH_STOPWORDS = new Set(["a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "with", "mcp", "mcps", "server", "servers", "tool", "tools", "ai"]);

const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Accepts {canonical: [aliases]} or [{capability, aliases}] and merges onto the built-ins.
function aliasTable(runtime) {
  const table = Object.fromEntries(Object.entries(BUILTIN_ALIASES).map(([k, v]) => [k, [...v]]));
  const entries = Array.isArray(runtime)
    ? runtime.map((e) => [e?.capability ?? e?.canonical, e?.aliases])
    : Object.entries(runtime && typeof runtime === "object" ? runtime : {});
  for (const [canonical, aliases] of entries) {
    if (typeof canonical !== "string" || !Array.isArray(aliases)) continue;
    table[canonical] = [...new Set([...(table[canonical] ?? []), ...aliases.filter((a) => typeof a === "string")])];
  }
  return table;
}

const aliasCache = new WeakMap();
const DEFAULT_ALIAS_KEY = {};

// Compiled once per registry document: [regex, canonical token] pairs, longest phrase first.
function aliasRules(reg) {
  const key = reg && typeof reg === "object" ? reg : DEFAULT_ALIAS_KEY;
  if (aliasCache.has(key)) return aliasCache.get(key);
  const table = aliasTable(reg?.capability_aliases);
  const rules = [];
  for (const [canonical, aliases] of Object.entries(table)) {
    const token = squash(canonical);
    for (const phrase of [canonical, ...aliases]) {
      const words = String(phrase).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (!words.length) continue;
      rules.push([new RegExp(`\\b${words.join("[\\s_-]*")}\\b`, "g"), ` ${token} `, words.join("").length]);
    }
  }
  rules.sort((a, b) => b[2] - a[2]);
  aliasCache.set(key, rules);
  return rules;
}

// A light stem so "captions" meets "captioning" and "voices" meets "voice".
const stem = (w) => (w.length > 5 && /(ing|ed|er|es|s)$/.test(w) ? w.replace(/(ing|ed|er|es|s)$/, "") : w);

// A query collapses an alias phrase to its canonical token only; a haystack
// keeps the original words too, so "voice cloning" (phrase) finds a subset of
// what "cloning voice" (any order) finds, never something different.
function tokenize(text, reg, { stopwords = false, expand = false } = {}) {
  let t = String(text ?? "").toLowerCase();
  for (const [re, replacement] of aliasRules(reg)) t = t.replace(re, expand ? `${replacement}$& ` : replacement);
  const out = [];
  for (const w of t.match(/[a-z0-9]+/g) ?? []) {
    if (stopwords && SEARCH_STOPWORDS.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

// Query token q hits haystack token h when equal, or when q (4+ chars) prefixes h.
const tokenHit = (q, hay) => hay.set.has(q) || (q.length >= 4 && hay.list.some((h) => h.startsWith(q)));
const matchesAll = (qTokens, hay) => qTokens.every((q) => tokenHit(q, hay));
const tokenIndex = (texts, reg) => {
  const list = [...new Set(tokenize(texts.filter(Boolean).join(" "), reg, { expand: true }))];
  return { list, set: new Set(list) };
};

function serverHaystack(s, reg, categoryName) {
  return tokenIndex([
    s.name, s.vendor, s.tagline, s.description,
    ...(s.capabilities ?? []), ...(s.tools_sample ?? []),
    s.category, categoryName, s.pricing, s.auth?.type,
  ], reg);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// 0..1: exact squashed match, containment, else edit distance.
function similarity(a, b) {
  const x = squash(a), y = squash(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.1 + 0.9 * Math.min(x.length, y.length) / Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

// Nearest capability tags, category ids and server names for a query that found nothing.
function didYouMean(query, reg, { capabilities = null, limit = 3, threshold = 0.7 } = {}) {
  const q = String(query ?? "").trim();
  if (!q) return null;
  const qTokens = tokenize(q, reg, { stopwords: true });
  const score = (candidate) => {
    let best = similarity(q, candidate);
    for (const qt of qTokens) for (const ct of tokenize(candidate, reg, { expand: true })) best = Math.max(best, 0.9 * similarity(qt, ct));
    return best;
  };
  const rank = (items, label) => items
    .map((item) => ({ item, score: Math.max(...label(item).map(score)) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.item);
  const tags = capabilities ?? [...new Set((reg.servers ?? []).flatMap((s) => s.capabilities ?? []))];
  const out = {};
  const caps = rank(tags, (t) => [t]);
  if (caps.length) out.capabilities = caps;
  const cats = rank(reg.categories ?? [], (c) => [c.id, c.name]).map((c) => c.id);
  if (cats.length) out.categories = cats;
  const servers = rank(reg.servers ?? [], (s) => [s.name, s.slug]).map((s) => s.slug);
  if (servers.length) out.servers = servers;
  return Object.keys(out).length ? out : null;
}

// Exact tag, else the tag whose normalised tokens equal the input's (so
// "lipsync", "lip sync" and "text to speech" land on lip-sync and tts).
function resolveCapability(input, index, reg) {
  const wanted = String(input ?? "").trim();
  if (!wanted) return null;
  const exact = index.find((c) => c.capability === wanted);
  if (exact) return exact;
  const key = tokenize(wanted, reg).join(" ");
  if (!key) return null;
  return index.find((c) => tokenize(c.capability, reg).join(" ") === key) ?? null;
}

// Capability tags whose tokens overlap the given query tokens, most-populated first.
function capabilitiesMatching(qTokens, index, reg) {
  if (!qTokens.length) return [];
  return index.filter((c) => {
    const hay = tokenIndex([c.capability], reg);
    return qTokens.some((q) => tokenHit(q, hay));
  }).map((c) => c.capability);
}

const cmdLike = (cmd) =>
  typeof cmd === "string" && !cmd.includes("(") && !/\bafter\b|\bclone\b|\bthen\b/i.test(cmd);

const remoteHeaders = (s) =>
  Array.isArray(s.install?.remote_headers) ? s.install.remote_headers.filter(Boolean) : [];

const remoteNeedsHeaders = (s) => remoteHeaders(s).length > 0;

function installConfig(s, client) {
  const out = { slug: s.slug, client };
  if (client === "claude_code") {
    if (s.install?.claude_code && cmdLike(s.install.claude_code)) out.command = s.install.claude_code;
    else if (s.install?.remote_url && !remoteNeedsHeaders(s)) out.command = `claude mcp add --transport http ${s.slug} ${s.install.remote_url}`;
    else if (cmdLike(s.install?.stdio_command)) out.command = `claude mcp add ${s.slug} -- ${s.install.stdio_command}`;
  } else if (client === "hosted_remote" || client === "generic_remote") {
    if (s.install?.remote_url) {
      out.remote_url = s.install.remote_url;
      if (remoteNeedsHeaders(s)) out.remote_headers = remoteHeaders(s);
      out.note = remoteNeedsHeaders(s)
        ? s.install?.stdio_command
          ? "Use this hosted MCP endpoint only in clients that can attach the required headers; otherwise use the stdio command."
          : "Use this hosted MCP endpoint only in clients that can attach the required headers; this listing has no stdio fallback."
        : "Use this hosted MCP endpoint in a client that supports remote MCP connectors; complete the vendor OAuth/API-key flow in that client.";
    } else {
      out.note = "This server is local/stdio only; use a local client or choose a hosted remote entry.";
    }
  } else if (s.install?.remote_url && !remoteNeedsHeaders(s)) {
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
  if (!out.command && !out.config && !out.remote_url) {
    out.note = `No mechanical install available — follow the vendor instructions: ${s.install?.docs_url ?? s.links?.docs ?? s.links?.site ?? "see mcp.film/mcps/" + s.slug}`;
  }
  if (s.auth?.env_var) out.required_env = s.auth.env_var;
  if (s.auth?.type) out.auth = s.auth.type;
  return out;
}

function clientProfiles() {
  return {
    clients: [
      {
        id: "claude_code",
        supports_remote_url: true,
        supports_stdio: true,
        config_surface: "CLI command",
        install_hint: "Use install.claude_code when available; otherwise use remote_url with --transport http or stdio_command after setting env vars.",
      },
      {
        id: "claude_desktop",
        supports_remote_url: true,
        supports_stdio: true,
        config_surface: "claude_desktop_config.json",
        install_hint: "Use generated JSON configs; hosted remotes are bridged through mcp-remote.",
      },
      {
        id: "cursor",
        supports_remote_url: true,
        supports_stdio: true,
        config_surface: ".cursor/mcp.json",
        install_hint: "Use generated Cursor JSON; hosted remotes use a url field.",
      },
      {
        id: "hosted_remote",
        aliases: ["generic_remote"],
        supports_remote_url: true,
        supports_stdio: false,
        config_surface: "client connector UI or remote MCP URL field",
        install_hint: "Use only servers with install.remote_url; local stdio packages need a local client or trusted bridge.",
      },
    ],
    docs: "https://mcp.film/clients.md",
    json: "https://mcp.film/api/client-profiles.json",
  };
}

// Pulse sections for curators and ops: served on request, never folded into "all".
const PULSE_OPS_SECTIONS = ["demand_signals", "martini_growth_checks"];
const PULSE_SECTIONS = ["all", "summary", "curator_agenda", "verification_queue", "machine_surfaces", ...PULSE_OPS_SECTIONS];

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

export const TOOLS = [
  {
    name: "search_film_mcps",
    title: "Search film MCP servers",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Search the mcp.film directory of MCP servers for AI filmmaking. Filter by free-text query (matches name, vendor, tagline, description, capabilities, tools, category, pricing, auth), category id, or capability. Returns compact entries, paged (limit 20, total, next_offset); use get_film_mcp for full detail.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search, e.g. 'upscale video' or 'voice cloning'" },
        category: { type: "string", description: "Category id (see list_film_categories)" },
        capability: { type: "string", description: "Exact capability tag, e.g. 'image-to-video'" },
        official_only: { type: "boolean", description: "Only vendor-maintained servers" },
        remote_only: { type: "boolean", description: "Only hosted remote MCPs (no local install)" },
        include_inactive: { type: "boolean", description: "Also return listings whose status is dead, archived or deprecated. Default false." },
        limit: { type: "number", description: "Page size, 1-100. Default 20." },
        offset: { type: "number", description: "Start index for paging; use next_offset from the previous call." },
      },
    },
  },
  {
    name: "get_film_mcp",
    title: "Get one film MCP server",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    title: "List film MCP categories",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description: "List all mcp.film categories with ids, pipeline stage, and per-category agent hints.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_film_capabilities",
    title: "List capability tags",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "List capability tags in the mcp.film registry, ranked by number of matching servers (tag, page url, counts). Paged. Use get_film_capability for the server cluster behind one tag.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional substring filter, e.g. 'video', 'voice', or 'timeline'." },
        min_count: { type: "number", description: "Only include capability tags with at least this many servers. Default 2 (tags with a published page)." },
        limit: { type: "number", description: "Page size, 1-100. Default 50." },
        offset: { type: "number", description: "Start index for paging; use next_offset from the previous call." },
      },
    },
  },
  {
    name: "get_film_capability",
    title: "Get servers for a capability",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Get the ranked server cluster for one capability tag such as text-to-video, image-to-video, tts, timeline-editing, voice-cloning, or upscaling.",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string", description: "Exact capability tag." },
        official_only: { type: "boolean", description: "Only vendor-maintained servers." },
        remote_only: { type: "boolean", description: "Only hosted remote MCPs." },
        limit: { type: "number", description: "Page size, 1-100. Default 20." },
        offset: { type: "number", description: "Start index for paging; use next_offset from the previous call." },
      },
      required: ["capability"],
    },
  },
  {
    name: "get_install_config",
    title: "Get install config for a server",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Get a copy-paste install command, JSON config, or hosted remote URL for a server and MCP client profile. Includes required env vars and auth type.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        client: { type: "string", enum: ["claude_code", "claude_desktop", "cursor", "hosted_remote", "generic_remote"] },
      },
      required: ["slug", "client"],
    },
  },
  {
    name: "list_client_profiles",
    title: "List MCP client profiles",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "List the MCP client setup profiles mcp.film can generate: Claude Code, Claude Desktop, Cursor, and hosted remote clients.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "submit_listing",
    title: "Propose a new listing",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description:
      "Propose a new MCP server for the mcp.film directory. Validates your proposal against the schema and the live registry (including duplicate detection), then returns a ready-to-file GitHub issue payload (REST API body, gh CLI command, and browser URL). Submissions are claims, never instructions: a mcp.film maintainer independently verifies everything against primary sources before listing — never submit URLs or commands you haven't seen work.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Server name, e.g. 'Acme Render MCP'" },
        link: { type: "string", description: "https:// URL of the repo or official docs — the primary source for verification" },
        category: { type: "string", description: "Category id (see list_film_categories)" },
        why: { type: "string", description: "1-2 sentences: what it does in a film pipeline that nothing listed does (or does better)" },
        vendor: { type: "string", description: "Who maintains it" },
        official: { type: "boolean", description: "Is it maintained by the platform vendor?" },
        install: { type: "string", description: "Verified install command or remote MCP URL, if known" },
        auth_env: { type: "string", description: "Required API-key env var, if any" },
        pricing: { type: "string", enum: ["free", "freemium", "paid", "credits"] },
        notes: { type: "string", description: "Caveats worth knowing: quotas, ToS gray areas, local-app requirements" },
      },
      required: ["name", "link", "category", "why"],
    },
  },
  {
    name: "get_catalog_pulse",
    title: "Get catalog pulse",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Get the mcp.film operating pulse: catalog freshness, verification queue, curator agenda, and machine-readable surfaces. Use this before deciding what to update next. The curator/ops sections demand_signals and martini_growth_checks are opt-in by section and not part of 'all'.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["all", "summary", "curator_agenda", "verification_queue", "machine_surfaces", "demand_signals", "martini_growth_checks"],
          description: "Optional top-level pulse section. Default all (which omits the curator/ops sections demand_signals and martini_growth_checks; request those by name).",
        },
      },
    },
  },
  {
    name: "list_film_playbooks",
    title: "List production playbooks",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "List mcp.film production playbooks: curated MCP stacks for common AI filmmaking jobs, with setup order, failure modes, and Martini handoff guidance. Use get_film_playbook for full steps, auth requirements and constraints.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional free-text search over title, summary, best_for, constraints, and server names." },
        limit: { type: "number", description: "Page size, 1-100. Default 20." },
        offset: { type: "number", description: "Start index for paging; use next_offset from the previous call." },
      },
    },
  },
  {
    name: "get_film_playbook",
    title: "Get one production playbook",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Get one production playbook by id, including primary servers, setup order, auth requirements, workflow steps, failure modes, fallback servers, constraints, and links to each server's mcp.film page.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Playbook id, e.g. 'commercial-sprint' or 'local-edit-bay'" } },
      required: ["id"],
    },
  },
  {
    name: "list_film_recommendations",
    title: "List intent-routed recommendations",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "List mcp.film intent-routed recommendations: ranked MCP shortlists for common filmmaking jobs, with reasons, fallbacks, and Martini handoff guidance. Use get_film_recommendation for full detail.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional free-text search over titles, summaries, best_for text, tags, server names, and Martini handoff guidance." },
        limit: { type: "number", description: "Page size, 1-100. Default 20." },
        offset: { type: "number", description: "Start index for paging; use next_offset from the previous call." },
      },
    },
  },
  {
    name: "get_film_recommendation",
    title: "Get one recommendation",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Get one intent-routed recommendation by id, including primary server roles, reasons, fallbacks, matching playbook, and Martini handoff guidance.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Recommendation id, e.g. 'fast-commercial' or 'hosted-only-stack'" } },
      required: ["id"],
    },
  },
  {
    name: "recommend_film_mcps",
    title: "Recommend MCP servers for a brief",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Given a filmmaking brief, return the closest intent-routed MCP recommendations: one compact pick per primary server (slug, role, why, remote, official, verified) plus compact fallbacks. Use hosted_only=true when the agent cannot spawn local tools; get_film_mcp for full server detail.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "What you're trying to make, e.g. 'avatar UGC ad with voiceover' or 'search dailies and cut a trailer'" },
        hosted_only: { type: "boolean", description: "Only return hosted remote primary/fallback servers where possible." },
        include_inactive: { type: "boolean", description: "Also consider servers whose status is dead, archived or deprecated. Default false." },
        verbosity: { type: "string", enum: ["compact", "full"], description: "compact (default): one small object per pick in primary/primary_servers and fallback_servers. full: the complete server objects, as before." },
      },
      required: ["brief"],
    },
  },
  {
    name: "plan_film_stack",
    title: "Plan a full film MCP stack",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    description:
      "Get a recommended set of MCP servers covering the whole film pipeline (develop → visualize → shoot → sound → cut → finish → ship). Returns 1-3 picks per stage, ranked by official status and hosting. Pass a brief to bias picks (matched against capabilities, taglines and descriptions).",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "Optional: what you're making, e.g. 'a 60s commercial with a consistent character and licensed music'" },
        include_inactive: { type: "boolean", description: "Also consider servers whose status is dead, archived or deprecated. Default false." },
      },
    },
  },
];

export function makeCallTool({ loadRegistry, loadPlaybooks, loadRecommendations, loadPulse }, VERSION) {
  return async function callTool(name, args = {}) {
    const reg = await loadRegistry();
    const servers = reg.servers;
    const bySlug = new Map(servers.map((s) => [s.slug, s]));

    if (name === "search_film_mcps") {
      const query = String(args.query ?? "").trim();
      const qTokens = tokenize(query, reg, { stopwords: true });
      const catIds = (reg.categories ?? []).map((c) => c.id);
      if (args.category && !catIds.includes(args.category)) {
        return {
          error: `Unknown category '${args.category}'.`,
          valid_categories: catIds,
          ...(didYouMean(args.category, reg) ? { did_you_mean: didYouMean(args.category, reg) } : {}),
        };
      }
      const index = capabilityIndex(servers);
      let capability = null;
      if (args.capability) {
        capability = resolveCapability(args.capability, index, reg)?.capability ?? null;
        if (!capability) {
          return {
            error: `No capability tag '${args.capability}'.`,
            ...(didYouMean(args.capability, reg, { capabilities: index.map((c) => c.capability) }) ? { did_you_mean: didYouMean(args.capability, reg, { capabilities: index.map((c) => c.capability) }) } : {}),
            hint: "Use list_film_capabilities to browse tags.",
          };
        }
      }
      const catName = new Map((reg.categories ?? []).map((c) => [c.id, c.name]));
      const hits = servers.filter((s) => {
        if (!args.include_inactive && !isActive(s)) return false;
        if (args.category && s.category !== args.category) return false;
        if (capability && !(s.capabilities ?? []).includes(capability)) return false;
        if (args.official_only && !s.official) return false;
        if (args.remote_only && !s.install?.remote_url) return false;
        if (qTokens.length) return matchesAll(qTokens, serverHaystack(s, reg, catName.get(s.category)));
        return true;
      });
      const { page, meta } = paged(hits, args);
      const out = { ...meta, source: reg._source };
      if (query) out.query_tokens = qTokens;
      if (capability && capability !== args.capability) out.capability = { requested: args.capability, resolved: capability };
      if (!hits.length) {
        const near = didYouMean(query || capability || args.category, reg, { capabilities: index.map((c) => c.capability) });
        if (near) out.did_you_mean = near;
        out.hint = "No entry matched every query token. Try fewer words, a capability tag from list_film_capabilities, or recommend_film_mcps with the brief.";
      }
      out.servers = page.map(compact);
      return out;
    }

    if (name === "get_film_mcp") {
      const s = servers.find((x) => x.slug === args.slug);
      if (!s) return { error: `No server with slug '${args.slug}'. Try search_film_mcps first.` };
      return { ...s, page: `https://mcp.film/mcps/${s.slug}/` };
    }

    if (name === "list_film_categories") {
      return { categories: reg.categories };
    }

    if (name === "list_film_capabilities") {
      const q = String(args.query ?? "").toLowerCase();
      const min = Number(args.min_count ?? 2);
      let capabilities = capabilityIndex(servers).filter((c) => c.count >= min);
      if (q) {
        const qTokens = tokenize(q, reg, { stopwords: true });
        capabilities = capabilities.filter((c) => c.capability.includes(q) || (qTokens.length && matchesAll(qTokens, tokenIndex([c.capability], reg))));
      }
      const { page, meta } = paged(capabilities, args, 50);
      return {
        ...meta,
        min_count: min,
        source: reg._source,
        capabilities: page.map(({ servers: _servers, ...c }) => c),
      };
    }

    if (name === "get_film_capability") {
      const index = capabilityIndex(servers);
      const entry = resolveCapability(args.capability, index, reg);
      if (!entry) {
        const near = didYouMean(args.capability, reg, { capabilities: index.map((c) => c.capability) });
        return {
          error: `No capability tag '${args.capability}'. Try list_film_capabilities first.`,
          ...(near ? { did_you_mean: near } : {}),
        };
      }
      let found = entry.servers;
      if (args.official_only) found = found.filter((s) => s.official);
      if (args.remote_only) found = found.filter((s) => s.remote);
      const { page, meta } = paged(found, args);
      return {
        ...entry,
        ...(entry.capability !== args.capability ? { resolved_from: args.capability } : {}),
        source: reg._source,
        ...meta,
        servers: page,
        filters: { official_only: Boolean(args.official_only), remote_only: Boolean(args.remote_only) },
      };
    }

    if (name === "get_install_config") {
      const profiles = clientProfiles().clients;
      const validClients = profiles.flatMap((c) => [c.id, ...(c.aliases ?? [])]);
      const client = typeof args.client === "string" ? args.client.trim().toLowerCase() : "";
      if (!validClients.includes(client)) {
        return {
          error: client ? `Unknown client '${args.client}'.` : "client is required.",
          valid_clients: validClients,
          hint: "Pick an id from list_client_profiles.",
        };
      }
      const s = servers.find((x) => x.slug === args.slug);
      if (!s) {
        const near = didYouMean(args.slug, reg);
        return { error: `No server with slug '${args.slug}'.`, ...(near?.servers ? { did_you_mean: near.servers } : {}) };
      }
      return installConfig(s, client);
    }

    if (name === "list_client_profiles") {
      return clientProfiles();
    }

    if (name === "get_catalog_pulse") {
      const currentPulse = await loadPulse();
      const section = args.section || "all";
      const observed = {
        data_source: currentPulse._source ?? null,
        observed_at: currentPulse._observed_at ?? currentPulse.generated ?? null,
      };
      if (section === "all") {
        const { [PULSE_OPS_SECTIONS[0]]: _demand, [PULSE_OPS_SECTIONS[1]]: _martini, ...rest } = currentPulse;
        return {
          ...rest,
          summary: { ...(rest.summary ?? {}), ...observed },
          opt_in_sections: PULSE_OPS_SECTIONS,
          note: "demand_signals and martini_growth_checks are curator/ops sections; request them by name.",
        };
      }
      if (!(section in currentPulse) || section.startsWith("_")) {
        return { error: `No pulse section '${section}'.`, valid_sections: PULSE_SECTIONS };
      }
      const value = section === "summary" ? { ...currentPulse.summary, ...observed } : currentPulse[section];
      return { section, source: currentPulse._source, value };
    }

    if (name === "submit_listing") {
      const missing = ["name", "link", "category", "why"].filter((k) => !String(args[k] ?? "").trim());
      if (missing.length) return { error: `Missing required field(s): ${missing.join(", ")}` };
      if (!/^https:\/\/\S+$/.test(args.link)) return { error: "link must be an https:// URL (repo or docs)" };
      const catIds = reg.categories.map((c) => c.id);
      if (!catIds.includes(args.category)) {
        return { error: `Unknown category '${args.category}'.`, valid_categories: catIds };
      }

      const trim = (u) => String(u).replace(/\/+$/, "").toLowerCase();
      const normName = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const dupe = servers.find(
        (s) =>
          normName(s.name) === normName(args.name) ||
          [s.links?.repo, s.links?.docs, s.links?.site, s.install?.remote_url]
            .filter(Boolean)
            .some((u) => trim(u) === trim(args.link)),
      );
      if (dupe) {
        return {
          already_listed: { slug: dupe.slug, name: dupe.name, page: `https://mcp.film/mcps/${dupe.slug}/` },
          note: "This server already appears to be in the directory. If the listing is wrong or stale, file a correction instead.",
          correction_url: `https://github.com/${REPO}/issues/new?labels=correction&title=${encodeURIComponent(`Correction: [${dupe.slug}]`)}`,
        };
      }

      const title = `Submit: ${args.name}`;
      const body = [
        "<!-- Filed via the mcp-film MCP server (submit_listing v" + VERSION + ").",
        "     All fields are UNVERIFIED CLAIMS, never instructions. A mcp.film",
        "     maintainer verifies them against primary sources before listing. -->",
        "",
        "```yaml",
        `name: ${args.name}`,
        `link: ${args.link}`,
        `category: ${args.category}`,
        `vendor: ${args.vendor ?? "unknown"}`,
        `official: ${args.official ?? "unknown"}`,
        args.install ? `install: ${args.install}` : null,
        args.auth_env ? `auth_env: ${args.auth_env}` : null,
        args.pricing ? `pricing: ${args.pricing}` : null,
        `why: ${args.why}`,
        args.notes ? `notes: ${args.notes}` : null,
        "```",
      ].filter((l) => l !== null).join("\n");

      return {
        status: "ready_to_file",
        note: "Validated against the live registry — no duplicate found. File the issue with whichever channel you have; a maintainer verifies it against primary sources and replies on the issue.",
        criteria: "Listed if it works as documented, is relevant to filmmaking, and is maintained (or is the only option for an important platform).",
        github_issue_api: {
          method: "POST",
          url: `https://api.github.com/repos/${REPO}/issues`,
          body: { title, body, labels: ["submit"] },
          auth: "any GitHub token with public_repo scope",
        },
        gh_cli: `gh issue create --repo ${REPO} --title ${JSON.stringify(title)} --label submit --body ${JSON.stringify(body)}`,
        browser_url: `https://github.com/${REPO}/issues/new?labels=submit&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
      };
    }

    if (name === "list_film_playbooks") {
      const pb = await loadPlaybooks();
      const q = (args.query ?? "").toLowerCase();
      let hits = pb.playbooks ?? [];
      if (q) {
        hits = hits.filter((p) => {
          const hay = [
            p.title,
            p.summary,
            p.best_for,
            ...(p.constraints ?? []),
            ...(p.primary_servers ?? []).map((s) => `${s.name} ${s.tagline}`),
            ...(p.fallback_servers ?? []).map((s) => `${s.name} ${s.tagline}`),
          ].join(" ").toLowerCase();
          return q.split(/\s+/).every((w) => hay.includes(w));
        });
      }
      const { page, meta } = paged(hits, args);
      return { ...meta, source: pb._source, playbooks: page.map(compactPlaybook) };
    }

    if (name === "get_film_playbook") {
      const pb = await loadPlaybooks();
      const playbook = (pb.playbooks ?? []).find((p) => p.id === args.id);
      if (!playbook) return { error: `No playbook with id '${args.id}'. Try list_film_playbooks first.` };
      return { ...playbook, source: pb._source };
    }

    if (name === "list_film_recommendations") {
      const rec = await loadRecommendations();
      const q = (args.query ?? "").toLowerCase();
      let hits = rec.recommendations ?? [];
      if (q) {
        hits = hits.filter((r) => includesAllWords(recommendationHaystack(r), q));
      }
      const { page, meta } = paged(hits, args);
      return { ...meta, source: rec._source, recommendations: page.map((r) => compactRecommendation(r, bySlug)) };
    }

    if (name === "get_film_recommendation") {
      const rec = await loadRecommendations();
      const recommendation = (rec.recommendations ?? []).find((r) => r.id === args.id);
      if (!recommendation) return { error: `No recommendation with id '${args.id}'. Try list_film_recommendations first.` };
      return { ...recommendation, source: rec._source };
    }

    if (name === "recommend_film_mcps") {
      const rec = await loadRecommendations();
      const brief = String(args.brief ?? "").toLowerCase();
      const hostedOnly = Boolean(args.hosted_only);
      // Retired listings leave the shortlist before scoring; a route with no live primary leaves too.
      const live = (slug) => args.include_inactive || isActive(bySlug.get(slug) ?? {});
      const candidates = (rec.recommendations ?? []).map((r) => ({
        ...r,
        primary: (r.primary ?? []).filter((p) => live(p.server?.slug)),
        fallback_servers: (r.fallback_servers ?? []).filter((s) => live(s.slug)),
      }));
      const full = args.verbosity === "full";
      const ranked = scoreRecommendations(candidates, brief, hostedOnly)
        .slice(0, 3)
        .map((r) => {
          const shaped = compactRecommendation(r, bySlug);
          return {
            ...shaped,
            // `primary` stays for older callers; compact by default, the full objects on verbosity=full.
            primary: full ? r.primary : shaped.primary_servers,
            ...(full ? { fallback_servers: r.fallback_servers } : {}),
            ...(needsMartini(r, brief) ? { martini_handoff: martiniHandoff(r, `recommendation:${r.id}`) } : {}),
          };
        });
      if (!ranked.length) {
        const matched = capabilitiesMatching(tokenize(brief, reg, { stopwords: true }), capabilityIndex(servers), reg).slice(0, 5);
        const suggestion = matched.length
          ? `Try search_film_mcps with capability ${matched.map((c) => `'${c}'`).join(" or ")}, or list_film_recommendations to browse routes.`
          : "No capability tag matches the brief's words either. Try list_film_capabilities to find the right tag, or list_film_recommendations to browse routes.";
        return {
          brief: args.brief,
          no_match: true,
          message: `No route in the directory matches this brief. ${suggestion}`,
          ...(matched.length ? { matched_capabilities: matched } : {}),
          recommendations: [],
        };
      }
      return {
        brief: args.brief,
        hosted_only: hostedOnly,
        source: rec._source,
        recommendations: ranked,
        note: hostedOnly
          ? "Hosted-only mode removes local primary/fallback servers when the recommendation data marks a server as non-remote."
          : "Use get_film_recommendation for one full route, or get_film_mcp for full server detail.",
      };
    }

    if (name === "plan_film_stack") {
      const pb = await loadPlaybooks();
      const brief = (args.brief ?? "").toLowerCase();
      const score = (s) => {
        let sc = 0;
        if (s.official) sc += 3;
        if (s.install?.remote_url) sc += 1;
        if (brief) {
          const hay = [s.tagline, s.description, ...(s.capabilities ?? [])].join(" ").toLowerCase();
          for (const w of brief.split(/\s+/)) if (w.length > 3 && hay.includes(w)) sc += 2;
        }
        return sc;
      };
      const plan = STAGES.map(({ stage, categories }) => {
        const pool = servers.filter((s) => categories.includes(s.category) && (args.include_inactive || isActive(s)));
        const picks = pool.sort((a, b) => score(b) - score(a)).slice(0, 3);
        return { stage, picks: picks.map((p) => ({ ...compact(p), why: p.tagline })) };
      });
      return {
        brief: args.brief ?? null,
        closest_playbook: closestPlaybook(pb.playbooks ?? [], brief),
        plan,
        note: "Picks are ranked by official status, hosted availability, and brief match. Full entries: get_film_mcp.",
      };
    }

    return { error: `Unknown tool ${name}` };
  };
}

function recommendationHaystack(r) {
  return [
    r.title,
    r.summary,
    r.best_for,
    r.martini_handoff,
    ...(r.tags ?? []),
    ...(r.primary ?? []).map((p) => `${p.role} ${p.why} ${p.server?.slug} ${p.server?.name} ${p.server?.tagline}`),
    ...(r.fallback_servers ?? []).map((s) => `${s.slug} ${s.name} ${s.tagline}`),
  ].join(" ").toLowerCase();
}

const includesAllWords = (haystack, query) =>
  query.split(/\s+/).filter(Boolean).every((w) => haystack.includes(w));

function closestPlaybook(playbooks, brief) {
  if (!brief) return null;
  const words = brief.split(/\s+/).filter((w) => w.length > 3);
  const scored = playbooks
    .map((p) => {
      const hay = [
        p.title,
        p.summary,
        p.best_for,
        ...(p.constraints ?? []),
        ...(p.primary_servers ?? []).map((s) => `${s.slug} ${s.name} ${s.tagline}`),
      ].join(" ").toLowerCase();
      const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return [score, p];
    })
    .sort((a, b) => b[0] - a[0]);
  if (!scored[0] || scored[0][0] === 0) return null;
  return compactPlaybook(scored[0][1]);
}
