import { PRICING_LABEL, avatar, badge, capabilityLink, capabilityMdLink, card, catById, claudeCodeCmd, cmdLike, cursorConfig, dataAttrs, desktopConfig, esc, keyUrlHtml, keyUrlMd, layout, nice, remoteBadge, remoteHeaders, remoteNeedsHeaders, serverDescription, sourceLinks, sponsorAttrs, verificationStatus } from "./_shared.mjs";
import { playbookSlugs } from "./playbooks.mjs";

// ------------------------------------------------------------ server detail
export const pairings = (ctx, s) => {
  const myStage = catById(ctx, s.category)?.stage;
  return ctx.servers
    .filter((o) => o.slug !== s.slug && o.category !== s.category)
    .map((o) => {
      let score = 0;
      const st = catById(ctx, o.category)?.stage;
      if (st === myStage) score += 2;
      if (o.official) score += 1;
      if (o.install?.remote_url) score += 1;
      return [score, o];
    })
    .sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))
    .slice(0, 3)
    .map(([, o]) => o);
};

// Same-category alternatives: shared capabilities, then official, then freshest verification.
export const siblings = (ctx, s) => {
  const caps = new Set(s.capabilities ?? []);
  return ctx.servers
    .filter((o) => o.slug !== s.slug && o.category === s.category)
    .map((o) => [(o.capabilities ?? []).filter((c) => caps.has(c)).length, o])
    .sort((a, b) => b[0] - a[0]
      || Number(Boolean(b[1].official)) - Number(Boolean(a[1].official))
      || b[1].verified.localeCompare(a[1].verified)
      || a[1].name.localeCompare(b[1].name))
    .slice(0, 6)
    .map(([, o]) => o);
};

// Playbooks and recommendation routes that list this server.
export const usedIn = (ctx, s) => [
  ...ctx.playbooks.filter((p) => playbookSlugs(p).includes(s.slug) || (p.fallback_slugs ?? []).includes(s.slug)).map((p) => ["playbooks", p]),
  ...ctx.recommendations
    .filter((r) => r.primary.some((p) => p.slug === s.slug) || (r.fallback_slugs ?? []).includes(s.slug))
    .map((r) => ["recommendations", r]),
];

export const codeBlock = (label, code, lang = "sh", copyAttrs = {}) => `
<div class="code-block">
  <div class="code-head"><span>${esc(label)}</span><button class="copy-btn" data-copy data-copy-label="${esc(label)}"${dataAttrs(copyAttrs)}>Copy</button></div>
  <pre class="mono" data-lang="${lang}"><code>${esc(code)}</code></pre>
</div>`;

export const renderServer = (ctx, s) => {
  const { site } = ctx;
  const cat = catById(ctx, s.category);
  const cc = claudeCodeCmd(s);
  const desktop = desktopConfig(s);
  const cursor = cursorConfig(s);
  const pairs = pairings(ctx, s);
  const alts = siblings(ctx, s);
  const uses = usedIn(ctx, s);
  const docsUrl = s.install?.docs_url ?? s.links?.docs;
  const verify = verificationStatus(ctx, s);
  const links = sourceLinks(ctx, s);

  const connect = [];
  if (s.install?.remote_url) {
    connect.push(codeBlock("Remote endpoint (Streamable HTTP)", s.install.remote_url, "txt", { "copy-kind": "connect", "copy-method": "remote_url", "copy-slug": s.slug }));
    if (remoteNeedsHeaders(s)) {
      const fallback = s.install?.stdio_command
        ? "Use the local stdio command when your client cannot attach custom MCP headers."
        : "Use a client that can attach custom MCP headers; this listing has no local stdio fallback.";
      connect.push(`<p class="connect-note">Remote headers required: ${remoteHeaders(s).map((h) => `<code class="mono">${esc(h)}</code>`).join(", ")}. ${fallback}</p>`);
    }
  }
  if (cc) connect.push(codeBlock("Claude Code", cc, "sh", { "copy-kind": "connect", "copy-method": "claude_code", "copy-slug": s.slug }));
  else if (docsUrl) connect.push(`<p class="connect-note">Connection is set up through the vendor's flow — follow the <a href="${esc(docsUrl)}" rel="noopener">official connect instructions</a>.</p>`);
  if (desktop) connect.push(codeBlock("Claude Desktop (claude_desktop_config.json)", desktop, "json", { "copy-kind": "connect", "copy-method": "claude_desktop", "copy-slug": s.slug }));
  if (cursor) connect.push(codeBlock("Cursor (.cursor/mcp.json)", cursor, "json", { "copy-kind": "connect", "copy-method": "cursor", "copy-slug": s.slug }));
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
    ...(s.install?.remote_url ? { operatingSystem: "Any" } : {}),
    datePublished: s.added,
    dateModified: s.verified,
    creator: { "@type": "Organization", name: s.vendor },
    ...(s.links?.site ? { sameAs: [s.links.site, s.links.repo].filter(Boolean) } : {}),
    ...(s.pricing === "free"
      ? { offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }
      : {}),
    // freemium is neither clearly free nor paid; leave it unset.
    ...(s.pricing === "free" ? { isAccessibleForFree: true } : {}),
    ...(s.pricing === "paid" || s.pricing === "credits" ? { isAccessibleForFree: false } : {}),
    ...(s.links?.docs ? { softwareHelp: { "@type": "CreativeWork", url: s.links.docs } } : {}),
    ...(s.install?.docs_url ? { installUrl: s.install.docs_url } : {}),
  };

  const body = `
<article class="server" data-slug="${s.slug}">
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/categories/${s.category}/">${esc(cat?.name ?? s.category)}</a> / <span>${esc(s.name)}</span></p>
  <div class="server-title">
    ${avatar(ctx, s, 46)}
    <h1>${esc(s.name)}</h1>
  </div>
  <p class="server-meta-line">${badge(s)}${remoteBadge(s)}<span>by ${esc(s.vendor)}</span><span>${PRICING_LABEL[s.pricing]}</span><span>verified ${nice(s.verified)}</span></p>
  <p class="server-tag">${esc(s.tagline)}</p>
</section>

<section class="server-body">
  <div class="server-main">
    <h2>What it does</h2>
    <p>${esc(s.description)}</p>

    <h2>Connect</h2>
    ${connect.join("\n")}
    <div class="auth-box">
      <strong>Auth:</strong> ${esc(s.auth?.type ?? "unknown")}${s.auth?.env_var ? ` · env <code class="mono">${esc(s.auth.env_var)}</code>` : ""}${s.auth?.key_url ? ` — ${keyUrlHtml(s.auth.key_url)}` : ""}
    </div>

    ${s.tools_sample?.length ? `<h2>Sample tools</h2><div class="chips">${s.tools_sample.map((t) => `<code class="chip mono">${esc(t)}</code>`).join("")}</div>` : ""}

    ${s.notes ? `<h2>Field notes</h2><p class="notes">${esc(s.notes)}</p>` : ""}

    ${alts.length ? `<h2>Also in ${esc(cat?.name ?? s.category)}</h2>
    <div class="grid grid-pairs">${alts.map((a) => card(ctx, a)).join("")}</div>` : ""}

    ${uses.length ? `<h2>Used in</h2>
    <p>${uses.map(([kind, u]) => `<a href="/${kind}/#${esc(u.id)}">${esc(u.title)}</a>`).join(" · ")}</p>` : ""}

    <h2>Pairs well with</h2>
    <div class="grid grid-pairs">${pairs.map((p) => card(ctx, p)).join("")}</div>
  </div>

  <aside class="server-side">
    <div class="side-box verify-box">
      <p class="foot-h">Verification</p>
      <p class="verify-status verify-${verify.tone}"><span aria-hidden="true"></span>${esc(verify.label)}</p>
      <dl class="verify-list">
        <div><dt>Last checked</dt><dd><time datetime="${s.verified}">${nice(s.verified)}</time></dd></div>
        <div><dt>Age</dt><dd>${esc(verify.age)}</dd></div>
        <div><dt>First listed</dt><dd><time datetime="${s.added}">${nice(s.added)}</time></dd></div>
        <div><dt>Sources</dt><dd>${links.length}</dd></div>
      </dl>
      <a href="/pulse/">Open catalog pulse</a>
    </div>
    <div class="side-box">
      <p class="foot-h">Capabilities</p>
      <p class="side-caps">${(s.capabilities ?? []).map((c) => capabilityLink(ctx, c)).join(" ")}</p>
    </div>
    <div class="side-box">
      <p class="foot-h">Links</p>
      ${links
        .map(([l, u, dest]) => `<a href="${esc(u)}" rel="noopener"${sponsorAttrs(ctx, dest, `server-links:${s.slug}:${l.toLowerCase()}`)}>${l} ↗</a>`)
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
        <p class="feedback-done" hidden>Sent — it reaches the maintainers. No reply promised.</p>
      </details>
      <a href="https://github.com/${site.github_repo}/issues/new?labels=correction&title=${encodeURIComponent(`[${s.slug}] correction`)}" rel="noopener">Open a GitHub issue ↗</a>
    </div>
  </aside>
</section>
</article>
<script type="application/json" id="server-data">${JSON.stringify(s)}</script>`;

  return layout(ctx, {
    title: `${s.name}${/MCP/i.test(s.name) ? "" : " MCP"} — ${cat?.name ?? s.category} | mcp.film`,
    description: serverDescription(s),
    path: `/mcps/${s.slug}/`,
    page: "server",
    md: `/mcps/${s.slug}.md`,
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
  const verify = verificationStatus(ctx, s);
  const links = sourceLinks(ctx, s);
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
  if (s.install?.remote_url) {
    lines.push(`- Remote endpoint: \`${s.install.remote_url}\``);
    if (remoteNeedsHeaders(s)) lines.push(`- Remote headers required: ${remoteHeaders(s).map((h) => `\`${h}\``).join(", ")}`);
  }
  if (cc) lines.push("- Claude Code: `" + cc + "`");
  if (s.install?.stdio_command) lines.push(`- Local: \`${s.install.stdio_command}\``);
  if (!s.install?.remote_url && !cc && !s.install?.stdio_command) {
    lines.push(`- Follow the vendor's instructions: ${s.install?.docs_url ?? s.links?.docs ?? s.links?.site ?? "see links below"}`);
  }
  lines.push(
    "",
    `**Auth:** ${s.auth?.type ?? "unknown"}${s.auth?.env_var ? ` (env \`${s.auth.env_var}\`)` : ""}${s.auth?.key_url ? ` — ${keyUrlMd(s.auth.key_url)}` : ""}`,
    "",
  );
  if (s.capabilities?.length) lines.push("## Capabilities", "", s.capabilities.map((c) => capabilityMdLink(ctx, c)).join(" · "), "");
  if (s.tools_sample?.length) lines.push("## Sample tools", "", s.tools_sample.map((t) => `\`${t}\``).join(" · "), "");
  if (s.notes) lines.push("## Field notes", "", s.notes, "");
  const alts = siblings(ctx, s);
  if (alts.length) lines.push("## Alternatives", "", ...alts.map((a) => `- [${a.name}](${ctx.site.url}/mcps/${a.slug}.md) — ${a.tagline}`), "");
  const uses = usedIn(ctx, s);
  if (uses.length) lines.push("## Used in", "", ...uses.map(([kind, u]) => `- [${u.title}](${ctx.site.url}/${kind}.md#${u.id})`), "");
  lines.push(
    "## Verification",
    "",
    `- Status: ${verify.label} (${verify.age})`,
    `- Added: ${s.added}`,
    `- Last verified: ${s.verified}`,
    `- Machine JSON: ${ctx.site.url}/api/mcps/${s.slug}.json`,
    "",
  );
  if (links.length) lines.push("## Links", "", ...links.map(([l, u]) => `- ${l}: ${u}`), "");
  lines.push("---", "", `Structured data: ${ctx.site.url}/api/mcps/${s.slug}.json · Directory: ${ctx.site.url}`,
    `Canonical: ${ctx.site.url}/mcps/${s.slug}/`,
    `Hosted directory MCP: ${ctx.site.url}/mcp`);
  return lines.join("\n") + "\n";
};
