# mcp.film

**The MCP directory for AI filmmaking.** Every tool your agent needs to make a
film — video models, voices, scores, edit bays, finishing suites, and the pipes
to ship it. Curated, verified, agent-first, and self-updating.

🎬 **Live site:** [mcp.film](https://mcp.film) ·
🤖 **For agents:** [`/llms.txt`](https://mcp.film/llms.txt) · [`/api/registry.json`](https://mcp.film/api/registry.json) ·
`claude mcp add mcp-film -- npx -y mcp-film`

---

## What this is

A directory of verified Model Context Protocol servers across the full film
pipeline — from screenplay breakdown to YouTube upload — each entry annotated
with exact install commands, auth requirements, pricing, sample tools, and the
caveats that actually bite ("requires Resolve *Studio*", "Suno has no official
API", "uploads cost 1,600 quota units").

It is built **agents-first**:

| Surface | URL |
| --- | --- |
| llms.txt index ([spec](https://llmstxt.org)) | `/llms.txt` · `/llms-full.txt` |
| Full structured registry | `/api/registry.json` (+ `.min.json`) |
| MCP Registry-compatible API | `/v0.1/servers` · `/api/mcp-registry.json` |
| Catalog freshness / ops pulse | `/api/pulse.json` · `/pulse.md` |
| Production playbooks | `/api/playbooks.json` · `/playbooks.md` |
| Agent recommendations | `/api/recommendations.json` · `/recommendations.md` |
| Capability index | `/api/capabilities.json` · `/capabilities/{tag}.md` |
| Client setup profiles | `/clients/` · `/clients.md` · `/api/client-profiles.json` |
| One server, JSON / markdown | `/api/mcps/{slug}.json` · `/mcps/{slug}.md` |
| Pipeline guide | `/stack/` · `/stack.md` |
| New servers feed | `/feed.xml` |
| The directory **as an MCP server** | `npx -y mcp-film` (`packages/mcp-server/`) |
| JSON-LD (`SoftwareApplication`, `ItemList`) | embedded in every page, server-rendered |

## How it runs itself

```
              ┌────────────────────────────────────────────────┐
              │                data/ (the product)              │
              └───────▲──────────────▲──────────────▲──────────┘
   daily: verifies    │              │              │   per-issue: verifies
   links, hunts new   │              │              │   community submissions
   servers            │              │              │
        ┌─────────────┴──┐   ┌───────┴───────┐   ┌──┴────────────┐
        │ curator.yml    │   │ pulse.yml     │   │ inbox.yml     │
        │ (Claude agent) │   │ ratings/      │   │ (Claude agent)│
        └─────────────┬──┘   │ feedback from │   └──┬────────────┘
                      │      │ PostHog       │      │
                      │      └───────┬───────┘      │
                      ▼              ▼              ▼
              PRs labeled `auto-data` ──► auto-merge.yml
              (merges ONLY if every changed file is in data/
               and validation passes) ──► deploy.yml ──► Cloudflare Pages
                                                     └──► GitHub Pages fallback
```

Community ratings and feedback are captured on-page as PostHog events and
folded back into the rankings weekly. Every change is a commit — the entire
editorial history is auditable.

Agent-readable traffic is measured at the edge when deployed on Cloudflare
Pages: the build emits a `_worker.js` that logs `mcpfilm_edge_request` events
for `/llms.txt`, markdown, JSON API routes, feeds, and MCP discovery. Browser
pageviews still use the lightweight PostHog client event. See
[`docs/ANALYTICS.md`](docs/ANALYTICS.md).

The live catalog pulse is published at [`/api/pulse.json`](https://mcp.film/api/pulse.json)
and [`/pulse.md`](https://mcp.film/pulse.md): newest additions, stale
verification queue, category coverage, and machine-surface links for agents.
Client setup profiles live at [`/api/client-profiles.json`](https://mcp.film/api/client-profiles.json)
and [`/clients.md`](https://mcp.film/clients.md): conservative setup guidance
for Claude Code, Claude Desktop, Cursor, hosted remote clients, and the
directory's own meta-MCP server.

Production playbooks live at [`/api/playbooks.json`](https://mcp.film/api/playbooks.json)
and [`/playbooks.md`](https://mcp.film/playbooks.md): concrete stack recipes
with setup order, auth gates, failure modes, and earned Martini handoffs for
commercial sprints, local edit bays, character series, archive cutdowns, and
open-source labs.

## Develop locally

Zero dependencies — Node 20+ is the whole toolchain:

```sh
node build.mjs --validate-only   # check the data
node build.mjs                   # build → dist/ (HTML, APIs, feeds, agent surfaces)
node scripts/serve.mjs           # preview at http://localhost:4173
```

Repo map: `data/` is the content, `build.mjs` + `src/` the generator,
`packages/mcp-server/` the `npx mcp-film` meta-server, `.github/workflows/`
the autonomy loop, [`AGENTS.md`](AGENTS.md) the operating manual (for agents
and humans alike), [`docs/SETUP.md`](docs/SETUP.md) the one-time launch
checklist, and [`docs/AGENT_STRATEGY.md`](docs/AGENT_STRATEGY.md) the north-star
for making the site useful to agents while sending qualified production intent
to Martini.

## Adding a server

See [CONTRIBUTING.md](CONTRIBUTING.md) — easiest path is the
[submission form](../../issues/new?template=submit-mcp.yml); a triage agent
verifies and merges what checks out.

## Who's behind it

Maintained by the team behind [Martini](https://www.martini.film), the film set
for AI videos — whose MCP server is the featured listing, clearly disclosed.
Everything else is ranked on merit: the directory is a community service and
its only asset is trust. MIT licensed.
