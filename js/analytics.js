/*
 * analytics.js — anonymous visit stats, saved as ONE ROW PER VISIT in Tyra's Google Sheet.
 *
 * What a row says: new or returning visitor, phone or laptop, where they came from, active time on
 * the site, the first thing they clicked (+ all clicks in order), which projects they opened, and per
 * project: time spent, how far they scrolled, whether they opened the TL;DR, and a "read or skim?" guess.
 *
 * No names, no IP addresses, no ad cookies. A visitor only gets a random ID (kept in their browser)
 * so returning visitors can be recognized.
 *
 * TYRA'S OWN VISITS: open the site once on each of your devices with  ?me=1  at the end of the address
 * (e.g. https://tcalayan.github.io/?me=1). That browser then remembers it's you, and its visits go to the
 * "Me - visits" tab instead of "Visitors" (and don't count in site_visits). Undo with  ?me=0 .
 *
 * TIP: links you share can say where people came from, e.g. https://tcalayan.github.io/?from=linkedin
 * or ?from=resume — that shows up in the "Came from" column.
 *
 * Sending: a first "hello" when the visit starts (its answer is the site_visits number), then an update
 * every 30 s while something changed, and a last one when the tab is hidden/closed. Each update REPLACES
 * the visit's row (matched by Visit ID), so one visit = one row. If a tab is closed very fast (mostly
 * phones) the last few seconds can be lost.
 */
(function () {
  "use strict";

  // ===== Settings =====
  const SHEET_URL = (window.SITE_CONFIG && window.SITE_CONFIG.SHEET_URL) || "";
  const IDLE_SECONDS = 120;       // no mouse / keys / scroll / touch this long → stop counting time (walked away)
  const SEND_EVERY = 30;          // seconds between updates (only sent if something changed)
  const HELLO_AFTER = 1500;       // ms after load: first row + get the visit counter
  const MAX_CLICKS = 25;          // how many clicks to keep per visit
  // "read or skim?" guess per project:
  const READ_MIN_SECONDS = 60;    // read it = at least this long on the project…
  const READ_MIN_SCROLL = 60;     // …and scrolled at least this % of the page
  const TLDR_ONLY_MAX_SCROLL = 30; // TL;DR only = opened TL;DR but scrolled less than this %
  const BOUNCE_SECONDS = 10;      // less than this = "left right away"

  const projects = window.PROJECTS || [];
  const shortName = (p) => p.title.replace(/\s*Project$/i, "");      // "Pharma Sales Project" → "Pharma Sales"

  // ----- Browser storage (can be blocked → just don't remember) -----
  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); } catch (e) { /* ignore */ } },
    del(area, k) { try { window[area].removeItem(k); } catch (e) { /* ignore */ } }
  };
  const randomId = (prefix) => prefix + Math.random().toString(36).slice(2, 10);

  // ===== 1. Is this Tyra?  (?me=1 / ?me=0, then removed from the address bar) =====
  const params = new URLSearchParams(location.search);
  if (params.has("me")) {
    if (params.get("me") === "0") store.del("localStorage", "portfolioIsMe");
    else store.set("localStorage", "portfolioIsMe", "1");
    params.delete("me");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  }
  const isMe = store.get("localStorage", "portfolioIsMe") === "1";

  // ===== 2. Visitor + visit =====
  let visitorId = store.get("localStorage", "portfolioVisitor");
  if (!visitorId) { visitorId = randomId("v_"); store.set("localStorage", "portfolioVisitor", visitorId); }

  // A visit = one browser tab session (a page refresh continues the same visit / row)
  let visit = null;
  try { visit = JSON.parse(store.get("sessionStorage", "portfolioVisit")); } catch (e) { visit = null; }
  if (!visit || !visit.id) {
    const count = Number(store.get("localStorage", "portfolioVisitCount") || 0) + 1;
    store.set("localStorage", "portfolioVisitCount", String(count));
    visit = {
      id: randomId("visit_"),
      number: count,                 // 1 = first visit from this browser
      from: cameFrom(),
      device: device(),
      seconds: 0,                    // active seconds on the site
      clicks: [],                    // labels, in order
      opened: [],                    // project slugs, in order of opening
      projects: {},                  // slug → { sec, scroll, tldr }
      contacts: []                   // LinkedIn / GitHub / Email
    };
  }
  let changed = true;
  const save = () => { changed = true; store.set("sessionStorage", "portfolioVisit", JSON.stringify(visit)); };

  function cameFrom() {
    const tag = params.get("from") || params.get("utm_source");
    if (tag) return tag.slice(0, 40);
    let host = "";
    try { host = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) { host = ""; }
    if (!host) return "direct (typed, bookmark or app)";
    if (host === location.hostname) return "this site";
    const known = [[/linkedin|lnkd\.in/, "LinkedIn"], [/github/, "GitHub"], [/google\./, "Google"],
      [/bing\./, "Bing"], [/(^|\.)t\.co$|twitter|(^|\.)x\.com$/, "X / Twitter"], [/facebook|fb\./, "Facebook"],
      [/mail\.|outlook/, "Email"]];
    const hit = known.find(([re]) => re.test(host));
    return hit ? hit[1] : host;
  }

  function device() {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = Math.min(screen.width, screen.height) < 600;
    const kind = coarse ? (small ? "phone" : "tablet") : "laptop / desktop";
    return `${kind} (${screen.width}×${screen.height})`;
  }

  // ===== 3. Which project is on screen right now (null = About Me) =====
  function currentSlug() {
    const m = location.hash.match(/^#\/projects\/([\w-]+)/);
    return m && projects.some((p) => p.slug === m[1]) ? m[1] : null;
  }
  function projectData(slug) {
    if (!visit.projects[slug]) visit.projects[slug] = { sec: 0, scroll: 0, tldr: false };
    return visit.projects[slug];
  }
  function noteOpened(slug) {
    if (!slug) return;
    projectData(slug);
    if (visit.opened[visit.opened.length - 1] !== slug) { visit.opened.push(slug); save(); }
  }
  noteOpened(currentSlug());                              // came in through a project link
  window.addEventListener("hashchange", () => noteOpened(currentSlug()));

  // ===== 4. Active time (visible tab + did something in the last 2 minutes) =====
  let lastActive = Date.now();
  const markActive = () => { lastActive = Date.now(); };
  ["pointermove", "pointerdown", "keydown", "scroll", "wheel", "touchstart"].forEach((type) =>
    window.addEventListener(type, markActive, { passive: true, capture: true }));

  const measurers = {};                 // slug → re-measure scroll depth (filled in by hookFrame below)
  setInterval(() => {
    if (document.hidden || Date.now() - lastActive > IDLE_SECONDS * 1000) return;
    visit.seconds++;
    const slug = currentSlug();
    if (slug) {
      projectData(slug).sec++;
      if (measurers[slug]) measurers[slug]();    // the first screenful counts too, once it's really shown
    }
    save();
  }, 1000);

  // ===== 5. Clicks =====
  function addClick(label) {
    if (!label) return;
    if (visit.clicks.length < MAX_CLICKS) visit.clicks.push(label);
    save();
  }
  function contact(name) {
    if (!visit.contacts.includes(name)) visit.contacts.push(name);
    return name;
  }
  const shortText = (el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);

  // Clicks on the portfolio page itself
  function labelMain(t) {
    if (t.closest(".feedback")) return null;                   // inside the rating pop-up (ratings have their own tab)
    if (t.closest("#awesome-btn")) return "AWESOME projects button";
    if (t.closest("#menu-btn")) return "☰ menu";
    if (t.closest("#sidebar-close, #sidebar-backdrop")) return "closed menu";
    const nav = t.closest(".nav-link");
    if (nav) return "menu → " + shortText(nav.querySelector(".nav-title") || nav);
    const link = t.closest(".links a");
    if (link) {
      const h = link.getAttribute("href") || "";
      return contact(/linkedin/.test(h) ? "LinkedIn" : /github/.test(h) ? "GitHub" : /^mailto:/.test(h) ? "Email" : shortText(link));
    }
    if (t.closest("#feedback-btn")) return "penguin (rate me)";
    if (t.closest("#motion-toggle")) return "pause/play animation";
    const other = t.closest("a, button");
    return other ? "other: " + shortText(other) : null;        // clicks on empty space aren't counted
  }
  document.addEventListener("click", (e) => addClick(labelMain(e.target)), true);

  // Clicks + scrolling inside a project page (the iframes; same site, so we can listen in)
  function slugOfFrame(frame) {
    let href = "";
    try { href = frame.contentWindow.location.href.split("#")[0]; } catch (e) { return null; }
    const p = projects.find((x) => new URL(x.path, location.href).href === href);
    return p ? p.slug : null;
  }

  function hookFrame(frame) {
    const slug = slugOfFrame(frame);
    let win, doc;
    try { win = frame.contentWindow; doc = frame.contentDocument; } catch (e) { return; }
    if (!slug || !doc) return;
    const name = shortName(projects.find((p) => p.slug === slug));

    ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach((type) =>
      doc.addEventListener(type, markActive, { passive: true, capture: true }));

    // How far down they got (% of the page that has been on screen)
    const measure = () => {
      const el = doc.scrollingElement || doc.documentElement;
      if (!el || !el.scrollHeight || !frame.closest(".is-visible")) return;   // hidden view → not on screen
      const pct = Math.min(100, Math.round(((win.scrollY + win.innerHeight) / el.scrollHeight) * 100));
      const d = projectData(slug);
      if (pct > d.scroll) { d.scroll = pct; save(); }
    };
    win.addEventListener("scroll", () => { markActive(); measure(); }, { passive: true });
    measurers[slug] = measure;

    doc.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest("#ptldr .ptldr-btn")) { projectData(slug).tldr = true; return addClick(`TL;DR (${name})`); }
      const a = t.closest("a, button, summary");
      if (a) addClick(`in ${name}: ` + shortText(a));
    }, true);
  }
  document.querySelectorAll(".project-view iframe").forEach((frame) => {
    frame.addEventListener("load", () => hookFrame(frame));
    hookFrame(frame);                                            // in case it already loaded
  });

  // ===== 6. The row sent to the sheet (column name → value) =====
  function readGuess(d) {
    if (d.sec < BOUNCE_SECONDS) return "left right away";
    if (d.sec >= READ_MIN_SECONDS && d.scroll >= READ_MIN_SCROLL) return "read it";
    if (d.tldr && d.scroll < TLDR_ONLY_MAX_SCROLL) return "TL;DR only";
    return "skimmed";
  }
  const nameOf = (slug) => { const p = projects.find((x) => x.slug === slug); return p ? shortName(p) : slug; };
  const minSec = (s) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;

  function row() {
    const r = {
      "Visit ID": visit.id,
      "Visitor ID": visitorId,
      "New or returning": visit.number === 1 ? "new" : `returning (visit #${visit.number})`,
      "Device": visit.device,
      "Came from": visit.from,
      "Time on site": minSec(visit.seconds),
      "Time on site (sec)": visit.seconds,
      "First click": visit.clicks[0] || "(no clicks)",
      "Clicks in order": visit.clicks.join(" → "),
      "Projects opened": visit.opened.map(nameOf).join(" → ") || "(none)",
      "Contact links clicked": visit.contacts.join(", ")
    };
    projects.forEach((p) => {                 // every project gets its columns, even if not opened
      const d = visit.projects[p.slug];
      const n = shortName(p);
      r[`${n}: time (sec)`] = d ? d.sec : "";
      r[`${n}: scrolled %`] = d ? d.scroll : "";
      r[`${n}: TL;DR opened`] = d ? (d.tldr ? "yes" : "no") : "";
      r[`${n}: read or skim?`] = d ? readGuess(d) : "";
    });
    return r;
  }

  // ===== 7. Sending =====
  const body = () => new URLSearchParams({ kind: "visit", me: isMe ? "1" : "0", data: JSON.stringify(row()) });

  function send(closing) {
    if (!changed) return;
    changed = false;
    if (!SHEET_URL) { console.debug("[analytics] not saved (SHEET_URL is empty)", row()); return; }
    if (closing && navigator.sendBeacon) navigator.sendBeacon(SHEET_URL, body());
    else fetch(SHEET_URL, { method: "POST", mode: "no-cors", body: body(), keepalive: true }).catch(() => {});
  }

  // First hello: saves the row AND answers with the visit count for the About Me panel
  setTimeout(() => {
    changed = false;
    if (!SHEET_URL) { console.debug("[analytics] not saved (SHEET_URL is empty)", row()); return; }
    fetch(SHEET_URL + "?" + body().toString())
      .then((res) => res.json())
      .then((answer) => showVisits(answer && answer.visits))
      .catch(() => {});
  }, HELLO_AFTER);

  setInterval(() => send(false), SEND_EVERY * 1000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) send(true); });
  window.addEventListener("pagehide", () => send(true));

  // ===== 8. "site_visits": N  in the About Me panel (visitors only, never Tyra) =====
  function showVisits(n) {
    const box = document.getElementById("site-visits");
    if (!box || typeof n !== "number" || n < 1) return;
    box.querySelector(".visits-num").textContent = n.toLocaleString("en-US");
    box.hidden = false;
  }

  // For feedback.js (ratings are linked to the visit) and for testing
  window.Analytics = { visitId: visit.id, isMe, row };
})();
