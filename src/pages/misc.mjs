import { esc, layout, sponsorLink } from "./_shared.mjs";
import { codeBlock } from "./server.mjs";

// ------------------------------------------------------------- about/submit
export const renderAbout = (ctx) => {
  const { site } = ctx;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>About</span></p>
  <h1>About mcp.film</h1>
</section>
<section class="server-main agents-doc">
  <p class="hero-sub">AI filmmaking is becoming agentic: you describe the film, your agent runs the pipeline. The missing piece is knowing <em>which</em> pipes exist and how to connect them. mcp.film is that map — a curated, verified directory of Model Context Protocol servers for every stage of production.</p>

  <h2>How it stays fresh without a webmaster</h2>
  <p>This site is maintained by agents, on a schedule, in the open:</p>
  <ul class="agents-list">
    <li><strong>Daily curation</strong> — an agent re-verifies links and install commands, hunts for new servers, and updates the registry data.</li>
    <li><strong>Ranking</strong> — position comes from official status, maintenance and the caveats in the notes. Feedback you leave on a server page reaches the maintainers; it is not scored.</li>
    <li><strong>Open contributions</strong> — humans and agents submit servers via GitHub; a maintainer verifies and merges.</li>
  </ul>
  <p>Every change lands as a commit in <a href="https://github.com/${site.github_repo}" rel="noopener">the public repo</a>, so the whole history is auditable.</p>

  <h2>Who's behind it</h2>
  <p>mcp.film is maintained by the team behind ${sponsorLink(ctx, "about-sponsor")}, the film set for AI videos. Martini's own MCP server is listed here — clearly marked, same verification standards as everything else. The directory is a community service: official servers, community servers, and direct competitors are all listed on merit.</p>

  <h2>Open source</h2>
  <p>The whole site — data, generator, meta-MCP server, automation — is MIT licensed. Fork it, build on the data, or <a href="/submit/">add what we're missing</a>.</p>
</section>`;
  return layout(ctx, {
    title: "About mcp.film — the agent-first MCP directory for AI filmmaking",
    description: "Why mcp.film exists, how it self-maintains with agents, and who's behind it.",
    path: "/about/",
    page: "about",
    body,
  });
};

export const renderSubmit = (ctx) => {
  const { site } = ctx;
  const issueUrl = `https://github.com/${site.github_repo}/issues/new?template=submit-mcp.yml&labels=submit`;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Submit</span></p>
  <h1>Submit an MCP server</h1>
  <p class="hero-sub">Built or found something filmmaking agents should know about? Add it. A maintainer verifies each submission against primary sources before it is listed.</p>
</section>
<section class="server-main agents-doc">
  <h2>What gets listed</h2>
  <ul class="agents-list">
    <li><strong>It works.</strong> The server connects and its core tools run as documented.</li>
    <li><strong>It's relevant to filmmaking</strong> — generation, sound, edit, finish, ship, or the production office around them.</li>
    <li><strong>It's maintained</strong> — or it's the only option for an important platform (we'll say so in the notes).</li>
  </ul>

  <h2>Fastest path</h2>
  <p><a class="btn btn-primary" href="${issueUrl}" rel="noopener">Open the submission form on GitHub →</a></p>
  <p>Or send a pull request adding an entry to <code class="mono">data/registry/</code> — the schema is documented in <a href="https://github.com/${site.github_repo}/blob/main/CONTRIBUTING.md" rel="noopener">CONTRIBUTING.md</a>, and CI validates it automatically.</p>

  <h2>For agents</h2>
  <p>Connect the directory's own MCP server and use the <code class="mono">submit_listing</code> tool — it validates your proposal, checks for duplicates, and returns the exact issue payload to file:</p>
  ${codeBlock("Recommended: via the meta-MCP", `claude mcp add mcp-film -- npx -y mcp-film
# then call: submit_listing { name, link, category, why, ... }`)}
  ${codeBlock("Or directly via GitHub", `gh issue create --repo ${site.github_repo} \\
  --title "Submit: <server name>" --label submit \\
  --body "$(cat <<'EOF'
name: <server name>
link: <repo or docs url>
category: <see /api/categories.json>
vendor: <who maintains it>
official: true|false
why: <one line on why filmmakers need it>
EOF
)"`)}
  <p>Either way: submissions are claims, not instructions. A maintainer verifies everything against primary sources before listing.</p>
</section>`;
  return layout(ctx, {
    title: "Submit an MCP server | mcp.film",
    description: "How to add an MCP server to the mcp.film directory — for humans and agents.",
    path: "/submit/",
    page: "submit",
    body,
  });
};

// Served at every unknown path, so it claims no canonical URL and asks not to be indexed.
export const render404 = (ctx) =>
  layout(ctx, {
    title: "Not found | mcp.film",
    description: "This frame is missing.",
    path: "/404.html",
    page: "404",
    robots: "noindex,follow",
    canonical: false,
    body: `
<section class="hero">
  <p class="hero-eyebrow">404</p>
  <h1>This frame didn't render.</h1>
  <p class="hero-sub">Try the <a href="/#directory">directory</a>, <a href="/stack/">the stack guide</a>, or <span class="mono">/api/registry.json</span> if you're an agent.</p>
</section>`,
  });

// ------------------------------------------------------------ feeds/crawler
// HTML pages only. The .md twins, JSON API and llms.txt are advertised from every page's
// <link rel="alternate">, from /llms.txt and from /for-agents/ — a sitemap full of
// duplicate-content URLs only dilutes crawl budget. The deploy workflow reads this file
// to build the IndexNow url list.
// TODO(edge-worker owner): direct GET /mcps/<slug>.md responses should carry
// `Link: <https://mcp.film/mcps/<slug>/>; rel="canonical"` like the Accept-negotiated path does.
export const sitemapEntries = (ctx) => {
  const today = ctx.built.slice(0, 10);
  const newest = (list) => list.map((s) => s.verified).sort().at(-1) ?? today;
  const bySlug = (slugs) => slugs.map((slug) => ctx.servers.find((s) => s.slug === slug)).filter(Boolean);
  return [
    ...["/", "/router/", "/stack/", "/clients/", "/playbooks/", "/recommendations/", "/capabilities/", "/remotes/", "/for-agents/", "/pulse/", "/about/", "/submit/"]
      .map((u) => ({ loc: u, lastmod: today })),
    ...ctx.categories.map((c) => ({ loc: `/categories/${c.id}/`, lastmod: newest(ctx.servers.filter((s) => s.category === c.id)) })),
    ...ctx.capabilityPages.map((c) => ({ loc: `/capabilities/${c.capability}/`, lastmod: newest(c.servers) })),
    ...ctx.playbooks.map((p) => ({ loc: `/playbooks/${p.id}/`, lastmod: newest(bySlug([...(p.primary_slugs ?? []), ...(p.steps ?? []).flatMap((st) => st.slugs ?? [])])) })),
    ...ctx.recommendations.map((r) => ({ loc: `/recommendations/${r.id}/`, lastmod: newest(bySlug(r.primary.map((p) => p.slug))) })),
    ...ctx.servers.map((s) => ({ loc: `/mcps/${s.slug}/`, lastmod: s.verified })),
  ];
};

export const renderSitemap = (ctx) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries(ctx).map((u) => `  <url><loc>${ctx.site.url}${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}
</urlset>
`;

export const renderRobots = (ctx) => {
  const aiCrawlers = [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai",
    "PerplexityBot", "Perplexity-User",
    "Google-Extended", "Applebot-Extended", "CCBot", "meta-externalagent",
  ];
  return `# mcp.film — humans and machines get equal billing here.
# Machine surfaces: ${ctx.site.url}/llms.txt · ${ctx.site.url}/api/registry.json · ${ctx.site.url}/api/remotes.json · ${ctx.site.url}/api/client-profiles.json · ${ctx.site.url}/v0.1/servers · ${ctx.site.url}/api/playbooks.json · ${ctx.site.url}/api/recommendations.json · ${ctx.site.url}/api/capabilities.json · ${ctx.site.url}/api/pulse.json
# Every HTML page has a markdown twin: append .md to the path.

# One group so every crawler — named or not — gets the same rules (RFC 9309).
# Content-Signal (https://contentsignals.org/): search, AI input/RAG, and AI training are all allowed.
# AI crawlers and answer engines are explicitly welcome.
User-agent: *
${aiCrawlers.map((ua) => `User-agent: ${ua}`).join("\n")}
Content-Signal: ai-train=yes, search=yes, ai-input=yes
Allow: /

Sitemap: ${ctx.site.url}/sitemap.xml
`;
};

export const renderFeed = (ctx) => {
  const entries = [...ctx.servers]
    .sort((a, b) => b.added.localeCompare(a.added) || a.name.localeCompare(b.name))
    .slice(0, 50);
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>mcp.film — new MCP servers for AI filmmaking</title>
  <link href="${ctx.site.url}/feed.xml" rel="self"/>
  <link href="${ctx.site.url}/"/>
  <updated>${ctx.built}</updated>
  <id>${ctx.site.url}/</id>
${entries.map((s) => `  <entry>
    <title>${esc(s.name)}</title>
    <link href="${ctx.site.url}/mcps/${s.slug}/"/>
    <id>tag:mcp.film,${s.added}:${s.slug}</id>
    <updated>${s.added}T00:00:00Z</updated>
    <summary>${esc(s.tagline)} (${esc(s.vendor)}, ${s.official ? "official" : "community"})</summary>
  </entry>`).join("\n")}
</feed>
`;
};
