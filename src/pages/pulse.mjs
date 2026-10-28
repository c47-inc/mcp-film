import { esc, layout } from "./_shared.mjs";

// ------------------------------------------------------------ catalog pulse
export const pulseLink = (ctx, s) => `<a href="/mcps/${s.slug}/">${esc(s.name)}</a>`;
export const eventTags = (events) =>
  (events ?? []).map((event) => `<code class="mono">${esc(event)}</code>`).join(" ");
export const pulseEvidenceHtml = (item) =>
  (item.evidence ?? []).slice(0, 6).map((e) => {
    if (e.slug) return `<a href="/mcps/${e.slug}/">${esc(e.name)}</a>${e.age_days !== undefined ? ` (${e.age_days}d)` : ""}${e.consecutive_failures !== undefined ? ` (${e.consecutive_failures} failed checks)` : ""}`;
    if (e.title) return `<a href="/recommendations/#${esc(e.id)}">${esc(e.title)}</a>${e.primary ? " (primary)" : ""}`;
    if (e.id && e.name) return `<a href="/categories/${e.id}/">${esc(e.name)}</a> (${e.servers} servers, ${e.remote} remote)`;
    return esc(e.name ?? e.id ?? "");
  }).filter(Boolean).join("; ");
export const pulseEvidenceMd = (ctx, item) =>
  (item.evidence ?? []).slice(0, 6).map((e) => {
    if (e.slug) return `[${e.name}](${ctx.site.url}/mcps/${e.slug}.md)${e.age_days !== undefined ? ` (${e.age_days}d)` : ""}${e.consecutive_failures !== undefined ? ` (${e.consecutive_failures} failed checks)` : ""}`;
    if (e.title) return `[${e.title}](${ctx.site.url}/recommendations.md#${e.id})${e.primary ? " (primary)" : ""}`;
    if (e.id && e.name) return `${e.name} (${e.servers} servers, ${e.remote} remote)`;
    return e.name ?? e.id ?? "";
  }).filter(Boolean).join("; ");

export const renderPulse = (ctx) => {
  const { site, pulse } = ctx;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Pulse</span></p>
  <h1>Catalog pulse</h1>
  <p class="hero-sub">The directory's current operating picture: newest additions, verification queue, category coverage, and machine surfaces. Looking for what changed? See <a href="/changes/">Changes</a>. <span class="mono">(machine version: <a href="/pulse.md">/pulse.md</a> · <a href="/api/pulse.json">/api/pulse.json</a>)</span></p>
</section>

<section class="pulse-grid" aria-label="Catalog summary">
  <div><span>${pulse.summary.servers}</span><p>servers</p></div>
  <div><span>${pulse.summary.official}</span><p>official</p></div>
  <div><span>${pulse.summary.remote}</span><p>hosted remote</p></div>
  <div><span>${pulse.summary.categories}</span><p>categories</p></div>
</section>

<section class="server-main agents-doc pulse-doc">
  <h2>Demand signals</h2>
  <p>These are the telemetry loops the pulse and curator should treat as product input. They explain what to query in PostHog, what action to take, and how to keep Martini useful without making the directory less trustworthy.</p>
  <table class="pulse-table" tabindex="0">
    <thead><tr><th>Signal</th><th>Events</th><th>Action</th><th>Martini read</th></tr></thead>
    <tbody>
      ${pulse.demand_signals.map((s) => `<tr><td>${esc(s.question)}</td><td>${eventTags(s.events)}</td><td>${esc(s.action)}</td><td>${esc(s.martini_use)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Curator agenda</h2>
  <table class="pulse-table" tabindex="0">
    <thead><tr><th>Priority</th><th>Evidence</th><th>Action</th></tr></thead>
    <tbody>
      ${pulse.curator_agenda.map((item) => `<tr><td><code class="mono">${esc(item.priority)}</code><br>${esc(item.id)}</td><td>${pulseEvidenceHtml(item) || "None right now."}</td><td>${esc(item.action)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Martini growth checks</h2>
  <ul class="agents-list">
    ${pulse.martini_growth_checks.map((check) => `<li>${esc(check)}</li>`).join("")}
  </ul>

  <h2>Newest additions</h2>
  <table class="pulse-table" tabindex="0">
    <thead><tr><th>Server</th><th>Category</th><th>Added</th><th>Type</th></tr></thead>
    <tbody>
      ${pulse.newest.slice(0, 8).map((s) => `<tr><td>${pulseLink(ctx, s)}</td><td>${esc(s.category)}</td><td>${esc(s.added)}</td><td>${s.official ? "official" : "community"}${s.remote ? " · remote" : ""}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Verification queue</h2>
  <p>These are the oldest verified entries. The daily curator should start here unless a breaking change or submission is more urgent.</p>
  <table class="pulse-table" tabindex="0">
    <thead><tr><th>Server</th><th>Verified</th><th>Age</th><th>Category</th></tr></thead>
    <tbody>
      ${pulse.verification_queue.slice(0, 10).map((s) => `<tr><td>${pulseLink(ctx, s)}</td><td>${esc(s.verified)}</td><td>${s.verification_age_days}d</td><td>${esc(s.category)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Coverage by category</h2>
  <table class="pulse-table" tabindex="0">
    <thead><tr><th>Category</th><th>Servers</th><th>Official</th><th>Remote</th></tr></thead>
    <tbody>
      ${pulse.categories.map((c) => `<tr><td><a href="/categories/${c.id}/">${esc(c.name)}</a></td><td>${c.servers}</td><td>${c.official}</td><td>${c.remote}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Machine surfaces</h2>
  <ul class="agents-list">
    ${pulse.machine_surfaces.map((s) => `<li><a href="${new URL(s.url).pathname}"><code class="mono">${esc(new URL(s.url).pathname)}</code></a> — ${esc(s.kind)}</li>`).join("")}
  </ul>

  <h2>Operations</h2>
  <ul class="agents-list">
    <li>Source: <a href="${pulse.operations.github_repo}" rel="noopener">${esc(pulse.operations.github_repo)}</a></li>
    <li>Analytics: <a href="${pulse.operations.posthog_dashboard}" rel="noopener">PostHog mcp.film Agent Traffic dashboard</a></li>
    <li>Cloudflare Pages project: <code class="mono">${esc(pulse.operations.cloudflare_pages)}</code></li>
  </ul>
</section>`;

  return layout(ctx, {
    title: "Catalog pulse — mcp.film operations snapshot",
    description: "Current mcp.film catalog freshness, newest additions, verification queue, coverage, and machine-readable surfaces.",
    path: "/pulse/",
    page: "pulse",
    md: "/pulse.md",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "mcp.film catalog pulse",
        description: "Freshness and operations snapshot for the mcp.film MCP server directory.",
        url: site.url + "/pulse/",
        dateModified: ctx.built.slice(0, 10),
        distribution: [
          { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: site.url + "/api/pulse.json" },
          { "@type": "DataDownload", encodingFormat: "text/markdown", contentUrl: site.url + "/pulse.md" },
        ],
      },
    ],
  });
};

export const renderPulseMd = (ctx) => {
  const { pulse } = ctx;
  const lines = [
    "# mcp.film catalog pulse",
    "",
    `Generated: ${pulse.generated}`,
    "",
    "## Summary",
    "",
    `- Servers: ${pulse.summary.servers}`,
    `- Official: ${pulse.summary.official}`,
    `- Community: ${pulse.summary.community}`,
    `- Hosted remote: ${pulse.summary.remote}`,
    `- Local/stdio: ${pulse.summary.local_or_stdio}`,
    `- Categories: ${pulse.summary.categories}`,
    `- Newest added date: ${pulse.summary.newest_added}`,
    `- Oldest verified date: ${pulse.summary.oldest_verified}`,
    "",
    "## Demand signals",
    "",
    ...pulse.demand_signals.flatMap((s) => [
      `### ${s.id}`,
      "",
      `- Question: ${s.question}`,
      `- Events: ${s.events.map((event) => `\`${event}\``).join(", ")}`,
      `- Action: ${s.action}`,
      `- Martini read: ${s.martini_use}`,
      "",
    ]),
    "## Curator agenda",
    "",
    ...pulse.curator_agenda.flatMap((item) => [
      `### ${item.id}`,
      "",
      `- Priority: ${item.priority}`,
      `- Evidence: ${pulseEvidenceMd(ctx, item) || "none right now"}`,
      `- Action: ${item.action}`,
      "",
    ]),
    "## Martini growth checks",
    "",
    ...pulse.martini_growth_checks.map((check) => `- ${check}`),
    "",
    "## Newest additions",
    "",
    ...pulse.newest.map((s) => `- [${s.name}](${s.markdown}) — added ${s.added}; ${s.official ? "official" : "community"}; ${s.tagline}`),
    "",
    "## Verification queue",
    "",
    ...pulse.verification_queue.map((s) => `- [${s.name}](${s.markdown}) — verified ${s.verified} (${s.verification_age_days}d); ${s.category}`),
    "",
    "## Category coverage",
    "",
    ...pulse.categories.map((c) => `- ${c.name}: ${c.servers} servers (${c.official} official, ${c.remote} remote)`),
    "",
    "## Top capability tags",
    "",
    ...pulse.top_capabilities.map((c) => `- ${c.capability}: ${c.servers}`),
    "",
    "## Machine surfaces",
    "",
    ...pulse.machine_surfaces.map((s) => `- ${s.label}: ${s.url} (${s.kind})`),
    "",
    "## Operations",
    "",
    `- Source: ${pulse.operations.github_repo}`,
    `- Analytics dashboard: ${pulse.operations.posthog_dashboard}`,
    `- Cloudflare Pages project: ${pulse.operations.cloudflare_pages}`,
    "",
    `Structured pulse: ${ctx.site.url}/api/pulse.json`,
  ];
  return lines.join("\n") + "\n";
};
