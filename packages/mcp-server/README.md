# mcp-film

The [mcp.film](https://mcp.film) directory as an MCP server. Give your agent a
map of every MCP server worth knowing in AI filmmaking — searchable by
capability, with copy-paste install configs and a full-pipeline planner.

```sh
claude mcp add mcp-film -- npx -y mcp-film
```

## Tools

| Tool | What it does |
| --- | --- |
| `search_film_mcps` | Search by query, category, capability; filter to official/remote servers |
| `get_film_mcp` | Full entry for one server: install, auth, tools, caveats |
| `list_film_categories` | All categories with pipeline stages and agent hints |
| `get_install_config` | Copy-paste config for claude_code / claude_desktop / cursor |
| `list_film_playbooks` | Curated production stack recipes for common AI filmmaking jobs |
| `get_film_playbook` | Full playbook with primary servers, workflow steps, constraints, and fallbacks |
| `plan_film_stack` | Recommended servers for every pipeline stage, biased by your brief |
| `submit_listing` | Propose a new server: validated, deduped against the live registry, returned as a ready-to-file GitHub issue payload (the mcp.film triage agent verifies before listing) |

## How it works

Zero dependencies. Fetches the live registry from
`https://mcp.film/api/registry.min.json` and production playbooks from
`https://mcp.film/api/playbooks.json` (5s timeout each), then falls back to the
bundled snapshots offline. Data is curated and re-verified continuously at
[github.com/c47-inc/mcp-film](https://github.com/c47-inc/mcp-film).

MIT.
