# mcp-film

The [mcp.film](https://mcp.film) directory as an MCP server. Give your agent a
map of every MCP server worth knowing in AI filmmaking — searchable by
capability, with copy-paste install configs and a full-pipeline planner.

```sh
claude mcp add mcp-film -- npx -y mcp-film
```

Or connect the hosted endpoint — same tools, no local install:

```sh
claude mcp add --transport http mcp-film https://mcp.film/mcp
```

Speaks MCP 2025-11-25, 2025-06-18 and 2025-03-26 (an unknown offered version
gets the latest). `initialize` returns short `instructions`: start with
`recommend_film_mcps(brief)`.

## Tools

| Tool | What it does |
| --- | --- |
| `recommend_film_mcps` | Match a free-text brief to the best routes and first servers to connect. Hard constraints first (`constraints` object or phrases in the brief), then relevance; `confidence` says how well the brief matched |
| `search_film_mcps` | Tokenised, alias-aware search (`lipsync` = `lip-sync` = `lip sync`; `tts` = `text to speech`; `4k` = `upscale`); filter by category, capability, official, remote; paged |
| `get_film_mcp` | Full entry for one server: install, auth, tools, caveats, status |
| `list_film_categories` | All categories with pipeline stages and agent hints |
| `list_film_capabilities` | Capability tags (aliases folded in) ranked by server count; `min_count` 2 by default; paged |
| `get_film_capability` | Ranked server cluster for one tag; aliases resolve (`lipsync` → `lip-sync`, says `resolved_from`); paged |
| `get_install_config` | Copy-paste config or hosted remote URL for a client from `list_client_profiles`; a bad client returns `valid_clients` |
| `list_client_profiles` | Supported MCP client setup profiles and install-shape hints |
| `get_martini_setup` | Executable runbook for connecting a user to Martini (the sponsor): resumable state model, human steps, agent steps per client / shell / browser, quote-first generation contract, structured cost, when not to |
| `get_catalog_pulse` | Operating pulse: freshness, verification queue, curator agenda, machine surfaces. `demand_signals` and `martini_growth_checks` are curator/ops sections served only by name |
| `list_film_playbooks` | Curated production stack recipes for common AI filmmaking jobs; paged |
| `get_film_playbook` | Full playbook with primary servers, setup order, auth requirements, steps, constraints, fallbacks. Pass `client` (`claude_code`, `claude_desktop`, `cursor`) for only a copy-paste install of the whole stack |
| `list_film_recommendations` | Intent-routed MCP shortlists for common filmmaking jobs; paged |
| `get_film_recommendation` | Full recommendation with roles, reasons, fallbacks, and Martini handoff guidance |
| `plan_film_stack` | Recommended servers for every pipeline stage, biased by your brief (capabilities, taglines, descriptions) |
| `submit_listing` | Propose a new server: validated, deduped against the live registry, returned as a ready-to-file GitHub issue payload (a mcp.film maintainer verifies against primary sources before listing) |

## Response shapes

Every result is compact JSON in `content[0].text` and the same object in
`structuredContent`.

**Lists** (`search_film_mcps`, `get_film_capability`,
`list_film_capabilities`, `list_film_playbooks`, `list_film_recommendations`)
carry `count`, `total`, `limit`, `offset`, `next_offset` and `truncated`.
Nothing is cut silently: pass `offset: next_offset` for the next page.
Default `limit` is 20 (50 for capabilities), maximum 100.

**Compact server** (search results, capability clusters, stack picks):
`slug, url, verified, caveat, name, vendor, official, category, tagline,
pricing, remote, capabilities` plus `status` when the listing carries one.
`caveat` is the entry's `caveats[0]`, else the first sentence of its notes
that is not a verification log line. `get_film_mcp` is always the full entry.

**Recommendation pick** (`recommend_film_mcps`): `primary_servers[]` and the
alias `primary[]` hold `{slug, name, role, why, remote, official, verified,
status?, caveats?}`; `fallback_servers[]` hold `{slug, name, remote, official,
verified, status?}`. Pass `verbosity: "full"` for the complete server objects.
Each route has `match: {score, strength}`; the reply has `confidence`
(`strong` | `fair` | `weak`). When Martini is a primary pick or the brief asks
for production state, the route carries `martini_handoff` (prose) and
`martini_handoff_structured` (`when, not_when, first_calls, install {mcp, cli},
signup_url, setup_tool, tracked_url, disclosure`).

**Constraints** (`recommend_film_mcps`): `constraints: {local_only, no_upload,
hosted_only, has_shell, free_only, os}`, also inferred from phrases such as
"locally", "without uploading", "confidential", "offline", "no budget", "free
tools", "no local install". Violating picks are removed before scoring and
named in `excluded_by_constraints`; if nothing survives, the reply is
`no_match` with `unsatisfied_constraints` and `relevant_routes`.

**Whole-stack install** (`get_film_playbook` with `client`): `{id, title, url,
install_script, note}`. `install_script` is `{client, servers, script}` for
`claude_code` (one commented `claude mcp add` line per server) or `{client,
servers, file, config, note}` for `claude_desktop` / `cursor` (one merged
`mcpServers` object), plus `checklist[]` (`slug, name, auth, env_var?, where?`:
the keys, OAuth sign-ins and local apps the stack needs) and `skipped[]` (`slug,
name, reason, listing`). Primary and workflow servers only, never fallbacks.
Retired listings, listings with `install.generate: false`, and listings with no
mechanical install for that client are skipped with the reason, never guessed
at. It is the same block shown on `mcp.film/playbooks/{id}/` and in its `.md`.

**Status.** Listings with `status` `dead`, `archived` or `deprecated` are hidden
from search, recommendations and stack plans unless `include_inactive: true`.

**Zero results.** `search_film_mcps` returns `did_you_mean` (nearest
capabilities, categories, servers) and a `hint`; an unknown `category` or
`capability` is an error carrying `valid_categories` / `did_you_mean`.

## How it works

Zero dependencies. Fetches the live registry from
`https://mcp.film/api/registry.min.json` and production playbooks from
`https://mcp.film/api/playbooks.json`, plus recommendation routes from
`https://mcp.film/api/recommendations.json` and the operating pulse from
`https://mcp.film/api/pulse.json` (5s timeout each), then falls back to bundled
snapshots offline. Live data is cached for an hour and refreshed in the
background (`MCP_FILM_CACHE_TTL_MS`); `MCP_FILM_OFFLINE=1` serves the snapshots
only and `MCP_FILM_API_BASE` points the fetch at another host.
`get_catalog_pulse` reports `data_source` and `observed_at`. Data is curated and
re-verified continuously at
[github.com/c47-inc/mcp-film](https://github.com/c47-inc/mcp-film).

MIT.
