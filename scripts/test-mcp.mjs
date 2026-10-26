#!/usr/bin/env node
// Meta-MCP server checks: protocol negotiation, response shapes, search quality,
// status filtering, install validation and the Martini runbook. Run after `node build.mjs`.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { makeCallTool, TOOLS, PROTOCOL_VERSIONS, negotiateProtocolVersion, initializeResult, SERVER_INSTRUCTIONS } from "../packages/mcp-server/core.mjs";
import { mcpHandleMessage } from "../dist/_worker.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const json = (file) => JSON.parse(read(file));
const registry = json("dist/api/registry.json");
const loaders = {
  loadRegistry: async () => registry,
  loadRecommendations: async () => json("dist/api/recommendations.json"),
  loadPlaybooks: async () => json("dist/api/playbooks.json"),
  loadPulse: async () => json("dist/api/pulse.json"),
};
const call = makeCallTool(loaders, "test");

// ---- 1. Protocol negotiation: a supported version is echoed, anything else gets the latest.
assert.deepEqual(PROTOCOL_VERSIONS, ["2025-11-25", "2025-06-18", "2025-03-26"]);
for (const v of PROTOCOL_VERSIONS) assert.equal(negotiateProtocolVersion(v), v);
for (const v of ["2024-11-05", "9999-01-01", "", undefined, null, 42]) assert.equal(negotiateProtocolVersion(v), "2025-11-25", String(v));
const init = initializeResult("2025-06-18", "1.2.3");
assert.equal(init.protocolVersion, "2025-06-18");
assert.equal(init.serverInfo.version, "1.2.3");
assert.equal(init.instructions, SERVER_INSTRUCTIONS);
assert.ok(SERVER_INSTRUCTIONS.length < 600, `instructions ${SERVER_INSTRUCTIONS.length} chars`);
for (const s of ["recommend_film_mcps", "search_film_mcps", "get_install_config", "list_client_profiles", "get_martini_setup"]) {
  assert.ok(SERVER_INSTRUCTIONS.includes(s), s);
}

// Edge worker: same result through the JSON-RPC handler.
const edgeInit = await mcpHandleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }, call);
assert.equal(edgeInit.result.protocolVersion, "2025-11-25");
assert.equal(edgeInit.result.instructions, SERVER_INSTRUCTIONS);
assert.equal((await mcpHandleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-03-26" } }, call)).result.protocolVersion, "2025-03-26");

// Stdio server: spawn it offline and drive one initialize + tools/list.
async function stdio(messages) {
  const child = spawn(process.execPath, [new URL("../packages/mcp-server/server.mjs", import.meta.url).pathname], {
    env: { ...process.env, MCP_FILM_OFFLINE: "1" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  let out = "";
  const wanted = messages.filter((m) => m.id !== undefined).length;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stdio server timed out")), 15000);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.split("\n").filter(Boolean).length >= wanted) { clearTimeout(timer); resolve(); }
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
  });
  child.kill();
  return out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const [stdioInit, stdioList] = await stdio([
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2030-01-01" } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list" },
]);
assert.equal(stdioInit.result.protocolVersion, "2025-11-25");
assert.equal(stdioInit.result.instructions, SERVER_INSTRUCTIONS);
assert.deepEqual(stdioList.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
console.log(`M1: ${JSON.stringify({ negotiated: stdioInit.result.protocolVersion, instructions_chars: SERVER_INSTRUCTIONS.length })}`);

// ---- 2. Token diet: compact JSON text + structuredContent, paged lists, lean picks.
const size = (x) => JSON.stringify(x).length;
const sizes = {};
for (const [tool, args] of [
  ["search_film_mcps", {}],
  ["list_film_capabilities", {}],
  ["recommend_film_mcps", { brief: "avatar UGC ad with voiceover" }],
  ["get_film_capability", { capability: "text-to-video" }],
]) sizes[`${tool}${Object.keys(args).length ? ":" + Object.values(args)[0] : ""}`] = size(await call(tool, args));
assert.ok(sizes.search_film_mcps < 20000, `no-arg search_film_mcps is ${sizes.search_film_mcps} chars`);
assert.ok(sizes.list_film_capabilities < 12000, `list_film_capabilities is ${sizes.list_film_capabilities} chars`);
assert.ok(sizes["recommend_film_mcps:avatar UGC ad with voiceover"] < 8000, "recommend_film_mcps");

const firstPage = await call("search_film_mcps", {});
assert.equal(firstPage.count, 20);
assert.equal(firstPage.total, registry.servers.length);
assert.equal(firstPage.offset, 0);
assert.equal(firstPage.next_offset, 20);
assert.equal(Object.hasOwn(firstPage.servers[0], "markdown_url"), false);
assert.ok(firstPage.servers[0].url.startsWith("https://mcp.film/mcps/"));
const secondPage = await call("search_film_mcps", { offset: firstPage.next_offset, limit: 5 });
assert.equal(secondPage.count, 5);
assert.equal(secondPage.servers[0].slug, (await call("search_film_mcps", { limit: 25 })).servers[20].slug);
const lastPage = await call("search_film_mcps", { offset: registry.servers.length - 3, limit: 100 });
assert.equal(lastPage.count, 3);
assert.equal(lastPage.next_offset, null);
assert.equal((await call("search_film_mcps", { limit: 0 })).count, 20, "non-positive limit falls back to the default");
assert.equal((await call("search_film_mcps", { limit: 9999 })).count, 100);

const caps = await call("list_film_capabilities", {});
assert.equal(caps.min_count, 2);
assert.ok(caps.capabilities.every((c) => c.count >= 2 && c.url && !("markdown" in c) && !("json" in c)));
assert.ok(caps.total > caps.count || caps.next_offset === null);
const capOne = await call("list_film_capabilities", { min_count: 1, limit: 1 });
assert.equal(capOne.count, 1);
assert.equal(capOne.next_offset, 1);
assert.ok(capOne.total > caps.total);
const t2v = await call("get_film_capability", { capability: "text-to-video", limit: 3 });
assert.equal(t2v.servers.length, 3);
assert.ok(t2v.total >= 3 && t2v.next_offset === 3);

const rpc = await mcpHandleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_film_mcps", arguments: { limit: 2 } } }, call);
assert.equal(rpc.result.content[0].text, JSON.stringify(rpc.result.structuredContent));
assert.ok(!rpc.result.content[0].text.includes("\n  "), "compact JSON, not pretty-printed");
assert.equal(rpc.result.structuredContent.count, 2);
assert.equal(rpc.result.isError, false);
const rpcErr = await mcpHandleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_film_mcp", arguments: { slug: "nope" } } }, call);
assert.equal(rpcErr.result.isError, true);
assert.ok(rpcErr.result.structuredContent.error);
const [stdioCall] = await stdio([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_client_profiles", arguments: {} } }]);
assert.deepEqual(JSON.parse(stdioCall.result.content[0].text), stdioCall.result.structuredContent);
assert.ok(stdioCall.result.structuredContent.clients.length >= 4);
console.log(`M2: ${JSON.stringify(sizes)}`);

// ---- 3. Search quality: word-boundary tokens, aliases, did_you_mean.
const slugs = async (args) => (await call("search_film_mcps", { limit: 100, ...args })).servers.map((s) => s.slug);
const lipSync = await slugs({ query: "lip sync" });
assert.ok(lipSync.length > 0);
assert.ok(lipSync.includes("sync-labs"));
assert.ok(!lipSync.includes("autoposting"), "'lip sync' must not match clip + async in a social scheduler");
assert.ok(lipSync.every((slug) => {
  const s = registry.servers.find((x) => x.slug === slug);
  return /\blip[\s-]?sync/i.test(`${s.tagline} ${s.description} ${(s.capabilities ?? []).join(" ")} ${(s.tools_sample ?? []).join(" ")}`);
}), "every lip sync hit says lip sync somewhere");
assert.deepEqual(await slugs({ query: "lipsync" }), lipSync);
assert.deepEqual(await slugs({ query: "lip-sync" }), lipSync);
assert.deepEqual(await slugs({ query: "LIP SYNC" }), lipSync);
assert.deepEqual(await slugs({ query: "text to speech" }), await slugs({ query: "tts" }));
assert.deepEqual(await slugs({ query: "subtitles" }), await slugs({ query: "captions" }));
assert.deepEqual(await slugs({ query: "4k" }), await slugs({ query: "upscale" }));
assert.ok((await slugs({ query: "upscale video" })).includes("topaz") || (await slugs({ query: "upscale" })).length > 0);
// All tokens must match, in any field and any order; an alias phrase is the stricter form of its loose word order.
const phrase = await slugs({ query: "voice cloning" });
const loose = await slugs({ query: "cloning voice" });
assert.ok(phrase.length > 0 && phrase.every((s) => loose.includes(s)));
assert.deepEqual(await slugs({ query: "video upscale" }), await slugs({ query: "upscale video" }));
assert.ok((await slugs({ query: "oauth elevenlabs" })).includes("elevenlabs"), "auth type and name are searchable");
assert.ok((await slugs({ query: "freemium elevenlabs" })).includes("elevenlabs"), "pricing is searchable");
assert.ok((await slugs({ query: "voice-speech" })).length > 0, "category id is searchable");
const tokensOut = await call("search_film_mcps", { query: "the lip sync for a video" });
assert.deepEqual(tokensOut.query_tokens, ["lipsync", "video"]);
// Zero results: did_you_mean and a hint; unknown category and capability are errors with valid values.
const typo = await call("search_film_mcps", { query: "lipsinc" });
assert.equal(typo.total, 0);
assert.deepEqual(typo.did_you_mean.capabilities, ["lip-sync"]);
assert.ok(typo.hint);
const badCat = await call("search_film_mcps", { category: "video_generation" });
assert.match(badCat.error, /Unknown category/);
assert.deepEqual(badCat.valid_categories, registry.categories.map((c) => c.id));
assert.equal(badCat.did_you_mean.categories[0], "video-generation");
const badCap = await call("search_film_mcps", { capability: "lipsinc" });
assert.match(badCap.error, /No capability tag/);
assert.deepEqual(badCap.did_you_mean.capabilities, ["lip-sync"]);
const viaAlias = await call("search_film_mcps", { capability: "lipsync", limit: 100 });
assert.deepEqual(viaAlias.capability, { requested: "lipsync", resolved: "lip-sync" });
assert.deepEqual(viaAlias.servers.map((s) => s.slug), (await call("search_film_mcps", { capability: "lip-sync", limit: 100 })).servers.map((s) => s.slug));
assert.equal((await call("search_film_mcps", { query: "xyzzy plugh" })).did_you_mean, undefined);
// get_film_capability resolves aliases and names the resolution.
const capAlias = await call("get_film_capability", { capability: "lipsync" });
assert.equal(capAlias.capability, "lip-sync");
assert.equal(capAlias.resolved_from, "lipsync");
assert.equal((await call("get_film_capability", { capability: "text to speech" })).capability, "tts");
assert.equal((await call("get_film_capability", { capability: "lip-sync" })).resolved_from, undefined);
assert.deepEqual((await call("get_film_capability", { capability: "lipsinc" })).did_you_mean.capabilities, ["lip-sync"]);
assert.deepEqual((await call("list_film_capabilities", { query: "lip sync" })).capabilities.map((c) => c.capability), ["lip-sync"]);
// A runtime alias map on the registry document extends the built-ins.
const aliased = makeCallTool({ ...loaders, loadRegistry: async () => ({ ...registry, capability_aliases: { "lip-sync": ["mouth matching"] } }) }, "test");
assert.deepEqual((await aliased("search_film_mcps", { query: "mouth matching", limit: 100 })).servers.map((s) => s.slug), lipSync);
console.log(`M3: ${JSON.stringify({ lip_sync: lipSync.length, typo: typo.did_you_mean, bad_category: badCat.did_you_mean.categories })}`);

// ---- 4. Dead/archived/deprecated listings (synthetic: the live data may not carry status yet).
const martini = registry.servers.find((s) => s.slug === "martini");
const synth = (slug, status, extra = {}) => ({ ...martini, slug, name: `Zzsynth ${slug}`, official: true, featured: false, ...(status ? { status } : {}), ...extra });
const withStatus = {
  ...registry,
  servers: [
    synth("synth-live", undefined),
    synth("synth-dead", "dead"),
    synth("synth-archived", "archived", { category: "video-generation" }),
    synth("synth-deprecated", "deprecated"),
    ...registry.servers,
  ],
};
const recs = json("dist/api/recommendations.json");
const retire = (slug) => ({ ...martini, slug, status: "dead" });
const statusCall = makeCallTool({
  ...loaders,
  loadRegistry: async () => withStatus,
  // Retire a real primary pick in one route and the whole primary list in another.
  loadRecommendations: async () => recs,
}, "test");
const active = await statusCall("search_film_mcps", { query: "zzsynth", limit: 100 });
assert.deepEqual(active.servers.map((s) => s.slug), ["synth-live"]);
assert.equal(active.servers[0].status, undefined);
const all = await statusCall("search_film_mcps", { query: "zzsynth", include_inactive: true, limit: 100 });
assert.deepEqual(all.servers.map((s) => [s.slug, s.status]), [["synth-live", undefined], ["synth-dead", "dead"], ["synth-archived", "archived"], ["synth-deprecated", "deprecated"]]);
assert.equal((await statusCall("get_film_mcp", { slug: "synth-dead" })).status, "dead", "get_film_mcp stays full and keeps status");
// plan_film_stack: a retired studio never becomes a pick, even when it would out-score the field.
const plan = await statusCall("plan_film_stack", {});
const shootPicks = plan.plan.find((p) => p.stage === "shoot").picks.map((p) => p.slug);
assert.ok(shootPicks.includes("synth-live"));
assert.ok(!shootPicks.some((s) => ["synth-dead", "synth-archived", "synth-deprecated"].includes(s)));
const planAll = await statusCall("plan_film_stack", { include_inactive: true });
assert.ok(planAll.plan.find((p) => p.stage === "shoot").picks.some((p) => p.status === "dead" || p.status === "deprecated"));
// recommend_film_mcps: a retired primary drops out of the pick list; the status rides on survivors.
const retiredMartini = makeCallTool({ ...loaders, loadRegistry: async () => ({ ...registry, servers: registry.servers.map((s) => (s.slug === "martini" ? { ...s, status: "archived" } : s)) }) }, "test");
const commercial = await retiredMartini("recommend_film_mcps", { brief: "polished commercial fast" });
assert.ok(commercial.recommendations.length > 0);
for (const r of commercial.recommendations) {
  assert.ok(!r.primary_servers.some((p) => p.slug === "martini"), "archived martini is not a pick");
  assert.ok(!r.fallback_servers.some((f) => f.slug === "martini"));
}
const commercialAll = await retiredMartini("recommend_film_mcps", { brief: "polished commercial fast", include_inactive: true });
const martiniPick = commercialAll.recommendations.flatMap((r) => r.primary_servers).find((p) => p.slug === "martini");
assert.equal(martiniPick?.status, "archived");
// A route whose every primary is retired disappears entirely.
const everyPrimaryDead = makeCallTool({ ...loaders, loadRegistry: async () => ({ ...registry, servers: registry.servers.map((s) => ({ ...s, status: "dead" })) }) }, "test");
assert.equal((await everyPrimaryDead("recommend_film_mcps", { brief: "polished commercial fast" })).no_match, true);
console.log(`M4: ${JSON.stringify({ active: active.servers.map((s) => s.slug), all: all.servers.map((s) => s.status ?? "active") })}`);

// ---- 5. caveat: caveats[0] first, else the first notes sentence that is not a verification log; never mid-word.
const { caveatFor } = await import("../packages/mcp-server/core.mjs");
const LOGLIKE = /\b(re-?checked|re-?verified|re-?confirmed|unchanged)\b|\b\d+\s*stars?\b/i;
assert.equal(caveatFor({ caveats: ["Needs a paid plan for exports."], notes: "Re-checked 1 Sep 2026: fine." }), "Needs a paid plan for exports.");
assert.equal(caveatFor({ notes: "Re-checked 1 Sep 2026: endpoint unchanged. 653 stars, MIT. Exports are watermarked on the free tier. Verified 2026-09-01." }), "Exports are watermarked on the free tier.");
assert.equal(caveatFor({ notes: "Checked 25 Sep 2026 and unchanged." }), "Checked 25 Sep 2026 and unchanged.", "all-log notes fall back to the first sentence");
assert.equal(caveatFor({ notes: "" }), "");
assert.equal(caveatFor({}), "");
const long = caveatFor({ notes: `${"word ".repeat(60)}end.` });
assert.ok(long.length <= 200 && long.endsWith("…") && !/wor…$/.test(long), long);
assert.ok(/\bword…$/.test(long), "cut lands on a word boundary");
assert.equal(caveatFor({ notes: "Suno has no official API — all wrappers are ToS gray areas. Re-verified 2 Oct 2026." }), "Suno has no official API — all wrappers are ToS gray areas.");
const martiniCaveat = (await call("search_film_mcps", { query: "martini" })).servers.find((s) => s.slug === "martini").caveat;
assert.ok(!LOGLIKE.test(martiniCaveat), martiniCaveat);
assert.ok(!martiniCaveat.endsWith("…") || /\S…$/.test(martiniCaveat));
console.log(`M5: ${JSON.stringify({ martini_caveat: martiniCaveat })}`);

console.log("✓ mcp server checks passed");
