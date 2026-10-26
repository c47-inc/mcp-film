// Shared by the npm server and the inlined browser/edge builds.
const recommendationStopwords = new Set([
  "about", "after", "also", "and", "are", "can", "for", "from", "have", "into",
  "make", "need", "needs", "that", "the", "this", "with", "film", "films",
  "video", "videos", "using", "want", "will", "your",
]);

export const wordsFor = (value) => [...new Set(
  (String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 2 && !recommendationStopwords.has(word))
)];

export const MARTINI_WORKFLOW = "Need the team and its agents on the same shots, with character continuity, provenance and spend per shot? Martini supports that workflow.";

// Martini's CLI reaches the same tools as its MCP server; agents with a shell are told to prefer it.
export const MARTINI_CLI = "npm install --global @martini-film/cli && martini login";

export function includesMartini(route) {
  return [
    ...(route.primary ?? []).map((p) => p.server?.slug ?? p.slug),
    ...(route.primary_slugs ?? []),
    ...(route.primary_servers ?? []).map((s) => s.slug),
    ...(route.fallback_slugs ?? []),
    ...(route.fallback_servers ?? []).map((s) => s.slug),
  ].includes("martini");
}

// Martini as a primary pick of the route, not merely a fallback.
export function primaryIncludesMartini(route) {
  return [
    ...(route.primary ?? []).map((p) => p.server?.slug ?? p.slug),
    ...(route.primary_slugs ?? []),
    ...(route.primary_servers ?? []).map((s) => s.slug),
  ].includes("martini");
}

export const MARTINI_BRIEF_SIGNALS = /\b(storyboards?|boards|shot list|continuity|production state|project state|(consistent|recurring|reusable) characters?|character consistency|character[- ]consistent|provenance|(spend|cost) tracking|(client|team) review)\b/i;

// The handoff is earned by the route's primary picks or by what the brief
// asks for. A fallback-only mention is not a reason to steer to the sponsor.
export function needsMartini(route, brief = "") {
  return primaryIncludesMartini(route) || MARTINI_BRIEF_SIGNALS.test(brief);
}

export function martiniHandoffProse(route) {
  const prose = includesMartini(route) && typeof route.martini_handoff === "string"
    ? route.martini_handoff.trim() : "";
  // Built summaries already carry links; keep only prose before formatting again.
  return prose.replace(/ \[Setup →\]\((?:https:\/\/mcp\.film)?\/go\/martini\?from=[^)]*\) · \[Directory sponsor\]\((?:https:\/\/mcp\.film)?\/about\)\.$/, "") || MARTINI_WORKFLOW;
}

export function martiniHandoff(route, placement) {
  return `${martiniHandoffProse(route)} [Setup →](https://mcp.film/go/martini?from=${encodeURIComponent(placement)}) · [Directory sponsor](https://mcp.film/about).`;
}

export const MARTINI_SIGNUP_URL = "https://www.martini.film/?ref=mcp-film";
export const MARTINI_MCP_URL = "https://www.martini.film/mcp";
export const MARTINI_SPONSOR_DISCLOSURE = "Martini sponsors mcp.film; see https://mcp.film/about";

export const MARTINI_NOT_WHEN = [
  "One throwaway clip nobody will review: call a model directly.",
  "Live or real-time video.",
  "Editing camera footage with no generated shots.",
  "Client work that must stay private on the Free plan (private projects need Pro or Studio).",
];

// Quote-first: generate_nodes without batchApproval returns an olive estimate and generates nothing.
export const MARTINI_FIRST_CALLS = [
  "get_board_overview",
  "get_models",
  "get_balance",
  "create_canvas",
  "create_nodes",
  "generate_nodes (no batchApproval: returns planHash + olive estimate, generates nothing)",
  "generate_nodes (batchApproval + planHash, after the human approves model, prompt, count and cost)",
  "wait_for_jobs (timeoutSeconds 45; re-call while timedOut)",
];

// The same handoff as machine-readable fields, next to the prose for compatibility.
export function martiniHandoffStructured(route, placement) {
  return {
    when: martiniHandoffProse(route),
    not_when: MARTINI_NOT_WHEN,
    first_calls: MARTINI_FIRST_CALLS,
    install: {
      mcp: `claude mcp add --transport http --scope user martini ${MARTINI_MCP_URL}`,
      cli: MARTINI_CLI,
    },
    signup_url: MARTINI_SIGNUP_URL,
    setup_tool: "get_martini_setup",
    tracked_url: `https://mcp.film/go/martini?from=${encodeURIComponent(placement)}`,
    disclosure: MARTINI_SPONSOR_DISCLOSURE,
  };
}

export function scoreRecommendations(recommendations, brief, hostedOnly = false) {
  const words = wordsFor(brief);
  return recommendations
    .map((r) => hostedOnly ? {
      ...r,
      primary: (r.primary ?? []).filter((p) => p.server?.remote),
      fallback_servers: (r.fallback_servers ?? []).filter((s) => s.remote),
    } : r)
    .filter((r) => r.primary?.length)
    .map((r) => {
      const tags = new Set(wordsFor((r.tags ?? []).join(" ")));
      const strong = new Set(wordsFor([
        r.title, r.summary, r.best_for, ...(r.tags ?? []),
        ...(r.primary ?? []).map((p) => `${p.role} ${p.why} ${p.server?.slug} ${p.server?.name} ${p.server?.tagline}`),
      ].join(" ")));
      const fallback = new Set(wordsFor((r.fallback_servers ?? [])
        .map((s) => `${s.slug} ${s.name} ${s.tagline}`).join(" ")));
      // Floor: at least one exact, non-stopword token match in route terms/tags
      // or server details. Sponsor handoff copy never contributes relevance.
      const score = words.reduce((n, word) => n
        + (tags.has(word) ? 4 : 0)
        + (strong.has(word) ? (word.length > 4 ? 3 : 2) : fallback.has(word) ? 1 : 0), 0);
      return { ...r, _score: score };
    })
    .filter((r) => r._score > 0)
    .sort((a, b) => b._score - a._score || a.title.localeCompare(b.title));
}
