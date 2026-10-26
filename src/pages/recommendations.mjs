import { martiniHandoff } from "../../packages/mcp-server/recommend-score.mjs";
import { breadcrumbLd, esc, hasMartiniHandoff, layout, martiniLine, organizationLd } from "./_shared.mjs";
import { activeServerForSlug, activeServers, routeModified, serverLinks } from "./playbooks.mjs";

// ---------------------------------------------------------- recommendations
const routeSlugs = (r) => [...r.primary.map((p) => p.slug), ...(r.fallback_slugs ?? [])];

const recommendationArticle = (ctx, r, { standalone = false } = {}) => {
  const title = standalone ? `<h1>${esc(r.title)}</h1>` : `<h2><a href="/recommendations/${esc(r.id)}/">${esc(r.title)}</a></h2>`;
  const picks = r.primary.map((pick) => [pick, activeServerForSlug(ctx, pick.slug)]).filter(([, s]) => s);
  const fallbacks = activeServers(ctx, r.fallback_slugs);
  return `
  <article class="recommendation" id="${esc(r.id)}" data-track-section="recommendation:${esc(r.id)}">
    <p class="label">${esc(r.best_for)}</p>
    ${title}
    <p>${esc(r.summary)}</p>
    <p class="recommendation-tags">${r.tags.map((tag) => `<code>${esc(tag)}</code>`).join(" ")}</p>

    <h3>Recommended first connections</h3>
    <table class="pulse-table recommendation-table">
      <thead><tr><th>Role</th><th>Server</th><th>Why</th></tr></thead>
      <tbody>
        ${picks.map(([pick, s]) => `<tr><td>${esc(pick.role)}</td><td><a href="/mcps/${s.slug}/">${esc(s.name)}</a>${s.official ? ` <span class="tag tag-official">Official</span>` : ""}${s.install?.remote_url ? ` <span class="tag">Remote</span>` : ""}</td><td>${esc(pick.why)}</td></tr>`).join("")}
      </tbody>
    </table>

    ${martiniLine(ctx, r, `recommendation:${r.id}`)}
    ${fallbacks.length || r.playbook_id ? `<p class="playbook-fallback" data-playbook-section="fallback">${fallbacks.length ? `<span class="label">Fallbacks</span> ${serverLinks(ctx, r.fallback_slugs)}` : ""}${r.playbook_id ? `${fallbacks.length ? " · " : ""}<a href="/playbooks/${esc(r.playbook_id)}/">Open matching playbook</a>` : ""}</p>` : ""}
    ${standalone ? `<p class="connect-note mono">Machine version: <a href="/recommendations/${esc(r.id)}.md">/recommendations/${esc(r.id)}.md</a> · <a href="/api/recommendations.json">/api/recommendations.json</a></p>` : ""}
  </article>`;
};

export const renderRecommendations = (ctx) => {
  const { site, recommendations } = ctx;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Recommendations</span></p>
  <h1>Agent recommendations</h1>
  <p class="hero-sub">Intent-routed MCP picks for common filmmaking jobs. Use this when your agent needs a shortlist with reasons, not a catalog dump. <span class="mono">(machine version: <a href="/recommendations.md">/recommendations.md</a> · <a href="/api/recommendations.json">/api/recommendations.json</a>)</span></p>
</section>

<section class="pulse-grid" aria-label="Recommendation summary">
  <div><span>${recommendations.length}</span><p>intents</p></div>
  <div><span>${new Set(recommendations.flatMap((r) => r.primary.map((p) => p.slug))).size}</span><p>primary servers</p></div>
  <div><span>${recommendations.filter((r) => r.primary.some((p) => p.slug === "martini")).length}</span><p>Martini routes</p></div>
  <div><span>${new Set(recommendations.flatMap((r) => r.tags)).size}</span><p>intent tags</p></div>
</section>

<section class="server-main playbook-doc recommendations-doc">
  ${recommendations.map((r) => recommendationArticle(ctx, r)).join("")}
</section>`;

  return layout(ctx, {
    title: "Agent recommendations — MCP shortlists for AI filmmaking | mcp.film",
    description: "Intent-routed MCP server recommendations for AI filmmaking agents, with ranked picks, fallbacks, and Martini handoff guidance.",
    path: "/recommendations/",
    page: "recommendations",
    md: "/recommendations.md",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "mcp.film agent recommendations",
        description: "Intent-routed MCP server recommendations for common AI filmmaking jobs.",
        url: site.url + "/recommendations/",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: recommendations.length,
          itemListElement: recommendations.map((r, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: r.title,
            url: `${site.url}/recommendations/${r.id}/`,
          })),
        },
      },
    ],
  });
};

export const renderRecommendation = (ctx, r) => {
  const { site } = ctx;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/recommendations/">Recommendations</a> / <span>${esc(r.title)}</span></p>
</section>
<section class="server-main playbook-doc recommendations-doc">
  ${recommendationArticle(ctx, r, { standalone: true })}
</section>
<p class="backlink"><a href="/recommendations/">← All recommendations</a></p>`;
  return layout(ctx, {
    title: `${r.title} — MCP picks | mcp.film`,
    description: r.summary.length <= 155 ? r.summary : r.summary.slice(0, 156).replace(/\s+\S*$/, "").replace(/[^\p{L}\p{N}.)]+$/u, ""),
    path: `/recommendations/${r.id}/`,
    page: "recommendation",
    md: `/recommendations/${r.id}.md`,
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: r.title,
        description: r.summary,
        url: `${site.url}/recommendations/${r.id}/`,
        dateModified: routeModified(ctx, routeSlugs(r)),
        publisher: organizationLd(ctx),
        numberOfItems: r.primary.filter((p) => activeServerForSlug(ctx, p.slug)).length,
        itemListElement: r.primary
          .map((pick) => activeServerForSlug(ctx, pick.slug))
          .filter(Boolean)
          .map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: `${site.url}/mcps/${s.slug}/` })),
      },
      breadcrumbLd(ctx, [{ name: "Recommendations", item: `${site.url}/recommendations/` }, { name: r.title }]),
    ],
  });
};

const recommendationMdLines = (ctx, r, { heading = "##" } = {}) => {
  const sub = heading + "#";
  const lines = [`${heading} ${r.title}`, "", r.summary, "", `Best for: ${r.best_for}`, "", `Tags: ${r.tags.join(", ")}`, ""];
  lines.push(`${sub} Recommended first connections`, "");
  for (const pick of r.primary) {
    const s = activeServerForSlug(ctx, pick.slug);
    if (s) lines.push(`- ${pick.role}: [${s.name}](${ctx.site.url}/mcps/${s.slug}.md) — ${pick.why}`);
  }
  if (hasMartiniHandoff(r)) lines.push("", martiniHandoff(r, `recommendation:${r.id}`));
  const fallbacks = activeServers(ctx, r.fallback_slugs);
  if (fallbacks.length) {
    lines.push("", `${sub} Fallbacks`, "");
    for (const s of fallbacks) lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.tagline}`);
  }
  if (r.playbook_id) lines.push("", `Matching playbook: ${ctx.site.url}/playbooks/${r.playbook_id}.md`);
  lines.push("");
  return lines;
};

export const renderRecommendationsMd = (ctx) => {
  const lines = [
    "# mcp.film agent recommendations",
    "",
    "> Intent-routed MCP shortlists for common AI filmmaking jobs.",
    "",
    `Structured data: ${ctx.site.url}/api/recommendations.json`,
    "",
  ];
  for (const r of ctx.recommendations) {
    lines.push(...recommendationMdLines(ctx, r));
    lines.push(`Canonical: ${ctx.site.url}/recommendations/${r.id}/`, "");
  }
  lines.push("---", "", `Full registry: ${ctx.site.url}/api/registry.json`);
  return lines.join("\n") + "\n";
};

export const renderRecommendationMd = (ctx, r) => {
  const lines = recommendationMdLines(ctx, r, { heading: "#" });
  lines.push("---", "", `Canonical: ${ctx.site.url}/recommendations/${r.id}/`, `All recommendations: ${ctx.site.url}/recommendations.md · Structured data: ${ctx.site.url}/api/recommendations.json`);
  return lines.join("\n") + "\n";
};
