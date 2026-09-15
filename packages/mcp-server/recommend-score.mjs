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

export const MARTINI_WORKFLOW = "Need boards, reusable characters and production state across shots? Martini supports that workflow.";

export function includesMartini(route) {
  return [
    ...(route.primary ?? []).map((p) => p.server?.slug ?? p.slug),
    ...(route.primary_slugs ?? []),
    ...(route.primary_servers ?? []).map((s) => s.slug),
    ...(route.fallback_slugs ?? []),
    ...(route.fallback_servers ?? []).map((s) => s.slug),
  ].includes("martini");
}

export function needsMartini(route, brief = "") {
  return includesMartini(route) || /\b(storyboards?|boards|shot list|continuity|production state|project state|(consistent|recurring|reusable) characters?|character consistency|character[- ]consistent)\b/i.test(brief);
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
