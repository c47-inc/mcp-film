# One-time launch checklist

Everything after this list runs itself. ~20 minutes of human setup, once.

## 1. Merge to main

Merge the initial branch into `main`. The deploy workflow runs on every push
to `main`.

## 2. Enable GitHub Pages

Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Then run the **Build & Deploy** workflow once (Actions tab → Build & Deploy →
Run workflow) and confirm the site is live at the `*.github.io` URL.

## 3. Point mcp.film at GitHub Pages

At your DNS provider for `mcp.film`:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA (optional) | `@` | `2606:50c0:8000::153` … `:8003::153` |
| CNAME | `www` | `c47-inc.github.io` |

Then **Settings → Pages → Custom domain**: enter `mcp.film`, wait for the DNS
check, and tick **Enforce HTTPS**. (The build already emits the `CNAME` file.)

## 4. Add repository secrets

**Settings → Secrets and variables → Actions:**

| Secret | Needed for | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | curator, pulse, inbox agents | An Anthropic API key. Without it, the site still deploys — it just stops self-updating. |
| `POSTHOG_API_KEY` | pulse (ratings/feedback sync) | A PostHog **personal API key** with *query read* access to project 292112 (us.posthog.com → Settings → Personal API keys). Optional; pulse skips gracefully without it. |

Also check **Settings → Actions → General → Workflow permissions**: set
**Read and write permissions** and allow GitHub Actions to **create and
approve pull requests** (needed by the agent workflows).

## 5. Create labels

Create these issue/PR labels (Settings → Labels): `auto-data`, `submit`,
`correction`, `curator-lead`, `automation-failure`.

## 5b. Two settings that keep autonomy working

- **Don't enable required PR reviews on `main`** (branch protection). The
  auto-merge gate is the review for data-only changes; required human reviews
  would freeze the self-update loop. The gate already refuses to merge
  anything outside `data/`.
- **Failure alarms**: every workflow files/updates an issue labeled
  `automation-failure` when a run fails (expired key, deprecated model,
  upstream change). Watch the repo so those reach your inbox — that issue
  stream is the only thing you ever need to react to.

## 6. Search engines (one-time, ~10 minutes)

- **Google Search Console**: add the `mcp.film` domain property (DNS TXT
  verification), then submit `https://mcp.film/sitemap.xml`.
- **Bing Webmaster Tools**: import from Search Console (one click) — Bing
  powers Copilot and several answer engines.
- **IndexNow** is already automated: every deploy pings api.indexnow.org
  (the key file is generated into the site root by the build).

## 7. Optional but recommended

- **Publish the meta-MCP to npm** so `npx -y mcp-film` works for everyone:
  `cd packages/mcp-server && npm publish` (after `node ../../build.mjs` to
  refresh the snapshot). The package name `mcp-film` must be available or
  adjusted.
- **Publish to the official MCP Registry** (registry.modelcontextprotocol.io)
  with the `mcp-publisher` CLI — the package.json already carries
  `"mcpName": "film.mcp/directory"`. Domain verification wants a DNS TXT
  record or `/.well-known/mcp-registry-auth` (the curator agent can be asked
  to wire this up later).
- **Analytics segmentation:** site events go to the existing PostHog "Martini"
  project under `mcpfilm_*` event names with `$host = mcp.film`. If you'd
  rather isolate them, create a dedicated PostHog project and swap
  `analytics.posthog_key` in `data/site.json`.
- **Martini connect instructions:** the network here couldn't read
  martini.film/docs/mcp, so the Martini listing links to the docs page instead
  of embedding the exact connect command. Paste the command/endpoint into
  `data/registry/studio.json` (`install.claude_code` / `install.remote_url`)
  when convenient — or tell any Claude session to do it.

## What runs when

| Workflow | Trigger | What it does |
| --- | --- | --- |
| Build & Deploy | push to main / manual | builds `dist/`, publishes to Pages |
| Curator | daily 06:17 UTC | re-verifies the 3 stalest entries (full catalog every ~3 weeks), hunts for new servers, PRs data — skips the PR on quiet days |
| Pulse | Thursdays 07:41 UTC | syncs PostHog ratings/trending/feedback into data, PRs |
| Inbox | issue opened w/ `submit`/`correction` | verifies and lists (or declines with reasons) |
| Auto-merge | PR labeled `auto-data` | merges only if all changes are in `data/` + validation passes, then deploys |
