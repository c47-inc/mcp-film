// "Listed on mcp.film" badges: /badge/<slug>.svg for every listing and a generic
// /badge/listed.svg. Plain SVG strings, no dependencies, same as the rest of the site.
//
// The badge says what the data says. An active listing reads "verified <Mon YYYY>" from its
// `verified` date, so a stale listing shows a stale month rather than a fresh claim. An
// inactive listing keeps its file (READMEs that already embed it must not break) but the
// badge states the status in the same red/amber the site uses, never a green "verified".
import { STATUS_LABEL, esc, isInactive } from "./pages/_shared.mjs";

// The generic badge lives at /badge/listed.svg, so no listing may take that slug.
export const RESERVED_BADGE_SLUGS = new Set(["listed"]);

// Verdana advance widths (units per 2048 em). Badges render in the reader's system font, so
// the build cannot measure text; it estimates with the conventional badge font and pins each
// run with textLength, so a fallback font is squeezed or stretched to fit instead of spilling.
const VERDANA = {
  " ": 720, ".": 744, "-": 864, ":": 931,
  a: 1229, b: 1276, c: 1067, d: 1276, e: 1220, f: 720, g: 1276, h: 1296, i: 562, j: 683,
  k: 1212, l: 562, m: 1992, n: 1296, o: 1243, p: 1276, q: 1276, r: 874, s: 1067, t: 807,
  u: 1296, v: 1212, w: 1675, x: 1212, y: 1212, z: 1051,
  A: 1401, B: 1405, C: 1430, D: 1577, E: 1294, F: 1178, G: 1589, H: 1540, I: 862, J: 921,
  K: 1423, L: 1145, M: 1730, N: 1532, O: 1612, P: 1235, Q: 1612, R: 1424, S: 1403, T: 1260,
  U: 1499, V: 1401, W: 2025, X: 1405, Y: 1260, Z: 1405,
};
const FONT_SIZE = 11;
export const textWidth = (text) =>
  Math.round([...String(text)].reduce((w, ch) => w + (/\d/.test(ch) ? 1302 : VERDANA[ch] ?? 1270), 0) / 2048 * FONT_SIZE * 10) / 10;

// Site palette: --inverse for the brand half, --green / --red / --amber for the state half.
// White text clears 4.5:1 on all three.
const TONES = { verified: "#15803d", listed: "#15803d", dead: "#b91c1c", archived: "#a16207", deprecated: "#a16207" };
const BRAND_BG = "#18181b";

export const badgeMonth = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

// What a listing's badge says. `null` is the generic badge.
export const badgeState = (s) => {
  if (!s) return { tone: "listed", value: "listed", title: "Listed on mcp.film" };
  if (isInactive(s)) {
    const status = STATUS_LABEL[s.status].toLowerCase();
    return { tone: s.status, value: status, title: `mcp.film: ${s.name} is listed as ${status}` };
  }
  const month = badgeMonth(s.verified);
  return { tone: "verified", value: `verified ${month}`, title: `Listed on mcp.film: ${s.name}, verified ${month}` };
};

export const renderBadgeSvg = (s = null) => {
  const { tone, value, title } = badgeState(s);
  const brand = "mcp.film";
  const brandW = textWidth(brand);
  const valueW = textWidth(value);
  // [6 pad][12 mark][5 gap][brand][7 pad] | [7 pad][value][7 pad]
  const left = Math.round(6 + 12 + 5 + brandW + 7);
  const right = Math.round(7 + valueW + 7);
  const width = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" viewBox="0 0 ${width} 20" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<clipPath id="mcpfilm-badge-r"><rect width="${width}" height="20" rx="4"/></clipPath>
<g clip-path="url(#mcpfilm-badge-r)">
<rect width="${left}" height="20" fill="${BRAND_BG}"/>
<rect x="${left}" width="${right}" height="20" fill="${TONES[tone]}"/>
</g>
<g transform="translate(6 4) scale(.1875)" aria-hidden="true">
<rect width="64" height="64" rx="15" fill="#fafafa"/>
<rect x="11" y="15.5" width="9" height="9" rx="2.5" fill="${BRAND_BG}" opacity=".58"/>
<rect x="11" y="39.5" width="9" height="9" rx="2.5" fill="${BRAND_BG}" opacity=".58"/>
<rect x="26.5" y="15.5" width="27" height="33" rx="5" fill="${BRAND_BG}"/>
</g>
<g fill="#fff" font-family="Verdana,Geneva,'DejaVu Sans',sans-serif" font-size="${FONT_SIZE}" text-rendering="geometricPrecision" aria-hidden="true">
<text x="23" y="14" textLength="${brandW}" lengthAdjust="spacingAndGlyphs">${esc(brand)}</text>
<text x="${left + 7}" y="14" textLength="${valueW}" lengthAdjust="spacingAndGlyphs">${esc(value)}</text>
</g>
</svg>
`;
};

// Copy-paste snippets for a listing's README. The link is the plain canonical listing URL:
// no tracking parameters on a backlink.
export const badgeSnippets = (siteUrl, s) => {
  const img = `${siteUrl}/badge/${s.slug}.svg`;
  const href = `${siteUrl}/mcps/${s.slug}/`;
  return {
    img,
    href,
    markdown: `[![Listed on mcp.film](${img})](${href})`,
    html: `<a href="${href}"><img src="${img}" alt="Listed on mcp.film" height="20"></a>`,
  };
};
