import { breadcrumbLd, browseSort, card, esc, isInactive, layout, statusLabel } from "./_shared.mjs";

// ----------------------------------------------------------------- category
// Official → hosted → name is a browsing tie-breaker; the editorial pick is start_here, and
// only when the data names one. Dead and archived listings sort last.
export const categoryServers = (ctx, cat) =>
  ctx.servers.filter((s) => s.category === cat.id).sort(browseSort);

export const introParagraphs = (cat) =>
  String(cat.intro ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export const startHere = (ctx, cat) =>
  cat.start_here ? ctx.servers.find((s) => s.slug === cat.start_here && s.category === cat.id) ?? null : null;

export const renderCategory = (ctx, cat) => {
  const list = categoryServers(ctx, cat);
  const pick = startHere(ctx, cat);
  const rest = pick ? list.filter((s) => s.slug !== pick.slug) : list;
  const intro = introParagraphs(cat);
  const official = list.filter((s) => s.official).length;
  const remote = list.filter((s) => s.install?.remote_url).length;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>${esc(cat.name)}</span></p>
  <h1>${esc(cat.name)}</h1>
  <p class="hero-sub">${esc(cat.blurb)} <span class="mono">(machine version: <a href="/categories/${esc(cat.id)}.md">markdown</a>)</span></p>
  ${intro.map((p) => `<p class="cat-intro">${esc(p)}</p>`).join("\n  ")}
  <p class="agent-hint"><strong>Agent hint:</strong> ${esc(cat.agent_hint)}</p>
</section>

${pick ? `<section class="cat-section start-here" data-track-section="category-start-here:${esc(cat.id)}">
  <div class="cat-head">
    <h2 id="start-here">Start here</h2>
    <p class="cat-blurb">${esc(cat.start_here_why)}</p>
  </div>
  <div class="grid grid-pairs">${card(ctx, pick, { highlight: "card-start-here" })}</div>
</section>` : ""}

<div class="cat-tools">
  <div class="search-wrap">
    <input id="search" type="search" placeholder="Search ${list.length} ${esc(cat.short ?? cat.name).toLowerCase()} servers" autocomplete="off" aria-label="Search ${esc(cat.name)} servers">
    <kbd>/</kbd>
  </div>
  <div class="quick-filters" aria-label="Quick filters">
    <button class="quick-filter" data-quick-filter="official" aria-pressed="false">Official <span class="count">${official}</span></button>
    <button class="quick-filter" data-quick-filter="remote" aria-pressed="false">Hosted remote <span class="count">${remote}</span></button>
  </div>
</div>
<p class="no-results" id="no-results" hidden><span id="no-results-msg">Nothing in ${esc(cat.name)} matches that.</span> <button type="button" class="btn" id="clear-filters" hidden>Clear filters</button> <a href="/submit/" id="no-results-submit">Know a server we're missing? Submit it.</a></p>
<section class="cat-section" data-cat-section="${esc(cat.id)}" data-track-section="category:${esc(cat.id)}"><div class="grid">${rest.map((s) => card(ctx, s)).join("")}</div></section>
<p class="backlink"><a href="/#directory">← Full directory</a></p>`;
  return layout(ctx, {
    title: `${cat.name} — MCP servers for AI filmmaking | mcp.film`,
    description: cat.blurb,
    path: `/categories/${cat.id}/`,
    page: "category",
    md: `/categories/${cat.id}.md`,
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: cat.name,
        url: `${ctx.site.url}/categories/${cat.id}/`,
        description: cat.blurb,
        dateModified: list.map((s) => s.verified).sort().at(-1),
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
      breadcrumbLd(ctx, [{ name: cat.name }]),
    ],
  });
};

export const renderCategoryMd = (ctx, cat) => {
  const list = categoryServers(ctx, cat);
  const pick = startHere(ctx, cat);
  const lines = [
    `# ${cat.name}`,
    "",
    `> ${cat.blurb}`,
    "",
    ...introParagraphs(cat).flatMap((p) => [p, ""]),
    `Agent hint: ${cat.agent_hint}`,
    "",
    `- Servers: ${list.length} (${list.filter((s) => s.official).length} official, ${list.filter((s) => s.install?.remote_url).length} hosted remote)`,
    `- Canonical: ${ctx.site.url}/categories/${cat.id}/`,
    "",
  ];
  if (pick) lines.push("## Start here", "", `[${pick.name}](${ctx.site.url}/mcps/${pick.slug}.md): ${cat.start_here_why}`, "");
  lines.push("## Servers", "");
  for (const s of list) {
    const flags = [s.official ? "official" : null, s.install?.remote_url ? "remote" : null, isInactive(s) ? statusLabel(s).toLowerCase() : null].filter(Boolean);
    lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md)${flags.length ? ` (${flags.join(", ")})` : ""}: ${s.tagline}`);
  }
  lines.push("", "---", "", `Directory index: ${ctx.site.url}/index.md · Full registry: ${ctx.site.url}/api/registry.json`);
  return lines.join("\n") + "\n";
};
