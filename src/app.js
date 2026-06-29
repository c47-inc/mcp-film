/* mcp.film client behavior: search/filter, copy buttons, ratings & feedback.
   Progressive enhancement only — the site is fully usable without this file. */
(() => {
  const ph = (event, props) => {
    if (window.posthog?.capture) window.posthog.capture(event, props);
  };
  const normalizedHost = (url) => {
    try {
      return new URL(url, location.href).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const hostMatches = (host, root) => Boolean(host && root && (host === root || host.endsWith("." + root)));
  const siteHost = normalizedHost(location.href);
  const sponsorHost = normalizedHost(document.body.dataset.sponsorUrl || "");

  // pageview (autocapture is off; we send a single clean event)
  ph("mcpfilm_pageview", { path: location.pathname, page: document.body.dataset.page });

  const currentServer = (() => {
    const node = document.getElementById("server-data");
    if (!node?.textContent) return null;
    try {
      return JSON.parse(node.textContent);
    } catch {
      return null;
    }
  })();

  if (currentServer?.slug) {
    ph("mcpfilm_server_view", {
      slug: currentServer.slug,
      category: currentServer.category,
      official: Boolean(currentServer.official),
      remote: Boolean(currentServer.install?.remote_url),
      featured: Boolean(currentServer.featured),
      pricing: currentServer.pricing,
      is_martini: currentServer.slug === "martini",
      path: location.pathname,
    });
  }

  // ------------------------------------------------------------- search
  const search = document.getElementById("search");
  const cards = [...document.querySelectorAll(".card[data-search]")];
  const sections = [...document.querySelectorAll("[data-cat-section]")];
  const noResults = document.getElementById("no-results");
  const filters = [...document.querySelectorAll(".chip-filter")];
  const quickFilters = [...document.querySelectorAll(".quick-filter[data-quick-filter]")];
  let activeCat = "";
  const activeQuick = new Set();

  const applyFilter = () => {
    const q = (search?.value ?? "").trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const hit =
        (!q || card.dataset.search.includes(q)) &&
        (!activeCat || card.dataset.cat === activeCat) &&
        (!activeQuick.has("official") || card.dataset.official === "true") &&
        (!activeQuick.has("remote") || card.dataset.remote === "true");
      card.hidden = !hit;
      if (hit) shown++;
    }
    for (const sec of sections) {
      sec.hidden = ![...sec.querySelectorAll(".card")].some((c) => !c.hidden);
    }
    if (noResults) noResults.hidden = shown > 0;
    if (q.length > 2) phSearchDebounced(q, shown);
  };

  let searchTimer;
  const phSearchDebounced = (q, results) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => ph("mcpfilm_search", { query: q, results }), 800);
  };

  if (search) {
    search.addEventListener("input", applyFilter);
    // support /?q= deep links (also the schema.org SearchAction target)
    const q = new URLSearchParams(location.search).get("q");
    if (q) { search.value = q; applyFilter(); }
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== search && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        search.focus();
        search.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }

  for (const btn of filters) {
    btn.addEventListener("click", () => {
      activeCat = btn.dataset.filter;
      filters.forEach((b) => b.classList.toggle("is-on", b === btn));
      applyFilter();
      ph("mcpfilm_filter", { category: activeCat || null, quick: [...activeQuick], results: cards.filter((c) => !c.hidden).length });
    });
  }

  for (const btn of quickFilters) {
    btn.addEventListener("click", () => {
      const key = btn.dataset.quickFilter;
      if (activeQuick.has(key)) activeQuick.delete(key);
      else activeQuick.add(key);
      btn.classList.toggle("is-on", activeQuick.has(key));
      btn.setAttribute("aria-pressed", String(activeQuick.has(key)));
      applyFilter();
      ph("mcpfilm_filter", { category: activeCat || null, quick: [...activeQuick], results: cards.filter((c) => !c.hidden).length });
    });
  }

  // -------------------------------------------------------- copy buttons
  for (const btn of document.querySelectorAll("[data-copy]")) {
    btn.addEventListener("click", async () => {
      const code = btn.closest(".code-block")?.querySelector("code")?.textContent ?? "";
      const slug = btn.dataset.copySlug || document.querySelector(".server")?.dataset.slug || null;
      const copyKind = btn.dataset.copyKind || "snippet";
      const copyMethod = btn.dataset.copyMethod || null;
      const copyLabel = btn.dataset.copyLabel || btn.closest(".code-head")?.querySelector("span")?.textContent || null;
      const props = {
        slug,
        kind: copyKind,
        method: copyMethod,
        label: copyLabel,
        page: document.body.dataset.page,
        path: location.pathname,
        snippet: code.slice(0, 60),
      };
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = "Copied";
        btn.classList.add("is-done");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("is-done"); }, 1600);
        ph("mcpfilm_copy", props);
        if (copyKind === "connect") ph("mcpfilm_connect", props);
      } catch { /* clipboard unavailable */ }
    });
  }

  // ------------------------------------------------------------- ratings
  const rate = document.querySelector(".rate[data-slug]");
  if (rate) {
    const slug = rate.dataset.slug;
    const key = "mcpfilm:rated:" + slug;
    const starsEls = [...rate.querySelectorAll(".star")];
    const paint = (n) => starsEls.forEach((s, i) => s.classList.toggle("is-set", i < n));
    const prev = Number(localStorage.getItem(key) || 0);
    if (prev) { paint(prev); rate.classList.add("is-rated"); }

    starsEls.forEach((star) =>
      star.addEventListener("click", () => {
        const n = Number(star.dataset.star);
        paint(n);
        rate.classList.add("is-rated");
        const rerate = Boolean(localStorage.getItem(key));
        localStorage.setItem(key, String(n));
        ph("mcpfilm_rate", { slug, rating: n, rerate });
      }),
    );
  }

  // ------------------------------------------------------------ feedback
  const fb = document.querySelector(".feedback");
  if (fb) {
    fb.querySelector(".feedback-send")?.addEventListener("click", () => {
      const text = fb.querySelector("textarea")?.value.trim();
      if (!text) return;
      ph("mcpfilm_feedback", {
        slug: document.querySelector(".server")?.dataset.slug,
        text: text.slice(0, 2000),
      });
      fb.querySelector("textarea").value = "";
      fb.querySelector(".feedback-done").hidden = false;
    });
  }

  // ------------------------------------------------------------- polish
  // Functional micro-interactions only. Everything here is progressive
  // enhancement: the static HTML (what agents read) is complete without it.
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // header earns its hairline on scroll
  const head = document.querySelector(".site-head");
  if (head) {
    const onScroll = () => head.classList.toggle("is-scrolled", scrollY > 10);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // hero: pointer-reactive dot grid (fine pointers only, monochrome, faint)
  const canvas = document.querySelector(".hero-canvas");
  if (canvas && !reduced && matchMedia("(pointer: fine)").matches) {
    const g = canvas.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const GAP = 26, RADIUS = 130;
    let dots = [], px = -1e4, py = -1e4, raf = null;
    const draw = () => {
      raf = null;
      const w = canvas.width / dpr, h = canvas.height / dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = "#0d0d0d";
      for (const [x, y] of dots) {
        const t = Math.max(0, 1 - Math.hypot(x - px, y - py) / RADIUS);
        g.globalAlpha = 0.045 + t * 0.12;
        g.beginPath();
        g.arc(x, y, 1 + t * 0.6, 0, 7);
        g.fill();
      }
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const size = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      dots = [];
      for (let x = GAP / 2; x < r.width; x += GAP)
        for (let y = GAP / 2; y < r.height; y += GAP) dots.push([x, y]);
      queue();
    };
    addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientY > r.bottom + RADIUS) return;
      px = e.clientX - r.left;
      py = e.clientY - r.top;
      queue();
    }, { passive: true });
    addEventListener("resize", size, { passive: true });
    size();
  }

  // hero: ops ticker — real facts from the last build, gently rotating
  const ticker = document.querySelector(".hero-ticker[data-ticker]");
  if (ticker && !reduced) {
    try {
      const items = JSON.parse(ticker.dataset.ticker);
      const txt = ticker.querySelector(".tick-text");
      let i = 0;
      if (items.length > 1 && txt) {
        setInterval(() => {
          txt.classList.add("is-fading");
          setTimeout(() => {
            i = (i + 1) % items.length;
            txt.textContent = items[i];
            txt.classList.remove("is-fading");
          }, 360);
        }, 4200);
      }
    } catch { /* ticker stays static */ }
  }

  // directory rail: scrollspy (only while no category filter is active)
  if (sections.length && filters.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (activeCat) return;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = e.target.dataset.catSection;
        filters.forEach((b) => b.classList.toggle("is-spy", b.dataset.filter === id));
      }
    }, { rootMargin: "-15% 0px -75% 0px" });
    sections.forEach((s) => io.observe(s));
  }

  // ----------------------------------------------- impression analytics
  if ("IntersectionObserver" in window) {
    const seenServerImpressions = new WeakSet();
    const seenSponsorImpressions = new WeakSet();
    const impressionSource = (el) => el.closest("[data-track-section]")?.dataset.trackSection || null;

    const cardIo = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
        const card = entry.target;
        if (seenServerImpressions.has(card)) continue;
        seenServerImpressions.add(card);
        cardIo.unobserve(card);

        const href = card.getAttribute("href") || "";
        const slug = href.startsWith("/mcps/") ? href.split("/")[2] : null;
        if (!slug) continue;
        ph("mcpfilm_server_impression", {
          slug,
          source_section: impressionSource(card),
          category: card.dataset.cat || null,
          official: card.dataset.official === "true",
          remote: card.dataset.remote === "true",
          is_martini: slug === "martini",
          page: document.body.dataset.page,
          path: location.pathname,
        });
      }
    }, { threshold: [0.5] });

    document.querySelectorAll(".card[href^='/mcps/'], .card[href^=\"/mcps/\"]").forEach((card) => cardIo.observe(card));

    const sponsorIo = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.45) continue;
        const a = entry.target;
        if (seenSponsorImpressions.has(a)) continue;
        seenSponsorImpressions.add(a);
        sponsorIo.unobserve(a);
        ph("mcpfilm_sponsor_impression", {
          sponsor: a.dataset.sponsor || document.body.dataset.sponsor || "sponsor",
          placement: a.dataset.sponsorPlacement || "host-match",
          to: a.href,
          page: document.body.dataset.page,
          path: location.pathname,
          source_slug: currentServer?.slug || null,
          label: (a.textContent || "").trim().slice(0, 80),
        });
      }
    }, { threshold: [0.45] });

    document.querySelectorAll("[data-sponsor-click]").forEach((a) => sponsorIo.observe(a));
  }

  // --------------------------------------------- outbound + detail signal
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    const from = location.pathname;
    const to = a.href;
    const linkHost = normalizedHost(to);
    const isExternal = /^https?:\/\//.test(to) && linkHost && linkHost !== siteHost;
    if (isExternal) {
      const sponsor = a.dataset.sponsor || (hostMatches(linkHost, sponsorHost) ? document.body.dataset.sponsor : "");
      if (a.dataset.sponsorClick || sponsor) {
        ph("mcpfilm_sponsor_click", {
          sponsor: sponsor || document.body.dataset.sponsor || "sponsor",
          placement: a.dataset.sponsorPlacement || "host-match",
          to,
          from,
          page: document.body.dataset.page,
          source_slug: document.querySelector(".server")?.dataset.slug || null,
          label: (a.textContent || "").trim().slice(0, 80),
        });
      }
      ph("mcpfilm_outbound", { to, from });
    } else if (href.startsWith("/capabilities/") && href !== "/capabilities/") {
      const capability = href.split("/")[2]?.replace(/\.md$/, "") || null;
      if (capability) ph("mcpfilm_open_capability", { capability, from });
    } else if (href.startsWith("/playbooks/#")) {
      ph("mcpfilm_open_playbook", { playbook: href.split("#")[1], from });
    } else if (href.startsWith("/recommendations/#")) {
      ph("mcpfilm_open_recommendation", { recommendation: href.split("#")[1], from });
    } else if (href.startsWith("/mcps/")) {
      const slug = href.split("/")[2];
      const playbook = a.closest(".playbook")?.dataset.playbook || null;
      const playbookSection = a.closest("[data-playbook-section]")?.dataset.playbookSection || null;
      const playbookStage = a.closest("[data-playbook-stage]")?.dataset.playbookStage || null;
      const recommendation = a.closest(".recommendation")?.id || null;
      const sourceSection = a.closest("[data-track-section]")?.dataset.trackSection || null;
      ph("mcpfilm_open_server", {
        slug,
        from,
        source_section: sourceSection,
        playbook,
        playbook_section: playbookSection,
        playbook_stage: playbookStage,
        recommendation,
      });
      if (playbook) {
        ph("mcpfilm_playbook_server", {
          slug,
          playbook,
          section: playbookSection,
          stage: playbookStage,
        });
      }
      if (recommendation) {
        ph("mcpfilm_recommendation_server", { slug, recommendation });
      }
      if (sourceSection?.startsWith("capability:")) {
        ph("mcpfilm_capability_server", { slug, capability: sourceSection.slice("capability:".length) });
      }
    }
  });
})();
