import { DESCRIPTION_MAX, authLabel, catById, claudeCodeCmd, cmdLike, esc, isInactive, nice, serverDescription, statusBlurb, statusLabel } from "./_shared.mjs";
import { factsFor } from "./_health.mjs";

// Search and answer engines mostly reach a server page through a navigational query:
// "higgsfield.ai/mcp", "krea mcp", "davinci resolve mcp". The title, description and the
// questions below answer that query from the listing's own data (and the daily endpoint
// check) — nothing here is written by hand, so it can't drift from the entry.

// "Krea MCP Server" → "Krea MCP", "Kling MCP (Official)" → "Kling MCP": the form people type.
export const mcpName = (s) => {
  const base = s.name.replace(/\s*\((official|community|unofficial)\)\s*/i, " ").replace(/\s+server$/i, "").trim();
  return /\bMCP\b/i.test(base) ? base : `${base} MCP`;
};

export const serverTitle = (ctx, s) => {
  const cat = catById(ctx, s.category);
  if (isInactive(s)) return `${mcpName(s)} (${statusLabel(s).toLowerCase()}) — ${cat?.name ?? s.category} | mcp.film`;
  const what = s.install?.remote_url ? "server URL & setup" : "install & setup";
  return `${mcpName(s)} — ${what} | mcp.film`;
};

// Hosted listings lead with the endpoint, because that is what the query asks for. The rest
// is whole: the tagline if it fits, else a plain setup line — never a cut-off sentence.
export const hostedDescriptionLead = (s) =>
  `${mcpName(s)} server URL: ${s.install.remote_url} (${authLabel(s)}${s.official ? ", official" : ""}).`;

export const serverMetaDescription = (s) => {
  if (isInactive(s) || !s.install?.remote_url) return serverDescription(s);
  const lead = hostedDescriptionLead(s);
  for (const tail of [(s.tagline ?? "").trim(), "Setup for Claude Code, Claude Desktop and Cursor, plus caveats.", "Setup and caveats."]) {
    if (tail && lead.length + 1 + tail.length <= DESCRIPTION_MAX) return `${lead} ${tail}`;
  }
  return lead;
};

const code = (c) => `<code class="mono">${esc(c)}</code>`;

const keyAnswer = (s) => {
  const where = s.auth?.key_url && /^https:\/\//.test(s.auth.key_url) ? s.auth.key_url : null;
  switch (s.auth?.type) {
    case "oauth":
      return {
        html: `No key to paste: it uses OAuth. Your MCP client opens a sign-in page the first time it connects${where ? ` (<a href="${esc(where)}" rel="noopener">account or sign-in details</a>)` : ""}.`,
        text: `No key to paste: it uses OAuth. Your MCP client opens a sign-in page the first time it connects${where ? ` (${where})` : ""}.`,
      };
    case "api_key":
      return {
        html: `Yes.${s.auth.env_var ? ` Set ${code(s.auth.env_var)}.` : ""}${where ? ` Get a key at <a href="${esc(where)}" rel="noopener">${esc(where)}</a>.` : ""}`,
        text: `Yes.${s.auth.env_var ? ` Set ${s.auth.env_var}.` : ""}${where ? ` Get a key at ${where}.` : ""}`,
      };
    case "none":
      return { html: "No. It connects without credentials.", text: "No. It connects without credentials." };
    case "local-app":
      return {
        html: "No cloud key: it talks to the application running on your own machine, so that app has to be installed and open.",
        text: "No cloud key: it talks to the application running on your own machine, so that app has to be installed and open.",
      };
    default:
      return null;
  }
};

export const serverFaq = (ctx, s) => {
  const n = mcpName(s);
  const items = [];
  if (isInactive(s)) {
    items.push({ q: `Does ${n} still work?`, html: `${esc(statusLabel(s))}. ${esc(statusBlurb(s))}`, text: `${statusLabel(s)}. ${statusBlurb(s)}` });
    return items;
  }
  const url = s.install?.remote_url;
  const facts = factsFor(ctx, s);
  const probe = facts?.last_probe ?? null;

  if (url) {
    const headers = s.install?.remote_headers ?? [];
    const extra = headers.length ? ` Send ${headers.join(", ")} with each request.` : "";
    items.push({
      q: `What is the ${n} server URL?`,
      html: `${code(url)}, a hosted MCP endpoint over streamable HTTP. Auth: ${esc(authLabel(s))}.${esc(extra)}`,
      text: `${url}, a hosted MCP endpoint over streamable HTTP. Auth: ${authLabel(s)}.${extra}`,
    });
  } else if (s.install?.stdio_command) {
    const c = s.install.stdio_command;
    items.push({
      q: `How do I install ${n}?`,
      html: cmdLike(c, s.install) ? `It runs locally: ${code(c)}. Per-client setup is under <a href="#connect">Connect</a>.` : `${esc(c)} Per-client setup is under <a href="#connect">Connect</a>.`,
      text: cmdLike(c, s.install) ? `It runs locally: ${c}. Per-client setup is on the page under Connect.` : `${c} Per-client setup is on the page under Connect.`,
    });
  }

  const key = keyAnswer(s);
  if (key) items.push({ q: `Does ${n} need an API key?`, ...key });

  const cc = claudeCodeCmd(s);
  if (cc) {
    items.push({
      q: `How do I add ${n} to Claude Code?`,
      html: `Run ${code(cc)}${s.auth?.type === "oauth" ? ", then sign in when Claude Code asks (or run /mcp, pick the server and choose Authenticate)" : ""}.`,
      text: `Run ${cc}${s.auth?.type === "oauth" ? ", then sign in when Claude Code asks (or run /mcp, pick the server and choose Authenticate)" : ""}.`,
    });
  }

  if (url && probe?.result === "auth_required") {
    const meta = probe.oauth_metadata ? " and published OAuth metadata" : "";
    const fix = s.auth?.type === "oauth"
      ? "Complete the sign-in in your client; tools are listed only after it."
      : "Send your credentials with every request; tools are listed only after that.";
    items.push({
      q: `Why does ${n} return 401 or ask for authorization?`,
      html: `That is expected. On ${esc(nice(probe.date))} its endpoint answered mcp.film's anonymous check with a sign-in challenge${meta}. ${esc(fix)}`,
      text: `That is expected. On ${nice(probe.date)} its endpoint answered mcp.film's anonymous check with a sign-in challenge${meta}. ${fix}`,
    });
  } else if (url && probe?.result === "ok" && probe.tool_count) {
    items.push({
      q: `Can I see ${n}'s tools without signing in?`,
      html: `Yes. On ${esc(nice(probe.date))} it listed ${probe.tool_count} tools to an anonymous request.`,
      text: `Yes. On ${nice(probe.date)} it listed ${probe.tool_count} tools to an anonymous request.`,
    });
  }

  const who = s.official ? `Yes, ${s.vendor} maintains it.` : `No, it is a community server (${s.vendor}).`;
  const checked = `mcp.film last verified the listing on ${nice(s.verified)}.`;
  items.push({ q: `Is ${n} official?`, html: `${esc(who)} ${esc(checked)}`, text: `${who} ${checked}` });
  return items;
};

export const serverFaqHtml = (items) => items.length ? `
    <section class="server-faq" aria-labelledby="questions">
      <h2 id="questions">Common questions</h2>
      <dl>${items.map((i) => `
        <dt>${esc(i.q)}</dt>
        <dd>${i.html}</dd>`).join("")}
      </dl>
    </section>` : "";

export const serverFaqLd = (items) => items.length ? {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.text } })),
} : null;
