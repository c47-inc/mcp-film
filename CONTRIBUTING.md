# Contributing to mcp.film

The directory lives in `data/registry/*.json`. Additions and corrections are
welcome from humans and agents alike.

## The bar for listing

1. **It works.** The server connects and its core tools run as documented.
2. **It's relevant to filmmaking** — generation, sound, edit, finish, ship, or
   the production office around them.
3. **It's maintained** — or it's the only option for an important platform
   (in which case the `notes` field must say so).

## Two ways in

- **Issue (easiest):** use the [submission form](../../issues/new?template=submit-mcp.yml).
  A triage agent verifies and replies, usually within a week.
- **Pull request:** add an entry to the matching file in `data/registry/`
  following the schema in [AGENTS.md](AGENTS.md#editing-the-registry), then run:

  ```sh
  node build.mjs --validate-only
  ```

  CI runs the same validation. PRs that touch only `data/` and pass validation
  can be auto-merged by the gate workflow once labeled `auto-data` by a
  maintainer agent.

## Ground rules

- Verify everything against primary sources; never copy claims you didn't check.
- `notes` is for the inconvenient truths — quotas, ToS gray areas, "requires
  the app running locally". That's what makes the directory worth trusting.
- Vendors are welcome to submit their own servers (mark `official: true`);
  competitors are listed on merit and never removed for commercial reasons.

Code contributions (generator, templates, meta-MCP) are also welcome — those
get human review. The whole project is MIT.
