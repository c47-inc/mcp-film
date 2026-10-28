import { breadcrumbLd, capabilityPageFor, catById, esc, layout } from "./_shared.mjs";

// ---------------------------------------------------------------- glossary
// General definitions for filmmakers wiring agents to tools. No vendor claims live here;
// anything specific to one server belongs in its listing. Links name a capability tag, a
// category id or a site path; a capability or category that has no page at build time is
// dropped rather than linked to a 404.
export const GLOSSARY = [
  {
    id: "mcp-server",
    term: "MCP server",
    definition: "A program that exposes tools — and optionally resources and prompts — to an AI application over the Model Context Protocol, an open standard. Each listing in this directory is one: a video model, a voice platform or an editor, packaged so an agent can call it.",
    links: [["page", "/#directory", "The directory"]],
  },
  {
    id: "mcp-client",
    term: "MCP client",
    definition: "The AI application on the other end of the connection — Claude Code, Claude Desktop, Cursor, ChatGPT and others. It connects to servers, lists their tools, and makes the calls the model decides on.",
    links: [["page", "/clients/", "Client setup profiles"]],
  },
  {
    id: "tool",
    term: "Tool",
    definition: "One named operation a server exposes, with a JSON Schema for its inputs: generate a clip, upload a file, add a marker. The model chooses when to call it and the client runs the call. Listings show a sample; the server's own tools/list response is the source of truth.",
    links: [],
  },
  {
    id: "stdio",
    term: "stdio (local server)",
    definition: "The local transport: the client launches the server as a subprocess on your machine and talks to it over standard input and output. Typical of npx, uvx and docker commands, and the only way to drive desktop apps and local files — which also means it needs a client that can run processes.",
    links: [["page", "/clients/", "Which clients run local servers"]],
  },
  {
    id: "remote",
    term: "Remote (hosted) server and Streamable HTTP",
    definition: "A server that runs at an https URL instead of on your machine. Clients connect over Streamable HTTP, the protocol's current HTTP transport (some older servers still use SSE). Nothing to install, so it works from web and mobile clients that cannot spawn processes.",
    links: [["page", "/remotes/", "Hosted remotes"], ["capability", "remote-mcp"]],
  },
  {
    id: "oauth-vs-api-key",
    term: "OAuth vs API key",
    definition: "Two ways a server proves who you are to the vendor. OAuth sends you to a browser to sign in and grant access, and the client keeps the token. An API key is a secret you create in the vendor's dashboard and hand to the server, usually as an environment variable or a request header. Each listing names its auth type and, for keys, the variable.",
    links: [],
  },
  {
    id: "environment-variable",
    term: "Environment variable",
    definition: "A named value set outside the code — FAL_KEY, ELEVENLABS_API_KEY — that a local server reads at start-up. It is how API keys reach a stdio server without being written into a config you might share. In Claude Code, -e NAME=value on claude mcp add sets one for that server.",
    links: [],
  },
  {
    id: "claude-mcp-add",
    term: "claude mcp add",
    definition: "Claude Code's command for registering a server. claude mcp add <name> -- <command> adds a local stdio server; claude mcp add --transport http <name> <url> adds a hosted one. -e sets an environment variable and --scope user makes the server available in every project. Every listing and playbook here carries the line when one can be generated.",
    links: [["page", "/playbooks/", "Whole-stack install scripts in each playbook"]],
  },
  {
    id: "mcp-registry",
    term: "MCP Registry",
    definition: "The Model Context Protocol project's public catalogue of server metadata, read by clients and by subregistries through a standard API. mcp.film publishes a compatible read-only subregistry at /v0.1/servers, with its editorial fields — caveats, verification dates — under its own namespace.",
    links: [["page", "/for-agents/", "Machine surfaces"]],
  },
  {
    id: "text-to-video",
    term: "Text-to-video",
    definition: "Generating a clip from a written prompt. Models differ in duration, resolution, motion control and whether they make sound. Generation usually runs as an asynchronous job the agent polls until the file is ready.",
    links: [["capability", "text-to-video"], ["category", "video-generation"]],
  },
  {
    id: "image-to-video",
    term: "Image-to-video",
    definition: "Animating a still — a start frame, and on some models an end frame too — into a clip. The usual way to hold a look across shots: lock the frame first, then animate it.",
    links: [["capability", "image-to-video"], ["capability", "first-last-frame"]],
  },
  {
    id: "async-job",
    term: "Async job",
    definition: "Generation often takes longer than one tool call can wait, so the server returns a job or task id and the agent checks back — or gets a webhook — until the result is ready. Output links are often temporary, so download them when the job finishes.",
    links: [["capability", "async-jobs"]],
  },
  {
    id: "model-hub",
    term: "Model hub",
    definition: "A service that puts many third-party models behind one API and one MCP connection, so an agent can switch models without new credentials. The trade is a middleman between you and the model's maker.",
    links: [["category", "model-hub"], ["capability", "multi-model-generation"]],
  },
  {
    id: "lip-sync",
    term: "Lip-sync",
    definition: "Re-timing a face's mouth movements to match a new audio track. Used for dubbing, ADR and talking-head avatars.",
    links: [["capability", "lip-sync"], ["category", "avatars-performance"]],
  },
  {
    id: "upscaling",
    term: "Upscaling",
    definition: "Raising an image's or a video's resolution with a model that synthesises detail rather than stretching pixels. Generative upscalers can invent detail that was never there; faithful ones try not to, and that difference matters on a face or a product.",
    links: [["capability", "upscaling"], ["category", "enhancement"]],
  },
  {
    id: "tts",
    term: "Text-to-speech (TTS)",
    definition: "Synthesising spoken audio from text in a chosen voice — scratch dialogue, narration, or a temp track before the real recording.",
    links: [["capability", "tts"], ["category", "voice-speech"]],
  },
  {
    id: "voice-cloning",
    term: "Voice cloning",
    definition: "Building a reusable synthetic voice from recordings of a real speaker. Get the speaker's consent, in writing, before you do it.",
    links: [["capability", "voice-cloning"]],
  },
  {
    id: "dubbing",
    term: "Dubbing",
    definition: "Replacing a film's dialogue with a version in another language, often in a clone of the original speaker's voice and sometimes with lip-sync so the mouths match.",
    links: [["capability", "dubbing"], ["capability", "localization"]],
  },
  {
    id: "nle",
    term: "NLE (non-linear editor)",
    definition: "Editing software — DaVinci Resolve, Premiere Pro, Final Cut Pro — where clips are arranged on a timeline without altering the source media. An NLE MCP drives a running editor, usually through its scripting or plugin interface, so the app has to be open.",
    links: [["capability", "nle-control"], ["category", "editing-post"]],
  },
  {
    id: "edl-xml-otio",
    term: "EDL, XML and OTIO",
    definition: "Interchange formats that describe a cut so another application can rebuild it: the Edit Decision List, a decades-old plain-text format with limited track support; Final Cut Pro's XML formats, including FCPXML; and OpenTimelineIO, an open-source format and library that began at Pixar. They carry the edit, not the media.",
    links: [["capability", "cross-nle-export"], ["capability", "fcpxml"]],
  },
  {
    id: "lut",
    term: "LUT (look-up table)",
    definition: "A file, commonly .cube, that maps input colours to output colours. Used to convert between colour spaces or to apply the same look across every shot in a grade.",
    links: [["capability", "color-grading"]],
  },
  {
    id: "previz",
    term: "Previz",
    definition: "Previsualisation: rough 3D or animated versions of shots, made before production to work out camera, blocking and timing while changes are still cheap.",
    links: [["capability", "previz"], ["category", "3d-vfx"]],
  },
  {
    id: "storyboard",
    term: "Storyboard",
    definition: "The planned shots of a scene as a sequence of frames, with notes on framing and action. In AI production it doubles as the shot list the generators work from.",
    links: [["capability", "storyboarding"], ["category", "story-preproduction"]],
  },
  {
    id: "official-vs-community",
    term: "Official vs community server",
    definition: "On mcp.film, official means the platform's vendor maintains the server; community means an independent developer does, named in the listing. Official is not automatically better — some are frozen while a community server keeps shipping — which is what the compare pages are for.",
    links: [["page", "/compare/", "Compare servers"]],
  },
];

const resolveLink = (ctx, [kind, id, label]) => {
  if (kind === "capability") {
    const page = capabilityPageFor(ctx, id);
    return page ? { href: `/capabilities/${page}/`, md: `${ctx.site.url}/capabilities/${page}.md`, label: label ?? id, code: true } : null;
  }
  if (kind === "category") {
    const cat = catById(ctx, id);
    return cat ? { href: `/categories/${cat.id}/`, md: `${ctx.site.url}/categories/${cat.id}.md`, label: label ?? cat.name } : null;
  }
  return { href: id, md: `${ctx.site.url}${id}`, label: label ?? id };
};

export const glossaryLinks = (ctx, entry) => entry.links.map((l) => resolveLink(ctx, l)).filter(Boolean);

export const renderGlossary = (ctx) => {
  const { site } = ctx;
  const url = `${site.url}/glossary/`;
  const body = `
<section class="page-head">
  <p class="crumbs"><a href="/">mcp.film</a> / <span>Glossary</span></p>
  <h1>Glossary</h1>
  <p class="hero-sub">The words you meet wiring an agent into a film pipeline, defined briefly and linked to the servers that do the thing. <span class="mono">(machine version: <a href="/glossary.md">/glossary.md</a>)</span></p>
</section>

<section class="server-main agents-doc glossary-doc">
  <nav class="glossary-jump" aria-label="Glossary terms">
    ${GLOSSARY.map((g) => `<a href="#${esc(g.id)}">${esc(g.term)}</a>`).join("\n    ")}
  </nav>
  <dl class="glossary">
    ${GLOSSARY.map((g) => {
      const links = glossaryLinks(ctx, g);
      return `<div class="glossary-entry" id="${esc(g.id)}">
      <dt><dfn>${esc(g.term)}</dfn></dt>
      <dd><p>${esc(g.definition)}</p>${links.length ? `<p class="glossary-see"><span class="label">On mcp.film</span> ${links.map((l) => `<a href="${esc(l.href)}">${l.code ? `<code class="mono">${esc(l.label)}</code>` : esc(l.label)}</a>`).join(" · ")}</p>` : ""}</dd>
    </div>`;
    }).join("\n    ")}
  </dl>
</section>`;
  return layout(ctx, {
    title: "Glossary: MCP and AI filmmaking terms | mcp.film",
    description: "Short definitions for filmmakers using MCP: servers, clients, tools, stdio vs hosted, OAuth vs API keys, image-to-video, lip-sync, upscaling, dubbing, NLE, EDL/OTIO.",
    path: "/glossary/",
    page: "glossary",
    md: "/glossary.md",
    body,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "DefinedTermSet",
        "@id": url,
        name: "mcp.film glossary",
        description: "Terms for filmmakers connecting AI agents to production tools over the Model Context Protocol.",
        url,
        hasDefinedTerm: GLOSSARY.map((g) => ({
          "@type": "DefinedTerm",
          "@id": `${url}#${g.id}`,
          name: g.term,
          description: g.definition,
          url: `${url}#${g.id}`,
          inDefinedTermSet: url,
        })),
      },
      breadcrumbLd(ctx, [{ name: "Glossary" }]),
    ],
  });
};

export const renderGlossaryMd = (ctx) => {
  const lines = [
    "# mcp.film glossary",
    "",
    "> Terms for filmmakers connecting AI agents to production tools over MCP. General definitions; server-specific facts live on each listing.",
    "",
  ];
  for (const g of GLOSSARY) {
    lines.push(`## ${g.term}`, "", g.definition, "");
    const links = glossaryLinks(ctx, g);
    if (links.length) lines.push(`On mcp.film: ${links.map((l) => `[${l.label}](${l.md})`).join(" · ")}`, "");
  }
  lines.push("---", "", `Canonical: ${ctx.site.url}/glossary/`);
  return lines.join("\n") + "\n";
};
