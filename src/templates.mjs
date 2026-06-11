/**
 * Page templates for mcp.film. Plain template literals — no framework.
 * Every public page has a machine twin (markdown or JSON); keep them in sync
 * when editing.
 */

// ------------------------------------------------------------------ helpers
export const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const nice = (iso) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00Z" : "")).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });

const PRICING_LABEL = { free: "free", freemium: "freemium", paid: "paid", credits: "credits" };

const truncate = (s, n) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n).replace(/\s+\S*$/, "");
  return cut + "…";
};

const catById = (ctx, id) => ctx.categories.find((c) => c.id === id);

// A command is copy-pastable only if it has no prose in it.
const cmdLike = (cmd) =>
  typeof cmd === "string" && !cmd.includes("(") && !/\bafter\b|\bclone\b|\bthen\b/i.test(cmd);

export const claudeCodeCmd = (s) => {
  if (s.install?.claude_code && cmdLike(s.install.claude_code)) return s.install.claude_code;
  if (s.install?.remote_url) return `claude mcp add --transport http ${s.slug} ${s.install.remote_url}`;
  if (cmdLike(s.install?.stdio_command)) return `claude mcp add ${s.slug} -- ${s.install.stdio_command}`;
  return null;
};

const desktopConfig = (s) => {
  if (s.install?.remote_url) {
    return JSON.stringify(
      { mcpServers: { [s.slug]: { command: "npx", args: ["-y", "mcp-remote", s.install.remote_url] } } },
      null, 2);
  }
  const cmd = s.install?.stdio_command;
  if (!cmdLike(cmd) || /["']/.test(cmd)) return null;
  const parts = cmd.split(/\s+/);
  const conf = { command: parts[0], args: parts.slice(1) };
  if (s.auth?.env_var) conf.env = { [s.auth.env_var]: "YOUR_KEY_HERE" };
  return JSON.stringify({ mcpServers: { [s.slug]: conf } }, null, 2);
};

const cursorConfig = (s) => {
  if (s.install?.remote_url) {
    return JSON.stringify({ mcpServers: { [s.slug]: { url: s.install.remote_url } } }, null, 2);
  }
  const cmd = s.install?.stdio_command;
  if (!cmdLike(cmd) || /["']/.test(cmd)) return null;
  const parts = cmd.split(/\s+/);
  const conf = { command: parts[0], args: parts.slice(1) };
  if (s.auth?.env_var) conf.env = { [s.auth.env_var]: "YOUR_KEY_HERE" };
  return JSON.stringify({ mcpServers: { [s.slug]: conf } }, null, 2);
};

const ratingFor = (ctx, slug) => {
  const r = ctx.ratings?.[slug];
  return r && r.votes > 0 ? r : null;
};

// The film pipeline, in order. Categories map to stages via categories.json.
export const STAGES = [
  { id: "develop", name: "Develop", blurb: "Script, beats, boards, plans — spend thought before you spend credits." },
  { id: "visualize", name: "Visualize", blurb: "Stills, concept frames, and start frames that lock the look." },
  { id: "shoot", name: "Shoot", blurb: "The virtual cameras: video models, studios, worlds, and performers." },
  { id: "sound", name: "Sound", blurb: "Dialogue, score, and effects — half the picture is what you hear." },
  { id: "cut", name: "Cut", blurb: "Assembly, editing, captions: where the film actually gets made." },
  { id: "finish", name: "Finish", blurb: "Upscale, enhance, and master the delivery files." },
  { id: "ship", name: "Ship", blurb: "Review, publish, distribute — and run the production office." },
];

// ------------------------------------------------------------------- layout
const posthogSnippet = (site) => {
  const key = site.analytics?.posthog_key;
  if (!key) return "";
  return `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('${key}',{api_host:'${site.analytics.posthog_host}',person_profiles:'never',autocapture:false})
</script>`;
};

const layout = (ctx, { title, description, path: pagePath, body, jsonLd = [], page = "" }) => {
  const { site } = ctx;
  const url = site.url + pagePath;
  const ld = jsonLd.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="mcp.film">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${site.url}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="alternate" type="application/atom+xml" title="New MCP servers" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
${ld}
${posthogSnippet(site)}
</head>
<body data-page="${page}">
<header class="site-head">
  <a class="brand" href="/"><svg class="brand-mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><rect width="18" height="18" rx="4.5" fill="#0d0d0d"/><rect x="3.5" y="8" width="11" height="1.6" rx="0.8" fill="#fff"/><rect x="3.5" y="11.2" width="7" height="1.6" rx="0.8" fill="#fff" opacity=".55"/></svg><span>mcp<span class="brand-dot">.</span>film</span></a>
  <nav class="site-nav">
    <a href="/#directory">Directory</a>
    <a href="/stack/">The Stack</a>
    <a href="/for-agents/">For Agents</a>
    <a href="/about/">About</a>
    <a class="nav-gh" href="https://github.com/${site.github_repo}" rel="noopener">GitHub</a>
    <a class="nav-cta" href="/submit/">Submit</a>
  </nav>
</header>
<main>
${body}
</main>
<footer class="site-foot">
  <div class="foot-grid">
    <div>
      <p class="foot-brand">mcp.film</p>
      <p class="foot-blurb">${esc(site.tagline)} Curated, verified, and self-updating — maintained by agents, supervised by the team behind <a href="${site.sponsor.url}" rel="noopener">${esc(site.sponsor.name)}</a>.</p>
    </div>
    <div class="foot-col">
      <p class="foot-h">Humans</p>
      <a href="/stack/">The AI Film Stack</a>
      <a href="/submit/">Submit a server</a>
      <a href="/about/">About</a>
      <a href="https://github.com/${site.github_repo}" rel="noopener">Source on GitHub</a>
    </div>
    <div class="foot-col">
      <p class="foot-h">Agents</p>
      <a href="/llms.txt">llms.txt</a>
      <a href="/api/registry.json">registry.json</a>
      <a href="/for-agents/">Agent docs</a>
      <a href="/feed.xml">Atom feed</a>
    </div>
  </div>
  <p class="foot-meta">Last build ${nice(ctx.built.slice(0, 10))} · ${ctx.servers.length} servers · <span class="mono">curl -s ${site.url}/llms.txt</span></p>
</footer>
<script src="/assets/app.js" defer></script>
</body>
</html>`;
};

// -------------------------------------------------------------------- cards
const badge = (s) =>
  s.official
    ? `<span class="tag tag-official" title="Maintained by the platform vendor">Official</span>`
    : `<span class="tag" title="Community-maintained">Community</span>`;

const remoteBadge = (s) =>
  s.install?.remote_url ? `<span class="tag" title="Hosted remote MCP — no local install">Remote</span>` : "";

// "Community (samuelgursky)" → "samuelgursky"; "Martini (C47)" → "Martini"
const vendorShort = (v) => {
  const m = /^Community \((.+?)\)/.exec(v);
  return m ? m[1] : v.replace(/\s*\(.*\)$/, "");
};

const card = (ctx, s) => {
  const r = ratingFor(ctx, s.slug);
  const caps = (s.capabilities ?? []).slice(0, 2).join(" · ");
  const extra = [s.install?.remote_url ? "remote" : null, PRICING_LABEL[s.pricing] ?? s.pricing]
    .filter(Boolean).join(" · ");
  return `<a class="card" href="/mcps/${s.slug}/" data-search="${esc([s.name, s.vendor, s.tagline, s.category, ...(s.capabilities ?? [])].join(" ").toLowerCase())}" data-cat="${s.category}">
  <div class="card-head">
    <span class="avatar" aria-hidden="true">${esc(s.name[0].toUpperCase())}</span>
    <span class="card-id"><span class="card-name">${esc(s.name)}</span><span class="card-vendor">${esc(vendorShort(s.vendor))}</span></span>
    ${s.official ? `<span class="tag tag-official">Official</span>` : ""}
  </div>
  <p class="card-tag">${esc(s.tagline)}</p>
  <div class="card-meta"><span class="card-caps">${esc(caps)}</span><span class="card-extra">${esc(extra)}${r ? ` · ★ ${r.avg.toFixed(1)}` : ""}</span></div>
</a>`;
};

// --------------------------------------------------------------------- home
export const renderHome = (ctx) => {
  const { site, categories, servers } = ctx;
  const featured = servers.filter((s) => s.featured);
  const byCat = (id) => servers.filter((s) => s.category === id);

  const featuredHtml = featured.map((s) => `
  <a class="feature" href="/mcps/${s.slug}/">
    <div class="feature-eyebrow">Featured studio</div>
    <div class="feature-name">${esc(s.name)} ${badge(s)}</div>
    <p class="feature-tag">${esc(s.tagline)}</p>
    <p class="feature-desc">${esc(truncate(s.description, 170))}</p>
    <span class="feature-cta">Open the listing</span>
  </a>`).join("");

  const sections = categories
    .map((cat) => {
      const list = byCat(cat.id);
      if (!list.length) return "";
      return `
<section class="cat-section" id="${cat.id}" data-cat-section="${cat.id}">
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
  <p class="hero-eyebrow"><span class="dot">●</span> The MCP directory for AI filmmaking</p>
  <h1>Every tool your agent needs to make a film.</h1>
  <p class="hero-sub">A curated directory of <strong>Model Context Protocol</strong> servers across the production stack: video models, voices, scores, edit bays, finishing suites, and the pipes to ship it. Verified by hand and by agent, updated continuously.</p>
  <div class="hero-cta">
    <a class="btn btn-primary" href="#directory">Browse the directory</a>
    <a class="btn" href="/stack/">The AI Film Stack</a>
  </div>
  <p class="hero-stats"><span><b>${ctx.servers.length}</b> servers</span><span><b>${ctx.officialCount}</b> official</span><span><b>${ctx.remoteCount}</b> hosted remote</span><span><b>${categories.length}</b> categories</span><span><b>${nice(ctx.built.slice(0, 10))}</b> last verified</span></p>
</section>

<section class="featured-row">${featuredHtml}
  <div class="agent-callout">
    <div class="feature-eyebrow">For agents</div>
    <p>This site is machine-first. One request gets you everything:</p>
    <pre class="mono">curl -s ${site.url}/api/registry.json</pre>
    <p>Or start at <a href="/llms.txt" class="mono">/llms.txt</a> · <a href="/for-agents/">full agent docs</a></p>
  </div>
</section>

<div class="directory" id="directory">
  <aside class="dir-side">
    <div class="search-wrap">
      <input id="search" type="search" placeholder="Search servers" autocomplete="off" aria-label="Search servers">
      <kbd>/</kbd>
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
    <p class="no-results" id="no-results" hidden>Nothing in the catalog matches that. <a href="/submit/">Know a server we're missing?</a></p>
    ${sections}
  </div>
</div>`;

  return layout(ctx, {
    title: site.title,
    description: site.description,
    path: "/",
    page: "home",
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
          target: { "@type": "EntryPoint", urlTemplate: site.url + "/?q={search_term_string}" },
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

// ------------------------------------------------------------ server detail
const pairings = (ctx, s) => {
  const myStage = catById(ctx, s.category)?.stage;
  return ctx.servers
    .filter((o) => o.slug !== s.slug && o.category !== s.category)
    .map((o) => {
      let score = 0;
      const st = catById(ctx, o.category)?.stage;
      if (st === myStage) score += 2;
      if (o.official) score += 1;
      if (o.featured) score += 2;
      if (o.install?.remote_url) score += 1;
      return [score, o];
    })
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, 3)
    .map(([, o]) => o);
};

const codeBlock = (label, code, lang = "sh") => `
<div class="code-block">
  <div class="code-head"><span>${esc(label)}</span><button class="copy-btn" data-copy>Copy</button></div>
  <pre class="mono" data-lang="${lang}"><code>${esc(code)}</code></pre>
</div>`;

export const renderServer = (ctx, s) => {
  const { site } = ctx;
  const cat = catById(ctx, s.category);
  const r = ratingFor(ctx, s.slug);
  const cc = claudeCodeCmd(s);
  const desktop = desktopConfig(s);
  const cursor = cursorConfig(s);
  const pairs = pairings(ctx, s);
  const docsUrl = s.install?.docs_url ?? s.links?.docs;

  const connect = [];
  if (s.install?.remote_url) {
    connect.push(codeBlock("Remote endpoint (Streamable HTTP)", s.install.remote_url, "txt"));
  }
  if (cc) connect.push(codeBlock("Claude Code", cc));
  else if (docsUrl) connect.push(`<p class="connect-note">Connection is set up through the vendor's flow — follow the <a href="${esc(docsUrl)}" rel="noopener">official connect instructions</a>.</p>`);
  if (desktop) connect.push(codeBlock("Claude Desktop (claude_desktop_config.json)", desktop, "json"));
  if (cursor) connect.push(codeBlock("Cursor (.cursor/mcp.json)", cursor, "json"));
  if (!cmdLike(s.install?.stdio_command) && s.install?.stdio_command) {
    connect.push(`<p class="connect-note">Local install: ${esc(s.install.stdio_command)}</p>`);
  }

  const ld = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: s.name,
    description: s.description,
    url: `${site.url}/mcps/${s.slug}/`,
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "MCP Server",
    operatingSystem: "Any",
    creator: { "@type": "Organization", name: s.vendor },
    ...(s.links?.site ? { sameAs: [s.links.site, s.links.repo].filter(Boolean) } : {}),
    ...(s.pricing === "free"
      ? { offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }
      : {}),
    ...(r
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: r.avg.toFixed(1), ratingCount: r.votes, bestRating: 5, worstRating: 1 } }
      : {}),
  };

  const body = `
<article class="server" data-slug="${s.slug}">
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/categories/${s.category}/">${esc(cat?.name ?? s.category)}</a> / <span>${esc(s.name)}</span></p>
  <div class="server-title">
    <span class="avatar" aria-hidden="true">${esc(s.name[0].toUpperCase())}</span>
    <h1>${esc(s.name)}</h1>
  </div>
  <p class="server-meta-line">${badge(s)}${remoteBadge(s)}<span>by ${esc(s.vendor)}</span><span>${PRICING_LABEL[s.pricing]}</span><span>verified ${nice(s.verified)}</span></p>
  <p class="server-tag">${esc(s.tagline)}</p>
  <div class="rate" data-slug="${s.slug}">
    <span class="rate-label">Rate it:</span>
    <span class="stars" role="group" aria-label="Rate this server from 1 to 5 stars">
      ${[1, 2, 3, 4, 5].map((n) => `<button class="star" data-star="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}
    </span>
    <span class="rate-agg">${r ? `${r.avg.toFixed(1)} · ${r.votes} rating${r.votes > 1 ? "s" : ""}` : "no ratings yet"}</span>
  </div>
</section>

<section class="server-body">
  <div class="server-main">
    <h2>What it does</h2>
    <p>${esc(s.description)}</p>

    <h2>Connect</h2>
    ${connect.join("\n")}
    <div class="auth-box">
      <strong>Auth:</strong> ${esc(s.auth?.type ?? "unknown")}${s.auth?.env_var ? ` · env <code class="mono">${esc(s.auth.env_var)}</code>` : ""}${s.auth?.key_url ? ` — ${esc(s.auth.key_url)}` : ""}
    </div>

    ${s.tools_sample?.length ? `<h2>Tools you'll see</h2><div class="chips">${s.tools_sample.map((t) => `<code class="chip mono">${esc(t)}</code>`).join("")}</div>` : ""}

    ${s.notes ? `<h2>Field notes</h2><p class="notes">${esc(s.notes)}</p>` : ""}

    <h2>Pairs well with</h2>
    <div class="grid grid-pairs">${pairs.map((p) => card(ctx, p)).join("")}</div>
  </div>

  <aside class="server-side">
    <div class="side-box">
      <p class="foot-h">Capabilities</p>
      <p class="side-caps">${(s.capabilities ?? []).map(esc).join(" · ")}</p>
    </div>
    <div class="side-box">
      <p class="foot-h">Links</p>
      ${[["Site", s.links?.site], ["Docs", s.links?.docs], ["Repo", s.links?.repo]]
        .filter(([, u]) => u)
        .map(([l, u]) => `<a href="${esc(u)}" rel="noopener">${l} ↗</a>`)
        .join("")}
    </div>
    <div class="side-box">
      <p class="foot-h">For agents</p>
      <a href="/api/mcps/${s.slug}.json" class="mono">${s.slug}.json</a>
      <a href="/mcps/${s.slug}.md" class="mono">${s.slug}.md</a>
    </div>
    <div class="side-box">
      <p class="foot-h">Something off?</p>
      <details class="feedback">
        <summary>Leave feedback</summary>
        <textarea rows="3" placeholder="Broken link, stale info, better alternative…" aria-label="Feedback"></textarea>
        <button class="btn feedback-send">Send</button>
        <p class="feedback-done" hidden>Thanks — the curator agent reads these.</p>
      </details>
      <a href="https://github.com/${site.github_repo}/issues/new?labels=correction&title=${encodeURIComponent(`[${s.slug}] correction`)}" rel="noopener">Open a GitHub issue ↗</a>
    </div>
  </aside>
</section>
</article>
<script type="application/json" id="server-data">${JSON.stringify(s)}</script>`;

  return layout(ctx, {
    title: `${s.name} — ${s.tagline} | mcp.film`,
    description: s.description.slice(0, 250),
    path: `/mcps/${s.slug}/`,
    page: "server",
    body,
    jsonLd: [
      ld,
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "mcp.film", item: site.url + "/" },
          { "@type": "ListItem", position: 2, name: cat?.name ?? s.category, item: `${site.url}/categories/${s.category}/` },
          { "@type": "ListItem", position: 3, name: s.name },
        ],
      },
    ],
  });
};

// ----------------------------------------------------------- markdown twins
export const renderServerMd = (ctx, s) => {
  const cat = catById(ctx, s.category);
  const cc = claudeCodeCmd(s);
  const lines = [
    `# ${s.name}`,
    "",
    `> ${s.tagline}`,
    "",
    `- **Category:** ${cat?.name ?? s.category}`,
    `- **Vendor:** ${s.vendor} (${s.official ? "official" : "community"})`,
    `- **Pricing:** ${s.pricing}`,
    `- **Verified:** ${s.verified}`,
    "",
    "## What it does",
    "",
    s.description,
    "",
    "## Connect",
    "",
  ];
  if (s.install?.remote_url) lines.push(`- Remote endpoint: \`${s.install.remote_url}\``);
  if (cc) lines.push("- Claude Code: `" + cc + "`");
  if (s.install?.stdio_command) lines.push(`- Local: \`${s.install.stdio_command}\``);
  if (!s.install?.remote_url && !cc && !s.install?.stdio_command) {
    lines.push(`- Follow the vendor's instructions: ${s.install?.docs_url ?? s.links?.docs ?? s.links?.site ?? "see links below"}`);
  }
  lines.push(
    "",
    `**Auth:** ${s.auth?.type ?? "unknown"}${s.auth?.env_var ? ` (env \`${s.auth.env_var}\`)` : ""}${s.auth?.key_url ? ` — ${s.auth.key_url}` : ""}`,
    "",
  );
  if (s.capabilities?.length) lines.push("## Capabilities", "", s.capabilities.map((c) => `\`${c}\``).join(" · "), "");
  if (s.tools_sample?.length) lines.push("## Sample tools", "", s.tools_sample.map((t) => `\`${t}\``).join(" · "), "");
  if (s.notes) lines.push("## Field notes", "", s.notes, "");
  const links = [["Site", s.links?.site], ["Docs", s.links?.docs], ["Repo", s.links?.repo]].filter(([, u]) => u);
  if (links.length) lines.push("## Links", "", ...links.map(([l, u]) => `- ${l}: ${u}`), "");
  lines.push("---", "", `Structured data: ${ctx.site.url}/api/mcps/${s.slug}.json · Directory: ${ctx.site.url}`);
  return lines.join("\n") + "\n";
};

// -------------------------------------------------------------------- stack
const stackStageData = (ctx) =>
  STAGES.map((stage) => ({
    ...stage,
    cats: ctx.categories
      .filter((c) => c.stage === stage.id)
      .map((c) => ({ cat: c, servers: ctx.servers.filter((s) => s.category === c.id) }))
      .filter((g) => g.servers.length),
  })).filter((st) => st.cats.length);

export const renderStack = (ctx) => {
  const stages = stackStageData(ctx);
  const starter = ["martini", "fal", "elevenlabs", "davinci-resolve", "youtube-yutu"]
    .map((slug) => ctx.servers.find((s) => s.slug === slug))
    .filter(Boolean);

  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>The Stack</span></p>
  <h1>The AI Film Stack</h1>
  <p class="hero-sub">An opinionated walk through the pipeline: what your agent connects at each stage of making a film, from blank page to published cut. <span class="mono">(machine version: <a href="/stack.md">/stack.md</a>)</span></p>
</section>

<section class="starter">
  <h2>The five-connection starter kit</h2>
  <p>If you connect nothing else, connect these. One studio, one model hub, one voice, one edit bay, one distribution pipe — a complete film pipeline in five MCP servers.</p>
  <div class="grid">${starter.map((s) => card(ctx, s)).join("")}</div>
</section>

${stages.map((st, i) => `
<section class="stage">
  <div class="stage-head">
    <span class="stage-num">${String(i + 1).padStart(2, "0")}</span>
    <h2>${esc(st.name)}</h2>
    <p class="cat-blurb">${esc(st.blurb)}</p>
  </div>
  ${st.cats.map((g) => `
  <div class="stage-cat">
    <h3><a href="/categories/${g.cat.id}/">${esc(g.cat.name)}</a></h3>
    <ul class="stage-list">
      ${g.servers.map((s) => `<li><a href="/mcps/${s.slug}/">${esc(s.name)}</a>${s.official ? ' <span class="tag tag-official">Official</span>' : ""} — ${esc(s.tagline)}</li>`).join("")}
    </ul>
  </div>`).join("")}
</section>`).join("")}`;

  return layout(ctx, {
    title: "The AI Film Stack — a pipeline guide to MCP filmmaking | mcp.film",
    description: "An opinionated walk through the AI filmmaking pipeline: which MCP servers your agent should connect at every stage, from script to distribution.",
    path: "/stack/",
    page: "stack",
    body,
  });
};

export const renderStackMd = (ctx) => {
  const stages = stackStageData(ctx);
  const lines = [
    "# The AI Film Stack (mcp.film)",
    "",
    "> Which MCP servers an agent should connect at each stage of making a film.",
    "",
  ];
  for (const st of stages) {
    lines.push(`## ${st.name}`, "", st.blurb, "");
    for (const g of st.cats) {
      lines.push(`### ${g.cat.name}`, "");
      for (const s of g.servers) {
        lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md)${s.official ? " (official)" : ""}: ${s.tagline}`);
      }
      lines.push("");
    }
  }
  lines.push("---", "", `Full registry: ${ctx.site.url}/api/registry.json`);
  return lines.join("\n") + "\n";
};

// --------------------------------------------------------------- for agents
export const renderForAgents = (ctx) => {
  const { site } = ctx;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>For Agents</span></p>
  <h1>Built for agents first</h1>
  <p class="hero-sub">If you're an AI agent (or you're building one), every page here has a machine twin. No scraping required — and no JavaScript needed: everything is server-rendered.</p>
</section>

<section class="server-main agents-doc">
  <h2>The one-request answer</h2>
  ${codeBlock("Everything: all servers, categories, ratings", `curl -s ${site.url}/api/registry.json`)}
  <p>Stable JSON, regenerated on every site build. Fields per server: <code class="mono">slug, name, vendor, official, category, tagline, description, capabilities, tools_sample, install.{claude_code, remote_url, stdio_command}, auth, pricing, links, added, verified, notes</code>.</p>

  <h2>All machine surfaces</h2>
  <ul class="agents-list">
    <li><code class="mono">/llms.txt</code> — spec-compliant index (llmstxt.org format)</li>
    <li><code class="mono">/llms-full.txt</code> — the whole directory inlined as one markdown document</li>
    <li><code class="mono">/api/registry.json</code> — full structured registry (also <code class="mono">.min.json</code>)</li>
    <li><code class="mono">/api/mcps/{slug}.json</code> — one server, structured</li>
    <li><code class="mono">/mcps/{slug}.md</code> — one server, clean markdown</li>
    <li><code class="mono">/stack.md</code> — the pipeline guide as markdown</li>
    <li><code class="mono">/api/stats.json</code> — counts and freshness</li>
    <li><code class="mono">/feed.xml</code> — Atom feed of newly added servers</li>
    <li>JSON-LD (<code class="mono">SoftwareApplication</code>, <code class="mono">ItemList</code>) embedded in every page's static HTML</li>
  </ul>

  <h2>Connect the directory itself (meta-MCP)</h2>
  <p>mcp.film ships its own MCP server, so your agent can query the catalog as tools — <code class="mono">search_film_mcps</code>, <code class="mono">get_film_mcp</code>, <code class="mono">get_install_config</code>, <code class="mono">plan_film_stack</code>:</p>
  ${codeBlock("Claude Code", "claude mcp add mcp-film -- npx -y mcp-film")}
  <p>It fetches the live registry and falls back to a bundled snapshot offline. Source lives in <a href="https://github.com/${site.github_repo}/tree/main/packages/mcp-server" rel="noopener">packages/mcp-server</a>.</p>

  <h2>Picking servers: conventions we use</h2>
  <ul class="agents-list">
    <li><strong>official: true</strong> means the platform vendor maintains it. Prefer these.</li>
    <li><strong>install.remote_url</strong> means hosted Streamable HTTP — no local process, usually OAuth.</li>
    <li><strong>auth.env_var</strong> names the key your runtime needs before connecting.</li>
    <li><strong>notes</strong> carry the caveats that bite agents: quota limits, ToS gray areas, local-app requirements.</li>
    <li><strong>verified</strong> is the date a human-or-agent last confirmed the server works as listed.</li>
  </ul>

  <h2>Submitting & correcting</h2>
  <p>Agents are welcome to contribute. Open an issue with the <code class="mono">submit</code> label on <a href="https://github.com/${site.github_repo}/issues" rel="noopener">GitHub</a> (or a PR against <code class="mono">data/registry/</code>). A curator agent triages weekly; entries that verify get merged and deployed automatically.</p>
</section>`;
  return layout(ctx, {
    title: "For Agents — machine-readable surfaces of mcp.film",
    description: "How AI agents should consume mcp.film: llms.txt, the JSON registry API, markdown twins, the Atom feed, and the mcp-film meta-MCP server.",
    path: "/for-agents/",
    page: "agents",
    body,
  });
};

export const renderForAgentsMd = (ctx) => `# mcp.film — agent access guide

> Every page on mcp.film has a machine twin. Start with /api/registry.json.

- Full registry (JSON): ${ctx.site.url}/api/registry.json
- Index (llms.txt): ${ctx.site.url}/llms.txt
- Whole directory, one markdown file: ${ctx.site.url}/llms-full.txt
- One server: ${ctx.site.url}/api/mcps/{slug}.json or ${ctx.site.url}/mcps/{slug}.md
- Pipeline guide: ${ctx.site.url}/stack.md
- New additions feed: ${ctx.site.url}/feed.xml
- Meta-MCP server: \`claude mcp add mcp-film -- npx -y mcp-film\`

Server fields: slug, name, vendor, official (bool), category, tagline, description,
capabilities[], tools_sample[], install.{claude_code,remote_url,stdio_command},
auth.{type,env_var,key_url}, pricing (free|freemium|paid|credits), links, added,
verified (last confirmed working), notes (caveats worth reading).

To submit or correct an entry: open an issue or PR at https://github.com/${ctx.site.github_repo}.
`;

// ----------------------------------------------------------- llms.txt et al
export const renderLlmsTxt = (ctx) => {
  const { site, servers, categories } = ctx;
  const lines = [
    "# mcp.film",
    "",
    `> ${site.description}`,
    "",
    `${servers.length} servers across ${categories.length} categories, each verified and annotated with install commands, auth requirements, and caveats. Full structured data at ${site.url}/api/registry.json. Every HTML page has a markdown twin (append .md).`,
    "",
    "## Start here",
    "",
    `- [Full registry JSON](${site.url}/api/registry.json): every server, structured`,
    `- [Agent access guide](${site.url}/for-agents.md): all machine surfaces`,
    `- [The AI Film Stack](${site.url}/stack.md): pipeline guide — what to connect at each stage`,
    "",
    "## Servers",
    "",
    ...servers.map((s) => `- [${s.name}](${site.url}/mcps/${s.slug}.md): ${s.tagline}`),
    "",
    "## Optional",
    "",
    `- [Directory index](${site.url}/index.md): categories overview`,
    `- [Whole directory inline](${site.url}/llms-full.txt): everything in one file`,
    `- [Atom feed](${site.url}/feed.xml): newly added servers`,
  ];
  return lines.join("\n") + "\n";
};

export const renderLlmsFull = (ctx) => {
  const head = [
    "# mcp.film — full directory",
    "",
    `> ${ctx.site.description}`,
    "",
    `Generated ${ctx.built}. ${ctx.servers.length} servers. Canonical JSON: ${ctx.site.url}/api/registry.json`,
    "",
    "---",
    "",
  ].join("\n");
  const body = ctx.servers.map((s) => renderServerMd(ctx, s)).join("\n---\n\n");
  return head + body + "\n---\n\n" + renderStackMd(ctx);
};

export const renderIndexMd = (ctx) => {
  const lines = [
    "# mcp.film — directory index",
    "",
    `> ${ctx.site.tagline}`,
    "",
  ];
  for (const cat of ctx.categories) {
    const list = ctx.servers.filter((s) => s.category === cat.id);
    if (!list.length) continue;
    lines.push(`## ${cat.name}`, "", cat.blurb, "");
    for (const s of list) lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.tagline}`);
    lines.push("");
  }
  return lines.join("\n") + "\n";
};

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
    <li><strong>Weekly curation</strong> — an agent re-verifies links and install commands, hunts for new servers, and updates the registry data.</li>
    <li><strong>Community signal</strong> — your ratings and feedback are captured as analytics events and rolled into the rankings each week.</li>
    <li><strong>Open contributions</strong> — humans and agents submit servers via GitHub; a triage agent verifies and merges.</li>
  </ul>
  <p>Every change lands as a commit in <a href="https://github.com/${site.github_repo}" rel="noopener">the public repo</a>, so the whole history is auditable.</p>

  <h2>Who's behind it</h2>
  <p>${esc(site.sponsor.blurb)} Martini's own MCP server is listed here — clearly marked, same verification standards as everything else. The directory is a community service: official servers, community servers, and direct competitors are all listed on merit.</p>

  <h2>Open source</h2>
  <p>The whole site — data, generator, meta-MCP server, automation — is MIT licensed. Fork it, build on the data, or <a href="/submit/">add what we're missing</a>.</p>
</section>`;
  return layout(ctx, {
    title: "About mcp.film — the self-updating MCP directory for AI filmmaking",
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
  <p class="hero-sub">Built or found something filmmaking agents should know about? Add it. A curator agent verifies submissions weekly and merges what checks out.</p>
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
  ${codeBlock("Submit via GitHub API", `gh issue create --repo ${site.github_repo} \\
  --label submit --title "Submit: <server name>" \\
  --body "$(cat <<'EOF'
name: <server name>
vendor: <who maintains it>
official: true|false
category: <see /api/categories.json>
repo_or_docs: <url>
why: <one line on why filmmakers need it>
EOF
)"`)}
</section>`;
  return layout(ctx, {
    title: "Submit an MCP server | mcp.film",
    description: "How to add an MCP server to the mcp.film directory — for humans and agents.",
    path: "/submit/",
    page: "submit",
    body,
  });
};

export const render404 = (ctx) =>
  layout(ctx, {
    title: "Not found | mcp.film",
    description: "This frame is missing.",
    path: "/404.html",
    page: "404",
    body: `
<section class="hero">
  <p class="hero-eyebrow">404</p>
  <h1>This frame didn't render.</h1>
  <p class="hero-sub">Try the <a href="/#directory">directory</a>, <a href="/stack/">the stack guide</a>, or <span class="mono">/api/registry.json</span> if you're an agent.</p>
</section>`,
  });

// ------------------------------------------------------------ feeds/crawler
export const renderSitemap = (ctx) => {
  const urls = [
    "/", "/stack/", "/for-agents/", "/about/", "/submit/",
    ...ctx.categories.map((c) => `/categories/${c.id}/`),
    ...ctx.servers.map((s) => `/mcps/${s.slug}/`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ctx.site.url}${u}</loc><lastmod>${ctx.built.slice(0, 10)}</lastmod></url>`).join("\n")}
</urlset>
`;
};

export const renderRobots = (ctx) => `# mcp.film welcomes agents and crawlers.
# Machine-readable everything: ${ctx.site.url}/llms.txt and ${ctx.site.url}/api/registry.json

User-agent: *
Allow: /

Sitemap: ${ctx.site.url}/sitemap.xml
`;

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
