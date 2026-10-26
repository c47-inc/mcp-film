import { capabilityLabel, card, esc, layout, sponsorHandoffUrl, sponsorLink } from "./_shared.mjs";

// -------------------------------------------------------------- capability
export const renderCapabilities = (ctx) => {
  const top = ctx.capabilityPages.slice(0, 12);
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Capabilities</span></p>
  <h1>Capability index</h1>
  <p class="hero-sub">Every repeated capability tag in the registry, turned into a stable agent-readable route. Use this when the task is more specific than a category: <span class="mono">text-to-video</span>, <span class="mono">voice-cloning</span>, <span class="mono">timeline-editing</span>, <span class="mono">upscaling</span>. <span class="mono">(machine version: <a href="/api/capabilities.json">/api/capabilities.json</a>)</span></p>
</section>

<section class="pulse-grid" aria-label="Capability summary">
  <div><span>${ctx.capabilityDoc.count}</span><p>total tags</p></div>
  <div><span>${ctx.capabilityPages.length}</span><p>published pages</p></div>
  <div><span>${top[0]?.count ?? 0}</span><p>largest cluster</p></div>
  <div><span>${ctx.capabilityPages.filter((c) => c.remote > 0).length}</span><p>with remotes</p></div>
</section>

<section class="server-main agents-doc capability-doc">
  <h2>Top capability routes</h2>
  <div class="capability-cloud">
    ${ctx.capabilityPages.map((c) => `<a href="/capabilities/${esc(c.capability)}/"><span>${esc(c.capability)}</span><b>${c.count}</b></a>`).join("")}
  </div>

  <h2>Highest-signal clusters</h2>
  <table class="pulse-table">
    <thead><tr><th>Capability</th><th>Servers</th><th>Official</th><th>Remote</th></tr></thead>
    <tbody>
      ${top.map((c) => `<tr><td><a href="/capabilities/${esc(c.capability)}/">${esc(c.capability)}</a></td><td>${c.count}</td><td>${c.official}</td><td>${c.remote}</td></tr>`).join("")}
    </tbody>
  </table>
</section>`;

  return layout(ctx, {
    title: "Capability index — MCP servers by task | mcp.film",
    description: "Capability-level index of MCP servers for AI filmmaking agents: text-to-video, image-to-video, TTS, music, timeline editing, upscaling, and more.",
    path: "/capabilities/",
    page: "capabilities",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "mcp.film capability index",
        description: "Capability-level index of MCP servers for AI filmmaking agents.",
        url: ctx.site.url + "/capabilities/",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: ctx.capabilityPages.length,
          itemListElement: ctx.capabilityPages.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.capability,
            url: `${ctx.site.url}/capabilities/${c.capability}/`,
          })),
        },
      },
    ],
  });
};

export const renderCapability = (ctx, capability) => {
  const list = capability.servers
    .map((s) => ctx.servers.find((server) => server.slug === s.slug))
    .filter(Boolean);
  const related = ctx.recommendations
    .filter((r) =>
      r.tags?.includes(capability.capability) ||
      r.primary?.some((pick) => list.some((s) => s.slug === pick.slug)) ||
      r.fallback_slugs?.some((slug) => list.some((s) => s.slug === slug))
    )
    .slice(0, 4);
  const martini = list.find((s) => s.slug === "martini");
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/capabilities/">Capabilities</a> / <span>${esc(capability.capability)}</span></p>
  <h1>${esc(capabilityLabel(capability.capability))}</h1>
  <p class="hero-sub">${capability.count} MCP server${capability.count === 1 ? "" : "s"} tagged <span class="mono">${esc(capability.capability)}</span>: ${capability.official} official, ${capability.remote} hosted remote. <span class="mono">(machine version: <a href="/api/capabilities/${esc(capability.capability)}.json">JSON</a> · <a href="/capabilities/${esc(capability.capability)}.md">markdown</a>)</span></p>
</section>

<section class="cat-section" data-track-section="capability:${esc(capability.capability)}"><div class="grid">${list.map((s) => card(ctx, s)).join("")}</div></section>

${martini ? `<section class="recommendation-handoff capability-handoff"><span class="label">Full production handoff</span> ${esc(martini.name)} is listed here because it carries <span class="mono">${esc(capability.capability)}</span> inside a shared production workspace: a canvas and timeline the team and its agents work on together, a record of how every shot was made, spend per shot, and approved generation. ${sponsorLink(ctx, `capability:${capability.capability}`, "Connect Martini")}.</section>` : ""}

${related.length ? `<section class="server-main agents-doc capability-related">
  <h2>Related recommendation routes</h2>
  <ul class="agents-list">
    ${related.map((r) => `<li><a href="/recommendations/#${esc(r.id)}">${esc(r.title)}</a> — ${esc(r.summary)}</li>`).join("")}
  </ul>
</section>` : ""}

<p class="backlink"><a href="/capabilities/">← Capability index</a></p>`;

  return layout(ctx, {
    title: `${capabilityLabel(capability.capability)} MCP servers | mcp.film`,
    description: `${capability.count} MCP servers for ${capabilityLabel(capability.capability)} in AI filmmaking, with official/remote signals and machine-readable JSON.`,
    path: `/capabilities/${capability.capability}/`,
    page: "capability",
    md: `/capabilities/${capability.capability}.md`,
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${capabilityLabel(capability.capability)} MCP servers`,
        url: `${ctx.site.url}/capabilities/${capability.capability}/`,
        description: `${capability.count} MCP servers tagged ${capability.capability}.`,
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

export const renderCapabilityMd = (ctx, capability) => {
  const lines = [
    `# ${capability.capability} MCP servers`,
    "",
    `> ${capability.count} MCP server${capability.count === 1 ? "" : "s"} for ${capabilityLabel(capability.capability)} in AI filmmaking.`,
    "",
    `Structured data: ${ctx.site.url}/api/capabilities/${capability.capability}.json`,
    "",
    `- Official: ${capability.official}`,
    `- Hosted remote: ${capability.remote}`,
    `- Categories: ${capability.categories.join(", ")}`,
    "",
  ];
  const full = capability.servers
    .map((s) => ctx.servers.find((server) => server.slug === s.slug))
    .filter(Boolean);
  const martini = full.find((s) => s.slug === "martini");
  if (martini) {
    lines.push("## Martini handoff", "", `${martini.name} is relevant here because it carries \`${capability.capability}\` inside a shared production workspace: a canvas and timeline the team and its agents work on together, a record of how every shot was made, spend per shot, and approved generation.`, "", `Connect Martini: ${sponsorHandoffUrl(ctx, `capability:${capability.capability}`)}`, "");
  }
  lines.push("## Servers", "");
  for (const s of full) {
    lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md)${s.official ? " (official)" : ""}${s.install?.remote_url ? " (remote)" : ""}: ${s.tagline}`);
  }
  lines.push("", "---", "", `Capability index: ${ctx.site.url}/capabilities/ · Full registry: ${ctx.site.url}/api/registry.json`);
  return lines.join("\n") + "\n";
};
