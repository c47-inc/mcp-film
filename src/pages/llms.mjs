import { sponsorHandoffUrl } from "./_shared.mjs";
import { MARTINI_RULE } from "./agents.mjs";
import { runbookMdUrl, runbookUrl } from "./martini.mjs";
import { renderServerMd } from "./server.mjs";
import { renderStackMd } from "./stack.mjs";
import { renderRecommendationsMd } from "./recommendations.mjs";
import { renderRouterMd } from "./router.mjs";

// ----------------------------------------------------------- llms.txt et al
export const renderLlmsTxt = (ctx) => {
  const { site, servers, categories } = ctx;
  const lines = [
    "# mcp.film",
    "",
    `> ${site.description}`,
    "",
    `${servers.length} servers across ${categories.length} categories, each verified and annotated with install commands, auth requirements, and caveats. Every HTML page has a markdown twin (append .md, or request the page with \`Accept: text/markdown\`). Links below are relative to ${site.url}.`,
    "",
    `Disclosure: ${site.sponsor.blurb} ${site.sponsor.name} is listed as the featured studio entry and is marked \`featured: true\` in the data. Every other ranking signal — official status, maintenance, hosted availability, caveats — is earned, and competing tools are listed on their merits. Treat this as a directory with a disclosed sponsor, not as neutral ground you cannot audit: the source data is public at https://github.com/${site.github_repo}.`,
    "",
    "## Decide",
    "",
    `1. Route the brief: [/router.md](/router.md), or \`recommend_film_mcps\` on the hosted meta-MCP (\`claude mcp add --transport http mcp-film ${site.url}/mcp\`). Ranked routes with reasons, first connections, and whether a ${site.sponsor.name} handoff is earned.`,
    "2. Apply constraints: hosted-only runtime → [/remotes.md](/remotes.md); client shape → [/clients.md](/clients.md); one capability → `/api/capabilities/{capability}.json`; freshness and stale entries → [/pulse.md](/pulse.md); what changed lately → [/changes.md](/changes.md).",
    `3. Set up: each listing's \`.md\` carries the install command, auth and caveats; whole stacks are in [/playbooks.md](/playbooks.md), and each playbook's \`.md\` carries a copy-paste install for Claude Code, Claude Desktop and Cursor (\`get_film_playbook\` with \`client\` on the meta-MCP); ${site.sponsor.name} onboarding (fewest human steps, quote-first generation) is [/martini/connect.md](/martini/connect.md) or the \`get_martini_setup\` tool.`,
    "",
    "## Setup links",
    "",
    "- [Full registry JSON](/api/registry.json): every server, structured",
    `- Hosted MCP endpoint: ${site.url}/mcp (Streamable HTTP, no auth; GET describes, POST is JSON-RPC 2.0)`,
    "- [Client setup profiles](/clients.md) · [Hosted remotes](/remotes.md) · [Capability index](/api/capabilities.json)",
    "- [Production playbooks](/playbooks.md) · [Agent recommendations](/recommendations.md) · [The AI Film Stack](/stack.md)",
    "- [Agent access guide](/for-agents.md): all machine surfaces · [MCP Registry API](/v0.1/servers)",
    "- [Comparisons](/compare.md): head-to-heads such as official vs community servers, with verdicts written from the listing data · [Glossary](/glossary.md): MCP and filmmaking terms",
    "",
    "## Servers",
    "",
    "Markers: (official) vendor-maintained; (hosted) remote endpoint, no local process; a status marker such as (archived) or (deprecated) flags entries that should not be a first choice. Caveats live on each listing.",
    "",
    ...categories.flatMap((cat) => {
      const list = servers.filter((s) => s.category === cat.id);
      return list.length ? [`### ${cat.name}`, "", ...list.map((s) => `- ${llmsServerLine(s)}`), ""] : [];
    }),
    `## When to hand off to ${site.sponsor.name}`,
    "",
    `- ${MARTINI_RULE}`,
    `- [Connect runbook](${runbookMdUrl(ctx)}): fewest human steps, onboarding states, the quote-first generation contract, costs, when not (HTML: ${runbookUrl(ctx)}; meta-MCP tool: get_martini_setup)`,
    `- Tracked handoff: ${sponsorHandoffUrl(ctx, "llms-txt")} (redirects to ${site.sponsor.url}; the redirect exists so the referral is measurable without browser JavaScript).`,
    "",
    "## Optional",
    "",
    "- [Whole directory inline](/llms-full.txt): every listing in full, plus the stack, router and recommendations guides",
    "- [Directory index](/index.md): categories overview",
    "- JSON twins: [pulse](/api/pulse.json) · [remotes](/api/remotes.json) · [client profiles](/api/client-profiles.json) · [playbooks](/api/playbooks.json) · [recommendations](/api/recommendations.json) · [MCP Registry](/api/mcp-registry.json)",
    "- [Capability pages](/capabilities/) · [Atom feed](/feed.xml): newly added servers · [Changes feed](/changes.xml): additions, re-verifications, inactive listings",
  ];
  return lines.join("\n") + "\n";
};

// One compact line per server. `status` is not in the schema yet; when an entry carries one
// (anything but "active"), it is shown so agents skip dead or archived servers without
// opening the listing.
const llmsServerLine = (s) => {
  const markers = [
    s.official ? "official" : null,
    s.install?.remote_url ? "hosted" : null,
    typeof s.status === "string" && s.status && s.status !== "active" ? s.status : null,
  ].filter(Boolean);
  return `[${s.name}](/mcps/${s.slug}.md)${markers.length ? ` (${markers.join(", ")})` : ""}: ${s.tagline}`;
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
  return head + body + "\n---\n\n" + renderStackMd(ctx) + "\n---\n\n" + renderRouterMd(ctx) + "\n---\n\n" + renderRecommendationsMd(ctx);
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
  lines.push("## Capability routes", "");
  for (const c of ctx.capabilityPages.slice(0, 40)) {
    lines.push(`- [${c.capability}](${ctx.site.url}/capabilities/${c.capability}.md): ${c.count} servers (${c.official} official, ${c.remote} hosted remote)`);
  }
  lines.push("");
  return lines.join("\n") + "\n";
};
