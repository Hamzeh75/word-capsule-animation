import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { I18N } from './i18n.js';
import './styles.css';

// Static assets live in /public/img and are served from the site root (respects Vite's base).
const IMG = import.meta.env.BASE_URL + 'img/';

// ================= i18n =================

let lang = 'fa';
const L = () => I18N[lang];
// small drawn flags (emoji flags sit at different heights on each system, and Windows shows letters instead)
const FLAGS = {
  fa: '<svg viewBox="0 0 21 15"><rect width="21" height="5" fill="#239f40"/><rect y="5" width="21" height="5" fill="#fff"/><rect y="10" width="21" height="5" fill="#da0000"/><path d="M10.5 6.1c-.9.3-1.3 1-1.3 1.5 0 .6.5 1.2 1.3 1.4.8-.2 1.3-.8 1.3-1.4 0-.5-.4-1.2-1.3-1.5Z" fill="none" stroke="#da0000" stroke-width=".55"/><path d="M10.5 6.4v2.4" stroke="#da0000" stroke-width=".55"/></svg>',
  en: '<svg viewBox="0 0 21 15"><rect width="21" height="15" fill="#fff"/><g fill="#b22234"><rect width="21" height="1.154"/><rect y="2.308" width="21" height="1.154"/><rect y="4.615" width="21" height="1.154"/><rect y="6.923" width="21" height="1.154"/><rect y="9.231" width="21" height="1.154"/><rect y="11.538" width="21" height="1.154"/><rect y="13.846" width="21" height="1.154"/></g><rect width="9" height="8.077" fill="#3c3b6e"/><g fill="#fff"><circle cx="1.5" cy="1.4" r=".38"/><circle cx="3.5" cy="1.4" r=".38"/><circle cx="5.5" cy="1.4" r=".38"/><circle cx="7.5" cy="1.4" r=".38"/><circle cx="2.5" cy="2.9" r=".38"/><circle cx="4.5" cy="2.9" r=".38"/><circle cx="6.5" cy="2.9" r=".38"/><circle cx="1.5" cy="4.4" r=".38"/><circle cx="3.5" cy="4.4" r=".38"/><circle cx="5.5" cy="4.4" r=".38"/><circle cx="7.5" cy="4.4" r=".38"/><circle cx="2.5" cy="5.9" r=".38"/><circle cx="4.5" cy="5.9" r=".38"/><circle cx="6.5" cy="5.9" r=".38"/></g></svg>',
  ar: '<svg viewBox="0 0 21 15"><rect width="21" height="15" fill="#006c35"/><path d="M5.2 5.6c.8-.6 1.6.4 2.4-.2s1.6.4 2.4-.2 1.6.4 2.4-.2 1.6.4 2.4-.2" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round"/><path d="M5.6 9.6h9.2" stroke="#fff" stroke-width=".7" stroke-linecap="round"/><path d="M14.8 9.6l1-.6" stroke="#fff" stroke-width=".7" stroke-linecap="round"/></svg>',
};
const num = (x, d = 0) => Number(x).toLocaleString(lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
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
  document.querySelectorAll('.help').forEach(el => el.textContent = d.dir === 'rtl' ? '؟' : '?');   // Persian/Arabic question mark
  document.querySelectorAll('[data-title-t]').forEach(el => { el.title = d[el.dataset.titleT]; el.setAttribute('aria-label', d[el.dataset.titleT]); });
  document.querySelectorAll('select[data-opts]').forEach(sel => {
    const cur = sel.value || sel.dataset.default;
    sel.innerHTML = d[sel.dataset.opts].map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    sel.value = cur;
  });
  $('text').placeholder = d.placeholder;
  if (!S.text.trim() || S.text === prevWord) { S.text = d.word; $('text').value = d.word; S.splitAt = 'auto'; }
  refreshSplitOptions();
  // language names are written in the language the page is in; the native name sits beside it when it differs
  const NATIVE = { en: 'English', fa: 'فارسی', ar: 'العربية' };
  document.querySelectorAll('.lang-item').forEach(b => {
    const code = b.dataset.lang, name = d.langNames[code];
    b.classList.toggle('on', code === next);
    b.querySelector('.ln').textContent = name;
    b.querySelector('small').textContent = name === NATIVE[code] ? '' : NATIVE[code];
  });
  const cur = document.querySelector(`.lang-item[data-lang="${next}"]`);
  $('langFlag').innerHTML = FLAGS[next];
  document.body.classList.toggle('ltr', d.dir === 'ltr');
  $('kashidaField').style.display = next === 'en' ? 'none' : '';
  requestAnimationFrame(layout); setTimeout(layout, 450);
  setToggle(); say(''); if (defaultAll.length) renderThumbs();
  refreshGifInfo();
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
let exportLimit = 0;   // while exporting: only the photos that go into the GIF, so its last frame leads back into the first
const photos = () => { const l = useMine && myImgs.length ? myImgs : defaultImgs; return exportLimit ? l.slice(0, exportLimit) : l; };
const grainImg = new Image(); grainImg.src = IMG + 'grain.jpg';
let bgImg = null, bgDark = false;

const LATIN_FAMILY = '"Proxima Nova", "ProximaNova-Black", "Figtree", sans-serif';
const S = { text: 'ایران', splitAt: 'auto', kashida: 2, ratio: '1:1', bg: 'grain', family: '"Ravi", "Ravi Variable", "RaviVF", "RaviLocal", "Vazirmatn"' };
const DEFAULT_FAMILY = S.family;

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
  if (S.splitAt !== 'auto') {                        // the user picked the letter the capsule follows
    const plain = w.replace(/ـ/g, ''), at = Math.min(+S.splitAt, plain.length - 1);
    if (at >= 1) {
      const a = plain.slice(0, at), b = plain.slice(at), x = a[a.length - 1];
      if (!isRTL(plain)) return { a, b, rtl: false, kash: false };
      const joins = isLetter(x) && !NO_JOIN_AFTER.has(x) && isLetter(b[0]);   // only joined letters take a kashida
      return joins ? { a: a + T, b: T + b, rtl: true, kash: true } : { a, b, rtl: true, kash: false };
    }
  }
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

// ================= background from the photo =================
// Reads each photo once and turns its two strongest hues into a soft gradient that sits behind the word.
// Bright photos get a pastel gradient with dark text; dark photos get a deep gradient with light text.
const toHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const toRgb = (h, s, l) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};
const photoTones = new WeakMap();
const BG_FADE = .7;   // seconds the background takes to move to the next photo's colours
let bgSpin = 9;       // seconds per full turn of the photo gradient (the GIF export adjusts it so the loop is seamless)
// 4×4 ordered dither for GIF frames: fixed per pixel, so unchanged areas stay identical between frames
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v / 16 - .47) * 7);
const dither = (px, W) => {
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const o = BAYER[((p / W | 0) & 3) * 4 + (p % W & 3)];
    px[i] += o; px[i + 1] += o; px[i + 2] += o;
  }
};
function tonesOf(img) {
  if (photoTones.has(img)) return photoTones.get(img);
  const N = 40, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, N, N);
  let d; try { d = x.getImageData(0, 0, N, N).data; } catch { d = null; }
  const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let lum = 0, n = 0, ar = 0, ag = 0, ab = 0;
  for (let i = 0; d && i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], [h, sat, l] = toHsl(r, g, b);
    lum += .2126 * r / 255 + .7152 * g / 255 + .0722 * b / 255; n++; ar += r; ag += g; ab += b;
    const w = sat * (1 - Math.abs(l - .5) * 1.6);             // vivid mid-tones count most
    if (w <= 0) continue;
    const bin = bins[Math.floor(h / 30) % 12]; bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
  }
  const avg = n ? [ar / n, ag / n, ab / n] : [200, 200, 200];
  const order = bins.map((bn, i) => ({ ...bn, i })).filter(bn => bn.w > 0).sort((p, q) => q.w - p.w);
  const colOf = bn => [bn.r / bn.w, bn.g / bn.w, bn.b / bn.w];
  const A = order[0] ? colOf(order[0]) : avg;
  const hueGap = bn => Math.min(Math.abs(bn.i - order[0].i), 12 - Math.abs(bn.i - order[0].i));
  const far = order.find(bn => hueGap(bn) >= 2 && hueGap(bn) <= 4 && bn.w > order[0].w * .12);
  const [hA, sA] = toHsl(...A);
  const B = far ? colOf(far) : toRgb((hA + 35) % 360, sA, .5);  // no second hue: use a close neighbour
  const [hB, sB] = toHsl(...B);
  // a third colour for the third blob: another hue from the photo, or a step the other way round the wheel
  const third = order.find(bn => bn !== far && bn !== order[0] && hueGap(bn) >= 1 && bn.w > order[0].w * .08);
  const [hC, sC] = third ? toHsl(...colOf(third)) : [(hA + 325) % 360, sA];
  const dark = n ? lum / n < .36 : false;
  const sat = v => Math.min(.78, Math.max(.38, v * 1.3));
  const t = dark
    ? { base: toRgb(hA, sat(sA) * .7, .14), a: toRgb(hA, sat(sA), .34), b: toRgb(hB, sat(sB), .28), c: toRgb(hC, sat(sC), .3), glow: toRgb(hA, sat(sA), .42), dark: 1 }
    : { base: toRgb(hA, sat(sA) * .6, .88), a: toRgb(hA, sat(sA), .74), b: toRgb(hB, sat(sB), .7), c: toRgb(hC, sat(sC), .76), glow: toRgb(hA, sat(sA) * .8, .93), dark: 0 };
  photoTones.set(img, t);
  return t;
}
const mixC = (p, q, k) => p.map((v, i) => v + (q[i] - v) * k);
const css = c => `rgb(${c.map(v => Math.round(v)).join(',')})`;
// tones for the frame: crossfades from the previous photo's tones right after each swap
function frameTones(st, intro) {
  const list = photos(), p = list[st.idx];
  if (!p || !p.img) return null;
  const cur = tonesOf(p.img);
  const k = !intro && st.since < BG_FADE && list.length > 1 ? smoothIn(st.since / BG_FADE) : 1;
  if (k >= 1) return cur;
  const prev = list[(st.idx - 1 + list.length) % list.length];
  if (!prev || !prev.img) return cur;
  const pt = tonesOf(prev.img);
  const out = { dark: pt.dark + (cur.dark - pt.dark) * k };
  for (const key of ['base', 'a', 'b', 'c', 'glow']) out[key] = mixC(pt[key], cur[key], k);
  return out;
}
function drawPhotoBg(ctx, W, H, st, intro, time) {
  const t = frameTones(st, intro);
  if (!t) { ctx.fillStyle = '#f3f3f3'; ctx.fillRect(0, 0, W, H); return 0; }
  // blurred backdrop: soft colour blobs drifting round the centre on their own orbits, under a light veil
  ctx.fillStyle = css(t.base); ctx.fillRect(0, 0, W, H);
  const Sz = Math.max(W, H), turn = (time || 0) / bgSpin * Math.PI * 2;
  const rgba = (c, al) => `rgba(${c.map(v => Math.round(v)).join(',')},${al})`;
  const blob = (c, orbit, size, phase, dir, al) => {
    const ang = phase + dir * turn;
    const x = W / 2 + Math.cos(ang) * orbit * Sz, y = H / 2 + Math.sin(ang) * orbit * Sz * .85, r = size * Sz;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, al)); g.addColorStop(.45, rgba(c, al * .55)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  blob(t.a, .30, .62, 0, 1, .95);
  blob(t.b, .32, .58, Math.PI * .7, 1, .9);
  blob(t.c, .26, .52, Math.PI * 1.35, -1, .85);
  blob(t.a, .22, .42, Math.PI * 1.9, -1, .5);
  // calm patch behind the word so the text and the capsule photo stay the focus
  const v = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Sz * .45);
  v.addColorStop(0, rgba(t.glow, .45)); v.addColorStop(1, rgba(t.glow, 0));
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  // a touch of the grain texture keeps it from looking flat (and hides banding in the GIF)
  if (grainImg.naturalWidth) {
    const pat = ctx.createPattern(grainImg, 'repeat');
    if (pat) {
      const k = Math.min(W, H) / 1440 * .75; pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
      ctx.save(); ctx.globalAlpha = .14; ctx.globalCompositeOperation = t.dark > .5 ? 'screen' : 'multiply';
      ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
  }
  return t.dark;
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
  let dark = false, darkMix = null;
  if (S.bg === 'photo') {
    darkMix = drawPhotoBg(ctx, W, H, st, !ov && t < PRE, t); dark = darkMix > .5;
  } else if (S.bg === 'grain' && grainImg.naturalWidth) {
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
  const fam = sp.rtl || S.family !== DEFAULT_FAMILY ? S.family : LATIN_FAMILY;
  ctx.font = `900 ${fs}px ${fam}`; ctx.direction = sp.rtl ? 'rtl' : 'ltr';
  let wA = ctx.measureText(sp.a).width, wB = ctx.measureText(sp.b).width;
  const full = wA + wB + (OPEN + 2 * gapE) * fs;
  if (full > W * .9) { const k = (W * .9) / full; fs *= k; wA *= k; wB *= k; ctx.font = `900 ${fs}px ${fam}`; }

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
  ctx.fillStyle = darkMix != null ? css(mixC([22, 22, 22], [244, 244, 244], clamp((darkMix - .5) * 5 + .5))) : (dark ? '#f4f4f4' : '#161616'); ctx.textBaseline = 'alphabetic';

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
$('text').addEventListener('input', e => { S.text = e.target.value || ''; S.splitAt = 'auto'; refreshSplitOptions(); });
// "Capsule position": automatic first, then one choice per gap between letters of the current word
function refreshSplitOptions() {
  const sel = $('splitAt'), w = S.text.replace(/\s+/g, ' ').trim().replace(/ـ/g, '');
  const opts = [['auto', L().splitAuto]];
  for (let i = 1; i < w.length; i++) if (w[i - 1] !== ' ' && w[i] !== ' ') opts.push([String(i), `${w.slice(0, i)} ● ${w.slice(i)}`]);
  sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  sel.value = opts.some(o => o[0] === String(S.splitAt)) ? String(S.splitAt) : 'auto';
  S.splitAt = sel.value;
}
$('splitAt').addEventListener('change', e => { S.splitAt = e.target.value; });
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
// "My photos" is always available: picking it shows the upload button under the tabs
function setSource(mine) {
  useMine = mine; segD.classList.toggle('on', !mine); segM.classList.toggle('on', mine);
  $('photoUpload').classList.toggle('show', mine); renderThumbs(); restart();
}
let thumbsOpen = false;   // more than 5 photos: show 4 and a "+N" tile until it is tapped
// thumbnails of the photos in use, each with a delete (×) button
const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
function renderThumbs() {
  const box = $('thumbs'); box.innerHTML = '';
  const list = useMine ? myImgs : photos(), canDelete = useMine;     // only uploaded photos can be removed
  const fold = !thumbsOpen && list.length > 5, shown = fold ? list.slice(0, 4) : list;
  shown.forEach(p => {
    const el = document.createElement('div'); el.className = 'thumb';
    el.innerHTML = `<img src="${p.img.src}" alt="">` + (canDelete ? `<button class="del" title="${L().remove}" aria-label="${L().remove}">${X_ICON}</button>` : '');
    const del = el.querySelector('.del');
    if (del) del.addEventListener('click', e => { e.stopPropagation(); el.classList.add('out'); setTimeout(() => removePhoto(p), 260); });
    box.appendChild(el);
  });
  if (fold) {
    const more = document.createElement('button'); more.className = 'thumb more'; more.dir = 'ltr';   // keeps "+" in front
    more.textContent = '+' + num(list.length - 4);
    more.addEventListener('click', () => { thumbsOpen = true; renderThumbs(); });
    box.appendChild(more);
  }
  refreshGifInfo();
}
function removePhoto(p) {
  if (!useMine) return;
  const arr = myImgs, i = arr.indexOf(p); if (i === -1) return;
  arr.splice(i, 1);
  if (p.img.src.startsWith('blob:')) URL.revokeObjectURL(p.img.src);   // free the uploaded file
  renderThumbs(); restart();
}
segD.addEventListener('click', () => setSource(false));
segM.addEventListener('click', () => setSource(true));
$('imgfile').addEventListener('change', async e => {
  const files = [...e.target.files].filter(f => f.type.startsWith('image/')); e.target.value = '';
  if (!files.length) return;
  const imgs = await Promise.all(files.map(f => load(URL.createObjectURL(f))));
  const added = imgs.filter(Boolean).map(img => ({ img, pos: [.5, .5] }));
  myImgs = myImgs.concat(added);                       // new uploads are added to the ones already there
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

// ================= GIF length and size hints =================
// The photo-count menu shows how long each choice plays, and a line under it estimates the file size
// from the current choices. The size model is fitted to real exports (e.g. 1080 px, 50 fps, 9 photos ≈ 26 MB).
const BG_WEIGHT = { grain: 1, photo: 4.5, custom: 1.3, white: .85, black: .85 };
function refreshGifInfo() {
  const sel = $('gifCount'), est = $('estimate'); if (!sel || !est) return;
  const n = Math.max(1, photos().length), secs = c => num(Math.round((PRE + CL * c) / speed));
  [...sel.options].forEach(o => {
    const c = o.value === 'all' ? n : Math.min(+o.value, n);
    o.textContent = o.value === 'all' ? L().countAll(num(n), secs(n)) : L().countOpt(num(+o.value), secs(c));
  });
  const cnt = sel.value === 'all' ? n : Math.min(+sel.value, n);
  const W = +$('gifSize').value, [a, b] = ratioWH(), H = Math.round(W * b / a / 2) * 2, fps = +$('gifFps').value;
  const mb = 2.54 * cnt * Math.pow(W * H / 1e6, .85) * Math.pow(fps / 50, .74) * (BG_WEIGHT[S.bg] || 1) / speed;
  const heavy = mb > 15;
  est.classList.toggle('heavy', heavy);
  est.textContent = L().estimate(num(mb, mb < 10 ? 1 : 0)) + (heavy ? ' — ' + L().estimateHeavy : '');
}
panel.addEventListener('change', refreshGifInfo);

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
  refreshGifInfo();
}
speedIn.addEventListener('input', () => setSpeed(SPEEDS[+speedIn.value]));
tlSpeed.addEventListener('click', e => { e.stopPropagation(); setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]); });
setSpeed(1);

// ================= reset everything to default (language stays) =================
$('reset').addEventListener('click', () => {
  const d = L();
  S.text = d.word; $('text').value = d.word;
  S.kashida = 2; S.splitAt = 'auto'; refreshSplitOptions(); S.ratio = '1:1'; S.bg = 'grain'; S.family = DEFAULT_FAMILY;
  document.querySelectorAll('select[data-default]').forEach(sel => sel.value = sel.dataset.default);
  bgImg = null; bgName = ''; bgDark = false; $('bgUpload').classList.remove('show'); $('bgLabel').textContent = d.uploadBg;
  customFontName = ''; $('fontLabel').textContent = d.uploadFont;
  myImgs = []; defaultImgs = defaultAll.slice(); thumbsOpen = false; setSource(false);
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
  exportLimit = Math.max(1, cnt);
  const gifLen = n / fps * gSpeed, liveSpin = bgSpin;
  bgSpin = gifLen / Math.max(1, Math.round(gifLen / liveSpin));   // whole turns only, so the GIF loops without a jump
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  const palettes = new Map();
  const paletteFor = idx => {
    if (!palettes.has(idx)) {
      draw(sctx, W, H, PRE + idx * CL + 1.4);
      palettes.set(idx, quantize(sctx.getImageData(0, 0, W, H).data, 255, { format: 'rgb565' }));
    }
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
      const st = stateAt(t), px = ctx.getImageData(0, 0, W, H).data;
      // photo background: while it crossfades between two photos' colours, the frame gets its own palette
      const fading = S.bg === 'photo' && photos().length > 1 && t >= PRE && st.since < BG_FADE;
      const pal = fading ? quantize(px, 255, { format: 'rgb565' }) : paletteFor(st.idx);
      if (S.bg === 'photo') dither(px, W);                   // breaks gradient banding into a fine, steady pattern
      const index = applyPalette(px, pal, 'rgb565');
      const csEnd = Math.round((i + 1) * 100 / fps), delay = (csEnd - csDone) * 10; csDone = csEnd;
      const fullPal = pal.concat([[255, 0, 255]]), KEY = pal.length;
      if (prevIdx && prevPal === pal) {
        // only pixels that changed are written. With the moving photo background, a colour that moved only a
        // hair is left as it was (the drifting blobs are soft, so this is invisible and keeps the file small)
        const out = new Uint8Array(index.length), loose = S.bg === 'photo', T2 = 14 * 14;
        for (let p = 0; p < index.length; p++) {
          const a = index[p], b = prevIdx[p];
          if (a === b) { out[p] = KEY; continue; }
          if (loose) {
            const ca = pal[a], cb = pal[b], dr = ca[0] - cb[0], dg = ca[1] - cb[1], db = ca[2] - cb[2];
            if (dr * dr + dg * dg + db * db < T2) { out[p] = KEY; index[p] = b; continue; }   // keep what is on screen
          }
          out[p] = a;
        }
        enc.writeFrame(out, W, H, { palette: fullPal, delay, transparent: true, transparentIndex: KEY, dispose: 1, repeat: 0 });
      } else enc.writeFrame(index, W, H, { palette: fullPal, delay, dispose: 1, repeat: 0 });
      prevIdx = index; prevPal = pal;
      const pct = (i + 1) / n; bar.style.width = (pct * 100) + '%'; if (!cancelReq) genLabel.textContent = `${L().creating(Math.round(pct * 100))}  ·  ${L().stop}`;
      if (i % 3 === 0) await yieldUI();
    }
    enc.finish();
    const blob = new Blob([enc.bytes()], { type: 'image/gif' }), mb = num(blob.size / 1048576, 1);
    if (gifPreview.src.startsWith('blob:')) URL.revokeObjectURL(gifPreview.src);
    gifPreview.src = URL.createObjectURL(blob); gifSlot.classList.add('has-gif');
    // save straight away with a download link; the preview below stays as a fallback
    try {
      const a = document.createElement('a'); a.href = gifPreview.src; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove(); say(L().saved(mb));
    } catch { say(L().manual(mb)); }
  } catch (err) { sayError(L().failed + (err && err.message || err)); }
  finally { exportLimit = 0; bgSpin = liveSpin; busy = false; cancelReq = false; gen.classList.remove('busy'); bar.style.width = '0'; genLabel.textContent = L().create; }
});

// ================= boot =================
// every visit opens in English; the visitor can switch language from the flag button
try { localStorage.removeItem('kc-lang'); } catch {}   // forget the choice older versions remembered
document.querySelectorAll('.lang-item').forEach(b => { b.querySelector('.flag').innerHTML = FLAGS[b.dataset.lang]; });
applyLang('en');
const ready = (async () => {
  defaultAll = (await Promise.all(DEFAULTS.map(async d => ({ img: await load(d.src), pos: d.pos })))).filter(p => p.img);
  defaultImgs = defaultAll.slice(); renderThumbs();
  await document.fonts.load(`900 40px ${S.family}`, 'ایران IRAN').catch(() => {});
  await document.fonts.load(`900 40px ${LATIN_FAMILY}`, 'IRAN').catch(() => {});
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
// pulling the settings down while they are scrolled to the very top moves the whole sheet down with the finger
// (like a phone's bottom sheet); on release it settles on the nearest stop, or one stop lower after a clear pull
let pull = null;
panel.addEventListener('touchstart', e => {
  if (!isMobile.matches || sheetPos === 'rest' || handle.contains(e.target) || e.touches.length > 1) { pull = null; return; }
  pull = { y: e.touches[0].clientY, top: panel.getBoundingClientRect().top, from: sheetPos, active: false };
}, { passive: true });
panel.addEventListener('touchmove', e => {
  if (!pull) return;
  const dy = e.touches[0].clientY - pull.y;
  if (!pull.active) {
    if (panel.scrollTop > 0 || dy < 6) { if (dy < -6 || panel.scrollTop > 0) pull = null; return; }   // normal scrolling
    pull.active = true; pull.y = e.touches[0].clientY; panel.classList.remove('snap');
  }
  e.preventDefault();
  sheetTop = pull.top + Math.max(0, e.touches[0].clientY - pull.y); placeSheet();
}, { passive: false });
const endPull = () => {
  if (!pull || !pull.active) { pull = null; return; }
  const [up, rest] = sheetStops(), half = (up + rest) / 2, y = panel.getBoundingClientRect().top, moved = y - pull.top;
  const order = ['up', 'half', 'rest'], at = { up, half, rest };
  let pick = order.reduce((p, k) => Math.abs(at[k] - y) < Math.abs(at[p] - y) ? k : p, 'up');
  if (pick === pull.from && moved > 60) pick = order[Math.min(2, order.indexOf(pull.from) + 1)];
  pull = null; snapTo(pick);
};
panel.addEventListener('touchend', endPull);
panel.addEventListener('touchcancel', endPull);
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
