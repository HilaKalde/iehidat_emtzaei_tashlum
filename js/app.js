/* =========================================================================
   מנוע הלומדה – חדר כושר פיננסי / אמצעי תשלום
   במה קבועה 1200×675. כל מסך = .screen בתוך #screens (מבנה ידידותי להמרה ל-Storyline).
   ========================================================================= */
(function () {
  "use strict";

  const W = 1200, H = 675;
  const IMG = "assets/img/", UI = "assets/ui/", ICON = "assets/icons/", AUDIO = "assets/audio/", VID = "assets/video/";
  // the version tag of this script (index.html: app.js?v=…) – added to the narration files too, so a re-cut part is
  // never played from the browser's cache
  const VER = ((document.currentScript && document.currentScript.src.match(/\?v=[\w]+/)) || [""])[0];
  const byId = {};
  DATA.screens.forEach((s, i) => { s.index = i; byId[s.id] = s; });

  /* ---------------------------------------------------------------- state */
  const STORE = "payments-gym-v1";
  let state = { answers: {}, done: {}, seen: {}, visited: {}, sound: true, ad: null };
  let firstVisit = true;
  try { const raw = localStorage.getItem(STORE); if (raw) state = Object.assign(state, JSON.parse(raw)); } catch (e) {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} };

  const ans = id => state.answers[id];
  const isDone = id => !!(ans(id) && ans(id).completed);
  const setAns = (id, a) => { state.answers[id] = a; save(); };
  // coins are stored on the answer record once, when they are earned – revisiting never adds them again
  const setScore = set => DATA.screens.filter(s => s.set === set).reduce((sum, s) => sum + ((ans(s.id) && ans(s.id).coins) || 0), 0);
  const bank = () => 100 - 10 * DATA.screens.filter(s => s.mode === "stretch" && isDone(s.id) && !ans(s.id).correct).length;

  /* feedback sound – a quiet extra layer on top of the visual feedback */
  const SFX = { correct: { src: AUDIO + "fb-correct.mp3", vol: .14 }, wrong: { src: AUDIO + "fb-wrong.wav", vol: .21 } };
  const sfx = {}; let sfxNow = null;
  function stopFeedbackSound() { if (!sfxNow) return; try { sfxNow.pause(); sfxNow.currentTime = 0; } catch (e) {} sfxNow = null; }
  function playFeedbackSound(ok) {
    stopFeedbackSound();
    if (!state.sound) return;
    const k = ok ? "correct" : "wrong";
    if (!sfx[k]) { sfx[k] = new Audio(SFX[k].src); sfx[k].volume = SFX[k].vol; }
    sfxNow = sfx[k];
    try { sfxNow.currentTime = 0; const p = sfxNow.play(); if (p) p.catch(() => {}); } catch (e) {}
  }

  /* narration – every slide's recording is cut into small files, one per part (assets/audio/vo/NN-part.mp3, NN = slide
     number; cut by _tools/vo-cut.js along the VO table in data.js). "enter" plays when the slide opens, a layer's part when
     it opens, the feedback part after an answer, and so on. Each file plays from its start to its end – no seeking inside
     a recording, which browsers do only roughly when an mp3 is read straight from disk.
     A part is a key of the slide's VO entry, or { file } (a station situation, the tennis heads shared from slide 43),
     or { sfx } – a sound effect between two parts (assets/audio/<sfx>: the SMS / e-mail arriving). */
  let voEl = null, voToken = 0;
  const voFile = (id, key) => VO[id].file.slice(0, 2) + "-" + key.replace(/:/g, "-") + ".mp3";
  function stopVO() { voToken++; if (voEl) try { voEl.pause(); } catch (e) {} caption(null); }
  async function playVO(id, keys, delay = 0) {
    stopVO();
    if (!state.sound || !VO[id]) return;
    const token = voToken;
    const files = keys.map(k => typeof k === "object" ? k.file || k.sfx : VO[id][k] ? voFile(id, k) : null).filter(Boolean);
    // a fresh player for every part (reusing one made some browsers play a moment of the next file from the old
    // position first); the next part is loaded while the current one plays, so there is no gap between them
    const make = file => { const a = new Audio(AUDIO + (/^sfx-/.test(file) ? "" : "vo/") + file + VER);a.preload = "auto"; if (/^sfx-/.test(file)) a.volume = /ring/.test(file) ? .85 : .5; return a; };
    let next = files.length ? make(files[0]) : null;
    if (delay) await new Promise(r => setTimeout(r, delay));
    for (let i = 0; i < files.length; i++) {
      if (token !== voToken) return;
      const el = voEl = next;
      next = i + 1 < files.length ? make(files[i + 1]) : null;
      try { await el.play(); } catch (e) { return; }                 // no click yet (autoplay blocked) – stay quiet
      caption(el, files[i].replace(/\.mp3$/, ""));                   // the accessibility captions follow it
      await new Promise(done => {                                    // until it ends – or stopVO pauses it
        const end = () => { el.removeEventListener("ended", end); el.removeEventListener("pause", end); el.removeEventListener("error", end); done(); };
        el.addEventListener("ended", end); el.addEventListener("pause", end); el.addEventListener("error", end);
      });
    }
  }
  const voRow = (id, i) => ({ file: VO[id].file.slice(0, 2) + "-row" + (i + 1) + ".mp3" });   // one station situation
  const voShared = k => ({ file: "shared-" + k + ".mp3" });                                    // the tennis heads, used in every round
  // the narration of a slide as it opens
  function voEnter(s) {
    if (!$("#cover").classList.contains("gone")) return stopVO();     // not under the cover – it starts with its PLAY
    if (s.type === "menu" && !firstVisit) return stopVO();            // the menu is narrated on the first visit only
    if (s.type === "stop") return playVO(s.id, [state.ad === "skipped" ? "skipped" : "clicked", "enter"]);
    if (s.type === "stretchEnd") return playVO(s.id, !s.hideScore && bank() < 50 ? ["enter", "band", "rest"] : ["enter", "rest"]);
    if (s.type === "station") {                                      // the instruction, then the first situation still open
      const a = ans(s.id), picks = (a && a.picks) || [], i = a && a.completed ? -1 : s.rows.findIndex((r, k) => picks[k] == null);
      return playVO(s.id, i < 0 ? ["enter"] : ["enter", voRow(s.id, i)]);
    }
    if (s.type === "tennis") { const a = ans(s.id); return a && a.completed ? stopVO() : playVO(s.id, ["clue" + ((a && a.clue) || 1)]); }
    // "קיבלתם הודעת SMS:" → the SMS sound → the message read aloud ("msg") → "בטוח או חשוד?…" (parts a slide lacks are
    // skipped); a phone call only rings – the caller is heard once the learner answers (the green button, bindPull)
    if (s.mock && s.mock.kind === "call") return playVO(s.id, isDone(s.id) ? ["enter"] : ["enter", { sfx: s.enterSfx }]);
    // ("ask": a question that comes before the message – slide 38)
    playVO(s.id, s.enterSfx ? ["enter", { sfx: s.enterSfx }, "ask", "msg", "enter:2"] : ["enter", "ask", "msg", "enter:2"]);
  }

  /* -------------------------------------------------------------- helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pos = (l, t, w, h) => `left:${l}px;top:${t}px;` + (w != null ? `width:${w}px;` : "") + (h != null ? `height:${h}px;` : "");
  const A = (kind, d) => `a ${kind}" data-d="${d}`;       // used inside class="…" – entrance animation + delay
  const linkUrl = key => (key && LINKS[key]) || "";
  const TOK = "(?:<b>)?(?:\\u0001\\d+\\u0001|[\\d.,]+%?)(?:</b>)?";
  const MATH = new RegExp(`\\(?${TOK}(?:\\s*[×+−=≈÷/\\-]\\s*\\(?${TOK}\\)?)+`, "g");
  const ltrMath = html => html.replace(MATH, m => `<bdi dir="ltr">${m}</bdi>`);
  const MONEY_RE = /([\d][\d,]*(?:\.\d+)?)\s*₪/g;
  function money(html) {          // amount + ₪ = one unbreakable LTR unit; equations stay left-to-right
    const amounts = [];
    const marked = html.replace(MONEY_RE, (m, a) => "\u0001" + (amounts.push(a) - 1) + "\u0001");
    return ltrMath(marked).replace(/\u0001(\d+)\u0001/g, (m, i) =>
      `<span class="money-value" dir="ltr"><span class="currency">₪</span><span class="amount">${amounts[i]}</span></span>`);   // ₪ to the LEFT of the number
  }

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.style.display = "block";
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.style.display = "none"), 2200);
  }
  function openLink(key) {
    const url = linkUrl(key);
    if (url) window.open(url, "_blank", "noopener"); else toast("הקישור יתווסף בהמשך");
  }

  /* character images: natural size of each PNG, so any height keeps the ratio */
  const NAT = { "adam": [512, 768], "aya": [512, 768], "adam-hips": [512, 768], "aya-hips": [512, 768],
    "adam-flex": [512, 768], "aya-flex": [512, 768], "aya-adam-like": [512, 768], "adam-sit": [614, 614], "aya-sit": [614, 614],
    "adam-cross": [644, 804], "adam-cross-stand": [644, 804], "aya-bench": [688, 752] };
  function hero(name, l, t, h, cls = "", alt = "") {
    const [nw, nh] = NAT[name];
    return `<img class="char ${cls}" data-hero="${name}" src="${IMG + name}.png" alt="${alt}" style="${pos(l, t, Math.round(h * nw / nh), h)}">`;
  }

  /* heavy GIFs: fetched once, then a fresh object URL every time so the animation restarts from frame 1.
     Opened from disk (file://) fetch is blocked – then a cache-busting query restarts it instead. */
  const gifBlobs = {}, gifUrls = {};
  function gifUrl(file) {
    if (!gifBlobs[file]) gifBlobs[file] = fetch(IMG + file).then(r => (r.ok ? r.blob() : null)).catch(() => null);
    return gifBlobs[file].then(b => {
      if (!b) return IMG + file + "?r=" + Date.now();
      // older URLs are not revoked: an image may still be loading from one, and they all share the same blob
      return (gifUrls[file] = URL.createObjectURL(b));
    });
  }
  // the character animations are animated WebP (full colour + soft alpha edges; GIF's 256 colours showed banding)
  const ANIM = ".webp", ANIM_TYPE = "image/webp";
  // the characters move only when animations are allowed (accessibility menu / the system's reduce-motion setting)
  const playGif = (img, base) => still() ? Promise.resolve() : gifUrl(base + ANIM).then(u => { if (img && img.isConnected) img.src = u; });
  const showStill = (img, base) => { if (img) img.src = IMG + base + ".png"; };

  // drawn ✕ – the font's "×" glyph sits off-centre inside the round close button
  const CLOSE_X = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  function layerHtml(id, inner) { return `<div class="layer" data-layer="${id}"><div class="dim"></div>${inner}</div>`; }
  const modalMode = on => $("#stage").classList.toggle("modal-open", on);
  // a layer is a dialog: what is behind it is out of reach (Tab stays inside; sound and accessibility stay usable),
  // Esc or ✕ close it, and the focus goes back to the button that opened it
  let layerOpener = null;
  const behindLayer = (scr, L) => [...scr.children, ...$("#chrome").children].filter(el => el !== L && !el.contains(L) && !el.matches('[data-c="sound"], [data-c="a11y"], [data-c="a11y-panel"]'));
  function showLayer(scr, id) {
    const L = $(`[data-layer="${id}"]`, scr); if (!L) return;
    layerOpener = document.activeElement;
    L.classList.add("show"); modalMode(true); fixOrphans(L);
    behindLayer(scr, L).forEach(el => (el.inert = true));
    const f = $(".close-x", L); if (f) f.focus({ preventScroll: true });
  }
  function hideLayer(L) {
    L.classList.remove("show"); modalMode(false);
    const scr = L.closest(".screen"); if (scr) behindLayer(scr, L).forEach(el => (el.inert = false));
    if (layerOpener && layerOpener.isConnected) layerOpener.focus({ preventScroll: true });
    layerOpener = null;
  }

  /* one feedback card for every exercise: head + coin tag + explanation (+ optional action button) */
  function fbHtml(ok, head, body, coins, action) {
    return `<div class="ifb-row"><p class="ifb-head">${head}</p>${coins ? `<span class="ifb-coins"><span class="coin sm"></span>+${coins} מטבעות</span>` : ""}</div>` +
      (body ? `<div class="ifb-body">${money(body)}</div>` : "") + (action || "");
  }
  function showFb(box, ok, html, focus = true) {
    box.className = "inline-fb " + (ok ? "ok" : "bad");
    box.innerHTML = html; box.hidden = false;
    fixOrphans(box);
    if (focus) box.focus({ preventScroll: true });
  }

  /* --------------------------------------------------------- accessibility */
  // switch settings (the options below are applied by a11yApply; there is no menu any more)
  const A11Y_KEY = "payments-gym-a11y";
  let a11y = {};
  // (the menu was taken out at the client's request – nothing is read from storage, so no saved choice stays on without a
  //  way to turn it off; "still" follows only the system's reduce-motion setting)
  const A11Y_OPTS = [
    ["contrast", "ניגודיות גבוהה"], ["gray", "גווני אפור"], ["still", "עצירת אנימציות"], ["links", "הדגשת קישורים וכפתורים"],
    ["font", "גופן קריא"], ["cursor", "סמן עכבר גדול"], ["captions", "כתוביות לקריינות"]
  ];
  const reduceMotion = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const still = () => !!a11y.still || reduceMotion.matches;
  function a11yApply() {
    const html = document.documentElement;
    A11Y_OPTS.forEach(([k]) => html.classList.toggle("a11y-" + k, !!a11y[k]));
    html.classList.toggle("a11y-still", still());
    $$("video.bg[autoplay]").forEach(v => { if (still()) v.pause(); else if (v.closest(".screen.active")) v.play().catch(() => {}); });
    if (!a11y.captions) caption(null);
  }
  const a11ySave = () => { try { localStorage.setItem(A11Y_KEY, JSON.stringify(a11y)); } catch (e) {} };
  if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", a11yApply);

  /* captions: the words of the narration part that is playing, one sentence at a time – the sentence is estimated
     from how far the part has played (sentence length ∝ its share of the part's time) */
  let capEl = null;
  function caption(el, key) {
    capEl = capEl || $("#captions");
    if (!capEl) return;
    if (!el || !a11y.captions || !VO_TEXT[key]) { capEl.hidden = true; capEl.textContent = ""; capEl.dataset.key = ""; return; }
    const sent = VO_TEXT[key].match(/[^.!?:]+[.!?:]*\s*/g) || [VO_TEXT[key]];
    const w = sent.map(s => s.length), tot = w.reduce((a, b) => a + b, 0);
    const show = () => {
      if (capEl.dataset.key !== key + "") return;
      const d = el.duration || 1, at = (el.currentTime / d) * tot; let acc = 0, i = 0;
      while (i < sent.length - 1 && acc + w[i] < at) acc += w[i++];
      capEl.textContent = sent[i].trim(); capEl.hidden = false;
    };
    capEl.dataset.key = key; show();
    el.addEventListener("timeupdate", show);
    el.addEventListener("ended", () => { if (capEl.dataset.key === key + "") { capEl.hidden = true; capEl.textContent = ""; } }, { once: true });
  }

  /* ------------------------------------------------------------ renderers */
  const R = {};

  R.intro = s => `
    <img class="bg" src="${IMG}bg-empty.jpg" alt="">
    ${hero("adam", 40, 175, 490, A("fly-l", 300))}
    ${hero("aya", 833, 170, 495, A("fly-r", 450))}
    <div class="intro-title ${A("fly-t", 0)}"><img src="${UI}title-pill.png" alt=""><span>${s.title}</span></div>
    <div class="card intro-card ${A("fade", 350)}">
      <p class="txt">${s.text}</p><p class="txt">${s.text2}</p>
    </div>
    <div class="start-wrap"><button class="start-btn ${A("pop", 800)}" data-go="${s.next}">${s.button}</button></div>`;

  R.menu = s => {
    const pill = (set, go, p, i) => {
      const st = SETS[set];
      return `<div class="machine-pill ${A("pop", 250 + i * 150)}" data-go="${go}" data-machine="${set}" tabindex="0" role="button"
        aria-label="${st.title} – ${st.sub}${state.done[set] ? " (הושלם)" : ""}" style="${pos(p[0], p[1], 200, 75)}">
        <img src="${UI}pill-chapter.png" alt="">
        <div class="pt"><b>${st.title}</b><small>${st.sub}</small></div>
        ${state.done[set] ? `<div class="check" aria-hidden="true">✓</div>` : ""}
      </div>`;
    };
    const machines = s.machines.map((m, i) => `
      <img class="machine-img" src="${IMG + m.img}" alt="" data-machine-hit="${m.set}" data-go-machine="${m.go}" style="${pos(...m.box)}">
      ${pill(m.set, m.go, m.pill, i)}`).join("");
    const d = s.door;
    const door = `<div class="door-hit" data-machine-hit="${d.set}" data-door="1" data-go-machine="${d.go}" style="${pos(...d.box)}clip-path:${d.clip};"></div>
      ${pill(d.set, d.go, d.pill, 3)}`;
    const tabs = s.tabs.map((t, i) => {
      const icon = `<img class="tab-ic" src="${ICON + t.icon}" alt="">`, label = `<span class="tab-tx">${t.label}</span>`;
      return `<button class="side-tab ${t.side} ${A(t.side === "right" ? "fly-r" : "fly-l", 900 + i * 120)}" data-go="${t.go}"
        style="top:${t.top}px;">${t.side === "right" ? icon + label : label + icon}</button>`;
    }).join("");
    return `
      <img class="bg" src="${IMG}bg-empty.jpg" alt="">
      <div class="hang-panel menu-panel ${A("fly-t", 0)}">
        <div class="h-title">${s.title}</div>
        <p class="txt">${s.text}</p>
        <p class="instr">${s.instruction}</p>
      </div>
      <div class="intro-title on-menu ${A("fly-r", 150)}"><img src="${UI}title-pill.png" alt=""><span>${s.pillTitle}</span></div>
      <div class="boi-logo ${A("fly-t", 100)}"><img src="${UI}logo-boi.png" alt="בנק ישראל"></div>
      ${machines}
      ${door}
      <img class="char menu-char ${A("fade", 500)}" src="${IMG}adam-sit.png" alt="" style="${pos(280, 326, 345, 345)}">
      <img class="char menu-char ${A("fade", 600)}" src="${IMG}aya-sit.png" alt="" style="${pos(578, 320, 345, 345)}">
      ${tabs}`;
  };

  R.warmup = s => `
    <video class="bg" src="${VID}warmup-aya.mp4" autoplay muted loop playsinline aria-hidden="true" tabindex="-1"></video>
    <div class="warmup-panel ${A("fade", 0)}">
      <p class="txt warmup-intro">${s.text}</p>
      <ul class="warmup-list">${s.items.map(it => `<li>${it}</li>`).join("")}</ul>
      <p class="warmup-outro">${s.outro}</p>
    </div>`;

  /* TV room ("רקע לסרטון חדש"): the characters peek in from behind the edges of the slide itself (client reference).
     Both images are used in the directions supplied in the assets folder: Adam's body cut line (x≈176 of the 512px
     image) sits on the left edge, his hand gripping it; Aya's cut line (x 357) sits on the right edge.
     Canvas 512×768 shown at 369×553 (×0.72). */
  const tvPair = () => `
    <img class="char peek ${A("fly-l", 300)}" src="${IMG}adam-peek.png" alt="אדם מציץ מקצה המסך ומחייך" style="${pos(-129, 153, 369, 553)}">
    <img class="char peek ${A("fly-r", 400)}" src="${IMG}aya-peek.png" alt="איה מציצה מקצה המסך ומחייכת" style="${pos(943, 183, 369, 553)}">`;
  // play button: "PLAY.png" from the assets folder (178×143, shown at half size so it stays sharp)
  const PLAY_ICON = `<img src="${UI}play.png" alt="">`;

  /* boost screen – built like the interest-rate unit's: no title, the text straight on the wall above the TV,
     Adam and Aya leaning in from the frame edges, and the TV as a player: a dark veil, PLAY on top, PAUSE on
     hover while a film runs. The film is a YouTube id (s.yt) or a local file (s.film); with neither, PLAY says "soon". */
  R.boost = s => `
    <img class="bg" src="${IMG}bg-tv3.jpg" alt="">
    <div class="boost-shade" aria-hidden="true"></div>
    <p class="boost-text ${A("fade", 200)}">${s.text}</p>
    <img class="char boost-peek left ${A("fly-l", 300)}" src="${IMG}boost-adam-peek.webp" alt="">
    <img class="char boost-peek right ${A("fly-r", 400)}" src="${IMG}boost-aya-peek.webp" alt="">
    <div class="tv boost-tv film-box ${A("fade", 500)}" data-film>
      ${s.film ? `<video class="tv-video" src="${VID + s.film}" playsinline preload="metadata" tabindex="-1"></video>` : ""}
      <div class="tv-veil" aria-hidden="true"></div>
      <p class="tv-soon" data-soon hidden>סרטון יתווסף בהמשך</p>
      <button type="button" class="tv-btn play" aria-label="הפעלת הסרטון" title="הפעלת הסרטון"><img src="${UI}play.png" alt=""></button>
      <button type="button" class="tv-btn pause" aria-label="עצירת הסרטון" title="עצירת הסרטון"><img src="${UI}pause.png" alt=""></button>
    </div>`;
  // a YouTube film, played inside the TV on the wall (its own controls – the learner can still choose full screen there)
  function playYouTube(box, id, title) {
    stopVO();
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="${title}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  }
  // a set's film (the video screens), as in the currency unit: it plays over the whole stage; ✕ / Esc closes and stops it
  function openFilm(scr, v) {
    stopVO();
    const fromDisk = location.protocol === "file:";   // YouTube refuses embedded videos there – the lomda's own copy plays
    const ov = document.createElement("div");
    ov.className = "film-full"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", v.title);
    ov.innerHTML = (v.yt && !(fromDisk && v.file)
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${v.yt}?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="${v.title}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : `<video src="${VID + v.file}" title="${v.title}" controls autoplay playsinline></video>`)
      + `<button type="button" class="close-x film-close" aria-label="סגירת הסרטון">${CLOSE_X}</button>`;
    const vid = $("video", ov); if (vid) vid.muted = !state.sound;
    const close = () => { ov.remove(); modalMode(false); document.removeEventListener("keydown", esc); $("[data-play-slot]", scr)?.focus({ preventScroll: true }); };
    const esc = e => { if (e.key === "Escape") close(); };
    $(".film-close", ov).addEventListener("click", close);
    document.addEventListener("keydown", esc);
    scr.appendChild(ov); modalMode(true);
    $(".film-close", ov).focus({ preventScroll: true });
  }
  function bindBoost(scr, s) {
    const box = $("[data-film]", scr), v = $("video.tv-video", box);
    const playBtn = $(".tv-btn.play", box), pauseBtn = $(".tv-btn.pause", box);
    if (s.yt) {                                  // a YouTube film: PLAY puts the player in the TV (its own controls pause it)
      playBtn.addEventListener("click", () => playYouTube(box, s.yt, "סרטון בוסט אנרגיה"));
      return;
    }
    if (!v) {                                    // no film yet: PLAY shows the placeholder line inside the TV
      playBtn.addEventListener("click", () => { $("[data-soon]", box).hidden = false; playBtn.hidden = true; });
      return;
    }
    const playing = on => box.classList.toggle("playing", on);
    playBtn.addEventListener("click", () => { stopVO(); v.muted = !state.sound; v.play().catch(() => {}); });
    pauseBtn.addEventListener("click", () => v.pause());
    v.addEventListener("play", () => playing(true));
    v.addEventListener("pause", () => playing(false));
    v.addEventListener("ended", () => { v.currentTime = 0; playing(false); });
  }

  R.videoSlot = s => {
    const v = VIDEOS[s.video];
    return `
    <img class="bg" src="${IMG}bg-tv3.jpg" alt="">
    <div class="boost-title ${A("fly-t", 0)}">${v.title}</div>
    ${tvPair()}
    <div class="tv ${A("fade", 500)}" data-tv>
      <button type="button" class="tv-play" data-play-slot aria-label="הפעלת הסרטון">${PLAY_ICON}</button>
    </div>    <div class="video-blank" data-blank hidden><p class="video-note">סרטון יתווסף בהמשך</p></div>`;
  };

  /* explore: buttons that open layers; "הבא" appears only after every layer was opened */
  const visited = s => (state.visited[s.id] || []);
  const byStationHero = hero => DATA.screens.find(x => x.type === "station" && x.hero === hero);
  const allVisited = s => s.items.every(it => visited(s).includes(it.key));
  function exploreLayer(s, it) {
    if (s.layout === "fraud") return `
      <div class="modal card ex-modal fraud-modal" role="dialog" aria-modal="true" aria-label="${it.label}">
        <button class="close-x" data-close="1" aria-label="סגירה">${CLOSE_X}</button>
        <div class="exm-head"><span class="glyph">${it.glyph}</span><div><div class="h-title">${it.label}</div>${it.sub ? `<div class="exm-sub" dir="ltr">${it.sub}</div>` : ""}</div></div>
        <div class="fr-sec what"><b>מה מאפיין את ההונאה?</b><p>${it.what}</p></div>
        <div class="fr-sec why"><b>למה חשוב לשים לב?</b><p>${it.why}</p></div>
        <div class="fr-sec how"><b>איך נמנעים?</b><p>${it.how}</p></div>
      </div>`;
    if (s.layout === "players") return `
      <div class="modal card ex-modal player-modal" role="dialog" aria-modal="true" aria-label="${it.title}">
        <button class="close-x" data-close="1" aria-label="סגירה">${CLOSE_X}</button>
        <div class="exm-head"><span class="ball ${it.ball}"></span><div class="h-title">${it.title}</div></div>
        <p class="pl-what"><b>מה זה?</b> ${it.what}</p>
        <div class="pl-info" data-info-box hidden></div>
        <div class="pl-cols">
          <div><b>${it.useTitle || "למה משתמשים בו?"}</b><ul>${it.use.map(u => `<li>${u}</li>`).join("")}</ul></div>
          <div><b>מה חשוב לזכור?</b><ul>${it.remember.map(u => `<li>${u}</li>`).join("")}</ul></div>
        </div>
        ${it.examples ? `<div class="pl-ex"><b>דוגמאות:</b>${it.examples.map(e => `<span class="ex-coin ${e.cls}"><i>${e.sym}</i>${e.name}</span>`).join("")}</div>` : ""}
      </div>`;
    // payment methods: Adam trains at that method's crossfit station beside the text (the GIF loads when the layer opens)
    const st = it.athlete && byStationHero(it.athlete);
    return `
      <div class="modal card ex-modal ${st ? "has-athlete" : ""}" role="dialog" aria-modal="true" aria-label="${it.label}">
        <button class="close-x" data-close="1" aria-label="סגירה">${CLOSE_X}</button>
        <div class="exm-grid">
          <div>
            <div class="exm-head"><img src="${ICON + it.icon}" alt=""><div class="h-title">${it.label}</div></div>
            ${it.body.map(p => `<p class="exm-p">${p}</p>`).join("")}
          </div>
          ${st ? `<div class="exm-athlete"><img data-gif="${it.athlete}" alt="אדם מתאמן – ${st.reps}"></div>` : ""}
        </div>
      </div>`;
  }
  R.explore = s => {
    const v = visited(s);
    const btn = (it, i) => {
      const art = s.layout === "fraud" ? `<span class="glyph">${it.glyph}</span>`
        : s.layout === "players" ? `<span class="ball ${it.ball}"></span>` : `<img src="${ICON + it.icon}" alt="">`;
      return `<button type="button" class="ex-btn ${v.includes(it.key) ? "seen" : ""} ${A("pop", 300 + i * 120)}" data-item="${it.key}">
        ${art}<span class="lbl">${it.label}</span>${s.layout === "players" && it.sub ? `<span class="lbl-sub" dir="ltr">(${it.sub})</span>` : ""}<span class="tick" aria-hidden="true">✓</span></button>`;
    };
    const heroes = { "adam": allVisited(s) ? likeImg() : hero("adam", 110, 190, 470, A("fly-l", 200)), "adam-hips": hero("adam-hips", 20, 190, 470, A("fly-l", 200)),
      "aya": hero("aya", 20, 186, 474, A("fly-l", 200)) };
    return `
      <img class="bg" src="${IMG}${s.layout === "players" ? "bg-tennis.jpg" : "bg-clean.jpg"}" alt="">
      <div class="q-scrim ${s.layout === "players" ? "strong" : ""}" aria-hidden="true"></div>
      ${s.layout === "players" ? "" : heroes[s.hero]}
      <div class="ex-wall ${s.layout || "methods"} ${A("fade", 0)}">
        <div class="h-title">${s.title}</div>
        <p class="txt ex-lead">${s.lead}</p>
        <div class="ex-grid">${s.items.map(btn).join("")}</div>
        <p class="ex-progress ${allVisited(s) ? "done" : ""}" data-ex-progress ${allVisited(s) && !s.noDoneMsg ? "" : "hidden"}>${progressText(s)}</p>
        ${s.afterAll ? `<div class="ex-after ${s.afterAll.always ? A("rise", 300 + s.items.length * 120 + 250) : ""}" data-after ${s.afterAll.always || allVisited(s) ? "" : "hidden"}><span class="ic-dark"><img src="${ICON + s.afterAll.icon}" alt=""></span><p>${s.afterAll.text}</p></div>` : ""}
        ${s.disclaimer ? `<p class="ex-disc">${s.disclaimer}</p>` : ""}
      </div>
      ${s.items.map(it => layerHtml("it-" + it.key, exploreLayer(s, it))).join("")}`;
  };
  // Adam's thumbs-up: a still (one frame of the like animation – no talking), placed so his feet and centre
  // match the standing Adam. Both sit toward the right, close to the buttons.
  const LIKE_BOX = [102, 185, 323, 485];
  const LIKE_SRC = IMG + "adam-like-still.png";
  const likeImg = () => `<img class="char" data-hero="adam-like" src="${LIKE_SRC}" alt="אדם עושה לייק" style="${pos(...LIKE_BOX)}">`;
  function progressText(s) {
    const n = visited(s).length, t = s.items.length;
    return n >= t ? "כל הכבוד! עברתם על הכל – אפשר להמשיך." : `צפיתם ב-${n} מתוך ${t}`;
  }
  function bindExplore(scr, s) {
    $$("[data-item]", scr).forEach(b => b.addEventListener("click", () => {
      const key = b.dataset.item;
      const g = $(`[data-layer="it-${key}"] img[data-gif]`, scr);
      if (g && !g.getAttribute("src")) g.src = IMG + g.dataset.gif + (still() ? ".png" : ANIM);   // the athlete's animation loads with its layer (a still when animations are off)
      const v = visited(s);
      if (!v.includes(key)) { state.visited[s.id] = v.concat(key); save(); }
      b.classList.add("seen");
      showLayer(scr, "it-" + key);
      playVO(s.id, ["layer:" + key]);
    }));
    $$("[data-info]", scr).forEach(b => b.addEventListener("click", () => {
      const box = $("[data-info-box]", b.closest(".modal"));
      box.innerHTML = s.info[b.dataset.info]; box.hidden = !box.hidden;
      // the term's explanation is narrated only here (it is cut out of the layer's narration); then the layer goes on
      const k = "info:" + b.dataset.info;
      if (!box.hidden && VO[s.id] && VO[s.id][k]) playVO(s.id, [k, k + ":then"]);
    }));
    if (s.hero === "adam" && !allVisited(s)) new Image().src = LIKE_SRC;        // preload the thumbs-up still
    scr._onLayerClose = () => {
      const prog = $("[data-ex-progress]", scr);
      prog.textContent = progressText(s);
      stopVO();
      if (allVisited(s) && !prog.classList.contains("done")) {
        playVO(s.id, ["all"]);                                // the closing line, once
        prog.hidden = !!s.noDoneMsg;                           // no "X מתוך 5" count – only the closing message (not on every screen)
        prog.classList.add("done", "a", "pop");
        // all the payment methods were opened – Adam gives a thumbs-up
        const h = $('[data-hero="adam"]', scr);
        if (h) { h.dataset.hero = "adam-like"; h.alt = "אדם עושה לייק"; Object.assign(h.style, { left: LIKE_BOX[0] + "px", top: LIKE_BOX[1] + "px", width: LIKE_BOX[2] + "px", height: LIKE_BOX[3] + "px" }); h.src = LIKE_SRC; }
      }
      const after = $("[data-after]", scr);
      if (after && allVisited(s) && after.hidden) { after.hidden = false; after.classList.add("a", "rise"); fixOrphans(after); }
      updateChrome(s);
    };
  }

  /* how-to: content straight on the veiled wall, character on the left */
  R.howto = s => {
    const tennis = s.hero === "tennis";
    const heroes = {
      "adam-hips": hero("adam-hips", 20, 190, 470, A("fly-l", 300)),
      "aya-hips": hero("aya-hips", 20, 186, 474, A("fly-l", 300)),
      "adam-cross": hero("adam-cross-stand", 18, 205, 450, A("fly-l", 300))
    };
    return `
      <img class="bg" src="${IMG}${tennis ? "bg-tennis.jpg" : "bg-clean.jpg"}" alt="">
      ${tennis ? "" : `<div class="q-scrim" aria-hidden="true"></div>${heroes[s.hero]}`}
      ${s.link ? calcLinkBtn(s.link, "slot") : ""}
      <div class="wall-content ${tennis ? "wide" : ""} ${A("rise", 150)}">
        <div class="h-title">${s.title}</div>
        <p class="txt wall-lead">${s.lead}</p>
        <ol class="steps">${s.steps.map(st => `<li>${st}</li>`).join("")}</ol>
        ${s.scoring ? `<div class="score-chips">${s.scoring.map(([k, v]) => `<span><span class="coin sm"></span><b>${v}</b> מטבעות ${k}</span>`).join("")}</div>` : ""}
        <p class="wall-success"><b class="t">${s.success.title}</b> ${s.success.text}</p>
        ${s.after ? `<p class="wall-after">${s.after}</p>` : ""}
        <div class="wall-actions"><button class="btn practice-btn" data-go="${s.next}">${s.button}</button></div>
      </div>`;
  };
  function calcLinkBtn(key, where) {
    return `<button type="button" class="calculator-link-btn ${where}" data-link="${key}" aria-label="מחשבון שערי החליפין היציגים של בנק ישראל">
      <img src="${ICON}calculator.gif" alt=""><span class="calc-tx"><span>מחשבון שערי חליפין</span><span>של בנק ישראל</span></span></button>`;
  }

  /* ---------------------------------------------------- crossfit stations */
  // each GIF is drawn on its own canvas – these boxes put the athlete's feet on y≈650, centred on x≈210,
  // and keep the figure ≤ 340px so even mid-jump the head stays well below the rep counter (bottom ≈ 182)
  const STATION_BOX = {
    "st1-squat": [4, 227, 376, 424], "st2-deadlift": [67, 153, 274, 498], "st3-rope": [23, 184, 378, 515],      // rope: the body is only ~70% of the canvas (the rope swings above the head) – scaled so the body matches the others
    "st4-box": [82, 163, 238, 492], "st5-pushup": [68, 340, 283, 425]      // push-up: 20% smaller than the others' scale
  };
  // the station GIFs are the "פעם אחת" versions: each loop is exactly one repetition, so n loops = n reps.
  // Loop lengths, read from the GIF frame delays:
  const REP_MS = { "st1-squat": 2360, "st2-deadlift": 5080, "st3-rope": 880, "st4-box": 2040, "st5-pushup": 2800 };
  /* progress bar of the five crossfit stations (top strip, between the coin counter and the chapter tag).
     Station 1 on the right (reading order). Done = ✓ + coins earned, current = highlighted; every step is a
     button, so the learner can move between the stations in any order. */
  const STATION_ICONS = ["pm-cash.gif", "pm-cards.gif", "pm-apps.gif", "pm-transfer.gif", "pm-wallet.gif"];
  const stationScreens = () => DATA.screens.filter(x => x.type === "station");
  const stationName = x => x.title.replace(/^תחנה \d+ – /, "").replace(/\s*\|.*$/, "");
  function stepperHtml(cur) {
    const steps = stationScreens().map((x, i) => {
      const a = ans(x.id), done = !!(a && a.completed), here = x.id === cur.id;
      const state = done ? `הושלמה, ${a.coins} מטבעות` : "טרם הושלמה";
      return `<button type="button" class="stp ${done ? "done" : ""} ${here ? "here" : ""}" data-go="${x.id}"
          ${here ? 'aria-current="step"' : ""} aria-label="תחנה ${i + 1} – ${stationName(x)}, ${state}${here ? " (התחנה הנוכחית)" : ""}">
        <span class="stp-dot"><img src="${ICON + STATION_ICONS[i]}" alt="">${done ? `<span class="stp-ok" aria-hidden="true">✓</span>` : ""}</span>
        <span class="stp-lbl">${i + 1}. ${stationName(x)}</span>
        ${done ? `<span class="stp-coins" aria-hidden="true">${a.coins}/20</span>` : ""}
      </button>`;
    }).join("");
    return `<nav class="st-stepper" aria-label="התקדמות בתחנות הקרוספיט"><span class="stp-line" aria-hidden="true"></span>${steps}</nav>`;
  }

  R.station = s => {
    const first = firstVisit;
    const box = STATION_BOX[s.hero];
    const row = (r, i) => `
      <div class="st-row" data-row="${i}" hidden>
        <p class="st-txt">${money(r.text)}</p>
        <div class="st-opts" role="radiogroup" aria-label="${r.text}">
          ${s.options.map((o, j) => `<button type="button" class="st-opt" role="radio" aria-checked="false" data-r="${i}" data-o="${j}">${o.replace(/\s*\((.+)\)$/, '<small class="opt-sub">($1)</small>')}</button>`).join("")}
        </div>
      </div>`;
    return `
      <img class="bg" src="${IMG}bg-clean.jpg" alt="">
      <div class="q-scrim light" aria-hidden="true"></div>
      <img class="char ${first ? A("fly-l", 150) : ""}" data-hero="${s.hero}" src="${IMG + s.hero}.png" alt="" style="${pos(...box)}">
      <div class="stepper-wrap" data-stepper>${stepperHtml(s)}</div>
      <div class="rep-badge ${first ? A("fly-t", 250) : ""}" aria-live="polite"><span class="rb-l">${s.reps}</span><span class="rb-v"><bdi data-reps>0</bdi> / ${s.rows.length}</span></div>
      <div class="card st-card ${s.wide ? "wide" : ""} ${first ? A("fly-b", 0) : ""}">
        <div class="st-head"><span class="num-chip">תחנה ${s.num}</span><span class="st-title">${s.title.replace(/^תחנה \d+ – /, "")}</span></div>
        <p class="st-lead">${s.lead}</p>
        <div class="st-rows">${s.rows.map(row).join("")}</div>
        <div class="st-foot">
          <button type="button" class="btn navy" data-check disabled>בדיקה</button>
          <button type="button" class="link-btn" data-reopen hidden>הצגת המשוב</button>
        </div>
      </div>
      <div class="st-fb" data-stfb hidden>
        <div class="inline-fb" data-inline-fb role="status" aria-live="polite" tabindex="-1"></div>
      </div>`;
  };
  function bindStation(scr, s) {
    const rows = $$("[data-row]", scr), btn = $("[data-check]", scr), heroImg = $("[data-hero]", scr);
    const reps = $("[data-reps]", scr), fbWrap = $("[data-stfb]", scr), fb = $("[data-inline-fb]", scr), reopen = $("[data-reopen]", scr);
    gifUrl(s.hero + ANIM);                                      // warm the animation
    const a0 = ans(s.id);
    const picks = a0 && a0.picks ? a0.picks.slice() : Array(s.rows.length).fill(null);
    const nextBtn = isLast(s) ? "לסיכום הסט" : "לתחנה הבאה";
    // no correct answer: the score instead of "כמעט! אדם השלים חזרה עבור כל תשובה נכונה" (Adam did no repetition)
    const fbZero = () => `עניתם נכון על 0 מתוך ${s.rows.length} תשובות.` + (s.fbZeroMore ? " " + s.fbZeroMore : "");
    const fbContent = (n, coins) => fbHtml(n === s.rows.length, n === s.rows.length ? s.fbFull : n === 0 ? fbZero() : s.fbPart, s.explain, coins,
      `<div class="ifb-actions"><button type="button" class="link-btn" data-hidefb>לצפייה בתשובות</button><button type="button" class="btn" data-go="${s.next}">${nextBtn}</button></div>`);
    const reveal = () => {                                     // a situation appears only after the previous one was answered
      let open = 0; while (open < rows.length - 1 && picks[open] != null) open++;
      rows.forEach((r, i) => {
        const show = isDone(s.id) || i <= open;
        if (show && r.hidden) { r.hidden = false; if (i > 0 && !isDone(s.id)) r.classList.add("a", "rise"); requestAnimationFrame(() => fixOrphans(r)); }
      });
      btn.disabled = isDone(s.id) || picks.some(p => p == null);
    };
    const paint = () => rows.forEach((r, i) => $$(".st-opt", r).forEach(o => {
      const on = +o.dataset.o === picks[i];
      o.classList.toggle("sel", on); o.setAttribute("aria-checked", on);
    }));
    const markFinal = () => rows.forEach((r, i) => $$(".st-opt", r).forEach(o => {
      const j = +o.dataset.o, c = s.rows[i].correct;
      o.disabled = true; o.classList.remove("sel");
      if (j === picks[i]) o.classList.add(j === c ? "ok" : "bad");
      else if (j === c && picks[i] !== c) o.classList.add("should");
    }));
    const openFb = (focus) => { fbWrap.hidden = false; reopen.hidden = true; const a = ans(s.id); a.fbOpen = true; save(); showFb(fb, a.correctCount === s.rows.length, fbContent(a.correctCount, a.coins), focus); };
    paint(); reveal();
    if (a0 && a0.completed) {
      markFinal(); reps.textContent = a0.correctCount;
      if (a0.fbOpen) openFb(false); else reopen.hidden = false;
    }
    $$(".st-opt", scr).forEach(o => o.addEventListener("click", () => {
      if (isDone(s.id)) return;
      picks[+o.dataset.r] = +o.dataset.o;
      paint(); reveal();
      setAns(s.id, { picks: picks.slice(), completed: false });
      // the narrator moves on: the next situation still open (after this one, else from the top) – or falls silent
      const r = +o.dataset.r, open = k => picks[k] == null;
      let next = s.rows.findIndex((x, k) => k > r && open(k)); if (next < 0) next = s.rows.findIndex((x, k) => open(k));
      if (next >= 0) playVO(s.id, [voRow(s.id, next)]); else stopVO();
    }));
    fbWrap.addEventListener("click", e => {
      if (e.target.closest("[data-hidefb]")) { fbWrap.hidden = true; reopen.hidden = false; const a = ans(s.id); a.fbOpen = false; save(); reopen.focus(); }
    });
    reopen.addEventListener("click", () => openFb(true));
    btn.addEventListener("click", () => {
      if (isDone(s.id) || picks.some(p => p == null)) return;
      let n = 0, coins = 0;
      s.rows.forEach((r, i) => { if (picks[i] === r.correct) { n++; coins += r.coins; } });
      setAns(s.id, { picks: picks.slice(), completed: true, correctCount: n, coins, fbOpen: true });
      markFinal(); updateChrome(s);
      $("[data-stepper]", scr).innerHTML = stepperHtml(s);   // this station now shows ✓ and its coins
      // Adam completes one repetition for every correct answer
      // crossfit exception to the "animate only when all is right" rule: Adam performs one repetition per
      // correct answer. The count follows the GIF's own rhythm (REP_MS) and starts once the GIF is on screen;
      // after the n-th repetition he returns to the still. No correct answers → he stays still.
      if (n > 0 && still()) reps.textContent = n;                    // animations off: the count, without the movement
      else if (n > 0) {
        const onRep = k => { if (heroImg.isConnected) { reps.textContent = k; bumpEl(reps.parentElement); } };
        playReps(heroImg, s.hero, n, onRep).then(exact => {
          if (exact) return;
          // fallback (browsers without ImageDecoder, or opened from disk): the plain GIF on a timer
          let k = 0;
          const period = REP_MS[s.hero];
          const tick = () => {
            if (!heroImg.isConnected) return;
            onRep(++k);
            if (k < n) setTimeout(tick, period);
            else showStill(heroImg, s.hero);                   // the n-th loop just ended – back to the still (same pose as frame 1)
          };
          let started = false;
          const go = () => { if (!started) { started = true; setTimeout(tick, period); } };
          // count from the moment the GIF is loaded / decoded – whichever comes first (1.5s safety net)
          heroImg.addEventListener("load", go, { once: true });
          heroImg.addEventListener("error", go, { once: true });
          playGif(heroImg, s.hero).then(() => { heroImg.decode().then(go, go); setTimeout(go, 1500); });
        });
      }
      playFeedbackSound(n === s.rows.length);
      setTimeout(() => { if (scr.classList.contains("active")) openFb(true); }, 900);
      playVO(s.id, [n === s.rows.length ? "full" : n === 0 ? "zero" : "part", "explain"], 900);   // "zero": only where recorded (slide 12)
    });
  }
  /* exact repetitions: the GIF is decoded here (WebCodecs ImageDecoder) and its frames are drawn on a canvas laid
     exactly over the still, with each frame's own duration. One complete pass over the frames = one repetition,
     so n correct answers always give n full movements – independent of how the browser times an <img> GIF.
     Resolves true when it ran, false when the browser can't do it (the caller then falls back to the timer). */
  async function playReps(img, base, n, onRep) {
    if (typeof ImageDecoder === "undefined") return false;
    let dec, cv;
    try {
      gifUrl(base + ANIM);                                     // makes sure the blob is being fetched
      const blob = await gifBlobs[base + ANIM];
      if (!blob || !img.isConnected) return false;
      dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: ANIM_TYPE });
      await dec.tracks.ready;
      const frames = dec.tracks.selectedTrack.frameCount;
      cv = document.createElement("canvas");
      cv.className = "char"; cv.setAttribute("aria-hidden", "true");
      cv.style.cssText = img.style.cssText;
      cv.width = Math.round(parseFloat(img.style.width) * 2); cv.height = Math.round(parseFloat(img.style.height) * 2);
      const g = cv.getContext("2d");
      img.after(cv);
      let shown = false, due = performance.now();
      for (let k = 1; k <= n; k++) {
        for (let i = 0; i < frames; i++) {
          if (!img.isConnected) return true;                   // the learner left the screen
          const { image } = await dec.decode({ frameIndex: i });
          const wait = due - performance.now();
          if (wait > 0) await new Promise(r => setTimeout(r, wait));
          g.clearRect(0, 0, cv.width, cv.height); g.drawImage(image, 0, 0, cv.width, cv.height);
          if (!shown) { shown = true; img.style.visibility = "hidden"; due = performance.now(); }
          due += (image.duration || 40000) / 1000;              // duration is in microseconds
          image.close();
        }
        const wait = due - performance.now();                  // let the last frame of the loop finish
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        onRep(k);
      }
      return true;
    } catch (e) {
      return false;
    } finally {
      if (dec) dec.close();
      if (cv) cv.remove();
      img.style.visibility = "";                               // back to the still
    }
  }
  const isLast = s => !byId[s.next] || byId[s.next].type === "summary";
  function bumpEl(el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }

  /* ------------------------------------------------- rate set (weights) */
  const BENCH = [71, 262, 371, 405];                 // aya-bench still + GIF share one canvas (90% of 412×450, a little lower)
  // flag emoji don't render on Windows – small drawn flags instead
  const FLAGS = {
    fr: `<svg viewBox="0 0 3 2"><path fill="#002395" d="M0 0h1v2H0z"/><path fill="#fff" d="M1 0h1v2H1z"/><path fill="#ED2939" d="M2 0h1v2H2z"/></svg>`,
    gb: `<svg viewBox="0 0 60 40"><path fill="#012169" d="M0 0h60v40H0z"/><path stroke="#fff" stroke-width="8" d="M0 0l60 40M60 0L0 40"/><path stroke="#C8102E" stroke-width="3" d="M0 0l60 40M60 0L0 40"/><path stroke="#fff" stroke-width="12" d="M30 0v40M0 20h60"/><path stroke="#C8102E" stroke-width="7" d="M30 0v40M0 20h60"/></svg>`,
    ch: `<svg viewBox="0 0 30 20"><path fill="#DA291C" d="M0 0h30v20H0z"/><path fill="#fff" d="M13 4h4v4h4v4h-4v4h-4v-4H9V8h4z"/></svg>`,
    jp: `<svg viewBox="0 0 30 20"><path fill="#fff" d="M0 0h30v20H0z"/><circle cx="15" cy="10" r="6" fill="#BC002D"/></svg>`
  };
  R.weights = s => {
    const first = s.num === 1 && firstVisit;
    const tag = (side, label, inner) => `<div class="plate-tag ${side}">${label ? `<span class="pt-l">${label}</span>` : ""}${inner}</div>`;
    let tags = "";
    if (s.kind === "two") tags = tag("right", s.rateLabel || "השער היציג", `<input class="answer-input" data-in="rate" inputmode="decimal" autocomplete="off" placeholder="0.0000" aria-label="${s.rateLabel || "השער היציג"}">`) +
      tag("left", "המחיר בשקלים", `<span class="in-wrap"><span class="cur">₪</span><input class="answer-input" data-in="price" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="המחיר בשקלים"></span>`);
    if (s.kind === "one") tags = tag("right", "המחיר הקודם", `<span class="fixed-val" dir="ltr">₪ ${s.fixed}</span>`) +
      tag("left", "המחיר החדש", `<span class="in-wrap"><span class="cur">₪</span><input class="answer-input" data-in="price" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="המחיר החדש בשקלים"></span>`);
    const deal = s.deal ? `
      <div class="deal ${s.deal.old ? "change" : ""}">
        ${s.deal.date ? `<div class="d-row"><span class="k">תאריך</span><span>${s.deal.date}</span></div>` : ""}
        <div class="d-row"><span class="k">מוצר</span><span>${s.deal.item}</span></div>
        <div class="d-row"><span class="k">מחיר</span><span>${s.deal.price}</span></div>
        ${s.deal.old ? `<div class="d-row"><span class="k">שער הדולר</span><span class="rate-move">${money(s.deal.old)} ← <b>${money(s.deal.now)}</b></span></div>` : ""}
      </div>` : "";
    const head = `<div class="w-head"><span class="num-chip">תרגיל ${s.num}</span><span class="w-title">${s.flag ? `<span class="flag" aria-hidden="true">${FLAGS[s.flag]}</span>` : ""}${s.icon ? `<span class="ic-dark sm"><img src="${ICON + s.icon}" alt=""></span>` : ""}${s.title}</span></div>`;
    let body;
    if (s.kind === "two") body = `
      ${head}
      <div class="w-grid">
        <div>
          <p class="w-story">${s.story}</p>
          ${s.warn ? `<p class="w-warn">${s.warn}</p>` : ""}
          <ol class="w-steps">
            <li>בדקו באתר בנק ישראל מה היה <b>השער היציג</b> בתאריך העסקה.</li>
            <li>חשבו במחשבון ההמרה כמה עלתה העסקה <b>בשקלים</b>.</li>
            <li>הזינו על <b>המשקולת הימנית</b> את השער היציג, ועל <b>השמאלית</b> את המחיר בשקלים.</li>
          </ol>
        </div>
        ${deal}
      </div>
      <p class="w-note">שימו לב – יש להזין את כל הספרות שאחרי הנקודה.</p>`;
    else if (s.kind === "one") body = `${head}<div class="w-grid"><div><p class="w-story">${s.story}</p><p class="w-task">${s.task}</p></div>${deal}</div>`;
    else body = `${head}
      ${s.rateChange ? `<div class="rate-change"><span>שער הדולר:</span>${money(s.rateChange[0])}<span class="ic-dark"><img src="${ICON}arrow-up.gif" alt="עלה ל"></span><b>${money(s.rateChange[1])}</b></div>` : `<p class="w-story">${s.story}</p>`}
      <p class="w-task">${s.task}</p>
      <div class="plate-opts ${s.long ? "long" : ""}">
        ${s.options.map((o, i) => `<button type="button" class="plate-opt" data-opt="${i}"><span class="disc" aria-hidden="true"></span><span class="po-t">${s.long ? ["א", "ב", "ג", "ד"][i] + ". " : ""}${o}</span></button>`).join("")}
      </div>`;
    return `
      <img class="bg" src="${IMG}bg-clean.jpg" alt="">
      <div class="q-scrim light" aria-hidden="true"></div>
      <img class="char ${first ? A("fly-l", 150) : ""}" data-hero="aya-bench" src="${IMG}aya-bench.png" alt="איה על ספסל הלחיצה" style="${pos(...BENCH)}">
      <div class="plate-tags ${first ? A("fade", 500) : ""}">${tags}</div>
      <div class="q-col w-col">
        <div class="card ex-card fit w-card ${first ? A("fly-b", 0) : ""}">
          ${body}
          <div class="answer-row">
            <button type="button" class="btn navy" data-check ${s.kind === "choice" ? "disabled" : ""}>בדיקה</button>
          </div>
        </div>
        <div class="inline-fb" data-inline-fb role="status" aria-live="polite" tabindex="-1" hidden></div>
      </div>
      ${calcLinkBtn("exchange", "slot")}`;
  };
  const num = str => { const c = String(str).replace(/,/g, "").replace(/[^\d.\-]/g, ""); return c ? parseFloat(c) : NaN; };
  function bindWeights(scr, s) {
    const btn = $("[data-check]", scr), fb = $("[data-inline-fb]", scr), heroImg = $("[data-hero]", scr);
    const inRate = $("[data-in=rate]", scr), inPrice = $("[data-in=price]", scr), inputs = [inRate, inPrice].filter(Boolean);
    const opts = $$("[data-opt]", scr);
    let sel = null;
    gifUrl("aya-bench" + ANIM);
    const lift = () => playGif(heroImg, "aya-bench");
    const finalFb = (ok, coins) => fbHtml(ok, ok ? s.fbCorrect : s.fbWrong, s.explain, ok ? coins : 0);
    const lockAll = () => { inputs.forEach(i => (i.disabled = true)); opts.forEach(o => (o.disabled = true)); btn.disabled = true; };
    // finished: the card drops its instructions and check button, so the full feedback fits above the stage edge
    const collapse = () => $(".w-card", scr).classList.add("done");
    const markInputs = res => inputs.forEach(i => { i.classList.remove("ok", "bad"); if (res[i.dataset.in] != null) i.classList.add(res[i.dataset.in] ? "ok" : "bad"); });
    const markOpts = (chosen, final) => opts.forEach((o, i) => {
      o.classList.remove("sel", "ok", "bad");
      if (i === chosen) o.classList.add(i === s.correct ? "ok" : "bad");
      else if (final && i === s.correct) o.classList.add("ok");
    });
    const check = () => {
      if (s.kind === "choice") return { ok: sel === s.correct, res: null };
      const res = {};
      if (inRate) res.rate = Math.abs(num(inRate.value) - s.rate) < 0.00005;
      if (inPrice) res.price = Math.abs(num(inPrice.value) - s.price) < 0.006;
      return { ok: Object.values(res).every(Boolean), res };
    };
    // restore
    const a = ans(s.id);
    if (a) {
      if (a.values) { if (inRate && a.values.rate != null) inRate.value = a.values.rate; if (inPrice && a.values.price != null) inPrice.value = a.values.price; }
      if (s.kind === "choice" && a.answer != null) sel = a.answer;
      if (a.completed) {
        lockAll(); collapse();
        if (s.kind === "choice") markOpts(sel, true); else markInputs(check().res);
        if (a.correct) lift();
        showFb(fb, a.correct, finalFb(a.correct, a.coins), false);
      } else if (a.attempts) {
        if (s.kind === "choice") markOpts(sel, false); else markInputs(check().res);
        if (a.fbOpen) { lockAll(); showFb(fb, false, retryHtml(), false); }
      }
    }
    // the first wrong try shows (and the narrator reads) the exercises own hint – fbWrong is written as a hint for another try
    function retryHtml() { return `<div class="ifb-row"><p class="ifb-head">${money(s.fbWrong)}${s.kind === "choice" ? "" : ' <span class="ifb-note">השדה השגוי מסומן באדום.</span>'}</p><button type="button" class="btn ifb-btn" data-retry>נסו שוב</button></div>`; }
    scr._retry = () => {
      const cur = ans(s.id); if (cur) { cur.fbOpen = false; save(); }
      fb.hidden = true; fb.innerHTML = "";
      inputs.forEach(i => { if (!i.classList.contains("ok")) i.disabled = false; });
      opts.forEach(o => { o.disabled = false; o.classList.remove("bad"); });
      sel = null; btn.disabled = s.kind === "choice";
      const firstBad = inputs.find(i => !i.disabled); if (firstBad) { firstBad.focus(); firstBad.select(); }
    };
    opts.forEach((o, i) => o.addEventListener("click", () => {
      if (isDone(s.id)) return;
      sel = i; opts.forEach((x, j) => x.classList.toggle("sel", j === i)); btn.disabled = false;
    }));
    inputs.forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); }));
    btn.addEventListener("click", () => {
      if (isDone(s.id)) return;
      if (s.kind === "choice" && sel == null) return;
      const empty = inputs.find(i => !i.disabled && !String(i.value).trim());
      if (empty) { empty.classList.remove("shake"); void empty.offsetWidth; empty.classList.add("shake"); toast("הזינו ערך בכל המשקולות"); empty.focus(); return; }
      const { ok, res } = check();
      const cur = ans(s.id) || { attempts: 0 };
      cur.attempts = (cur.attempts || 0) + 1;
      cur.values = { rate: inRate ? inRate.value : null, price: inPrice ? inPrice.value : null };
      cur.answer = sel; cur.correct = ok;
      const final = ok || cur.attempts >= 2;
      cur.completed = final; cur.fbOpen = true;
      if (ok) cur.coins = s.coins;
      setAns(s.id, cur); updateChrome(s);
      if (s.kind === "choice") markOpts(sel, final); else markInputs(res);
      lockAll();
      playFeedbackSound(ok);
      if (!final) { showFb(fb, false, retryHtml()); playVO(s.id, ["bad"], 300); return; }
      collapse();
      if (ok) lift();
      setTimeout(() => showFb(fb, ok, finalFb(ok, s.coins)), ok ? 700 : 300);
      playVO(s.id, ok ? ["ok", "explain"] : ["explain"], ok ? 700 : 300);   // after a second wrong try the hint is no longer relevant – only the solution
    });
  }

  /* ------------------------------------------------- safe pull (crossover) */
  const CROSS = [60, 190, 376, 470];
  function mockHtml(m) {
    const link = m.link ? `<span class="m-link">${m.link}</span>` : "";
    if (m.kind === "sms" || m.kind === "whatsapp") return `
      <div class="phone ${m.kind}">
        <div class="ph-bar"><span dir="ltr">${m.time}</span><span>▮▮▮ 🔋</span></div>
        <div class="ph-head"><span class="avatar">${m.kind === "whatsapp" ? "👤" : "✉"}</span><span class="who" dir="${/^[+\d]/.test(m.from) ? "ltr" : "auto"}">${m.from}</span></div>
        <div class="ph-body"><div class="bubble">${m.text}${link ? "<br>" + link : ""}<span class="b-time" dir="ltr">${m.time}</span></div></div>
        <div class="ph-input">${m.kind === "whatsapp" ? "הקלידו הודעה" : "הודעת טקסט"}</div>
      </div>`;
    if (m.kind === "call") return `
      <div class="phone call" data-call>
        <div class="call-top"><span class="avatar big">👤</span><b>${m.caller}</b><span dir="ltr">${m.number}</span><span class="call-state" data-call-state>שיחה נכנסת…</span></div>
        <div class="call-transcript" data-transcript hidden><span class="tr-l">המתקשר:</span>${m.text}</div>
        <div class="call-btns" data-call-btns>
          <button type="button" class="call-btn decline" data-decline aria-label="דחיית השיחה">✆</button>
          <button type="button" class="call-btn accept" data-accept aria-label="מענה לשיחה">✆</button>
        </div>
      </div>`;
    if (m.kind === "web") return `
      <div class="browser">
        <div class="br-bar"><span class="dots"><i></i><i></i><i></i></span><span class="url" dir="ltr">🔒 <span class="url-blur" aria-hidden="true">${m.url}</span></span></div>
        <div class="br-page">
          <div class="br-nav"><span class="logo">🏦 ${m.brand}</span><span class="nav-l">פרטיים · עסקים · הלוואות</span></div>
          <div class="br-hero"><b>${m.head}</b><p>${m.text}</p></div>
          <div class="br-form"><span class="fld">מספר תעודת זהות</span><span class="fld">סיסמה</span><span class="fld">מספר כרטיס</span><span class="go">קבלו את הזיכוי ›</span></div>
        </div>
      </div>`;
    if (m.kind === "mail") return `
      <div class="mail">
        <div class="ml-top"><b>${m.subject}</b></div>
        <div class="ml-from"><span class="avatar">${m.from.charAt(0)}</span><span><b>${m.from}</b>${m.addr ? `<br><span class="addr" dir="ltr">&lt;${m.addr}&gt;</span>` : ""}</span></div>
        <div class="ml-body">${m.lines.map(l => `<p>${l}</p>`).join("")}</div>
        ${m.attach ? `<div class="ml-att"><span class="att-ic">📎</span><span dir="ltr">${m.attach}</span></div>` : ""}
      </div>`;
    return `
      <div class="phone app">
        <div class="ph-bar"><span dir="ltr">10:24</span><span>▮▮▮ 🔋</span></div>
        <div class="app-body"><div class="app-logo">🏦</div><b>${m.brand}</b><div class="face-id" aria-hidden="true"><span></span></div><p>${m.text}</p><span class="app-btn">הזדהות</span></div>
      </div>`;
  }
  R.pull = s => {
    const first = s.num === 1 && firstVisit;
    const handle = (key, label, side) => `
      <button type="button" class="handle-btn ${side}" data-pull="${key}">
        <span class="hb-l"><span class="hb-ic" aria-hidden="true">${key === "safe" ? "✓" : "!"}</span>${label}</span>
        <span class="hb-meter" aria-hidden="true"><span class="hb-fill"></span></span>
      </button>`;
    return `
      <img class="bg" src="${IMG}bg-clean.jpg" alt="">
      <div class="q-scrim light" aria-hidden="true"></div>
      <img class="char ${first ? A("fly-l", 150) : ""}" data-hero="adam-cross" src="${IMG}adam-cross-stand.png" alt="אדם עומד במכשיר הקרוס אובר, ידיו על מותניו" style="${pos(...CROSS)}">
      <div class="handles ${first ? A("fade", 500) : ""}">${handle("suspect", "חשוד", "left")}${handle("safe", "בטוח", "right")}</div>
      <div class="card pull-card ${first ? A("fly-b", 0) : ""}">
        <div class="pc-text">
          <span class="num-chip">שאלה ${s.num}</span>
          <div class="pc-title">${s.title}</div>
          <p class="pc-intro">${s.intro}</p>
          <p class="pc-hint" data-hint>בטוח או חשוד? משכו את הידית המתאימה.</p>
          <div class="inline-fb" data-inline-fb role="status" aria-live="polite" tabindex="-1" hidden></div>
        </div>
        <div class="pc-mock">${mockHtml(s.mock)}</div>
      </div>`;
  };
  function bindPull(scr, s) {
    const btns = $$("[data-pull]", scr), fb = $("[data-inline-fb]", scr), heroImg = $("[data-hero]", scr), hint = $("[data-hint]", scr);
    /* Adam starts standing in the machine; whichever handle is clicked – right or wrong answer – he pulls with the
       arm on that side: the right-hand button (בטוח) → his LEFT arm (on the screen's right), the left-hand button
       (חשוד) → his RIGHT arm. (Client's choice for this set; elsewhere characters move only on a correct answer.) */
    const PULL_GIF = { right: "adam-pull-his-left", left: "adam-pull-his-right" };
    const sideOf = key => $(`[data-pull="${key}"]`, scr).classList.contains("right") ? "right" : "left";
    const call = $("[data-call]", scr);
    if (call) {
      const pick = () => { $("[data-transcript]", call).hidden = false; $("[data-call-btns]", call).hidden = true; $("[data-call-state]", call).textContent = "שיחה פעילה"; call.classList.add("live"); };
      $("[data-accept]", call).addEventListener("click", () => { pick(); playVO(s.id, ["enter:2"]); });   // the caller speaks
      $("[data-decline]", call).addEventListener("click", () => toast("נסו לענות – כדי לשמוע מה המתקשר מבקש"));
      if (isDone(s.id)) pick();
    }
    const finish = (key, animate) => {
      const ok = key === s.correct;
      btns.forEach(b => {
        b.disabled = true;
        const mine = b.dataset.pull === key;
        b.classList.toggle("chosen", mine);
        if (mine) b.classList.add(ok ? "ok" : "bad");
        else if (b.dataset.pull === s.correct) b.classList.add("should");
      });
      hint.hidden = true;
      playGif(heroImg, PULL_GIF[sideOf(key)]);
      // he now pulls on a wrong answer too, so "אדם נעצר באמצע המשיכה" no longer describes what is seen
      const head = ok ? "זיהיתם נכון!<br>אדם משלים את המשיכה." : "הכיוון הפעם לא היה נכון.";
      const fill = () => showFb(fb, ok, fbHtml(ok, head, s.explain, ok ? s.coins : 0), animate);
      if (animate) setTimeout(fill, ok ? 900 : 700); else fill();
    };
    const a = ans(s.id);
    if (a && a.completed) finish(a.answer, false);
    btns.forEach(b => b.addEventListener("click", () => {
      if (isDone(s.id)) return;
      const key = b.dataset.pull, ok = key === s.correct;
      setAns(s.id, { completed: true, answer: key, correct: ok, coins: ok ? s.coins : 0 });
      updateChrome(s);
      playFeedbackSound(ok);
      if (!ok) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); }
      finish(key, true);
      playVO(s.id, [ok ? "ok" : "bad", "explain"], ok ? 900 : 700);
    }));
  }

  /* ------------------------------------------------- ad + safe stop */
  R.ad = s => `
    <img class="bg" src="${IMG}bg-ad.jpg" alt="פרסומת על הקיר: רוצים להמשיך להתאמן גם אחרי הלומדה? מנוי מיוחד לחדר הכושר בחינם מחכה למאה התלמידים הראשונים שיירשמו. לחצו וקבלו את כל הפרטים.">
    <button type="button" class="ad-btn ${A("pop", 600)}" data-ad="clicked">אני רוצה פרטים!</button>
    <button type="button" class="skip-btn ${A("fade", 1200)}" data-ad="skipped">דילוג ›</button>`;
  function bindAd(scr, s) {
    $$("[data-ad]", scr).forEach(b => b.addEventListener("click", () => { state.ad = b.dataset.ad; save(); goTo(s.next); }));
  }
  /* Adam reacts to the ad choice: skipped → happy (thumbs-up still), clicked → disappointed ("אדם מאוכזב",
     same 1024×1536 canvas as adam.png; placed so his feet and centre line up with the happy version) */
  const stopHero = () => state.ad === "skipped"
    ? `<img class="char ${A("fly-l", 300)}" data-hero="adam-like" src="${LIKE_SRC}" alt="אדם מחייך ומרים אגודל" style="${pos(LIKE_BOX[0] - 2, LIKE_BOX[1], LIKE_BOX[2], LIKE_BOX[3])}">`
    : `<img class="char ${A("fly-l", 300)}" data-hero="adam-sad" src="${IMG}adam-sad.png" alt="אדם מאוכזב, ידיו שלובות" style="${pos(95, 178, 313, 470)}">`;
  R.stop = s => `
    <img class="bg" src="${IMG}bg-clean.jpg" alt="">
    <div class="q-scrim" aria-hidden="true"></div>
    ${stopHero()}
    <div class="stop-wall ${A("rise", 100)}">
      <div class="stop-head"><span class="stop-sign" aria-hidden="true">STOP</span><div class="h-title">עצירה בטוחה!</div></div>
      <p class="txt">${s.texts[state.ad === "skipped" ? "skipped" : "clicked"]}</p>
      <p class="stop-sub">לפני שלוחצים, כדאי לעצור ולבדוק:</p>
      <ul class="stop-list">${s.checks.map(c => `<li><span class="q" aria-hidden="true">?</span>${c}</li>`).join("")}</ul>
      <p class="stop-out">${s.outro}</p>
      <div class="wall-actions"><button class="btn practice-btn" data-go="${s.next}">${s.button}</button></div>
    </div>`;

  /* ------------------------------------------------- tennis (set 4) */
  const ROUND_COINS = [25, 20, 10];          // coins for identifying the player after clue 1 / 2 / 3
  R.tennis = s => {
    const first = s.num === 1 && firstVisit;
    return `
      <img class="bg" src="${IMG}bg-tennis.jpg" alt="איה עומדת במגרש טניס מול יריב מסתורי">
      <video class="bg hit-video" data-hit src="${VID}tennis-hit.mp4" muted playsinline preload="auto" aria-hidden="true" tabindex="-1" hidden></video>
      <div class="opp-mark" data-opp aria-live="polite"><span class="qm">?</span></div>
      <div class="tn-board ${first ? A("fly-t", 0) : ""}"><b>מקצה ${s.num}</b><span class="tn-dots">${s.clues.map((c, i) => `<i data-dot="${i}"></i>`).join("")}</span></div>
      <div class="tn-clues" data-clues>
        ${s.clues.map((c, i) => `<div class="tn-clue" data-clue="${i}" hidden><span class="tc-n">חבטה ${i + 1}</span><span class="tc-t">${c}</span></div>`).join("")}
      </div>
      <div class="tn-panel" data-panel>
        <div class="tn-actions" data-actions>
          <button type="button" class="btn" data-know>אני יודע/ת מי זה</button>
          <button type="button" class="btn cyan" data-more>רמז נוסף</button>
        </div>
        <div class="tn-choice" data-choice hidden>
          <p class="tn-q">מי עומד מעבר לרשת?</p>
          <div class="tn-opts">${Object.keys(PLAYERS).map(k => `<button type="button" class="tn-opt" data-p="${k}"><span class="ball ${PLAYERS[k].ball}"></span>${PLAYERS[k].short}</button>`).join("")}</div>
          <button type="button" class="btn navy" data-check disabled>בדיקה</button>
        </div>
        <div class="inline-fb" data-inline-fb role="status" aria-live="polite" tabindex="-1" hidden></div>
      </div>`;
  };
  function bindTennis(scr, s) {
    const clues = $$("[data-clue]", scr), dots = $$("[data-dot]", scr), actions = $("[data-actions]", scr), choice = $("[data-choice]", scr);
    const more = $("[data-more]", scr), know = $("[data-know]", scr), check = $("[data-check]", scr), fb = $("[data-inline-fb]", scr);
    const opts = $$("[data-p]", scr), opp = $("[data-opp]", scr), vid = $("[data-hit]", scr);
    let sel = null, busy = false;
    const a = ans(s.id) || { clue: 1, wrong: [] };
    if (!ans(s.id)) setAns(s.id, a);
    const showClues = () => {
      clues.forEach((c, i) => { const on = i < a.clue; if (on && c.hidden) { c.hidden = false; if (i > 0) c.classList.add("a", "fly-r"); requestAnimationFrame(() => fixOrphans(c)); } });
      dots.forEach((d, i) => d.classList.toggle("on", i < a.clue));
      more.disabled = a.clue >= 3 || busy;
      more.hidden = a.clue >= 3;
    };
    const reveal = () => {
      const p = PLAYERS[s.correct];
      opp.className = "opp-mark revealed " + p.ball;
      opp.innerHTML = `<span class="ball ${p.ball}"></span><span class="nm">${p.name}</span>`;
    };
    const nextLabel = isLast(s) ? "לסיכום הסט" : "למקצה הבא";
    const endFb = ok => {
      actions.hidden = true; choice.hidden = true;
      const head = ok ? "זיהיתם נכון." : "הפעם הנקודה ליריב.";
      return fbHtml(ok, head, ok ? s.fbCorrect : s.fbLost, ok ? a.coins : 0, `<div class="ifb-actions"><button type="button" class="btn" data-go="${s.next}">${nextLabel}</button></div>`);
    };
    const hit = done => {                                  // short rally: the hitting video plays once over the court
      if (still()) return done();                          // animations off: straight on
      busy = true; more.disabled = true; know.disabled = true;
      let finished = false;
      const end = () => { if (finished) return; finished = true; vid.hidden = true; busy = false; know.disabled = false; done(); };
      vid.hidden = false;
      try { vid.currentTime = 0; const p = vid.play(); if (p) p.catch(end); } catch (e) { end(); }
      vid.onended = end; vid.onerror = end;
      setTimeout(end, 4500);                               // never wait longer than this
    };
    showClues();
    if (a.completed) { reveal(); showFb(fb, a.correct, endFb(a.correct), false); }
    know.addEventListener("click", () => {
      actions.hidden = true; choice.hidden = false; fb.hidden = true;
      playVO(s.id, ["ask"]);
      opts.forEach(o => { o.disabled = a.wrong.includes(o.dataset.p); o.classList.toggle("bad", a.wrong.includes(o.dataset.p)); });
      sel = null; check.disabled = true; opts.forEach(o => o.classList.remove("sel"));
      const f = opts.find(o => !o.disabled); if (f) f.focus();
    });
    more.addEventListener("click", () => { if (a.clue < 3 && !busy) hit(() => { a.clue++; save(); showClues(); playVO(s.id, ["clue" + a.clue]); }); });
    opts.forEach(o => o.addEventListener("click", () => {
      if (o.disabled) return;
      sel = o.dataset.p; opts.forEach(x => x.classList.toggle("sel", x === o)); check.disabled = false;
    }));
    check.addEventListener("click", () => {
      if (!sel || a.completed) return;
      const ok = sel === s.correct;
      playFeedbackSound(ok);
      // only a correct answer animates: Aya returns the ball (the hitting video), then the feedback
      if (ok) {
        a.completed = true; a.correct = true; a.coins = ROUND_COINS[a.clue - 1]; setAns(s.id, a); updateChrome(s);
        reveal(); choice.hidden = true;
        hit(() => { showFb(fb, true, endFb(true)); playVO(s.id, [voShared("okHead"), "ok"]); }); return;
      }
      a.wrong.push(sel);
      if (a.clue >= 3) {
        a.completed = true; a.correct = false; a.coins = 0; setAns(s.id, a); updateChrome(s);
        reveal(); showFb(fb, false, endFb(false)); playVO(s.id, [voShared("lostHead"), "lost"]); return;
      }
      setAns(s.id, a);
      choice.hidden = true;
      showFb(fb, false, `<div class="ifb-row"><p class="ifb-head">הכדור חזר למגרש.</p></div><div class="ifb-body">ממשיכים לחבטה הבאה ומקבלים רמז נוסף.</div>`);
      playVO(s.id, ["again", "clue" + (a.clue + 1)]);                     // then straight on to the next clue
      // wrong: Aya stays still – after the short feedback the next clue simply appears (no hitting animation)
      setTimeout(() => { if (!scr.classList.contains("active")) return; a.clue++; save(); fb.hidden = true; actions.hidden = false; showClues(); }, 2200);
    });
  }

  /* ---------------------------------------------------- summaries */
  R.summary = s => {
    const score = setScore(s.set);
    const heroes = { "adam-flex": hero("adam-flex", 40, 200, 460, A("fly-l", 300)), "aya-flex": hero("aya-flex", 40, 200, 460, A("fly-l", 300)) };
    return `
      <img class="bg" src="${IMG}bg-clean.jpg" alt="">
      ${heroes[s.hero]}
      <div class="star-badge ${A("pop", 900)}" style="${pos(262, 104, 110, 110)}"><img src="${ICON}star.gif" alt=""></div>
      <div class="card sum-card ${A("fly-b", 0)}">
        <div class="h-title" style="font-size:27px">${s.title}</div>
        <div class="score-line ${A("pop", 500)}"><span class="coin"></span>צברתם <span class="big">${score}</span> מתוך ${SETS[s.set].total} מטבעות</div>
        <p class="h-sub" style="margin-top:8px">מה למדנו בסט?</p>
        <p class="txt" style="font-size:17.5px">${s.learned}</p>
        <ul class="bul">${s.bullets.map(b => `<li>${b}</li>`).join("")}</ul>
        <p class="closing">${s.closing}</p>
      </div>`;                                   // no "חזרה לאימון" button – the home button returns to the menu
  };

  /* ---------------------------------------------------- stretching */
  R.stretchIntro = s => `
    <img class="bg" src="${IMG}bg-main.jpg" alt="">
    ${hero("adam", 25, 200, 460, A("fly-l", 300))}
    ${hero("aya", 868, 195, 465, A("fly-r", 400))}
    <div class="warmup-panel stretch-panel ${A("fade", 0)}">
      <div class="h-title" style="font-size:29px">${s.title}</div>
      <p class="txt" style="margin-top:8px;font-size:19px">${s.lead}</p>
      <p class="h-sub" style="margin-top:10px;font-size:20px">איך זה יעבוד?</p>
      <p class="txt" style="font-size:18px">${s.how}</p>
      <div class="chips two" style="margin-top:6px">${s.topics.map(t => `<span>${t}</span>`).join("")}</div>
      <div style="display:flex;gap:10px;margin-top:12px">
        ${s.rules.map(r => `<div class="rule ${r.good ? "good" : "badr"}">${r.text}</div>`).join("")}
      </div>
      <p class="txt" style="font-size:18px;margin-top:10px"><b>${s.goal}</b></p>
      <div style="margin-top:12px;text-align:center"><button class="btn practice-btn" data-go="${s.next}">${s.button}</button></div>
    </div>`;

  // Aya and Adam take turns stretching: each GIF canvas is placed so the figure's feet land on y 655, left edge x 60
  const STRETCH = [
    { file: "aya-stretch", box: [-72, 53, 424, 617] },
    { file: "adam-stretch", box: [-82, 88, 464, 587] }
  ];
  R.mcq = s => {
    const first = s.num === 1 && firstVisit, g = STRETCH[(s.num - 1) % 2];
    return `
      <img class="bg" src="${IMG}bg-clean.jpg" alt="">
      <div class="q-scrim" aria-hidden="true"></div>
      <img class="char ${first ? A("fly-l", 150) : ""}" data-hero="${g.file}" src="${IMG + g.file}.png" alt="" style="${pos(...g.box)}">
      <div class="bank ${first ? A("fly-t", 100) : ""}" data-bank title="מטבעות בקופה"><span class="coin"></span><span class="v" data-bank-v>${bank()}</span></div>
      <div class="q-wall${s.wide ? " wide-opts" : ""}">
        ${s.story ? `<p class="qw-story">${s.story}</p>` : ""}
        <p class="qw-question">${s.question}</p>
        <p class="qw-hint">בחרו בתשובה הנכונה</p>
        <div class="qw-options">
          ${s.options.map((o, i) => `<button type="button" class="qw-opt ${first ? A("fly-r", 250 + i * 150) : ""}" data-opt="${i}">${o}</button>`).join("")}
        </div>
        <div class="inline-fb" data-inline-fb role="status" aria-live="polite" tabindex="-1" hidden></div>
      </div>`;
  };
  function bindMcq(scr, s) {
    const opts = $$("[data-opt]", scr), fb = $("[data-inline-fb]", scr);
    const showFinal = chosen => opts.forEach((o, i) => {
      o.disabled = true;
      if (i === s.correct) o.classList.add("ok"); else if (i === chosen) o.classList.add("bad");
    });
    const fbFor = ok => `<div class="ifb-row"><p class="ifb-head">${ok ? s.fbCorrect : s.fbWrong}</p><span class="ifb-coins"><span class="coin sm"></span>נשארו ${bank()} מטבעות</span></div><div class="ifb-body">${money(s.explain)}</div>`;
    // Aya / Adam stand still and stretch only after a correct answer
    const heroImg = $("[data-hero]", scr), train = () => playGif(heroImg, heroImg.dataset.hero);
    gifUrl(heroImg.dataset.hero + ANIM);
    const a = ans(s.id);
    if (a && a.completed) { showFinal(a.answer); showFb(fb, a.correct, fbFor(a.correct), false); if (a.correct) train(); }
    opts.forEach(o => o.addEventListener("click", () => {
      if (isDone(s.id)) return;
      const sel = +o.dataset.opt, ok = sel === s.correct;
      setAns(s.id, { completed: true, answer: sel, correct: ok });
      showFinal(sel); playFeedbackSound(ok);
      if (ok) train();
      if (!ok) coinsOut(scr);
      setTimeout(() => showFb(fb, ok, fbFor(ok)), ok ? 500 : 1300);
      playVO(s.id, [ok ? "ok" : "bad", "explain"], ok ? 500 : 1300);
    }));
  }
  function coinsOut(scr) {
    const bankEl = $("[data-bank]", scr), v = $("[data-bank-v]", scr);
    const start = +v.textContent, end = bank();
    for (let k = 0; k < 10; k++) {
      const c = document.createElement("span");
      c.className = "coin fly-coin";
      c.style.left = (bankEl.offsetLeft + 12) + "px"; c.style.top = (bankEl.offsetTop + 10) + "px";
      scr.appendChild(c);
      setTimeout(() => {
        c.style.transform = `translate(${-40 + Math.random() * 220}px, ${260 + Math.random() * 180}px) rotate(${Math.random() * 540}deg)`;
        c.style.opacity = 0; v.textContent = Math.max(end, start - (k + 1));
      }, 60 + k * 70);
      setTimeout(() => c.remove(), 1400 + k * 70);
    }
    bankEl.classList.add("shake"); setTimeout(() => bankEl.classList.remove("shake"), 600);
  }
  R.incomplete = s => `
    <img class="bg" src="${IMG}bg-clean.jpg" alt="">
    <div class="q-scrim" aria-hidden="true"></div>
    <div class="incomplete-wall ${A("fade", 0)}">${s.lines.map(l => `<p>${l}</p>`).join("")}</div>`;
  R.stretchEnd = s => {
    const b = bank();
    const band = b >= 80 ? "אלופי הכושר הפיננסי! 🏆" : b >= 50 ? "בכושר טוב, יש עוד לאן להשתפר!" : "צריך להמשיך להתאמן…";
    return `
      <img class="bg" src="${IMG}bg-clean.jpg" alt="">
      ${hero("aya-adam-like", 95, 150, 520, A("fly-l", 300), "איה ואדם מחייכים ועושים לייק")}
      <div class="card sum-card narrow ${A("fly-b", 0)}">
        <div class="h-title">${s.title}</div>
        ${s.hideScore ? "" : `<div class="score-line ${A("pop", 500)}"><span class="coin"></span>נשארו לכם <span class="big">${b}</span> מתוך 100 מטבעות בקופה</div>
        <p class="h-sub" style="margin-top:8px">${band}</p>`}
        <p class="txt" style="font-size:18px;margin-top:6px">${s.learned}</p>
        <ul class="bul">${s.bullets.map(x => `<li>${x}</li>`).join("")}</ul>
        <p class="closing">${s.closing}</p>
      </div>`;
  };

  /* ---------------------------------------------------- advanced */
  const CARD_ART = {
    podcast: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="17" y="6" width="14" height="24" rx="7" fill="#0B2B3B"/><path d="M11 22a13 13 0 0 0 26 0" fill="none" stroke="#0B2B3B" stroke-width="3" stroke-linecap="round"/><path d="M24 35v7M17 42h14" stroke="#0B2B3B" stroke-width="3" stroke-linecap="round"/></svg>`,
    shield: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4l16 6v12c0 11-7 19-16 22C15 41 8 33 8 22V10z" fill="#0B2B3B"/><path d="M17 24l5 5 9-10" fill="none" stroke="#66D1E3" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };
  R.advanced = s => `
    <img class="bg" src="${IMG}bg-clean.jpg" alt="">
    ${hero("adam-flex", -12, 193, 461, A("fly-l", 200))}
    ${hero("aya-flex", 900, 190, 464, A("fly-r", 200))}
    <div class="adv-shade" aria-hidden="true"></div>
    <div class="adv-lead ${A("fly-t", 0)}">
      <p class="l1">${s.lines[0]}</p>
      ${s.lines.slice(1).map(l => `<p class="l2">${l}</p>`).join("")}
    </div>
    <div class="adv-cards">
      ${s.cards.map((c, i) => `
        <button type="button" class="adv-card ${A("fly-b", 300 + i * 140)}" data-link="${c.url}">
          <span class="thumb ${c.icon}">${CARD_ART[c.icon]}<span class="kind">${c.kind}</span></span>
          <span class="ttl">${c.title}</span>
          <span class="tx">${c.text}</span>
          <span class="go">${linkUrl(c.url) ? "מעבר לתוכן ←" : "קישור יתווסף בהמשך"}</span>
        </button>`).join("")}
    </div>
    <p class="adv-outro ${A("fade", 1000)}">${s.outro}</p>`;

  const BIND = { boost: bindBoost, station: bindStation, weights: bindWeights, pull: bindPull, tennis: bindTennis, mcq: bindMcq, explore: bindExplore, ad: bindAd };

  /* ------------------------------------------------------------ building */
  const screensEl = $("#screens");
  function build(s) {
    const div = document.createElement("div");
    div.className = "screen";
    div.id = "scr-" + s.id;
    div.dataset.type = s.type;
    // for screen readers: each slide is a named region; it gets the focus when it opens (see goTo), so its name is read
    div.setAttribute("role", "region");
    div.setAttribute("aria-label", String(s.title || s.name).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    div.tabIndex = -1;
    div.innerHTML = R[s.type](s);
    $$("[data-d]", div).forEach(el => el.style.setProperty("--d", el.dataset.d + "ms"));
    $$(".a", div).forEach(el => el.addEventListener("animationend", e => { if (e.target === el) el.classList.remove("a"); }));
    return div;
  }
  /* no lone word on the last line (see the ribit unit): the last space becomes a no-break space when needed */
  const NO_JOIN = /[A-Za-z=+×÷≈−\/@]/;          // numbers and ₪ may be joined; Latin words, equations and URLs are left alone
  function fixOrphans(root) {
    $$("p, li, .h-title, .ifb-head, .btn, .lbl, .ttl, .tx, .st-txt, .pc-title, .tc-t", root).forEach(el => {
      if (el.offsetParent === null) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = []; while (walker.nextNode()) if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
      const last = nodes[nodes.length - 1]; if (!last || last.parentElement.closest("bdi")) return;
      const txt = last.textContent, m = txt.match(/(\S+)\s*$/); if (!m) return;
      const wordStart = m.index, sp = txt.lastIndexOf(" ", wordStart - 1);
      if (sp < 0 || sp !== wordStart - 1) return;
      const prevWord = (txt.slice(0, sp).match(/(\S+)$/) || [""])[0];
      if (!prevWord || NO_JOIN.test(m[1]) || NO_JOIN.test(prevWord)) return;
      const r1 = document.createRange(); r1.setStart(last, wordStart); r1.setEnd(last, wordStart + m[1].length);
      const r0 = document.createRange(); r0.setStart(last, sp - prevWord.length); r0.setEnd(last, sp);
      const a = r0.getClientRects(), b = r1.getClientRects(); if (!a.length || !b.length) return;
      if (b[0].top - a[a.length - 1].top > 2) last.textContent = txt.slice(0, sp) + " " + txt.slice(sp + 1);
    });
  }
  function setMachineHover(scr, set, on) {
    $$(`[data-machine-hit="${set}"]`, scr).forEach(m => m.classList.toggle("hover", on));
    $$(`.machine-pill[data-machine="${set}"]`, scr).forEach(p => p.classList.toggle("hover", on));
  }
  function bindCommon(scr, s) {
    scr.addEventListener("click", e => {
      const go = e.target.closest("[data-go]");
      if (go) return goTo(go.dataset.go);
      if (e.target.closest("[data-retry]")) { if (scr._retry) scr._retry(); return; }
      const link = e.target.closest("[data-link]");
      if (link) return openLink(link.dataset.link);
      if (e.target.closest("[data-close]") || e.target.classList.contains("dim")) {
        const L = e.target.closest(".layer"); if (L) { hideLayer(L); if (scr._onLayerClose) scr._onLayerClose(); }
        return;
      }
      // ▶ on a video screen: the finished film opens over the whole stage; a slot without a film shows the black placeholder
      if (e.target.closest("[data-play-slot]")) {
        const v = VIDEOS[s.video];
        if (v && (v.yt || v.file)) openFilm(scr, v);
        else $("[data-blank]", scr).hidden = false;
        return;
      }
    });
    scr.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      const L = $(".layer.show", scr); if (L) { hideLayer(L); if (scr._onLayerClose) scr._onLayerClose(); }
    });
    // menu: machines are transparent PNGs – only their opaque pixels react; the door is a clipped hotspot
    $$("[data-machine-hit]", scr).forEach(el => {
      const set = el.dataset.machineHit;
      if (el.dataset.door) {
        el.addEventListener("pointerenter", () => setMachineHover(scr, set, true));
        el.addEventListener("pointerleave", () => setMachineHover(scr, set, false));
        el.addEventListener("click", () => goTo(el.dataset.goMachine));
        return;
      }
      let alpha = null;
      const prep = () => {
        const c = document.createElement("canvas"); c.width = el.naturalWidth; c.height = el.naturalHeight;
        const g = c.getContext("2d"); g.drawImage(el, 0, 0);
        try { alpha = g.getImageData(0, 0, c.width, c.height).data; } catch (e) { alpha = null; }
      };
      if (el.complete && el.naturalWidth) prep(); else el.addEventListener("load", prep, { once: true });
      const opaqueAt = e => {
        if (!alpha) return true;
        const r = el.getBoundingClientRect();
        const x = Math.floor((e.clientX - r.left) / r.width * el.naturalWidth), y = Math.floor((e.clientY - r.top) / r.height * el.naturalHeight);
        return alpha[(y * el.naturalWidth + x) * 4 + 3] > 40;
      };
      el.addEventListener("pointermove", e => setMachineHover(scr, set, opaqueAt(e)));
      el.addEventListener("pointerleave", () => setMachineHover(scr, set, false));
      el.addEventListener("click", e => { if (opaqueAt(e)) goTo(el.dataset.goMachine); });
    });
    $$(".machine-pill[data-machine]", scr).forEach(p => {
      const set = p.dataset.machine;
      p.addEventListener("pointerenter", () => setMachineHover(scr, set, true));
      p.addEventListener("pointerleave", () => setMachineHover(scr, set, false));
      p.addEventListener("focus", () => setMachineHover(scr, set, true));
      p.addEventListener("blur", () => setMachineHover(scr, set, false));
      p.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goTo(p.dataset.go); } });
    });
    const bgVideo = $("video.bg[autoplay]", scr);
    if (bgVideo) { if (still()) bgVideo.pause(); else bgVideo.play().catch(() => {}); }   // a still frame when animations are off
    if (BIND[s.type]) BIND[s.type](scr, s);
  }

  DATA.screens.forEach(s => screensEl.appendChild(build(s)));

  /* -------------------------------------------------------------- chrome */
  const chrome = $("#chrome");
  chrome.innerHTML = `
    <div class="chapter-tag hidden" data-c="tag"><img src="${UI}chapter-tag.png" alt=""><span></span></div>
    <button class="btn-img home-btn hidden" data-c="home" title="חזרה למסך הבית"><img src="${UI}btn-home.png" alt="בית"></button>
    <div class="coin-counter hidden" data-c="coins"><span class="coin"></span><span data-c="coins-v">0</span><span class="lbl">מטבעות</span></div>
    <button type="button" class="nav-btn next-btn hidden" data-c="next" aria-label="הבא" title="הבא"><img src="${UI}nav-arrow.png" alt=""></button>
    <button type="button" class="nav-btn prev-btn hidden" data-c="prev" aria-label="הקודם" title="הקודם"><img src="${UI}nav-arrow.png" alt=""></button>
    <button class="btn-img sound-btn" data-c="sound" title="סאונד"><img alt="סאונד"></button>
    <div class="boi-mark hidden" data-c="boi"><img src="${UI}logo-boi.png" alt="בנק ישראל"></div>
    <button type="button" class="skip-practice hidden" data-c="skip" title="דילוג לתרגול">
      <span>דלגו לתרגול</span>
      <svg class="ic" viewBox="0 0 15 17" aria-hidden="true" focusable="false">
        <path d="M1.7 1.7 10 8.5 1.7 15.3Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="3.2" stroke-linejoin="round"></path>
        <rect x="12" y="0" width="3" height="17" rx="1.5" fill="#FFFFFF"></rect>
      </svg>
    </button>`;
  const C = k => $(`[data-c="${k}"]`, chrome);
  const soundImg = () => { const i = $("img", C("sound")); i.src = UI + (state.sound ? "sound-on.png" : "sound-off.png"); i.alt = state.sound ? "השתקת הסאונד" : "הפעלת הסאונד"; };

  a11yApply();
  soundImg();
  C("sound").addEventListener("click", () => {
    state.sound = !state.sound; save(); soundImg();
    if (!state.sound) { stopFeedbackSound(); stopVO(); }
    toast(state.sound ? "הסאונד הופעל" : "הסאונד הושתק");
  });
  C("home").addEventListener("click", () => goTo("menu"));
  C("skip").addEventListener("click", () => { const to = C("skip").dataset.go; if (to) goTo(to); });
  C("next").addEventListener("click", () => current && current.next && goTo(current.next));
  // on the "not all answered" slide, back goes to the first stretch question still open
  C("prev").addEventListener("click", () => current && current.prev && goTo(current.type === "incomplete" ? (firstUnanswered() || current.prev) : current.prev));

  const TOP_LEVEL = ["intro", "menu"];
  const COIN_TYPES = ["station", "weights", "pull", "tennis"];
  function updateChrome(s) {
    C("tag").classList.toggle("hidden", !s.tag);
    if (s.tag) $("span", C("tag")).textContent = s.mode === "stretch" ? `שאלה ${s.num}` : s.tag;
    const inChapter = !TOP_LEVEL.includes(s.type);
    C("home").classList.toggle("hidden", !inChapter);
    const gated = !!s.gate && !allVisited(s);         // must be a real boolean – classList.toggle(x, undefined) flips the class
    C("next").classList.toggle("hidden", !inChapter || !byId[s.next] || s.type === "ad" || gated);
    C("prev").classList.toggle("hidden", !inChapter || !byId[s.prev]);
    const showCoins = s.set && !s.hideCoins && COIN_TYPES.includes(s.type);
    const cc = C("coins");
    cc.classList.toggle("hidden", !showCoins);
    cc.classList.toggle("on-card", s.type === "weights");   // the calculator button takes the top-left slot there
    // "דלגו לתרגול" (as in the interest-rate unit): only on a set's screens before its exercises (data: skip),
    // jumping to the first exercise. It stands beside the "הבא" button, in the bottom-left corner.
    // the small Bank of Israel mark rides along on every screen; the menu has the big one already
    C("boi").classList.toggle("hidden", s.type === "menu");
    const sk = C("skip"), to = s.skip && byId[s.skip] ? s.skip : "";
    sk.classList.toggle("hidden", !to);
    sk.dataset.go = to;
    if (showCoins) {
      const v = setScore(s.set), el = C("coins-v");
      if (+el.textContent !== v) bumpEl(cc);
      el.textContent = v;
    }
  }

  /* ---------------------------------------------------------- navigation */
  let current = null, booted = false;
  const firstUnanswered = () => (DATA.screens.filter(x => x.mode === "stretch").find(x => !isDone(x.id)) || {}).id;
  function goTo(id) {
    if (id === "st-end" && firstUnanswered()) id = "st-incomplete";
    const s = byId[id]; if (!s) return;
    firstVisit = !state.seen[s.id];
    state.seen[s.id] = true;
    if (s.type === "summary") state.done[s.set] = true;
    save();
    if (current) { const old = $("#scr-" + current.id); if (old) { old.classList.remove("active"); $$("video, iframe", old).forEach(v => { if (v.pause) v.pause(); else v.remove(); }); } }
    modalMode(false);
    const fresh = build(s), old = $("#scr-" + s.id);
    screensEl.replaceChild(fresh, old);
    bindCommon(fresh, s);
    fresh.classList.add("active");
    current = s;
    updateChrome(s);
    voEnter(s);
    // the old slide (and the button that was clicked in it) is gone – the focus moves to the new slide, whose name a
    // screen reader then reads; not on the first load, while the cover is still up
    if (booted && $("#cover").classList.contains("gone")) fresh.focus({ preventScroll: true });
    booted = true;
    requestAnimationFrame(() => fixOrphans(fresh));
    try { history.replaceState(null, "", "#" + s.id); } catch (e) {}
    reviewSync();
  }

  /* -------------------------------------------------------------- scaling */
  function fit() {
    const st = $("#stage"), k = Math.min(window.innerWidth / W, window.innerHeight / H);
    st.style.transform = `scale(${k})`;
    st.style.left = (window.innerWidth - W * k) / 2 + "px";
    st.style.top = (window.innerHeight - H * k) / 2 + "px";
  }
  window.addEventListener("resize", fit); fit();

  /* ------------------------------------------------------- review helpers */
  const sel = $("#review-jump"), notes = $("#notes");
  let lastScene = null, group = null;
  DATA.screens.forEach(s => {
    if (s.scene !== lastScene) { group = document.createElement("optgroup"); group.label = s.scene; sel.appendChild(group); lastScene = s.scene; }
    const o = document.createElement("option"); o.value = s.id; o.textContent = (s.index + 1) + ". " + s.name + (s.note ? " 📝" : ""); group.appendChild(o);
  });
  sel.addEventListener("change", () => goTo(sel.value));
  $("#review-reset").addEventListener("click", () => { state = { answers: {}, done: {}, seen: {}, visited: {}, sound: state.sound, ad: null }; save(); goTo("intro"); toast("ההתקדמות אופסה"); });
  function reviewSync() {
    if (!current) return;
    sel.value = current.id;
    const v = current.video && VIDEOS[current.video];
    const script = v ? `<p><b>תסריט הסרטון (${v.length}):</b></p><ol>${v.scenes.map(sc => `<li>${sc[0]}${sc[1] ? `<br><i>רואים: ${sc[1]}</i>` : ""}${sc[2] ? `<br>כותרת: <b>${sc[2]}</b>` : ""}</li>`).join("")}</ol>` : "";
    notes.innerHTML = `<h4>${current.index + 1}. ${current.name}</h4>` + (current.note ? `<p>${current.note.replace(/⚠/g, "<b>⚠</b>")}</p>` : (script ? "" : "<i>אין הערות הפקה למסך זה.</i>")) + script;
  }
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "n" || e.key === "N" || e.key === "מ") { notes.classList.toggle("show"); reviewSync(); }
  });
  $("#review-notes").addEventListener("click", () => { notes.classList.toggle("show"); reviewSync(); });

  window.LOMDA = { DATA, SETS, LINKS, goTo, state: () => state };

  const start = (location.hash || "").slice(1);
  goTo(byId[start] ? start : "intro");

  /* the cover (as in the interest-rate unit): PLAY closes it and opens the first screen. A deep link to any
     other screen (the review dropdown, a shared link) skips it, so reviewing single screens is not blocked.
     While it is up, the lomda behind it is inert, so Tab cannot slip past it. */
  const cover = $("#cover"), coverBtn = $(".cover-play", cover);
  const firstScreen = DATA.screens[0].id;
  const behind = [$("#screens"), $("#chrome")];
  const dropCover = () => { cover.classList.add("gone"); behind.forEach(e => e.removeAttribute("inert")); };
  if (byId[start] && start !== firstScreen) {
    dropCover();
    // opened straight on a slide: browsers allow sound only after a click, so the first click / key starts its narration
    const kick = () => { removeEventListener("pointerdown", kick, true); removeEventListener("keydown", kick, true); if (current) voEnter(current); };
    addEventListener("pointerdown", kick, true); addEventListener("keydown", kick, true);
  }
  else behind.forEach(e => e.setAttribute("inert", ""));
  coverBtn.addEventListener("click", () => { dropCover(); goTo(firstScreen); });
  sel.addEventListener("change", dropCover);                 // jumping from the review list also lifts it
})();
