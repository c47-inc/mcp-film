# Analytics runbook

mcp.film has two analytics layers:

- Browser events in `src/app.js` capture human UI behavior into PostHog:
  `mcpfilm_pageview`, `mcpfilm_search`, `mcpfilm_open_server`,
  `mcpfilm_rate`, `mcpfilm_feedback`, `mcpfilm_copy`, and
  `mcpfilm_outbound`.
- Cloudflare edge events from generated `dist/_worker.js` capture request
  traffic that JavaScript cannot see: agents fetching `/llms.txt`, markdown,
  JSON API routes, feeds, and MCP discovery. The event is
  `mcpfilm_edge_request`.

GitHub Pages does not expose request logs to the site, so it cannot measure
agent traffic reliably. Use Cloudflare Pages when agent traffic matters.

## Cloudflare Pages setup

Create a Cloudflare Pages project from `c47-inc/mcp-film`:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `node build.mjs` |
| Build output directory | `dist` |
| Root directory | `/` |
| Wrangler config | `wrangler.toml` |

Then add `mcp.film` as a custom domain on the Pages project and move DNS to
Cloudflare if it is not already there. Cloudflare Pages will run the generated
`_worker.js` before serving static assets.

For the apex domain, delete any old GitHub Pages `A`/`AAAA` records for
`mcp.film` and the old `www → c47-inc.github.io` CNAME, then create proxied
`CNAME` records:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| `CNAME` | `@` | `mcp-film.pages.dev` | Proxied |
| `CNAME` | `www` | `mcp-film.pages.dev` | Proxied |

If the project was created by `wrangler pages project create`, it is a direct
upload project and will not automatically build from GitHub. Add
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub Actions secrets so
`.github/workflows/deploy.yml` can deploy `dist/` to Cloudflare after every
push to `main`. When either secret is missing, the workflow still deploys the
GitHub Pages fallback and opens/updates an `automation-failure` issue titled
`Cloudflare deploy paused: missing repo secrets`.

## Agent access through Cloudflare security

Cloudflare can block suspicious or spoofed crawler user agents at the zone
before the Pages worker runs. That means the request will be invisible to
PostHog and the agent will not receive `/llms.txt`. Add a narrow WAF custom
rule for machine-readable surfaces only:

```txt
http.host in {"mcp.film" "www.mcp.film"} and (
  starts_with(http.request.uri.path, "/api/") or
  starts_with(http.request.uri.path, "/v0.1/") or
  starts_with(http.request.uri.path, "/.well-known/mcp/") or
  ends_with(http.request.uri.path, ".md") or
  http.request.uri.path in {
    "/llms.txt"
    "/llms-full.txt"
    "/feed.xml"
    "/robots.txt"
    "/sitemap.xml"
  }
)
```

Use action **Skip** when available and skip Bot Fight Mode / Super Bot Fight
Mode, Browser Integrity Check, managed WAF rules, and remaining custom rules.
If the plan only exposes **Allow**, use it with the exact expression above.
Do not globally allow all crawlers.

Smoke test:

```sh
curl -I https://mcp.film/llms.txt
curl -fsS -A 'ClaudeBot-mcpfilm-smoke/1.0' -o /dev/null -w '%{http_code}\n' https://mcp.film/llms.txt
node scripts/monitor-production.mjs
```

The curl commands should return `200`; the Node monitor also checks `www`,
`mcp-film.pages.dev`, JSON APIs, markdown playbooks, and common agent user
agents with real `GET` requests. If the spoofed-agent checks return `403`, the
custom domain is blocking agent-like traffic. Some Cloudflare blocks happen
before the Pages worker and never reach PostHog; others can happen after the
worker and leave an optimistic `mcpfilm_edge_request` status. Treat the monitor
as the client-side truth and the PostHog event as traffic observability.

## Cloudflare variables

The worker can run with the public PostHog project token already embedded from
`data/site.json`. For cleaner long-term operations, set these Pages variables:

| Variable | Type | Notes |
| --- | --- | --- |
| `POSTHOG_KEY` | plain text | Same project token as `data/site.json.analytics.posthog_key`; optional fallback override. |
| `POSTHOG_HOST` | plain text | `https://us.i.posthog.com` unless the PostHog project moves. |
| `ANALYTICS_SALT` | secret | Recommended. Used only to hash IP + user-agent into a stable pseudonymous `distinct_id`; raw IP is never sent to PostHog. |
| `ANALYTICS_DEBUG_UA` | plain text | Optional `true` while debugging classification; otherwise the worker does not send full user-agent strings. |

## Event fields

`mcpfilm_edge_request` includes:

| Field | Meaning |
| --- | --- |
| `path` | URL path without query values. |
| `query_keys` | Query parameter names only, not values. |
| `surface` | `page`, `listing-page`, `category-page`, `api`, `remote-directory`, `remote-directory-json`, `remote-directory-markdown`, `mcp-registry`, `llms`, `markdown`, `feed`, `sitemap`, `robots`, or `mcp-discovery`. |
| `traffic_kind` | `human_browser`, `agent`, `crawler`, or `unknown`. |
| `agent_family` | Best-effort family such as `chatgpt`, `claude`, `perplexity`, `mcp-client`, `developer-agent`, `script`, or the agent-readable surface name. |
| `status` | HTTP status returned by the static asset layer. |
| `country`, `colo`, `asn` | Coarse Cloudflare request metadata. |

## HogQL snippets

Pinned PostHog dashboard:
[`mcp.film Agent Traffic`](https://us.posthog.com/project/292112/dashboard/1772277).

Total request traffic, non-asset paths:

```sql
SELECT
  toDate(timestamp) AS day,
  count() AS requests
FROM events
WHERE event = 'mcpfilm_edge_request'
  AND timestamp > now() - interval 30 day
GROUP BY day
ORDER BY day ASC
```

Agent traffic by family and surface:

```sql
SELECT
  properties.agent_family AS agent_family,
  properties.surface AS surface,
  count() AS requests,
  count(DISTINCT distinct_id) AS approx_clients
FROM events
WHERE event = 'mcpfilm_edge_request'
  AND properties.traffic_kind = 'agent'
  AND timestamp > now() - interval 30 day
GROUP BY agent_family, surface
ORDER BY requests DESC
```

Most-requested agent-readable URLs:

```sql
SELECT
  properties.path AS path,
  properties.surface AS surface,
  count() AS requests
FROM events
WHERE event = 'mcpfilm_edge_request'
  AND properties.traffic_kind = 'agent'
  AND timestamp > now() - interval 30 day
GROUP BY path, surface
ORDER BY requests DESC
LIMIT 50
```

Human pageviews from browser JavaScript:

```sql
SELECT
  toDate(timestamp) AS day,
  count() AS pageviews,
  count(DISTINCT distinct_id) AS visitors
FROM events
WHERE event = 'mcpfilm_pageview'
  AND timestamp > now() - interval 30 day
GROUP BY day
ORDER BY day ASC
```

Human-vs-agent split from the edge:

```sql
SELECT
  properties.traffic_kind AS traffic_kind,
  count() AS requests,
  count(DISTINCT distinct_id) AS approx_clients
FROM events
WHERE event = 'mcpfilm_edge_request'
  AND timestamp > now() - interval 30 day
GROUP BY traffic_kind
ORDER BY requests DESC
```

## Caveats

Agent detection is necessarily best-effort. Some agents use generic browser or
script user agents, and some search crawlers fetch `llms.txt`. Treat
`traffic_kind = agent` as "likely agent or agent-readable surface traffic," not
as an identity claim.

GitHub Pages can remain enabled as a fallback deploy target, but only the
Cloudflare Pages deployment runs the edge worker.

Cloudflare security products can still transform or block a response after the
Pages worker has served it. In that case PostHog may record the worker response
status while the client receives a `403`. Keep the production monitor green if
agent access matters; it checks what clients actually receive.
