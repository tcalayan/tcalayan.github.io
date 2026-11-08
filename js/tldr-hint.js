/*
 * tldr-hint.js — a little pixel mouse-cursor that shows visitors the TL;DR button.
 *
 * When:  0.6 s after the first project of a visit has finished opening (pill.js fires "route:done").
 * What:  a black & white pixel arrow pops in (upper middle-right; middle of the screen on phones),
 *        glides to the TL;DR button (above the project's title, inside its page — see tldr.js), "clicks" it twice (button looks pressed + a pixel ring),
 *        says "psst… TL;DR", fades away — then the button pulses softly 3 times (≈ 3.5 s in total).
 *        It only pretends to click: the summary panel is NOT opened.
 * Rules: only ONCE per visit (sessionStorage), and never again once the visitor has clicked
 *        TL;DR themselves (localStorage). Any click / tap / key / scroll / sidebar / page change
 *        stops it at once. The hint layer has pointer-events: none, so it never blocks clicks.
 * Styles: css/style.css (search "TL;DR hint").
 */
(function () {
  "use strict";

  // ===== Settings =====
  const TIME = {            // milliseconds
    delay: 600,             // wait after the page change is done
    popIn: 200,             // cursor appears
    glide: 800,             // cursor moves to the button
    press: 120, release: 150, betweenTaps: 80,   // each "click"
    linger: 150,            // short pause after the 2nd click
    fadeOut: 400,           // cursor + label fade away
    pulse: 550, pulses: 3   // then the button pulses softly this many times
  };
  const SCALE = 2;          // one sprite pixel = 2 screen pixels (arrow ≈ 22 × 34 px)
  const SHOWN_KEY = "tldrHintShown";       // sessionStorage: hint already played this visit
  const CLICKED_KEY = "tldrClicked";       // localStorage: visitor found TL;DR by themselves

  // ===== Pixel arrow (11 × 17). K = black outline, W = white. The tip is the top-left pixel =====
  const COLORS = { K: "#14171c", W: "#ffffff" };
  const ARROW = [
    "K..........",
    "KK.........",
    "KWK........",
    "KWWK.......",
    "KWWWK......",
    "KWWWWK.....",
    "KWWWWWK....",
    "KWWWWWWK...",
    "KWWWWWWWK..",
    "KWWWWWWWWK.",
    "KWWWWWKKKKK",
    "KWWKWWK....",
    "KWK.KWWK...",
    "KK..KWWK...",
    "K....KWWK..",
    ".....KWWK..",
    "......KK..."
  ];

  // Turn the pixel map into a tiny image (same trick as penguin.js)
  function arrowURL() {
    const c = document.createElement("canvas");
    c.width = ARROW[0].length;
    c.height = ARROW.length;
    const g = c.getContext("2d");
    ARROW.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!COLORS[ch]) return;
      g.fillStyle = COLORS[ch];
      g.fillRect(x, y, 1, 1);
    }));
    return `url(${c.toDataURL()})`;
  }

  // ===== Remember things (storage can be blocked, e.g. private windows → just carry on) =====
  function getFlag(store, key) { try { return store.getItem(key) === "1"; } catch (e) { return false; } }
  function setFlag(store, key) { try { store.setItem(key, "1"); } catch (e) { /* ignore */ } }

  // The visitor clicked TL;DR themselves → they know it's there, no more hints (tldr.js sends this)
  window.addEventListener("tldr:clicked", () => setFlag(localStorage, CLICKED_KEY));

  // The button sits inside the project page (an iframe): add the iframe's position to get
  // where it is on THIS page
  function buttonBox(view, btn) {
    const f = view.querySelector("iframe").getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    return { left: f.left + b.left, top: f.top + b.top, width: b.width, height: b.height };
  }

  // Don't start over the sidebar or in the middle of a pill / penguin transition (like feedback.js)
  function busy() {
    const shown = (sel) => { const el = document.querySelector(sel); return el && getComputedStyle(el).display !== "none"; };
    return document.body.classList.contains("sidebar-open") || shown(".pill-stage") || shown(".penguin-stage");
  }

  // ===== Playing the hint =====
  let running = null;       // { layer, btn, timers } while the hint plays, else null
  let startTimer = null;

  const STOP_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "resize", "blur", "hashchange", "sidebar:open"];

  // Any of these stops the hint. ("blur" = the page lost focus, e.g. a click inside the project's
  // iframe; focus moving between buttons on this page also sends "blur", so that one is ignored.)
  function onStopEvent(e) {
    if (e.type === "blur" && e.target !== window) return;
    cancel();
  }

  // Stop everything right away and tidy up
  function cancel() {
    clearTimeout(startTimer);
    if (!running) return;
    running.timers.forEach(clearTimeout);
    running.layer.remove();
    running.btn.classList.remove("is-hint-pressed", "is-hint-pulse");
    running = null;
    STOP_EVENTS.forEach((type) => window.removeEventListener(type, onStopEvent, true));
  }

  function play() {
    if (running || busy() || getFlag(sessionStorage, SHOWN_KEY) || getFlag(localStorage, CLICKED_KEY)) return;
    const view = document.querySelector(".project-view.is-visible");
    const btn = view && window.TLDR && window.TLDR.button(view);
    if (!btn || btn.getAttribute("aria-expanded") === "true") return;
    const box = buttonBox(view, btn);
    if (!box.width || box.top > window.innerHeight - 20) return;   // not on screen → skip
    setFlag(sessionStorage, SHOWN_KEY);          // once per visit, even if it gets cancelled

    // Build: a layer over everything (but under the sidebar), the cursor, its label, a ring
    const layer = document.createElement("div");
    layer.className = "tldr-hint-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML =
      '<div class="tldr-hint-cursor"><span class="tldr-hint-arrow"></span>' +
      '<span class="tldr-hint-label">psst… TL;DR</span></div>';
    document.body.appendChild(layer);
    const cursor = layer.querySelector(".tldr-hint-cursor");
    const arrow = layer.querySelector(".tldr-hint-arrow");
    const label = layer.querySelector(".tldr-hint-label");
    arrow.style.backgroundImage = arrowURL();
    arrow.style.width = ARROW[0].length * SCALE + "px";
    arrow.style.height = ARROW.length * SCALE + "px";

    running = { layer, btn, view, timers: [] };
    STOP_EVENTS.forEach((type) => window.addEventListener(type, onStopEvent, true));
    const at = (ms, fn) => running.timers.push(setTimeout(fn, ms));

    // Where to start (upper middle-right; middle of the screen on small screens) and end (on the button)
    const W = window.innerWidth, H = window.innerHeight;
    const small = W <= 760;
    const from = { x: W * (small ? 0.5 : 0.62), y: H * (small ? 0.5 : 0.4) };
    const to = { x: box.left + box.width * 0.55, y: box.top + box.height * 0.6 };
    // near the left edge (e.g. phones): put the "psst" label to the right of the cursor instead
    if (to.x < 160) { label.style.right = "auto"; label.style.left = "14px"; }
    // a point a bit off the straight line (up / to the left), so the path is a gentle curve
    const mid = { x: (from.x + to.x) / 2 + (to.y - from.y) * 0.25, y: (from.y + to.y) / 2 - (to.x - from.x) * 0.12 };
    const move = (p) => `translate(${p.x}px, ${p.y}px)`;

    // 1. pop in
    cursor.style.transform = move(from);
    arrow.animate([{ opacity: 0, transform: "scale(0.5)" }, { opacity: 1, transform: "scale(1)" }],
      { duration: TIME.popIn, easing: "cubic-bezier(.3, 1.6, .6, 1)" });

    // 2. glide along the curve to the button (eased: slow start, slow finish)
    let t = TIME.popIn;
    at(t, () => {
      cursor.animate([{ transform: move(from) }, { transform: move(mid), offset: 0.5 }, { transform: move(to) }],
        { duration: TIME.glide, easing: "cubic-bezier(.55, 0, .25, 1)", fill: "forwards" });
    });
    t += TIME.glide;
    at(t, () => label.classList.add("is-shown"));

    // 3. two little "clicks": cursor dips, button looks pressed, pixel ring around the button
    for (let i = 0; i < 2; i++) {
      t += TIME.betweenTaps;
      at(t, () => {
        arrow.animate([{ transform: "scale(1)" }, { transform: "translate(1px, 2px) scale(0.85)" }, { transform: "scale(1)" }],
          { duration: TIME.press + TIME.release, easing: "ease-out" });
        btn.classList.add("is-hint-pressed");
        ring(layer, buttonBox(running.view, btn));
      });
      t += TIME.press;
      at(t, () => btn.classList.remove("is-hint-pressed"));
      t += TIME.release;
    }

    // 4. cursor + label fade away, the button starts pulsing
    t += TIME.linger;
    at(t, () => {
      cursor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TIME.fadeOut, fill: "forwards" });
      btn.classList.add("is-hint-pulse");
    });
    // 5. all done → tidy up
    at(Math.max(t + TIME.fadeOut, t + TIME.pulse * TIME.pulses), cancel);
  }

  // A square pixel ring that grows out of the button in little steps and fades
  function ring(layer, box) {
    const r = document.createElement("div");
    r.className = "tldr-hint-ring";
    const gap = 4;                         // start just outside the button's border
    Object.assign(r.style, {
      left: box.left - gap + "px", top: box.top - gap + "px",
      width: box.width + gap * 2 + "px", height: box.height + gap * 2 + "px"
    });
    layer.appendChild(r);
    r.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.3, 1.7)", opacity: 0 }],
      { duration: 420, easing: "steps(4, end)", fill: "forwards" });
  }

  // Start it after a project has finished opening (never mid-transition)
  window.addEventListener("route:done", (e) => {
    cancel();
    if (!e.detail || !e.detail.project) return;
    startTimer = setTimeout(play, TIME.delay);
  });
})();
