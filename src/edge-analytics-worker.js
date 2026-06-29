// Cloudflare Pages advanced-mode worker for server-side traffic analytics.
// Build replaces the __MCPFILM_*__ placeholders with data/site.json values.

const DEFAULT_POSTHOG_KEY = "__MCPFILM_POSTHOG_KEY__";
const DEFAULT_POSTHOG_HOST = "__MCPFILM_POSTHOG_HOST__";

const staticAssetPattern = /\.(?:avif|css|gif|ico|jpeg|jpg|js|json\.map|map|png|svg|webp|woff2?)$/i;

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

export default {
  async fetch(request, env, ctx) {
    const response = await registryApiResponse(request, env) || await env.ASSETS.fetch(assetRequestFor(request));
    ctx.waitUntil(captureRequest(request, response, env));
    return response;
  },
};

async function registryApiResponse(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/v0.1/servers") {
    return jsonAssetResponse(env, url, "/api/mcp-registry.json");
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

async function captureRequest(request, response, env) {
  try {
    if (!shouldCapture(request)) return;

    const url = new URL(request.url);
    const key = env.POSTHOG_KEY || DEFAULT_POSTHOG_KEY;
    const host = env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST || "https://us.i.posthog.com";
    if (!key || key.startsWith("__MCPFILM_")) return;

    const userAgent = request.headers.get("user-agent") || "";
    const classification = classifyTraffic(url.pathname, userAgent, request.headers);
    const distinctId = await distinctIdFor(request, env);

    const properties = {
      path: url.pathname,
      query_keys: [...url.searchParams.keys()].sort().join(",") || null,
      method: request.method,
      status: response.status,
      surface: surfaceFor(url.pathname),
      traffic_kind: classification.kind,
      agent_family: classification.family,
      referrer_domain: referrerDomain(request.headers.get("referer")),
      accept: compactHeader(request.headers.get("accept")),
      content_type: compactHeader(response.headers.get("content-type")),
      country: request.cf?.country || null,
      colo: request.cf?.colo || null,
      asn: request.cf?.asn || null,
      host: url.hostname,
      "$current_url": url.origin + url.pathname,
      "$geoip_disable": true,
      "$process_person_profile": false,
    };

    if (env.ANALYTICS_DEBUG_UA === "true") properties.user_agent = userAgent.slice(0, 240);

    await fetch(new URL("/i/v0/e/", host).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event: "mcpfilm_edge_request",
        distinct_id: distinctId,
        properties,
      }),
    });
  } catch {
    // Analytics must never affect the site response.
  }
}

function shouldCapture(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/assets/")) return false;
  if (staticAssetPattern.test(url.pathname)) return false;
  return true;
}

function surfaceFor(pathname) {
  if (pathname.startsWith("/v0.1/")) return "mcp-registry";
  if (pathname.startsWith("/api/")) return "api";
  if (pathname === "/llms.txt" || pathname === "/llms-full.txt") return "llms";
  if (pathname.endsWith(".md")) return "markdown";
  if (pathname === "/feed.xml") return "feed";
  if (pathname === "/sitemap.xml") return "sitemap";
  if (pathname === "/robots.txt") return "robots";
  if (pathname.startsWith("/.well-known/mcp/")) return "mcp-discovery";
  if (pathname.startsWith("/mcps/")) return "listing-page";
  if (pathname.startsWith("/categories/")) return "category-page";
  return "page";
}

function classifyTraffic(pathname, userAgent, headers) {
  const surface = surfaceFor(pathname);
  for (const [family, pattern] of agentMatchers) {
    if (pattern.test(userAgent)) return { kind: "agent", family };
  }
  if (["api", "llms", "markdown", "feed", "mcp-discovery", "mcp-registry"].includes(surface)) {
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
