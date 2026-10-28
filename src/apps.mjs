// Creative-application hubs (data/apps.json → /apps/ and /apps/{id}/).
//
// An app lists the registry entries that drive or integrate with it. Everything shown about
// an option comes from its listing; the app file adds only what a listing cannot say about
// itself: which options come from the app's own maker (`first_party`, distinct from
// `official`, which means vendor-maintained — Tripo's server is official for Tripo and
// third-party to Blender), the versions each option supports, how an indirect option relates
// to the app, and a pick only when the data supports one.
//
// Pure functions: build.mjs validates with these, the page templates and tests reuse them.

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const ALIAS_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isText = (v) => typeof v === "string" && v.trim() !== "";
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export const validateApps = (apps, { servers = [], comparisons = [] } = {}) => {
  const errors = [];
  const warnings = [];
  const bySlug = new Map(servers.map((s) => [s.slug, s]));
  if (!Array.isArray(apps)) return { errors: ["data/apps.json: must be an array of apps"], warnings };

  const ids = new Set();
  for (const a of apps) if (isObj(a) && typeof a.id === "string") ids.add(a.id);
  const seenIds = new Set();
  const aliasOwner = new Map();

  for (const a of apps) {
    const where = `app "${a?.id ?? a?.name ?? "?"}"`;
    if (!isObj(a)) { errors.push(`data/apps.json: every app must be an object`); continue; }
    for (const k of ["id", "name", "aliases", "maker", "slugs"]) if (a[k] === undefined) errors.push(`${where}: missing field "${k}"`);
    if (a.id !== undefined) {
      if (typeof a.id !== "string" || !ID_RE.test(a.id)) errors.push(`${where}: bad id format (kebab-case)`);
      else if (seenIds.has(a.id)) errors.push(`${where}: duplicate id`);
      seenIds.add(a.id);
    }
    for (const k of ["name", "maker"]) if (a[k] !== undefined && !isText(a[k])) errors.push(`${where}: ${k} must be a non-empty string`);

    if (a.aliases !== undefined) {
      if (!Array.isArray(a.aliases)) errors.push(`${where}: aliases must be an array (it may be empty)`);
      else for (const alias of a.aliases) {
        if (typeof alias !== "string" || !ALIAS_RE.test(alias)) { errors.push(`${where}: alias ${JSON.stringify(alias)} must be lowercase kebab-case`); continue; }
        if (ids.has(alias)) errors.push(`${where}: alias "${alias}" collides with an app id`);
        if (aliasOwner.has(alias)) errors.push(`${where}: alias "${alias}" is also an alias of "${aliasOwner.get(alias)}"`);
        else aliasOwner.set(alias, a.id);
      }
    }

    const slugs = Array.isArray(a.slugs) ? a.slugs : null;
    if (a.slugs !== undefined && (!slugs || !slugs.length)) errors.push(`${where}: slugs must list at least one server`);
    if (slugs) {
      if (new Set(slugs).size !== slugs.length) errors.push(`${where}: slugs repeat a server`);
      for (const slug of slugs) if (!bySlug.has(slug)) errors.push(`${where}: unknown server slug "${slug}"`);
      if (slugs.length && slugs.every((slug) => bySlug.get(slug)?.status)) warnings.push(`${where}: every listed option is inactive`);
    }
    const inApp = (slug) => slugs?.includes(slug);

    if (a.first_party !== undefined) {
      if (!Array.isArray(a.first_party)) errors.push(`${where}: first_party must be an array of slugs`);
      else for (const slug of a.first_party) {
        if (!inApp(slug)) errors.push(`${where}: first_party "${slug}" is not one of the app's slugs`);
        else if (bySlug.get(slug) && bySlug.get(slug).official !== true) errors.push(`${where}: first_party "${slug}" is not marked official in the registry`);
      }
    }

    for (const field of ["versions", "roles"]) {
      if (a[field] === undefined) continue;
      if (!isObj(a[field])) { errors.push(`${where}: ${field} must be an object of slug → text`); continue; }
      for (const [slug, text] of Object.entries(a[field])) {
        if (!inApp(slug)) errors.push(`${where}: ${field}.${slug} is not one of the app's slugs`);
        if (!isText(text)) errors.push(`${where}: ${field}.${slug} must be a non-empty string`);
        else if (text.length > 220) errors.push(`${where}: ${field}.${slug} is over 220 characters`);
      }
    }

    if (a.pick !== undefined) {
      if (!inApp(a.pick)) errors.push(`${where}: pick "${a.pick}" is not one of the app's slugs`);
      else if (bySlug.get(a.pick)?.status) errors.push(`${where}: pick "${a.pick}" is ${bySlug.get(a.pick).status}`);
      if (!isText(a.pick_why)) errors.push(`${where}: pick needs a pick_why`);
    } else if (a.pick_why !== undefined) {
      errors.push(`${where}: pick_why without pick`);
    }
    for (const k of ["intro", "official_note"]) if (a[k] !== undefined && !isText(a[k])) errors.push(`${where}: ${k} must be a non-empty string`);
  }

  // An app with several options and a curated head-to-head should say what the verdict says.
  for (const a of apps) {
    if (!isObj(a) || !Array.isArray(a.slugs)) continue;
    if (comparisons.some((c) => Array.isArray(c.slugs) && c.slugs.every((s) => a.slugs.includes(s))) || a.slugs.length < 2) continue;
    if (!a.pick && !a.intro) warnings.push(`app "${a.id}": ${a.slugs.length} options, no pick, no intro and no comparison; the page will only count them`);
  }
  return { errors, warnings };
};

// ------------------------------------------------------------------ derivation
export const isInactiveListing = (s) => Boolean(s?.status);

// Pick first, then the maker's own server, then the browsing order (active, official,
// hosted, name). Inactive options always sort last.
export const appOptions = (servers, app) => {
  const bySlug = new Map(servers.map((s) => [s.slug, s]));
  const first = new Set(app.first_party ?? []);
  const rank = (s) => (isInactiveListing(s) ? 3 : s.slug === app.pick ? 0 : first.has(s.slug) ? 1 : 2);
  return app.slugs
    .map((slug) => bySlug.get(slug))
    .filter(Boolean)
    .sort((a, b) =>
      rank(a) - rank(b)
      || Number(Boolean(b.official)) - Number(Boolean(a.official))
      || Number(Boolean(b.install?.remote_url)) - Number(Boolean(a.install?.remote_url))
      || a.name.localeCompare(b.name));
};

// "first-party" (the app's maker), "vendor" (official, from another vendor), "community".
export const maintainerKind = (app, s) =>
  (app.first_party ?? []).includes(s.slug) ? "first-party" : s.official ? "vendor" : "community";

// Comparisons whose every option belongs to this app.
export const appComparisons = (comparisons, app) =>
  (comparisons ?? []).filter((c) => c.slugs.every((slug) => app.slugs.includes(slug)));

// Apps a listing belongs to (server pages link to them; search indexes their names).
export const appsForSlug = (apps, slug) => (apps ?? []).filter((a) => a.slugs.includes(slug));

export const appCounts = (servers, app) => {
  const list = appOptions(servers, app);
  const active = list.filter((s) => !isInactiveListing(s));
  return {
    total: list.length,
    active: active.length,
    inactive: list.length - active.length,
    firstParty: active.filter((s) => maintainerKind(app, s) === "first-party"),
    vendor: active.filter((s) => maintainerKind(app, s) === "vendor"),
    community: active.filter((s) => maintainerKind(app, s) === "community"),
    hosted: active.filter((s) => s.install?.remote_url),
    inactiveList: list.filter(isInactiveListing),
  };
};

export const APP_DESCRIPTION_MAX = 155;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "3 MCP servers for Blender: 1 official (Blender Lab MCP Server), 1 community, 1 from another vendor. Our pick: Blender MCP."
// Built from parts; optional tails drop until it fits, and it never ends mid-word.
// "3 MCP servers for Blender: 1 official (Blender Lab MCP Server), 1 community, 1 from another
// vendor; all local." `names: false` drops the parenthesised names.
// "DaVinci Resolve Studio MCP (Blackmagic)" → "DaVinci Resolve Studio MCP" inside a parenthesis.
export const shortName = (s) => s.name.replace(/\s*\([^)]*\)\s*$/, "").trim() || s.name;

export const appCountSentence = (servers, app, { names = true } = {}) => {
  const c = appCounts(servers, app);
  const firstNames = names ? c.firstParty.map(shortName).join(", ") : "";
  const split = [
    c.firstParty.length ? `${c.firstParty.length} official${firstNames ? ` (${firstNames})` : ""}` : `none from ${app.maker}`,
    c.community.length ? `${c.community.length} community` : null,
    c.vendor.length ? `${c.vendor.length} from another vendor` : null,
  ].filter(Boolean);
  const where = c.active && c.hosted.length === c.active ?(c.active > 1 ? "all hosted" : "hosted")
    : c.hosted.length ? `${c.hosted.length} hosted`
    : c.active > 1 ? "all local" : "local";
  const inactive = c.inactive ? ` Plus ${c.inactive} ${[...new Set(c.inactiveList.map((s) => s.status))].join(" or ")}.` : "";
  return `${plural(c.active, "MCP server")} for ${app.name}: ${split.join(", ")}; ${where}.${inactive}`;
};

export const appMetaDescription = (servers, app) => {
  const pick = app.pick ? servers.find((s) => s.slug === app.pick) : null;
  const tails = [
    pick ? `Our pick: ${pick.name}.` : null,
    "Versions, setup and caveats compared.",
  ].filter(Boolean);
  const candidates = [appCountSentence(servers, app), appCountSentence(servers, app, { names: false })];
  for (const base of candidates) {
    if (base.length > APP_DESCRIPTION_MAX) continue;
    let text = base;
    for (const t of tails) if (text.length + 1 + t.length <= APP_DESCRIPTION_MAX) text += ` ${t}`;
    return text;
  }
  return `${plural(c.active, "MCP server")} for ${app.name}, compared.`;
};

export const APP_TITLE_MAX = 80;
export const appTitle = (servers, app) => {
  const n = appCounts(servers, app).total;
  const long = n > 1 ? `${app.name} MCP servers — every option compared | mcp.film` : `${app.name} MCP server — setup, versions & caveats | mcp.film`;
  return long.length <= APP_TITLE_MAX ? long : `${app.name} MCP servers compared | mcp.film`;
};

// The compact form the registry and the meta-MCP carry: enough to search by app name or
// alias and to link to the hub.
export const appSummary = (siteUrl, app) => ({
  id: app.id,
  name: app.name,
  aliases: app.aliases ?? [],
  maker: app.maker,
  slugs: app.slugs,
  url: `${siteUrl}/apps/${app.id}/`,
  markdown: `${siteUrl}/apps/${app.id}.md`,
});
