#!/usr/bin/env node
/**
 * Opens, updates, or closes a GitHub issue for automation that is intentionally
 * paused by missing repo secrets or equivalent setup gaps.
 *
 * Required env:
 *   MCPFILM_GAP_TITLE    exact issue title to open/update/close
 *   GH_TOKEN             provided by GitHub Actions
 *
 * Optional env:
 *   MCPFILM_GAP_SUMMARY
 *   MCPFILM_GAP_DETAILS
 *   MCPFILM_GAP_RECOVERED=true  close the matching open issue
 */
import { execFileSync } from "node:child_process";

const title = process.env.MCPFILM_GAP_TITLE;
const repo = process.env.GITHUB_REPOSITORY;
const workflow = process.env.GITHUB_WORKFLOW || "unknown workflow";
const runId = process.env.GITHUB_RUN_ID;
const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
const label = process.env.MCPFILM_GAP_LABEL || "automation-failure";
const recovered = process.env.MCPFILM_GAP_RECOVERED === "true";

if (!title || !repo) {
  console.log("Automation-gap report skipped: MCPFILM_GAP_TITLE or GITHUB_REPOSITORY is missing.");
  process.exit(0);
}

if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
  console.log("Automation-gap report skipped: GH_TOKEN/GITHUB_TOKEN is missing.");
  process.exit(0);
}

const runUrl = runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : `${serverUrl}/${repo}/actions`;
const issue = findOpenIssue(title);

if (recovered) {
  if (!issue) {
    console.log(`No open automation-gap issue to close for "${title}".`);
    process.exit(0);
  }
  gh(["issue", "comment", String(issue.number), "--repo", repo, "--body", `Recovered in ${workflow}: ${runUrl}`]);
  gh(["issue", "close", String(issue.number), "--repo", repo, "--comment", "Closing because the automation gate recovered."]);
  console.log(`Closed automation-gap issue #${issue.number}: ${title}`);
  process.exit(0);
}

const body = [
  process.env.MCPFILM_GAP_SUMMARY || "Automation is paused.",
  "",
  `Workflow: ${workflow}`,
  `Run: ${runUrl}`,
  "",
  process.env.MCPFILM_GAP_DETAILS || "Restore the required repository secret or setup item, then rerun the workflow.",
  "",
  "Setup guide: https://github.com/c47-inc/mcp-film/blob/main/docs/SETUP.md#4-add-repository-secrets",
].join("\n");

if (issue) {
  gh(["issue", "comment", String(issue.number), "--repo", repo, "--body", body]);
  console.log(`Updated automation-gap issue #${issue.number}: ${title}`);
} else {
  try {
    gh(["issue", "create", "--repo", repo, "--title", title, "--label", label, "--body", body]);
  } catch {
    gh(["issue", "create", "--repo", repo, "--title", title, "--body", body]);
  }
  console.log(`Created automation-gap issue: ${title}`);
}

function findOpenIssue(exactTitle) {
  let raw;
  try {
    raw = gh([
      "issue", "list",
      "--repo", repo,
      "--state", "open",
      "--label", label,
      "--limit", "100",
      "--json", "number,title",
    ], { stdio: "pipe" });
  } catch {
    raw = gh([
      "issue", "list",
      "--repo", repo,
      "--state", "open",
      "--limit", "100",
      "--json", "number,title",
    ], { stdio: "pipe" });
  }
  const issues = JSON.parse(raw || "[]");
  return issues.find((i) => i.title === exactTitle) || null;
}

function gh(args, options = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: options.stdio || "inherit",
  });
}
