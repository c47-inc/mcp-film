import { PRICING_LABEL, avatar, badge, catById, claudeCodeCmd, esc, layout, nice, remoteBadge, remoteHeaders, remoteServersFor } from "./_shared.mjs";

// --------------------------------------------------------------- remotes
export const renderRemotes = (ctx) => {
  const { site } = ctx;
  const remotes = remoteServersFor(ctx);
  const official = remotes.filter((s) => s.official).length;
  const oauth = remotes.filter((s) => s.auth?.type === "oauth").length;
  const apiKey = remotes.filter((s) => s.auth?.type === "api_key").length;
  const rows = remotes.map((s) => {
    const cat = catById(ctx, s.category);
    const cc = claudeCodeCmd(s);
    const headers = remoteHeaders(s);
    return `
  <article class="remote-row">
    <div class="remote-ident">
      ${avatar(ctx, s, 36)}
      <div>
        <h2><a href="/mcps/${s.slug}/">${esc(s.name)}</a></h2>
        <p class="remote-meta">${badge(s)}${remoteBadge(s)}<span>${esc(cat?.name ?? s.category)}</span><span>${esc(PRICING_LABEL[s.pricing] ?? s.pricing)}</span><span>verified ${nice(s.verified)}</span></p>
        <p class="remote-tag">${esc(s.tagline)}</p>
      </div>
    </div>
    <div class="remote-connect">
      <span class="label">Endpoint</span>
      <code class="mono">${esc(s.install.remote_url)}</code>
      ${headers.length ? `<p class="remote-auth">Headers: ${headers.map((h) => `<code class="mono">${esc(h)}</code>`).join(" ")}</p>` : ""}
    </div>
    <div class="remote-connect">
      <span class="label">Claude Code</span>
      <code class="mono">${esc(cc ?? "Use the vendor connect flow")}</code>
      <p class="remote-auth">Auth: ${esc(s.auth?.type ?? "unknown")}${s.auth?.env_var ? ` · ${esc(s.auth.env_var)}` : ""}</p>
    </div>
  </article>`;
  }).join("");

  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Remotes</span></p>
  <h1>Hosted MCP remotes</h1>
  <p class="hero-sub">Remote MCP endpoints for filmmaking agents: no local stdio process, no package install, usually OAuth or a platform key. This is the fastest path for web agents, Claude, ChatGPT-style connectors, and production automations.</p>
</section>

<section class="pulse-grid remote-stats" aria-label="Hosted remote summary">
  <div><span>${remotes.length}</span><p>hosted remotes</p></div>
  <div><span>${official}</span><p>official</p></div>
  <div><span>${oauth}</span><p>OAuth</p></div>
  <div><span>${apiKey}</span><p>API key</p></div>
</section>

<section class="remote-doc">
  <div class="agent-hint"><strong>Agent path:</strong> use <a href="/api/remotes.json">/api/remotes.json</a> for structured endpoint data, or <a href="/remotes.md">/remotes.md</a> for a clean markdown copy. The full registry remains at <a href="/api/registry.json">/api/registry.json</a>.</div>
  <div class="remote-list" aria-label="Hosted remote MCP servers">
    ${rows}
  </div>
</section>`;

  return layout(ctx, {
    title: "Hosted MCP remotes for AI filmmaking | mcp.film",
    description: "Hosted remote MCP endpoints for AI filmmaking agents: Streamable HTTP and SSE servers that connect without a local stdio process.",
    path: "/remotes/",
    page: "remotes",
    md: "/remotes.md",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Hosted MCP remotes for AI filmmaking",
        description: "Hosted MCP endpoints for AI filmmaking agents.",
        url: site.url + "/remotes/",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: remotes.length,
          itemListElement: remotes.map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: s.name,
            url: `${site.url}/mcps/${s.slug}/`,
          })),
        },
      },
    ],
  });
};

export const renderRemotesMd = (ctx) => {
  const remotes = remoteServersFor(ctx);
  const lines = [
    "# Hosted MCP remotes",
    "",
    "> MCP endpoints for filmmaking agents that connect over HTTPS without a local stdio process.",
    "",
    `Structured data: ${ctx.site.url}/api/remotes.json`,
    `Full registry: ${ctx.site.url}/api/registry.json`,
    "",
  ];
  for (const s of remotes) {
    const cat = catById(ctx, s.category);
    const cc = claudeCodeCmd(s);
    const headers = remoteHeaders(s);
    lines.push(
      `## ${s.name}`,
      "",
      s.tagline,
      "",
      `- Listing: ${ctx.site.url}/mcps/${s.slug}/`,
      `- Category: ${cat?.name ?? s.category}`,
      `- Official: ${s.official ? "yes" : "no"}`,
      `- Pricing: ${PRICING_LABEL[s.pricing] ?? s.pricing}`,
      `- Auth: ${s.auth?.type ?? "unknown"}${s.auth?.env_var ? ` (${s.auth.env_var})` : ""}`,
      `- Verified: ${s.verified}`,
      "",
      "Endpoint:",
      "",
      "```text",
      s.install.remote_url,
      "```",
      "",
    );
    if (headers.length) lines.push(`Required headers: ${headers.map((h) => `\`${h}\``).join(", ")}`, "");
    if (cc) {
      lines.push("Claude Code:", "", "```sh", cc, "```", "");
    }
    if (s.notes) lines.push(`Notes: ${s.notes}`, "");
  }
  return lines.join("\n") + "\n";
};
