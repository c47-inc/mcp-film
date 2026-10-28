import { martiniHandoff } from "../../packages/mcp-server/recommend-score.mjs";
import { breadcrumbLd, card, esc, hasMartiniHandoff, isInactive, layout, martiniLine, organizationLd } from "./_shared.mjs";
import { stackScriptHtml, stackScriptMd } from "./stack-script.mjs";

// -------------------------------------------------------------- playbooks
export const serverForSlug = (ctx, slug) => ctx.servers.find((s) => s.slug === slug);

// Lists an agent acts on never name a dead server; its page still exists for the explanation.
export const activeServerForSlug = (ctx, slug) => {
  const s = serverForSlug(ctx, slug);
  return s && !isInactive(s) ? s : null;
};

export const activeServers = (ctx, slugs) => (slugs ?? []).map((slug) => activeServerForSlug(ctx, slug)).filter(Boolean);

export const playbookServerLink = (ctx, slug) => {
  const s = activeServerForSlug(ctx, slug);
  return s ? `<a href="/mcps/${s.slug}/">${esc(s.name)}</a>` : "";
};

export const serverLinks = (ctx, slugs) => (slugs ?? []).map((slug) => playbookServerLink(ctx, slug)).filter(Boolean).join(" · ");

export const playbookSlugs = (p) => [...new Set([
  ...(p.primary_slugs ?? []),
  ...(p.steps ?? []).flatMap((step) => step.slugs ?? []),
])];

export const playbookAuthItems = (ctx, p) => activeServers(ctx, playbookSlugs(p))
  .filter((s) => s.auth?.type && s.auth.type !== "none");

// The newest verification date across a route's servers: the page is only as current as its parts.
export const routeModified = (ctx, slugs) =>
  activeServers(ctx, slugs).map((s) => s.verified).sort().at(-1) ?? ctx.built.slice(0, 10);

const playbookArticle = (ctx, p, { standalone = false } = {}) => {
  const title = standalone ? `<h1>${esc(p.title)}</h1>` : `<h2><a href="/playbooks/${esc(p.id)}/">${esc(p.title)}</a></h2>`;
  const auth = playbookAuthItems(ctx, p);
  return `
  <article class="playbook" id="${esc(p.id)}" data-playbook="${esc(p.id)}" data-track-section="playbook:${esc(p.id)}">
    <p class="label">${esc(p.best_for)}</p>
    ${title}
    <p>${esc(p.summary)}</p>

    <h3>Primary stack</h3>
    <div class="playbook-stack" data-playbook-section="primary">
      ${activeServers(ctx, p.primary_slugs).map((s) => card(ctx, s)).join("")}
    </div>

    <h3>Agent setup order</h3>
    <ol class="playbook-steps playbook-setup" data-playbook-section="setup">
      ${p.setup_order.map((item, i) => `
      <li>
        <span class="stage-num">${String(i + 1).padStart(2, "0")}</span>
        <p>${esc(item)}</p>
      </li>`).join("")}
    </ol>

    ${auth.length ? `
    <h3>Auth gates</h3>
    <ul class="agents-list" data-playbook-section="auth">
      ${auth.map((s) => `<li><a href="/mcps/${s.slug}/">${esc(s.name)}</a>: ${esc(s.auth.type)}${s.auth.env_var ? ` · <code class="mono">${esc(s.auth.env_var)}</code>` : ""}${s.install?.remote_url ? " · hosted remote" : " · local/client setup"}</li>`).join("")}
    </ul>` : ""}
    ${standalone ? stackScriptHtml(ctx, p) : ""}

    <h3>Workflow</h3>
    <ol class="playbook-steps">
      ${p.steps.map((step) => `
      <li data-playbook-stage="${esc(step.stage)}">
        <span class="stage-num">${esc(step.stage)}</span>
        <p>${esc(step.intent)}</p>
        <p class="playbook-links" data-playbook-section="workflow">${serverLinks(ctx, step.slugs)}</p>
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
    ${activeServers(ctx, p.fallback_slugs).length ? `<p class="playbook-fallback" data-playbook-section="fallback"><span class="label">Fallbacks</span> ${serverLinks(ctx, p.fallback_slugs)}</p>` : ""}
    ${standalone ? `<p class="connect-note mono">Machine version: <a href="/playbooks/${esc(p.id)}.md">/playbooks/${esc(p.id)}.md</a> · <a href="/api/playbooks.json">/api/playbooks.json</a></p>` : ""}
  </article>`;
};

// The index is a chooser: what each playbook is for and which servers it starts with.
// Setup order, auth gates, the install block and failure modes live on each playbook's page.
const playbookSummaryCard = (ctx, p) => `
  <article class="playbook playbook-summary" id="${esc(p.id)}" data-playbook="${esc(p.id)}" data-track-section="playbook:${esc(p.id)}">
    <p class="label">${esc(p.best_for)}</p>
    <h2><a href="/playbooks/${esc(p.id)}/">${esc(p.title)}</a></h2>
    <p>${esc(p.summary)}</p>
    <p class="playbook-links" data-playbook-section="primary"><span class="label">Starts with</span> ${serverLinks(ctx, p.primary_slugs)}</p>
    <p class="summary-more"><a href="/playbooks/${esc(p.id)}/">Setup order, auth, install block and failure modes →</a></p>
  </article>`;

export const renderPlaybooks = (ctx) => {
  const { site, playbooks } = ctx;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Playbooks</span></p>
  <h1>Production playbooks</h1>
  <p class="hero-sub">Concrete MCP stacks for common AI filmmaking jobs. The directory tells you what exists; playbooks tell your agent what to connect first. <span class="mono">(machine version: <a href="/playbooks.md">/playbooks.md</a> · <a href="/api/playbooks.json">/api/playbooks.json</a>)</span></p>
</section>

<section class="server-main playbook-doc">
  ${playbooks.map((p) => playbookSummaryCard(ctx, p)).join("")}
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
            url: `${site.url}/playbooks/${p.id}/`,
          })),
        },
      },
    ],
  });
};

export const renderPlaybook = (ctx, p) => {
  const { site } = ctx;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/playbooks/">Playbooks</a> / <span>${esc(p.title)}</span></p>
</section>
<section class="server-main playbook-doc">
  ${playbookArticle(ctx, p, { standalone: true })}
</section>
<p class="backlink"><a href="/playbooks/">← All playbooks</a></p>`;
  return layout(ctx, {
    title: `${p.title} — MCP playbook | mcp.film`,
    description: p.summary.length <= 155 ? p.summary : p.summary.slice(0, 156).replace(/\s+\S*$/, "").replace(/[^\p{L}\p{N}.)]+$/u, ""),
    path: `/playbooks/${p.id}/`,
    page: "playbook",
    md: `/playbooks/${p.id}.md`,
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: p.title,
        description: p.summary,
        url: `${site.url}/playbooks/${p.id}/`,
        dateModified: routeModified(ctx, playbookSlugs(p)),
        publisher: organizationLd(ctx),
        step: p.steps.map((step, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: step.stage,
          text: step.intent,
        })),
      },
      breadcrumbLd(ctx, [{ name: "Playbooks", item: `${site.url}/playbooks/` }, { name: p.title }]),
    ],
  });
};

const playbookMdLines = (ctx, p, { heading = "##" } = {}) => {
  const sub = heading + "#";
  const lines = [`${heading} ${p.title}`, "", p.summary, "", `Best for: ${p.best_for}`, ""];
  lines.push(`${sub} Primary stack`, "");
  for (const s of activeServers(ctx, p.primary_slugs)) lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.tagline}`);
  lines.push("", `${sub} Agent setup order`, "", ...p.setup_order.map((item) => `- ${item}`), "");
  const authItems = playbookAuthItems(ctx, p);
  if (authItems.length) {
    lines.push(`${sub} Auth gates`, "");
    for (const s of authItems) {
      lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.auth.type}${s.auth.env_var ? ` (${s.auth.env_var})` : ""}${s.install?.remote_url ? "; hosted remote" : "; local/client setup"}`);
    }
    lines.push("");
  }
  lines.push(`${sub} Workflow`, "");
  for (const step of p.steps) {
    const names = activeServers(ctx, step.slugs).map((s) => `[${s.name}](${ctx.site.url}/mcps/${s.slug}.md)`).join(", ");
    lines.push(`- ${step.stage}: ${step.intent} ${names}`);
  }
  lines.push("", `${sub} Failure modes`, "", ...p.failure_modes.map((c) => `- ${c}`), "");
  lines.push(`${sub} Watch-outs`, "", ...p.constraints.map((c) => `- ${c}`), "");
  if (hasMartiniHandoff(p)) lines.push(martiniHandoff(p, `playbook:${p.id}`), "");
  const fallbacks = activeServers(ctx, p.fallback_slugs);
  if (fallbacks.length) {
    lines.push(`${sub} Fallbacks`, "");
    for (const s of fallbacks) lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md): ${s.tagline}`);
    lines.push("");
  }
  return lines;
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
    lines.push(...playbookMdLines(ctx, p));
    lines.push(`Canonical: ${ctx.site.url}/playbooks/${p.id}/`, "");
  }
  lines.push("---", "", `Full registry: ${ctx.site.url}/api/registry.json`);
  return lines.join("\n") + "\n";
};

export const renderPlaybookMd = (ctx, p) => {
  const lines = playbookMdLines(ctx, p, { heading: "#" });
  lines.push(...stackScriptMd(ctx, p));
  lines.push("---", "", `Canonical: ${ctx.site.url}/playbooks/${p.id}/`, `All playbooks: ${ctx.site.url}/playbooks.md · Structured data: ${ctx.site.url}/api/playbooks.json`);
  return lines.join("\n") + "\n";
};
