// Display helpers for machine-checked evidence (src/health.mjs, data/health.json).
// Quiet by design: one line per check, a dot for tone, no badges.
import { ANSWERED, FAILURE_AGENDA_THRESHOLD } from "../health.mjs";
import { esc, nice } from "./_shared.mjs";

export const factsFor = (ctx, s) => ctx.evidence?.get(s.slug) ?? null;
export const evidenceLabel = (ctx, id) => ctx.evidenceLevels?.find((l) => l.id === id)?.label ?? id;

const ordinal = (n) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${tail}`;
};
const tools = (n) => `${n} tool${n === 1 ? "" : "s"} listed anonymously`;

// One probe result as words: "answered · MCP 2025-06-18 · 12 tools listed anonymously".
export const probeSummary = (p) => {
  if (!p) return null;
  if (ANSWERED.has(p.result)) {
    const parts = ["answered"];
    if (p.protocol_version) parts.push(`MCP ${p.protocol_version}`);
    if (p.result === "ok") parts.push(tools(p.tool_count ?? 0));
    else if (p.result === "auth_required") parts.push(p.oauth_metadata ? "sign-in required (OAuth)" : "credentials required");
    else parts.push("no anonymous tool list");
    return { tone: "ok", text: parts.join(" · ") };
  }
  const n = p.consecutive_failures ?? 1;
  const parts = [`did not answer${n > 1 ? ` (${ordinal(n)} failed check in a row)` : ""}`];
  if (p.last_ok) parts.push(`last answered ${nice(p.last_ok)}`);
  return { tone: n >= FAILURE_AGENDA_THRESHOLD ? "fail" : "warn", text: parts.join(" · ") };
};

// "resolves · latest 1.2.3"; the caller names the registry and package.
export const registryLabel = (p) => (p.registry === "npm" ? "npm" : "PyPI");
export const packageSummary = (p) => {
  if (!p) return null;
  if (p.found === true) return { tone: "ok", text: `resolves${p.latest_version ? ` · latest ${p.latest_version}` : ""}` };
  if (p.found === false) return { tone: "fail", text: "not found" };
  return { tone: "warn", text: "lookup failed" };
};

const line = (summary, prefix = "") => summary
  ? `<p class="probe-line probe-${summary.tone}"><span aria-hidden="true"></span>${prefix}${esc(summary.text)}</p>`
  : "";

// Server page, inside the Verification box.
export const evidenceRowsHtml = (ctx, s) => {
  const f = factsFor(ctx, s);
  if (!f) return "";
  return `<div><dt>Evidence</dt><dd>${esc(evidenceLabel(ctx, f.evidence).toLowerCase())}</dd></div>`;
};
export const probeLinesHtml = (ctx, s) => {
  const f = factsFor(ctx, s);
  if (!f) return "";
  const probe = f.last_probe
    ? line(probeSummary(f.last_probe), `Endpoint check, <time datetime="${esc(f.last_probe.date)}">${nice(f.last_probe.date)}</time>: `)
    : "";
  const pkg = f.package_check
    ? line(packageSummary(f.package_check), `${registryLabel(f.package_check)} package <code class="mono">${esc(f.package_check.name)}</code>: `)
    : "";
  return probe + pkg;
};

// /remotes/ row: the result under the endpoint, without the date (the headline carries it).
export const remoteProbeHtml = (ctx, s) => {
  const summary = probeSummary(factsFor(ctx, s)?.last_probe);
  if (!summary) return "";
  return line({ ...summary, text: summary.text[0].toUpperCase() + summary.text.slice(1) });
};

// /remotes/ headline over the listed (active) remotes that were probed.
export const remoteHealthCounts = (ctx, remotes) => {
  if (!ctx.health) return null;
  const probed = remotes.map((s) => factsFor(ctx, s)?.last_probe).filter(Boolean);
  if (!probed.length) return null;
  return {
    date: ctx.health.checked_at.slice(0, 10),
    probed: probed.length,
    answered: probed.filter((p) => ANSWERED.has(p.result)).length,
    open: probed.filter((p) => p.result === "ok").length,
    signin: probed.filter((p) => p.result === "auth_required").length,
  };
};

export const remoteHeadlineHtml = (ctx, remotes) => {
  const c = remoteHealthCounts(ctx, remotes);
  if (!c) return "";
  return `<p class="probe-headline"><strong>${c.answered} of ${c.probed}</strong> hosted endpoints answered our anonymous MCP check on <time datetime="${c.date}">${nice(c.date)}</time>: ${c.open} listed their tools without credentials, ${c.signin} asked for sign-in. We never call tools. <a href="/for-agents/#evidence">How we check</a></p>`;
};

// Markdown twins.
export const probeLinesMd = (ctx, s) => {
  const f = factsFor(ctx, s);
  if (!f) return [];
  const out = [`- Evidence: ${f.evidence} (${ctx.site.url}/for-agents/#evidence)`];
  if (f.last_probe) out.push(`- Endpoint check, ${f.last_probe.date}: ${probeSummary(f.last_probe).text}`);
  if (f.package_check) out.push(`- ${registryLabel(f.package_check)} package \`${f.package_check.name}\`, ${f.package_check.date}: ${packageSummary(f.package_check).text}`);
  return out;
};

export const remoteHeadlineMd = (ctx, remotes) => {
  const c = remoteHealthCounts(ctx, remotes);
  if (!c) return [];
  return [`${c.answered} of ${c.probed} hosted endpoints answered our anonymous MCP check on ${c.date}: ${c.open} listed their tools without credentials, ${c.signin} asked for sign-in. Tools are never called. Method: ${ctx.site.url}/for-agents/#evidence`, ""];
};

// For-agents documentation: what the evidence levels mean and how the check runs.
const METHOD = [
  "Once a day a script (no LLM, no credentials) sends an anonymous MCP initialize to every hosted endpoint. If the handshake succeeds it sends tools/list and records how many tools are listed without signing in. It never calls a tool.",
  "Results: ok (handshake and tool list), auth_required (HTTP 401/403: alive, needs credentials; oauth_metadata says whether OAuth protected-resource metadata is discoverable), handshake_only (initialize answered, tool list did not), error (bad status or no MCP answer), unreachable (DNS, TLS or timeout).",
  "For listings installed with npx or uvx, the same job checks that the npm or PyPI package exists and records its latest version. Generic bridges such as mcp-remote do not count.",
  `A failed check never changes a listing's status. Three failures in a row put the listing on the curator agenda in /api/pulse.json; a curator re-verifies it and decides.`,
];

export const evidenceDocHtml = (ctx) => `
  <h2 id="evidence">Evidence levels and endpoint checks</h2>
  <p>Every listing carries <code class="mono">evidence</code>: the strongest machine check that passed recently. The curator's <code class="mono">verified</code> date is a person or agent reading the docs; these are the checks a script repeats daily.</p>
  <ul class="agents-list">
    ${(ctx.evidenceLevels ?? []).map((l) => `<li><strong>${esc(l.id)}</strong>: ${esc(l.definition)}</li>`).join("\n    ")}
  </ul>
  <ul class="agents-list">
    ${METHOD.map((m) => `<li>${esc(m)}</li>`).join("\n    ")}
  </ul>
  <p>Per server: <code class="mono">evidence</code>, <code class="mono">last_probe</code> and <code class="mono">package_check</code> in <a href="/api/registry.json">/api/registry.json</a>, <code class="mono">/api/mcps/{slug}.json</code> and <code class="mono">get_film_mcp</code>; <code class="mono">search_film_mcps</code> takes <code class="mono">answering_only: true</code>. Raw results: <a href="https://github.com/${esc(ctx.site.github_repo)}/blob/main/data/health.json" rel="noopener">data/health.json</a>.</p>`;

export const evidenceDocMd = (ctx) => [
  "## Evidence levels and endpoint checks",
  "",
  "Every listing carries `evidence`: the strongest machine check that passed recently.",
  "",
  ...(ctx.evidenceLevels ?? []).map((l) => `- \`${l.id}\`: ${l.definition}`),
  "",
  ...METHOD.map((m) => `- ${m}`),
  "",
  "Per server: `evidence`, `last_probe` and `package_check` in /api/registry.json, /api/mcps/{slug}.json and get_film_mcp; search_film_mcps takes `answering_only: true`.",
  `Raw results: https://github.com/${ctx.site.github_repo}/blob/main/data/health.json`,
].join("\n");
