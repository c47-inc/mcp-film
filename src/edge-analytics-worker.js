// Cloudflare Pages advanced-mode worker for server-side traffic analytics.
// Build replaces the __MCPFILM_*__ placeholders with data/site.json values.

const DEFAULT_POSTHOG_KEY = "__MCPFILM_POSTHOG_KEY__";
const DEFAULT_POSTHOG_HOST = "__MCPFILM_POSTHOG_HOST__";
const DEFAULT_CANONICAL_HOST = "__MCPFILM_CANONICAL_HOST__";
const DEFAULT_SPONSOR_URL = "__MCPFILM_SPONSOR_URL__";
const DEFAULT_SPONSOR_CONNECT_URL = "__MCPFILM_SPONSOR_CONNECT_URL__";

// Placements that represent "I have decided which tool to use and want to connect it".
// Those land on the sponsor's connect docs; everything else lands on the homepage.
const CONNECT_INTENT_PLACEMENT = /^(capability|playbook|recommendation|router|server-links):|^agents-fast-path$/;

// Exported for scripts/check-build.mjs. Cloudflare only reads the default export.
export const isConnectIntent = (placement) => CONNECT_INTENT_PLACEMENT.test(String(placement || ""));

const staticAssetPattern = /\.(?:avif|css|gif|ico|jpeg|jpg|js|json\.map|map|png|svg|webp|woff2?)$/i;

// Vulnerability-scanner probes: a 404 on one of these is noise, not a broken link. Exported for scripts/test-edge.mjs.
export const SCANNER_PROBE = /\.env|\.git|\/wp-|phpinfo|\.php|\/_profiler|\/\.well-known\/agent|\/\.well-known\/traffic-advice|\/backend\/|\/laravel\//i;

const agentMatchers = [
  ["chatgpt", /\b(chatgpt|gptbot|openai|oai-searchbot)\b/i],
  ["claude", /\b(claude|anthropic)\b/i],
  ["perplexity", /\b(perplexity|pplx)\b/i],
  ["google-ai", /\b(google-extended|googleother|gemini)\b/i],
  ["mcp-client", /\b(mcp|modelcontextprotocol)\b/i],
  ["developer-agent", /\b(cursor|windsurf|cline|aider|codex|copilot)\b/i],
  ["script", /\b(curl|wget|httpie|python-requests|aiohttp|httpx|go-http-client|node-fetch|axios|postman|insomnia)\b/i],
];

const crawlerPattern = /\b(bot|crawler|spider|slurp|bingpreview|duckduckbot|yandex|baiduspider)\b/i;
const browserPattern = /\b(mozilla|chrome|safari|firefox|edg|opr)\b/i;
const agentReadableSurfaces = new Set([
  "api",
  "agent-docs-markdown",
  "capability-json",
  "capability-markdown",
  "client-profiles-json",
  "clients-markdown",
  "feed",
  "llms",
  "listing-json",
  "listing-markdown",
  "mcp-discovery",
  "mcp-endpoint",
  "mcp-registry",
  "playbooks-json",
  "playbooks-markdown",
  "pulse-json",
  "pulse-markdown",
  "recommendations-json",
  "recommendations-markdown",
  "registry-json",
  "remote-directory-json",
  "remote-directory-markdown",
  "router-markdown",
  "sitemap",
  "stats-json",
]);

export default {
  async fetch(request, env, ctx) {
    const mcpResponse = await mcpEndpointResponse(request, env, ctx);
    if (mcpResponse) return mcpResponse;

    const canonicalRedirect = canonicalRedirectResponse(request, env);
    if (canonicalRedirect) {
      ctx.waitUntil(captureRequest(request, canonicalRedirect, env));
      return canonicalRedirect;
    }

    const handoffRedirect = handoffRedirectResponse(request, env);
    if (handoffRedirect) {
      ctx.waitUntil(Promise.all([
        captureRequest(request, handoffRedirect, env),
        captureMartiniHandoff(request, handoffRedirect, env),
      ]));
      return handoffRedirect;
    }

    const markdown = await markdownTwinResponse(request, env);
    if (markdown) {
      ctx.waitUntil(captureRequest(request, markdown, env, { negotiated: "markdown" }));
      return markdown;
    }

    const response = await registryApiResponse(request, env) || await pageResponse(request, env);
    ctx.waitUntil(captureRequest(request, response, env));
    return response;
  },
};

// ---- Markdown twins. Every HTML page is also built as <path>.md (/ -> /index.md).
// Exported for scripts/test-edge.mjs.
export function markdownTwinPath(pathname) {
  if (pathname === "/") return "/index.md";
  if (!/^\/[a-z0-9/-]+\/?$/.test(pathname)) return null;
  return pathname.replace(/\/$/, "") + ".md";
}

function acceptQuality(accept, type) {
  for (const part of String(accept || "").split(",")) {
    const [media, ...params] = part.split(";").map((s) => s.trim().toLowerCase());
    if (media !== type) continue;
    const q = params.find((p) => p.startsWith("q="));
    return q ? Number(q.slice(2)) || 0 : 1;
  }
  return 0;
}

export function prefersMarkdown(accept) {
  const html = acceptQuality(accept, "text/html");
  return acceptQuality(accept, "text/markdown") > html || (html === 0 && acceptQuality(accept, "text/plain") > 0);
}

async function markdownTwinResponse(request, env) {
  const url = new URL(request.url);
  const twin = /^(GET|HEAD)$/.test(request.method) ? markdownTwinPath(url.pathname) : null;
  if (!twin || !prefersMarkdown(request.headers.get("accept"))) return null;
  const asset = await env.ASSETS.fetch(new Request(new URL(twin, url.origin)));
  if (!asset.ok) return null;
  const response = new Response(asset.body, asset);
  response.headers.set("content-type", "text/markdown; charset=utf-8");
  response.headers.set("vary", "Accept");
  response.headers.set("link", `<${url.origin}${url.pathname.replace(/\/?$/, "/")}>; rel="canonical"`);
  return response;
}

// A markdown or text twin fetched directly (/mcps/x.md, /llms.txt) is the same document as
// its HTML page. Without a canonical, search engines index a few hundred duplicates. The
// Link header says which page is the original; the twin stays readable for LLM fetchers
// (no noindex). Exported for scripts/test-edge.mjs.
export function canonicalPageFor(pathname) {
  if (pathname === "/index.md" || pathname === "/llms.txt" || pathname === "/llms-full.txt") return "/";
  const m = /^(\/[a-z0-9/-]+)\.md$/.exec(pathname);
  return m ? `${m[1]}/` : null;
}

async function pageResponse(request, env) {
  const response = await env.ASSETS.fetch(assetRequestFor(request));
  const url = new URL(request.url);
  // HTML pages negotiate to their markdown twin on Accept; the <link rel="alternate"> in
  // the page head already advertises the twin, so only the cache key needs telling.
  if (request.method === "GET" && response.ok && /text\/html/i.test(response.headers.get("content-type") || "")
    && markdownTwinPath(url.pathname)) {
    const page = new Response(response.body, response);
    page.headers.append("vary", "Accept");
    return page;
  }
  const canonical = /^(GET|HEAD)$/.test(request.method) && response.ok ? canonicalPageFor(url.pathname) : null;
  if (canonical) {
    const twin = new Response(response.body, response);
    twin.headers.set("link", `<${url.origin}${canonical}>; rel="canonical"`);
    return twin;
  }
  return response;
}

function canonicalRedirectResponse(request, env) {
  const url = new URL(request.url);
  const canonicalHost = String(env.CANONICAL_HOST || DEFAULT_CANONICAL_HOST || "mcp.film")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");

  if (!canonicalHost || canonicalHost.startsWith("__MCPFILM_")) return null;
  if (url.hostname.toLowerCase() !== `www.${canonicalHost}`.toLowerCase()) return null;

  url.hostname = canonicalHost;
  return Response.redirect(url.toString(), 301);
}

function handoffRedirectResponse(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/go/martini" && url.pathname !== "/go/martini/") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return jsonResponse({ error: "Method not allowed" }, 405);

  const destination = sponsorDestinationFor(request, env);
  if (!destination) return jsonResponse({ error: "Sponsor destination unavailable" }, 404);
  return Response.redirect(destination.toString(), 302);
}

// Exported for scripts/test-edge.mjs.
export function sponsorDestinationFor(request, env) {
  const sponsorUrl = env.SPONSOR_URL || DEFAULT_SPONSOR_URL;
  if (!sponsorUrl || sponsorUrl.startsWith("__MCPFILM_")) return null;

  const requestUrl = new URL(request.url);
  const placement = cleanPlacement(requestUrl.searchParams.get("from"));

  // Someone arriving from a capability, playbook or server page has already chosen a tool.
  // Sending them to a marketing homepage loses them; send them to the connect instructions.
  const connectUrl = env.SPONSOR_CONNECT_URL || DEFAULT_SPONSOR_CONNECT_URL;
  const useConnect =
    placement && CONNECT_INTENT_PLACEMENT.test(placement) && connectUrl && !connectUrl.startsWith("__MCPFILM_");

  // Attribution rides on the destination's own query string (merged with whatever the
  // configured URL already carries): ref= is what Martini reads, utm_* what analytics reads.
  const destination = new URL(useConnect ? connectUrl : sponsorUrl);
  destination.searchParams.set("ref", "mcp-film");
  destination.searchParams.set("utm_source", "mcp.film");
  destination.searchParams.set("utm_medium", "referral");
  destination.searchParams.set("utm_campaign", "mcp_film_handoff");
  if (placement) destination.searchParams.set("utm_content", placement.slice(0, 64));

  // The destination cannot tell an agent from a person, and on this site most requests are
  // agents. Hand over the classification so downstream analytics can separate them.
  const classification = classifyTraffic(requestUrl.pathname, request.headers.get("user-agent") || "", request.headers);
  destination.searchParams.set("src_kind", classification.kind);
  return destination;
}

// ---- /mcp: the directory served as a hosted streamable-HTTP MCP endpoint.
// Stateless (no sessions, no SSE): every POST is a self-contained JSON-RPC
// exchange over the same TOOLS/callTool core the npx server uses. Data comes
// from this deployment's own static JSON, so endpoint and site can't drift.
const MCP_VERSION = "__MCPFILM_MCP_VERSION__";
let mcpCallTool = null;
const mcpAssetCache = {};

function mcpLoaders(env, origin) {
  const load = (pathname) => async () => {
    if (mcpAssetCache[pathname]) return mcpAssetCache[pathname];
    const res = await env.ASSETS.fetch(new Request(new URL(pathname, origin)));
    if (!res.ok) throw new Error(`registry data unavailable (${pathname} -> ${res.status})`);
    const data = await res.json();
    data._source = "live";
    mcpAssetCache[pathname] = data;
    return data;
  };
  return {
    loadRegistry: load("/api/registry.min.json"),
    loadPlaybooks: load("/api/playbooks.json"),
    loadRecommendations: load("/api/recommendations.json"),
    loadPulse: load("/api/pulse.json"),
  };
}

function mcpHeaders() {
  const out = jsonHeaders();
  out.set("access-control-allow-methods", "POST, OPTIONS");
  out.set("access-control-allow-headers", "content-type, accept, authorization, mcp-protocol-version, mcp-session-id");
  return out;
}

// Exported for scripts/test-mcp.mjs; the endpoint binds callTool to this deployment's data.
export async function mcpHandleMessage(msg, callTool = mcpCallTool) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return { jsonrpc: "2.0", id: (msg && msg.id) ?? null, error: { code: -32600, message: "Invalid Request" } };
  }
  const { id, method, params } = msg;
  const isNotification = id === undefined;
  try {
    if (method === "initialize") {
      return { jsonrpc: "2.0", id, result: initializeResult(params?.protocolVersion, MCP_VERSION) };
    }
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    if (method === "tools/call") {
      return { jsonrpc: "2.0", id, result: toolResult(await callTool(params?.name, params?.arguments)) };
    }
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (e) {
    if (isNotification) return null;
    return { jsonrpc: "2.0", id, error: { code: -32603, message: String(e?.message ?? e) } };
  }
}

// GET /mcp. A client opening an SSE stream gets the spec's answer for stream-less
// servers (405); a person or agent just looking gets a markdown description.
// Exported for scripts/test-edge.mjs.
export function mcpGetResponse(method, accept, tools) {
  const headers = mcpHeaders();
  headers.set("allow", "POST, OPTIONS");
  headers.set("vary", "Accept"); // the same URL answers 200 markdown or 405 JSON by Accept
  if (!/^(GET|HEAD)$/.test(method) || /text\/event-stream/i.test(accept || "")) {
    const json = JSON.stringify({ error: "Use POST with JSON-RPC 2.0", docs: "https://mcp.film/for-agents.md" }, null, 2);
    return new Response(method === "HEAD" ? null : json, { status: 405, headers });
  }
  headers.set("content-type", "text/markdown; charset=utf-8");
  const body = [
    "# mcp.film MCP endpoint",
    "",
    "This is a Streamable HTTP MCP endpoint (stateless, no auth, no SSE). POST JSON-RPC 2.0 messages here.",
    "",
    "```sh",
    "claude mcp add --transport http mcp-film https://mcp.film/mcp",
    "```",
    "",
    "## Tools",
    "",
    ...tools.map((t) => `- \`${t.name}\` — ${t.title}: ${t.description.split(/(?<=\.)\s/)[0]}`),
    "",
    "- Agent guide: https://mcp.film/for-agents.md",
    "- Index: https://mcp.film/llms.txt",
    "",
  ].join("\n");
  return new Response(method === "HEAD" ? null : body, { status: 200, headers });
}

export function mcpRequestExtras(message) {
  const describe = (m) => (m && typeof m === "object" && m.method ? String(m.method) : "invalid");
  const tool = !Array.isArray(message) && message?.method === "tools/call" ? message.params?.name : null;
  const args = message?.params?.arguments;
  const query = args?.brief ?? args?.query;
  return {
    rpc_method: (Array.isArray(message) ? message.map(describe).join(",") : describe(message)).slice(0, 120),
    rpc_tool: tool === null ? null : String(tool ?? "").slice(0, 60) || null,
    rpc_query: ["recommend_film_mcps", "search_film_mcps", "list_film_capabilities", "list_film_playbooks", "list_film_recommendations", "plan_film_stack"].includes(tool)
      && typeof query === "string" ? query.trim().slice(0, 200) : null,
  };
}

async function mcpEndpointResponse(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") return null;

  const reply = (body, status, extras) => {
    const response = new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: mcpHeaders(),
    });
    ctx.waitUntil(captureRequest(request, response, env, extras));
    return response;
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: mcpHeaders() });
  if (request.method !== "POST") {
    const response = mcpGetResponse(request.method, request.headers.get("accept"), TOOLS);
    ctx.waitUntil(captureRequest(request, response, env, { rpc_method: null }));
    return response;
  }

  let message;
  try {
    message = await request.json();
  } catch {
    return reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, { rpc_method: "parse-error" });
  }

  if (!mcpCallTool) mcpCallTool = makeCallTool(mcpLoaders(env, url.origin), MCP_VERSION);

  const extras = mcpRequestExtras(message);

  // 2025-06-18 removed JSON-RPC batching, but answering a legacy batch beats erroring on it.
  if (Array.isArray(message)) {
    if (!message.length) return reply({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400, extras);
    const replies = (await Promise.all(message.map((m) => mcpHandleMessage(m, mcpCallTool)))).filter((r) => r !== null);
    return replies.length ? reply(replies, 200, extras) : reply(null, 202, extras);
  }

  const single = await mcpHandleMessage(message, mcpCallTool);
  return single === null ? reply(null, 202, extras) : reply(single, 200, extras);
}

// __MCPFILM_MCP_CORE__ (build.mjs splices packages/mcp-server/core.mjs here)

export async function registryApiResponse(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/v0.1/servers") {
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam === null ? 30 : Number(limitParam);
    if (limitParam !== null && !/^\d+$/.test(limitParam) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return jsonResponse({ error: "limit must be between 1 and 100" }, 400);
    }
    const cursor = url.searchParams.get("cursor");
    let offset = 0;
    if (cursor !== null) {
      try {
        const decoded = atob(cursor);
        if (!/^(0|[1-9]\d*)$/.test(decoded) || btoa(decoded) !== cursor) throw new Error("Invalid cursor");
        offset = Number(decoded);
        if (!Number.isSafeInteger(offset)) throw new Error("Invalid cursor");
      } catch {
        return jsonResponse({ error: "cursor must be a valid pagination cursor" }, 400);
      }
    }
    const updatedSince = url.searchParams.get("updated_since");
    const search = (url.searchParams.get("search") || "").trim().toLowerCase();
    const full = await jsonAssetResponse(env, url, "/api/mcp-registry.json");
    if (full.status !== 200) return full;
    const body = await full.json();
    let servers = Array.isArray(body.servers) ? body.servers : [];

    // The registry API's `search` is a case-insensitive substring over name and description.
    if (search) {
      servers = servers.filter((entry) =>
        `${entry?.server?.name ?? ""} ${entry?.server?.title ?? ""} ${entry?.server?.description ?? ""}`.toLowerCase().includes(search));
    }

    if (updatedSince) {
      const since = Date.parse(updatedSince);
      if (Number.isNaN(since)) {
        return jsonResponse({ error: "updated_since must be an RFC 3339 timestamp" }, 400);
      }
      servers = servers.filter((entry) => {
        const updatedAt = entry?._meta?.["film.mcp/subregistry"]?.updatedAt;
        return updatedAt ? Date.parse(updatedAt) >= since : false;
      });
    }
    if (offset > servers.length) return jsonResponse({ error: "cursor is outside the result set" }, 400);
    const page = servers.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return jsonResponse({ servers: page, metadata: {
      count: page.length,
      nextCursor: nextOffset < servers.length ? btoa(String(nextOffset)) : null,
    } });
  }

  const versions = /^\/v0\.1\/servers\/(.+)\/versions$/.exec(url.pathname);
  if (!versions) return null;

  const slug = slugFromRegistryName(versions[1]);
  if (!slug) return null;
  const latest = await jsonAssetResponse(env, url, `/api/mcp-registry/${slug}.json`);
  if (latest.status !== 200) return latest;
  const server = await latest.json();
  return jsonResponse({
    servers: [server],
    metadata: { count: 1, nextCursor: null },
  }, latest.status);
}

async function jsonAssetResponse(env, requestUrl, pathname) {
  const url = new URL(pathname, requestUrl);
  const response = await env.ASSETS.fetch(new Request(url));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: jsonHeaders(response.headers),
  });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: jsonHeaders(),
  });
}

function jsonHeaders(headers = new Headers()) {
  const out = new Headers(headers);
  out.set("content-type", "application/json; charset=utf-8");
  out.set("access-control-allow-origin", "*");
  return out;
}

function slugFromRegistryName(value) {
  const decoded = decodeURIComponent(value);
  const m = /^film\.mcp\/([a-z0-9][a-z0-9-]*)$/.exec(decoded);
  return m ? m[1] : null;
}

function assetRequestFor(request) {
  const url = new URL(request.url);
  if (url.pathname === "/v0.1/servers" || url.pathname.endsWith("/versions")) {
    url.pathname += "/index.html";
    return new Request(url, request);
  }
  return request;
}

async function captureRequest(request, response, env, extras = null) {
  try {
    if (!shouldCapture(request)) return;

    const url = new URL(request.url);
    if (response.status === 404 && SCANNER_PROBE.test(url.pathname)) return;
    const posthog = posthogConfig(env);
    if (!posthog) return;

    const userAgent = request.headers.get("user-agent") || "";
    const classification = classifyTraffic(url.pathname, userAgent, request.headers);
    const route = routePropertiesFor(url.pathname);
    const distinctId = await distinctIdFor(request, env);

    const properties = {
      path: url.pathname,
      query_keys: [...url.searchParams.keys()].sort().join(",") || null,
      method: request.method,
      status: response.status,
      surface: route.surface,
      route_group: route.group,
      slug: route.slug,
      category: route.category,
      capability: route.capability,
      is_martini: route.slug === "martini" || route.group === "martini",
      traffic_kind: classification.kind,
      agent_family: classification.family,
      referrer_domain: referrerDomain(request.headers.get("referer")),
      accept: compactHeader(request.headers.get("accept")),
      content_type: compactHeader(response.headers.get("content-type")),
      // Most sessions arrive with no referrer, and a user-agent cannot tell a person who
      // clicked a link in ChatGPT from a headless fetcher — both look like a browser.
      // Sec-Fetch can: `none` is a typed, pasted or bookmarked navigation (a person),
      // while `cross-site` with no Referer is the signature of a referrer-stripped click
      // out of a chat client. classifyTraffic already reads sec-fetch-dest and discards it.
      sec_fetch_site: request.headers.get("sec-fetch-site") || null,
      sec_fetch_mode: request.headers.get("sec-fetch-mode") || null,
      sec_fetch_dest: request.headers.get("sec-fetch-dest") || null,
      // Our own agent_family is a user-agent guess and the runbook says to treat it as
      // one. Cloudflare verifies bot identity by signature and IP range, so where these
      // are populated they are ground truth — and disagreements measure our classifier.
      // Availability varies by plan; null here just means the field was not exposed.
      verified_bot: request.cf?.botManagement?.verifiedBot ?? null,
      verified_bot_category: request.cf?.verifiedBotCategory ?? null,
      country: request.cf?.country || null,
      colo: request.cf?.colo || null,
      asn: request.cf?.asn || null,
      host: url.hostname,
      "$current_url": url.origin + url.pathname,
      "$geoip_disable": true,
      "$process_person_profile": false,
      ...(extras || {}),
    };

    if (env.ANALYTICS_DEBUG_UA === "true") properties.user_agent = userAgent.slice(0, 240);

    await sendPosthogEvent(posthog, "mcpfilm_edge_request", distinctId, properties);
  } catch {
    // Analytics must never affect the site response.
  }
}

async function captureMartiniHandoff(request, response, env) {
  try {
    const url = new URL(request.url);
    if (url.pathname !== "/go/martini" && url.pathname !== "/go/martini/") return;
    if (response.status < 300 || response.status >= 400) return;

    const posthog = posthogConfig(env);
    if (!posthog) return;

    const userAgent = request.headers.get("user-agent") || "";
    const classification = classifyTraffic(url.pathname, userAgent, request.headers);
    const distinctId = await distinctIdFor(request, env);
    const destination = response.headers.get("location") || "";

    // A raw handoff count is ~30x the number of people. Most of these are automated clients
    // following a link, plus browser prefetch. Mark the ones that represent a person who
    // actually clicked through from this site, so no report ever quotes the raw number as
    // "humans we sent you".
    const purpose = `${request.headers.get("sec-purpose") || ""} ${request.headers.get("purpose") || ""}`;
    const prefetch = /prefetch|prerender/i.test(purpose);
    const referrer = referrerDomain(request.headers.get("referer"));
    const qualified =
      request.method === "GET" &&
      !prefetch &&
      classification.kind === "human_browser" &&
      isOwnHost(referrer, env);

    const properties = {
      sponsor: "martini",
      placement: cleanPlacement(url.searchParams.get("from")) || null,
      path: url.pathname,
      method: request.method,
      status: response.status,
      to: destination,
      destination_host: destination ? new URL(destination).hostname : null,
      traffic_kind: classification.kind,
      agent_family: classification.family,
      qualified,
      prefetch,
      referrer_domain: referrerDomain(request.headers.get("referer")),
      accept: compactHeader(request.headers.get("accept")),
      country: request.cf?.country || null,
      colo: request.cf?.colo || null,
      asn: request.cf?.asn || null,
      host: url.hostname,
      "$current_url": url.origin + url.pathname,
      "$geoip_disable": true,
      "$process_person_profile": false,
    };

    if (env.ANALYTICS_DEBUG_UA === "true") properties.user_agent = userAgent.slice(0, 240);

    await sendPosthogEvent(posthog, "mcpfilm_martini_handoff", distinctId, properties);
  } catch {
    // Analytics must never affect the site response.
  }
}

function posthogConfig(env) {
  const key = env.POSTHOG_KEY || DEFAULT_POSTHOG_KEY;
  const host = env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST || "https://us.i.posthog.com";
  if (!key || key.startsWith("__MCPFILM_")) return null;
  return { key, host };
}

async function sendPosthogEvent(posthog, event, distinctId, properties) {
  await fetch(new URL("/i/v0/e/", posthog.host).toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: posthog.key,
      event,
      distinct_id: distinctId,
      properties,
    }),
  });
}

function shouldCapture(request) {
  const url = new URL(request.url);
  // The MCP endpoint is POST-only; it is exactly the traffic this worker exists to see.
  if (url.pathname === "/mcp" || url.pathname === "/mcp/") return true;
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (url.pathname.startsWith("/assets/")) return false;
  if (staticAssetPattern.test(url.pathname)) return false;
  return true;
}

function surfaceFor(pathname) {
  return routePropertiesFor(pathname).surface;
}

function routePropertiesFor(pathname) {
  const listingJson = /^\/api\/mcps\/([a-z0-9][a-z0-9-]*)\.json$/.exec(pathname);
  if (listingJson) return route("listing-json", "server", { slug: listingJson[1] });

  const listingMarkdown = /^\/mcps\/([a-z0-9][a-z0-9-]*)\.md$/.exec(pathname);
  if (listingMarkdown) return route("listing-markdown", "server", { slug: listingMarkdown[1] });

  const listingPage = /^\/mcps\/([a-z0-9][a-z0-9-]*)(?:\/)?$/.exec(pathname);
  if (listingPage) return route("listing-page", "server", { slug: listingPage[1] });

  const capabilityJson = /^\/api\/capabilities\/([a-z0-9][a-z0-9-]*)\.json$/.exec(pathname);
  if (capabilityJson) return route("capability-json", "capability", { capability: capabilityJson[1] });

  const capabilityMarkdown = /^\/capabilities\/([a-z0-9][a-z0-9-]*)\.md$/.exec(pathname);
  if (capabilityMarkdown) return route("capability-markdown", "capability", { capability: capabilityMarkdown[1] });

  const capabilityPage = /^\/capabilities\/([a-z0-9][a-z0-9-]*)(?:\/)?$/.exec(pathname);
  if (capabilityPage) return route("capability-page", "capability", { capability: capabilityPage[1] });

  const categoryPage = /^\/categories\/([a-z0-9][a-z0-9-]*)(?:\/)?$/.exec(pathname);
  if (categoryPage) return route("category-page", "category", { category: categoryPage[1] });

  if (pathname === "/go/martini" || pathname === "/go/martini/") return route("martini-handoff", "martini", { slug: "martini" });

  if (pathname.startsWith("/v0.1/")) return route("mcp-registry", "registry");
  if (pathname.startsWith("/api/mcp-registry")) return route("mcp-registry", "registry");
  if (pathname === "/api/registry.json" || pathname === "/api/registry.min.json") return route("registry-json", "registry");
  if (pathname === "/api/remotes.json") return route("remote-directory-json", "remote");
  if (pathname === "/api/client-profiles.json") return route("client-profiles-json", "clients");
  if (pathname === "/api/playbooks.json") return route("playbooks-json", "playbook");
  if (pathname === "/api/recommendations.json") return route("recommendations-json", "recommendation");
  if (pathname === "/api/capabilities.json") return route("capability-json", "capability");
  if (pathname === "/api/pulse.json") return route("pulse-json", "pulse");
  if (pathname === "/api/stats.json") return route("stats-json", "pulse");
  if (pathname.startsWith("/api/")) return route("api", "api");

  if (pathname === "/remotes/" || pathname === "/remotes") return route("remote-directory", "remote");
  if (pathname === "/remotes.md") return route("remote-directory-markdown", "remote");
  if (pathname === "/playbooks/" || pathname === "/playbooks") return route("playbooks-page", "playbook");
  if (pathname === "/playbooks.md") return route("playbooks-markdown", "playbook");
  if (pathname === "/recommendations/" || pathname === "/recommendations") return route("recommendations-page", "recommendation");
  if (pathname === "/recommendations.md") return route("recommendations-markdown", "recommendation");
  if (pathname === "/router/" || pathname === "/router") return route("router-page", "router");
  if (pathname === "/router.md") return route("router-markdown", "router");
  if (pathname === "/capabilities/" || pathname === "/capabilities") return route("capability-page", "capability");
  if (pathname === "/stack/" || pathname === "/stack") return route("stack-page", "stack");
  if (pathname === "/stack.md") return route("stack-markdown", "stack");
  if (pathname === "/clients/" || pathname === "/clients") return route("clients-page", "clients");
  if (pathname === "/clients.md") return route("clients-markdown", "clients");
  if (pathname === "/for-agents/" || pathname === "/for-agents") return route("agent-docs-page", "agent-docs");
  if (pathname === "/for-agents.md") return route("agent-docs-markdown", "agent-docs");
  if (pathname === "/pulse/" || pathname === "/pulse") return route("pulse-page", "pulse");
  if (pathname === "/pulse.md") return route("pulse-markdown", "pulse");
  if (pathname === "/about/" || pathname === "/about") return route("about-page", "about");
  if (pathname === "/submit/" || pathname === "/submit") return route("submit-page", "submit");

  if (pathname === "/llms.txt" || pathname === "/llms-full.txt") return route("llms", "llms");
  if (pathname.endsWith(".md")) return route("markdown", "markdown");
  if (pathname === "/feed.xml") return route("feed", "feed");
  if (pathname === "/sitemap.xml") return route("sitemap", "sitemap");
  if (pathname === "/robots.txt") return route("robots", "robots");
  if (pathname === "/mcp" || pathname === "/mcp/") return route("mcp-endpoint", "mcp-endpoint");
  if (pathname.startsWith("/.well-known/mcp/")) return route("mcp-discovery", "mcp-discovery");
  return route("page", "page");
}

function route(surface, group, extras = {}) {
  return {
    surface,
    group,
    slug: extras.slug || null,
    category: extras.category || null,
    capability: extras.capability || null,
  };
}

function classifyTraffic(pathname, userAgent, headers) {
  const surface = surfaceFor(pathname);
  for (const [family, pattern] of agentMatchers) {
    if (pattern.test(userAgent)) return { kind: "agent", family };
  }
  if (agentReadableSurfaces.has(surface) || surface.endsWith("-markdown")) {
    return { kind: "agent", family: surface };
  }
  if (crawlerPattern.test(userAgent)) return { kind: "crawler", family: "crawler" };
  if (browserPattern.test(userAgent) && headers.get("sec-fetch-dest")) {
    return { kind: "human_browser", family: "browser" };
  }
  return { kind: "unknown", family: null };
}

async function distinctIdFor(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  const userAgent = request.headers.get("user-agent") || "";
  const salt = env.ANALYTICS_SALT || "mcp.film";
  const hash = await sha256(`${salt}|${ip}|${userAgent}`);
  return `edge:${hash.slice(0, 32)}`;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isOwnHost(hostname, env) {
  if (!hostname) return false;
  const canonicalHost = String(env.CANONICAL_HOST || DEFAULT_CANONICAL_HOST || "mcp.film")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!canonicalHost || canonicalHost.startsWith("__mcpfilm_")) return false;
  const host = String(hostname).toLowerCase();
  return host === canonicalHost || host === `www.${canonicalHost}`;
}

function referrerDomain(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function compactHeader(value) {
  return value ? value.slice(0, 160) : null;
}

function cleanPlacement(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}
