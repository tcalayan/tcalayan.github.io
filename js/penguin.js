/*
 * penguin.js — the pixel penguin transitions (black & white, like the pill).
 *
 *   Penguin.pullAcross(sheet)  project → project: the penguin pops up in the center (front view),
 *                              jumps and waves, then belly-slides off to the right. A long rope
 *                              back to the left edge pulls the new project (sheet) in from the left.
 *   Penguin.lassoDown(sheet)   project → About Me: the penguin pops up at the bottom, lassos
 *                              the top of the project (sheet) and pulls it down off the screen.
 *
 * Both return a Promise that resolves when the animation is done (each ≈ 1.6–1.7 s).
 * "sheet" is the element to move (a .project-view). pill.js decides when to call these.
 */
(function () {
  "use strict";

  // ===== Settings =====
  const SCALE = 6;                       // one sprite pixel = 6 screen pixels
  const TIME = {                         // milliseconds
    hello: 500, slide: 1250,             // project → project: jump + wave, then tummy slide (≈1.75 s)
    hop: 220, twirl: 550, throw: 220, pull: 650   // project → About (≈1.65 s in total)
  };
  const WAVE_FRAME_MS = 90;              // how fast the flipper waves
  // How the project → project slide ends:
  //   "reel"      the penguin stays on screen the whole time; the rope shortens as the page
  //               catches up, and the penguin slides off right exactly as the page lands
  //   "offscreen" fixed long rope; the penguin leaves halfway and the rope finishes the pull
  const SLIDE_MODE = "offscreen";

  // Snow scene for the slide (pale, with a soft gray outline so it shows on white pages too)
  const SNOW = {
    body: "#eef3f8", edge: "#9aa7b4", shade: "#cfd9e3",
    groove: "#c3cfdb", flake: "#b3c0cd", spray: "#c9d4df",
    solid: 5,              // solid snow under the penguin, in sprite pixels...
    fade: 16,              // ...then it fades away downward over this many more
    flakesPer: 6           // one falling flake per this many sprite-pixel columns
  };
  const TWIRL_TURNS = 2;                 // lasso spins above the head this many times

  // ===== Pixel art (14 × 16). K = black, W = white, O = orange beak/feet, G = flipper line =====
  const COLORS = { K: "#14171c", W: "#ffffff", O: "#d29922", G: "#4a5260" };
  const BODY_TOP = [
    ".....KKKK.....",
    "....KKKKKK....",
    "...KKKKKWWWK..",
    "...KKKKWWKWKOO",   // eye + beak
    "...KKKKWWWWOOO",
    "...KKKKKWWWK..",
    "..KKKKKKWWWWK."
  ];
  const BODY_BOTTOM = [
    "..KKKKKWWWWWK.",
    "..KKKKKWWWWWK.",
    "...KKKKWWWWK..",
    "....KKKKKKK..."
  ];
  const FLIPPER_BACK = [               // flipper resting at its side
    "..KKKKKWWWWWK.",
    ".KKGKKKWWWWWWK",
    ".KKGKKKWWWWWWK",
    ".KKKGKKWWWWWWK",
    "..KKKGKWWWWWK."
  ];
  const FLIPPER_FORWARD = [            // flipper forward (holding the rope)
    "..KKKKGWWWWWK.",
    ".KKKKGKWWWWWWK",
    ".KKKGKKWWWWWWK",
    ".KKGKKKWWWWWWK",
    "..KKKKKWWWWWK."
  ];
  const FEET_APART = ["...OO....OO..."];
  const FEET_TOGETHER = [".....OOOO....."];

  // Front view, facing you (16 × 16): white face + belly, two eyes, beak, flippers at the sides
  const FRONT_HEAD = [
    "......KKKK......",
    "....KKKKKKKK....",
    "...KKKWWWWKKK...",
    "...KKWKWWKWKK...",   // eyes
    "...KKWWOOWWKK...",   // beak
    "...KKKWOOWKKK...",
    "..KKKWWWWWWKKK..",
    ".KKKWWWWWWWWKKK."
  ];
  const FRONT_FEET = [
    "...KWWWWWWWWK...",
    "...KWWWWWWWWK...",
    "....KWWWWWWK....",
    ".....KKKKKK.....",
    "....OOO..OOO...."
  ];
  // Waving: the right flipper (your right) goes up, in two positions swapped quickly
  const WAVE_LOW = [
    "......KKKK......",
    "....KKKKKKKK....",
    "...KKKWWWWKKK...",
    "...KKWKWWKWKK...",
    "...KKWWOOWWKK.KK",
    "...KKKWOOWKKK.KK",
    "..KKKWWWWWWKKKK.",
    ".KKKWWWWWWWWKKK.",
    "KKKWWWWWWWWWWKK.",
    "KK.KWWWWWWWWK...",
    "K..KWWWWWWWWK..."
  ];
  const WAVE_HIGH = [
    "......KKKK......",
    "....KKKKKKKK....",
    "...KKKWWWWKKK.KK",
    "...KKWKWWKWKK.KK",
    "...KKWWOOWWKKKK.",
    "...KKKWOOWKKK...",
    "..KKKWWWWWWKKK..",
    ".KKKWWWWWWWWKKK.",
    "KKKWWWWWWWWWWKK.",
    "KK.KWWWWWWWWK...",
    "K..KWWWWWWWWK..."
  ];

  // Lying on its tummy, head first to the right, feet trailing (20 × 8)
  const SLIDE = [
    "............KKKK....",
    "....KKKKKKKKKKKKKK..",
    "..KKKKKKKKKKKKKWWWK.",
    ".KKKKKKKKKKKKKWWKWOO",
    "OKKKKKKKKKKKKKWWWOOO",
    "OOKGGGGGKKKKKWWWWK..",
    ".OWWWWWWWWWWWWWWWK..",
    "...WWWWWWWWWWWWWK..."
  ];

  const FRAMES = {
    stand: [...BODY_TOP, ...FLIPPER_BACK, ...BODY_BOTTOM, ...FEET_TOGETHER],
    pull:  [...BODY_TOP, ...FLIPPER_FORWARD, ...BODY_BOTTOM, ...FEET_APART],
    front: [...FRONT_HEAD, "KKKWWWWWWWWWWKKK", "KK.KWWWWWWWWK.KK", "K..KWWWWWWWWK..K", ...FRONT_FEET],
    wave1: [...WAVE_LOW, ...FRONT_FEET],
    wave2: [...WAVE_HIGH, ...FRONT_FEET],
    slide: SLIDE
  };
  const SPRITE_W = 14 * SCALE;           // standing size
  const SPRITE_H = 16 * SCALE;

  // Turn each pixel map into a tiny image once (and remember its size)
  const frameURL = {};
  const frameSize = {};
  for (const [name, rows] of Object.entries(FRAMES)) {
    frameSize[name] = { w: rows[0].length * SCALE, h: rows.length * SCALE };
    const c = document.createElement("canvas");
    c.width = rows[0].length;
    c.height = rows.length;
    const g = c.getContext("2d");
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (!COLORS[ch]) return;
      g.fillStyle = COLORS[ch];
      g.fillRect(x, y, 1, 1);
    }));
    frameURL[name] = `url(${c.toDataURL()})`;
  }

  // ===== The stage: snow + penguin + rope + rope knob + lasso ring (created once) =====
  const stage = document.createElement("div");
  stage.className = "penguin-stage";
  stage.setAttribute("aria-hidden", "true");
  stage.innerHTML = `
    <canvas class="snow-scene"></canvas>
    <div class="rope"></div>
    <div class="rope-knob"></div>
    <div class="lasso-ring"></div>
    <div class="penguin"></div>`;
  document.body.appendChild(stage);
  const rope = stage.querySelector(".rope");
  const knob = stage.querySelector(".rope-knob");
  const ring = stage.querySelector(".lasso-ring");
  const penguin = stage.querySelector(".penguin");
  const scene = stage.querySelector(".snow-scene");
  const sctx = scene.getContext("2d");

  // ===== Helpers =====
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeOutBack = (x) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);
  const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;   // gentle push-off and glide

  // Run fn(progress 0→1, elapsed ms) every frame for `ms` milliseconds
  function tween(ms, fn) {
    return new Promise((resolve) => {
      const start = performance.now();
      function frame(now) {
        const elapsed = now - start;
        fn(clamp01(elapsed / ms), elapsed);
        if (elapsed < ms) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function placePenguin(x, y, frame, tilt = 0) {
    penguin.style.backgroundImage = frameURL[frame];
    penguin.style.width = frameSize[frame].w + "px";
    penguin.style.height = frameSize[frame].h + "px";
    penguin.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
  }

  // Draw the rope as a straight line from (ax, ay) to (bx, by)
  function placeRope(ax, ay, bx, by) {
    const len = Math.hypot(bx - ax, by - ay);
    rope.style.width = len + "px";
    rope.style.transform = `translate(${ax}px, ${ay}px) rotate(${Math.atan2(by - ay, bx - ax)}rad)`;
  }

  function show(parts) {
    [rope, knob, ring, scene].forEach((el) => (el.style.display = parts.includes(el) ? "block" : "none"));
    stage.style.display = "block";
  }
  function hide() { stage.style.display = "none"; }

  // ===== Snow scene (drawn small on a canvas and scaled up, like the DNA) =====
  // Everything here is in sprite pixels (1 = SCALE screen pixels).
  function setupSnow(W, H, floorY) {
    const cw = Math.ceil(W / SCALE), ch = Math.ceil(H / SCALE);
    scene.width = cw;
    scene.height = ch;
    scene.style.width = cw * SCALE + "px";
    scene.style.height = ch * SCALE + "px";
    return {
      cw, ch,
      surface: Math.round(floorY / SCALE) - 1,          // feet sink in by one pixel
      // gentle lumps on top of the snow bank
      bumps: Array.from({ length: cw }, (_, i) => (Math.sin(i * 0.7) + Math.sin(i * 0.23) > 0.9 ? 1 : 0)),
      flakes: Array.from({ length: Math.round(cw / SNOW.flakesPer) }, () => ({
        x: Math.random() * cw, y: Math.random() * ch, vy: 6 + Math.random() * 8, sway: Math.random() * 6.28
      })),
      spray: []
    };
  }

  // Throw `count` bits of snow up and backwards from (x, y)
  function kickSnow(sn, x, y, count, strength = 1) {
    for (let i = 0; i < count; i++) {
      sn.spray.push({
        x, y,
        vx: -(8 + Math.random() * 26) * strength + (Math.random() - 0.5) * 10,
        vy: -(14 + Math.random() * 26) * strength,
        life: 0.35 + Math.random() * 0.25
      });
    }
  }

  // Draw one frame of the snow scene. groove = { from, to } in screen px (or null).
  function drawSnow(sn, alpha, dt, groove) {
    sctx.clearRect(0, 0, sn.cw, sn.ch);
    sctx.globalAlpha = alpha;

    // falling flakes
    sctx.fillStyle = SNOW.flake;
    for (const f of sn.flakes) {
      f.y += f.vy * dt;
      f.sway += dt * 2;
      if (f.y > sn.ch) f.y -= sn.ch;
      sctx.fillRect(Math.round(f.x + Math.sin(f.sway) * 1.5), Math.round(f.y), 1, 1);
    }

    // snowfield: solid under the penguin, fading out downward, with a lumpy outlined top
    const top = sn.surface;
    sctx.fillStyle = SNOW.body;
    for (let i = 0; i < SNOW.solid + SNOW.fade; i++) {
      sctx.globalAlpha = alpha * (i < SNOW.solid ? 1 : 1 - (i - SNOW.solid + 1) / (SNOW.fade + 1));
      sctx.fillRect(0, top + i, sn.cw, 1);
    }
    sctx.globalAlpha = alpha;
    sctx.fillStyle = SNOW.edge;
    for (let x = 0; x < sn.cw; x++) {
      if (sn.bumps[x]) {
        sctx.fillRect(x, top - 2, 1, 1);
        sctx.fillStyle = SNOW.body;
        sctx.fillRect(x, top - 1, 1, 1);
        sctx.fillStyle = SNOW.edge;
      } else {
        sctx.fillRect(x, top - 1, 1, 1);
      }
    }
    sctx.fillStyle = SNOW.shade;                        // soft shadow line just under the surface
    sctx.fillRect(0, top + 2, sn.cw, 1);

    // the groove the penguin leaves behind
    if (groove && groove.to > groove.from) {
      sctx.fillStyle = SNOW.groove;
      const a = Math.round(groove.from / SCALE), b = Math.round(groove.to / SCALE);
      sctx.fillRect(a, top + 1, b - a, 1);
    }

    // flying snow spray: 2×2 clumps with a darker corner so they show on white
    sn.spray = sn.spray.filter((p) => (p.life -= dt) > 0);
    for (const p of sn.spray) {
      p.vy += 90 * dt;                                  // gravity
      p.x += p.vx * dt;
      p.y = Math.min(top, p.y + p.vy * dt);
      sctx.globalAlpha = alpha * Math.min(1, p.life / 0.2);
      const px = Math.round(p.x), py = Math.round(p.y) - 1;
      sctx.fillStyle = SNOW.spray;
      sctx.fillRect(px, py, 2, 2);
      sctx.fillStyle = SNOW.edge;
      sctx.fillRect(px + 1, py + 1, 1, 1);
    }
    sctx.globalAlpha = 1;
  }

  // Seconds since the last frame, for a tween callback's elapsed-ms value
  function frameClock() {
    let last = 0;
    return (ms) => { const dt = Math.min(0.05, (ms - last) / 1000); last = ms; return dt; };
  }

  // ===== Project → project: say hi in the center, then tummy-slide off pulling the new sheet in =====
  async function pullAcross(sheet) {
    const W = innerWidth, H = innerHeight;
    const front = frameSize.front, slide = frameSize.slide;
    const hiX = Math.round(W / 2 - front.w / 2);          // centered
    const hiY = Math.round(H / 2 - front.h / 2);
    const floor = hiY + front.h;                          // its feet stay on this line
    const slideTop = floor - slide.h;
    const slideStart = Math.round(W / 2 - slide.w / 2);
    const ropeLen = slideStart;                           // long rope: from the penguin back to the left edge

    sheet.classList.add("is-pulled-x");
    sheet.style.transform = "translateX(-100%)";          // waiting just off the left edge
    const snow = setupSnow(W, H, floor);
    scene.style.clipPath = "none";
    show([scene, rope]);

    // 1. Hello! Pop in, one little jump, wave. The rope runs from its left flipper to the left edge.
    const helloClock = frameClock();
    await tween(TIME.hello, (t, ms) => {
      drawSnow(snow, clamp01(t / 0.2), helloClock(ms), null);   // snow fades in
      const jump = Math.sin(clamp01((t - 0.2) / 0.6) * Math.PI) * 28;   // one hop in the middle
      const pop = Math.min(1, easeOutBack(clamp01(t / 0.25)));
      const y = hiY - jump + (1 - pop) * 30;
      const frame = Math.floor(ms / WAVE_FRAME_MS) % 2 ? "wave1" : "wave2";
      placePenguin(hiX, y, frame);
      penguin.style.opacity = String(clamp01(t / 0.15));
      placeRope(0, floor - 2 * SCALE, hiX + SCALE, y + 10 * SCALE);
    });

    // 2. Flop onto its tummy and slide right, pulling the sheet in (see SLIDE_MODE)
    show([scene, rope, knob]);
    kickSnow(snow, (slideStart + slide.w / 2) / SCALE, snow.surface, 14, 0.6);   // belly-flop puff
    const slideClock = frameClock();
    await tween(TIME.slide, (t, ms) => {
      let x, edge;                                        // penguin position, sheet's right edge
      if (SLIDE_MODE === "reel") {
        const k = easeInOutSine(t);
        x = lerp(slideStart, W + 10, k);                  // center → just off the right side
        edge = W * k;                                     // sheet catches up: the rope gets shorter
      } else {
        x = lerp(slideStart, W + ropeLen, easeInOutSine(Math.pow(t, 1.4)));   // slow start
        edge = Math.min(W, x - ropeLen);                  // fixed rope length
      }
      sheet.style.transform = `translateX(${edge - W}px)`;
      scene.style.clipPath = `inset(0 0 0 ${Math.max(0, edge)}px)`;   // snow never covers the new page
      placePenguin(x, slideTop, "slide");
      // snow: spray behind its feet while it's on screen, a groove behind it, fade out at the end
      if (x < W) kickSnow(snow, x / SCALE + 1, snow.surface, 2);
      drawSnow(snow, 1 - clamp01((t - 0.75) / 0.25), slideClock(ms), { from: slideStart, to: Math.min(x, W) });
      const tieY = slideTop + 4 * SCALE;                  // rope tied at its feet
      placeRope(edge, tieY, x + SCALE, tieY);
      knob.style.transform = `translate(${edge - 6}px, ${tieY - 6}px)`;
    });

    sheet.style.transform = "";
    sheet.classList.remove("is-pulled-x");
    hide();
  }

  // ===== Project → About: lasso the top of the sheet and pull it down =====
  async function lassoDown(sheet) {
    const W = innerWidth, H = innerHeight;
    const x = Math.round(W / 2 - SPRITE_W / 2);
    const baseY = H - SPRITE_H - 20;
    const hand = () => ({ x: x + 6 * SCALE, y: penguinY + 8 * SCALE });   // where it holds the rope
    const ringTop = 24;                            // lasso hooks this far below the sheet's top
    const ringX = W / 2;
    let penguinY = H + 10;

    sheet.classList.add("is-pulled-y");
    show([]);

    // 1. Pop up from the bottom edge
    await tween(TIME.hop, (t) => {
      penguinY = lerp(H + 10, baseY, easeOutBack(t));
      placePenguin(x, penguinY, "stand");
    });

    // 2. Twirl the lasso above its head. The loop circles around, and squashes as it
    //    turns away (like a spinning lasso seen from the side).
    show([rope, ring]);
    const twirlR = 50;                              // how wide the loop circles
    const twirlY = () => penguinY - 44;             // loop height above the head
    let tip = { x: 0, y: 0 };
    await tween(TIME.twirl, (t) => {
      const h = hand();
      const angle = t * TWIRL_TURNS * Math.PI * 2;
      tip = { x: h.x + Math.cos(angle) * twirlR, y: twirlY() + Math.sin(angle) * twirlR * 0.3 };
      placeRope(h.x, h.y, tip.x, tip.y);
      const squash = 0.45 + 0.55 * Math.abs(Math.cos(angle));
      ring.style.transform = `translate(${tip.x}px, ${tip.y}px) translate(-50%, -50%) scale(${squash}, 1)`;
      placePenguin(x, penguinY, "pull", Math.sin(angle) * 4);   // wobbles along with the swing
    });

    // 3. Throw it up to the top of the sheet
    const from = tip;
    await tween(TIME.throw, (t) => {
      const h = hand();
      const k = easeOut(t);
      const tipX = lerp(from.x, ringX, k), tipY = lerp(from.y, ringTop, k);
      placeRope(h.x, h.y, tipX, tipY);
      ring.style.transform = `translate(${tipX}px, ${tipY}px) translate(-50%, -50%) scale(1)`;
      placePenguin(x, penguinY, "pull", -6 * t);
    });

    // 4. Pull! The sheet slides down; the penguin leans back and gets pushed off with it
    await tween(TIME.pull, (t, ms) => {
      const sheetY = easeInOut(t) * H;
      sheet.style.transform = `translateY(${sheetY}px)`;
      const ringY = ringTop + sheetY;
      penguinY = Math.max(baseY + (Math.floor(ms / 90) % 2) * 3, ringY - 4 * SCALE);
      placePenguin(x, penguinY, "pull", -12);
      const h = hand();
      placeRope(h.x, h.y, ringX, ringY);
      ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
    });

    sheet.style.transform = "";
    sheet.classList.remove("is-pulled-y");
    hide();
  }

  window.Penguin = {
    pullAcross,
    lassoDown,
    // A penguin picture for other scripts (e.g. the rating pop-up): { url, w, h }
    frame: (name) => ({ url: frameURL[name], ...frameSize[name] })
  };
})();
