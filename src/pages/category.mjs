import { card, esc, layout } from "./_shared.mjs";

// ----------------------------------------------------------------- category
export const renderCategory = (ctx, cat) => {
  const list = ctx.servers.filter((s) => s.category === cat.id);
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>${esc(cat.name)}</span></p>
  <h1>${esc(cat.name)}</h1>
  <p class="hero-sub">${esc(cat.blurb)}</p>
  <p class="agent-hint"><strong>Agent hint:</strong> ${esc(cat.agent_hint)}</p>
</section>
<section class="cat-section"><div class="grid">${list.map((s) => card(ctx, s)).join("")}</div></section>
<p class="backlink"><a href="/#directory">← Full directory</a></p>`;
  return layout(ctx, {
    title: `${cat.name} — MCP servers for AI filmmaking | mcp.film`,
    description: cat.blurb,
    path: `/categories/${cat.id}/`,
    page: "category",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: cat.name,
        url: `${ctx.site.url}/categories/${cat.id}/`,
        description: cat.blurb,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: list.length,
          itemListElement: list.map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: s.name,
            url: `${ctx.site.url}/mcps/${s.slug}/`,
          })),
        },
      },
    ],
  });
};
