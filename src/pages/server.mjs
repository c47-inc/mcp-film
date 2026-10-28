import { PRICING_LABEL, authLabel, avatar, badge, breadcrumbLd, capabilityLink, capabilityMdLink, card, catById, caveatsFor, claudeCodeCmd, cmdLike, cursorConfig, dataAttrs, desktopConfig, esc, isInactive, keyUrlHtml, keyUrlMd, layout, nice, organizationLd, remoteHeaders, remoteNeedsHeaders, serverDescription, sourceLinks, sponsorAttrs, statusBlurb, statusLabel, verificationStatus } from "./_shared.mjs";
import { playbookSlugs } from "./playbooks.mjs";
import { comparisonsFor } from "./compare.mjs";
import { appHubLinksHtml, appHubLinksMd } from "./apps.mjs";
import { serverFaq, serverFaqHtml, serverFaqLd, serverMetaDescription, serverTitle } from "./server-faq.mjs";
import { evidenceRowsHtml, probeLinesHtml, probeLinesMd } from "./_health.mjs";
import { badgeSnippets, badgeState } from "../badge.mjs";

// ------------------------------------------------------------ server detail
export const pairings = (ctx, s) => {
  const myStage = catById(ctx, s.category)?.stage;
  return ctx.servers
    .filter((o) => o.slug !== s.slug && o.category !== s.category && !isInactive(o))
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
    .filter((o) => o.slug !== s.slug && o.category === s.category && !isInactive(o))
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
  <pre class="mono" data-lang="${lang}" tabindex="0"><code>${esc(code)}</code></pre>
</div>`;

const hostedLabel = (s) => (s.install?.remote_url ? "Hosted remote" : "Local");
const docsUrlFor = (s) => s.install?.docs_url ?? s.links?.docs ?? null;

// Per-client connect sections. Each is an <h3> so a reader (or a crawler) can land on
// "Connect Runway MCP to Cursor" directly. Copy attributes stay as app.js expects them.
export const connectSections = (ctx, s) => {
  const cc = claudeCodeCmd(s);
  const desktop = desktopConfig(s);
  const cursor = cursorConfig(s);
  const docsUrl = docsUrlFor(s);
  const copy = (method) => ({ "copy-kind": "connect", "copy-method": method, "copy-slug": s.slug });
  const vendorFlow = docsUrl
    ? `<p class="connect-note">Connection is set up through the vendor's flow — follow the <a href="${esc(docsUrl)}" rel="noopener">official connect instructions</a>.</p>`
    : `<p class="connect-note">No copy-pastable command is verified for this client yet.</p>`;
  const sections = [];

  if (s.install?.cli) {
    sections.push({
      id: "connect-cli",
      title: `${s.name} CLI`,
      html: codeBlock("Shell", s.install.cli, "sh", copy("cli"))
        + (s.install.cli_docs ? `<p class="connect-note">Shell-equipped agents can drive the same tools from the terminal. <a href="${esc(s.install.cli_docs)}" rel="noopener">CLI docs ↗</a></p>` : ""),
    });
  }

  sections.push({
    id: "connect-claude-code",
    title: `Connect ${s.name} to Claude Code`,
    html: cc ? codeBlock("Claude Code", cc, "sh", copy("claude_code")) : vendorFlow,
  });

  if (s.install?.remote_url && !remoteNeedsHeaders(s)) {
    sections.push({
      id: "connect-claude-desktop",
      title: `Connect ${s.name} to Claude Desktop`,
      html: `<p class="connect-note">Settings → Connectors → Add custom connector → paste <code class="mono">${esc(s.install.remote_url)}</code>. Claude Desktop connects to hosted servers natively; the config file below is the fallback for accounts without the Connectors panel.</p>`
        + (desktop ? codeBlock("Fallback: claude_desktop_config.json via mcp-remote", desktop, "json", copy("claude_desktop")) : ""),
    });
  } else if (desktop) {
    sections.push({
      id: "connect-claude-desktop",
      title: `Connect ${s.name} to Claude Desktop`,
      html: codeBlock("Claude Desktop (claude_desktop_config.json)", desktop, "json", copy("claude_desktop")),
    });
  }

  if (cursor) {
    sections.push({
      id: "connect-cursor",
      title: `Connect ${s.name} to Cursor`,
      html: codeBlock("Cursor (.cursor/mcp.json)", cursor, "json", copy("cursor")),
    });
  }

  if (s.install?.remote_url) {
    let note = "";
    if (remoteNeedsHeaders(s)) {
      const fallback = s.install?.stdio_command
        ? "Use the local stdio command when your client cannot attach custom MCP headers."
        : "Use a client that can attach custom MCP headers; this listing has no local stdio fallback.";
      note = `<p class="connect-note">Remote headers required: ${remoteHeaders(s).map((h) => `<code class="mono">${esc(h)}</code>`).join(", ")}. ${fallback}</p>`;
    }
    sections.push({
      id: "connect-remote",
      title: "Hosted endpoint for other MCP clients",
      html: codeBlock("Remote endpoint (Streamable HTTP)", s.install.remote_url, "txt", copy("remote_url")) + note,
    });
  }

  if (s.install?.stdio_command && !cmdLike(s.install.stdio_command, s.install)) {
    sections.push({
      id: "connect-local",
      title: "Local install",
      html: `<p class="connect-note">${esc(s.install.stdio_command)}</p>`,
    });
  }
  return sections;
};

// For the listing's maintainers, below everything a reader came for. Inactive listings keep
// their badge file (so existing embeds show the status) but are not offered one here.
export const badgeSection = (ctx, s) => {
  if (isInactive(s)) return "";
  const b = badgeSnippets(ctx.site.url, s);
  const copy = (method) => ({ "copy-kind": "badge", "copy-method": method, "copy-slug": s.slug });
  return `<details class="notes-details badge-details" id="badge">
      <summary>Badge for your README</summary>
      <p class="connect-note">Maintain ${esc(s.name)}? Link back to this listing. The badge shows the month it was last verified and updates when the curator re-checks it.</p>
      <p class="badge-preview"><img src="/badge/${esc(s.slug)}.svg" alt="${esc(badgeState(s).title)}" height="20" loading="lazy" decoding="async"></p>
      ${codeBlock("Markdown", b.markdown, "md", copy("markdown"))}
      ${codeBlock("HTML", b.html, "html", copy("html"))}
    </details>`;
};

export const renderServer = (ctx, s) => {
  const { site } = ctx;
  const cat = catById(ctx, s.category);
  const pairs = pairings(ctx, s);
  const alts = siblings(ctx, s);
  const uses = usedIn(ctx, s);
  const compared = comparisonsFor(ctx, s.slug);
  const verify = verificationStatus(ctx, s);
  const links = sourceLinks(ctx, s);
  const caveats = caveatsFor(s);
  const connect = connectSections(ctx, s);
  const inactive = isInactive(s);
  const faq = serverFaq(ctx, s);
  const faqLd = serverFaqLd(faq);

  const factLinks = links
    .map(([l, u, dest]) => `<a href="${esc(u)}" rel="noopener"${sponsorAttrs(ctx, dest, `server-links:${s.slug}:${l.toLowerCase()}`)}>${l} ↗</a>`)
    .join("");

  const ld = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: s.name,
    description: s.description,
    url: `${site.url}/mcps/${s.slug}/`,
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "MCP Server",
    operatingSystem: "Any",
    datePublished: s.added,
    dateModified: s.verified ?? s.added,
    creator: { "@type": "Organization", name: s.vendor },
    publisher: organizationLd(ctx),
    ...(s.links?.site ? { sameAs: [s.links.site, s.links.repo].filter(Boolean) } : {}),
    // Only a free listing gets an offer; freemium, paid and credits have no price we can state.
    ...(s.pricing === "free"
      ? { offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, isAccessibleForFree: true }
      : {}),
    ...(s.pricing === "paid" || s.pricing === "credits" ? { isAccessibleForFree: false } : {}),
    ...(s.links?.docs ? { softwareHelp: { "@type": "CreativeWork", url: s.links.docs } } : {}),
    ...(s.install?.docs_url ? { installUrl: s.install.docs_url } : {}),
  };

  const body = `
<article class="server" data-slug="${s.slug}"${inactive ? ` data-status="${esc(s.status)}"` : ""}>
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/categories/${s.category}/">${esc(cat?.name ?? s.category)}</a> / <span>${esc(s.name)}</span></p>
  <div class="server-title">
    ${avatar(ctx, s, 46)}
    <h1>${esc(s.name)}</h1>
  </div>
  <p class="server-tag">${esc(s.tagline)}</p>
  <p class="server-meta-line server-facts">${badge(s)}<span>${hostedLabel(s)}</span><span>${esc(authLabel(s))}</span><span>${PRICING_LABEL[s.pricing] ?? esc(s.pricing)}</span><span>verified <time datetime="${s.verified}">${nice(s.verified)}</time></span>${factLinks}</p>
  ${appHubLinksHtml(ctx, s)}
  ${!inactive && s.install?.remote_url ? `<div class="server-url">${codeBlock("MCP server URL", s.install.remote_url, "text", { "copy-kind": "connect", "copy-method": "remote-url", "copy-slug": s.slug })}</div>` : ""}
  ${inactive ? `<p class="status-notice status-${esc(s.status)}" role="note"><strong>${esc(statusLabel(s))}.</strong> ${esc(statusBlurb(s))} <a href="#notes">See the curator notes.</a></p>` : ""}
</section>

<section class="server-body">
  <div class="server-main">
    ${caveats.length ? `<h2 id="caveats">Caveats</h2>
    <ul class="caveats">${caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}

    <h2 id="what">What it does</h2>
    <p>${esc(s.description)}</p>

    <h2 id="auth">Auth</h2>
    <div class="auth-box">
      <strong>${esc(authLabel(s))}</strong>${s.auth?.env_var ? ` · env <code class="mono">${esc(s.auth.env_var)}</code>` : ""}${s.auth?.key_url ? ` — ${keyUrlHtml(s.auth.key_url)}` : ""}
    </div>

    <h2 id="connect">Connect</h2>
    ${connect.map((c) => `<h3 id="${c.id}">${esc(c.title)}</h3>\n    ${c.html}`).join("\n")}

    ${s.tools_sample?.length ? `<h2 id="tools">Sample tools</h2><div class="chips">${s.tools_sample.map((t) => `<code class="chip mono">${esc(t)}</code>`).join("")}</div>` : ""}

    ${s.notes ? `<h2 id="notes">Field notes</h2>
    <details class="notes-details"${inactive ? " open" : ""}>
      <summary>Full curator notes (verified ${nice(s.verified)})</summary>
      <p class="notes">${esc(s.notes)}</p>
    </details>` : ""}

    ${alts.length ? `<h2 id="also-in">Also in ${esc(cat?.name ?? s.category)}</h2>
    <div class="grid grid-pairs" data-track-section="server-also-in">${alts.map((a) => card(ctx, a)).join("")}</div>` : ""}

    ${serverFaqHtml(faq)}

    ${compared.length ? `<h2 id="compared">Compared with</h2>
    <p class="compared-links" data-track-section="server-compared">${compared.map((c) => `<a href="/compare/${esc(c.id)}/">${esc(c.title)}</a>`).join(" · ")}</p>` : ""}

    ${uses.length ? `<h2 id="used-in">Used in</h2>
    <p>${uses.map(([kind, u]) => `<a href="/${kind}/${esc(u.id)}/">${esc(u.title)}</a>`).join(" · ")}</p>` : ""}

    <h2 id="pairs">Pairs well with</h2>
    <div class="grid grid-pairs" data-track-section="server-pairs">${pairs.map((p) => card(ctx, p)).join("")}</div>

    ${badgeSection(ctx, s)}
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
        ${evidenceRowsHtml(ctx, s)}
      </dl>
      ${probeLinesHtml(ctx, s)}
      <a href="/changes/">Recent changes</a>
    </div>
    <div class="side-box">
      <p class="foot-h">Capabilities</p>
      <p class="side-caps">${(s.capabilities ?? []).map((c) => capabilityLink(ctx, c)).join(" ")}</p>
    </div>
    <div class="side-box">
      <p class="foot-h">Links</p>
      ${factLinks}
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
    title: serverTitle(ctx, s),
    description: serverMetaDescription(s),
    path: `/mcps/${s.slug}/`,
    page: "server",
    md: `/mcps/${s.slug}.md`,
    body,
    jsonLd: [
      ld,
      ...(faqLd ? [faqLd] : []),
      breadcrumbLd(ctx, [
        { name: cat?.name ?? s.category, item: `${site.url}/categories/${s.category}/` },
        { name: s.name },
      ]),
    ],
  });
};

// ----------------------------------------------------------- markdown twins
export const renderServerMd = (ctx, s, { faq: withFaq = true } = {}) => {
  const cat = catById(ctx, s.category);
  const cc = claudeCodeCmd(s);
  const desktop = desktopConfig(s);
  const cursor = cursorConfig(s);
  const verify = verificationStatus(ctx, s);
  const links = sourceLinks(ctx, s);
  const caveats = caveatsFor(s);
  const docsUrl = docsUrlFor(s);
  const lines = [
    `# ${s.name}`,
    "",
    `> ${s.tagline}`,
    "",
  ];
  if (isInactive(s)) lines.push(`**Status: ${statusLabel(s).toLowerCase()}.** ${statusBlurb(s)}`, "");
  else if (s.install?.remote_url) lines.push(`**MCP server URL:** \`${s.install.remote_url}\``, "");
  lines.push(
    `- **Category:** ${cat?.name ?? s.category}`,
    `- **Vendor:** ${s.vendor} (${s.official ? "official" : "community"})`,
    `- **Status:** ${statusLabel(s).toLowerCase()}`,
    `- **Hosting:** ${s.install?.remote_url ? "hosted remote" : "local"}`,
    `- **Auth:** ${authLabel(s)}${s.auth?.env_var ? ` (env \`${s.auth.env_var}\`)` : ""}`,
    `- **Pricing:** ${s.pricing}`,
    `- **Verified:** ${s.verified}`,
    ...appHubLinksMd(ctx, s),
    "",
  );
  if (caveats.length) lines.push("## Caveats", "", ...caveats.map((c) => `- ${c}`), "");
  lines.push("## What it does", "", s.description, "");
  lines.push("## Auth", "", `${authLabel(s)}${s.auth?.env_var ? ` (env \`${s.auth.env_var}\`)` : ""}${s.auth?.key_url ? ` — ${keyUrlMd(s.auth.key_url)}` : ""}`, "");
  lines.push("## Connect", "");
  if (s.install?.cli) {
    lines.push(`### ${s.name} CLI`, "", "```sh", s.install.cli, "```", "");
    if (s.install.cli_docs) lines.push(`CLI docs: ${s.install.cli_docs}`, "");
  }
  lines.push(`### Connect ${s.name} to Claude Code`, "");
  if (cc) lines.push("```sh", cc, "```", "");
  else lines.push(docsUrl ? `Set up through the vendor's flow: ${docsUrl}` : "No copy-pastable command is verified for this client yet.", "");
  if (s.install?.remote_url && !remoteNeedsHeaders(s)) {
    lines.push(`### Connect ${s.name} to Claude Desktop`, "", `Settings → Connectors → Add custom connector → paste \`${s.install.remote_url}\`. The config file below is the fallback for accounts without the Connectors panel.`, "");
    if (desktop) lines.push("```json", desktop, "```", "");
  } else if (desktop) {
    lines.push(`### Connect ${s.name} to Claude Desktop`, "", "claude_desktop_config.json:", "", "```json", desktop, "```", "");
  }
  if (cursor) lines.push(`### Connect ${s.name} to Cursor`, "", ".cursor/mcp.json:", "", "```json", cursor, "```", "");
  if (s.install?.remote_url) {
    lines.push("### Hosted endpoint for other MCP clients", "", `- Remote endpoint (Streamable HTTP): \`${s.install.remote_url}\``);
    if (remoteNeedsHeaders(s)) lines.push(`- Remote headers required: ${remoteHeaders(s).map((h) => `\`${h}\``).join(", ")}`);
    lines.push("");
  }
  if (s.install?.stdio_command && !cmdLike(s.install.stdio_command, s.install)) lines.push("### Local install", "", s.install.stdio_command, "");
  if (!s.install?.remote_url && !cc && !s.install?.stdio_command) {
    lines.push(`Follow the vendor's instructions: ${s.install?.docs_url ?? s.links?.docs ?? s.links?.site ?? "see links below"}`, "");
  }
  if (s.capabilities?.length) lines.push("## Capabilities", "", s.capabilities.map((c) => capabilityMdLink(ctx, c)).join(" · "), "");
  if (s.tools_sample?.length) lines.push("## Sample tools", "", s.tools_sample.map((t) => `\`${t}\``).join(" · "), "");
  if (s.notes) lines.push(`## Field notes (verified ${s.verified})`, "", s.notes, "");
  const alts = siblings(ctx, s);
  if (alts.length) lines.push("## Alternatives", "", ...alts.map((a) => `- [${a.name}](${ctx.site.url}/mcps/${a.slug}.md) — ${a.tagline}`), "");
  const compared = comparisonsFor(ctx, s.slug);
  if (compared.length) lines.push("## Compared with", "", ...compared.map((c) => `- [${c.title}](${ctx.site.url}/compare/${c.id}.md)`), "");
  const uses = usedIn(ctx, s);
  if (uses.length) lines.push("## Used in", "", ...uses.map(([kind, u]) => `- [${u.title}](${ctx.site.url}/${kind}/${u.id}.md)`), "");
  lines.push(
    "## Verification",
    "",
    `- Status: ${verify.label} (${verify.age})`,
    `- Added: ${s.added}`,
    `- Last verified: ${s.verified}`,
    ...probeLinesMd(ctx, s),
    `- Machine JSON: ${ctx.site.url}/api/mcps/${s.slug}.json`,
    "",
  );
  if (links.length) lines.push("## Links", "", ...links.map(([l, u]) => `- ${l}: ${u}`), "");
  const faq = withFaq ? serverFaq(ctx, s) : [];
  if (faq.length) lines.push("## Common questions", "", ...faq.flatMap((i) => [`**${i.q}**`, i.text, ""]));
  lines.push("---", "", `Structured data: ${ctx.site.url}/api/mcps/${s.slug}.json · Directory: ${ctx.site.url}`,
    `Canonical: ${ctx.site.url}/mcps/${s.slug}/`,
    `Hosted directory MCP: ${ctx.site.url}/mcp`);
  return lines.join("\n") + "\n";
};
