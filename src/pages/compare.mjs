import { PRICING_LABEL, authLabel, breadcrumbLd, card, caveatsFor, claudeCodeCmd, cmdLike, esc, layout, nice, organizationLd, remoteHeaders, statusLabel, truncate } from "./_shared.mjs";

// ------------------------------------------------------------- comparisons
// data/comparisons.json holds the editorial part (verdict, choose_if); every fact in the
// side-by-side table is generated from the listings themselves, so a curator re-verifying
// a server updates its comparisons without touching them.

const serversOf = (ctx, c) => c.slugs.map((slug) => ctx.servers.find((s) => s.slug === slug)).filter(Boolean);

// Comparisons a listing appears in (server pages link to them as "Compared with").
export const comparisonsFor = (ctx, slug) => (ctx.comparisons ?? []).filter((c) => c.slugs.includes(slug));

// The page is as current as its newest input: a listing re-verified or the verdict re-read.
const compareModified = (ctx, c) => [c.reviewed, ...serversOf(ctx, c).map((s) => s.verified)].filter(Boolean).sort().at(-1);

const installText = (s) => {
  const cc = claudeCodeCmd(s);
  if (cc) return { code: cc };
  if (s.install?.stdio_command && !cmdLike(s.install.stdio_command, s.install)) return { prose: truncate(s.install.stdio_command, 180) };
  return { prose: "No copy-paste command; set up through the vendor's flow." };
};

const toolsText = (s) => {
  const t = s.tools_sample ?? [];
  if (!t.length) return null;
  return { shown: t.slice(0, 6), more: Math.max(0, t.length - 6), total: t.length };
};

// One row per fact: [label, html(s), md(s)].
const FACT_ROWS = [
  ["Vendor", (s) => esc(s.vendor), (s) => s.vendor],
  ["Maintained by", (s) => (s.official ? "The vendor (official)" : "Community"), (s) => (s.official ? "the vendor (official)" : "community")],
  ["Status", (s) => esc(statusLabel(s)), (s) => statusLabel(s).toLowerCase()],
  ["Hosted endpoint",
    (s) => (s.install?.remote_url
      ? `<code class="mono">${esc(s.install.remote_url)}</code>${remoteHeaders(s).length ? `<br>needs header ${remoteHeaders(s).map((h) => `<code class="mono">${esc(h)}</code>`).join(", ")}` : ""}`
      : "None; runs locally"),
    (s) => (s.install?.remote_url ? `\`${s.install.remote_url}\`${remoteHeaders(s).length ? ` (needs header ${remoteHeaders(s).map((h) => `\`${h}\``).join(", ")})` : ""}` : "none; runs locally")],
  ["Auth",
    (s) => `${esc(authLabel(s))}${s.auth?.env_var ? ` · <code class="mono">${esc(s.auth.env_var)}</code>` : ""}`,
    (s) => `${authLabel(s)}${s.auth?.env_var ? ` (\`${s.auth.env_var}\`)` : ""}`],
  ["Pricing",
    (s) => `${esc(PRICING_LABEL[s.pricing] ?? s.pricing)}${s.pricing_note ? `: ${esc(s.pricing_note)}` : ""}`,
    (s) => `${PRICING_LABEL[s.pricing] ?? s.pricing}${s.pricing_note ? `: ${s.pricing_note}` : ""}`],
  ["Install",
    (s) => { const i = installText(s); return i.code ? `<code class="mono">${esc(i.code)}</code>` : esc(i.prose); },
    (s) => { const i = installText(s); return i.code ? `\`${i.code}\`` : i.prose; }],
  ["Sample tools",
    (s) => { const t = toolsText(s); return t ? `${t.total} listed: ${t.shown.map((x) => `<code class="mono">${esc(x)}</code>`).join(" ")}${t.more ? ` +${t.more} more` : ""}` : "No published tool list; read tools/list"; },
    (s) => { const t = toolsText(s); return t ? `${t.total} listed: ${t.shown.map((x) => `\`${x}\``).join(", ")}${t.more ? ` +${t.more} more` : ""}` : "no published tool list; read tools/list"; }],
  ["Verified",
    (s) => `<time datetime="${esc(s.verified)}">${nice(s.verified)}</time>`,
    (s) => s.verified],
];

const caveatsHtml = (s) => {
  const list = caveatsFor(s).slice(0, 2);
  return list.length ? `<ul class="compare-caveats">${list.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : "None noted";
};

export const renderCompare = (ctx, c) => {
  const { site } = ctx;
  const list = serversOf(ctx, c);
  const head = list.map((s) => `<th scope="col"><a href="/mcps/${esc(s.slug)}/">${esc(s.name)}</a></th>`).join("");
  const rows = [
    ...FACT_ROWS.map(([label, html]) => `<tr><th scope="row">${esc(label)}</th>${list.map((s) => `<td>${html(s)}</td>`).join("")}</tr>`),
    `<tr><th scope="row">Caveats</th>${list.map((s) => `<td>${caveatsHtml(s)}</td>`).join("")}</tr>`,
  ].join("\n      ");
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/compare/">Compare</a> / <span>${esc(c.title)}</span></p>
  <h1>${esc(c.title)}</h1>
  <p class="hero-sub">${esc(c.summary)}</p>
</section>

<section class="server-main agents-doc compare-doc" data-compare="${esc(c.id)}">
  <div class="grid grid-pairs compare-cards" data-track-section="compare:${esc(c.id)}">${list.map((s) => card(ctx, s)).join("")}</div>

  <h2 id="verdict">Verdict</h2>
  <p>${esc(c.verdict)}</p>

  <h2 id="choose">Choose…</h2>
  <ul class="agents-list compare-choose">
    ${list.map((s) => `<li><strong><a href="/mcps/${esc(s.slug)}/">${esc(s.name)}</a></strong> if ${esc(lowerFirst(c.choose_if[s.slug]))}</li>`).join("\n    ")}
  </ul>

  <h2 id="side-by-side">Side by side</h2>
  <table class="pulse-table compare-table" tabindex="0">
    <caption class="sr-only">${esc(c.title)}: facts from each listing</caption>
    <thead><tr><th scope="col">Fact</th>${head}</tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p class="connect-note">Every row is generated from the listings' verified data; the verdict is editorial, written from the same data and last reviewed <time datetime="${esc(c.reviewed)}">${nice(c.reviewed)}</time>. Full install steps and field notes are on each listing. Something wrong? <a href="https://github.com/${site.github_repo}/issues/new?labels=correction&title=${encodeURIComponent(`[compare/${c.id}] correction`)}" rel="noopener">Open an issue</a>.</p>
  <p class="connect-note mono">Machine version: <a href="/compare/${esc(c.id)}.md">/compare/${esc(c.id)}.md</a></p>
</section>
<p class="backlink"><a href="/compare/">← All comparisons</a></p>`;

  return layout(ctx, {
    title: `${c.title} | mcp.film`,
    description: c.summary,
    path: `/compare/${c.id}/`,
    page: "compare",
    md: `/compare/${c.id}.md`,
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: c.title,
        description: c.summary,
        url: `${site.url}/compare/${c.id}/`,
        dateModified: compareModified(ctx, c),
        publisher: organizationLd(ctx),
        about: list.map((s) => ({
          "@type": "SoftwareApplication",
          name: s.name,
          url: `${site.url}/mcps/${s.slug}/`,
          applicationCategory: "MultimediaApplication",
          applicationSubCategory: "MCP Server",
          creator: { "@type": "Organization", name: s.vendor },
        })),
      },
      breadcrumbLd(ctx, [{ name: "Compare", item: `${site.url}/compare/` }, { name: c.title }]),
    ],
  });
};

export const lowerFirst = (text) => {
  const t = String(text ?? "");
  // Keep acronyms and names ("UE 5.8", "MIT") as written; only a plain capitalised word drops case.
  return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
};

export const renderCompareMd = (ctx, c) => {
  const list = serversOf(ctx, c);
  const lines = [`# ${c.title}`, "", `> ${c.summary}`, "", "## Verdict", "", c.verdict, "", "## Choose", ""];
  for (const s of list) lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md) if ${lowerFirst(c.choose_if[s.slug])}`);
  lines.push("", "## Side by side", "");
  for (const s of list) {
    lines.push(`### ${s.name}`, "");
    for (const [label, , md] of FACT_ROWS) lines.push(`- ${label}: ${md(s)}`);
    const cav = caveatsFor(s).slice(0, 2);
    if (cav.length) lines.push("- Caveats:", ...cav.map((x) => `  - ${x}`));
    lines.push(`- Listing: ${ctx.site.url}/mcps/${s.slug}.md`, "");
  }
  lines.push(
    "---",
    "",
    `Facts are generated from each listing's verified data; the verdict is editorial, last reviewed ${c.reviewed}.`,
    `Canonical: ${ctx.site.url}/compare/${c.id}/ · All comparisons: ${ctx.site.url}/compare.md`,
  );
  return lines.join("\n") + "\n";
};

export const renderCompareIndex = (ctx) => {
  const { site } = ctx;
  const items = ctx.comparisons ?? [];
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Compare</span></p>
  <h1>Compare MCP servers</h1>
  <p class="hero-sub">Head-to-heads for the choices filmmakers actually face: two official video servers, the official server against the community one, which DaVinci Resolve bridge. Facts come straight from the verified listings; each verdict is written from those facts and nothing else. <span class="mono">(machine version: <a href="/compare.md">/compare.md</a>)</span></p>
</section>

<section class="server-main agents-doc compare-doc">
  <ul class="compare-index">
    ${items.map((c) => `<li>
      <h2><a href="/compare/${esc(c.id)}/">${esc(c.title)}</a></h2>
      <p>${esc(c.summary)}</p>
      <p class="compare-options">${serversOf(ctx, c).map((s) => `<a href="/mcps/${esc(s.slug)}/">${esc(s.name)}</a>`).join(" · ")}</p>
    </li>`).join("\n    ")}
  </ul>
  <p class="connect-note">Missing a matchup you keep running into? <a href="https://github.com/${site.github_repo}/issues/new?labels=compare&title=${encodeURIComponent("Compare: <server> vs <server>")}" rel="noopener">Suggest one</a>.</p>
</section>`;
  return layout(ctx, {
    title: "Compare MCP servers for AI filmmaking | mcp.film",
    description: "Side-by-side comparisons of MCP servers for AI filmmaking: video generation, voice, model hubs, upscaling, NLE bridges and 3D, with verdicts from verified data.",
    path: "/compare/",
    page: "compare-index",
    md: "/compare.md",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "mcp.film comparisons",
        description: "Side-by-side comparisons of MCP servers for AI filmmaking.",
        url: `${site.url}/compare/`,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: items.length,
          itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.title, url: `${site.url}/compare/${c.id}/` })),
        },
      },
      breadcrumbLd(ctx, [{ name: "Compare" }]),
    ],
  });
};

export const renderCompareIndexMd = (ctx) => {
  const lines = [
    "# Compare MCP servers for AI filmmaking",
    "",
    "> Head-to-heads between servers people actually choose between. Facts come from the verified listings; verdicts are written from those facts.",
    "",
  ];
  for (const c of ctx.comparisons ?? []) {
    lines.push(`- [${c.title}](${ctx.site.url}/compare/${c.id}.md): ${c.summary} (${serversOf(ctx, c).map((s) => s.slug).join(", ")})`);
  }
  lines.push("", "---", "", `Canonical: ${ctx.site.url}/compare/`);
  return lines.join("\n") + "\n";
};
