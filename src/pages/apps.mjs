import {
  appComparisons, appCountSentence, appCounts, appMetaDescription, appOptions, appTitle, appsForSlug, maintainerKind,
} from "../apps.mjs";
import { authLabel, breadcrumbLd, card, claudeCodeCmd, cursorConfig, esc, isInactive, layout, nice, organizationLd, statusBadge, statusLabel, vendorShort } from "./_shared.mjs";
import { factsFor, packageSummary, probeSummary, registryLabel } from "./_health.mjs";
import { lowerFirst } from "./compare.mjs";
import { serverFaqHtml, serverFaqLd } from "./server-faq.mjs";

// ------------------------------------------------------------- creative apps
// /apps/ answers the navigational query people actually type ("davinci resolve mcp",
// "c4d mcp"): every listed option for one application, official or community, local or
// hosted, which versions, whether the endpoint answers, and a pick only where data/apps.json
// names one. Facts come from the listings; data/apps.json adds only the app-level layer.

const appsOf = (ctx) => ctx.apps ?? [];
export const appsFor = (ctx, slug) => appsForSlug(appsOf(ctx), slug);
const optionsOf = (ctx, app) => appOptions(ctx.servers, app);
const activeOptions = (ctx, app) => optionsOf(ctx, app).filter((s) => !isInactive(s));
const pickOf = (ctx, app) => (app.pick ? ctx.servers.find((s) => s.slug === app.pick) ?? null : null);
const comparisonsOf = (ctx, app) => appComparisons(ctx.comparisons, app);
const appModified = (ctx, app) => optionsOf(ctx, app).map((s) => s.verified).sort().at(-1);
const code = (c) => `<code class="mono">${esc(c)}</code>`;
const names = (list) => {
  const n = list.map((s) => s.name);
  return n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};
const firstSentence = (text) => String(text ?? "").match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? String(text ?? "");

const MAINTAINER = {
  "first-party": (app) => `Official (${app.maker})`,
  vendor: (app, s) => `Another vendor (${vendorShort(s.vendor)})`,
  community: (app, s) => `Community (${vendorShort(s.vendor)})`,
};
export const maintainerLabel = (app, s) => MAINTAINER[maintainerKind(app, s)](app, s);

// The daily machine check, as one short line: the endpoint probe for hosted listings, the
// npm/PyPI lookup for packaged ones, otherwise the curator's docs check is all there is.
export const evidenceCell = (ctx, s) => {
  const f = factsFor(ctx, s);
  if (f?.last_probe) {
    const p = probeSummary(f.last_probe);
    const text = p.text.replace(/ · MCP [^·]+/, "");
    return { tone: p.tone, text: `Endpoint ${text}`, date: f.last_probe.date };
  }
  if (f?.package_check) {
    const p = packageSummary(f.package_check);
    return { tone: p.tone, text: `${registryLabel(f.package_check)} package ${f.package_check.name} ${p.text}`, date: f.package_check.date };
  }
  return { tone: null, text: "No machine check applies; docs checked by the curator", date: null };
};
const evidenceHtml = (ctx, s) => {
  const e = evidenceCell(ctx, s);
  const date = e.date ? `, <time datetime="${esc(e.date)}">${nice(e.date)}</time>` : "";
  return e.tone
    ? `<span class="probe-line probe-${e.tone}"><span aria-hidden="true"></span>${esc(e.text)}${date}</span>`
    : esc(e.text);
};
const evidenceMd = (ctx, s) => {
  const e = evidenceCell(ctx, s);
  return `${e.text}${e.date ? ` (${e.date})` : ""}`;
};

const mentionsCodex = (s) => /\bcodex\b/i.test([s.description, s.notes, s.install?.claude_code, s.install?.stdio_command, s.auth?.key_url].filter(Boolean).join(" "));

// ---------------------------------------------------------------- the answer
// One paragraph up top: the pick if there is one; else what a curated comparison says decides
// it; else the count and split.
const appAnswer = (ctx, app) => {
  const pick = pickOf(ctx, app);
  const active = activeOptions(ctx, app);
  const comparison = comparisonsOf(ctx, app)[0] ?? null;
  if (pick && !isInactive(pick)) {
    return {
      lead: { html: `<strong>Start with <a href="/mcps/${esc(pick.slug)}/">${esc(pick.name)}</a>.</strong> ${esc(app.pick_why)}`, text: `Start with ${pick.name}. ${app.pick_why}` },
      choose: [],
    };
  }
  if (comparison && active.length > 1) {
    const chosen = comparison.slugs.map((slug) => active.find((s) => s.slug === slug)).filter(Boolean);
    return {
      lead: { html: `<strong>${esc(firstSentence(comparison.verdict))}</strong>`, text: firstSentence(comparison.verdict) },
      choose: chosen.map((s) => ({
        html: `<a href="/mcps/${esc(s.slug)}/">${esc(s.name)}</a> if ${esc(lowerFirst(comparison.choose_if[s.slug]))}`,
        text: `${s.name} if ${lowerFirst(comparison.choose_if[s.slug])}`,
      })),
    };
  }
  // No pick and no verdict: the curated intro is the answer, if there is one. Otherwise the
  // count sentence under the heading already says everything the data supports.
  if (app.intro) return { lead: { html: esc(app.intro), text: app.intro }, choose: [], usesIntro: true };
  return null;
};

// ------------------------------------------------------------ common questions
export const appFaq = (ctx, app) => {
  const active = activeOptions(ctx, app);
  const counts = appCounts(ctx.servers, app);
  const pick = pickOf(ctx, app);
  const items = [];
  const v = (s) => app.versions?.[s.slug] ?? null;

  // 1. Is there an official one?
  if (app.official_note) {
    items.push({ q: `Is there an official ${app.name} MCP server?`, html: esc(app.official_note), text: app.official_note });
  } else if (counts.firstParty.length) {
    const fp = counts.firstParty;
    const stated = fp.filter(v).map((s) => (fp.length > 1 ? `${s.name}: ${v(s)}` : v(s)));
    const verified = `mcp.film last verified ${fp.length > 1 ? "them" : "it"} on ${nice(fp.map((s) => s.verified).sort()[0])}.`;
    const lead = `Yes. ${names(fp)} ${fp.length > 1 ? "come" : "comes"} from ${app.maker}.`;
    const text = [lead, ...stated, verified].join(" ");
    let html = esc(text);
    for (const s of fp) html = html.replace(esc(s.name), `<a href="/mcps/${esc(s.slug)}/">${esc(s.name)}</a>`);
    items.push({ q: `Is there an official ${app.name} MCP server?`, html, text });
  } else {
    const who = counts.vendor.length ? "community-maintained or from another vendor" : "community-maintained";
    const text = `Not among the listings here: every ${app.name} option on mcp.film is ${who}, not from ${app.maker}.`;
    items.push({ q: `Is there an official ${app.name} MCP server?`, html: esc(text), text });
  }

  // 2. Which one? Only when the data names a pick, or a curated comparison says what decides it.
  const answer = appAnswer(ctx, app);
  if (pick && !isInactive(pick)) {
    items.push({ q: `What is the best ${app.name} MCP server?`, html: `<a href="/mcps/${esc(pick.slug)}/">${esc(pick.name)}</a>, as the place to start. ${esc(app.pick_why)}`, text: `${pick.name}, as the place to start. ${app.pick_why}` });
  } else if (answer?.choose.length) {
    items.push({
      q: `Which ${app.name} MCP server should I use?`,
      html: `${answer.lead.html} ${answer.choose.map((c) => `${c.html.replace(/\.?$/, ".")}`).join(" ")}`.replace(/<\/?strong>/g, ""),
      text: `${answer.lead.text} ${answer.choose.map((c) => c.text.replace(/\.?$/, ".")).join(" ")}`,
    });
  }

  // 3. Clients, from each listing's install data.
  if (active.length) {
    const lines = active.map((s) => {
      const cc = claudeCodeCmd(s);
      const cursor = cursorConfig(s) ? "; a Cursor config is on its listing" : "";
      return {
        html: `${esc(s.name)}: ${cc ? `Claude Code ${code(cc)}` : "no one-line Claude Code command, so follow the setup on its listing"}${cursor}.`,
        text: `${s.name}: ${cc ? `Claude Code \`${cc}\`` : "no one-line Claude Code command, so follow the setup on its listing"}${cursor}.`,
      };
    });
    const codex = active.filter(mentionsCodex);
    const codexLine = codex.length
      ? `Codex is named in the setup notes of ${names(codex)}.`
      : "None of these listings documents a Codex-specific setup.";
    items.push({
      q: `Can I use ${app.name} MCP with Claude Code, Codex or Cursor?`,
      html: `${lines.map((l) => l.html).join(" ")} ${esc(codexLine)}`,
      text: `${lines.map((l) => l.text).join(" ")} ${codexLine}`,
    });
  }

  // 4. Hosted or local.
  if (active.length) {
    const hosted = counts.hosted;
    const text = hosted.length
      ? `Yes. ${hosted.map((s) => `${s.name}: ${s.install.remote_url} (${authLabel(s)})`).join("; ")}.${active.length > hosted.length ? ` The other${active.length - hosted.length > 1 ? "s run" : " runs"} on your own machine.` : ""}`
      : (active.length > 1 ? `No. All ${active.length} active options run on your own machine; none has a hosted endpoint.` : "No. It runs on your own machine; there is no hosted endpoint.");
    items.push({ q: `Is there a hosted ${app.name} MCP server?`, html: esc(text), text });
  }

  // 5. Versions and editions, only where the listings state them.
  const stated = active.filter(v);
  if (stated.length) {
    const editions = stated.some((s) => /\b(free|edition|studio|lite|plan|account|subscri)/i.test(v(s)));
    const text = stated.map((s) => `${s.name}: ${v(s)}`).join(" ");
    items.push({ q: `Which ${app.name} versions${editions ? " and editions" : ""} ${active.length > 1 ? "do they" : "does it"} support?`, html: esc(text), text });
  }
  return items;
};

// ----------------------------------------------------------------- app page
const tableRows = (ctx, app) => optionsOf(ctx, app).map((s) => {
  const role = app.roles?.[s.slug];
  return `<tr${isInactive(s) ? ` class="is-inactive"` : ""}>
        <th scope="row"><a href="/mcps/${esc(s.slug)}/">${esc(s.name)}</a>${s.slug === app.pick ? ` <span class="tag tag-pick">Pick</span>` : ""}${statusBadge(s)}${role ? `<span class="app-role">${esc(role)}</span>` : ""}</th>
        <td>${esc(maintainerLabel(app, s))}</td>
        <td>${s.install?.remote_url ? "Hosted" : "Local"}</td>
        <td>${esc(authLabel(s))}</td>
        <td>${esc(app.versions?.[s.slug] ?? "Not stated")}</td>
        <td>${evidenceHtml(ctx, s)}</td>
        <td><time datetime="${esc(s.verified)}">${nice(s.verified)}</time></td>
      </tr>`;
}).join("\n      ");

export const renderApp = (ctx, app) => {
  const { site } = ctx;
  const list = optionsOf(ctx, app);
  const answer = appAnswer(ctx, app);
  const compared = comparisonsOf(ctx, app);
  const faq = appFaq(ctx, app);
  const faqLd = serverFaqLd(faq);
  const description = appMetaDescription(ctx.servers, app);
  const heading = list.length > 1 ? `${app.name} MCP servers` : `${app.name} MCP server`;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/apps/">Apps</a> / <span>${esc(app.name)}</span></p>
  <h1>${esc(heading)}</h1>
  <p class="hero-sub">${esc(appCountSentence(ctx.servers, app))} <span class="mono">(machine version: <a href="/apps/${esc(app.id)}.md">markdown</a>)</span></p>
</section>

<section class="server-main agents-doc app-doc" data-app="${esc(app.id)}">
  ${answer ? `<div class="app-answer" id="answer">
    <p>${answer.lead.html}</p>
    ${answer.choose.length ? `<ul class="agents-list compare-choose">${answer.choose.map((c) => `<li>${c.html}</li>`).join("")}</ul>` : ""}
  </div>` : ""}
  ${app.intro && !answer?.usesIntro ? `<p class="cat-intro">${esc(app.intro)}</p>` : ""}

  <h2 id="options">Every option</h2>
  <table class="pulse-table app-table" tabindex="0">
    <caption class="sr-only">${esc(app.name)} MCP servers: maintainer, hosting, auth, supported versions, machine check and last verification, from each listing</caption>
    <thead><tr><th scope="col">Server</th><th scope="col">Maintainer</th><th scope="col">Runs</th><th scope="col">Auth</th><th scope="col">Versions</th><th scope="col">Latest check</th><th scope="col">Verified</th></tr></thead>
    <tbody>
      ${tableRows(ctx, app)}
    </tbody>
  </table>

  <div class="grid grid-pairs app-cards" data-track-section="app:${esc(app.id)}">${list.map((s) => card(ctx, s)).join("")}</div>

  ${compared.length ? `<h2 id="compared">Compared head to head</h2>
  <p class="compared-links">${compared.map((c) => `<a href="/compare/${esc(c.id)}/">${esc(c.title)}</a>`).join(" · ")}</p>` : ""}

  ${serverFaqHtml(faq)}

  <p class="connect-note">Every fact on this page comes from the listings, re-verified by the curator, and the daily machine check (<a href="/for-agents/#evidence">how we check</a>). ${app.pick ? "The pick is editorial, written from the same data." : "No pick: the data does not support one, so the table does the talking."} Know a ${esc(app.name)} server we are missing? <a href="/submit/">Submit it</a>.</p>
</section>
<p class="backlink"><a href="/apps/">← All apps</a></p>`;

  return layout(ctx, {
    title: appTitle(ctx.servers, app),
    description,
    path: `/apps/${app.id}/`,
    page: "app",
    md: `/apps/${app.id}.md`,
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: heading,
        description,
        url: `${site.url}/apps/${app.id}/`,
        dateModified: appModified(ctx, app),
        publisher: organizationLd(ctx),
        about: { "@type": "SoftwareApplication", name: app.name, creator: { "@type": "Organization", name: app.maker } },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: list.length,
          itemListElement: list.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: `${site.url}/mcps/${s.slug}/` })),
        },
      },
      ...(faqLd ? [faqLd] : []),
      breadcrumbLd(ctx, [{ name: "Apps", item: `${site.url}/apps/` }, { name: app.name }]),
    ],
  });
};

export const renderAppMd = (ctx, app) => {
  const { site } = ctx;
  const list = optionsOf(ctx, app);
  const answer = appAnswer(ctx, app);
  const lines = [
    `# ${list.length > 1 ? `${app.name} MCP servers` : `${app.name} MCP server`}`,
    "",
    `> ${appCountSentence(ctx.servers, app)}`,
    "",
  ];
  if (answer) lines.push(answer.lead.text, "");
  if (answer?.choose.length) lines.push(...answer.choose.map((c) => `- ${c.text}`), "");
  if (app.intro && !answer?.usesIntro) lines.push(app.intro, "");
  lines.push(`- App: ${app.name} (${app.maker})`);
  if (app.aliases?.length) lines.push(`- Also searched as: ${app.aliases.join(", ")}`);
  lines.push(`- Canonical: ${site.url}/apps/${app.id}/`, "", "## Every option", "");
  for (const s of list) {
    lines.push(`### ${s.name}${s.slug === app.pick ? " (pick)" : ""}${isInactive(s) ? ` (${statusLabel(s).toLowerCase()})` : ""}`, "");
    if (app.roles?.[s.slug]) lines.push(app.roles[s.slug], "");
    const cc = claudeCodeCmd(s);
    lines.push(
      `- Maintainer: ${maintainerLabel(app, s)}`,
      `- Runs: ${s.install?.remote_url ? `hosted, \`${s.install.remote_url}\`` : "local"}`,
      `- Auth: ${authLabel(s)}`,
      `- Versions: ${app.versions?.[s.slug] ?? "not stated"}`,
      `- Latest check: ${evidenceMd(ctx, s)}`,
      `- Verified: ${s.verified}`,
      ...(cc ? [`- Claude Code: \`${cc}\``] : []),
      `- Listing: ${site.url}/mcps/${s.slug}.md`,
      "",
    );
  }
  const compared = comparisonsOf(ctx, app);
  if (compared.length) lines.push("## Compared head to head", "", ...compared.map((c) => `- [${c.title}](${site.url}/compare/${c.id}.md)`), "");
  const faq = appFaq(ctx, app);
  if (faq.length) lines.push("## Common questions", "", ...faq.flatMap((i) => [`**${i.q}**`, i.text, ""]));
  lines.push("---", "", `Facts come from each listing and the daily machine check; ${app.pick ? "the pick is editorial" : "no pick, because the data does not support one"}. All apps: ${site.url}/apps.md`);
  return lines.join("\n") + "\n";
};

// --------------------------------------------------------------- apps index
const yesNames = (ctx, list) => (list.length ? list.map((s) => `<a href="/mcps/${esc(s.slug)}/">${esc(s.name)}</a>`).join(", ") : "No");

export const renderAppsIndex = (ctx) => {
  const { site } = ctx;
  const apps = appsOf(ctx);
  const rows = apps.map((app) => {
    const c = appCounts(ctx.servers, app);
    const pick = pickOf(ctx, app);
    return `<tr>
        <th scope="row"><a href="/apps/${esc(app.id)}/">${esc(app.name)}</a><span class="app-role">${esc(app.maker)}</span></th>
        <td>${c.active}${c.inactive ? ` <span class="app-role">+${c.inactive} ${esc(c.inactiveList.map((s) => s.status).join(", "))}</span>` : ""}</td>
        <td>${yesNames(ctx, c.firstParty)}</td>
        <td>${yesNames(ctx, c.hosted)}</td>
        <td>${pick ? `<a href="/mcps/${esc(pick.slug)}/">${esc(pick.name)}</a>` : "—"}</td>
      </tr>`;
  }).join("\n      ");
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Apps</span></p>
  <h1>MCP support by creative app</h1>
  <p class="hero-sub">Every MCP server in the directory that drives or plugs into a specific creative application, grouped by app: whether the app's maker ships one, whether any is hosted, and a pick where the data supports one. <span class="mono">(machine version: <a href="/apps.md">/apps.md</a>, <a href="/api/apps.json">/api/apps.json</a>)</span></p>
</section>

<section class="server-main agents-doc app-doc">
  <table class="pulse-table apps-index-table" tabindex="0">
    <caption class="sr-only">MCP support by creative app: options, official server from the app's maker, hosted option, and pick</caption>
    <thead><tr><th scope="col">App</th><th scope="col">Options</th><th scope="col">From the maker</th><th scope="col">Hosted</th><th scope="col">Pick</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <p class="connect-note">Options are listings that control the app or work inside it; tools that only export a file the app can open are not counted. "From the maker" means a server built by the app's own maker; elsewhere on the site "official" means maintained by the vendor of that server. An app missing? <a href="https://github.com/${site.github_repo}/issues/new?labels=apps&title=${encodeURIComponent("App hub: <app>")}" rel="noopener">Suggest one</a>.</p>
</section>`;
  return layout(ctx, {
    title: "MCP support by creative app: Resolve, Blender, After Effects | mcp.film",
    description: `MCP servers for ${apps.length} creative apps, from DaVinci Resolve and Blender to After Effects and Cinema 4D: official or community, local or hosted.`,
    path: "/apps/",
    page: "apps",
    md: "/apps.md",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "MCP support by creative app",
        url: `${site.url}/apps/`,
        publisher: organizationLd(ctx),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: apps.length,
          itemListElement: apps.map((a, i) => ({ "@type": "ListItem", position: i + 1, name: `${a.name} MCP servers`, url: `${site.url}/apps/${a.id}/` })),
        },
      },
      breadcrumbLd(ctx, [{ name: "Apps" }]),
    ],
  });
};

export const renderAppsIndexMd = (ctx) => {
  const lines = [
    "# MCP support by creative app",
    "",
    "> Every MCP server in the directory that drives or plugs into a specific creative application, grouped by app. Tools that only export a file the app can open are not counted.",
    "",
    "| App | Maker | Options | From the maker | Hosted | Pick |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const app of appsOf(ctx)) {
    const c = appCounts(ctx.servers, app);
    const pick = pickOf(ctx, app);
    lines.push(`| [${app.name}](${ctx.site.url}/apps/${app.id}.md) | ${app.maker} | ${c.active}${c.inactive ? ` (+${c.inactive} inactive)` : ""} | ${c.firstParty.map((s) => s.name).join(", ") || "no"} | ${c.hosted.map((s) => s.name).join(", ") || "no"} | ${pick?.name ?? "none"} |`);
  }
  lines.push("", "Aliases each app is searchable by (search_film_mcps on the meta-MCP):", "");
  for (const app of appsOf(ctx)) if (app.aliases?.length) lines.push(`- ${app.name}: ${app.aliases.join(", ")}`);
  lines.push("", "---", "", `JSON: ${ctx.site.url}/api/apps.json · Canonical: ${ctx.site.url}/apps/`);
  return lines.join("\n") + "\n";
};

// ------------------------------------------------------------- machine doc
export const appsDoc = (ctx) => ({
  name: "mcp.film creative-app index",
  description: "MCP servers grouped by the creative application they drive or plug into, with the app maker's own server, hosted options and a pick where the data supports one.",
  updated: ctx.built,
  count: appsOf(ctx).length,
  apps: appsOf(ctx).map((app) => {
    const c = appCounts(ctx.servers, app);
    return {
      id: app.id,
      name: app.name,
      aliases: app.aliases ?? [],
      maker: app.maker,
      url: `${ctx.site.url}/apps/${app.id}/`,
      markdown: `${ctx.site.url}/apps/${app.id}.md`,
      options: c.active,
      inactive: c.inactive,
      first_party: c.firstParty.map((s) => s.slug),
      hosted: c.hosted.map((s) => s.slug),
      pick: app.pick ? { slug: app.pick, why: app.pick_why } : null,
      comparisons: comparisonsOf(ctx, app).map((x) => `${ctx.site.url}/compare/${x.id}/`),
      ...(app.intro ? { intro: app.intro } : {}),
      ...(app.official_note ? { official_note: app.official_note } : {}),
      servers: optionsOf(ctx, app).map((s) => {
        const f = factsFor(ctx, s);
        return {
          slug: s.slug,
          name: s.name,
          maintainer: maintainerKind(app, s),
          vendor: s.vendor,
          official: s.official,
          status: s.status ?? "active",
          remote_url: s.install?.remote_url ?? null,
          auth_type: s.auth?.type ?? null,
          versions: app.versions?.[s.slug] ?? null,
          ...(app.roles?.[s.slug] ? { role: app.roles[s.slug] } : {}),
          evidence: f?.evidence ?? null,
          last_probe: f?.last_probe ?? null,
          verified: s.verified,
          listing_url: `${ctx.site.url}/mcps/${s.slug}/`,
          markdown_url: `${ctx.site.url}/mcps/${s.slug}.md`,
        };
      }),
    };
  }),
});

// ------------------------------------------------------- server-page links
export const appHubLinksHtml = (ctx, s) => {
  const apps = appsFor(ctx, s.slug);
  return apps.length
    ? `<p class="app-hub-links">${apps.map((a) => `<a href="/apps/${esc(a.id)}/">All ${esc(a.name)} MCP options (${appCounts(ctx.servers, a).total}) →</a>`).join("")}</p>`
    : "";
};
export const appHubLinksMd = (ctx, s) =>
  appsFor(ctx, s.slug).map((a) => `- **App:** [All ${a.name} MCP options](${ctx.site.url}/apps/${a.id}.md)`);
