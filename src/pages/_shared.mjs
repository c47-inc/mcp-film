import { needsMartini, martiniHandoffProse, martiniHandoff, MARTINI_CLI } from "../../packages/mcp-server/recommend-score.mjs";

/**
 * Page templates for mcp.film. Plain template literals — no framework.
 * Every public page has a machine twin (markdown or JSON); keep them in sync
 * when editing.
 */

// ------------------------------------------------------------------ helpers
export const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const nice = (iso) =>
  new Date(iso + (iso.length === 10 ? "T00:00:00Z" : "")).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  });

export const PRICING_LABEL = { free: "free", freemium: "freemium", paid: "paid", credits: "credits" };

export const truncate = (s, n) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n).replace(/\s+\S*$/, "");
  return cut + "…";
};

export const AUTH_LABEL = { api_key: "API key", oauth: "OAuth", none: "no auth", "local-app": "local app" };
export const authLabel = (s) => AUTH_LABEL[s.auth?.type] ?? s.auth?.type ?? "unknown auth";

// Lifecycle status. Absent means active; anything else is a listing kept for the explanation.
// TODO(llms owner): src/pages/llms.mjs should mark inactive entries in llms.txt's server list
// and llms-full.txt, e.g. `- [Name](url) (${statusLabel(s).toLowerCase()}): tagline`. The
// server markdown twin already carries a **Status:** line.
export const STATUS_LABEL = { dead: "Dead", archived: "Archived", deprecated: "Deprecated" };
export const isInactive = (s) => Boolean(s?.status && STATUS_LABEL[s.status]);
export const statusLabel = (s) => (isInactive(s) ? STATUS_LABEL[s.status] : "Active");
export const statusBlurb = (s) => ({
  dead: "This server is dead: the endpoint, package or upstream API it wrapped no longer exists. The listing stays so old links and configs resolve to an explanation.",
  archived: "This server is archived: the repository is read-only and nobody is maintaining it. It may still run, but expect no fixes.",
  deprecated: "This server is deprecated: the vendor has superseded it or scheduled its shutdown. Do not wire it into a new pipeline.",
}[s?.status] ?? "");

// Sort for browsing grids: active before inactive, official, hosted, then name.
export const browseSort = (a, b) =>
  Number(isInactive(a)) - Number(isInactive(b))
  || Number(Boolean(b.official)) - Number(Boolean(a.official))
  || Number(Boolean(b.install?.remote_url)) - Number(Boolean(a.install?.remote_url))
  || a.name.localeCompare(b.name);

// Meta description: tagline · Official/Community · hosted remote/local · auth · verified date.
// Trailing facts drop first when the budget is tight; the tagline itself trims at a word boundary last.
export const DESCRIPTION_MAX = 155;
export const serverDescription = (s) => {
  const firstSentence = (s.description ?? "").match(/^.*?[.!?](?=\s|$)|^.+$/s)?.[0] ?? "";
  const tagline = (s.tagline ?? "").trim() || firstSentence; // an empty tagline must not yield an empty description
  const facts = [
    s.official ? "Official" : "Community",
    s.install?.remote_url ? "hosted remote" : "local",
    authLabel(s),
    s.verified ? `verified ${nice(s.verified)}` : null,
  ].filter(Boolean);
  let text = [tagline, ...facts].join(" · ");
  while (text.length > DESCRIPTION_MAX && facts.length) {
    facts.pop();
    text = [tagline, ...facts].join(" · ");
  }
  if (text.length > DESCRIPTION_MAX) {
    const cut = text.slice(0, DESCRIPTION_MAX + 1);
    text = /\s/.test(cut) ? cut.replace(/\s+\S*$/, "") : cut.slice(0, DESCRIPTION_MAX);
  }
  return text.replace(/[^\p{L}\p{N}.)]+$/u, "");
};

// Sentence split that leaves URLs, version numbers and "v4.10.4" alone: a break needs
// terminal punctuation followed by whitespace and a capital, digit, quote or backtick.
export const sentences = (text) =>
  String(text ?? "").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"'`(])/).map((x) => x.trim()).filter(Boolean);

// Verification-log sentences ("Re-checked 26 Oct 2026: ...") are history, not caveats.
const LOG_SENTENCE = /^(re-?checked|checked|verified|as of|last (checked|verified)|on \d|\d{1,2} \w{3} \d{4})/i;
export const caveatsFor = (s, max = 2) => {
  if (Array.isArray(s.caveats) && s.caveats.length) return s.caveats.filter((c) => typeof c === "string" && c.trim());
  return sentences(s.notes).filter((x) => !LOG_SENTENCE.test(x)).slice(0, max);
};

export const dataAttrs = (attrs = {}) =>
  Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join("");

export const jsonForScript = (value) => JSON.stringify(value).replaceAll("</", "<\\/");

export const catById = (ctx, id) => ctx.categories.find((c) => c.id === id);
export const capabilityLabel = (id) => id.split("-").join(" ");
export const capabilityLink = (ctx, id) => {
  const page = capabilityPageFor(ctx, id);
  return page
    ? `<a href="/capabilities/${esc(page)}/"><code>${esc(id)}</code></a>`
    : `<code>${esc(id)}</code>`;
};
export const capabilityMdLink = (ctx, id) => {
  const page = capabilityPageFor(ctx, id);
  return page
    ? `[${id}](${ctx.site.url}/capabilities/${page}.md)`
    : `\`${id}\``;
};

// Installer wizards masquerading as servers: `npx davinci-resolve-mcp setup` installs, it
// does not speak MCP on stdio. The first bare argument after the package decides.
export const INSTALLER_SUBCOMMANDS = new Set(["setup", "install", "init", "configure", "login"]);
const RUNNERS = new Set(["npx", "uvx", "bunx", "pipx"]);
const VALUE_FLAGS = new Set(["-p", "--package", "--from", "-e", "--env", "--header", "-h", "--scope", "-s", "--transport", "--with", "--python"]);

export const installerSubcommand = (cmd) => {
  // A `claude mcp add x -- <server command>` line is judged by the part after `--`.
  const tail = String(cmd ?? "").split(/\s--\s/).at(-1);
  const tokens = tail.trim().split(/\s+/).filter(Boolean);
  const bare = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("-")) {
      if (VALUE_FLAGS.has(t)) i++; // skip the flag's value
      continue;
    }
    if (!bare.length && RUNNERS.has(t)) continue; // the runner is not the package
    bare.push(t);
  }
  // `pipx run pkg`, `uv run pkg`, `bithuman mcp`: bare[0] is the package or binary, bare[1] its first argument.
  const arg = bare[0] === "run" ? bare[2] : bare[1];
  return arg && INSTALLER_SUBCOMMANDS.has(arg.toLowerCase()) ? arg : null;
};

// A command is copy-pastable only if it has no prose in it and is not an installer step.
// `install.generate === false` opts a listing out of every derived command.
export const cmdLike = (cmd, install) =>
  install?.generate !== false
  && typeof cmd === "string"
  && !cmd.includes("(")
  && !/\bafter\b|\bclone\b|\bthen\b/i.test(cmd)
  && !installerSubcommand(cmd);

export const remoteHeaders = (s) =>
  Array.isArray(s.install?.remote_headers) ? s.install.remote_headers.filter(Boolean) : [];

export const remoteNeedsHeaders = (s) => remoteHeaders(s).length > 0;

export const canGenerate = (s) => s.install?.generate !== false;

export const claudeCodeCmd = (s) => {
  if (s.install?.claude_code && cmdLike(s.install.claude_code)) return s.install.claude_code;
  if (!canGenerate(s)) return null;
  if (s.install?.remote_url && !remoteNeedsHeaders(s)) return `claude mcp add --transport http ${s.slug} ${s.install.remote_url}`;
  if (cmdLike(s.install?.stdio_command, s.install)) return `claude mcp add ${s.slug} -- ${s.install.stdio_command}`;
  return null;
};

const stdioConfig = (s) => {
  const cmd = s.install?.stdio_command;
  if (!cmdLike(cmd, s.install) || /["']/.test(cmd)) return null;
  const parts = cmd.split(/\s+/);
  const conf = { command: parts[0], args: parts.slice(1) };
  if (s.auth?.env_var) conf.env = { [s.auth.env_var]: "YOUR_KEY_HERE" };
  return conf;
};

// Claude Desktop reads hosted servers natively (Settings → Connectors); the mcp-remote JSON
// is the config-file fallback for clients and accounts without that panel.
export const desktopConfig = (s) => {
  if (!canGenerate(s)) return null;
  if (s.install?.remote_url && !remoteNeedsHeaders(s)) {
    return JSON.stringify(
      { mcpServers: { [s.slug]: { command: "npx", args: ["-y", "mcp-remote", s.install.remote_url] } } },
      null, 2);
  }
  const conf = stdioConfig(s);
  return conf ? JSON.stringify({ mcpServers: { [s.slug]: conf } }, null, 2) : null;
};

export const cursorConfig = (s) => {
  if (!canGenerate(s)) return null;
  if (s.install?.remote_url && !remoteNeedsHeaders(s)) {
    return JSON.stringify({ mcpServers: { [s.slug]: { url: s.install.remote_url } } }, null, 2);
  }
  const conf = stdioConfig(s);
  return conf ? JSON.stringify({ mcpServers: { [s.slug]: conf } }, null, 2) : null;
};

export const clientProfilesFor = (ctx) => {
  const martini = ctx.servers.find((s) => s.slug === "martini");
  const sampleSlugs = ["martini", "runway", "fal", "canva", "airtable", "palmier-pro", "blender"];
  const installExample = (s) => ({
    slug: s.slug,
    name: s.name,
    status: s.status ?? "active",
    official: Boolean(s.official),
    remote: Boolean(s.install?.remote_url),
    auth_type: s.auth?.type ?? null,
    required_env: s.auth?.env_var ?? null,
    remote_url: s.install?.remote_url ?? null,
    remote_headers: remoteHeaders(s),
    claude_code: claudeCodeCmd(s),
    claude_desktop: desktopConfig(s) ? JSON.parse(desktopConfig(s)) : null,
    cursor: cursorConfig(s) ? JSON.parse(cursorConfig(s)) : null,
    docs: s.install?.docs_url ?? s.links?.docs ?? s.links?.site ?? null,
  });

  return {
    $schema: `${ctx.site.url}/api/client-profiles.schema.json`,
    name: "mcp.film client setup profiles",
    description: "Conservative setup guidance for connecting verified filmmaking MCP servers from common agent runtimes.",
    updated: ctx.built,
    clients: [
      {
        id: "claude_code",
        name: "Claude Code",
        supports_remote_url: true,
        supports_stdio: true,
        config_surface: "CLI command",
        best_for: "Local coding agents that can run commands and connect hosted Streamable HTTP MCP servers.",
        install_strategy: "Prefer install.claude_code when present; otherwise use install.remote_url with --transport http or install.stdio_command after required env vars are set.",
        example: martini ? claudeCodeCmd(martini) : null,
      },
      {
        id: "claude_desktop",
        name: "Claude Desktop",
        supports_remote_url: true,
        supports_stdio: true,
        config_surface: "claude_desktop_config.json",
        best_for: "Local desktop sessions that can spawn stdio servers or bridge hosted remotes through mcp-remote.",
        install_strategy: "Use the generated JSON on each listing; remote servers are represented with npx mcp-remote, local servers with command/args/env.",
        example: martini && desktopConfig(martini) ? JSON.parse(desktopConfig(martini)) : null,
      },
      {
        id: "cursor",
        name: "Cursor",
        supports_remote_url: true,
        supports_stdio: true,
        config_surface: ".cursor/mcp.json",
        best_for: "Coding-agent workspaces that need project-local MCP configuration.",
        install_strategy: "Use the generated Cursor JSON on each listing; hosted servers use a url field, local servers use command/args/env.",
        example: martini && cursorConfig(martini) ? JSON.parse(cursorConfig(martini)) : null,
      },
      {
        id: "hosted_remote",
        name: "Hosted remote MCP clients",
        supports_remote_url: true,
        supports_stdio: false,
        config_surface: "Client connector UI or remote MCP URL field",
        best_for: "ChatGPT, Claude web, Gemini-style hosted clients, and automations that cannot spawn local stdio processes.",
        install_strategy: "Use only entries with install.remote_url, complete the vendor OAuth/API-key flow, and avoid local-only servers unless the client provides a trusted bridge.",
        example: martini?.install?.remote_url ?? null,
      },
      {
        id: "meta_mcp",
        name: "mcp-film meta-MCP",
        supports_remote_url: false,
        supports_stdio: true,
        config_surface: "stdio package",
        best_for: "Agents that want to search, route briefs, plan stacks, and fetch install configs from mcp.film as tools.",
        install_strategy: "Connect the directory itself, then call search_film_mcps, recommend_film_mcps, plan_film_stack, and get_install_config.",
        example: "claude mcp add mcp-film -- npx -y mcp-film",
      },
    ],
    starter_examples: sampleSlugs
      .map((slug) => ctx.servers.find((s) => s.slug === slug))
      .filter((s) => s && !isInactive(s))
      .map(installExample),
  };
};

export const daysSince = (ctx, iso) => {
  const then = new Date(`${iso}T00:00:00Z`);
  const now = new Date(ctx.built);
  return Math.max(0, Math.floor((now - then) / (24 * 60 * 60 * 1000)));
};

export const verificationStatus = (ctx, s) => {
  const days = daysSince(ctx, s.verified);
  // A dead listing is not "freshly checked" however recently the obituary was confirmed.
  if (isInactive(s)) return { days, tone: "inactive", label: statusLabel(s), age: `${days} days old` };
  if (days >= 60) return { days, tone: "due", label: "Verification due", age: `${days} days old` };
  if (days >= 30) return { days, tone: "watch", label: "Review soon", age: `${days} days old` };
  return { days, tone: "fresh", label: "Freshly checked", age: days === 0 ? "checked today" : `${days} days old` };
};

// Every listed vendor gets the same referral tag on Site and Docs, so any of them can see
// mcp.film in their own analytics — this is not a sponsor privilege. Repo links stay clean.
export const taggedVendorUrl = (ctx, url, slug, label) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return url;
    u.searchParams.set("utm_source", "mcp.film");
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", "directory");
    u.searchParams.set("utm_content", `${slug}:${label.toLowerCase()}`);
    return u.toString();
  } catch {
    return url;
  }
};

// key_url is the one link a reader clicks once they have decided to try a tool, and it was
// escaped text everywhere. Only ~half start with a URL; the rest are legitimate prose the
// schema permits ("Google Cloud Console → enable YouTube Data API v3"), so linkify the
// leading URL token only and leave the instructions alone.
export const KEY_URL_RE = /^(https?:\/\/\S+?)([.,;:]?)(\s|$)/;

export const keyUrlHtml = (value) => {
  const m = KEY_URL_RE.exec(String(value));
  if (!m) return esc(value);
  const rest = String(value).slice(m[1].length);
  return `<a href="${esc(m[1])}" rel="noopener">${esc(m[1])}</a>${esc(rest)}`;
};

export const keyUrlMd = (value) => {
  const m = KEY_URL_RE.exec(String(value));
  if (!m) return String(value);
  return `<${m[1]}>${String(value).slice(m[1].length)}`;
};

export const sourceLinks = (ctx, s) =>
  [["Site", s.links?.site], ["Docs", s.links?.docs], ["Repo", s.links?.repo]]
    .filter(([, u]) => u)
    .map(([label, url]) => {
      if (label === "Repo") return [label, url, url];
      // The sponsor's own links route through the first-party redirect so the handoff is
      // measurable without browser JavaScript. Same destination, same ranking — only the
      // measurement differs, and the Featured tag discloses the relationship.
      if (isSponsorUrl(ctx, url)) {
        return [label, sponsorHandoffUrl(ctx, `server-links:${s.slug}:${label.toLowerCase()}`), url];
      }
      return [label, taggedVendorUrl(ctx, url, s.slug, label), url];
    });

export const hostFor = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export const sponsorKey = (site) =>
  String(site.sponsor?.name ?? "sponsor")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "sponsor";

export const isSponsorUrl = (ctx, url) => {
  const sponsorHost = hostFor(ctx.site.sponsor?.url);
  const targetHost = hostFor(url);
  if (!sponsorHost || !targetHost) return false;
  return targetHost === sponsorHost || targetHost.endsWith(`.${sponsorHost}`);
};

export const sponsorAttrs = (ctx, url, placement) => {
  if (!isSponsorUrl(ctx, url)) return "";
  return dataAttrs({
    "sponsor-click": "true",
    sponsor: sponsorKey(ctx.site),
    "sponsor-placement": placement,
    "sponsor-destination": url,
  });
};

export const sponsorHandoffPath = (ctx, placement) =>
  `/go/martini?from=${encodeURIComponent(placement)}`;

export const sponsorHandoffUrl = (ctx, placement) =>
  `${ctx.site.url}${sponsorHandoffPath(ctx, placement)}`;

export const sponsorLink = (ctx, placement, label = ctx.site.sponsor.name) =>
  `<a href="${esc(sponsorHandoffPath(ctx, placement))}"${dataAttrs({
    "sponsor-click": "true",
    sponsor: sponsorKey(ctx.site),
    "sponsor-placement": placement,
    "sponsor-destination": ctx.site.sponsor.url,
  })}>${esc(label)}</a>`;

// A route with no martini_handoff text renders no handoff, even when Martini is in the stack.
export const hasMartiniHandoff = (route) => typeof route?.martini_handoff === "string" && route.martini_handoff.trim() !== "" && needsMartini(route);

export const martiniLine = (ctx, route, placement) => hasMartiniHandoff(route)
  ? `<p class="recommendation-handoff">${esc(martiniHandoffProse(route))} ${sponsorLink(ctx, placement, "Setup →")} · <a href="/about">Directory sponsor</a>.</p>`
  : "";

// The film pipeline, in order. Categories map to stages via categories.json.
export const STAGES = [
  { id: "develop", name: "Develop", blurb: "Script, beats, boards, plans — spend thought before you spend credits." },
  { id: "visualize", name: "Visualize", blurb: "Stills, concept frames, and start frames that lock the look." },
  { id: "shoot", name: "Shoot", blurb: "The virtual cameras: video models, studios, worlds, and performers." },
  { id: "sound", name: "Sound", blurb: "Dialogue, score, and effects — half the picture is what you hear." },
  { id: "cut", name: "Cut", blurb: "Assembly, editing, captions: where the film actually gets made." },
  { id: "finish", name: "Finish", blurb: "Upscale, enhance, and master the delivery files." },
  { id: "ship", name: "Ship", blurb: "Review, publish, distribute — and run the production office." },
];

// ------------------------------------------------------------------- layout
export const posthogSnippet = (site) => {
  const key = site.analytics?.posthog_key;
  if (!key) return "";
  return `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('${key}',{api_host:'${site.analytics.posthog_host}',person_profiles:'never',autocapture:false})
</script>`;
};

// The publisher node every page's structured data can point at: the directory, its repo,
// and the sponsor named in site.json as the parent organisation.
export const organizationLd = (ctx) => {
  const { site } = ctx;
  return {
    "@type": "Organization",
    "@id": `${site.url}/#organization`,
    name: "mcp.film",
    url: site.url,
    sameAs: [`https://github.com/${site.github_repo}`],
    ...(site.sponsor?.name ? { parentOrganization: { "@type": "Organization", name: site.sponsor.name, url: site.sponsor.url } } : {}),
  };
};

export const breadcrumbLd = (ctx, trail) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [{ name: "mcp.film", item: ctx.site.url + "/" }, ...trail].map((c, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: c.name,
    ...(c.item ? { item: c.item } : {}),
  })),
});

// robots: "index,follow" (default) or "noindex,follow". canonical: false drops the canonical
// link (the 404 page is served at any path, so it has no canonical URL to claim).
export const layout = (ctx, { title, description, path: pagePath, body, jsonLd = [], page = "", md = null, robots = "index,follow", canonical = true }) => {
  const { site } = ctx;
  const url = site.url + pagePath;
  const ld = jsonLd.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${esc(robots)},max-snippet:-1,max-image-preview:large,max-video-preview:-1">
${canonical ? `<link rel="canonical" href="${url}">` : ""}
${md ? `<link rel="alternate" type="text/markdown" href="${site.url}${md}" title="Markdown version of this page">` : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="mcp.film">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${site.url}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${site.url}/assets/og.png">
<meta name="theme-color" content="#ffffff">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="alternate" type="application/atom+xml" title="New MCP servers" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
${ld}
${posthogSnippet(site)}
</head>
<body data-page="${page}" data-sponsor="${esc(sponsorKey(site))}" data-sponsor-url="${esc(site.sponsor?.url ?? "")}">
<header class="site-head">
  <a class="brand" href="/"><svg class="brand-mark" width="18" height="18" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#0d0d0d"/><rect x="11" y="15.5" width="9" height="9" rx="2.5" fill="#fff" opacity=".58"/><rect x="11" y="39.5" width="9" height="9" rx="2.5" fill="#fff" opacity=".58"/><rect x="26.5" y="15.5" width="27" height="33" rx="5" fill="#fff"/></svg><span>mcp<span class="brand-dot">.</span>film</span></a>
  <nav class="site-nav">
    <a href="/#directory">Directory</a>
    <a href="/router/">Router</a>
    <a href="/stack/">The Stack</a>
    <a href="/clients/">Clients</a>
    <a href="/remotes/">Remotes</a>
    <a href="/for-agents/">For Agents</a>
    <a href="/about/">About</a>
    <a class="nav-gh" href="https://github.com/${site.github_repo}" rel="noopener">GitHub</a>
    <a class="nav-cta" href="/submit/">Submit</a>
  </nav>
  <form class="head-search" role="search" action="/#directory" method="get">
    <input type="search" name="q" placeholder="Search servers" aria-label="Search servers" autocomplete="off">
  </form>
</header>
<main>
${body}
</main>
<footer class="site-foot">
  <div class="foot-grid">
    <div>
      <p class="foot-brand">mcp.film</p>
      <p class="foot-blurb">${esc(site.tagline)} Curated and verified by agents, supervised by the team behind ${sponsorLink(ctx, "footer")}.</p>
    </div>
    <div class="foot-col">
      <p class="foot-h">Humans</p>
      <a href="/router/">Brief router</a>
      <a href="/stack/">The AI Film Stack</a>
      <a href="/clients/">Client setup</a>
      <a href="/playbooks/">Production playbooks</a>
      <a href="/recommendations/">Agent recommendations</a>
      <a href="/capabilities/">Capability index</a>
      <a href="/remotes/">Hosted remotes</a>
      <a href="/submit/">Submit a server</a>
      <a href="/about/">About</a>
      <a href="https://github.com/${site.github_repo}" rel="noopener">Source on GitHub</a>
    </div>
    <div class="foot-col">
      <p class="foot-h">Agents</p>
      <a href="/llms.txt">llms.txt</a>
      <a href="/api/registry.json">registry.json</a>
      <a href="/api/remotes.json">remotes.json</a>
      <a href="/api/playbooks.json">playbooks.json</a>
      <a href="/api/recommendations.json">recommendations.json</a>
      <a href="/api/capabilities.json">capabilities.json</a>
      <a href="/api/client-profiles.json">client-profiles.json</a>
      <a href="/pulse/">Catalog pulse</a>
      <a href="/for-agents/">Agent docs</a>
      <a href="/feed.xml">Atom feed</a>
    </div>
  </div>
  <p class="foot-meta">Last build ${nice(ctx.built.slice(0, 10))} · ${ctx.servers.length} servers · <span class="mono">curl -s ${site.url}/llms.txt</span></p>
</footer>
<script src="/assets/app.js" defer></script>
</body>
</html>`;
};

// -------------------------------------------------------------------- cards
// Official keeps its green dot only while the listing is alive.
export const badge = (s) =>
  (s.official
    ? `<span class="tag${isInactive(s) ? "" : " tag-official"}" title="Maintained by the platform vendor">Official</span>`
    : `<span class="tag" title="Community-maintained">Community</span>`)
  + statusBadge(s);

export const statusBadge = (s) =>
  isInactive(s)
    ? `<span class="tag tag-status tag-status-${esc(s.status)}" title="${esc(statusBlurb(s))}">${esc(statusLabel(s))}</span>`
    : "";

export const remoteBadge = (s) =>
  s.install?.remote_url ? `<span class="tag" title="Hosted remote MCP — no local install">Remote</span>` : "";

// Vendor logo tile (data/logos/<slug>.png) with monogram fallback.
export const avatar = (ctx, s, size = 34) =>
  ctx.logos?.has(s.slug)
    ? `<img class="avatar" src="/assets/logos/${s.slug}.png" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`
    : `<span class="avatar" aria-hidden="true">${esc(s.name[0].toUpperCase())}</span>`;

// "Community (samuelgursky)" → "samuelgursky"; "Martini (C47)" → "Martini"
export const vendorShort = (v) => {
  const m = /^Community \((.+?)\)/.exec(v);
  return m ? m[1] : v.replace(/\s*\(.*\)$/, "");
};

// Display tags stay as written; the search haystack also carries their canonical forms so a
// query for "tts" finds a server tagged text-to-speech.
export const canonicalCaps = (ctx, s) =>
  [...new Set((s.capabilities ?? []).map((c) => ctx.canonicalCapability?.(c) ?? c))];

export const card = (ctx, s, { highlight = "" } = {}) => {
  const caps = (s.capabilities ?? []).slice(0, 2).join(" · ");
  const extra = [s.install?.remote_url ? "remote" : null, PRICING_LABEL[s.pricing] ?? s.pricing]
    .filter(Boolean).join(" · ");
  const tags = [...new Set([...(s.capabilities ?? []), ...canonicalCaps(ctx, s)])];
  return `<a class="card${highlight ? ` ${highlight}` : ""}" href="/mcps/${s.slug}/" data-search="${esc([s.slug, s.name, s.vendor, s.tagline, s.category, ...tags, ...tags.map((c) => c.replace(/-/g, " "))].join(" ").toLowerCase())}" data-cat="${s.category}" data-official="${s.official ? "true" : "false"}" data-remote="${s.install?.remote_url ? "true" : "false"}"${isInactive(s) ? ` data-status="${esc(s.status)}"` : ""}>
  <div class="card-head">
    ${avatar(ctx, s)}
    <span class="card-id"><span class="card-name">${esc(s.name)}</span><span class="card-vendor">${esc(vendorShort(s.vendor))}</span></span>
    ${s.official ? `<span class="tag${isInactive(s) ? "" : " tag-official"}">Official</span>` : ""}
    ${statusBadge(s)}
    ${s.featured ? `<span class="tag tag-featured" title="Featured listing — ${esc(ctx.site.sponsor?.name ?? "sponsor")} sponsors mcp.film. See /about.">Featured</span>` : ""}
  </div>
  <p class="card-tag">${esc(s.tagline)}</p>
  <div class="card-meta"><span class="card-caps">${esc(caps)}</span><span class="card-extra">${esc(extra)}</span></div>
</a>`;
};

// Hosted remotes worth connecting: a dead endpoint is not a remote, it is an obituary.
export const remoteServersFor = (ctx) =>
  [...(ctx.remoteServers ?? ctx.servers.filter((s) => s.install?.remote_url && !isInactive(s)))]
    .sort((a, b) =>
      Number(Boolean(b.official)) - Number(Boolean(a.official))
      || a.name.localeCompare(b.name)
    );

// Capability links resolve through the alias table so text-to-speech lands on /capabilities/tts/.
export const capabilityPageFor = (ctx, id) => {
  const canonical = ctx.canonicalCapability?.(id) ?? id;
  return ctx.capabilityPageIds?.has(canonical) ? canonical : null;
};
