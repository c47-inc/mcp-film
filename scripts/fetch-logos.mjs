#!/usr/bin/env node
/**
 * Downloads vendor logos for registry entries as GitHub org/user avatars
 * into data/logos/<slug>.png (128px). Logos live under data/ so the
 * agents' data-only auto-merge gate covers them.
 *
 * Policy: official servers get the platform's brand org; community servers
 * get the maintainer's avatar, unless the underlying service brand is the
 * clearer identity (e.g. Sora → openai, Blender → blender). A missing file
 * simply means the site renders a monogram tile — delete any logo that
 * turns out to be an auto-generated identicon.
 *
 * The slug → GitHub owner mapping lives in data/logos/owners.json so that
 * maintainer agents can extend it under the data-only merge gate.
 *
 *   node scripts/fetch-logos.mjs           # fetch missing logos
 *   node scripts/fetch-logos.mjs --force   # re-fetch everything
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "logos");
fs.mkdirSync(OUT, { recursive: true });

const OWNERS = JSON.parse(fs.readFileSync(path.join(OUT, "owners.json"), "utf8"));

const force = process.argv.includes("--force");
const registry = fs
  .readdirSync(path.join(ROOT, "data", "registry"))
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "registry", f), "utf8")));

// Fallback: derive owner from a GitHub repo link when not mapped.
const ownerFor = (s) => {
  if (Object.hasOwn(OWNERS, s.slug)) return OWNERS[s.slug] || null;
  const m = /^https:\/\/github\.com\/([^/]+)\//.exec(s.links?.repo ?? "");
  return m ? m[1] : null;
};

let ok = 0, missing = 0, failed = [];
for (const s of registry) {
  const dest = path.join(OUT, `${s.slug}.png`);
  if (fs.existsSync(dest) && !force) { ok++; continue; }
  const owner = ownerFor(s);
  if (!owner) { missing++; console.log(`· ${s.slug}: no owner mapping — monogram fallback`); continue; }
  try {
    const res = await fetch(`https://github.com/${owner}.png?size=128`, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const isImg =
      buf[0] === 0x89 || // PNG
      (buf[0] === 0xff && buf[1] === 0xd8) || // JPEG
      buf.slice(0, 4).toString("ascii") === "GIF8" ||
      buf.slice(8, 12).toString("ascii") === "WEBP";
    if (buf.length < 400 || !isImg) throw new Error("not an image");
    fs.writeFileSync(dest, buf);
    ok++;
    console.log(`✓ ${s.slug} ← ${owner} (${(buf.length / 1024).toFixed(0)}kB)`);
  } catch (e) {
    failed.push(`${s.slug} (${owner}): ${e.message}`);
  }
}

console.log(`\n${ok} logos present, ${missing} unmapped, ${failed.length} failed`);
for (const f of failed) console.log(`✗ ${f}`);
process.exit(failed.length ? 1 : 0);
