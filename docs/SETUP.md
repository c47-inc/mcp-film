# One-time launch checklist

Everything after this list runs itself. ~20 minutes of human setup, once.

## 1. Make main the default branch

`main` already exists with the full history. In **Settings → General →
Default branch**, switch the default from `claude/cool-euler-dm96ws` to
`main`, then delete the old `claude/*` branch from the Branches page.

This matters: scheduled workflows (the daily curator, the weekly pulse) only
run from the repo's default branch.

## 2. Enable GitHub Pages fallback

Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Then run the **Build & Deploy** workflow once (Actions tab → Build & Deploy →
Run workflow) and confirm the site is live at the `*.github.io` URL.

GitHub Pages is still useful as a fallback, but it cannot expose request-level
logs for `/llms.txt`, markdown, JSON, and other agent-readable surfaces.

## 3. Primary hosting for agent traffic: Cloudflare Pages

Use Cloudflare Pages if you want to know how much agent traffic the directory
gets. The build now emits `dist/_worker.js`, a Cloudflare Pages advanced-mode
worker that records `mcpfilm_edge_request` events into PostHog before serving
the static site.

Cloudflare Pages settings:

| Setting | Value |
| --- | --- |
| Repository | `c47-inc/mcp-film` |
| Production branch | `main` |
| Build command | `node build.mjs` |
| Build output directory | `dist` |
| Root directory | `/` |

Add `mcp.film` as the custom domain on the Cloudflare Pages project. Add a
secret `ANALYTICS_SALT` in Pages settings so approximate unique agent counts
are hashed with a private salt. See [`docs/ANALYTICS.md`](ANALYTICS.md) for the
event fields and HogQL queries.

In **Cloudflare → mcp.film → DNS → Records**, remove the old GitHub Pages
`A`/`AAAA` records for `@` and the old `www → c47-inc.github.io` CNAME, then
add:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| `CNAME` | `@` | `mcp-film.pages.dev` | Proxied |
| `CNAME` | `www` | `mcp-film.pages.dev` | Proxied |

Cloudflare security settings can block spoofed crawler user agents before the
Pages worker runs. Keep the bot posture strict for the rest of the site, but
add one narrow bypass for agent-readable files:

1. Go to **Cloudflare → mcp.film → Security → WAF → Custom rules**.
2. Create a rule named `Allow agent-readable mcp.film surfaces`.
3. Use this expression:

   ```txt
   http.host in {"mcp.film" "www.mcp.film"} and (
     starts_with(http.request.uri.path, "/api/") or
     starts_with(http.request.uri.path, "/v0.1/") or
     starts_with(http.request.uri.path, "/.well-known/mcp/") or
     ends_with(http.request.uri.path, ".md") or
     http.request.uri.path in {
       "/llms.txt"
       "/llms-full.txt"
       "/feed.xml"
       "/robots.txt"
       "/sitemap.xml"
     }
   )
   ```

4. Prefer action **Skip** and skip bot/WAF products available on the plan:
   Bot Fight Mode or Super Bot Fight Mode, Browser Integrity Check, managed
   WAF rules, and remaining custom rules. If **Skip** is not available, use
   **Allow** and keep the rule scoped to the expression above.
5. Verify both of these return `200`:

   ```sh
   curl -I https://mcp.film/llms.txt
   curl -I -A 'ClaudeBot-mcpfilm-smoke/1.0' https://mcp.film/llms.txt
   node scripts/monitor-production.mjs
   ```

The second command and the Node monitor intentionally spoof known agent/crawler
user agents; if they get `403`, Cloudflare blocked them before
`mcpfilm_edge_request` could be recorded in PostHog.

## 3b. If staying on GitHub Pages, point mcp.film there

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
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages deploy | API token with Cloudflare Pages edit access for the C47 account. Required for GitHub pushes to deploy to Cloudflare. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Pages deploy | `2cdfec7e71db16b4ca131ba1f66454e9`. Required with `CLOUDFLARE_API_TOKEN`. |

Also check **Settings → Actions → General → Workflow permissions**: set
**Read and write permissions** and allow GitHub Actions to **create and
approve pull requests** (needed by the agent workflows).

After a deleted repo is recreated, these secrets are empty again. The workflows
skip cleanly when required secrets are missing, write the reason into the job
summary, and open/update an `automation-failure` issue so the pause is visible
from the repo. They will not self-update until `ANTHROPIC_API_KEY` is restored,
and Cloudflare will not auto-deploy until `CLOUDFLARE_API_TOKEN` is restored.

If GitHub refuses to enable repository-level write permissions with "Write
permissions for workflows are disabled by the organization", fix it at the org
level first: **Organization settings → Actions → General → Workflow
permissions → Read and write permissions**. The CLI equivalent requires a token
with `admin:org`.

## 5. Create labels

Create these issue/PR labels (Settings → Labels): `auto-data`, `submit`,
`correction`, `curator-lead`, `automation-failure`.

## 5b. Two settings that keep autonomy working

- **Don't enable required PR reviews on `main`** (branch protection). The
  auto-merge gate is the review for data-only changes; required human reviews
  would freeze the self-update loop. The gate already refuses to merge
  anything outside `data/`.
- **Failure alarms**: every workflow files/updates an issue labeled
  `automation-failure` when a run fails or when a required secret is missing
  (expired key, deleted repo secret, deprecated model, upstream change). Watch
  the repo so those reach your inbox — that issue stream is the only thing you
  ever need to react to.

## 6. Search engines (one-time, ~10 minutes)

- **Google Search Console**: add the `mcp.film` domain property (DNS TXT
  verification), then submit `https://mcp.film/sitemap.xml`.
- **Bing Webmaster Tools**: import from Search Console (one click) — Bing
  powers Copilot and several answer engines.
- **IndexNow** is already automated: every deploy pings api.indexnow.org
  (the key file is generated into the site root by the build).

## 7. Publishing the meta-MCP (npm + official MCP Registry)

The `Release (npm + MCP Registry)` workflow does both in one click once two
secrets exist. The package name `mcp-film` is unclaimed on npm (verified
2026-06-11).

1. **npm — first publish from your machine** (npm's 2025 security rules
   require an interactive OTP for a package's first publish):

   ```sh
   git clone https://github.com/c47-inc/mcp-film && cd mcp-film/packages/mcp-server
   npm login          # browser/OTP flow
   npm publish --access public   # enter the 2FA code when prompted
   ```

2. **npm — hand publishing to CI forever**: on npmjs.com open the new
   `mcp-film` package → Settings → **Trusted Publisher** → GitHub Actions →
   owner `c47-inc`, repository `mcp-film`, workflow `release.yml`. From then
   on the Release workflow publishes via OIDC: no token, no OTP, no secret.
3. **Registry domain proof**: add one more DNS TXT record on `@` for
   `mcp.film` (value provided separately — `v=MCPv1; k=ed25519; p=…`), and
   add the matching private key as repo secret `MCP_REGISTRY_KEY`.
4. Actions → **Release (npm + MCP Registry)** → Run workflow. (The npm step
   detects the version you already published and skips it; the registry step
   runs.)

Future releases: bump `version` in `packages/mcp-server/package.json`
(an agent PR can do this), click Release again. The published package always
fetches the live registry at runtime, so data updates never require a
re-release — only tool changes do.

## 8. Optional but recommended
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
| Production Monitor | every 6 hours / manual | checks custom-domain, `www`, Pages fallback, agent-user-agent access, and optional PostHog edge ingestion |
| Curator | daily 06:17 UTC | re-verifies the 3 stalest entries (full catalog every ~3 weeks), hunts for new servers, PRs data — skips the PR on quiet days |
| Pulse | Thursdays 07:41 UTC | syncs PostHog ratings/trending/feedback into data, summarizes edge traffic in the PR, PRs |
| Inbox | issue opened w/ `submit`/`correction` | verifies and lists (or declines with reasons) |
| Auto-merge | PR labeled `auto-data` | merges only if all changes are in `data/` + validation passes, then deploys |
