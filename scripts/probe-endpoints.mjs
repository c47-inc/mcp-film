#!/usr/bin/env node
/**
 * Endpoint health probe — deterministic, no LLM, no secrets.
 *
 * For every listing with install.remote_url: POST an anonymous MCP `initialize`, and when that
 * succeeds send `notifications/initialized` and `tools/list` to count the tools listed without
 * credentials. Tools are never called. For every listing whose stdio_command names an npm or
 * PyPI package: check that the package exists and record its latest version.
 *
 * Writes data/health.json with stable key order, carrying `consecutive_failures` and `last_ok`
 * over from the previous file so one blip does not read as death.
 *
 *   node scripts/probe-endpoints.mjs              probe everything, write data/health.json
 *   node scripts/probe-endpoints.mjs --dry-run    probe, print the summary, write nothing
 *   node scripts/probe-endpoints.mjs --only a,b   probe these slugs only, print, write nothing
 *
 * Everything an endpoint sends back is untrusted. Only numbers, enums, a date-shaped protocol
 * version and a clamped, character-filtered serverInfo name/version are kept; no free text from
 * the remote side reaches health.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ANSWERED, evidencePackageRef } from "../src/health.mjs";

export const PROBE_VERSION = 1;
export const PROTOCOL_VERSION = "2025-11-25";
export const USER_AGENT = "mcp.film-health/1.0 (+https://mcp.film/about/)";
const TIMEOUT_MS = 12_000;
const AUX_TIMEOUT_MS = 8_000;
const MAX_BODY = 1_000_000;
const MAX_TOOL_PAGES = 5;
const CONCURRENCY = 8;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEALTH_PATH = path.join(ROOT, "data", "health.json");

// -------------------------------------------------------------- helpers
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
// serverInfo is attacker-controlled text. Keep a short, boring identifier or nothing.
const cleanIdent = (v) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/[^A-Za-z0-9 ._@/:+()-]/g, "").replace(/\s+/g, " ").trim().slice(0, 64);
  return t || null;
};

// Map a fetch failure to a short, fixed vocabulary (never echo remote text).
export function networkError(err) {
  const name = err?.name ?? "";
  const code = String(err?.cause?.code ?? err?.code ?? "");
  if (name === "TimeoutError" || name === "AbortError" || /TIMEOUT/i.test(code)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|EAI_NONAME/.test(code)) return `dns (${code})`;
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO|ERR_SSL/i.test(code)) return `tls (${code})`;
  if (/ECONNREFUSED|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|UND_ERR_SOCKET|UND_ERR_CLOSED/.test(code)) return `connection (${code})`;
  return code ? `network (${code})` : "network";
}

// Read a response body up to MAX_BODY. For SSE, stop as soon as the message we want arrives:
// some servers hold the stream open after the response.
async function readMessage(res, wantId) {
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  const sse = type.includes("text/event-stream");
  if (!res.body) return { message: null, kind: sse ? "sse" : "json" };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let found = null;
  try {
    while (text.length < MAX_BODY) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (sse) {
        found = findInSse(text, wantId);
        if (found) break;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (sse) return { message: found ?? findInSse(text + "\n\n", wantId), kind: "sse" };
  return { message: findInJson(text, wantId), kind: "json" };
}

const pick = (value, wantId) => {
  const list = Array.isArray(value) ? value : [value];
  return list.find((m) => m && typeof m === "object" && m.id === wantId && ("result" in m || "error" in m)) ?? null;
};

export function findInJson(text, wantId) {
  try { return pick(JSON.parse(text), wantId); } catch { return null; }
}

export function findInSse(text, wantId) {
  // Only complete events (terminated by a blank line) are parsed.
  const events = text.replace(/\r\n?/g, "\n").split("\n\n");
  events.pop();
  for (const event of events) {
    const data = event.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
    if (!data) continue;
    const m = findInJson(data, wantId);
    if (m) return m;
  }
  return null;
}

const rpcHeaders = (session, protocol) => ({
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "user-agent": USER_AGENT,
  ...(session ? { "mcp-session-id": session } : {}),
  ...(protocol ? { "mcp-protocol-version": protocol } : {}),
});

async function rpc(fetchImpl, url, body, { session, protocol, timeout = TIMEOUT_MS } = {}) {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: rpcHeaders(session, protocol),
    body: JSON.stringify(body),
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  return res;
}

// RFC 9728 protected-resource metadata: the URL from WWW-Authenticate's resource_metadata,
// then the path-specific and root well-known locations.
async function oauthMetadata(fetchImpl, url, wwwAuth) {
  const candidates = [];
  const hinted = /resource_metadata="?([^",\s]+)"?/i.exec(wwwAuth ?? "")?.[1];
  if (hinted && /^https:\/\//.test(hinted)) candidates.push(hinted);
  const u = new URL(url);
  const pathPart = u.pathname.replace(/\/+$/, "");
  if (pathPart) candidates.push(`${u.origin}/.well-known/oauth-protected-resource${pathPart}`);
  candidates.push(`${u.origin}/.well-known/oauth-protected-resource`);
  for (const c of [...new Set(candidates)]) {
    try {
      const res = await fetchImpl(c, { headers: { accept: "application/json", "user-agent": USER_AGENT }, signal: AbortSignal.timeout(AUX_TIMEOUT_MS) });
      if (!res.ok) { res.body?.cancel().catch(() => {}); continue; }
      const doc = await res.json().catch(() => null);
      if (doc && (Array.isArray(doc.authorization_servers) || typeof doc.resource === "string")) return true;
    } catch { /* try the next location */ }
  }
  return false;
}

const blank = (url) => ({
  url,
  result: "error",
  http_status: null,
  protocol_version: null,
  server_name: null,
  server_version: null,
  tool_count: null,
  anonymous_tools_list: false,
  auth_required: false,
  www_authenticate: false,
  oauth_metadata: false,
  error: null,
});

const authStatus = (status) => status === 401 || status === 403;

// Probe one hosted endpoint. `fetchImpl` is injectable so the classifier can be tested with
// canned responses (scripts/test-health.mjs).
export async function probeEndpoint(url, { fetchImpl = fetch } = {}) {
  const out = blank(url);
  let res;
  try {
    res = await rpc(fetchImpl, url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "mcp.film-health", version: "1.0.0" },
      },
    });
  } catch (err) {
    out.result = "unreachable";
    out.error = networkError(err);
    return out;
  }
  out.http_status = res.status;

  if (authStatus(res.status)) {
    res.body?.cancel().catch(() => {});
    return authRequired(out, fetchImpl, url, res);
  }
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    out.result = "error";
    out.error = `HTTP ${res.status}`;
    return out;
  }

  let init;
  try {
    init = await readMessage(res, 1);
  } catch (err) {
    out.result = "unreachable";
    out.error = `${networkError(err)} while reading the initialize response`;
    return out;
  }
  const result = init.message?.result;
  if (!result || typeof result.protocolVersion !== "string") {
    out.result = "error";
    out.error = init.message?.error
      ? `initialize returned JSON-RPC error ${Number.isInteger(init.message.error.code) ? init.message.error.code : "?"}`
      : `no initialize result in the ${init.kind === "sse" ? "event stream" : "response body"}`;
    return out;
  }
  out.protocol_version = isDate(result.protocolVersion) ? result.protocolVersion : null;
  out.server_name = cleanIdent(result.serverInfo?.name);
  out.server_version = cleanIdent(result.serverInfo?.version);

  const session = res.headers.get("mcp-session-id") ?? undefined;
  const protocol = out.protocol_version ?? PROTOCOL_VERSION;
  try {
    const n = await rpc(fetchImpl, url, { jsonrpc: "2.0", method: "notifications/initialized" }, { session, protocol, timeout: AUX_TIMEOUT_MS });
    n.body?.cancel().catch(() => {});
  } catch { /* a lost notification is the server's problem; tools/list will tell */ }

  try {
    let count = 0;
    let cursor;
    for (let page = 0; page < MAX_TOOL_PAGES; page++) {
      const id = 2 + page;
      const r = await rpc(fetchImpl, url, { jsonrpc: "2.0", id, method: "tools/list", params: cursor ? { cursor } : {} }, { session, protocol });
      if (authStatus(r.status)) {
        r.body?.cancel().catch(() => {});
        out.http_status = r.status;
        return authRequired(out, fetchImpl, url, r);
      }
      if (!r.ok) {
        r.body?.cancel().catch(() => {});
        out.result = "handshake_only";
        out.error = `tools/list HTTP ${r.status}`;
        return out;
      }
      const msg = (await readMessage(r, id)).message;
      if (!Array.isArray(msg?.result?.tools)) {
        out.result = "handshake_only";
        out.error = msg?.error ? `tools/list returned JSON-RPC error ${Number.isInteger(msg.error.code) ? msg.error.code : "?"}` : "tools/list returned no tool array";
        return out;
      }
      count += msg.result.tools.length;
      cursor = typeof msg.result.nextCursor === "string" && msg.result.nextCursor ? msg.result.nextCursor : undefined;
      if (!cursor) break;
    }
    out.result = "ok";
    out.tool_count = count;
    out.anonymous_tools_list = true;
  } catch (err) {
    out.result = "handshake_only";
    out.error = `tools/list ${networkError(err)}`;
  } finally {
    if (session) {
      fetchImpl(url, { method: "DELETE", headers: rpcHeaders(session, protocol), signal: AbortSignal.timeout(AUX_TIMEOUT_MS) })
        .then((r) => r.body?.cancel().catch(() => {}))
        .catch(() => {});
    }
  }
  return out;
}

async function authRequired(out, fetchImpl, url, res) {
  const wwwAuth = res.headers.get("www-authenticate");
  out.result = "auth_required";
  out.auth_required = true;
  out.www_authenticate = Boolean(wwwAuth);
  out.oauth_metadata = await oauthMetadata(fetchImpl, url, wwwAuth);
  return out;
}

// ------------------------------------------------------------ packages
export async function checkPackage(ref, { fetchImpl = fetch } = {}) {
  const out = { registry: ref.registry, name: ref.name, found: null, latest_version: null, deprecated: null, error: null };
  const url = ref.registry === "npm"
    ? `https://registry.npmjs.org/${ref.name.replace("/", "%2F")}`
    : `https://pypi.org/pypi/${encodeURIComponent(ref.name)}/json`;
  try {
    const res = await fetchImpl(url, {
      headers: {
        accept: ref.registry === "npm" ? "application/vnd.npm.install-v1+json" : "application/json",
        "user-agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) {
      res.body?.cancel().catch(() => {});
      out.found = false;
      return out;
    }
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      out.error = `HTTP ${res.status}`;
      return out;
    }
    const doc = await res.json();
    if (ref.registry === "npm") {
      const latest = doc?.["dist-tags"]?.latest;
      out.found = typeof latest === "string";
      out.latest_version = cleanIdent(latest);
      out.deprecated = out.found ? Boolean(doc.versions?.[latest]?.deprecated) : null;
    } else {
      const v = doc?.info?.version;
      out.found = typeof v === "string";
      out.latest_version = cleanIdent(v);
      out.deprecated = out.found ? Boolean(doc.info?.yanked) : null;
    }
  } catch (err) {
    out.error = networkError(err);
  }
  return out;
}

// ------------------------------------------------------------- history
// Answered (ok / auth_required / handshake_only) resets the failure count; anything else adds one.
export function withHistory(current, previous, today) {
  const answered = ANSWERED.has(current.result);
  return {
    ...current,
    consecutive_failures: answered ? 0 : (previous?.consecutive_failures ?? 0) + 1,
    last_ok: answered ? today : previous?.last_ok ?? null,
  };
}

// A registry outage (found: null) is our problem, not the package's: carry history unchanged.
export function packageWithHistory(current, previous, today) {
  const samePackage = previous && previous.registry === current.registry && previous.name === current.name;
  const prev = samePackage ? previous : null;
  if (current.found === null) {
    return { ...current, consecutive_failures: prev?.consecutive_failures ?? 0, last_ok: prev?.last_ok ?? null };
  }
  return {
    ...current,
    consecutive_failures: current.found ? 0 : (prev?.consecutive_failures ?? 0) + 1,
    last_ok: current.found ? today : prev?.last_ok ?? null,
  };
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

const ENDPOINT_KEYS = ["url", "result", "http_status", "protocol_version", "server_name", "server_version", "tool_count", "anonymous_tools_list", "auth_required", "www_authenticate", "oauth_metadata", "error", "consecutive_failures", "last_ok"];
const PACKAGE_KEYS = ["registry", "name", "found", "latest_version", "deprecated", "error", "consecutive_failures", "last_ok"];
const ordered = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));
const bySlug = (entries) => Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));

export function summarize(endpoints, packages) {
  const e = Object.values(endpoints);
  const p = Object.values(packages);
  const count = (list, pred) => list.filter(pred).length;
  return {
    endpoints: e.length,
    answered: count(e, (r) => ANSWERED.has(r.result)),
    ok: count(e, (r) => r.result === "ok"),
    auth_required: count(e, (r) => r.result === "auth_required"),
    handshake_only: count(e, (r) => r.result === "handshake_only"),
    error: count(e, (r) => r.result === "error"),
    unreachable: count(e, (r) => r.result === "unreachable"),
    failing_3_or_more: count(e, (r) => r.consecutive_failures >= 3),
    packages: p.length,
    packages_found: count(p, (r) => r.found === true),
    packages_missing: count(p, (r) => r.found === false),
    packages_unknown: count(p, (r) => r.found === null),
  };
}

// ---------------------------------------------------------------- main
async function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
  const write = !args.includes("--dry-run") && !only;

  const servers = fs.readdirSync(path.join(ROOT, "data", "registry"))
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "registry", f), "utf8")))
    .filter((s) => !only || only.has(s.slug));
  const previous = fs.existsSync(HEALTH_PATH) ? JSON.parse(fs.readFileSync(HEALTH_PATH, "utf8")) : {};
  const checkedAt = new Date();
  const today = checkedAt.toISOString().slice(0, 10);

  const remotes = servers.filter((s) => s.install?.remote_url);
  const endpointResults = await pool(remotes, CONCURRENCY, async (s) => {
    const r = await probeEndpoint(s.install.remote_url);
    console.error(`${r.result.padEnd(15)} ${s.slug.padEnd(28)} ${r.http_status ?? "-"} ${r.protocol_version ?? ""} ${r.tool_count ?? ""} ${r.error ?? ""}`);
    return [s.slug, ordered(withHistory(r, previous.endpoints?.[s.slug], today), ENDPOINT_KEYS)];
  });

  const withPackages = servers.map((s) => [s, evidencePackageRef(s)]).filter(([, ref]) => ref);
  const packageResults = await pool(withPackages, CONCURRENCY, async ([s, ref]) => {
    const r = await checkPackage(ref);
    if (r.found !== true) console.error(`package ${String(r.found).padEnd(7)} ${s.slug.padEnd(28)} ${ref.registry} ${ref.name} ${r.error ?? ""}`);
    return [s.slug, ordered(packageWithHistory(r, previous.packages?.[s.slug], today), PACKAGE_KEYS)];
  });

  const endpoints = bySlug(endpointResults);
  const packages = bySlug(packageResults);
  const summary = summarize(endpoints, packages);
  console.error(JSON.stringify(summary));

  // If most of the catalogue looks dead at once, the runner's network is the likelier culprit.
  // Fail loudly instead of writing a file that says everything died.
  const down = summary.unreachable / Math.max(1, summary.endpoints);
  const pkgDown = summary.packages_unknown / Math.max(1, summary.packages);
  if (!only && (down > 0.5 || pkgDown > 0.5)) {
    console.error(`✗ ${Math.round(down * 100)}% of endpoints unreachable and ${Math.round(pkgDown * 100)}% of package lookups failed: probe network looks broken; not writing health.json`);
    process.exit(1);
  }

  if (!write) {
    if (only) console.log(JSON.stringify({ endpoints, packages }, null, 2));
    return;
  }
  const doc = {
    checked_at: checkedAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    probe_version: PROBE_VERSION,
    summary,
    endpoints,
    packages,
  };
  fs.writeFileSync(HEALTH_PATH, JSON.stringify(doc, null, 2) + "\n");
  console.error(`✓ wrote ${path.relative(ROOT, HEALTH_PATH)}: ${summary.answered}/${summary.endpoints} endpoints answered, ${summary.packages_found}/${summary.packages} packages found`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
