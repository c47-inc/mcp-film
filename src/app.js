/* mcp.film client behavior: search/filter, copy buttons, ratings & feedback.
   Progressive enhancement only — the site is fully usable without this file. */
(() => {
  const ph = (event, props) => {
    if (window.posthog?.capture) window.posthog.capture(event, props);
  };

  // pageview (autocapture is off; we send a single clean event)
  ph("mcpfilm_pageview", { path: location.pathname, page: document.body.dataset.page });

  // ------------------------------------------------------------- search
  const search = document.getElementById("search");
  const cards = [...document.querySelectorAll(".card[data-search]")];
  const sections = [...document.querySelectorAll("[data-cat-section]")];
  const noResults = document.getElementById("no-results");
  const filters = [...document.querySelectorAll(".chip-filter")];
  let activeCat = "";

  const applyFilter = () => {
    const q = (search?.value ?? "").trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const hit =
        (!q || card.dataset.search.includes(q)) &&
        (!activeCat || card.dataset.cat === activeCat);
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
      if (activeCat) ph("mcpfilm_filter", { category: activeCat });
    });
  }

  // -------------------------------------------------------- copy buttons
  for (const btn of document.querySelectorAll("[data-copy]")) {
    btn.addEventListener("click", async () => {
      const code = btn.closest(".code-block")?.querySelector("code")?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = "Copied";
        btn.classList.add("is-done");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("is-done"); }, 1600);
        ph("mcpfilm_copy", { slug: document.querySelector(".server")?.dataset.slug, snippet: code.slice(0, 60) });
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

  // --------------------------------------------- outbound + detail signal
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (href.startsWith("http") && !href.includes(location.hostname)) {
      ph("mcpfilm_outbound", { to: href, from: location.pathname });
    } else if (href.startsWith("/mcps/")) {
      ph("mcpfilm_open_server", { slug: href.split("/")[2] });
    }
  });
})();
