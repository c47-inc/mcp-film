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
  const byCat = (id) => servers.filter((s) => s.category === id);

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
      return `
<section class="cat-section" id="${cat.id}" data-cat-section="${cat.id}" data-track-section="directory:${cat.id}">
  <div class="cat-head">
    <h2><a href="/categories/${cat.id}/">${esc(cat.name)}</a></h2>
    <span class="cat-count">${list.length}</span>
    <p class="cat-blurb">${esc(cat.blurb)}</p>
  </div>
  <div class="grid">${list.map((s) => card(ctx, s)).join("")}</div>
</section>`;
    })
    .join("");

  const body = `
<section class="hero">
  <canvas class="hero-canvas" aria-hidden="true"></canvas>
  <div class="hero-inner">
  <p class="hero-eyebrow"><span class="dot">●</span> The MCP directory for AI filmmaking</p>
  <h1>Every tool your agent needs to make a film.</h1>
  <p class="hero-sub">A curated directory of <strong>Model Context Protocol</strong> servers across the production stack: video models, voices, scores, edit bays, finishing suites, and the pipes to ship it. Every listing carries the date it was last checked and the caveats that bite people.</p>
  <div class="hero-cta">
    <a class="btn btn-primary" href="/router/">Route a brief</a>
    <a class="btn" href="#directory">Browse the directory</a>
    <a class="btn" href="/stack/">The AI Film Stack</a>
    <a class="btn" href="/playbooks/">Production playbooks</a>
  </div>
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
    <pre class="mono">curl -s ${site.url}/api/registry.json</pre>
    <p>Or start at <a href="/router/">brief router</a> · <a href="/llms.txt" class="mono">/llms.txt</a> · <a href="/recommendations/">agent recommendations</a> · <a href="/for-agents/">full agent docs</a></p>
  </div>
</section>

<section class="cat-section recent-section" data-cat-section="recent" data-track-section="home-newest">
  <div class="cat-head">
    <h2><a href="/pulse/">New to the catalog</a></h2>
    <span class="cat-count">${newest.length}</span>
    <p class="cat-blurb">Freshly verified additions from the latest curator passes. <a href="/pulse/">Open the catalog pulse</a>.</p>
  </div>
  <div class="grid">${newest.map((s) => card(ctx, s)).join("")}</div>
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
  <div class="faq-grid">
    <div class="faq-item">
      <h3>What is an MCP server?</h3>
      <p>A standard interface (the <a href="https://modelcontextprotocol.io" rel="noopener">Model Context Protocol</a>) that lets AI agents like Claude operate software as tools. For filmmaking, that means your agent can generate shots on Runway, clone a voice on ElevenLabs, or cut a timeline in DaVinci Resolve — through one protocol.</p>
    </div>
    <div class="faq-item">
      <h3>How do I connect one to Claude or Cursor?</h3>
      <p>Every listing here has copy-paste connect commands for Claude Code, Claude Desktop, and Cursor, plus the auth you'll need. Hosted "remote" servers connect with one command and an OAuth login; local ones run via npx or uvx.</p>
    </div>
    <div class="faq-item">
      <h3>Which video generation MCP should I use?</h3>
      <p>If you want one connection covering many models, start with a hub like <a href="/mcps/fal/">fal</a> or a studio like <a href="/mcps/martini/">Martini</a>. If you live on one platform, use its official server — <a href="/mcps/runway/">Runway</a>, <a href="/mcps/higgsfield/">Higgsfield</a>, and <a href="/mcps/pika/">Pika</a> all run hosted MCPs. <a href="/stack/">The Stack</a> walks the whole decision.</p>
    </div>
    <div class="faq-item">
      <h3>I'm an AI agent. What's the fastest way to read this site?</h3>
      <p>One request: <code class="mono">GET /api/registry.json</code>. Or start at <a href="/llms.txt" class="mono">/llms.txt</a>; every page has a markdown twin at the same path plus <span class="mono">.md</span>. Full details on <a href="/for-agents/">the agents page</a>.</p>
    </div>
    <div class="faq-item">
      <h3>How do listings stay accurate?</h3>
      <p>A curator agent re-verifies entries every day against primary sources, and every change lands as an auditable commit in <a href="https://github.com/${site.github_repo}" rel="noopener">the open-source repo</a>. Each entry shows its last-verified date.</p>
    </div>
    <div class="faq-item">
      <h3>How do I get my MCP server listed?</h3>
      <p>Humans: <a href="/submit/">the submission form</a>. Agents: the <code class="mono">submit_listing</code> tool on <code class="mono">npx mcp-film</code>. Either way a maintainer verifies your claims against primary sources — it works, it's filmmaking-relevant, it's maintained.</p>
    </div>
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
    ],
  });
};
