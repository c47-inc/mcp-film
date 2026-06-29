#!/usr/bin/env node
// Synthetic production checks for the parts humans do not see in a browser.

const stamp = new Date().toISOString();
const smoke = encodeURIComponent(stamp.replace(/[-:.TZ]/g, "").slice(0, 14));
const base = process.env.MCPFILM_MONITOR_BASE || "https://mcp.film";
const wwwBase = process.env.MCPFILM_MONITOR_WWW || "https://www.mcp.film";
const pagesBase = process.env.MCPFILM_MONITOR_PAGES || "https://mcp-film.pages.dev";
const posthogProject = process.env.POSTHOG_PROJECT_ID || "292112";
const posthogHost = process.env.POSTHOG_HOST || "https://us.posthog.com";
const posthogKey = process.env.POSTHOG_API_KEY || "";

const agentUserAgents = [
  ["Claude", "ClaudeBot-mcpfilm-smoke/1.0"],
  ["ChatGPT", "ChatGPT-User-mcpfilm-smoke/1.0"],
  ["GPTBot", "GPTBot-mcpfilm-smoke/1.0"],
  ["OpenAI Search", "OpenAI-SearchBot-mcpfilm-smoke/1.0"],
  ["Perplexity", "PerplexityBot-mcpfilm-smoke/1.0"],
];

const checks = [
  {
    name: "Apex home",
    url: `${base}/`,
    method: "HEAD",
    expect: (status) => status === 200,
  },
  {
    name: "WWW home",
    url: `${wwwBase}/`,
    method: "HEAD",
    expect: (status) => status >= 200 && status < 400,
  },
  {
    name: "Registry API",
    url: `${base}/api/registry.min.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => Array.isArray(body.servers) && body.servers.length > 0,
  },
  {
    name: "Playbooks API",
    url: `${base}/api/playbooks.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => body.count >= 1 && Array.isArray(body.playbooks),
  },
  {
    name: "Recommendations API",
    url: `${base}/api/recommendations.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => body.count >= 1 && Array.isArray(body.recommendations),
  },
  {
    name: "Capabilities API",
    url: `${base}/api/capabilities.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => body.count >= 1 && body.published_pages >= 1 && Array.isArray(body.capabilities),
  },
  {
    name: "Text-to-video capability API",
    url: `${base}/api/capabilities/text-to-video.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => body.capability === "text-to-video" && body.count >= 1 && body.servers?.[0]?.slug === "martini",
  },
  {
    name: "Text-to-video capability page",
    url: `${base}/capabilities/text-to-video/?monitor=${smoke}`,
    method: "HEAD",
    expect: (status) => status === 200,
  },
  {
    name: "Remotes page",
    url: `${base}/remotes/?monitor=${smoke}`,
    method: "HEAD",
    expect: (status) => status === 200,
  },
  {
    name: "Remotes API",
    url: `${base}/api/remotes.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => body.count >= 1 && Array.isArray(body.remotes),
  },
  {
    name: "MCP Registry API",
    url: `${base}/v0.1/servers?limit=5&monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => Array.isArray(body.servers) && body.servers.length > 0 && body.metadata?.count >= 1,
  },
  {
    name: "WWW playbooks API",
    url: `${wwwBase}/api/playbooks.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200 || status === 301 || status === 308,
    validateJson: (body) => body.count >= 1 && Array.isArray(body.playbooks),
  },
  {
    name: "WWW remotes API",
    url: `${wwwBase}/api/remotes.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200 || status === 301 || status === 308,
    validateJson: (body) => body.count >= 1 && Array.isArray(body.remotes),
  },
  {
    name: "Pages fallback API",
    url: `${pagesBase}/api/playbooks.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => body.count >= 1 && Array.isArray(body.playbooks),
  },
  {
    name: "Pages fallback capabilities API",
    url: `${pagesBase}/api/capabilities.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => body.count >= 1 && body.published_pages >= 1 && Array.isArray(body.capabilities),
  },
  {
    name: "Pages fallback remotes API",
    url: `${pagesBase}/api/remotes.json?monitor=${smoke}`,
    method: "GET",
    accept: "application/json",
    expect: (status) => status === 200,
    validateJson: (body) => body.count >= 1 && Array.isArray(body.remotes),
  },
];

for (const path of [
  "/llms.txt",
  "/api/playbooks.json",
  "/api/recommendations.json",
  "/api/capabilities.json",
  "/api/capabilities/text-to-video.json",
  "/api/remotes.json",
  "/v0.1/servers",
  "/playbooks.md",
  "/recommendations.md",
  "/capabilities/text-to-video.md",
  "/remotes.md",
]) {
  for (const [family, userAgent] of agentUserAgents) {
    checks.push({
      name: `${family} access ${path}`,
      url: `${base}${path}?monitor=${smoke}`,
      method: "GET",
      userAgent,
      accept: path.endsWith(".json") ? "application/json" : "text/plain",
      expect: (status) => status === 200,
      wafSensitive: true,
    });
  }
}

const rows = [];

for (const check of checks) {
  rows.push(await runHttpCheck(check));
}

rows.push(await runPosthogCheck());

const failures = rows.filter((row) => row.result === "FAIL");
const warnings = rows.filter((row) => row.result === "WARN");

console.log(`# mcp.film production monitor`);
console.log("");
console.log(`Generated: ${stamp}`);
console.log("");
console.log("| Check | Result | Status | Details |");
console.log("| --- | --- | --- | --- |");
for (const row of rows) {
  console.log(`| ${cell(row.name)} | ${row.result} | ${cell(row.status)} | ${cell(row.detail)} |`);
}
console.log("");

if (failures.some((row) => row.wafSensitive)) {
  console.log("Agent-readable routes are being blocked by Cloudflare security before the client receives them.");
  console.log("Depending on the Cloudflare product, some blocked probes may be invisible to PostHog, while others may be recorded with the Pages worker's pre-block status.");
  console.log("Add the narrow WAF Skip/Allow rule documented in docs/SETUP.md and docs/ANALYTICS.md.");
  console.log("");
}

if (warnings.length) {
  console.log(`Warnings: ${warnings.length}.`);
}

if (failures.length) {
  console.log(`Failures: ${failures.length}.`);
  process.exit(1);
}

console.log("All required production checks passed.");

async function runHttpCheck(check) {
  const headers = {
    "user-agent": check.userAgent || "mcpfilm-production-monitor/1.0",
    accept: check.accept || "*/*",
  };

  const started = Date.now();
  try {
    const res = await fetch(check.url, {
      method: check.method,
      headers,
      redirect: "manual",
    });
    const ms = Date.now() - started;
    let detail = `${ms}ms`;

    if (res.headers.get("server")) detail += `, server=${res.headers.get("server")}`;
    if (res.headers.get("cf-ray")) detail += `, cf-ray=${res.headers.get("cf-ray")}`;
    if (res.headers.get("location")) detail += `, location=${res.headers.get("location")}`;

    let ok = check.expect(res.status);
    if (ok && check.validateJson && res.status >= 200 && res.status < 300) {
      try {
        const body = await res.json();
        ok = Boolean(check.validateJson(body));
        detail += ok ? ", JSON valid" : ", JSON shape invalid";
      } catch (error) {
        ok = false;
        detail += `, JSON parse failed: ${error.message}`;
      }
    } else if (ok && check.validateJson) {
      detail += ", redirect accepted without JSON parse";
    }

    if (!ok && check.wafSensitive && res.status === 403) {
      detail += ", likely Cloudflare WAF/Bot block";
    }

    return {
      name: check.name,
      result: ok ? "PASS" : "FAIL",
      status: String(res.status),
      detail,
      wafSensitive: check.wafSensitive,
    };
  } catch (error) {
    return {
      name: check.name,
      result: "FAIL",
      status: "network",
      detail: error.message,
      wafSensitive: check.wafSensitive,
    };
  }
}

async function runPosthogCheck() {
  if (!posthogKey) {
    return {
      name: "PostHog edge ingestion",
      result: "WARN",
      status: "skipped",
      detail: "POSTHOG_API_KEY is not configured for this monitor",
    };
  }

  const query = `
    SELECT count() AS events
    FROM events
    WHERE event = 'mcpfilm_edge_request'
      AND timestamp >= now() - INTERVAL 30 MINUTE
  `;

  try {
    const res = await fetch(`${posthogHost}/api/projects/${posthogProject}/query/`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${posthogKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    const body = await res.json();
    const count = Number(body.results?.[0]?.[0] ?? body.results?.[0]?.events ?? 0);
    return {
      name: "PostHog edge ingestion",
      result: count > 0 ? "PASS" : "WARN",
      status: String(res.status),
      detail: `${count} mcpfilm_edge_request events in the last 30 minutes`,
    };
  } catch (error) {
    return {
      name: "PostHog edge ingestion",
      result: "WARN",
      status: "query",
      detail: error.message,
    };
  }
}

function cell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}
