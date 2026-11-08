/*
 * pill.js — switching pages + the dark → white pill transition.
 *
 * Pages ("routes") live in the URL hash, so the browser back button works
 * and every page has a shareable link:
 *   #/                    → About Me (the main page)
 *   #/projects/<slug>     → a project from js/projects.js, shown full-screen in an <iframe>
 *
 * Transitions:
 *   About → project:    pill pops in, spins, stops white-side-up, zooms into the white half
 *                       until the screen is white, then the project fades in.
 *   Project → project:  penguin runs across pulling the new project in from the left (penguin.js).
 *   Project → About:    penguin lassos the project and pulls it down to reveal About (penguin.js).
 *   Opening a project link directly: the project just fades in (no pill).
 *
 * There are TWO project views (A and B) so one project can slide in over the other.
 */
(function () {
  "use strict";

  const stage = document.getElementById("pill-stage");
  const pill = document.getElementById("pill");
  const pillBody = document.getElementById("pill-body");
  const views = [...document.querySelectorAll(".project-view")].map((el) => ({
    el, frame: el.querySelector("iframe"), slug: null, loaded: Promise.resolve()
  }));
  const aboutParts = [document.querySelector(".hero"), document.getElementById("about")];
  if (!stage || !pill || views.length < 2) return;

  let active = 0;                          // index of the view currently on screen
  const current = () => views[active];
  const spare = () => views[1 - active];

  const projects = window.PROJECTS || [];
  const SITE_TITLE = document.title;

  // ===== Settings =====
  const PILL = { w: 176, h: 64, px: 4 };   // pill size and pixel size (CSS px)
  const TIME = {                          // durations in milliseconds
    pop: 260, spin: 950, hold: 140, zoom: 650, fadeIn: 450,
    fadeOut: 300, unzoom: 600, unspin: 750, shrink: 220
  };

  // ===== Pixel-art capsule shape (a stair-stepped rounded rectangle) =====
  function capsulePolygon() {
    const { w, h, px } = PILL;
    const r = h / 2;
    const right = [], left = [];
    for (let y = 0; y < h; y += px) {
      const dy = Math.abs(r - (y + px / 2));
      const off = Math.round((r - Math.sqrt(r * r - dy * dy)) / px) * px;  // how far the round end cuts in
      right.push(`${w - off}px ${y}px`, `${w - off}px ${y + px}px`);   // right edge, going down
      left.unshift(`${off}px ${y + px}px`, `${off}px ${y}px`);         // left edge, going up
    }
    return `polygon(${right.concat(left).join(", ")})`;
  }

  pillBody.style.width = PILL.w + "px";
  pillBody.style.height = PILL.h + "px";
  pillBody.style.clipPath = capsulePolygon();

  // The flat middle part of the white half: we zoom into its center
  const whiteRect = { x: PILL.w / 2, width: PILL.w / 2 - PILL.h / 2 };
  const whiteOrigin = `${whiteRect.x + whiteRect.width / 2}px ${PILL.h / 2}px`;

  // How much to scale the pill so its white part covers the whole screen (+ a bit extra)
  const zoomScale = () => Math.max(innerWidth / whiteRect.width, innerHeight / PILL.h) * 1.3;

  // ===== Small helpers =====
  const animate = (el, frames, opts) => el.animate(frames, { fill: "both", ...opts }).finished;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function showStage(background) {
    stage.style.background = background;
    stage.style.opacity = "1";
    stage.style.display = "grid";
  }
  function hideStage() {
    stage.style.display = "none";
    pill.getAnimations().forEach((a) => a.cancel());
    stage.getAnimations().forEach((a) => a.cancel());
  }

  // ----- Pill moves -----
  function popIn() {
    pill.style.transformOrigin = "50% 50%";
    return animate(pill, [
      { transform: "scale(0)" }, { transform: "scale(1.12)", offset: 0.7 }, { transform: "scale(1)" }
    ], { duration: TIME.pop, easing: "ease-out" });
  }
  function popOut() {
    pill.style.transformOrigin = "50% 50%";
    return animate(pill, [{ transform: "scale(1)" }, { transform: "scale(0)" }],
      { duration: TIME.shrink, easing: "ease-in" });
  }
  // Three full turns that slow down, overshoot a little, and settle white-half-right
  function spin(direction = 1, duration = TIME.spin) {
    pill.style.transformOrigin = "50% 50%";
    return animate(pill, [
      { transform: "rotate(0deg)" },
      { transform: `rotate(${direction * 1100}deg)`, offset: 0.85 },
      { transform: `rotate(${direction * 1080}deg)` }
    ], { duration, easing: "cubic-bezier(0.25, 0.7, 0.3, 1)" });
  }
  // Zoom into the white half until the screen is white
  async function zoomIn() {
    pill.style.transformOrigin = whiteOrigin;
    await animate(pill, [{ transform: "scale(1)" }, { transform: `scale(${zoomScale()})` }],
      { duration: TIME.zoom, easing: "cubic-bezier(0.7, 0, 0.84, 0)" });   // speeds up = "diving in"
    stage.style.background = "#fff";
  }
  // (The three moves below are the old reverse-pill transition. Not used right now —
  //  the penguin does those transitions — but kept in case we switch back.)
  // Zoom back out of the white half (the screen behind shows through as it shrinks)
  function zoomOut(backgroundBehind) {
    stage.style.background = backgroundBehind;
    pill.style.transformOrigin = whiteOrigin;
    return animate(pill, [{ transform: `scale(${zoomScale()})` }, { transform: "scale(1)" }],
      { duration: TIME.unzoom, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }
  // Cover the project with white
  function fadeToWhite() {
    showStage("#fff");
    pill.style.transformOrigin = whiteOrigin;
    pill.animate([{ transform: `scale(${zoomScale()})` }], { fill: "both" });   // pill waits, zoomed in
    return animate(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: TIME.fadeOut, easing: "ease-in" });
  }

  // ===== Showing / hiding the project iframes =====
  // Load a project into a view (skipped if it's already there). Returns when loaded.
  function loadProject(v, p) {
    if (v.slug !== p.slug) {
      v.slug = p.slug;
      v.frame.title = p.title;
      v.el.querySelector(".project-path").textContent = `/projects/${p.slug}`;
      if (window.TLDR) window.TLDR.fill(v.el, p);      // the TL;DR summary for this project
      v.loaded = new Promise((resolve) => {
        v.frame.addEventListener("load", resolve, { once: true });
        setTimeout(resolve, 4000);             // don't wait forever on a slow load
      });
      v.frame.src = p.path;
    }
    return v.loaded;
  }

  // Fade the current view in with project p
  async function showProject(p, withFade = true) {
    const v = current();
    loadProject(v, p);
    v.el.classList.add("is-visible");
    v.el.style.opacity = "0";
    setAboutCovered(true);
    document.title = `${p.title} · ${SITE_TITLE}`;
    await v.loaded;
    if (withFade) await animate(v.el, [{ opacity: 0 }, { opacity: 1 }], { duration: TIME.fadeIn, easing: "ease-out" });
    v.el.getAnimations().forEach((a) => a.cancel());
    v.el.style.opacity = "1";
  }

  function hideView(v) {
    if (window.TLDR) window.TLDR.closeAll();
    v.el.classList.remove("is-visible", "is-incoming");
    v.el.style.opacity = "0";
  }

  function hideProject() {
    hideView(current());
    setAboutCovered(false);
    document.title = SITE_TITLE;
  }

  // While a project is shown, the About page underneath is paused and can't be tabbed into
  function setAboutCovered(covered) {
    aboutParts.forEach((el) => el && (el.inert = covered));
    if (window.DNA && window.DNA.setCovered) window.DNA.setCovered(covered);
  }

  // ===== The transitions =====
  async function aboutToProject(p) {
    loadProject(current(), p);      // start loading now, while the pill spins
    showStage("transparent");
    await popIn();
    await spin(1);
    await wait(TIME.hold);
    await zoomIn();
    await showProject(p);
    hideStage();
  }

  // Penguin lassos the project and pulls it down, revealing About underneath
  async function projectToAbout() {
    setAboutCovered(false);         // wake the About page up so it's alive as it's revealed
    await window.Penguin.lassoDown(current().el);
    hideProject();
  }

  // Penguin pulls the new project in from the left, over the old one
  async function projectToProject(p) {
    const next = spare();
    await loadProject(next, p);     // load first, so it doesn't arrive blank
    next.el.style.transform = "translateX(-100%)";   // start off-screen left, then show
    next.el.classList.add("is-visible", "is-incoming");
    next.el.style.opacity = "1";
    document.title = `${p.title} · ${SITE_TITLE}`;
    await window.Penguin.pullAcross(next.el);
    hideView(current());
    next.el.classList.remove("is-incoming");
    active = 1 - active;
  }

  // ===== Routing =====
  // Returns the project for the current URL, or null for About Me
  function routeTarget() {
    const match = location.hash.match(/^#\/projects\/([\w-]+)\/?$/);
    if (match) {
      const p = projects.find((x) => x.slug === match[1]);
      if (p) return p;
    }
    // unknown address → quietly switch the URL to About Me
    if (location.hash && location.hash !== "#/") history.replaceState(null, "", "#/");
    return null;
  }

  let shown;                        // what's on screen now: a project object, or null for About
  let queue = Promise.resolve();    // transitions run one after another, never overlapping

  async function go() {
    const target = routeTarget();
    if (target === shown) return;
    const from = shown;
    shown = target;
    if (target && !from) await aboutToProject(target);
    else if (!target && from) await projectToAbout();
    else await projectToProject(target);
    // Tell other scripts (feedback.js) that the page change is finished
    window.dispatchEvent(new CustomEvent("route:done", { detail: { project: target ? target.slug : null } }));
  }

  window.addEventListener("hashchange", () => {
    queue = queue.then(go).catch((err) => { console.error(err); hideStage(); });
  });

  // First load: a direct project link just fades in, no pill
  shown = routeTarget();
  if (shown) showProject(shown).then(() =>
    window.dispatchEvent(new CustomEvent("route:done", { detail: { project: shown.slug } })));   // e.g. TL;DR hint
})();
