#!/usr/bin/env node
// Unit fixtures for the install-snippet generators and the composed meta description.
// These are the strings people paste into terminals; a wrong one costs a reader an afternoon.
import assert from "node:assert/strict";
import {
  caveatsFor, claudeCodeCmd, cmdLike, cursorConfig, desktopConfig, installerSubcommand,
  isInactive, sentences, serverDescription, statusLabel, verificationStatus,
} from "../src/pages/_shared.mjs";
import { STACK_CLIENTS, stackInstallScript } from "../packages/mcp-server/core.mjs";
import { siteConfigFor } from "../src/pages/stack-script.mjs";

const base = (over = {}) => ({
  slug: "fixture",
  name: "Fixture MCP",
  vendor: "Fixture Inc",
  official: true,
  tagline: "Generates fixtures.",
  description: "First sentence of the description. Second sentence.",
  install: { claude_code: null, remote_url: null, stdio_command: null },
  auth: { type: "none", env_var: null, key_url: null },
  pricing: "free",
  verified: "2026-10-26",
  added: "2026-06-11",
  ...over,
});

// ------------------------------------------------------------ cmdLike
assert.equal(cmdLike("npx -y mcp-server-hedra"), true);
assert.equal(cmdLike('uvx "sanzaru[all]"'), true, "quoted args are still a command");
assert.equal(cmdLike("claude mcp add --transport http audiopod https://mcp.audiopod.ai --header \"X-API-Key: ap_YOUR_KEY\" --scope user"), true, "--header is a flag, not prose");
assert.equal(cmdLike("Clone the repo, then `docker build -t freesound-mcp .`"), false, "prose");
assert.equal(cmdLike("reaper-mcp-server (after installing from source)"), false, "parenthetical prose");
assert.equal(cmdLike("npx davinci-resolve-mcp setup"), false, "installer subcommand");
assert.equal(cmdLike("npx -y @smithery/cli install @rakeshdavid/tavus-mcp --client claude"), false, "install subcommand");
assert.equal(cmdLike("claude mcp add resolve -- npx davinci-resolve-mcp setup"), false, "installer after --");
assert.equal(cmdLike("npx -y mcp-server-hedra", { generate: false }), false, "install.generate=false opts out");
assert.equal(cmdLike(null), false);
assert.equal(cmdLike(undefined), false);

assert.equal(installerSubcommand("npx davinci-resolve-mcp setup"), "setup");
assert.equal(installerSubcommand("bithuman mcp"), null, "a non-installer argument is fine");
assert.equal(installerSubcommand("uvx --from git+https://example.com/x.git sonicmatch-mcp"), null, "--from value is the package");
assert.equal(installerSubcommand("npx -y -p @clipwright/mcp-server clipwright-mcp"), null, "-p value is the package");
assert.equal(installerSubcommand("pipx run some-mcp init"), "init");
assert.equal(installerSubcommand("npx -y mcp-remote@latest https://mcp.canva.com/mcp"), null);

// ------------------------------------------------------ claudeCodeCmd
{
  const s = base({ install: { claude_code: null, remote_url: "https://mcp.example.com/mcp", stdio_command: null }, auth: { type: "oauth", env_var: null, key_url: "https://example.com" } });
  assert.equal(claudeCodeCmd(s), "claude mcp add --transport http fixture https://mcp.example.com/mcp", "remote + OAuth derives the http add");
  assert.equal(desktopConfig(s), JSON.stringify({ mcpServers: { fixture: { command: "npx", args: ["-y", "mcp-remote", "https://mcp.example.com/mcp"] } } }, null, 2));
  assert.equal(cursorConfig(s), JSON.stringify({ mcpServers: { fixture: { url: "https://mcp.example.com/mcp" } } }, null, 2));
}
{
  const s = base({ install: { claude_code: null, remote_url: "https://mcp.example.com/mcp", remote_headers: ["Authorization"], stdio_command: null }, auth: { type: "api_key", env_var: null, key_url: null } });
  assert.equal(claudeCodeCmd(s), null, "a remote that needs headers gets no header-less command invented for it");
  assert.equal(desktopConfig(s), null);
  assert.equal(cursorConfig(s), null);
}
{
  const s = base({ install: { claude_code: "claude mcp add --transport http fixture https://mcp.example.com/mcp --header \"X-API-Key: YOUR_KEY\"", remote_url: "https://mcp.example.com/mcp", remote_headers: ["X-API-Key"], stdio_command: null } });
  assert.equal(claudeCodeCmd(s), s.install.claude_code, "an explicit verified command with --header is used as written");
}
{
  const s = base({ install: { claude_code: null, remote_url: null, stdio_command: "npx -y mcp-server-hedra" }, auth: { type: "api_key", env_var: "HEDRA_API_KEY", key_url: null } });
  assert.equal(claudeCodeCmd(s), "claude mcp add fixture -- npx -y mcp-server-hedra");
  assert.deepEqual(JSON.parse(desktopConfig(s)), { mcpServers: { fixture: { command: "npx", args: ["-y", "mcp-server-hedra"], env: { HEDRA_API_KEY: "YOUR_KEY_HERE" } } } });
  assert.deepEqual(JSON.parse(cursorConfig(s)), JSON.parse(desktopConfig(s)));
}
{
  const s = base({ install: { claude_code: null, remote_url: null, stdio_command: 'uvx "sanzaru[all]"' } });
  assert.equal(claudeCodeCmd(s), 'claude mcp add fixture -- uvx "sanzaru[all]"', "quoted args pass through to the shell command");
  assert.equal(desktopConfig(s), null, "quoted args are not split into JSON argv");
  assert.equal(cursorConfig(s), null);
}
{
  const s = base({ install: { claude_code: null, remote_url: null, stdio_command: "npx davinci-resolve-mcp setup" } });
  assert.equal(claudeCodeCmd(s), null, "an installer wizard is never registered as the server");
  assert.equal(desktopConfig(s), null);
  assert.equal(cursorConfig(s), null);
}
{
  const s = base({ install: { claude_code: null, remote_url: null, stdio_command: "Clone the repo, then run it with uv" } });
  assert.equal(claudeCodeCmd(s), null, "prose is not a command");
  assert.equal(desktopConfig(s), null);
}
{
  const s = base({ install: { claude_code: "claude mcp add --transport http fixture https://mcp.example.com/mcp", remote_url: "https://mcp.example.com/mcp", stdio_command: "npx -y fixture-mcp", generate: false } });
  assert.equal(claudeCodeCmd(s), s.install.claude_code, "generate:false keeps the explicit verified command");
  assert.equal(desktopConfig(s), null, "generate:false stops derived JSON");
  assert.equal(cursorConfig(s), null);
}

// -------------------------------------------------- serverDescription
{
  const s = base({ install: { remote_url: "https://mcp.example.com/mcp" }, auth: { type: "oauth" } });
  assert.equal(serverDescription(s), "Generates fixtures. · Official · hosted remote · OAuth · verified Oct 26, 2026");
}
{
  const s = base({ official: false, auth: { type: "api_key", env_var: "X" } });
  assert.equal(serverDescription(s), "Generates fixtures. · Community · local · API key · verified Oct 26, 2026");
}
{
  const long = "A".repeat(60) + " " + "B".repeat(60) + " tail of the tagline that runs long.";
  const s = base({ tagline: long, auth: { type: "local-app" } });
  const d = serverDescription(s);
  assert.ok(d.length <= 155, `description is ${d.length} chars`);
  assert.ok(long.startsWith(d) || d.startsWith(long), "trailing facts drop before the tagline is cut");
  assert.ok(!/[^\p{L}\p{N}.)]$/u.test(d), "ends cleanly");
}
{
  const tagline = "x".repeat(200);
  const d = serverDescription(base({ tagline }));
  assert.ok(d.length <= 155 && tagline.startsWith(d), "an overlong tagline trims at the budget");
}
{
  const d = serverDescription(base({ tagline: "" }));
  assert.ok(d.startsWith("First sentence of the description."), "an empty tagline falls back to the first sentence");
}

// ----------------------------------------------------------- caveats
assert.deepEqual(
  sentences("Hosted server bills credits. Re-checked 26 Oct 2026: endpoint answers 401. See github.com/x/y for v4.10.4 notes. Expect no fixes."),
  ["Hosted server bills credits.", "Re-checked 26 Oct 2026: endpoint answers 401.", "See github.com/x/y for v4.10.4 notes.", "Expect no fixes."],
);
assert.deepEqual(
  caveatsFor(base({ notes: "Hosted server bills credits. Re-checked 26 Oct 2026: endpoint answers 401. Asset URLs expire after 24h. Expect no fixes." })),
  ["Hosted server bills credits.", "Asset URLs expire after 24h."],
  "verification-log sentences are skipped and two caveats remain",
);
assert.deepEqual(caveatsFor(base({ caveats: ["Quota is 10 renders a day.", " "], notes: "Ignored when caveats exist." })), ["Quota is 10 renders a day."]);
assert.deepEqual(caveatsFor(base({ notes: null })), []);

// ------------------------------------------------ whole-stack install scripts
// A playbook's stack is one paste. Inactive listings and listings that opt out of generated
// installs are skipped with a comment, never guessed at; the key checklist follows the route.
{
  const remote = base({ slug: "hosted", name: "Hosted", install: { claude_code: null, remote_url: "https://mcp.example.com/mcp", stdio_command: null }, auth: { type: "oauth", env_var: "HOSTED_KEY", key_url: "https://example.com/keys" } });
  const local = base({ slug: "local", name: "Local", install: { claude_code: null, remote_url: null, stdio_command: "npx -y local-mcp" }, auth: { type: "api_key", env_var: "LOCAL_KEY", key_url: "https://local.example.com/keys — make one" } });
  const headers = base({ slug: "headers", name: "Headers", install: { claude_code: "claude mcp add --transport http headers https://h.example.com/mcp --header \"Authorization: Bearer YOUR_KEY\"", remote_url: "https://h.example.com/mcp", remote_headers: ["Authorization"], stdio_command: null }, auth: { type: "api_key", env_var: "H_KEY", key_url: null } });
  const dead = base({ slug: "gone", name: "Gone", status: "dead", install: { claude_code: null, remote_url: null, stdio_command: "npx -y gone-mcp" } });
  const optOut = base({ slug: "optout", name: "Opt Out", install: { claude_code: null, remote_url: "https://o.example.com/mcp", stdio_command: "npx -y optout-mcp", generate: false } });
  const prose = base({ slug: "prose", name: "Prose", install: { claude_code: null, remote_url: null, stdio_command: "Clone the repo, then run setup.sh" }, auth: { type: "local-app", env_var: null, key_url: "Needs the app open" } });
  const stack = [remote, local, headers, dead, optOut, prose];
  const opts = { title: "Fixture Stack", url: "https://mcp.film/playbooks/fixture/", configFor: siteConfigFor };

  const cc = stackInstallScript(stack, "claude_code", opts);
  assert.equal(cc.servers, 3);
  const commands = cc.script.split("\n").filter((l) => l && !l.startsWith("#"));
  assert.deepEqual(commands, [
    "claude mcp add --transport http hosted https://mcp.example.com/mcp",
    "claude mcp add local -- npx -y local-mcp",
    headers.install.claude_code,
  ], "one line per installable server, in stack order, from the per-listing generators");
  assert.match(cc.script, /^# skipped gone: listing is dead/m, "inactive listings are skipped with a comment");
  assert.match(cc.script, /^# skipped optout: listing opts out of generated installs/m, "install.generate:false is skipped with a comment");
  assert.match(cc.script, /^# skipped prose: no copy-paste install/m, "prose installs are skipped, not run");
  assert.ok(!/gone-mcp|optout-mcp|setup\.sh/.test(commands.join("\n")), "no command for a skipped listing");
  assert.match(cc.script, /^# Local — needs LOCAL_KEY \(https:\/\/local\.example\.com\/keys\)$/m, "env var and the leading key URL ride above the line");
  assert.match(cc.script, /^# Hosted — OAuth: sign in when the client first connects$/m);
  assert.deepEqual(cc.skipped.map((x) => x.slug), ["gone", "optout", "prose"]);
  assert.deepEqual(cc.checklist.map((x) => [x.slug, x.env_var ?? null]), [["hosted", null], ["local", "LOCAL_KEY"], ["headers", "H_KEY"]],
    "a hosted OAuth route needs no env var; a key route names it");

  const desktop = stackInstallScript(stack, "claude_desktop", opts);
  assert.deepEqual(Object.keys(desktop.config.mcpServers), ["hosted", "local"], "merged config; a header-only remote cannot be expressed");
  assert.deepEqual(desktop.config.mcpServers.local, { command: "npx", args: ["-y", "local-mcp"], env: { LOCAL_KEY: "YOUR_KEY_HERE" } });
  assert.deepEqual(desktop.config.mcpServers.hosted.args, ["-y", "mcp-remote", "https://mcp.example.com/mcp"]);
  assert.match(desktop.skipped.find((x) => x.slug === "headers").reason, /custom headers \(Authorization\)/);
  assert.equal(desktop.file, "claude_desktop_config.json");
  const cursor = stackInstallScript(stack, "cursor", opts);
  assert.deepEqual(cursor.config.mcpServers.hosted, { url: "https://mcp.example.com/mcp" });
  assert.equal(cursor.file, ".cursor/mcp.json");
  assert.deepEqual(STACK_CLIENTS, ["claude_code", "claude_desktop", "cursor"]);

  // The meta-MCP assembles with its own installConfig; on these fixtures it must agree with the site.
  for (const client of STACK_CLIENTS) {
    assert.deepEqual(stackInstallScript(stack, client, { ...opts, configFor: undefined }), stackInstallScript(stack, client, opts), `core and site agree for ${client}`);
  }
}

// ------------------------------------------------------------ status
const ctx = { built: "2026-10-26T12:00:00.000Z" };
assert.equal(isInactive(base()), false);
assert.equal(isInactive(base({ status: "dead" })), true);
assert.equal(isInactive(base({ status: "nonsense" })), false, "unknown statuses are ignored, not rendered");
assert.equal(statusLabel(base({ status: "archived" })), "Archived");
assert.equal(verificationStatus(ctx, base()).tone, "fresh");
assert.equal(verificationStatus(ctx, base({ status: "dead" })).tone, "inactive", "dead listings are never freshly checked");
assert.equal(verificationStatus(ctx, base({ status: "deprecated" })).label, "Deprecated");

console.log("✓ template fixtures passed");
