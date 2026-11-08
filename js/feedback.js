/*
 * feedback.js — the penguin "rate my portfolio" pop-up.
 *
 * When it pops up by itself (at most once per visit, never in the middle of a page change):
 *   1. After the visitor has opened a project and come back to About Me,
 *      or after ~90 seconds on the site (only counting time the tab is actually visible).
 *   2. Exit intent (laptop): the mouse leaves the page through the top, toward the tabs / close button.
 * Plus, any time: the small penguin button in the bottom-right corner.
 * (Closing a tab with Cmd+W / Cmd+Q can't be caught by any website — that's why 1 and the button exist.)
 *
 * Flow: rate 1–5 (5 = "When can you start?!") → "Any feedback?" → thank you.
 * One row per visitor is sent to FEEDBACK_URL: a Google Apps Script web app that adds
 * [date & time, rating, feedback, visit ID] to Tyra's private Google Sheet (setup/google-sheet-script.gs).
 * Ratings from Tyra's own devices (?me=1, see analytics.js) go to the "Me - feedback" tab instead.
 */
(function () {
  "use strict";

  // ===== Settings =====
  // The Google Apps Script "Web app" URL now lives in js/config.js (SHEET_URL). While it's empty
  // the pop-up still works, but nothing is saved (the rating just shows up in the browser console).
  const FEEDBACK_URL = (window.SITE_CONFIG && window.SITE_CONFIG.SHEET_URL) || "";
  const ASK_AFTER_SECONDS = 90;         // auto-ask after this much visible time on the site
  const AFTER_PROJECT_DELAY = 1200;     // ms to wait after coming back to About Me
  const MIN_SECONDS_FOR_EXIT = 8;       // don't exit-ask someone who only just arrived
  const TEXT = {
    autoAsk: "Before you go… On a scale of 1 to when-can-you-start, how likely are you to hire me?",
    buttonAsk: "Hi! On a scale of 1 to when-can-you-start, how likely are you to hire me?",
    write: "Any feedback?",
    thanks: "Thank you! You're awesome."
  };

  const modal = document.getElementById("feedback");
  const cornerBtn = document.getElementById("feedback-btn");
  if (!modal || !cornerBtn) return;

  const card = modal.querySelector(".fb-card");
  const bubbleText = modal.querySelector(".fb-bubble-text");
  const penguinPic = modal.querySelector(".fb-penguin");
  const textarea = modal.querySelector("#fb-text");
  const stepEls = [...modal.querySelectorAll(".fb-step")];

  // ----- Remember "already asked this visit" / "already rated" (storage may be blocked) -----
  const remember = {
    get(area, key) { try { return window[area].getItem(key); } catch (e) { return null; } },
    set(area, key) { try { window[area].setItem(key, "1"); } catch (e) { /* ignore */ } }
  };
  const alreadyAsked = () => remember.get("sessionStorage", "fb-asked") || remember.get("localStorage", "fb-rated");

  // ----- Penguin pictures (shared with penguin.js) -----
  function setPenguin(el, frame) {
    const f = window.Penguin && window.Penguin.frame && window.Penguin.frame(frame);
    if (f) el.style.backgroundImage = f.url;
  }
  setPenguin(cornerBtn.querySelector(".fb-mini-penguin"), "front");

  // ===== Open / close =====
  let rating = null;       // chosen rating (1–5), or null
  let sent = false;        // has this rating been sent yet?
  let lastFocus = null;
  let waveTimer = null;
  let closeTimer = null;

  const isOpen = () => modal.classList.contains("is-open");

  // Don't pop up over the sidebar or in the middle of a pill / penguin transition
  function busy() {
    const shown = (sel) => { const el = document.querySelector(sel); return el && getComputedStyle(el).display !== "none"; };
    return document.body.classList.contains("sidebar-open") || shown(".pill-stage") || shown(".penguin-stage");
  }

  function showStep(name, text) {
    stepEls.forEach((el) => (el.hidden = el.dataset.step !== name));
    bubbleText.textContent = text;
  }

  // auto = true when it pops up by itself (only once per visit)
  function open(auto) {
    if (isOpen()) return;
    if (auto) {
      if (alreadyAsked()) return;
      if (busy()) { setTimeout(() => open(true), 1000); return; }   // try again in a moment
      remember.set("sessionStorage", "fb-asked");
    }
    rating = null;
    sent = false;
    textarea.value = "";
    clearTimeout(closeTimer);
    setPenguin(penguinPic, "front");
    showStep("rate", auto ? TEXT.autoAsk : TEXT.buttonAsk);
    lastFocus = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    modal.querySelector(".fb-rate").focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen()) return;
    submit();                                   // rated but closed without sending? still save the rating
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    clearInterval(waveTimer);
    clearTimeout(closeTimer);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  // ===== The three steps =====
  modal.querySelectorAll(".fb-rate").forEach((btn) => {
    btn.addEventListener("click", () => {
      rating = Number(btn.dataset.rating);
      showStep("write", TEXT.write);
      textarea.focus({ preventScroll: true });
    });
  });

  function finish() {
    submit();
    showStep("thanks", TEXT.thanks);
    // little celebration: the penguin waves
    let up = false;
    waveTimer = setInterval(() => setPenguin(penguinPic, (up = !up) ? "wave1" : "wave2"), 120);
    closeTimer = setTimeout(close, 2400);
  }
  modal.querySelector(".fb-send").addEventListener("click", finish);
  modal.querySelector(".fb-skip").addEventListener("click", () => { textarea.value = ""; finish(); });

  // ===== Sending one row: rating + feedback (the sheet adds the date & time) =====
  function payload() {
    const a = window.Analytics || {};          // link the rating to the visit; Tyra's own → her own tab
    return new URLSearchParams({
      kind: "feedback", rating: String(rating), feedback: textarea.value.trim().slice(0, 2000),
      visit: a.visitId || "", me: a.isMe ? "1" : "0"
    });
  }

  function submit() {
    if (sent || rating === null) return;
    sent = true;
    remember.set("localStorage", "fb-rated");   // don't auto-ask this browser again
    if (!FEEDBACK_URL) {
      console.info("[feedback] Not saved yet — FEEDBACK_URL is empty.", Object.fromEntries(payload()));
      return;
    }
    // "no-cors": Google's answer can't be read, but the row still gets added
    fetch(FEEDBACK_URL, { method: "POST", mode: "no-cors", body: payload() }).catch(() => {});
  }

  // If they rated and then close the whole tab, still send it
  window.addEventListener("pagehide", () => {
    if (rating !== null && !sent && FEEDBACK_URL && navigator.sendBeacon) {
      sent = true;
      navigator.sendBeacon(FEEDBACK_URL, payload());
    }
  });

  // ===== Closing: X, clicking outside, Esc. Tab stays inside the pop-up while it's open. =====
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));
  document.addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "Tab") {
      const focusable = [...card.querySelectorAll("button, textarea")].filter((el) => !el.closest("[hidden]"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ===== Triggers =====
  cornerBtn.addEventListener("click", () => open(false));

  // 1a. Came back to About Me after looking at a project
  let visitedProject = /^#\/projects\//.test(location.hash);
  window.addEventListener("route:done", (e) => {
    if (e.detail.project) visitedProject = true;
    else if (visitedProject) setTimeout(() => open(true), AFTER_PROJECT_DELAY);
  });

  // 1b. ~90 seconds of actually looking at the site
  let seconds = 0;
  const clock = setInterval(() => {
    if (!document.hidden) seconds++;
    if (seconds >= ASK_AFTER_SECONDS) { clearInterval(clock); open(true); }
  }, 1000);

  // 2. Exit intent: mouse leaves through the top of the window (laptops/desktops only)
  if (window.matchMedia("(pointer: fine)").matches) {
    document.documentElement.addEventListener("mouseleave", (e) => {
      if (e.clientY <= 0 && seconds >= MIN_SECONDS_FOR_EXIT) open(true);
    });
  }

  // Let other scripts (or testing) open it
  window.Feedback = { open: () => open(false), close };
})();
