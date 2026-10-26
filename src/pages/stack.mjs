import { STAGES, card, esc, layout } from "./_shared.mjs";

// -------------------------------------------------------------------- stack
export const stackStageData = (ctx) =>
  STAGES.map((stage) => ({
    ...stage,
    cats: ctx.categories
      .filter((c) => c.stage === stage.id)
      .map((c) => ({ cat: c, servers: ctx.servers.filter((s) => s.category === c.id) }))
      .filter((g) => g.servers.length),
  })).filter((st) => st.cats.length);

export const renderStack = (ctx) => {
  const stages = stackStageData(ctx);
  const starter = ["martini", "fal", "elevenlabs", "davinci-resolve", "youtube-yutu"]
    .map((slug) => ctx.servers.find((s) => s.slug === slug))
    .filter(Boolean);

  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>The Stack</span></p>
  <h1>The AI Film Stack</h1>
  <p class="hero-sub">An opinionated walk through the pipeline: what your agent connects at each stage of making a film, from blank page to published cut. <span class="mono">(machine version: <a href="/stack.md">/stack.md</a>)</span></p>
</section>

<section class="starter">
  <h2>The five-connection starter kit</h2>
  <p>If you connect nothing else, connect these. One studio, one model hub, one voice, one edit bay, one distribution pipe — a complete film pipeline in five MCP servers.</p>
  <div class="grid">${starter.map((s) => card(ctx, s)).join("")}</div>
  <p class="connect-note">Need a stack for a specific job? Use the <a href="/playbooks/">production playbooks</a>.</p>
</section>

${stages.map((st, i) => `
<section class="stage">
  <div class="stage-head">
    <span class="stage-num">${String(i + 1).padStart(2, "0")}</span>
    <h2>${esc(st.name)}</h2>
    <p class="cat-blurb">${esc(st.blurb)}</p>
  </div>
  ${st.cats.map((g) => `
  <div class="stage-cat">
    <h3><a href="/categories/${g.cat.id}/">${esc(g.cat.name)}</a></h3>
    <ul class="stage-list">
      ${g.servers.map((s) => `<li><a href="/mcps/${s.slug}/">${esc(s.name)}</a>${s.official ? ' <span class="tag tag-official">Official</span>' : ""} — ${esc(s.tagline)}</li>`).join("")}
    </ul>
  </div>`).join("")}
</section>`).join("")}`;

  return layout(ctx, {
    title: "The AI Film Stack — a pipeline guide to MCP filmmaking | mcp.film",
    description: "An opinionated walk through the AI filmmaking pipeline: which MCP servers your agent should connect at every stage, from script to distribution.",
    path: "/stack/",
    page: "stack",
    md: "/stack.md",
    body,
  });
};

export const renderStackMd = (ctx) => {
  const stages = stackStageData(ctx);
  const lines = [
    "# The AI Film Stack (mcp.film)",
    "",
    "> Which MCP servers an agent should connect at each stage of making a film.",
    "",
  ];
  for (const st of stages) {
    lines.push(`## ${st.name}`, "", st.blurb, "");
    for (const g of st.cats) {
      lines.push(`### ${g.cat.name}`, "");
      for (const s of g.servers) {
        lines.push(`- [${s.name}](${ctx.site.url}/mcps/${s.slug}.md)${s.official ? " (official)" : ""}: ${s.tagline}`);
      }
      lines.push("");
    }
  }
  lines.push("---", "", `Full registry: ${ctx.site.url}/api/registry.json`);
  return lines.join("\n") + "\n";
};
