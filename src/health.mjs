// Endpoint health and evidence levels.
//
// data/health.json is written by scripts/probe-endpoints.mjs (no LLM, no secrets): a daily
// anonymous MCP handshake against every hosted remote plus a package-registry lookup for every
// npm/PyPI install. This module validates that file and derives each listing's evidence level.
// Nothing here changes a listing's status — dead/archived is a curator decision. Repeated
// failures go to the curator agenda in /api/pulse.json instead.
import { cmdLike } from "./pages/_shared.mjs";

export const PROBE_RESULTS = ["ok", "auth_required", "handshake_only", "error", "unreachable"];
// The endpoint is alive and speaking: a full anonymous handshake, or an auth challenge.
export const ANSWERED = new Set(["ok", "auth_required", "handshake_only"]);
// A probe older than this no longer counts as evidence (the daily job may have stopped).
export const EVIDENCE_WINDOW_DAYS = 7;
// Consecutive failed checks before a listing lands on the curator agenda.
export const FAILURE_AGENDA_THRESHOLD = 3;

// Strongest first. Derived at build time; never hand-written.
export const EVIDENCE_LEVELS = [
  {
    id: "endpoint_answered",
    label: "Endpoint answered",
    definition: `The hosted MCP endpoint answered our anonymous check within the last ${EVIDENCE_WINDOW_DAYS} days: either a full initialize handshake, or an HTTP 401/403 sign-in challenge (alive, needs credentials).`,
  },
  {
    id: "package_resolves",
    label: "Package resolves",
    definition: `The npm or PyPI package named in the install command exists in its registry as of a check within the last ${EVIDENCE_WINDOW_DAYS} days. It says the package is there, not that the server runs.`,
  },
  {
    id: "docs_checked",
    label: "Docs checked",
    definition: "No machine check applies or none passed recently; the only evidence is the curator's verified date against the vendor's docs or repo.",
  },
];

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// ------------------------------------------------------------- packages
// The npm or PyPI package an entry's stdio_command runs, or null. Same policy as the install
// snippets: prose, installer wizards (`npx x setup`) and install.generate:false export nothing.
export function packageRef(s) {
  const cmd = s.install?.stdio_command;
  if (!cmdLike(cmd, s.install)) return null;
  const npx = npxPackage(cmd);
  if (npx) {
    const name = cleanupPackageId(npx);
    // Registry names only: `github:x/y`, git URLs and tarballs are not npm packages.
    return /^(@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(name) ? { registry: "npm", name } : null;
  }
  const uvxFrom = /^uvx\s+--from\s+([^\s]+)\s+/.exec(cmd);
  const uvx = /^uvx\s+(.+)$/.exec(cmd);
  const py = uvxFrom?.[1] || uvx?.[1];
  if (py) {
    const name = cleanupPackageId(py.split(/\s+/)[0]);
    return /^[A-Za-z0-9._-]+$/.test(name) ? { registry: "pypi", name } : null;
  }
  return null;
}

// Generic bridges (`npx mcp-remote <url>`) resolve whatever the listing is; their presence in a
// registry says nothing about the vendor's server, so they earn no package evidence.
export const BRIDGE_PACKAGES = new Set(["mcp-remote"]);
export const evidencePackageRef = (s) => {
  const ref = packageRef(s);
  return ref && !BRIDGE_PACKAGES.has(ref.name) ? ref : null;
};

// `npx -y pkg`, `npx -y -p pkg bin`, `npx --package=pkg bin`, `npx --package pkg bin`.
function npxPackage(cmd) {
  const tokens = String(cmd).trim().split(/\s+/);
  if (tokens[0] !== "npx") return null;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-p" || t === "--package") return tokens[i + 1] ?? null;
    if (t.startsWith("--package=")) return t.slice("--package=".length) || null;
    if (t.startsWith("-")) continue; // -y, --yes and friends
    return /^[@a-zA-Z0-9._/-]+(@[^\s]+)?$/.test(t) ? t : null;
  }
  return null;
}

// Strip quotes, Python extras and any version or dist-tag (`pkg@alpha`, `@scope/pkg@1.2`).
export function cleanupPackageId(value) {
  return String(value)
    .replace(/^["']|["']$/g, "")
    .replace(/\[.*\]$/, "")
    .replace(/^(@[^/@]+\/[^@]+|[^@]+)@.*$/, "$1");
}

// ------------------------------------------------------------- validate
export function validateHealth(doc, slugs) {
  const errors = [];
  const warnings = [];
  const where = "data/health.json";
  if (!isObj(doc)) return { errors: [`${where}: must be an object`], warnings };
  if (typeof doc.checked_at !== "string" || Number.isNaN(Date.parse(doc.checked_at))) errors.push(`${where}: checked_at must be an ISO timestamp`);
  if (!Number.isInteger(doc.probe_version)) errors.push(`${where}: probe_version must be an integer`);
  if (!isObj(doc.summary)) errors.push(`${where}: summary must be an object`);
  for (const key of ["endpoints", "packages"]) {
    if (!isObj(doc[key])) { errors.push(`${where}: ${key} must be an object keyed by slug`); continue; }
    for (const [slug, r] of Object.entries(doc[key])) {
      const at = `${where}: ${key}.${slug}`;
      if (!slugs.has(slug)) warnings.push(`${at} is not a registry slug (stale probe result; the next probe run drops it)`);
      if (!isObj(r)) { errors.push(`${at} must be an object`); continue; }
      if (!isCount(r.consecutive_failures)) errors.push(`${at}.consecutive_failures must be a non-negative integer`);
      if (r.last_ok !== null && !isDate(r.last_ok)) errors.push(`${at}.last_ok must be YYYY-MM-DD or null`);
      if (key === "endpoints") {
        if (!PROBE_RESULTS.includes(r.result)) errors.push(`${at}.result must be one of ${PROBE_RESULTS.join("/")}`);
        if (r.http_status !== null && !Number.isInteger(r.http_status)) errors.push(`${at}.http_status must be an integer or null`);
        if (r.protocol_version !== null && !isDate(r.protocol_version)) errors.push(`${at}.protocol_version must be YYYY-MM-DD or null`);
        if (r.tool_count !== null && !isCount(r.tool_count)) errors.push(`${at}.tool_count must be a non-negative integer or null`);
        for (const b of ["auth_required", "anonymous_tools_list", "www_authenticate", "oauth_metadata"]) {
          if (typeof r[b] !== "boolean") errors.push(`${at}.${b} must be boolean`);
        }
      } else {
        if (!["npm", "pypi"].includes(r.registry)) errors.push(`${at}.registry must be npm or pypi`);
        if (typeof r.name !== "string" || !r.name) errors.push(`${at}.name must be a package name`);
        if (r.found !== null && typeof r.found !== "boolean") errors.push(`${at}.found must be boolean or null`);
        if (r.latest_version !== null && typeof r.latest_version !== "string") errors.push(`${at}.latest_version must be a string or null`);
      }
    }
  }
  return { errors, warnings };
}

// -------------------------------------------------------------- derive
const dayMs = 24 * 60 * 60 * 1000;
const ageDays = (date, now) => Math.floor((now - new Date(`${date}T00:00:00Z`)) / dayMs);
const recent = (date, now) => isDate(date) && ageDays(date, now) <= EVIDENCE_WINDOW_DAYS;

// Per-slug facts for registry.json, per-server JSON, the MCP server and the pages.
// Returns a Map slug → { evidence, last_probe, package_check } (the last two may be null).
export function deriveEvidence(servers, health, built) {
  const now = new Date(built);
  const date = health?.checked_at ? health.checked_at.slice(0, 10) : null;
  const out = new Map();
  for (const s of servers) {
    const e = health?.endpoints?.[s.slug];
    const p = health?.packages?.[s.slug];
    const last_probe = e && s.install?.remote_url
      ? {
          date,
          result: e.result,
          protocol_version: e.protocol_version,
          tool_count: e.tool_count,
          anonymous_tools_list: e.anonymous_tools_list,
          auth_required: e.auth_required,
          oauth_metadata: e.oauth_metadata,
          consecutive_failures: e.consecutive_failures,
          last_ok: e.last_ok,
        }
      : null;
    const package_check = p
      ? { date, registry: p.registry, name: p.name, found: p.found, latest_version: p.latest_version, last_ok: p.last_ok }
      : null;
    let evidence = "docs_checked";
    if (last_probe && recent(e.last_ok, now)) evidence = "endpoint_answered";
    else if (package_check && recent(p.last_ok, now)) evidence = "package_resolves";
    out.set(s.slug, { evidence, last_probe, package_check });
  }
  return out;
}

// Listings whose endpoint or package failed FAILURE_AGENDA_THRESHOLD checks in a row.
export function failingChecks(servers, health) {
  const list = [];
  for (const s of servers) {
    const e = health?.endpoints?.[s.slug];
    const p = health?.packages?.[s.slug];
    const failures = [];
    if (e && e.consecutive_failures >= FAILURE_AGENDA_THRESHOLD) failures.push({ check: "endpoint", result: e.result, consecutive_failures: e.consecutive_failures, last_ok: e.last_ok });
    if (p && p.consecutive_failures >= FAILURE_AGENDA_THRESHOLD) failures.push({ check: "package", result: `${p.registry} package not found`, consecutive_failures: p.consecutive_failures, last_ok: p.last_ok });
    if (!failures.length) continue;
    list.push({
      slug: s.slug,
      name: s.name,
      ...(s.status ? { status: s.status } : {}),
      consecutive_failures: Math.max(...failures.map((f) => f.consecutive_failures)),
      failures,
    });
  }
  return list.sort((a, b) => b.consecutive_failures - a.consecutive_failures || a.name.localeCompare(b.name));
}
