# Analytics runbook

mcp.film has two analytics layers:

- Browser events in `src/app.js` capture human UI behavior into PostHog:
  `mcpfilm_pageview`, `mcpfilm_search`, `mcpfilm_filter`,
  `mcpfilm_open_server`, `mcpfilm_open_playbook`,
  `mcpfilm_playbook_server`, `mcpfilm_open_recommendation`,
  `mcpfilm_recommendation_server`, `mcpfilm_open_capability`,
  `mcpfilm_capability_server`, `mcpfilm_server_view`,
  `mcpfilm_server_impression`, `mcpfilm_sponsor_impression`,
  `mcpfilm_brief_route`, `mcpfilm_rate`, `mcpfilm_feedback`,
  `mcpfilm_copy`, `mcpfilm_connect`, `mcpfilm_sponsor_click`, and
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

The generated Cloudflare worker redirects `www.mcp.film` to `mcp.film` while
recording the redirect request, keeping agent and human traffic on one
canonical host.

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
`mcp-film.pages.dev`, JSON APIs, recommendations, capabilities, markdown
playbooks, and common agent user agents with real `GET` requests. If the
spoofed-agent checks return `403`, the custom domain is blocking agent-like
traffic. Some Cloudflare blocks happen before the Pages worker and never reach
PostHog; others can happen after the worker and leave an optimistic
`mcpfilm_edge_request` status. Treat the monitor as the client-side truth and
the PostHog event as traffic observability.

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

Browser events include:

| Event | Fields |
| --- | --- |
| `mcpfilm_pageview` | `path`, `page` |
| `mcpfilm_search` | `query`, `results` |
| `mcpfilm_filter` | `category`, `quick`, `results` |
| `mcpfilm_server_view` | `slug`, `category`, `official`, `remote`, `featured`, `pricing`, `is_martini`, `path` |
| `mcpfilm_server_impression` | `slug`, `source_section`, `category`, `official`, `remote`, `is_martini`, `page`, `path` |
| `mcpfilm_open_server` | `slug`, `from`, optional `source_section`, `playbook`, `playbook_section`, `playbook_stage`, `recommendation` |
| `mcpfilm_open_playbook` | `playbook`, `from` |
| `mcpfilm_playbook_server` | `slug`, `playbook`, `section`, `stage` |
| `mcpfilm_open_recommendation` | `recommendation`, `from` |
| `mcpfilm_recommendation_server` | `slug`, `recommendation` |
| `mcpfilm_open_capability` | `capability`, `from` |
| `mcpfilm_capability_server` | `slug`, `capability` |
| `mcpfilm_brief_route` | `source`, `hosted_only`, `brief_len`, `brief_terms`, `top_recommendation`, `top_score`, `top_playbook`, `includes_martini`, `result_count` |
| `mcpfilm_copy` | `slug`, `kind`, `method`, `label`, `page`, `path`, `snippet` |
| `mcpfilm_connect` | `slug`, `method`, `label`, `page`, `path`, `snippet` |
| `mcpfilm_rate` | `slug`, `rating`, `rerate` |
| `mcpfilm_feedback` | `slug`, `text` |
| `mcpfilm_sponsor_impression` | `sponsor`, `placement`, `to`, `page`, `path`, optional `source_slug`, `label` |
| `mcpfilm_sponsor_click` | `sponsor`, `placement`, `to`, `from`, `page`, optional `source_slug`, `label` |
| `mcpfilm_outbound` | `to`, `from` |

`mcpfilm_edge_request` includes:

| Field | Meaning |
| --- | --- |
| `path` | URL path without query values. |
| `query_keys` | Query parameter names only, not values. |
| `surface` | Specific route surface, e.g. `listing-page`, `listing-json`, `capability-page`, `capability-json`, `capability-markdown`, `recommendations-json`, `playbooks-json`, `remote-directory-json`, `registry-json`, `mcp-registry`, `llms`, `feed`, `sitemap`, `robots`, or `mcp-discovery`. |
| `route_group` | Higher-level family: `server`, `capability`, `recommendation`, `playbook`, `remote`, `registry`, `category`, `llms`, `pulse`, and similar. |
| `slug`, `category`, `capability` | Parsed route identifiers when the path is about one server, category, or capability. |
| `is_martini` | `true` for Martini listing/JSON/markdown traffic. |
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

Capability traffic:

```sql
SELECT
  properties.capability AS capability,
  properties.surface AS surface,
  count() AS requests,
  count(DISTINCT distinct_id) AS approx_clients
FROM events
WHERE event = 'mcpfilm_edge_request'
  AND properties.route_group = 'capability'
  AND timestamp > now() - interval 30 day
GROUP BY capability, surface
ORDER BY requests DESC
LIMIT 50
```

Martini listing reads from humans and agents:

```sql
SELECT
  properties.traffic_kind AS traffic_kind,
  properties.surface AS surface,
  count() AS requests,
  count(DISTINCT distinct_id) AS approx_clients
FROM events
WHERE event = 'mcpfilm_edge_request'
  AND properties.is_martini = true
  AND timestamp > now() - interval 30 day
GROUP BY traffic_kind, surface
ORDER BY requests DESC
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

Playbook-driven server interest:

```sql
SELECT
  properties.playbook AS playbook,
  properties.slug AS slug,
  count() AS clicks
FROM events
WHERE event = 'mcpfilm_playbook_server'
  AND timestamp > now() - interval 30 day
GROUP BY playbook, slug
ORDER BY clicks DESC
LIMIT 50
```

Server discovery sources:

```sql
SELECT
  properties.source_section AS source_section,
  properties.slug AS slug,
  count() AS clicks,
  count(DISTINCT distinct_id) AS users
FROM events
WHERE event = 'mcpfilm_open_server'
  AND timestamp > now() - interval 30 day
GROUP BY source_section, slug
ORDER BY clicks DESC
LIMIT 50
```

Server impressions by source:

```sql
SELECT
  properties.source_section AS source_section,
  properties.slug AS slug,
  count() AS impressions,
  count(DISTINCT distinct_id) AS users
FROM events
WHERE event = 'mcpfilm_server_impression'
  AND timestamp > now() - interval 30 day
GROUP BY source_section, slug
ORDER BY impressions DESC
LIMIT 50
```

Server detail views:

```sql
SELECT
  properties.slug AS slug,
  properties.category AS category,
  count() AS views,
  count(DISTINCT distinct_id) AS users
FROM events
WHERE event = 'mcpfilm_server_view'
  AND timestamp > now() - interval 30 day
GROUP BY slug, category
ORDER BY views DESC
LIMIT 50
```

Connect intent by server and method:

```sql
SELECT
  properties.slug AS slug,
  properties.method AS method,
  count() AS copies,
  count(DISTINCT distinct_id) AS users
FROM events
WHERE event = 'mcpfilm_connect'
  AND timestamp > now() - interval 30 day
GROUP BY slug, method
ORDER BY copies DESC
LIMIT 50
```

Brief-router demand:

```sql
SELECT
  properties.top_recommendation AS route,
  properties.top_playbook AS playbook,
  properties.hosted_only AS hosted_only,
  properties.includes_martini AS includes_martini,
  count() AS routed_briefs,
  count(DISTINCT distinct_id) AS users
FROM events
WHERE event = 'mcpfilm_brief_route'
  AND timestamp > now() - interval 30 day
GROUP BY route, playbook, hosted_only, includes_martini
ORDER BY routed_briefs DESC
LIMIT 50
```

Martini sponsor traffic:

```sql
SELECT
  properties.placement AS placement,
  properties.source_slug AS source_slug,
  properties.to AS destination,
  countIf(event = 'mcpfilm_sponsor_impression') AS impressions,
  countIf(event = 'mcpfilm_sponsor_click') AS clicks,
  count(DISTINCT distinct_id) AS users
FROM events
WHERE event IN ('mcpfilm_sponsor_impression', 'mcpfilm_sponsor_click')
  AND properties.sponsor = 'martini'
  AND timestamp > now() - interval 30 day
GROUP BY placement, source_slug, destination
ORDER BY impressions DESC, clicks DESC
LIMIT 50
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
