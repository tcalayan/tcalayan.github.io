/*
 * awesome.js — the "Learn more about my AWESOME projects" button.
 *
 * It pops in when the DNA animation finishes its first loop
 * (dna.js fires the "dna:firstloop" event). The animation keeps playing behind it.
 * Clicking it fires "sidebar:open" — sidebar.js listens for that and opens the sidebar.
 */
(function () {
  "use strict";

  const button = document.getElementById("awesome-btn");
  if (!button) return;

  function show() {
    if (button.classList.contains("is-visible")) return;
    button.classList.add("is-visible");
  }

  // Normal case: show after the first loop of the animation
  if (window.DNA && window.DNA.firstLoopDone) show();
  window.addEventListener("dna:firstloop", show);

  // Safety net: if the loop never finishes (paused, tab in background, scrolled away),
  // show the button anyway after a while
  const loopSeconds = window.DNA
    ? Object.values(window.DNA.settings.phases).reduce((a, b) => a + b, 0)
    : 13;
  setTimeout(show, (loopSeconds + 3) * 1000);

  button.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("sidebar:open"));
  });
})();
