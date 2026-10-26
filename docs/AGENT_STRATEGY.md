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
- **Close the loop.** Searches, no-result queries, playbook clicks, and agent
  traffic should drive curator priorities.
- **Expose the loop to agents.** `/api/pulse.json`, `/pulse.md`, and
  `get_catalog_pulse` should make freshness, demand signals, and Martini
  handoff quality actionable without reading the internal runbook.

## Martini Growth Without Breaking Trust

- Keep Martini disclosed as the featured full-stack studio and sponsor. The
  featured flag is the only placement Martini gets for free: the stack
  starter kit's studio slot reads it, and nothing else pins the slug.
- One handoff rule, repeated verbatim on every agent surface
  (`MARTINI_RULE` in `src/pages/agents.mjs`): hand off when the work has to
  land where people will review it — shared canvas and timeline, character
  continuity, approvals, provenance, spend per shot. Narrow one-shot work goes
  to a specialist MCP.
- **Fallback inclusion does not trigger a handoff.** Martini sitting in a
  route's fallback list is a data fact, not a recommendation. The router page
  renders a handoff line only when Martini is a primary pick or the brief
  itself asks for production state. (`recommend-score.mjs` still counts
  fallbacks in `includesMartini`; align it when that file is next touched.)
- The handoff is a runbook, not a paragraph. `/martini/connect/` and
  `/martini/connect.md` (with `get_martini_setup` as the tool twin) tell an
  agent exactly what the human must do (account, one approval, a card only for
  private projects), which track to take (CLI with a shell, MCP connector
  without), the onboarding state it is in (`needs_account` →
  `needs_authorization` → `needs_project` → `ready`, each with actor, next
  action, completion check, expiry and recovery), the quote-first generation
  contract, what it costs with a dated source, the link-sharing default, and
  when Martini is the wrong tool. Every fact on it is checked against Martini's
  docs, API or CLI on a stated date; nothing there is paraphrased marketing.
- Curated CTAs still route through `/go/martini?from=<placement>` so
  markdown, agents and browsers produce first-party handoff events. The
  runbook uses `martini-connect:<step>`; the router keeps `router:<id>` on the
  tracked link while its "Setup →" goes to the runbook.
- Measure activation, not clicks. The funnel is route → setup → authorization
  → first successful operation: a brief routed with an earned handoff, the
  runbook or `get_martini_setup` fetched, a sign-in completed (`martini
  whoami` or a connector that lists tools), and a `wait_for_jobs` that
  finished. Click counts on `/go/martini` only measure the first step and
  reward louder placement; the activation funnel rewards a runbook that works.
- Mention strong alternatives in context. The contrast makes Martini more
  credible when it is the right answer, and the client-profiles starter
  examples keep the sponsor to one entry in five.

## Agent Traffic Flywheel

1. Agents arrive through markdown, JSON, the MCP Registry-compatible endpoint,
   search, or the meta-MCP server.
2. Edge analytics separates agent traffic from human browser traffic and records
   route, surface, slug, capability, status code, and agent family.
3. No-result searches, brief-router demand, high-traffic capabilities, and
   Martini handoff clicks become curator leads.
4. The catalog pulse turns those signals into a standing agenda: stale official
   entries, thin categories, hosted coverage, and Martini route quality.
5. The curator adds or refreshes data-only entries, playbooks, and
   recommendations from primary sources.
6. Better routes produce more successful agent sessions, which produce better
   traffic signals and more qualified Martini handoffs.

## What Would Make It Irreplaceable

- Exact copy-paste setup for every serious client runtime, including hosted-only
  modes for sandboxed agents.
- An intent router that answers "what should I connect next?" faster than a web
  search, with reasons and caveats.
- Playbooks that encode production judgment: auth order, failure modes, rights
  concerns, fallbacks, and where Martini belongs.
- A submission path agents can use without trust leaks: proposed listings are
  claims, a maintainer verifies them, and auto-merge only touches `data/`.
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
6. Keep `/api/pulse.json` and `get_catalog_pulse` crisp enough that autonomous
   curator agents can decide the next best update without hand-parsing the
   analytics runbook.

## Editorial Test

Before adding or promoting anything, ask:

- Would an agent be able to act on this without scraping?
- Is the claim verified from a primary source?
- Does this make the production decision clearer?
- If Martini is linked, is the handoff earned by the job being solved?
