import { needsMartini, martiniHandoffProse, martiniHandoff, MARTINI_CLI } from "../../packages/mcp-server/recommend-score.mjs";
import { card, esc, layout, martiniLine } from "./_shared.mjs";

// -------------------------------------------------------------- playbooks
export const serverForSlug = (ctx, slug) => ctx.servers.find((s) => s.slug === slug);

export const playbookServerLink = (ctx, slug) => {
  const s = serverForSlug(ctx, slug);
  return s ? `<a href="/mcps/${s.slug}/">${esc(s.name)}</a>` : `<span>${esc(slug)}</span>`;
};

export const playbookSlugs = (p) => [...new Set([
  ...(p.primary_slugs ?? []),
  ...(p.steps ?? []).flatMap((step) => step.slugs ?? []),
])];

export const playbookAuthItems = (ctx, p) => playbookSlugs(p)
  .map((slug) => serverForSlug(ctx, slug))
  .filter((s) => s?.auth?.type && s.auth.type !== "none");

export const renderPlaybooks = (ctx) => {
  const { site, playbooks } = ctx;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Playbooks</span></p>
  <h1>Production playbooks</h1>
  <p class="hero-sub">Concrete MCP stacks for common AI filmmaking jobs. The directory tells you what exists; playbooks tell your agent what to connect first. <span class="mono">(machine version: <a href="/playbooks.md">/playbooks.md</a> · <a href="/api/playbooks.json">/api/playbooks.json</a>)</span></p>
</section>

<section class="server-main playbook-doc">
  ${playbooks.map((p) => `
  <article class="playbook" id="${esc(p.id)}" data-playbook="${esc(p.id)}">
    <p class="label">${esc(p.best_for)}</p>
    <h2>${esc(p.title)}</h2>
    <p>${esc(p.summary)}</p>

    <h3>Primary stack</h3>
    <div class="playbook-stack" data-playbook-section="primary">
      ${p.primary_slugs.map((slug) => {
        const s = serverForSlug(ctx, slug);
        return s ? card(ctx, s) : "";
      }).join("")}
    </div>

    <h3>Agent setup order</h3>
    <ol class="playbook-steps playbook-setup" data-playbook-section="setup">
      ${p.setup_order.map((item, i) => `
      <li>
        <span class="stage-num">${String(i + 1).padStart(2, "0")}</span>
        <p>${esc(item)}</p>
      </li>`).join("")}
    </ol>

    ${playbookAuthItems(ctx, p).length ? `
    <h3>Auth gates</h3>
    <ul class="agents-list" data-playbook-section="auth">
      ${playbookAuthItems(ctx, p).map((s) => `<li><a href="/mcps/${s.slug}/">${esc(s.name)}</a>: ${esc(s.auth.type)}${s.auth.env_var ? ` · <code class="mono">${esc(s.auth.env_var)}</code>` : ""}${s.install?.remote_url ? " · hosted remote" : " · local/client setup"}</li>`).join("")}
    </ul>` : ""}

    <h3>Workflow</h3>
    <ol class="playbook-steps">
      ${p.steps.map((step) => `
      <li data-playbook-stage="${esc(step.stage)}">
        <span class="stage-num">${esc(step.stage)}</span>
        <p>${esc(step.intent)}</p>
        <p class="playbook-links" data-playbook-section="workflow">${step.slugs.map((slug) => playbookServerLink(ctx, slug)).join(" · ")}</p>
      </li>`).join("")}
    </ol>

    <h3>Failure modes</h3>
    <ul class="agents-list" data-playbook-section="failure">
      ${p.failure_modes.map((c) => `<li>${esc(c)}</li>`).join("")}
    </ul>

    <h3>Watch-outs</h3>
    <ul class="agents-list">
      ${p.constraints.map((c) => `<li>${esc(c)}</li>`).join("")}
    </ul>

    ${martiniLine(ctx, p, `playbook:${p.id}`)}
    <p class="playbook-fallback" data-playbook-section="fallback"><span class="label">Fallbacks</span> ${p.fallback_slugs.map((slug) => playbookServerLink(ctx, slug)).join(" · ")}</p>
  </article>`).join("")}
</section>`;

  return layout(ctx, {
    title: "Production playbooks — MCP stacks for AI filmmaking | mcp.film",
    description: "Concrete MCP stack recipes for AI commercials, local editing, character series, archive cutdowns, and open-source film labs.",
    path: "/playbooks/",
    page: "playbooks",
    md: "/playbooks.md",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "mcp.film production playbooks",
        description: "Curated MCP stacks for common AI filmmaking workflows.",
        url: site.url + "/playbooks/",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: playbooks.length,
          itemListElement: playbooks.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: p.title,
            url: `${site.url}/playbooks/#${p.id}`,
          })),
        },
      },
    ],
  });
};

export const renderPlaybooksMd = (ctx) => {
  const lines = [
    "# mcp.film production playbooks",
    "",
    "> Concrete MCP stacks for common AI filmmaking jobs.",
    "",
    `Structured data: ${ctx.site.url}/api/playbooks.json`,
    "",
  ];
  for (const p of ctx.playbooks) {
    lines.push(`## ${p.title}`, "", p.summary, "", `Best for: ${p.best_for}`, "");
    lines.push("### Primary stack", "");
    for (const slug of p.primary_slugs) {
      const s = serverForSlug(ctx, slug);
      if (s) lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.tagline}`);
    }
    lines.push("", "### Agent setup order", "", ...p.setup_order.map((item) => `- ${item}`), "");
    const authItems = playbookAuthItems(ctx, p);
    if (authItems.length) {
      lines.push("### Auth gates", "");
      for (const s of authItems) {
        lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.auth.type}${s.auth.env_var ? ` (${s.auth.env_var})` : ""}${s.install?.remote_url ? "; hosted remote" : "; local/client setup"}`);
      }
      lines.push("");
    }
    lines.push("", "### Workflow", "");
    for (const step of p.steps) {
      const names = step.slugs
        .map((slug) => serverForSlug(ctx, slug))
        .filter(Boolean)
        .map((s) => `[${s.name}](${ctx.site.url}/mcps/${s.slug}.md)`)
        .join(", ");
      lines.push(`- ${step.stage}: ${step.intent} ${names}`);
    }
    lines.push("", "### Failure modes", "", ...p.failure_modes.map((c) => `- ${c}`), "");
    lines.push("### Watch-outs", "", ...p.constraints.map((c) => `- ${c}`), "");
    if (needsMartini(p)) lines.push(martiniHandoff(p, `playbook:${p.id}`), "");
    lines.push("### Fallbacks", "");
    for (const slug of p.fallback_slugs) {
      const s = serverForSlug(ctx, slug);
      if (s) lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.tagline}`);
    }
    lines.push("");
  }
  lines.push("---", "", `Full registry: ${ctx.site.url}/api/registry.json`);
  return lines.join("\n") + "\n";
};
