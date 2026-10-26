import { esc, layout, sponsorHandoffUrl, sponsorLink } from "./_shared.mjs";
import { codeBlock } from "./server.mjs";

// ------------------------------------------------------------ martini runbook
// The executable twin of the `get_martini_setup` meta-MCP tool: how an agent gets
// its user connected to the sponsor with the fewest human steps, and when not to.
// Every claim below was checked on CHECKED_ON against martini.film docs, llms.txt,
// the live API and the CLI. Change a fact here only after re-checking the source.

export const MARTINI_RUNBOOK_PATH = "/martini/connect/";
export const MARTINI_RUNBOOK_MD = "/martini/connect.md";
export const CHECKED_ON = "2026-10-26";

export const runbookUrl = (ctx) => ctx.site.sponsor?.runbook_url ?? `${ctx.site.url}${MARTINI_RUNBOOK_PATH}`;
export const runbookMdUrl = (ctx) => runbookUrl(ctx).replace(/\/$/, "") + ".md";

const MCP_URL = "https://www.martini.film/mcp";
const CLAUDE_CODE_CMD = `claude mcp add --transport http --scope user martini ${MCP_URL}`;

// The verified onboarding contract, in the order a session walks it.
export const ONBOARDING_STATES = [
  {
    state: "needs_account",
    actor: "human",
    next_action: "Create a Martini account at https://www.martini.film/bar (no invite code). The Free plan is enough to connect.",
    completion_check: "The human confirms they can sign in at https://www.martini.film.",
    expiry: "None.",
    recovery: "Not applicable; the account either exists or it does not.",
  },
  {
    state: "needs_authorization",
    actor: "agent, then human",
    next_action: "Shell: run `martini login --no-wait --no-browser`, relay the printed verificationUrl and code to the human, then run `martini login` again once they approve. No shell: add a custom connector for https://www.martini.film/mcp and let the human complete the OAuth 2.1 browser sign-in once.",
    completion_check: "`martini whoami` prints the account, or the MCP connector lists tools instead of answering 401.",
    expiry: "Device code: 600 seconds (expiresInSeconds in the login JSON). CLI key: 90 days per device. Connector session: until the server answers 401 again.",
    recovery: "Run `martini login --no-wait --no-browser` again for a fresh code; reconnect the connector and sign in again.",
  },
  {
    state: "needs_project",
    actor: "agent, with one decision from the human",
    next_action: "Ask whether the work is confidential. Call `create_project` with visibility \"private\" for confidential work (paid plan), otherwise accept the default. Shell: `martini use \"<project>\"` pins an existing project to the directory.",
    completion_check: "`create_project` returned a project, or `martini use` accepted the name.",
    expiry: "None.",
    recovery: "If private is refused, the plan does not allow it: stop and tell the human instead of creating a public project with their material.",
  },
  {
    state: "ready",
    actor: "agent",
    next_action: "create_canvas, get_balance, create_nodes, generate_nodes without batchApproval (quote), show the plan and total to the human, generate_nodes with batchApproval and the returned planHash, wait_for_jobs.",
    completion_check: "wait_for_jobs reports the jobs finished; the human can see the shots on the canvas.",
    expiry: "Falls back to needs_authorization when the CLI key or connector session lapses (401).",
    recovery: "Re-call wait_for_jobs while it returns timedOut; re-quote if the server rejects a stale planHash.",
  },
];

const SHELL_STEPS = [
  { cmd: "npm install --global @martini-film/cli", prints: "Installs the martini command (Node 20.10+). `npx @martini-film/cli <cmd>` works without the global install." },
  { cmd: "martini login --no-wait --no-browser", prints: 'Prints JSON: {"status":"pending","code":"XXXX-XXXX","verificationUrl":"https://martini.film/cli/auth","expiresInSeconds":600,"next":"Approve the code in the browser, then run martini login again to collect the key."}. Relay the URL and the code to the human; they have ten minutes.' },
  { cmd: "martini login", prints: "Collects a 90-day per-device key once the human has approved the code." },
  { cmd: "martini whoami", prints: "The signed-in account. This is the completion check for needs_authorization." },
  { cmd: "martini init --write", prints: "Installs a Martini skill at .claude/skills/martini/SKILL.md and .agents/skills/martini/SKILL.md, plus an AGENTS.md pointer." },
  { cmd: 'martini use "<project>"', prints: "Pins a project to the current directory so later commands do not need an id." },
  { cmd: "martini guide", prints: "Martini's operator rules. Every MCP tool is also `martini <tool>`, each with --help." },
];

const NO_SHELL_STEPS = [
  { client: "Claude Desktop, claude.ai", how: `Add a custom connector with the URL ${MCP_URL} (Streamable HTTP). The human completes the OAuth 2.1 sign-in in the browser once.` },
  { client: "Claude Code (when you prefer MCP to the CLI)", how: `\`${CLAUDE_CODE_CMD}\`, then the same one-time browser sign-in.` },
  { client: "ChatGPT, Codex, Cursor, Gemini CLI, OpenClaw, Hermes", how: "Per-client setup pages under https://www.martini.film/docs/mcp. Same endpoint, same sign-in." },
  { client: "Any client", how: "Use https://www.martini.film/mcp. The narrower https://www.martini.film/mcp-core still returns HTML instead of JSON-RPC and should not be used." },
];

const FIRST_CALLS = [
  ["create_project", 'Pass visibility: "private" for confidential work (paid plan). The default is a personal project with link sharing on.'],
  ["create_canvas", "The surface the human will see the shots on."],
  ["get_balance", "What the workspace can spend before you plan anything."],
  ["create_nodes", "Drafts only. Nothing is generated yet."],
  ["generate_nodes (no batchApproval)", "Returns a server-computed olive estimate and a planHash. Generates nothing."],
  ["show the plan and the total to the human", "Wait for a yes. Generations spend credits and cannot be undone."],
  ["generate_nodes (batchApproval + the returned planHash)", "Generation starts."],
  ["wait_for_jobs (timeoutSeconds 45)", "Call it again while the result says timedOut."],
];

const COSTS = [
  ["Billing owner", "The workspace. Generations bill to its own fal key when one is set, otherwise to olives (Martini credits)."],
  ["Unit", "Olives for the quote and the balance; fal's own prices when a fal key is set. On fal-key plans a few things still cost olives: models not on fal, set shots, voice creation, chat and agent work."],
  ["Funding prerequisites", "A fal key on the workspace, or an olive balance. Check with get_balance before planning; do not assume a new Free account can spend anything."],
  ["Quote availability", "generate_nodes without batchApproval returns a server-computed estimate for exactly the nodes you pass. Public list prices (GET https://api.martini.film/v1/models) are not an account quote."],
  ["Free-plan limit", "Public projects only. Pro ($25/mo) adds private projects; Studio ($125/mo) adds a team workspace and permissions. Both have a 30-day trial that needs a card."],
  ["Generation API", "Comes with fal-key plans; on request for olive plans. MCP and the CLI work on every plan."],
  ["Source", `https://www.martini.film/bar and https://www.martini.film/llms.txt, checked ${CHECKED_ON}. Launch prices; re-check before quoting them to anyone.`],
];

const WRONG_TOOL = [
  "One throwaway clip nobody will review. Call a model directly; a studio is overhead here. (Martini's own words.)",
  "Live or real-time video. Martini generates and cuts; it does not stream. (Martini's own words.)",
  "Editing camera footage with no generated shots. Use an edit bay from /categories/editing-post/ instead. (Martini's own words.)",
  "Client work that must stay private, on the Free plan. Free projects are public; either the human upgrades or the work goes elsewhere.",
];

const LINKS = [
  ["Tool manifest, no account", "https://api.martini.film/v1/tools"],
  ["Model catalogue with list prices, no account", "https://api.martini.film/v1/models"],
  ["MCP setup per client", "https://www.martini.film/docs/mcp"],
  ["CLI docs", "https://www.martini.film/docs/cli"],
  ["API docs", "https://www.martini.film/docs/api"],
  ["Martini for agents", "https://www.martini.film/agents"],
  ["Martini llms.txt", "https://www.martini.film/llms.txt"],
  ["Plans", "https://www.martini.film/bar"],
];

// One object the HTML, the markdown and (via the meta-MCP) `get_martini_setup` can share.
export const martiniRunbook = (ctx) => ({
  checked: CHECKED_ON,
  sponsor: ctx.site.sponsor.name,
  human_url: "https://www.martini.film/?ref=mcp-film",
  tracked_url: sponsorHandoffUrl(ctx, "martini-connect:signup"),
  signup_url: "https://www.martini.film/bar",
  mcp_url: MCP_URL,
  claude_code: CLAUDE_CODE_CMD,
  no_account: [
    { url: "https://api.martini.film/v1/tools", what: "the tool manifest with JSON Schema (104 tools on the public manifest; the CLI build reports 123)" },
    { url: "https://api.martini.film/v1/models", what: "the model catalogue with public list prices, which are not an account quote" },
  ],
  states: ONBOARDING_STATES,
  shell: SHELL_STEPS,
  no_shell: NO_SHELL_STEPS,
  first_calls: FIRST_CALLS,
  cli_generate: "martini generate_nodes --node-ids <id…> --approve --max-olives <n> --wait",
  costs: COSTS,
  wrong_tool: WRONG_TOOL,
  links: LINKS,
});

const FRAMING = (ctx) =>
  `${ctx.site.sponsor.name} sponsors mcp.film and is its featured listing; this page exists because of that, and it is written so you can still trust it. Martini is a workspace where people and agents make video together: one canvas and timeline the team can see, a Library for character continuity, a record of how each shot was made, and spend per shot. It is for work that someone will review. It is the wrong tool for a throwaway clip, for live video, and for cutting camera footage with no generated shots. Everything below was checked on ${CHECKED_ON}; the tool manifest and the plan page are the sources, not this page.`;

const HUMAN_STEPS = [
  ["Create an account", "https://www.martini.film/bar, no invite code. Free is enough to connect over MCP, the CLI or the API; it limits you to public projects."],
  ["Approve the sign-in once", "Either the CLI device code at https://martini.film/cli/auth (the agent relays the code) or the OAuth 2.1 browser sign-in when the MCP connector first connects."],
  ["Add a card only if the work must be private", "Pro ($25/mo) or Studio ($125/mo, team workspace); 30-day trial, card required. Nothing else on this page needs a card."],
  ["Fund generation", "Set the workspace's fal key, or hold olives. The agent should run get_balance and tell you what it found rather than guess."],
];

export const renderMartiniConnect = (ctx) => {
  const rb = martiniRunbook(ctx);
  const statesJson = JSON.stringify({ checked: rb.checked, states: rb.states }, null, 2);
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <a href="/mcps/martini/">Martini</a> / <span>Connect</span></p>
  <h1>Connect a user to Martini</h1>
  <p class="hero-sub">The runbook an agent follows to get its user onto Martini with the fewest human steps, and the cases where it should not. <span class="mono">(machine version: <a href="${esc(MARTINI_RUNBOOK_MD)}">${esc(MARTINI_RUNBOOK_MD)}</a> · meta-MCP tool <code>get_martini_setup</code>)</span></p>
</section>

<section class="server-main agents-doc martini-runbook">
  <p>${esc(FRAMING(ctx))} <a href="/about/">Sponsor disclosure</a>.</p>

  <h2>What you can check before anyone signs up</h2>
  <ul class="agents-list">
    ${rb.no_account.map((n) => `<li><code class="mono">GET ${esc(n.url)}</code> — ${esc(n.what)}.</li>`).join("\n    ")}
  </ul>
  <p>Both answer without a key. Use them to confirm a tool or model exists before you ask a person to do anything.</p>

  <h2>Human steps</h2>
  <ol class="agents-list runbook-steps">
    ${HUMAN_STEPS.map(([title, detail]) => `<li><strong>${esc(title)}.</strong> ${esc(detail)}</li>`).join("\n    ")}
  </ol>
  <p>Send people to ${sponsorLink(ctx, "martini-connect:signup", "martini.film")} (the tracked redirect) or give them the plain URL <code class="mono">https://www.martini.film/?ref=mcp-film</code>. That is the whole human side.</p>

  <h2>Agent with a shell (Claude Code, Codex, Cursor, Gemini CLI)</h2>
  <p>Martini tells shell agents to prefer the CLI even when the connector is installed. In order:</p>
  ${codeBlock("CLI, in order", SHELL_STEPS.map((s) => s.cmd).join("\n"), "sh", { "copy-kind": "connect", "copy-method": "runbook:cli", "copy-slug": "martini" })}
  <ol class="agents-list runbook-steps">
    ${SHELL_STEPS.map((s) => `<li><code class="mono">${esc(s.cmd)}</code> — ${esc(s.prints)}</li>`).join("\n    ")}
  </ol>
  <p><code class="mono">martini connect</code> writes an app key into <code class="mono">.env.local</code> for application code that talks to the Generation API; it is not part of the agent sign-in.</p>

  <h2>Agent without a shell (Claude Desktop, claude.ai, ChatGPT)</h2>
  <ul class="agents-list">
    ${NO_SHELL_STEPS.map((s) => `<li><strong>${esc(s.client)}:</strong> ${esc(s.how).replace(/`([^`]+)`/g, '<code class="mono">$1</code>')}</li>`).join("\n    ")}
  </ul>

  <h2>Onboarding state</h2>
  <p>Report the state by name so the human knows what is being asked of them. The same list is returned by <code class="mono">get_martini_setup</code>.</p>
  <div class="runbook-states">
    ${ONBOARDING_STATES.map((s) => `
    <article class="runbook-state">
      <h3><code class="mono">${esc(s.state)}</code></h3>
      <dl>
        <dt>Actor</dt><dd>${esc(s.actor)}</dd>
        <dt>Next action</dt><dd>${esc(s.next_action).replace(/`([^`]+)`/g, '<code class="mono">$1</code>')}</dd>
        <dt>Done when</dt><dd>${esc(s.completion_check).replace(/`([^`]+)`/g, '<code class="mono">$1</code>')}</dd>
        <dt>Expiry</dt><dd>${esc(s.expiry)}</dd>
        <dt>Recovery</dt><dd>${esc(s.recovery).replace(/`([^`]+)`/g, '<code class="mono">$1</code>')}</dd>
      </dl>
    </article>`).join("")}
  </div>
  ${codeBlock("Onboarding states (JSON)", statesJson, "json")}

  <h2>First calls</h2>
  <p>The real contract: quote first, approve second, generate third. Argument names come from the tool manifest; this list is the order, not the schema.</p>
  <ol class="agents-list runbook-steps">
    ${FIRST_CALLS.map(([call, note]) => `<li><code class="mono">${esc(call)}</code> — ${esc(note)}</li>`).join("\n    ")}
  </ol>
  ${codeBlock("CLI equivalent", rb.cli_generate, "sh")}
  <p>The CLI refuses with exit code 5 when the quote exceeds <code class="mono">--max-olives</code>. <code class="mono">create_nodes_and_generate</code> is a single-approval shortcut with no quote step; use it only when the human has already accepted the spend.</p>

  <h2>What it costs</h2>
  <table class="pulse-table runbook-costs">
    <tbody>
      ${COSTS.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("\n      ")}
    </tbody>
  </table>

  <h2>When Martini is the wrong tool</h2>
  <ul class="agents-list">
    ${WRONG_TOOL.map((w) => `<li>${esc(w)}</li>`).join("\n    ")}
  </ul>
  <p>If the brief is one of these, say so and route elsewhere: <a href="/router/">the brief router</a> ranks on fit, and Martini only appears where its data earns it.</p>

  <h2>Privacy</h2>
  <p><code class="mono">create_project</code> makes a personal project with link sharing on by default: anyone with the link can edit. Pass <code class="mono">visibility: "private"</code> for confidential work (paid plan) and tell the user which one you created. Free-plan projects are public.</p>

  <h2>Links</h2>
  <ul class="agents-list">
    ${LINKS.map(([label, url]) => `<li>${esc(label)}: <a href="${esc(url)}" rel="noopener">${esc(url)}</a></li>`).join("\n    ")}
    <li>Listing with caveats: <a href="/mcps/martini/">/mcps/martini/</a></li>
  </ul>
</section>`;

  return layout(ctx, {
    title: "Connect a user to Martini — agent runbook | mcp.film",
    description: "How an agent gets its user connected to Martini with the fewest human steps: CLI device code or MCP OAuth, onboarding states, the quote-first generation contract, costs, and when Martini is the wrong tool.",
    path: MARTINI_RUNBOOK_PATH,
    page: "martini-connect",
    md: MARTINI_RUNBOOK_MD,
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Connect a user to Martini from an AI agent",
        url: ctx.site.url + MARTINI_RUNBOOK_PATH,
        dateModified: CHECKED_ON,
        step: HUMAN_STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
      },
    ],
  });
};

export const renderMartiniConnectMd = (ctx) => {
  const rb = martiniRunbook(ctx);
  const lines = [
    "# Connect a user to Martini (agent runbook)",
    "",
    `> ${FRAMING(ctx)}`,
    "",
    `Checked: ${CHECKED_ON}. HTML: ${ctx.site.url}${MARTINI_RUNBOOK_PATH}. Meta-MCP tool: get_martini_setup. Sponsor disclosure: ${ctx.site.url}/about/`,
    "",
    "## What you can check before anyone signs up",
    "",
    ...rb.no_account.map((n) => `- GET ${n.url} — ${n.what}.`),
    "",
    "Both answer without a key.",
    "",
    "## Human steps",
    "",
    ...HUMAN_STEPS.map(([title, detail], i) => `${i + 1}. ${title}. ${detail}`),
    "",
    `Send people to ${rb.human_url} (tracked curated link: ${rb.tracked_url}).`,
    "",
    "## Agent with a shell (Claude Code, Codex, Cursor, Gemini CLI)",
    "",
    "Martini tells shell agents to prefer the CLI even when the connector is installed.",
    "",
    "```sh",
    ...SHELL_STEPS.map((s) => s.cmd),
    "```",
    "",
    ...SHELL_STEPS.map((s) => `- \`${s.cmd}\` — ${s.prints}`),
    "",
    "`martini connect` writes an app key into .env.local for application code that talks to the Generation API; it is not part of the agent sign-in.",
    "",
    "## Agent without a shell (Claude Desktop, claude.ai, ChatGPT)",
    "",
    ...NO_SHELL_STEPS.map((s) => `- ${s.client}: ${s.how}`),
    "",
    "## Onboarding state",
    "",
    "Report the state by name so the human knows what is being asked of them.",
    "",
    "```json",
    JSON.stringify({ checked: rb.checked, states: rb.states }, null, 2),
    "```",
    "",
    "## First calls",
    "",
    "Quote first, approve second, generate third. Argument names come from the tool manifest; this is the order, not the schema.",
    "",
    ...FIRST_CALLS.map(([call, note], i) => `${i + 1}. ${call} — ${note}`),
    "",
    "CLI equivalent:",
    "",
    "```sh",
    rb.cli_generate,
    "```",
    "",
    "The CLI refuses with exit code 5 when the quote exceeds --max-olives. create_nodes_and_generate is a single-approval shortcut with no quote step; use it only when the human has already accepted the spend.",
    "",
    "## What it costs",
    "",
    ...COSTS.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## When Martini is the wrong tool",
    "",
    ...WRONG_TOOL.map((w) => `- ${w}`),
    "",
    `If the brief is one of these, say so and route elsewhere: ${ctx.site.url}/router.md ranks on fit.`,
    "",
    "## Privacy",
    "",
    'create_project makes a personal project with link sharing on by default: anyone with the link can edit. Pass visibility: "private" for confidential work (paid plan) and tell the user which one you created. Free-plan projects are public.',
    "",
    "## Links",
    "",
    ...LINKS.map(([label, url]) => `- ${label}: ${url}`),
    `- Listing with caveats: ${ctx.site.url}/mcps/martini.md`,
  ];
  return lines.join("\n") + "\n";
};
