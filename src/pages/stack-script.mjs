import { STACK_CLIENTS, stackInstallScript } from "../../packages/mcp-server/core.mjs";
import { AUTH_LABEL, claudeCodeCmd, cursorConfig, desktopConfig, esc, keyUrlHtml, keyUrlMd } from "./_shared.mjs";
import { codeBlock } from "./server.mjs";

// ------------------------------------------------ whole-stack install scripts
// The assembly lives in packages/mcp-server/core.mjs so the meta-MCP's
// get_film_playbook(client) and this page emit the same block. The per-server
// snippets come from the site's own generators — the exact strings each listing
// shows — adapted to the { command } / { config } shape core expects.
export const siteConfigFor = (s, client) => {
  if (client === "claude_code") {
    const command = claudeCodeCmd(s);
    return command ? { command } : {};
  }
  const json = client === "cursor" ? cursorConfig(s) : desktopConfig(s);
  return json ? { config: JSON.parse(json) } : {};
};

// Primary stack, then workflow servers, in playbook order. Fallbacks are alternatives,
// not part of the stack, so they are never installed.
export const stackSlugs = (p) => [...new Set([
  ...(p.primary_slugs ?? []),
  ...(p.steps ?? []).flatMap((step) => step.slugs ?? []),
])];

export const playbookStackScripts = (ctx, p) => {
  const servers = stackSlugs(p).map((slug) => ctx.servers.find((s) => s.slug === slug)).filter(Boolean);
  const url = `${ctx.site.url}/playbooks/${p.id}/`;
  return Object.fromEntries(STACK_CLIENTS.map((client) => [
    client,
    stackInstallScript(servers, client, { title: p.title, url, configFor: siteConfigFor }),
  ]));
};

const CLIENT_LABEL = {
  claude_code: "Claude Code",
  claude_desktop: "Claude Desktop (claude_desktop_config.json)",
  cursor: "Cursor (.cursor/mcp.json)",
};

// One checklist across clients: a server's key or sign-in does not change with the client.
const mergedChecklist = (scripts) => {
  const seen = new Map();
  for (const client of STACK_CLIENTS) for (const item of scripts[client].checklist) if (!seen.has(item.slug)) seen.set(item.slug, item);
  return [...seen.values()];
};

const authText = (item) => item.auth === "oauth"
  ? "OAuth — browser sign-in when the client first connects"
  : item.auth === "local-app" ? "local app — must be running" : (AUTH_LABEL[item.auth] ?? item.auth);

const skippedHtml = (list) => list.length
  ? `<p class="connect-note">Left out: ${list.map((x) => `<a href="/mcps/${esc(x.slug)}/">${esc(x.name)}</a> (${esc(x.reason)})`).join("; ")}.</p>`
  : "";

export const stackScriptHtml = (ctx, p) => {
  const scripts = playbookStackScripts(ctx, p);
  const checklist = mergedChecklist(scripts);
  const copy = (client) => ({ "copy-kind": "stack", "copy-method": `stack:${client}`, "copy-slug": `playbook:${p.id}` });
  const count = Math.max(...STACK_CLIENTS.map((c) => scripts[c].servers));
  return `
    <h3 id="install-stack">Install the whole stack</h3>
    <p class="connect-note">One paste for the ${count} servers in this playbook's stack and workflow, built from the same install data as each listing. Fallbacks are left out; anything without a copy-paste install is named below with the reason.</p>
    <details class="notes-details stack-script" data-playbook-section="install">
      <summary>Claude Code commands, Claude Desktop and Cursor configs</summary>
      ${checklist.length ? `<p class="label">Before you run it</p>
      <ul class="agents-list stack-checklist">
        ${checklist.map((x) => `<li><a href="/mcps/${esc(x.slug)}/">${esc(x.name)}</a>: ${esc(authText(x))}${x.env_var ? ` · <code class="mono">${esc(x.env_var)}</code>` : ""}${x.where ? ` — ${keyUrlHtml(x.where)}` : ""}</li>`).join("")}
      </ul>` : ""}
      ${STACK_CLIENTS.map((client) => {
        const s = scripts[client];
        const body = client === "claude_code" ? s.script : JSON.stringify(s.config, null, 2);
        return codeBlock(CLIENT_LABEL[client], body, client === "claude_code" ? "sh" : "json", copy(client))
          + (s.note ? `<p class="connect-note">${esc(s.note)}</p>` : "")
          + skippedHtml(s.skipped);
      }).join("\n")}
    </details>`;
};

export const stackScriptMd = (ctx, p) => {
  const scripts = playbookStackScripts(ctx, p);
  const checklist = mergedChecklist(scripts);
  const lines = [
    "## Install the whole stack",
    "",
    "Generated from each listing's install data: the primary stack and workflow servers, not the fallbacks. Also available from the meta-MCP: `get_film_playbook` with `client`.",
    "",
  ];
  if (checklist.length) {
    lines.push("### Before you run it", "");
    for (const x of checklist) lines.push(`- [${x.name}](${ctx.site.url}/mcps/${x.slug}.md): ${authText(x)}${x.env_var ? ` (\`${x.env_var}\`)` : ""}${x.where ? ` — ${keyUrlMd(x.where)}` : ""}`);
    lines.push("");
  }
  for (const client of STACK_CLIENTS) {
    const s = scripts[client];
    lines.push(`### ${CLIENT_LABEL[client]}`, "");
    if (s.note) lines.push(s.note, "");
    lines.push(client === "claude_code" ? "```sh" : "```json", client === "claude_code" ? s.script : JSON.stringify(s.config, null, 2), "```", "");
    // The Claude Code script already names its skips as comments.
    if (s.skipped.length && client !== "claude_code") lines.push(`Left out: ${s.skipped.map((x) => `${x.name} (${x.reason})`).join("; ")}.`, "");
  }
  return lines;
};
