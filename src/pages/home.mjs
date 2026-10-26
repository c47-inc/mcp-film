import { avatar, badge, card, esc, layout, nice, truncate } from "./_shared.mjs";

// --------------------------------------------------------------------- home
export const renderHome = (ctx) => {
  const { site, categories, servers } = ctx;
  const featured = servers.filter((s) => s.featured);
  const newest = [...servers]
    .sort((a, b) =>
      b.added.localeCompare(a.added)
      || Number(Boolean(b.official)) - Number(Boolean(a.official))
      || a.name.localeCompare(b.name)
    )
    .slice(0, 6);
  // Within a category: official first, then hosted remotes, then name. The registry
  // itself is alphabetical; the home grid ranks on the signals /about says it ranks on.
  const byCat = (id) => servers
    .filter((s) => s.category === id)
    .sort((a, b) =>
      Number(Boolean(b.official)) - Number(Boolean(a.official))
      || Number(Boolean(b.install?.remote_url)) - Number(Boolean(a.install?.remote_url))
      || a.name.localeCompare(b.name));

  // Progressive disclosure on phones and tablets: every card stays in the HTML (agents and
  // search engines read all of them); cards past the first six get a class the stylesheet
  // hides while the section carries `is-collapsed`, and app.js reveals them in place. Without
  // JS the "Show all" control is a plain link to the category page.
  const PREVIEW = 6;
  const rankedCard = (s, i) =>
    i >= PREVIEW ? card(ctx, s).replace('class="card"', 'class="card card-more"') : card(ctx, s);

  const featuredHtml = featured.map((s) => `
  <a class="feature" href="/mcps/${s.slug}/">
    <div class="feature-eyebrow">Featured studio · from the team behind mcp.film</div>
    <div class="feature-name">${avatar(ctx, s, 38)} ${esc(s.name)} ${badge(s)}</div>
    <p class="feature-tag">${esc(s.tagline)}</p>
    <p class="feature-desc">${esc(truncate(s.description, 170))}</p>
    <span class="feature-cta">Open the listing</span>
  </a>`).join("");

  const sections = categories
    .map((cat) => {
      const list = byCat(cat.id);
      if (!list.length) return "";
      // Phones strip every category into one swipeable row, so small ones collapse too;
      // only categories with more than the preview get the "Show all" control.
      const collapsible = list.length > 1;
      const attrs = `${collapsible ? " data-collapsible" : ""}${list.length > PREVIEW ? " data-more" : ""}`;
      return `
<section class="cat-section${collapsible ? " is-collapsed" : ""}" id="${cat.id}" data-cat-section="${cat.id}" data-track-section="directory:${cat.id}"${attrs}>
  <div class="cat-head">
    <h2><a href="/categories/${cat.id}/">${esc(cat.name)}</a></h2>
    <span class="cat-count">${list.length}</span>
    <p class="cat-blurb">${esc(cat.blurb)}</p>
  </div>
  <div class="grid">${list.map(rankedCard).join("")}</div>
  ${list.length > PREVIEW ? `<a class="btn show-more" href="/categories/${cat.id}/" data-show-more>Show all ${list.length}</a>` : ""}
</section>`;
    })
    .join("");

  // One source for the on-page FAQ and its FAQPage JSON-LD. Answers are HTML; the
  // structured data gets the same text with tags stripped.
  const faq = [
    {
      q: "What is an MCP server?",
      a: `A standard interface (the <a href="https://modelcontextprotocol.io" rel="noopener">Model Context Protocol</a>) that lets AI agents like Claude operate software as tools. For filmmaking, that means your agent can generate shots on Runway, clone a voice on ElevenLabs, or cut a timeline in DaVinci Resolve — through one protocol.`,
    },
    {
      q: "How do I connect one to Claude or Cursor?",
      a: `Every listing here has copy-paste connect commands for Claude Code, Claude Desktop, and Cursor, plus the auth you'll need. Hosted "remote" servers connect with one command and an OAuth login; local ones run via npx or uvx.`,
    },
    {
      q: "Which video generation MCP should I use?",
      a: `If you want one connection covering many models, start with a hub like <a href="/mcps/fal/">fal</a> or a studio like <a href="/mcps/martini/">Martini</a>. If you live on one platform, use its official server — <a href="/mcps/runway/">Runway</a>, <a href="/mcps/higgsfield/">Higgsfield</a>, and <a href="/mcps/pika/">Pika</a> all run hosted MCPs. <a href="/stack/">The Stack</a> walks the whole decision.`,
    },
    {
      q: "I'm an AI agent. What's the fastest way to read this site?",
      a: `One request: <code class="mono">GET /api/registry.json</code>. Or start at <a href="/llms.txt" class="mono">/llms.txt</a>; every page has a markdown twin at the same path plus <span class="mono">.md</span>. Full details on <a href="/for-agents/">the agents page</a>.`,
    },
    {
      q: "How do listings stay accurate?",
      a: `A curator agent re-verifies entries every day against primary sources, and every change lands as an auditable commit in <a href="https://github.com/${site.github_repo}" rel="noopener">the open-source repo</a>. Each entry shows its last-verified date.`,
    },
    {
      q: "How do I get my MCP server listed?",
      a: `Humans: <a href="/submit/">the submission form</a>. Agents: the <code class="mono">submit_listing</code> tool on <code class="mono">npx mcp-film</code>. Either way a maintainer verifies your claims against primary sources — it works, it's filmmaking-relevant, it's maintained.`,
    },
  ];
  const plain = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  const body = `
<script>document.body.classList.add("js")</script>
<section class="hero">
  <canvas class="hero-canvas" aria-hidden="true"></canvas>
  <div class="hero-inner">
  <p class="hero-eyebrow"><span class="dot">●</span> The MCP directory for AI filmmaking</p>
  <h1>Every tool your agent needs to make a film.</h1>
  <p class="hero-sub">mcp.film is a directory of <strong>${servers.length} verified Model Context Protocol (MCP) servers</strong> for AI filmmaking: video models, voices, scores, edit bays, finishing suites, and the pipes to ship it. Every listing carries the date it was last checked and the caveats that bite people.</p>
  <div class="hero-cta">
    <a class="btn btn-primary" href="/router/">What should I connect?</a>
    <a class="btn" href="#directory">Browse the directory</a>
    <a class="btn" href="/stack/">The AI Film Stack</a>
    <a class="btn" href="/playbooks/">Production playbooks</a>
  </div>
  <form class="hero-find" role="search" action="/#directory" method="get" aria-label="Find a server">
    <input type="search" name="q" placeholder="Search ${servers.length} servers" aria-label="Search servers" autocomplete="off">
    <select aria-label="Jump to a category" data-cat-select>
      <option value="">All categories</option>
      ${categories.map((c) => {
        const n = byCat(c.id).length;
        return n ? `<option value="${c.id}">${esc(c.short ?? c.name)} (${n})</option>` : "";
      }).join("")}
    </select>
  </form>
  <p class="hero-stats"><span><b>${ctx.servers.length}</b> servers</span><span><b>${ctx.officialCount}</b> official</span><span><b>${ctx.remoteCount}</b> hosted remote</span><span><b>${categories.length}</b> categories</span><span><b>${nice(servers.map((s) => s.verified).sort().at(-1))}</b> last verified</span></p>
  <p class="hero-ticker" data-ticker='${esc(JSON.stringify([
    `registry rebuilt ${nice(ctx.built.slice(0, 10))} · ${ctx.servers.length} servers`,
    "curator agent verifies listings daily · 06:17 utc",
    `${ctx.officialCount} vendor-maintained · ${ctx.remoteCount} hosted remote`,
    "every page has a machine twin · /llms.txt",
    "every entry carries its last-verified date",
  ]))}'><span class="tick-dot" aria-hidden="true"></span><span class="tick-text">registry rebuilt ${nice(ctx.built.slice(0, 10))} · ${ctx.servers.length} servers</span></p>
  </div>
</section>

<section class="featured-row" data-track-section="home-featured">${featuredHtml}
  <div class="agent-callout">
    <div class="feature-eyebrow">For agents</div>
    <p>This site is machine-first. One request gets you everything:</p>
    <pre class="mono" tabindex="0">curl -s ${site.url}/api/registry.json</pre>
    <p>Or start at <a href="/router/">brief router</a> · <a href="/llms.txt" class="mono">/llms.txt</a> · <a href="/recommendations/">agent recommendations</a> · <a href="/for-agents/">full agent docs</a></p>
  </div>
</section>

<section class="cat-section recent-section" data-cat-section="recent" data-track-section="home-newest">
  <div class="cat-head">
    <h2><a href="/pulse/">New to the catalog</a></h2>
    <span class="cat-count">${newest.length}</span>
    <p class="cat-blurb">Freshly verified additions from the latest curator passes. <a href="/pulse/">Open the catalog pulse</a>.</p>
  </div>
  <div class="grid recent-scroller">${newest.map((s) => card(ctx, s)).join("")}</div>
</section>

<div class="directory" id="directory">
  <aside class="dir-side">
    <div class="search-wrap">
      <input id="search" type="search" placeholder="Search ${servers.length} servers, vendors, capabilities" autocomplete="off" aria-label="Search servers">
      <kbd>/</kbd>
    </div>
    <div class="quick-filters" aria-label="Quick filters">
      <button class="quick-filter" data-quick-filter="official" aria-pressed="false">Official <span class="count">${servers.filter((s) => s.official).length}</span></button>
      <button class="quick-filter" data-quick-filter="remote" aria-pressed="false">Hosted remote <span class="count">${ctx.remoteCount}</span></button>
    </div>
    <p class="label">Categories</p>
    <nav class="dir-nav" id="chip-nav" aria-label="Filter by category">
      <button class="chip-filter is-on" data-filter="">All servers <span class="count">${servers.length}</span></button>
      ${categories.map((c) => {
        const n = byCat(c.id).length;
        return n ? `<button class="chip-filter" data-filter="${c.id}">${esc(c.name)} <span class="count">${n}</span></button>` : "";
      }).join("")}
    </nav>
  </aside>
  <div class="dir-main">
    <p class="no-results" id="no-results" hidden><span id="no-results-msg">Nothing in the catalog matches that.</span> <button type="button" class="btn" id="clear-filters" hidden>Clear filters</button> <a href="/submit/" id="no-results-submit">Know a server we're missing? Submit it.</a></p>
    ${sections}
  </div>
</div>

<section class="faq">
  <h2>Questions, answered</h2>
  <div class="faq-grid">${faq.map(({ q, a }) => `
    <div class="faq-item">
      <h3>${esc(q)}</h3>
      <p>${a}</p>
    </div>`).join("")}
  </div>
</section>`;

  return layout(ctx, {
    title: site.title,
    description: site.description,
    path: "/",
    page: "home",
    md: "/index.md",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "mcp.film",
        url: site.url,
        description: site.description,
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: site.url + "/?q={search_term_string}#directory" },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "MCP servers for AI filmmaking",
        numberOfItems: servers.length,
        itemListElement: servers.map((s, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: s.name,
          url: `${site.url}/mcps/${s.slug}/`,
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: plain(a) },
        })),
      },
    ],
  });
};
