#!/usr/bin/env node
// data/apps.json: validation errors for a bad file, and the generated title, description and
// option order for the creative-app hubs (/apps/{id}/).
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  APP_DESCRIPTION_MAX, APP_TITLE_MAX, appCountSentence, appMetaDescription, appOptions, appTitle, appsForSlug, maintainerKind, validateApps,
} from "../src/apps.mjs";

const server = (slug, over = {}) => ({
  slug, name: `${slug} MCP`, vendor: "Community (someone)", official: false,
  install: { remote_url: null }, auth: { type: "local-app" }, verified: "2026-10-01", ...over,
});
const servers = [
  server("tool-community"),
  server("tool-maker", { name: "Maker MCP (Maker Co)", vendor: "Maker Co", official: true }),
  server("tool-vendor", { vendor: "Other Vendor", official: true, install: { remote_url: "https://mcp.example.com/mcp" }, auth: { type: "oauth" } }),
  server("tool-dead", { status: "archived" }),
];
const good = () => ({
  id: "app-one", name: "App One", aliases: ["a1"], maker: "Maker Co",
  slugs: ["tool-community", "tool-maker", "tool-vendor", "tool-dead"],
  first_party: ["tool-maker"],
});
const errorsFor = (apps, extra = {}) => validateApps(apps, { servers, comparisons: [], ...extra }).errors;
const expectError = (apps, re, label) => {
  const errors = errorsFor(apps);
  assert.ok(errors.some((e) => re.test(e)), `${label}: expected ${re}, got ${JSON.stringify(errors)}`);
};

// ------------------------------------------------------------ validation
assert.deepEqual(errorsFor([good()]), [], "a well-formed app validates");
assert.deepEqual(errorsFor([{ ...good(), aliases: [] }]), [], "aliases may be empty");
expectError({}, /must be an array/, "not an array");
expectError([{ ...good(), slugs: ["tool-community", "nope"] }], /unknown server slug "nope"/, "unknown slug");
expectError([{ ...good(), slugs: [] }], /at least one server/, "empty slugs");
expectError([{ ...good(), slugs: ["tool-community", "tool-community"] }], /repeat a server/, "duplicate slug");
expectError([good(), { ...good(), aliases: ["a2"] }], /duplicate id/, "duplicate id");
expectError([good(), { ...good(), id: "app-two", aliases: ["a1"] }], /alias "a1" is also an alias of "app-one"/, "alias shared by two apps");
expectError([good(), { ...good(), id: "app-two", aliases: ["app-one"] }], /alias "app-one" collides with an app id/, "alias equal to another app's id");
expectError([{ ...good(), aliases: ["app-one"] }], /collides with an app id/, "alias equal to its own id");
expectError([{ ...good(), aliases: ["Has Space"] }], /lowercase kebab-case/, "alias format");
expectError([{ ...good(), id: "Bad Id" }], /bad id format/, "id format");
expectError([{ ...good(), maker: undefined }], /missing field "maker"/, "missing maker");
expectError([{ ...good(), first_party: ["tool-community"] }], /not marked official/, "first_party must be official");
expectError([{ ...good(), first_party: ["elsewhere"] }], /not one of the app's slugs/, "first_party outside slugs");
expectError([{ ...good(), pick: "tool-maker" }], /pick needs a pick_why/, "pick without why");
expectError([{ ...good(), pick_why: "Because." }], /pick_why without pick/, "why without pick");
expectError([{ ...good(), pick: "tool-dead", pick_why: "Because." }], /pick "tool-dead" is archived/, "inactive pick");
expectError([{ ...good(), pick: "elsewhere", pick_why: "Because." }], /pick "elsewhere" is not one of the app's slugs/, "pick outside slugs");
expectError([{ ...good(), versions: { elsewhere: "1.0+" } }], /versions\.elsewhere is not one of the app's slugs/, "versions key outside slugs");
expectError([{ ...good(), roles: { "tool-vendor": "" } }], /roles\.tool-vendor must be a non-empty string/, "empty role");
expectError([{ ...good(), intro: "" }], /intro must be a non-empty string/, "empty intro");

// The shipped file validates against the shipped registry.
{
  const registry = fs.readdirSync(new URL("../data/registry/", import.meta.url))
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(fs.readFileSync(new URL(`../data/registry/${f}`, import.meta.url), "utf8")));
  const apps = JSON.parse(fs.readFileSync(new URL("../data/apps.json", import.meta.url), "utf8"));
  const comparisons = JSON.parse(fs.readFileSync(new URL("../data/comparisons.json", import.meta.url), "utf8"));
  assert.deepEqual(validateApps(apps, { servers: registry, comparisons }).errors, [], "data/apps.json validates");
  for (const app of apps) {
    const title = appTitle(registry, app);
    assert.ok(title.length <= APP_TITLE_MAX, `${app.id} title ${title.length} chars`);
    const d = appMetaDescription(registry, app);
    assert.ok(d.length <= APP_DESCRIPTION_MAX && /[\p{L}\p{N}.)]$/u.test(d), `${app.id} description: ${d}`);
  }
}

// ------------------------------------------------------------ derivation
const app = { ...good(), pick: "tool-community", pick_why: "Because." };
assert.deepEqual(appOptions(servers, app).map((s) => s.slug), ["tool-community", "tool-maker", "tool-vendor", "tool-dead"], "pick, maker's own, browse order, inactive last");
assert.deepEqual(appOptions(servers, good()).map((s) => s.slug), ["tool-maker", "tool-vendor", "tool-community", "tool-dead"], "without a pick the maker's own server leads");
assert.equal(maintainerKind(app, servers[1]), "first-party");
assert.equal(maintainerKind(app, servers[2]), "vendor", "official for its own vendor, third-party to the app");
assert.equal(maintainerKind(app, servers[0]), "community");
assert.equal(appCountSentence(servers, app), "3 MCP servers for App One: 1 official (Maker MCP), 1 community, 1 from another vendor; 1 hosted. Plus 1 archived.");
assert.equal(appCountSentence(servers, { ...good(), first_party: [], slugs: ["tool-community"] }), "1 MCP server for App One: none from Maker Co, 1 community; local.");
assert.match(appMetaDescription(servers, app), /Our pick: tool-community MCP\.$|Our pick: tool-community MCP\. /);
assert.equal(appTitle(servers, app), "App One MCP servers — every option compared | mcp.film");
assert.equal(appTitle(servers, { ...good(), slugs: ["tool-maker"] }), "App One MCP server — setup, versions & caveats | mcp.film");
const long = { ...good(), name: "An Application With A Name Long Enough To Overflow" };
assert.ok(appTitle(servers, long).length <= APP_TITLE_MAX + 20 && appTitle(servers, long).endsWith("compared | mcp.film"), "long names fall back to the short title");
assert.deepEqual(appsForSlug([app, { ...good(), id: "other", slugs: ["tool-vendor"] }], "tool-vendor").map((a) => a.id), ["app-one", "other"]);

console.log("✓ apps checks passed");
