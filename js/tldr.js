/*
 * tldr.js — the "TL;DR" button right above each project's title.
 *
 * Projects are separate pages shown in an iframe. Because they live on the same site, the portfolio
 * can add a small TL;DR button + summary box INTO the project page, just above its title (the first
 * <h1>) — without editing the project files, so every future project gets it automatically.
 * Clicking the button opens/closes the 3–4 sentence summary (the `tldr` field in js/projects.js)
 * plus the tools used, right there above the title. Esc also closes it.
 *
 * FLOATING: once the button has scrolled off the top, it floats at the top of the screen while the
 * visitor is still in the first 20% of the page (FLOAT_UNTIL). Clicking the floating button scrolls back
 * up and opens the summary. (Tyra's idea, Nov 2026.) If the project has its own bar pinned to the top
 * (e.g. Pharma's section menu), the button floats just below that bar so it never covers it.
 *
 * pill.js calls TLDR.fill(view, project) whenever a project is loaded into a view;
 * tldr-hint.js finds the button with TLDR.button(view).
 */
(function () {
  "use strict";

  const FONT_URL = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
  const FLOAT_UNTIL = 0.2;      // floating button only within the first 20% of the page
  const FLOAT_TOP = 12;         // px from the top of the screen while floating

  // Styles added to the project page (its own CSS doesn't know about the TL;DR box).
  // Everything is scoped under #ptldr so it can't change the project's own look.
  const STYLE = `
    #ptldr { margin: 0 0 16px; text-align: left; }
    #ptldr .ptldr-btn {
      display: inline-block; margin: 0; padding: 7px 10px;
      font: 9px/1 "Press Start 2P", ui-monospace, monospace; letter-spacing: 0; text-transform: none;
      color: #1c1917; background: #fff; border: 2px solid #1c1917; border-radius: 0;
      box-shadow: 3px 3px 0 #1c1917; cursor: pointer; transition: transform .1s, box-shadow .1s;
    }
    #ptldr .ptldr-btn:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 #1c1917; }
    #ptldr .ptldr-btn[aria-expanded="true"] { color: #fff; background: #1c1917; }
    #ptldr .ptldr-btn:focus-visible { outline: 2px solid #1c1917; outline-offset: 3px; }
    #ptldr .ptldr-panel {
      max-width: 680px; margin-top: 12px; padding: 14px 16px;
      font-size: 15px; line-height: 1.6; color: #1c1917; background: #fff;
      border: 2px solid #1c1917; box-shadow: 4px 4px 0 #1c1917;
      animation: ptldr-in .18s ease-out;
    }
    #ptldr .ptldr-panel[hidden] { display: none; }
    #ptldr p { margin: 0; font-style: normal; font-weight: 400; }   /* ignore the page's own header text styles */
    #ptldr .ptldr-tools { margin-top: 10px; font-size: 12px; color: #57606a; }
    #ptldr .ptldr-tool {
      display: inline-block; margin-left: 4px; padding: 3px 5px;
      font: 8px/1 "Press Start 2P", ui-monospace, monospace; color: #1c1917; border: 1px solid #1c1917;
    }
    @keyframes ptldr-in { from { opacity: 0; transform: translateY(-4px); } }
    /* floating at the top of the screen while scrolling the first 20% of the page */
    #ptldr .ptldr-btn.is-floating { position: fixed; z-index: 2147483000; animation: ptldr-drop .18s ease-out; }
    @keyframes ptldr-drop { from { opacity: 0; transform: translateY(-8px); } }
    /* used by the cursor hint (tldr-hint.js): pretend click + soft pulse */
    #ptldr .ptldr-btn.is-hint-pressed { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #1c1917; }
    #ptldr .ptldr-btn.is-hint-pulse { animation: ptldr-pulse .55s ease-in-out 3; }
    @keyframes ptldr-pulse {
      50% { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 #1c1917, 0 0 0 5px rgba(28, 25, 23, .15); }
    }`;

  // The project page inside a view (null if it can't be reached)
  function docOf(view) {
    const frame = view.querySelector("iframe");
    try { return frame && frame.contentDocument; } catch (e) { return null; }
  }

  // Add the button + summary box above the project's title
  function inject(view) {
    const p = view._tldrProject;
    const doc = docOf(view);
    if (!p || !p.tldr || !doc || doc.getElementById("ptldr")) return;
    const title = doc.querySelector("h1");
    if (!title) return;                                // no title found → no button

    if (!doc.getElementById("ptldr-style")) {
      const font = doc.createElement("link");
      font.rel = "stylesheet";
      font.href = FONT_URL;
      const style = doc.createElement("style");
      style.id = "ptldr-style";
      style.textContent = STYLE;
      doc.head.append(font, style);
    }

    const box = doc.createElement("div");
    box.id = "ptldr";
    box.innerHTML = `
      <button type="button" class="ptldr-btn" aria-expanded="false" aria-controls="ptldr-panel">TL;DR</button>
      <div class="ptldr-panel" id="ptldr-panel" role="region" aria-label="Project summary" hidden>
        <p class="ptldr-text"></p>
        <p class="ptldr-tools">Tools: ${p.tools.map((t) => `<span class="ptldr-tool">${t}</span>`).join(" ")}</p>
      </div>`;
    box.querySelector(".ptldr-text").textContent = p.tldr;
    title.parentNode.insertBefore(box, title);

    const btn = box.querySelector(".ptldr-btn");
    const panel = box.querySelector(".ptldr-panel");
    btn.addEventListener("click", () => {
      const wasFloating = btn.classList.contains("is-floating");
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      updateFloat();
      if (wasFloating) box.scrollIntoView({ block: "start", behavior: "smooth" });   // back up to the summary
      window.dispatchEvent(new CustomEvent("tldr:clicked"));   // tldr-hint.js: they found it
    });
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(view, false); });

    // ----- Floating: button scrolled off the top, still in the first 20% of the page, summary closed -----
    const win = doc.defaultView;
    // The project's own wide bars pinned to the top (sticky / fixed), found once
    const pinnedBars = [...doc.body.querySelectorAll("*")].filter((el) => {
      const pos = win.getComputedStyle(el).position;
      return (pos === "sticky" || pos === "fixed") && el.offsetWidth > win.innerWidth / 2;
    });
    // Where the floating button goes: FLOAT_TOP from the top, or just under a bar stuck at the top
    function floatTop() {
      let top = FLOAT_TOP;
      pinnedBars.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top <= 1 && r.bottom > 0 && r.bottom < win.innerHeight / 3) top = Math.max(top, r.bottom + 8);
      });
      return top;
    }
    function updateFloat() {
      const page = doc.scrollingElement || doc.documentElement;
      const home = box.getBoundingClientRect();              // where the button normally sits
      const float = home.top + btn.offsetHeight < 0 && win.scrollY < page.scrollHeight * FLOAT_UNTIL && panel.hidden;
      if (float) {
        btn.style.top = floatTop() + "px";
        btn.style.left = home.left + "px";
        if (!btn.classList.contains("is-floating")) {
          box.style.minHeight = btn.offsetHeight + "px";   // keep the space so the page doesn't jump
          btn.classList.add("is-floating");
        }
      } else if (btn.classList.contains("is-floating")) {
        btn.classList.remove("is-floating");
        btn.style.top = btn.style.left = box.style.minHeight = "";
      }
    }
    win.addEventListener("scroll", updateFloat, { passive: true });
    win.addEventListener("resize", updateFloat);
    view._tldrFloat = updateFloat;
  }

  function setOpen(view, open) {
    const doc = docOf(view);
    const box = doc && doc.getElementById("ptldr");
    if (!box) return;
    box.querySelector(".ptldr-panel").hidden = !open;
    box.querySelector(".ptldr-btn").setAttribute("aria-expanded", String(open));
    if (view._tldrFloat) view._tldrFloat();
  }

  function closeAll() {
    document.querySelectorAll(".project-view").forEach((v) => setOpen(v, false));
  }

  // Called by pill.js just before a project's page starts loading into a view
  function fill(view, project) {
    view._tldrProject = project;
    const frame = view.querySelector("iframe");
    if (frame && !frame._tldrHooked) {
      frame.addEventListener("load", () => inject(view));     // add the button once the page is there
      frame._tldrHooked = true;
    }
  }

  // The TL;DR button inside a view's project page (for tldr-hint.js)
  function button(view) {
    const doc = docOf(view);
    return doc ? doc.querySelector("#ptldr .ptldr-btn") : null;
  }

  window.TLDR = { fill, closeAll, button };
})();
