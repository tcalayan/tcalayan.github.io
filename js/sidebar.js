/*
 * sidebar.js — the slide-in menu on the left.
 *
 * Opens with:  the ☰ button (top-left), or the "sidebar:open" event (the AWESOME button).
 * Closes with: the X button, clicking outside it, the Esc key, or picking a link.
 *
 * The project list is built from window.PROJECTS (js/projects.js), so adding a
 * project there adds it here automatically.
 * The link for the page you're on is highlighted (aria-current="page").
 */
(function () {
  "use strict";

  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const menuBtn = document.getElementById("menu-btn");
  const closeBtn = document.getElementById("sidebar-close");
  const list = document.getElementById("project-list");
  const count = document.getElementById("project-count");
  if (!sidebar || !menuBtn) return;

  const projects = window.PROJECTS || [];

  // ----- Build the project list from projects.js -----
  list.innerHTML = projects.map((p) => `
    <li>
      <a class="nav-link" href="#/projects/${p.slug}" data-route="/projects/${p.slug}">
        <span class="method method-get">GET</span>
        <span class="nav-text">
          <span class="nav-title">${p.title}</span>
          <span class="nav-tagline">${p.tagline}</span>
        </span>
        <span class="nav-tools">${p.tools.map((t) => `<span class="nav-tool" data-tool="${t}">${t}</span>`).join("")}</span>
      </a>
    </li>`).join("");

  count.textContent = `${projects.length} project${projects.length === 1 ? "" : "s"}`;

  // ----- Open / close -----
  let lastFocus = null;   // where focus was before opening, so we can put it back

  function open() {
    if (sidebar.classList.contains("is-open")) return;
    lastFocus = document.activeElement;
    sidebar.classList.add("is-open");
    backdrop.classList.add("is-open");
    document.body.classList.add("sidebar-open");
    menuBtn.setAttribute("aria-expanded", "true");
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!sidebar.classList.contains("is-open")) return;
    sidebar.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.body.classList.remove("sidebar-open");
    menuBtn.setAttribute("aria-expanded", "false");
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  menuBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  window.addEventListener("sidebar:open", open);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  // Picking a link closes the menu (the page change itself is handled by pill.js)
  sidebar.addEventListener("click", (e) => {
    if (e.target.closest(".nav-link")) {
      lastFocus = null;   // don't jump focus back to the AWESOME / ☰ button
      close();
    }
  });

  // ----- Highlight the current page -----
  function currentRoute() {
    const route = location.hash.replace(/^#/, "");
    return route === "" ? "/" : route;
  }

  function highlight() {
    const links = sidebar.querySelectorAll(".nav-link");
    let route = currentRoute();
    // unknown address (pill.js sends those to About Me) → highlight About Me
    if (![...links].some((a) => a.dataset.route === route)) route = "/";
    links.forEach((a) => {
      if (a.dataset.route === route) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  window.addEventListener("hashchange", highlight);
  highlight();

  // Let other scripts open/close it too
  window.Sidebar = { open, close };
})();
