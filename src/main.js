import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { I18N } from './i18n.js';
import './styles.css';

// Static assets live in /public/img and are served from the site root (respects Vite's base).
const IMG = import.meta.env.BASE_URL + 'img/';

// ================= i18n =================

let lang = 'fa';
const L = () => I18N[lang];
const $ = id => document.getElementById(id);
const panel = $('panel'), status = $('status');
let sayTimer = 0;
const say = (msg, err = false) => { clearTimeout(sayTimer); status.classList.remove('fade'); status.classList.toggle('err', err); status.textContent = msg; };
// red on-screen toast for errors / cancellations; hides itself after a few seconds
const toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'alert'); document.body.appendChild(toastEl);
let toastTimer = 0;
const toast = msg => {
  clearTimeout(toastTimer); toastEl.textContent = msg; toastEl.dir = document.documentElement.dir;
  toastEl.classList.add('show'); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
};
toastEl.addEventListener('click', () => { clearTimeout(toastTimer); toastEl.classList.remove('show'); });
const sayError = msg => { say(msg, true); toast(msg); };
// brief message that fades away on its own
const flash = msg => {
  say(msg);
  sayTimer = setTimeout(() => { status.classList.add('fade'); sayTimer = setTimeout(() => { status.textContent = ''; status.classList.remove('fade'); }, 400); }, 1600);
};

function applyLang(next) {
  const prevWord = L().word;
  lang = next; const d = L();
  document.documentElement.lang = next; document.documentElement.dir = d.dir;
  panel.dir = d.dir; document.title = d.title;
  document.querySelectorAll('[data-t]').forEach(el => {
    if (el.id === 'fontLabel' && customFontName) return;
    if (el.id === 'bgLabel' && bgName) return;
    el.textContent = d[el.dataset.t];
  });
  document.querySelectorAll('[data-tip-t]').forEach(el => el.dataset.tip = d[el.dataset.tipT]);
  document.querySelectorAll('[data-title-t]').forEach(el => { el.title = d[el.dataset.titleT]; el.setAttribute('aria-label', d[el.dataset.titleT]); });
  document.querySelectorAll('select[data-opts]').forEach(sel => {
    const cur = sel.value || sel.dataset.default;
    sel.innerHTML = d[sel.dataset.opts].map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    sel.value = cur;
  });
  $('text').placeholder = d.placeholder;
  if (!S.text.trim() || S.text === prevWord) { S.text = d.word; $('text').value = d.word; }
  document.querySelectorAll('.lang-item').forEach(b => b.classList.toggle('on', b.dataset.lang === next));
  const cur = document.querySelector(`.lang-item[data-lang="${next}"]`);
  $('langFlag').textContent = cur.querySelector('.flag').textContent;
  $('langName').textContent = cur.childNodes[1].textContent;
  document.body.classList.toggle('ltr', d.dir === 'ltr');
  $('kashidaField').style.display = next === 'en' ? 'none' : '';
  requestAnimationFrame(layout); setTimeout(layout, 450);
  setToggle(); say(''); if (defaultAll.length) renderThumbs();
  try { localStorage.setItem('kc-lang', next); } catch {}
}

// ================= data =================
const DEFAULTS = [
  { src: IMG + '1.jpg', pos: [.6, .45] },
  { src: IMG + '2.jpg', pos: [.5, .5] },
  { src: IMG + '3.jpg', pos: [.5, .45] },
  { src: IMG + '4.jpg', pos: [.5, .62] },
  { src: IMG + '5.jpg', pos: [.5, .4] },
  { src: IMG + '6.jpg', pos: [.5, .5] },
  { src: IMG + '7.jpg', pos: [.5, .45] },
  { src: IMG + '8.jpg', pos: [.5, .4] },
  { src: IMG + '9.jpg', pos: [.5, .5] },
];
const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
let defaultAll = [], defaultImgs = [], myImgs = [], useMine = false, customFontName = '', bgName = '';
const photos = () => (useMine && myImgs.length ? myImgs : defaultImgs);
const grainImg = new Image(); grainImg.src = IMG + 'grain.jpg';
let bgImg = null, bgDark = false;

const S = { text: 'ایران', kashida: 2, ratio: '1:1', bg: 'grain', family: '"Ravi", "Ravi Variable", "RaviVF", "RaviLocal", "Vazirmatn"' };

// ================= splitting the word =================
const NO_JOIN_AFTER = new Set('اآأإٱدذرزژوؤةءى'.split(''));
const isLetter = ch => /[ؠ-يٱ-ۓۺ-ۿ]/.test(ch || '');
const isRTL = w => /[֐-ࣿ]/.test(w);
// returns [first, second] in reading order, plus whether a kashida joins them
function split(raw) {
  const w = raw.replace(/\s+/g, ' ').trim();
  if (!w) return { a: '', b: '', rtl: true, kash: false };
  if (!isRTL(w)) { const m = Math.ceil(w.length / 2); return { a: w.slice(0, m), b: w.slice(m), rtl: false, kash: false }; }
  const T = 'ـ'.repeat(S.kashida);
  const k = w.indexOf('ـ');
  if (k !== -1) return { a: w.slice(0, k).replace(/ـ+$/, '') + T, b: T + w.slice(k).replace(/^ـ+/, ''), rtl: true, kash: true };
  const mid = (w.length - 1) / 2; let best = -1, bestD = 1e9;
  for (let i = 0; i < w.length - 1; i++) {
    if (isLetter(w[i]) && !NO_JOIN_AFTER.has(w[i]) && isLetter(w[i + 1])) {
      const d = Math.abs(i + .5 - mid); if (d <= bestD) { bestD = d; best = i; }
    }
  }
  if (best === -1) { const m = Math.ceil(w.length / 2); return { a: w.slice(0, m), b: w.slice(m), rtl: true, kash: false }; }
  return { a: w.slice(0, best + 1) + T, b: T + w.slice(best + 1), rtl: true, kash: true };
}

// ================= timeline =================
const OPEN = 2.4, CIRCLE = 0.9, LINE = 0.1, PH = 0.9;
const clamp = x => Math.max(0, Math.min(1, x));
// spring curves (normalised 0→1 over the step) — same family Apple uses for UI motion
const springK = (z, w) => k => {
  if (k >= 1) return 1;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * k) * (Math.cos(wd * k) + (z * w / wd) * Math.sin(wd * k));
};
const bouncy = springK(.74, 7.2);                                  // gentle ~3% overshoot
const settle = k => k >= 1 ? 1 : 1 - Math.exp(-8 * k) * (1 + 8 * k); // critically damped, no overshoot
const smoothIn = k => k >= 1 ? 1 : (1 - Math.cos(Math.PI * k)) / 2;
const CYCLE = [
  ['open', .78, CIRCLE, OPEN, bouncy], ['hold', 2.05, OPEN, OPEN], ['close', .52, OPEN, CIRCLE, settle],
  ['hold', .06, CIRCLE, CIRCLE], ['close', .36, CIRCLE, LINE, settle], ['swap', .08, LINE, LINE],
  ['open', .46, LINE, CIRCLE, bouncy], ['hold', .04, CIRCLE, CIRCLE],
];
const CL = CYCLE.reduce((a, s) => a + s[1], 0);
const SWAP_AT = CYCLE.slice(0, 5).reduce((a, s) => a + s[1], 0);
const INTRO = .42, GAP = .06, POP = .46, PRE = INTRO + GAP + POP;
function stateAt(t) {
  const N = Math.max(1, photos().length), T = PRE + CL * N;
  if (t >= T) t = PRE + ((t - PRE) % (T - PRE));
  let w = LINE, h = PH, idx = 0, since = 0;
  if (t < INTRO) h = PH * settle(clamp(t / INTRO));
  else if (t < INTRO + GAP) {}
  else if (t < PRE) { w = LINE + (CIRCLE - LINE) * bouncy(clamp((t - INTRO - GAP) / POP)); since = t - INTRO - GAP; }
  else {
    const u = t - PRE; idx = Math.floor(u / CL); const c = u - idx * CL; let acc = 0;
    for (const [, d, a, b, e] of CYCLE) { if (c < acc + d) { w = e ? a + (b - a) * e(clamp((c - acc) / d)) : a; break; } acc += d; }
    if (c >= SWAP_AT) { idx++; since = c - SWAP_AT; } else since = c + (idx === 0 ? POP : CL - SWAP_AT);
  }
  return { w, h, idx: idx % N, since };
}

// ================= renderer (preview and GIF) =================
function coverDraw(ctx, img, x, y, w, h, px, py, z) {
  const ir = img.naturalWidth / img.naturalHeight, br = w / h;
  let dw, dh; if (ir > br) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  let dx = x + (w - dw) * px, dy = y + (h - dh) * py;
  const cx = x + w / 2, cy = y + h / 2;
  dx = cx + (dx - cx) * z; dy = cy + (dy - cy) * z; dw *= z; dh *= z;
  ctx.drawImage(img, dx, dy, dw, dh);
}
function draw(ctx, W, H, t, ov) {
  const st = ov || stateAt(t);
  let dark = false;
  if (S.bg === 'grain' && grainImg.naturalWidth) {
    const pat = W > 0 && H > 0 ? ctx.createPattern(grainImg, 'repeat') : null;
    if (pat) { const k = Math.min(W, H) / 1440 * 0.75; pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0])); ctx.fillStyle = pat; }
    else ctx.fillStyle = '#f3f3f3';
    ctx.fillRect(0, 0, W, H);
  } else if (S.bg === 'custom' && bgImg) {
    coverDraw(ctx, bgImg, 0, 0, W, H, .5, .5, 1); dark = bgDark;
  } else {
    dark = S.bg === 'black';
    ctx.fillStyle = dark ? '#0f0f10' : (S.bg === 'white' ? '#ffffff' : '#f3f3f3'); ctx.fillRect(0, 0, W, H);
  }

  const sp = split(S.text);
  const gapE = sp.kash ? -0.12 : 0.07;               // kashida tucks under the capsule; Latin keeps a small gap
  let fs = Math.min(W * .15, H * .24);
  ctx.font = `900 ${fs}px ${S.family}`; ctx.direction = sp.rtl ? 'rtl' : 'ltr';
  let wA = ctx.measureText(sp.a).width, wB = ctx.measureText(sp.b).width;
  const full = wA + wB + (OPEN + 2 * gapE) * fs;
  if (full > W * .9) { const k = (W * .9) / full; fs *= k; wA *= k; wB *= k; ctx.font = `900 ${fs}px ${S.family}`; }

  const pw = st.w * fs, ph = st.h * fs, gap = gapE * fs;
  const rowW = wA + wB + pw + 2 * gap, cy = H / 2;
  let base, pcy;
  if (sp.rtl) {
    const m = ctx.measureText('ا');
    const asc = m.fontBoundingBoxAscent ?? fs * .9, desc = m.fontBoundingBoxDescent ?? fs * .3;
    base = cy - fs / 2 + (fs - (asc + desc)) / 2 + asc - .04 * fs; pcy = cy + .02 * fs;
  } else {
    // Latin: centre on the capital height so the capsule sits exactly in the middle of the letters
    const capH = ctx.measureText('H').actualBoundingBoxAscent || fs * .72;
    base = cy + capH / 2; pcy = cy;
  }
  ctx.fillStyle = dark ? '#f4f4f4' : '#161616'; ctx.textBaseline = 'alphabetic';

  let pillL;
  if (sp.rtl) {
    const xr = W / 2 + rowW / 2; ctx.textAlign = 'right';
    ctx.fillText(sp.a, xr, base);
    pillL = xr - wA - gap - pw;
    ctx.fillText(sp.b, pillL - gap, base);
  } else {
    const xl = W / 2 - rowW / 2; ctx.textAlign = 'left';
    ctx.fillText(sp.a, xl, base);
    pillL = xl + wA + gap;
    ctx.fillText(sp.b, pillL + pw + gap, base);
  }

  if (ph > .5 && pw > .5) {
    const pcx = pillL + pw / 2, r = Math.min(pw, ph) / 2;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(pillL, pcy - ph / 2, pw, ph, r); ctx.clip();
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(pillL, pcy - ph / 2, pw, ph);
    const p = photos()[st.idx];
    if (p && p.img) {
      // photo window = the open capsule exactly, so the photo shows as wide as possible;
      // it eases in from a slight zoom and rests at 1:1 (no extra crop)
      const z = 1 + .2 * Math.exp(-st.since * 3.4);
      const fw = Math.max(OPEN * fs, pw);
      coverDraw(ctx, p.img, pcx - fw / 2, pcy - PH * fs / 2, fw, PH * fs, p.pos[0], p.pos[1], z);
    }
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(pillL + .5, pcy - ph / 2 + .5, pw - 1, ph - 1, r);
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
}

// ================= live preview =================
const frame = $('frame'), view = $('view'), vctx = view.getContext('2d'), stage = $('stage');
const ratioWH = () => S.ratio.split(':').map(Number);
const isMobile = window.matchMedia('(max-width: 860px)');
// phone only: the settings sheet rests just under the timeline, or is pulled up over the preview
let sheetPos = 'rest', sheetTop = null;   // 'rest' | 'half' | 'up'
const sheetStops = () => {
  const r = parseFloat(getComputedStyle(document.body).getPropertyValue('--sheet-r')) || 24;
  const rest = stage.offsetHeight - r;                                   // sheet edge overlaps the bottom of the stage
  const up = Math.min(rest, Math.max(48, window.innerHeight * .08));     // leaves a sliver of the preview showing
  return [up, rest];
};
const placeSheet = () => {
  const [up, rest] = sheetStops();
  const top = sheetTop ?? { up, half: (up + rest) / 2, rest }[sheetPos];
  panel.style.setProperty('--sheet-top', Math.max(up, Math.min(rest, top)) + 'px');
};
function layout() {
  const [a, b] = ratioWH();
  const cs = getComputedStyle(stage), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const tlH = $('tl').offsetHeight + parseFloat(cs.rowGap || cs.gap || 16);
  const sw = stage.clientWidth - padX, sh = stage.clientHeight - padY - tlH;
  let w = sw, h = sw * b / a;
  if (isMobile.matches) {
    // phone: preview and timeline take 90% of the width; very tall ratios (9:16) are capped so the settings stay reachable
    w = sw * .9; h = w * b / a;
    const maxH = window.innerHeight * .58; if (h > maxH) { h = maxH; w = h * a / b; }
  } else if (h > sh) { h = sh; w = sh * a / b; }
  frame.style.width = w + 'px'; frame.style.height = h + 'px';
  $('tl').style.setProperty('--fw', (isMobile.matches ? sw * .9 : Math.max(w, 280)) + 'px');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.width = Math.round(w * dpr); view.height = Math.round(h * dpr);
  if (isMobile.matches) placeSheet(); else panel.style.removeProperty('--sheet-top');
}
// ---- playback: smooth replay + loop on/off ----
let start = performance.now(), clock = 0, looping = true, trans = null, lastState = null, paused = false, scrubbing = false;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
let speed = 1;
// animation time = real time × speed; jumping to an animation time keeps the speed in mind
const setClock = (x, now = performance.now()) => { clock = x; start = now - x / speed * 1000; };
const runLen = () => PRE + CL * Math.max(1, photos().length);
const endOfRun = () => PRE + (Math.max(1, photos().length) - 1) * CL + CYCLE[0][1] + CYCLE[1][1];  // last photo, fully open
function tick(now) {
  let ov = null;
  if (trans) {
    // smoothly close whatever is showing to a thin line, then start again from the first photo
    const k = clamp((now - trans.t0) / 420), e = settle(k), f = trans.from;
    ov = { w: f.w + (LINE - f.w) * e, h: f.h + (PH - f.h) * e, idx: f.idx, since: f.since };
    if (k >= 1) { trans = null; setClock(INTRO, now); ov = null; }
  }
  if (!ov && !paused && !scrubbing) {
    clock = (now - start) / 1000 * speed;
    if (!looping) clock = Math.min(clock, endOfRun());     // play once, hold on the last photo
  }
  lastState = ov || stateAt(clock);
  draw(vctx, view.width, view.height, clock, ov);
  updateTimeline(ov ? 0 : clock);
  requestAnimationFrame(tick);
}
// ---- timeline UI ----
const tlEl = $('tl'), tlRange = $('tlRange'), tlTime = $('tlTime'), tlMarks = $('tlMarks');
const fmt = t => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };
const posOf = t => { const T = runLen(); return t < T ? t : PRE + ((t - PRE) % (T - PRE)); };
let marksFor = -1;
function updateTimeline(t) {
  const T = runLen(), N = Math.max(1, photos().length);
  if (marksFor !== N) {            // a small tick where each photo change happens
    marksFor = N; tlMarks.innerHTML = '';
    for (let i = 0; i < N - 1; i++) { const m = document.createElement('i'); m.style.left = ((PRE + i * CL + SWAP_AT) / T * 100) + '%'; tlMarks.appendChild(m); }
  }
  const p = posOf(t) / T;
  if (!scrubbing) tlRange.value = Math.round(p * 1000);
  tlRange.style.setProperty('--p', (+tlRange.value / 10) + '%');
  tlTime.textContent = fmt(posOf(t) / speed) + ' / ' + fmt(T / speed);
}
function setPaused(v) {
  if (v === paused) return;
  paused = v; tlEl.classList.toggle('paused', v);
  if (v) clock = posOf(clock); else setClock(clock);
}
$('tlPlay').addEventListener('click', e => {
  e.stopPropagation(); trans = null;
  if (paused && !looping && clock >= endOfRun() - .01) { clock = 0; }   // at the end of a single run → play from the start
  setPaused(!paused);
});
tlRange.addEventListener('input', () => {
  scrubbing = true; trans = null;
  clock = +tlRange.value / 1000 * runLen();
  if (!looping) clock = Math.min(clock, endOfRun());
});
const endScrub = () => { if (!scrubbing) return; scrubbing = false; if (!paused) setClock(clock); };
tlRange.addEventListener('change', endScrub);
tlRange.addEventListener('pointerup', endScrub);
tlRange.addEventListener('touchend', endScrub);
const loopOn = $('loopOn'), loopOff = $('loopOff');
function setToggle() {
  loopOn.classList.toggle('on', looping); loopOff.classList.toggle('on', !looping);
  loopOn.setAttribute('aria-checked', looping); loopOff.setAttribute('aria-checked', !looping);
}
function setLoop(on) {
  if (on === looping) return;
  looping = on;
  if (clock >= endOfRun()) setClock(endOfRun());   // pick up from where it is
  setToggle();
}
// replay with animation (used by the replay button and a click on the frame)
const replay = () => { if (paused) { paused = false; tlEl.classList.remove('paused'); } trans = { t0: performance.now(), from: lastState || stateAt(clock) }; };
// hard restart (used when photos or settings change)
const restart = () => { trans = null; paused = false; tlEl.classList.remove('paused'); start = performance.now(); setToggle(); };

// ================= controls =================
const langBox = $('lang');
$('langBtn').addEventListener('click', e => { e.stopPropagation(); langBox.classList.toggle('open'); });
langBox.querySelectorAll('.lang-item').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation(); langBox.classList.remove('open'); applyLang(b.dataset.lang);
}));
document.addEventListener('click', () => langBox.classList.remove('open'));
$('text').addEventListener('input', e => S.text = e.target.value || '');
$('kashida').addEventListener('change', e => S.kashida = +e.target.value);
$('ratio').addEventListener('change', e => { S.ratio = e.target.value; layout(); });
$('bg').addEventListener('change', e => {
  S.bg = e.target.value;
  $('bgUpload').classList.toggle('show', S.bg === 'custom');
  if (S.bg === 'custom' && !bgImg) $('bgfile').click();
});
$('bgfile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const img = await load(URL.createObjectURL(f)); if (!img) return;
  bgImg = img; bgName = f.name; $('bgLabel').textContent = f.name;
  // pick light or dark text from the image's average brightness
  const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d');
  x.drawImage(img, 0, 0, 24, 24); const d = x.getImageData(0, 0, 24, 24).data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
  bgDark = sum / (d.length / 4) < 120;
});
frame.addEventListener('click', replay);
$('replay').addEventListener('click', replay);
loopOn.addEventListener('click', () => setLoop(true));
loopOff.addEventListener('click', () => setLoop(false));

const segD = $('useDefault'), segM = $('useMine');
function setSource(mine) { useMine = mine; segD.classList.toggle('on', !mine); segM.classList.toggle('on', mine); renderThumbs(); restart(); }
// thumbnails of the photos in use, each with a delete (×) button
const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
function renderThumbs() {
  const box = $('thumbs'); box.innerHTML = '';
  const list = photos(), canDelete = useMine && myImgs.length > 0;   // only uploaded photos can be removed
  list.forEach(p => {
    const el = document.createElement('div'); el.className = 'thumb';
    el.innerHTML = `<img src="${p.img.src}" alt="">` + (canDelete ? `<button class="del" title="${L().remove}" aria-label="${L().remove}">${X_ICON}</button>` : '');
    const del = el.querySelector('.del');
    if (del) del.addEventListener('click', e => { e.stopPropagation(); el.classList.add('out'); setTimeout(() => removePhoto(p), 260); });
    box.appendChild(el);
  });
}
function removePhoto(p) {
  if (!useMine) return;
  const arr = myImgs, i = arr.indexOf(p); if (i === -1) return;
  arr.splice(i, 1);
  if (p.img.src.startsWith('blob:')) URL.revokeObjectURL(p.img.src);   // free the uploaded file
  if (useMine && !myImgs.length) { segM.disabled = true; setSource(false); return; }   // no own photos left → back to defaults
  renderThumbs(); restart();
}
segD.addEventListener('click', () => setSource(false));
segM.addEventListener('click', () => myImgs.length && setSource(true));
$('imgfile').addEventListener('change', async e => {
  const files = [...e.target.files].filter(f => f.type.startsWith('image/')); e.target.value = '';
  if (!files.length) return;
  const imgs = await Promise.all(files.map(f => load(URL.createObjectURL(f))));
  const added = imgs.filter(Boolean).map(img => ({ img, pos: [.5, .5] }));
  myImgs = myImgs.concat(added);                       // new uploads are added to the ones already there
  segM.disabled = !myImgs.length;
  say(L().added(added.length)); setSource(true);
});
$('fontfile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const face = new FontFace('UserFont', await f.arrayBuffer(), { weight: '900' });
    await face.load(); document.fonts.add(face);
    S.family = '"UserFont", "Vazirmatn"'; customFontName = f.name; $('fontLabel').textContent = f.name; say(L().fontOk);
  } catch { say(L().fontBad); }
});
document.querySelectorAll('.help').forEach(h => h.addEventListener('click', e => {
  e.stopPropagation(); const was = h.classList.contains('show');
  document.querySelectorAll('.help.show').forEach(x => x.classList.remove('show'));
  if (!was) h.classList.add('show');
}));
document.addEventListener('click', () => document.querySelectorAll('.help.show').forEach(x => x.classList.remove('show')));

// ================= speed (panel slider + timeline chip, kept in sync) =================
const speedIn = $('speed'), speedVal = $('speedVal'), tlSpeed = $('tlSpeed');
const label = v => (Math.round(v * 100) / 100) + '×';
function setSpeed(v) {
  const now = performance.now(), cur = clock;
  speed = v;
  if (!paused && !scrubbing && !trans) setClock(cur, now);          // keep the same frame, change only the pace
  const i = SPEEDS.indexOf(v);
  speedIn.value = i; speedIn.style.setProperty('--p', (i / (SPEEDS.length - 1) * 100) + '%');
  speedVal.textContent = label(v); tlSpeed.textContent = label(v);
}
speedIn.addEventListener('input', () => setSpeed(SPEEDS[+speedIn.value]));
tlSpeed.addEventListener('click', e => { e.stopPropagation(); setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]); });
setSpeed(1);

// ================= reset everything to default (language stays) =================
const DEFAULT_FAMILY = S.family;
$('reset').addEventListener('click', () => {
  const d = L();
  S.text = d.word; $('text').value = d.word;
  S.kashida = 2; S.ratio = '1:1'; S.bg = 'grain'; S.family = DEFAULT_FAMILY;
  document.querySelectorAll('select[data-default]').forEach(sel => sel.value = sel.dataset.default);
  bgImg = null; bgName = ''; bgDark = false; $('bgUpload').classList.remove('show'); $('bgLabel').textContent = d.uploadBg;
  customFontName = ''; $('fontLabel').textContent = d.uploadFont;
  myImgs = []; defaultImgs = defaultAll.slice(); segM.disabled = true; setSource(false);
  gifSlot.classList.remove('has-gif'); gifPreview.removeAttribute('src');
  looping = true; setToggle(); setSpeed(1); layout(); restart(); flash(d.resetDone);
  const r = $('reset'); r.classList.remove('spin'); void r.offsetWidth; r.classList.add('spin');
});

// ================= GIF export =================
const gen = $('generate'), bar = $('bar'), genLabel = $('genLabel'), gifPreview = $('gifPreview'), gifSlot = $('gifSlot');
const fileName = () => {
  const base = (S.text || 'word').replace(/[\\/:*?"<>|ـ\s]+/g, '-').replace(/^-|-$/g, '') || 'word';
  return `${base}-${S.ratio.replace(':', 'x')}.gif`;
};
const yieldUI = () => new Promise(r => setTimeout(r, 0));
let busy = false, cancelReq = false;
gen.addEventListener('click', async () => {
  if (busy) { cancelReq = true; genLabel.textContent = L().cancelled; return; }   // second click while exporting = cancel
  const [a, b] = ratioWH();
  const W = +$('gifSize').value, H = Math.round(W * b / a / 2) * 2, fps = +$('gifFps').value;
  const cnt = $('gifCount').value === 'all' ? photos().length : Math.min(+$('gifCount').value, photos().length);
  const gSpeed = speed, n = Math.ceil((PRE + CL * Math.max(1, cnt)) / gSpeed * fps);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  const palettes = new Map();
  const paletteFor = idx => {
    if (!palettes.has(idx)) { draw(sctx, W, H, PRE + idx * CL + 1.4); palettes.set(idx, quantize(sctx.getImageData(0, 0, W, H).data, 255, { format: 'rgb565' })); }
    return palettes.get(idx);
  };
  busy = true; cancelReq = false; gen.classList.add('busy');
  const enc = GIFEncoder();
  let prevIdx = null, prevPal = null, csDone = 0;
  try {
    for (let i = 0; i < n; i++) {
      if (cancelReq) { sayError(L().cancelled); return; }
      const t = i / fps * gSpeed;
      draw(ctx, W, H, t);
      const pal = paletteFor(stateAt(t).idx);
      const index = applyPalette(ctx.getImageData(0, 0, W, H).data, pal, 'rgb565');
      const csEnd = Math.round((i + 1) * 100 / fps), delay = (csEnd - csDone) * 10; csDone = csEnd;
      const fullPal = pal.concat([[255, 0, 255]]), KEY = pal.length;
      if (prevIdx && prevPal === pal) {
        const out = new Uint8Array(index.length);
        for (let p = 0; p < index.length; p++) out[p] = index[p] === prevIdx[p] ? KEY : index[p];
        enc.writeFrame(out, W, H, { palette: fullPal, delay, transparent: true, transparentIndex: KEY, dispose: 1, repeat: 0 });
      } else enc.writeFrame(index, W, H, { palette: fullPal, delay, dispose: 1, repeat: 0 });
      prevIdx = index; prevPal = pal;
      const pct = (i + 1) / n; bar.style.width = (pct * 100) + '%'; if (!cancelReq) genLabel.textContent = `${L().creating(Math.round(pct * 100))}  ·  ${L().stop}`;
      if (i % 3 === 0) await yieldUI();
    }
    enc.finish();
    const blob = new Blob([enc.bytes()], { type: 'image/gif' }), mb = (blob.size / 1048576).toFixed(1);
    if (gifPreview.src.startsWith('blob:')) URL.revokeObjectURL(gifPreview.src);
    gifPreview.src = URL.createObjectURL(blob); gifSlot.classList.add('has-gif');
    // save straight away with a download link; the preview below stays as a fallback
    try {
      const a = document.createElement('a'); a.href = gifPreview.src; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove(); say(L().saved(mb));
    } catch { say(L().manual(mb)); }
  } catch (err) { sayError(L().failed + (err && err.message || err)); }
  finally { busy = false; cancelReq = false; gen.classList.remove('busy'); bar.style.width = '0'; genLabel.textContent = L().create; }
});

// ================= boot =================
let saved = 'fa'; try { saved = localStorage.getItem('kc-lang') || 'fa'; } catch {}
applyLang(I18N[saved] ? saved : 'fa');
const ready = (async () => {
  defaultAll = (await Promise.all(DEFAULTS.map(async d => ({ img: await load(d.src), pos: d.pos })))).filter(p => p.img);
  defaultImgs = defaultAll.slice(); renderThumbs();
  await document.fonts.load(`900 40px ${S.family}`, 'ایران IRAN').catch(() => {});
  await document.fonts.ready; return true;
})();
layout(); window.addEventListener('resize', layout); isMobile.addEventListener('change', layout);

// ---- phone: drag handle on the settings sheet ----
// drag up = sheet slides over the preview, drag down = back; a tap toggles. Snaps to the nearer end on release.
const handle = $('sheetHandle');
let drag = null;
const snapTo = pos => {
  sheetPos = pos; sheetTop = null;
  panel.classList.add('snap'); placeSheet();
  setTimeout(() => panel.classList.remove('snap'), 280);
};
handle.addEventListener('pointerdown', e => {
  if (!isMobile.matches) return;
  panel.classList.remove('snap');
  drag = { y: e.clientY, top: panel.getBoundingClientRect().top, moved: false };
  handle.setPointerCapture(e.pointerId); handle.classList.add('dragging');
});
handle.addEventListener('pointermove', e => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  if (Math.abs(dy) > 5) drag.moved = true;
  if (drag.moved) { sheetTop = drag.top + dy; placeSheet(); }
});
const endDrag = () => {
  if (!drag) return;
  const { moved } = drag; drag = null; handle.classList.remove('dragging');
  if (!moved) { snapTo(sheetPos === 'rest' ? 'up' : 'rest'); return; }
  // snap to the nearest of the three stops
  const [up, rest] = sheetStops(), half = (up + rest) / 2, y = panel.getBoundingClientRect().top;
  snapTo([['up', up], ['half', half], ['rest', rest]].sort((a, b) => Math.abs(a[1] - y) - Math.abs(b[1] - y))[0][0]);
};
handle.addEventListener('pointerup', endDrag);
handle.addEventListener('pointercancel', endDrag);
handle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); snapTo(sheetPos === 'rest' ? 'up' : 'rest'); } });
// many people never find the handle: as soon as they start using the settings (scroll, tap, type), raise the sheet halfway
const autoRaise = () => { if (isMobile.matches && sheetPos === 'rest' && !drag) snapTo('half'); };
panel.addEventListener('scroll', () => { if (panel.scrollTop > 4) autoRaise(); }, { passive: true });
panel.addEventListener('focusin', e => { if (e.target !== handle && !e.target.closest('.genbar')) autoRaise(); });
panel.addEventListener('click', e => { if (!handle.contains(e.target) && !e.target.closest('.genbar')) setTimeout(autoRaise, 0); });   // after the tap has done its job
// any touch outside the sheet while it is raised lowers it back to its resting size.
// pointerdown (not click) so swipes and taps on plain background count too; the click that follows is swallowed
// so the same touch does not also replay the preview or hit the timeline.
let swallowClick = false;
document.addEventListener('pointerdown', e => {
  if (!isMobile.matches || sheetPos === 'rest' || panel.contains(e.target) || e.target.closest('.toast')) return;
  swallowClick = true; setTimeout(() => { swallowClick = false; }, 600);
  snapTo('rest');
}, true);
document.addEventListener('click', e => {
  if (swallowClick && !panel.contains(e.target)) { swallowClick = false; e.stopPropagation(); e.preventDefault(); }
}, true);
ready.then(() => { start = performance.now(); });
requestAnimationFrame(tick);
