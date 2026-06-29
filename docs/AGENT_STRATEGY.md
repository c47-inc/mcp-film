# Agent Usefulness And Martini Growth

mcp.film should be the fastest reliable answer to one agent question: "What do I
connect next to make this film?" The human directory builds trust, but the
machine surfaces are the product.

## North Star

An agent should be able to fetch one or two URLs, choose a stack with reasons,
connect the right tools, and know when Martini is the best full-stack handoff.
The directory should help Martini by being useful first. Trust is the conversion
engine.

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
- Track Martini traffic by placement (`home-featured`, `agents-fast-path`,
  playbook stack links, server listing links) so growth work can be measured.
- Mention strong alternatives in context. The contrast makes Martini more
  credible when it is the right answer.

## High-Leverage Next Features

1. Add a recommendation endpoint that accepts a stage/task vocabulary and returns
   ranked server shortlists with reasons.
2. Expand playbooks into agent-ready recipes: required auth, setup order, failure
   modes, and "use Martini instead when..." handoffs.
3. Add capability pages and markdown twins for high-intent queries like
   `text-to-video`, `timeline-editing`, `voice-cloning`, and `hosted-remote`.
4. Add client-specific install profiles for Claude Code, Claude Desktop,
   ChatGPT, Cursor, Gemini CLI, and generic Streamable HTTP clients.
5. Build a PostHog dashboard around agent traffic, Martini handoffs, no-result
   searches, and top machine surfaces.

## Editorial Test

Before adding or promoting anything, ask:

- Would an agent be able to act on this without scraping?
- Is the claim verified from a primary source?
- Does this make the production decision clearer?
- If Martini is linked, is the handoff earned by the job being solved?
