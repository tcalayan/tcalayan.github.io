/*
 * dna.js — the pixel-art DNA animation in the top half of the page.
 *
 * One loop (about 14 seconds) has five phases:
 *   1. rotate      – a horizontal double helix spins in place
 *   2. unravel     – the strands pull apart and the base pairs break into pieces
 *   3. fly         – the pieces fly out and turn into characters
 *   4. code        – the characters are falling SQL snippets + A/T/C/G "rain"
 *   5. reassemble  – everything flies back and becomes the helix again
 * ...and then it loops forever.
 *
 * How it looks pixelated: we draw on a SMALL canvas (low resolution) and CSS
 * scales it up with `image-rendering: pixelated`, so every pixel is a crisp block.
 *
 * When the FIRST loop finishes, it fires a "dna:firstloop" event on window
 * (the AWESOME button listens for it). window.DNA.firstLoopDone is also set.
 */
(function () {
  "use strict";

  // ===== Settings — tweak these to change the feel =====
  const SETTINGS = {
    spinSpeed: 1.8,     // helix rotation speed (radians per second)
    wavelength: 64,     // pixels for one full twist of the helix
    rungSpacing: 6,     // pixels between base pairs
    amplitude: 0.27,    // helix height, as a share of the strip height
    snippetShare: 0.7,  // share of pieces that become SQL text (the rest = A/T/C/G rain)
    snippetFall: 5,     // how fast the SQL lines drift down (pixels per second)

    // Length of each phase in seconds (in this order)
    phases: { rotate: 2.5, unravel: 2.0, fly: 1.2, code: 4.5, reassemble: 2.5 },

    // The unravel "burst": a smooth start, a sudden steep break-apart, a smooth finish
    burstSteepness: 18, // higher = more sudden burst
    burstMoment: 0.4,   // when the burst happens within the unravel phase (0–1)
    burstSpread: 0.32,  // how far pieces fly from the center, as a share of strip height

    // SQL snippets the bases turn into (keep them short, ~22 characters max)
    snippets: [
      "SELECT * FROM genes;",
      "WHERE base = 'A'",
      "JOIN proteins ON ...",
      "GROUP BY trait",
      "COUNT(*)",
      "ORDER BY expr DESC",
      "SELECT gene, COUNT(*)",
      "HAVING COUNT(*) > 2",
      "WHERE chr = 'X'",
      "LIMIT 10;",
      "FROM samples s",
      "AVG(expression)"
    ]
  };

  const canvas = document.getElementById("dna-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const hero = canvas.parentElement;

  const TAU = Math.PI * 2;
  const FONT = '8px "Press Start 2P", monospace';   // 8px pixel font = one 8×8 cell
  const CELL = 8;
  const SCRAMBLE = "ATCG01<>{}*;=#$";                // "hacker" in-between characters
  const PAIR = { A: "T", T: "A", C: "G", G: "C" };
  const BASE_COLOR = { A: "green", T: "red", C: "blue", G: "orange" };
  const KEYWORDS = new Set(["SELECT", "FROM", "WHERE", "JOIN", "ON", "GROUP", "BY",
    "ORDER", "HAVING", "LIMIT", "DESC", "ASC", "AND", "AS"]);
  const FUNCTIONS = new Set(["COUNT", "AVG", "SUM", "MIN", "MAX"]);

  // Phase timeline: [{ name, start, dur }, ...]
  const PHASES = [];
  let LOOP = 0;
  for (const [name, dur] of Object.entries(SETTINGS.phases)) {
    PHASES.push({ name, start: LOOP, dur });
    LOOP += dur;
  }
  const D = SETTINGS.phases;

  // ----- State -----
  let W, H, cy, amp;          // canvas size (in big pixels), center line, helix height
  let COLORS = {};
  let particles = [];         // one per half base pair
  let phi = 0;                // current rotation angle of the helix
  let t = 0;                  // time inside the current loop (seconds)
  let currentPhase = "rotate";
  let firstLoopDone = false;

  // ----- Small helpers -----
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  // Steep S-curve for the burst: flat → very steep jump → flat (goes from 0 to 1)
  function burst(x) {
    const k = SETTINGS.burstSteepness, c = SETTINGS.burstMoment;
    const s = (v) => 1 / (1 + Math.exp(-k * (v - c)));
    return (s(x) - s(0)) / (s(1) - s(0));
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Read theme colors from the CSS variables in style.css (so the theme stays in one place)
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue("--" + n).trim();
    return { text: v("text"), muted: v("muted"), green: v("green"), blue: v("blue"),
             orange: v("orange"), purple: v("purple"), red: v("red") };
  }

  function hexToRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ===== Pixel font: each character is rendered once into a crisp 8×8 image =====
  // (We remove the soft anti-aliased edges so letters stay blocky when scaled up.)
  const maskCache = new Map();
  const glyphCache = new Map();

  function glyphMask(ch) {
    if (maskCache.has(ch)) return maskCache.get(ch);
    const c = document.createElement("canvas");
    c.width = c.height = CELL;
    const g = c.getContext("2d");
    g.font = FONT;
    g.textBaseline = "top";
    g.fillStyle = "#fff";
    g.fillText(ch, 0, 0);
    const data = g.getImageData(0, 0, CELL, CELL).data;
    const mask = new Uint8Array(CELL * CELL);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 100 ? 1 : 0;
    maskCache.set(ch, mask);
    return mask;
  }

  function glyph(ch, color) {
    const key = ch + color;
    if (glyphCache.has(key)) return glyphCache.get(key);
    const mask = glyphMask(ch);
    const [r, g, b] = hexToRgb(color);
    const c = document.createElement("canvas");
    c.width = c.height = CELL;
    const gctx = c.getContext("2d");
    const img = gctx.createImageData(CELL, CELL);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    glyphCache.set(key, c);
    return c;
  }

  // Once the pixel font has downloaded, throw away glyphs drawn with the fallback font
  if (document.fonts && document.fonts.load) {
    document.fonts.load(FONT).then(() => { maskCache.clear(); glyphCache.clear(); });
  }

  // ===== Drawing primitives (all positions in canvas pixels) =====
  function drawChar(ch, color, x, y, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(glyph(ch, color), Math.round(x) - CELL / 2, Math.round(y) - CELL / 2);
    ctx.globalAlpha = 1;
  }

  function drawRung(x, y, len, color) {
    if (len < 1) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y - len / 2), 1, Math.max(1, Math.round(len)));
  }

  function drawBlock(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }

  const scrambleChar = (p) => SCRAMBLE[Math.floor(performance.now() / 70 + p.seed * 100) % SCRAMBLE.length];

  /*
   * Draw the two backbone strands.
   *   layer: "back" (parts behind the rungs, dimmer) or "front"
   *   sep:   0 = normal helix, 1 = strands pulled fully off the top/bottom
   */
  function drawStrands(layer, sep, alpha) {
    for (const side of [1, -1]) {
      ctx.fillStyle = side === 1 ? COLORS.blue : COLORS.purple;
      ctx.globalAlpha = alpha * (layer === "back" ? 0.4 : 1);
      const offY = side === 1 ? -10 : H + 10;   // where the strand goes when pulled apart
      let prevY = null;
      for (let x = 0; x < W; x++) {
        const theta = (x * TAU) / SETTINGS.wavelength + phi;
        const helixY = cy + side * amp * Math.sin(theta);
        const y = Math.round(lerp(helixY, offY, sep));
        const isFront = side * Math.cos(theta) >= 0;
        if ((layer === "front") === isFront) {
          const from = prevY === null ? y : prevY;
          // draw a vertical run from the previous column so steep parts have no gaps
          ctx.fillRect(x, Math.min(from, y) - 1, 1, Math.abs(y - from) + 2);
        }
        prevY = y;
      }
    }
    ctx.globalAlpha = 1;
  }

  // Where a half base pair sits on the helix right now
  function home(p) {
    const theta = (p.x * TAU) / SETTINGS.wavelength + phi;
    const end = cy + p.side * amp * Math.sin(theta);   // where it touches its strand
    return { x: p.x, y: (end + cy) / 2, len: Math.abs(end - cy) };
  }

  // ===== SQL snippet layout (new random layout every loop) =====

  // Split a snippet into characters with simple syntax-highlight colors
  function colorize(text) {
    const out = [];
    const tokens = text.match(/'[^']*'|[A-Za-z_]+|\d+|\s+|./g) || [];
    for (const tok of tokens) {
      let color = COLORS.text;
      if (tok[0] === "'") color = COLORS.orange;                  // 'strings'
      else if (KEYWORDS.has(tok)) color = COLORS.purple;          // SELECT, FROM...
      else if (FUNCTIONS.has(tok)) color = COLORS.blue;           // COUNT, AVG...
      else if (/^\d+$/.test(tok) || tok === "*") color = COLORS.green;
      else if (/^[^A-Za-z_\s]$/.test(tok)) color = COLORS.muted;  // ; , ( ) = .
      for (const ch of tok) out.push({ ch, color });
    }
    return out;
  }

  // Give every particle a "code" target: a character in a snippet, or a rain letter
  function layoutCode() {
    const pool = shuffle(particles.slice());
    const budget = Math.floor(pool.length * SETTINGS.snippetShare);
    // All SQL lines fall at the same speed, so they never slide over each other.
    // Rows stop early enough that nothing falls off the bottom before the phase ends.
    const vy = SETTINGS.snippetFall;
    const lowest = H - 10 - vy * (D.fly + D.code);
    const rows = [];
    for (let y = 6; y <= lowest; y += 16) rows.push(y);
    shuffle(rows);

    let used = 0;
    let idx = 0;
    outer:
    for (const rowY of rows) {
      let x = randInt(2, 64);
      while (true) {
        const chars = colorize(pick(SETTINGS.snippets));
        if (x + chars.length * CELL > W - 2) break;
        const visible = chars.filter((c) => c.ch !== " ").length;
        if (used + visible > budget) break outer;
        chars.forEach((c, i) => {
          if (c.ch === " ") return;
          pool[idx++].code = {
            kind: "snippet", x: x + i * CELL + CELL / 2, y: rowY + CELL / 2, vy,
            ch: c.ch, color: c.color,
            reveal: 0.1 + i * 0.05 + Math.random() * 0.15   // typing effect, left to right
          };
        });
        used += visible;
        x += chars.length * CELL + randInt(24, 72);
      }
    }

    // Everything left over becomes falling A/T/C/G "rain"
    for (; idx < pool.length; idx++) {
      const p = pool[idx];
      p.code = { kind: "rain", x: randInt(0, Math.floor(W / CELL) - 1) * CELL + CELL / 2,
                 y: rand(0, H), vy: rand(16, 36), ch: p.base, color: p.color };
    }

    // Draw order: rain first, so the SQL text always sits on top and stays readable
    particles.sort((a, b) => (a.code.kind === "rain" ? 0 : 1) - (b.code.kind === "rain" ? 0 : 1));
  }

  // Position of a particle's code character, tc seconds after the fly phase started
  function codePos(p, tc) {
    const c = p.code;
    if (c.kind === "snippet") return { x: c.x, y: c.y + c.vy * tc };
    const span = H + 24;
    return { x: c.x, y: ((c.y + c.vy * tc) % span) - 12 };   // rain wraps around
  }

  // Draw a particle as its code character. tCode = seconds since the code phase began.
  function drawCode(p, pos, tCode) {
    const c = p.code;
    if (c.kind === "snippet") {
      if (tCode < c.reveal) drawChar(scrambleChar(p), COLORS.green, pos.x, pos.y, 0.8);
      else drawChar(c.ch, c.color, pos.x, pos.y);
    } else {
      drawChar(c.ch, c.color, pos.x, pos.y, 0.45);
      // fading trail above each rain letter
      for (let k = 1; k <= 2; k++) {
        const ghost = "ATCG"[(Math.floor(p.seed * 97) + k) % 4];
        drawChar(ghost, c.color, pos.x, pos.y - (CELL + 1) * k, 0.16 / k);
      }
    }
  }

  // ===== Setup (also re-run when the window is resized) =====
  function build() {
    const rect = hero.getBoundingClientRect();
    const PX = Math.max(2, Math.min(5, Math.round(rect.height / 140)));  // size of one "pixel" on screen
    W = Math.ceil(rect.width / PX);
    H = Math.ceil(rect.height / PX);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W * PX + "px";   // exact multiple → every pixel is the same size
    canvas.style.height = H * PX + "px";
    ctx.imageSmoothingEnabled = false;

    cy = Math.floor(H / 2);
    amp = Math.round(H * SETTINGS.amplitude);
    COLORS = readColors();

    particles = [];
    for (let x = 3; x < W; x += SETTINGS.rungSpacing) {
      const b = "ATCG"[randInt(0, 3)];
      for (const side of [1, -1]) {
        const base = side === 1 ? b : PAIR[b];
        particles.push({
          x, side, base,
          color: COLORS[BASE_COLOR[base]],
          seed: Math.random(),
          delay: Math.random(),                     // so pieces don't all move at once
          // where this piece is thrown to when the helix bursts apart
          drift: { x: rand(-14, 14), y: rand(-1, 1) * H * SETTINGS.burstSpread }
        });
      }
    }
    layoutCode();
    enterPhase(currentPhase);   // restore "from" positions if we resized mid-loop
  }

  // ===== Phases =====
  function phaseAt(time) {
    for (let i = PHASES.length - 1; i >= 0; i--) if (time >= PHASES[i].start) return PHASES[i];
    return PHASES[0];
  }

  // Runs once when a phase begins: remember where each particle starts from
  function enterPhase(name) {
    if (name === "fly") {
      layoutCode();
      for (const p of particles) {
        const h = home(p);
        p.from = { x: h.x + p.drift.x, y: h.y + p.drift.y };
      }
    } else if (name === "reassemble") {
      for (const p of particles) p.from = codePos(p, D.fly + D.code);
    }
  }

  // How fast the helix spins in each phase (it slows down while unravelling)
  function spinFactor(ph, prog) {
    if (ph.name === "rotate") return 1;
    if (ph.name === "unravel") return lerp(1, 0.25, burst(prog));
    if (ph.name === "reassemble") return lerp(0.25, 1, prog);
    return 0.25;
  }

  function step(dt) {
    t += dt;
    if (t >= LOOP) {
      t -= LOOP;
      if (!firstLoopDone) {
        firstLoopDone = true;
        window.dispatchEvent(new CustomEvent("dna:firstloop"));
      }
    }
    const ph = phaseAt(t);
    if (ph.name !== currentPhase) {
      currentPhase = ph.name;
      enterPhase(ph.name);
    }
    phi += SETTINGS.spinSpeed * spinFactor(ph, (t - ph.start) / ph.dur) * dt;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const ph = phaseAt(t);
    const local = t - ph.start;          // seconds into this phase
    const prog = clamp01(local / ph.dur);

    // Strands: visible while rotating, pulled away while unravelling, back when reassembling
    let sep = 0, strandAlpha = 1;
    if (ph.name === "unravel") { sep = burst(prog); strandAlpha = 1 - burst(prog); }
    else if (ph.name === "fly" || ph.name === "code") { strandAlpha = 0; }
    else if (ph.name === "reassemble") { sep = 1 - ease(prog); strandAlpha = ease(prog); }

    if (strandAlpha > 0) drawStrands("back", sep, strandAlpha);

    for (const p of particles) {
      if (ph.name === "rotate") {
        const h = home(p);
        drawRung(h.x, h.y, h.len, p.color);

      } else if (ph.name === "unravel") {
        // rung halves snap off in a burst (tiny per-piece delay so it isn't too uniform)
        const e = burst(clamp01((prog - p.delay * 0.08) / 0.92));
        const h = home(p);
        const x = h.x + p.drift.x * e, y = h.y + p.drift.y * e;
        if (e > 0.8) drawBlock(x, y, p.color);
        else drawRung(x, y, lerp(h.len, 2, e), p.color);

      } else if (ph.name === "fly") {
        // pieces fly to their spot in the code and turn into characters on the way
        const q = clamp01((prog - p.delay * 0.35) / 0.65);
        const target = codePos(p, local);
        const pos = { x: lerp(p.from.x, target.x, ease(q)), y: lerp(p.from.y, target.y, ease(q)) };
        if (q < 0.15) drawBlock(pos.x, pos.y, p.color);
        else if (q < 1) drawChar(scrambleChar(p), p.color, pos.x, pos.y, 0.9);
        else drawCode(p, pos, local - D.fly);

      } else if (ph.name === "code") {
        drawCode(p, codePos(p, D.fly + local), local);

      } else if (ph.name === "reassemble") {
        // characters fly home: code char → scramble → base letter → rung
        const q = clamp01((prog - p.delay * 0.3) / 0.7);
        const h = home(p);
        const x = lerp(p.from.x, h.x, ease(q)), y = lerp(p.from.y, h.y, ease(q));
        if (q < 0.2) drawChar(p.code.ch, p.code.color, x, y);
        else if (q < 0.4) drawChar(scrambleChar(p), p.color, x, y);
        else if (q < 0.6) drawChar(p.base, p.color, x, y);
        else drawRung(x, y, h.len * ((q - 0.6) / 0.4), p.color);
      }
    }

    if (strandAlpha > 0) drawStrands("front", sep, strandAlpha);
  }

  // ===== Run loop =====
  let running = false;   // is the animation loop currently ticking?
  let paused = false;    // did the viewer (or reduced-motion setting) pause it?
  let onScreen = true;   // is the strip visible?
  let covered = false;   // is a project page covering it? (set by pill.js)
  let last = null;

  function frame(now) {
    if (!running) return;
    const dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);  // cap: no big jumps after a pause
    last = now;
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // Start/stop the loop: it only runs when not paused, on screen, and not covered by a project
  function update() {
    const shouldRun = !paused && onScreen && !covered;
    if (shouldRun && !running) {
      running = true;
      last = null;
      requestAnimationFrame(frame);
    } else if (!shouldRun) {
      running = false;
    }
  }

  // ----- Play / pause button (bottom-right of the strip) -----
  const toggle = document.getElementById("motion-toggle");

  function setPaused(value) {
    paused = value;
    if (toggle) {
      toggle.dataset.state = paused ? "paused" : "playing";
      toggle.setAttribute("aria-label", paused ? "Play animation" : "Pause animation");
      toggle.querySelector(".motion-label").textContent = paused ? "play" : "pause";
    }
    update();
  }

  if (toggle) toggle.addEventListener("click", () => setPaused(!paused));

  // Expose a little state for other scripts (e.g. the AWESOME button)
  window.DNA = {
    settings: SETTINGS,
    get firstLoopDone() { return firstLoopDone; },
    setCovered(value) { covered = value; update(); }   // pill.js: pause while a project is shown
  };

  // Plays automatically for EVERYONE, including people with "Reduce motion" turned on
  // (Tyra's choice, so recruiters always see it). The pause button lets anyone stop it.
  build();
  setPaused(false);

  // Only animate while the strip is on screen (saves battery when scrolled away)
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; update(); }).observe(hero);
  }

  // Rebuild at the new size when the window is resized
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { build(); draw(); }, 150);
  });
})();
