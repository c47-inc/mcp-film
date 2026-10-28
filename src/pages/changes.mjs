import { breadcrumbLd, catById, esc, isInactive, layout, nice, organizationLd, statusBadge, statusLabel } from "./_shared.mjs";

// ------------------------------------------------------------------ changes
// A changelog derived from the registry data alone: each listing's `added` and `verified`
// dates, and its current `status`. No git history at build time. The registry keeps only
// the latest `verified` date, so a listing appears under its most recent check; the
// edits themselves, and earlier checks, are in the repo's commit history.
export const CHANGES_WINDOW_DAYS = 60;
const FEED_LIMIT = 100;
const dayMs = 24 * 60 * 60 * 1000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

const KIND_LABEL = { added: "Added", verified: "Re-verified" };
const kindLabel = (e) => e.kind === "status" ? `Confirmed ${statusLabel(e.server).toLowerCase()}` : KIND_LABEL[e.kind];
const KIND_ORDER = { added: 0, status: 1, verified: 2 };

export const changeLog = (ctx, days = CHANGES_WINDOW_DAYS) => {
  const until = ctx.built.slice(0, 10);
  const since = isoDay(new Date(`${until}T00:00:00Z`).getTime() - (days - 1) * dayMs);
  const events = [];
  for (const s of ctx.servers) {
    if (s.added >= since) events.push({ date: s.added, kind: "added", server: s });
    // A listing verified the day it was added is one event, not two.
    if (s.verified >= since && s.verified !== s.added) {
      events.push({ date: s.verified, kind: isInactive(s) ? "status" : "verified", server: s });
    }
  }
  events.sort((a, b) => b.date.localeCompare(a.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.server.name.localeCompare(b.server.name));
  const byDay = [];
  for (const e of events) {
    if (byDay.at(-1)?.date !== e.date) byDay.push({ date: e.date, events: [] });
    byDay.at(-1).events.push(e);
  }
  const inactive = ctx.servers
    .filter(isInactive)
    .sort((a, b) => b.verified.localeCompare(a.verified) || a.name.localeCompare(b.name));
  return {
    days,
    since,
    until,
    events,
    byDay,
    inactive,
    newest: events[0]?.date ?? until,
    counts: {
      added: events.filter((e) => e.kind === "added").length,
      verified: events.filter((e) => e.kind === "verified").length,
      checked: ctx.servers.filter((s) => s.verified >= since).length,
      total: ctx.servers.length,
      inactive: inactive.length,
    },
  };
};

const commitsUrl = (ctx) => `https://github.com/${ctx.site.github_repo}/commits/main/data/registry`;
const dayId = (date) => `day-${date}`;
const typeLabel = (s) => s.official ? "official" : "community";

const eventHtml = (ctx, e) => {
  const s = e.server;
  const cat = catById(ctx, s.category)?.name ?? s.category;
  const note = e.kind === "added" ? esc(s.tagline) : `${esc(cat)} · ${typeLabel(s)}`;
  const kindClass = e.kind === "status" ? ` tag-status tag-status-${esc(s.status)}` : "";
  return `<li class="change change-${e.kind}"><span class="change-kind${kindClass}">${esc(kindLabel(e))}</span><span class="change-body"><a href="/mcps/${s.slug}/">${esc(s.name)}</a>${e.kind === "added" ? statusBadge(s) : ""}<span class="change-note">${note}</span></span></li>`;
};

export const renderChanges = (ctx) => {
  const { site } = ctx;
  const log = changeLog(ctx);
  const { counts } = log;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Changes</span></p>
  <h1>Changes</h1>
  <p class="hero-sub">What changed in the directory over the last ${log.days} days, newest first: new listings, re-verifications, and listings marked dead, archived or deprecated. A curator agent re-verifies the stalest entries daily, and every change lands as a public commit. <span class="mono">(<a href="/changes.md">/changes.md</a> · <a href="/changes.xml">Atom feed</a>)</span></p>
</section>

<section class="pulse-grid" aria-label="Changes in the last ${log.days} days">
  <div><span>${counts.added}</span><p>new listings</p></div>
  <div><span>${counts.verified}</span><p>re-verified</p></div>
  <div><span>${counts.checked}/${counts.total}</span><p>checked in ${log.days} days</p></div>
  <div><span>${counts.inactive}</span><p>inactive</p></div>
</section>

<section class="server-main agents-doc changes-doc">
  <p class="changes-method">Derived from each listing's <code class="mono">added</code> and <code class="mono">verified</code> dates in the registry. A listing appears once, under its most recent check; earlier checks and the exact edits are in the <a href="${esc(commitsUrl(ctx))}" rel="noopener">commit history</a>.</p>
  ${log.inactive.length ? `<h2 id="inactive">Not recommended</h2>
  <p>Kept so old links and configs resolve to an explanation; excluded from playbooks, recommendations and remotes.</p>
  <ul class="changes-list">
    ${log.inactive.map((s) => `<li class="change change-status"><span class="change-kind tag-status tag-status-${esc(s.status)}">${esc(statusLabel(s))}</span><span class="change-body"><a href="/mcps/${s.slug}/">${esc(s.name)}</a><span class="change-note">last confirmed <time datetime="${s.verified}">${nice(s.verified)}</time></span></span></li>`).join("\n    ")}
  </ul>` : ""}
  ${log.byDay.map((d) => `<h2 id="${dayId(d.date)}"><time datetime="${d.date}">${nice(d.date)}</time> <span class="changes-count">${d.events.length}</span></h2>
  <ul class="changes-list">
    ${d.events.map((e) => eventHtml(ctx, e)).join("\n    ")}
  </ul>`).join("\n  ")}
  <p class="changes-method">Older than ${nice(log.since)}: every listing's dates are in <a href="/api/registry.json">registry.json</a>.</p>
</section>`;

  return layout(ctx, {
    title: "Changes — new and re-verified MCP servers | mcp.film",
    description: `What changed in the mcp.film directory in the last ${log.days} days: ${counts.added} new listings, ${counts.verified} re-verifications, and inactive servers.`,
    path: "/changes/",
    page: "changes",
    md: "/changes.md",
    feeds: [{ title: "mcp.film changes", href: "/changes.xml" }],
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "mcp.film changes",
        description: `New listings, re-verifications and inactive servers in the mcp.film directory over the last ${log.days} days.`,
        url: `${site.url}/changes/`,
        dateModified: log.newest,
        publisher: organizationLd(ctx),
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: log.events.length,
          itemListElement: log.events.slice(0, 50).map((e, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${kindLabel(e)}: ${e.server.name}`,
            url: `${site.url}/mcps/${e.server.slug}/`,
          })),
        },
      },
      breadcrumbLd(ctx, [{ name: "Changes" }]),
    ],
  });
};

export const renderChangesMd = (ctx) => {
  const log = changeLog(ctx);
  const { counts } = log;
  const md = (s) => `[${s.name}](${ctx.site.url}/mcps/${s.slug}.md)`;
  const lines = [
    "# mcp.film changes",
    "",
    `> New listings, re-verifications and inactive servers, ${log.since} to ${log.until}, newest first.`,
    "",
    `Derived from each listing's \`added\` and \`verified\` dates; a listing appears once, under its most recent check. Edits and earlier checks: ${commitsUrl(ctx)}. Atom feed: ${ctx.site.url}/changes.xml`,
    "",
    `- New listings: ${counts.added}`,
    `- Re-verified: ${counts.verified}`,
    `- Checked in the last ${log.days} days: ${counts.checked} of ${counts.total}`,
    `- Inactive: ${counts.inactive}`,
    "",
  ];
  if (log.inactive.length) {
    lines.push("## Not recommended", "", ...log.inactive.map((s) => `- ${statusLabel(s)}: ${md(s)} (last confirmed ${s.verified})`), "");
  }
  for (const d of log.byDay) {
    lines.push(`## ${d.date}`, "");
    for (const e of d.events) {
      const s = e.server;
      const tail = e.kind === "added" ? `${s.tagline}${isInactive(s) ? ` (${s.status})` : ""}` : `${catById(ctx, s.category)?.name ?? s.category}, ${typeLabel(s)}`;
      lines.push(`- ${kindLabel(e)}: ${md(s)} — ${tail}`);
    }
    lines.push("");
  }
  lines.push(`Canonical: ${ctx.site.url}/changes/`);
  return lines.join("\n") + "\n";
};

// One Atom entry per event. When a listing is re-verified again, its old entry drops out
// and a new one (new id) takes its place, so feed readers never see an entry rewritten.
export const renderChangesFeed = (ctx) => {
  const log = changeLog(ctx);
  const entries = log.events.slice(0, FEED_LIMIT);
  const summary = (e) => {
    const s = e.server;
    if (e.kind === "added") return `${s.tagline} (${s.vendor}, ${typeLabel(s)})`;
    if (e.kind === "status") return `${s.name} is listed as ${s.status}; status confirmed ${e.date}. ${s.tagline}`;
    return `${s.name} was re-verified on ${e.date}. ${s.tagline}`;
  };
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>mcp.film — directory changes</title>
  <subtitle>New listings, re-verifications and inactive MCP servers for AI filmmaking.</subtitle>
  <link href="${ctx.site.url}/changes.xml" rel="self"/>
  <link href="${ctx.site.url}/changes/"/>
  <updated>${log.newest}T00:00:00Z</updated>
  <id>${ctx.site.url}/changes/</id>
  <author><name>mcp.film</name></author>
${entries.map((e) => `  <entry>
    <title>${esc(`${kindLabel(e)}: ${e.server.name}`)}</title>
    <link href="${ctx.site.url}/mcps/${e.server.slug}/"/>
    <id>tag:mcp.film,${e.date}:${e.kind}:${e.server.slug}</id>
    <updated>${e.date}T00:00:00Z</updated>
    <category term="${e.kind}"/>
    <summary>${esc(summary(e))}</summary>
  </entry>`).join("\n")}
</feed>
`;
};
