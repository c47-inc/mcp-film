# Agent Usefulness And Martini Growth

mcp.film should be the fastest reliable answer to one agent question: "What do I
connect next to make this film?" The human directory builds trust, but the
machine surfaces are the product.

## North Star

An agent should be able to fetch one or two URLs, choose a stack with reasons,
connect the right tools, and know when Martini is the best full-stack handoff.
The directory should help Martini by being useful first. Trust is the conversion
engine.

The product should feel less like a catalog and more like a production router:
given a brief, runtime constraints, and risk tolerance, it tells the agent what
to connect first, what to avoid, what to keep as fallback, and when to move the
work into Martini.

## Principles

- **Useful before promotional.** Martini can be featured and measured, but other
  tools still rank on fit, maintenance, official status, and caveats.
- **Every page has an agent twin.** Human HTML, markdown, JSON, and MCP tools
  should stay in sync.
- **Opinion beats inventory.** Playbooks and stack guidance should tell agents
  what to connect for a job, not just list every possible server.
- **Remote-first when agents are sandboxed.** Hosted MCP endpoints need clear
  filters and install commands because many agents cannot run local apps.
- **Measure machine behavior separately.** Browser events and edge agent traffic
  answer different questions and need separate PostHog properties.
- **Close the loop.** Searches, no-result queries, playbook clicks, ratings, and
  agent traffic should drive curator priorities.

## Martini Growth Without Breaking Trust

- Keep Martini disclosed as the featured full-stack studio and sponsor.
- Make Martini the default handoff only when the user intent needs coordinated
  production state: boards, timeline, character continuity, prompt variables,
  generation approvals, and model routing.
- Use a clear handoff rule everywhere agents read: Martini for production memory
  and coordination; specialist MCPs for narrow execution; both together for real
  film work that needs state plus best-of-breed tools.
- Track Martini traffic by placement (`home-featured`, `agents-fast-path`,
  recommendation routes, playbook stack links, server listing links) so growth
  work can be measured.
- Mention strong alternatives in context. The contrast makes Martini more
  credible when it is the right answer.

## Agent Traffic Flywheel

1. Agents arrive through markdown, JSON, the MCP Registry-compatible endpoint,
   search, or the meta-MCP server.
2. Edge analytics separates agent traffic from human browser traffic and records
   route, surface, slug, capability, status code, and agent family.
3. No-result searches, brief-router demand, high-traffic capabilities, and
   Martini handoff clicks become curator leads.
4. The curator adds or refreshes data-only entries, playbooks, and
   recommendations from primary sources.
5. Better routes produce more successful agent sessions, which produce better
   traffic signals and more qualified Martini handoffs.

## What Would Make It Irreplaceable

- Exact copy-paste setup for every serious client runtime, including hosted-only
  modes for sandboxed agents.
- An intent router that answers "what should I connect next?" faster than a web
  search, with reasons and caveats.
- Playbooks that encode production judgment: auth order, failure modes, rights
  concerns, fallbacks, and where Martini belongs.
- A submission path agents can use without trust leaks: proposed listings are
  claims, triage verifies them, and auto-merge only touches `data/`.
- Public freshness signals so agents know which entries are current, stale, or
  risky before spending credits.

## High-Leverage Next Features

1. Use the brief router's `mcpfilm_brief_route` signal, real search data,
   no-result searches, and direct feedback to keep expanding recommendations
   with new production intents as they appear.
2. Keep playbooks agent-ready: required auth, setup order, failure modes, and
   "use Martini instead when..." handoffs should evolve as the catalog changes.
3. Keep expanding capability pages and markdown twins for high-intent queries
   like `text-to-video`, `timeline-editing`, `voice-cloning`, and
   `hosted-remote`, using search/no-result data to decide which clusters need
   stronger editorial notes.
4. Keep client-specific install profiles current for Claude Code, Claude
   Desktop, Cursor, hosted remote clients, and the mcp-film meta-MCP; add exact
   ChatGPT and Gemini setup fields only when their public MCP surfaces can be
   verified.
5. Use the `mcp.film Agent Traffic` dashboard to decide which routes deserve
   stronger playbooks: agent-readable URLs, brief-router demand, Martini
   handoffs, no-result searches, and top machine surfaces.

## Editorial Test

Before adding or promoting anything, ask:

- Would an agent be able to act on this without scraping?
- Is the claim verified from a primary source?
- Does this make the production decision clearer?
- If Martini is linked, is the handoff earned by the job being solved?
