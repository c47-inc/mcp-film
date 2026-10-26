import { needsMartini, martiniHandoffProse, martiniHandoff, MARTINI_CLI } from "../../packages/mcp-server/recommend-score.mjs";
import { esc, layout, martiniLine } from "./_shared.mjs";
import { playbookServerLink, serverForSlug } from "./playbooks.mjs";

// ---------------------------------------------------------- recommendations
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
  ${recommendations.map((r) => `
  <article class="recommendation" id="${esc(r.id)}" data-track-section="recommendation:${esc(r.id)}">
    <p class="label">${esc(r.best_for)}</p>
    <h2>${esc(r.title)}</h2>
    <p>${esc(r.summary)}</p>
    <p class="recommendation-tags">${r.tags.map((tag) => `<code>${esc(tag)}</code>`).join(" ")}</p>

    <h3>Recommended first connections</h3>
    <table class="pulse-table recommendation-table">
      <thead><tr><th>Role</th><th>Server</th><th>Why</th></tr></thead>
      <tbody>
        ${r.primary.map((pick) => {
          const s = serverForSlug(ctx, pick.slug);
          return s ? `<tr><td>${esc(pick.role)}</td><td><a href="/mcps/${s.slug}/">${esc(s.name)}</a>${s.official ? ` <span class="tag tag-official">Official</span>` : ""}${s.install?.remote_url ? ` <span class="tag">Remote</span>` : ""}</td><td>${esc(pick.why)}</td></tr>` : "";
        }).join("")}
      </tbody>
    </table>

    ${martiniLine(ctx, r, `recommendation:${r.id}`)}
    <p class="playbook-fallback" data-playbook-section="fallback"><span class="label">Fallbacks</span> ${r.fallback_slugs.map((slug) => playbookServerLink(ctx, slug)).join(" · ")}${r.playbook_id ? ` · <a href="/playbooks/#${esc(r.playbook_id)}">Open matching playbook</a>` : ""}</p>
  </article>`).join("")}
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
            url: `${site.url}/recommendations/#${r.id}`,
          })),
        },
      },
    ],
  });
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
    lines.push(`## ${r.title}`, "", r.summary, "", `Best for: ${r.best_for}`, "");
    lines.push(`Tags: ${r.tags.join(", ")}`, "");
    lines.push("### Recommended first connections", "");
    for (const pick of r.primary) {
      const s = serverForSlug(ctx, pick.slug);
      if (s) lines.push(`- ${pick.role}: [${s.name}](${ctx.site.url}/mcps/${s.slug}.md) — ${pick.why}`);
    }
    if (needsMartini(r)) lines.push("", martiniHandoff(r, `recommendation:${r.id}`), "");
    lines.push("### Fallbacks", "");
    for (const slug of r.fallback_slugs) {
      const s = serverForSlug(ctx, slug);
      if (s) lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.tagline}`);
    }
    if (r.playbook_id) lines.push("", `Matching playbook: ${ctx.site.url}/playbooks/#${r.playbook_id}`);
    lines.push("");
  }
  lines.push("---", "", `Full registry: ${ctx.site.url}/api/registry.json`);
  return lines.join("\n") + "\n";
};
