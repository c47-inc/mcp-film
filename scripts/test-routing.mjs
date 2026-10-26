#!/usr/bin/env node
// Routing benchmark for recommend_film_mcps: a dozen briefs with the route an
// operator would expect on top, and the hard constraints that must hold on
// every pick. Run after `node build.mjs`.
//
// Routes referenced here exist on main, including the narrow-intent routes
// (transcribe-and-caption, finish-and-upscale, dub-and-localize) from #128.
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeCallTool, detectConstraints } from "../packages/mcp-server/core.mjs";

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const registry = read("dist/api/registry.json");
const bySlug = new Map(registry.servers.map((s) => [s.slug, s]));
const call = makeCallTool({
  loadRegistry: async () => registry,
  loadRecommendations: async () => read("dist/api/recommendations.json"),
  loadPlaybooks: async () => read("dist/api/playbooks.json"),
}, "test");

const isLocal = (s) => Boolean(s.install?.stdio_command) || s.auth?.type === "local-app";
const isPrivate = (s) => isLocal(s) && ["none", "local-app"].includes(s.auth?.type);
const isHosted = (s) => Boolean(s.install?.remote_url);
const isFree = (s) => ["free", "freemium"].includes(s.pricing);

const cases = [
  { brief: "make a polished 30 second product commercial fast", top: "fast-commercial" },
  { brief: "compare veo, kling and seedance looks before spending the budget", top: "model-shootout" },
  { brief: "build a character-consistent episodic series with recurring characters", top: "character-series", martini_handoff: true },
  { brief: "edit confidential client footage locally without uploading anything", top: "local-edit-bay", constraints: ["local_only", "no_upload"], every: isPrivate, no_martini: true },
  { brief: "turn an archive of interview dailies into a trailer", top: "archive-to-trailer" },
  { brief: "avatar talking-head ugc ad with lip sync", top: "avatar-ugc", no_martini: true },
  { brief: "narration voice, tts and a temp music score", top: "music-and-voice", no_martini: true },
  { brief: "I am a web agent with no local install: hosted only stack", top: "hosted-only-stack", constraints: ["hosted_only"], every: isHosted },
  { brief: "open-source comfyui and blender lab on my own machine", top: "open-lab", constraints: ["local_only"], every: isLocal, no_martini: true },
  { brief: "zero budget: free tools for voice and music", top: "music-and-voice", constraints: ["free_only"], every: isFree },
  { brief: "clean up dialogue and mix the soundtrack", top: "music-and-voice", no_martini: true },
  // Narrow jobs land on the dedicated routes added by the data PR (#128).
  { brief: "transcribe these interviews and burn in captions", top: "transcribe-and-caption", no_martini: true },
  { brief: "upscale the master to 4k and fix the loudness", top: "finish-and-upscale", no_martini: true },
  { brief: "dub this short into spanish and german with matching lip sync", top: "dub-and-localize", no_martini: true },
  // Constraints passed explicitly, not inferred: a sandboxed agent asking for a commercial.
  { brief: "product commercial with a voiceover", args: { constraints: { has_shell: false } }, top: "fast-commercial", constraints: ["hosted_only"], every: isHosted },
  // No route at all.
  { brief: "repair a bicycle", no_match: true, unsatisfied: false },
  // Unsupported requirements. Crew booking shares no route vocabulary: no_match. Live streaming
  // shares a word or two, so the honest answer is a weak-confidence browse, flagged as such.
  { brief: "book a film crew and catering for a shoot day", no_match: true, unsatisfied: false },
  { brief: "stream the premiere live to twitch", weak: true },
  // Relevant routes exist but every pick breaks the constraint: say so instead of shortlisting.
  { brief: "edit local footage on a timeline", args: { constraints: { hosted_only: true, no_upload: true } }, no_match: true, unsatisfied: true },
];

const rows = [];
for (const c of cases) {
  const result = await call("recommend_film_mcps", { brief: c.brief, ...(c.args ?? {}) });
  const label = JSON.stringify(c.brief);
  if (c.no_match) {
    assert.equal(result.no_match, true, `${label}: expected no_match`);
    assert.deepEqual(result.recommendations, []);
    if (c.unsatisfied) {
      assert.ok(result.unsatisfied_constraints?.length, `${label}: expected unsatisfied_constraints`);
      assert.ok(result.relevant_routes.length, `${label}: relevant routes named`);
      for (const u of result.unsatisfied_constraints) assert.ok(u.reason && u.excluded.length, `${label}: ${u.constraint} explained`);
    } else {
      assert.equal(result.unsatisfied_constraints, undefined, `${label}: no constraint blame when nothing was relevant`);
    }
    rows.push({ brief: c.brief, no_match: true, unsatisfied: (result.unsatisfied_constraints ?? []).map((u) => u.constraint) });
    continue;
  }
  assert.ok(result.recommendations.length, `${label}: expected routes`);
  const top = result.recommendations[0];
  if (c.weak) {
    assert.equal(result.confidence, "weak", `${label}: weak confidence`);
    assert.match(result.note, /browse/);
    rows.push({ brief: c.brief, top: top.id, confidence: result.confidence });
    continue;
  }
  assert.notEqual(result.confidence, "weak", `${label}: confidence ${result.confidence} (score ${top.match.score})`);
  if (c.narrow) {
    assert.ok(result.recommendations.some((r) => r.id === c.top), `${label}: ${c.top} should be among the routes (narrow job; a dedicated route may replace it)`);
  } else {
    assert.equal(top.id, c.top, `${label}: top route`);
  }
  for (const key of c.constraints ?? []) assert.equal(result.constraints?.[key], true, `${label}: constraint ${key} detected`);
  if (c.every) {
    for (const r of result.recommendations) {
      for (const p of [...r.primary_servers, ...r.fallback_servers]) {
        assert.ok(c.every(bySlug.get(p.slug)), `${label}: ${r.id} pick ${p.slug} violates ${(c.constraints ?? []).join("+")}`);
      }
    }
  }
  if (c.no_martini) {
    assert.ok(!top.primary_servers.some((p) => p.slug === "martini"), `${label}: top route ${top.id} must not pick martini`);
    assert.equal(Object.hasOwn(top, "martini_handoff"), false, `${label}: no sponsor handoff on the top route`);
    if (c.every) for (const r of result.recommendations) assert.ok(!r.primary_servers.some((p) => p.slug === "martini"), `${label}: ${r.id} cannot pick martini under the constraint`);
  }
  if (c.martini_handoff) assert.ok(top.martini_handoff, `${label}: handoff expected`);
  rows.push({ brief: c.brief, top: top.id, routes: result.recommendations.map((r) => r.id), constraints: result.constraints ?? {}, martini_handoff: Boolean(top.martini_handoff) });
}

// Phrase detection on its own.
assert.deepEqual(detectConstraints("cut this locally without uploading, no budget"), { local_only: true, no_upload: true, free_only: true });
assert.deepEqual(detectConstraints("a web agent that cannot install anything"), { hosted_only: true });
assert.deepEqual(detectConstraints("a free-spirited road movie"), {});
assert.deepEqual(detectConstraints("offline edit bay"), { local_only: true });
// Explicit constraints override detection; has_shell=false implies hosted_only.
const explicit = await call("recommend_film_mcps", { brief: "edit confidential footage locally", constraints: { no_upload: false, local_only: false } });
assert.deepEqual(explicit.constraints, undefined);
assert.equal((await call("recommend_film_mcps", { brief: "commercial", constraints: { has_shell: false } })).hosted_only, true);
assert.equal((await call("recommend_film_mcps", { brief: "commercial", hosted_only: true })).constraints.hosted_only, true);

for (const row of rows) console.log(`R: ${JSON.stringify(row)}`);
console.log(`✓ routing benchmark passed (${cases.length} briefs)`);
