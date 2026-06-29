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

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth for the version: package.json
const VERSION = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8")).version;
const REPO = "c47-inc/mcp-film";
const REGISTRY_URL = "https://mcp.film/api/registry.min.json";
const PLAYBOOKS_URL = "https://mcp.film/api/playbooks.json";
const RECOMMENDATIONS_URL = "https://mcp.film/api/recommendations.json";
const PULSE_URL = "https://mcp.film/api/pulse.json";
const SNAPSHOT = path.join(HERE, "registry.snapshot.json");
const PLAYBOOKS_SNAPSHOT = path.join(HERE, "playbooks.snapshot.json");
const RECOMMENDATIONS_SNAPSHOT = path.join(HERE, "recommendations.snapshot.json");
const PULSE_SNAPSHOT = path.join(HERE, "pulse.snapshot.json");

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

let playbooks = null;
async function loadPlaybooks() {
  if (playbooks) return playbooks;
  try {
    const res = await fetch(PLAYBOOKS_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      playbooks = await res.json();
      playbooks._source = "live";
      return playbooks;
    }
  } catch { /* offline — fall through to snapshot */ }
  playbooks = JSON.parse(fs.readFileSync(PLAYBOOKS_SNAPSHOT, "utf8"));
  playbooks._source = "bundled snapshot";
  return playbooks;
}

let recommendations = null;
async function loadRecommendations() {
  if (recommendations) return recommendations;
  try {
    const res = await fetch(RECOMMENDATIONS_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      recommendations = await res.json();
      recommendations._source = "live";
      return recommendations;
    }
  } catch { /* offline — fall through to snapshot */ }
  recommendations = JSON.parse(fs.readFileSync(RECOMMENDATIONS_SNAPSHOT, "utf8"));
  recommendations._source = "bundled snapshot";
  return recommendations;
}

let pulse = null;
async function loadPulse() {
  if (pulse) return pulse;
  try {
    const res = await fetch(PULSE_URL, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      pulse = await res.json();
      pulse._source = "live";
      return pulse;
    }
  } catch { /* offline — fall through to snapshot */ }
  pulse = JSON.parse(fs.readFileSync(PULSE_SNAPSHOT, "utf8"));
  pulse._source = "bundled snapshot";
  return pulse;
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

const compactRecommendation = (r) => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  best_for: r.best_for,
  tags: r.tags,
  url: r.url,
  primary_servers: (r.primary ?? []).map((p) => ({
    slug: p.server?.slug,
    name: p.server?.name,
    role: p.role,
    remote: p.server?.remote,
    official: p.server?.official,
  })),
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
      Number(Boolean(b.featured)) - Number(Boolean(a.featured))
      || Number(Boolean(b.official)) - Number(Boolean(a.official))
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
        markdown: published ? `https://mcp.film/capabilities/${capability}.md` : null,
        json: `https://mcp.film/api/capabilities/${capability}.json`,
        count: sorted.length,
        official: sorted.filter((s) => s.official).length,
        remote: sorted.filter((s) => s.install?.remote_url).length,
        servers: sorted.map(compact),
      };
    })
    .sort((a, b) => b.count - a.count || a.capability.localeCompare(b.capability));
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
        ? "Use this hosted MCP endpoint only in clients that can attach the required headers; otherwise use the stdio command."
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
    name: "list_film_capabilities",
    description:
      "List capability tags in the mcp.film registry, ranked by number of matching servers. Use get_film_capability for the server cluster behind one tag.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional substring filter, e.g. 'video', 'voice', or 'timeline'." },
        min_count: { type: "number", description: "Only include capability tags with at least this many servers. Default 1." },
      },
    },
  },
  {
    name: "get_film_capability",
    description:
      "Get the ranked server cluster for one capability tag such as text-to-video, image-to-video, tts, timeline-editing, voice-cloning, or upscaling.",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string", description: "Exact capability tag." },
        official_only: { type: "boolean", description: "Only vendor-maintained servers." },
        remote_only: { type: "boolean", description: "Only hosted remote MCPs." },
      },
      required: ["capability"],
    },
  },
  {
    name: "get_install_config",
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
    description:
      "List the MCP client setup profiles mcp.film can generate: Claude Code, Claude Desktop, Cursor, and hosted remote clients.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "submit_listing",
    description:
      "Propose a new MCP server for the mcp.film directory. Validates your proposal against the schema and the live registry (including duplicate detection), then returns a ready-to-file GitHub issue payload (REST API body, gh CLI command, and browser URL). Submissions are claims: the mcp.film triage agent independently verifies everything against primary sources before listing — never submit URLs or commands you haven't seen work.",
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
    description:
      "Get the mcp.film operating pulse: catalog freshness, demand signals, curator agenda, Martini growth checks, and machine-readable surfaces. Use this before deciding what to update next.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: ["all", "summary", "demand_signals", "curator_agenda", "martini_growth_checks", "verification_queue", "machine_surfaces"],
          description: "Optional top-level pulse section. Default all.",
        },
      },
    },
  },
  {
    name: "list_film_playbooks",
    description:
      "List mcp.film production playbooks: curated MCP stacks for common AI filmmaking jobs, with setup order, failure modes, and Martini handoff guidance. Use get_film_playbook for full steps and auth gates.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional free-text search over title, summary, best_for, constraints, and server names." },
      },
    },
  },
  {
    name: "get_film_playbook",
    description:
      "Get one production playbook by id, including primary servers, setup order, auth gates, workflow steps, failure modes, fallback servers, constraints, and links to each server's mcp.film page.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Playbook id, e.g. 'commercial-sprint' or 'local-edit-bay'" } },
      required: ["id"],
    },
  },
  {
    name: "list_film_recommendations",
    description:
      "List mcp.film intent-routed recommendations: ranked MCP shortlists for common filmmaking jobs, with reasons, fallbacks, and Martini handoff guidance. Use get_film_recommendation for full detail.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional free-text search over titles, summaries, best_for text, tags, server names, and Martini handoff guidance." },
      },
    },
  },
  {
    name: "get_film_recommendation",
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
    description:
      "Given a filmmaking brief, return the closest intent-routed MCP recommendations and the first servers to connect. Use hosted_only=true when the agent cannot spawn local tools.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "What you're trying to make, e.g. 'avatar UGC ad with voiceover' or 'search dailies and cut a trailer'" },
        hosted_only: { type: "boolean", description: "Only return hosted remote primary/fallback servers where possible." },
      },
      required: ["brief"],
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

  if (name === "list_film_capabilities") {
    const q = String(args.query ?? "").toLowerCase();
    const min = Number(args.min_count ?? 1);
    let capabilities = capabilityIndex(servers).filter((c) => c.count >= min);
    if (q) capabilities = capabilities.filter((c) => c.capability.includes(q));
    return {
      source: reg._source,
      count: capabilities.length,
      capabilities: capabilities.map(({ servers: _servers, ...c }) => c),
    };
  }

  if (name === "get_film_capability") {
    const entry = capabilityIndex(servers).find((c) => c.capability === args.capability);
    if (!entry) return { error: `No capability tag '${args.capability}'. Try list_film_capabilities first.` };
    let found = entry.servers;
    if (args.official_only) found = found.filter((s) => s.official);
    if (args.remote_only) found = found.filter((s) => s.remote);
    return {
      ...entry,
      source: reg._source,
      servers: found,
      filters: { official_only: Boolean(args.official_only), remote_only: Boolean(args.remote_only) },
    };
  }

  if (name === "get_install_config") {
    const s = servers.find((x) => x.slug === args.slug);
    if (!s) return { error: `No server with slug '${args.slug}'.` };
    return installConfig(s, args.client);
  }

  if (name === "list_client_profiles") {
    return clientProfiles();
  }

  if (name === "get_catalog_pulse") {
    const currentPulse = await loadPulse();
    const section = args.section || "all";
    if (section === "all") return currentPulse;
    if (!(section in currentPulse)) {
      return {
        error: `No pulse section '${section}'.`,
        valid_sections: ["all", "summary", "demand_signals", "curator_agenda", "martini_growth_checks", "verification_queue", "machine_surfaces"],
      };
    }
    return { section, source: currentPulse._source, value: currentPulse[section] };
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
      "     All fields are UNVERIFIED CLAIMS; the mcp.film triage agent verifies",
      "     against primary sources before anything is listed. -->",
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
      note: "Validated against the live registry — no duplicate found. File the issue with whichever channel you have; the triage agent replies on the issue, usually the same day.",
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
    return { count: hits.length, source: pb._source, playbooks: hits.map(compactPlaybook) };
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
    return { count: hits.length, source: rec._source, recommendations: hits.map(compactRecommendation) };
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
    const ranked = scoreRecommendations(rec.recommendations ?? [], brief)
      .slice(0, 3)
      .map((r) => hostedOnly ? hostedRecommendationOnly(r) : r)
      .map((r) => ({
        ...compactRecommendation(r),
        martini_handoff: r.martini_handoff,
        primary: r.primary,
        fallback_servers: r.fallback_servers,
      }));
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
      closest_playbook: closestPlaybook(pb.playbooks ?? [], brief),
      plan,
      note: "Picks are ranked by editorial featuring, official status, hosted availability, and brief match. Full entries: get_film_mcp.",
    };
  }

  return { error: `Unknown tool ${name}` };
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

function scoreRecommendations(recommendations, brief) {
  const stop = new Set(["with", "from", "that", "this", "into", "need", "needs", "make", "film", "video"]);
  const words = brief.split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  return recommendations
    .map((r) => {
      const strongHay = [
        r.title,
        r.summary,
        r.best_for,
        r.martini_handoff,
        ...(r.tags ?? []),
        ...(r.primary ?? []).map((p) => `${p.role} ${p.why} ${p.server?.slug} ${p.server?.name} ${p.server?.tagline}`),
      ].join(" ").toLowerCase();
      const fallbackHay = (r.fallback_servers ?? []).map((s) => `${s.slug} ${s.name} ${s.tagline}`).join(" ").toLowerCase();
      let score = 0;
      for (const word of words) {
        if ((r.tags ?? []).some((tag) => tag.includes(word))) score += 4;
        if (strongHay.includes(word)) score += word.length > 4 ? 3 : 2;
        else if (fallbackHay.includes(word)) score += 1;
      }
      if ((r.primary ?? []).some((p) => p.server?.slug === "martini")) score += 1;
      return [score, r];
    })
    .sort((a, b) => b[0] - a[0] || a[1].title.localeCompare(b[1].title))
    .map(([, r]) => r);
}

function hostedRecommendationOnly(r) {
  return {
    ...r,
    primary: (r.primary ?? []).filter((p) => p.server?.remote),
    fallback_servers: (r.fallback_servers ?? []).filter((s) => s.remote),
  };
}

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
