import { centeredRect } from './geometry.js';

const INK = '#18212c';
export function roundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function loadAssets(content) {
  const images = {};
  const missing = [];
  const paths = new Set(content.stickers.map(function (s) { return s.src; }));
  content.levels.forEach(function (level) { paths.add(level.background); });
  await Promise.all(Array.from(paths).map(function (path) {
    return new Promise(function (resolve) {
      const img = new Image();
      let settled = false;
      const timer = setTimeout(function () { finish(false); }, 1000);
      function finish(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) images[path] = img;
        else missing.push(path);
        resolve();
      }
      img.onload = function () { finish(true); };
      img.onerror = function () { finish(false); };
      img.src = new URL(path, document.baseURI).href;
    });
  }));
  const stickers = {};
  content.stickers.forEach(function (s) { stickers[s.id] = s; });
  return { images: images, stickers: stickers, missing: missing };
}

function pixels(rect) {
  return [rect[0] * 360, rect[1] * 480, rect[2] * 360, rect[3] * 480];
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const LINE = 1.18;

function drawLines(ctx, lines, rect, maxFont, bold) {
  if (!lines || !lines.length) return;
  const p = pixels(rect);
  const padX = 6;
  const padY = lines.length > 1 ? 4 : 2;
  // The largest font that fits the note height; then shrink only if a line is too wide.
  let font = Math.min(maxFont, (p[3] - padY * 2) / (lines.length * LINE));
  font = Math.max(9, font);
  function setFont() { ctx.font = (bold ? '700 ' : '600 ') + font + 'px ' + FONT; }
  setFont();
  while (font > 9 && lines.some(function (s) { return ctx.measureText(s).width > p[2] - padX * 2; })) {
    font -= 0.5; setFont();
  }
  const pad = padX;
  ctx.save();
  ctx.beginPath(); ctx.rect(p[0] + 2, p[1] + 1, p[2] - 4, p[3] - 2); ctx.clip();
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lineHeight = font * LINE;
  const top = p[1] + p[3] / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach(function (line, i) { ctx.fillText(line, p[0] + pad, top + lineHeight * i); });
  ctx.restore();
}

function drawNote(ctx, zone) {
  const p = pixels(zone.rect);
  ctx.save();
  ctx.fillStyle = 'rgba(24,33,44,.12)'; ctx.fillRect(p[0] + 2, p[1] + 3, p[2], p[3]);
  ctx.fillStyle = '#fff9e9'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.fillRect(p[0], p[1], p[2], p[3]); ctx.strokeRect(p[0], p[1], p[2], p[3]);
  ctx.fillStyle = '#b2a3ed'; ctx.fillRect(p[0] + p[2] * 0.37, p[1] - 3, p[2] * 0.26, 6);
  drawLines(ctx, zone.lines, zone.rect, 16, false);
  ctx.restore();
}

function drawCaption(ctx, zone) {
  const p = pixels(zone.rect);
  ctx.save();
  ctx.fillStyle = '#fff9e9'; ctx.fillRect(p[0], p[1], p[2], p[3]);
  drawLines(ctx, zone.lines, zone.rect, 15, true);
  ctx.restore();
}

// Bounce of a freshly placed sticker's artwork. The opaque backing never moves.
const BOUNCE_MS = 240;
const motion = new WeakMap();

function reducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function bounceScales(canvas, placements, now) {
  let entry = motion.get(canvas);
  const first = !entry;
  if (first) { entry = { born: new Map(), frame: 0 }; motion.set(canvas, entry); }
  const alive = new Set();
  const scales = {};
  let animating = false;
  placements.forEach(function (p) {
    const key = p.id + ':' + p.rect.join(',');
    alive.add(key);
    // Placements that existed before this canvas was first drawn (e.g. the poster) do not bounce.
    if (!entry.born.has(key)) entry.born.set(key, first || reducedMotion() ? -Infinity : now);
    const t = (now - entry.born.get(key)) / BOUNCE_MS;
    if (t >= 0 && t < 1) {
      scales[key] = 1 + 0.16 * Math.sin(Math.PI * t) * (1 - t * 0.5);
      animating = true;
    }
  });
  Array.from(entry.born.keys()).forEach(function (key) { if (!alive.has(key)) entry.born.delete(key); });
  return { entry: entry, scales: scales, animating: animating };
}

function drawSticker(ctx, placement, assets, preview, scale) {
  const p = pixels(placement.rect);
  const sticker = assets.stickers[placement.stickerId] || { color: '#e4ff69' };
  ctx.save();
  // This is an opaque rectangular mask. The artwork may have transparent pixels.
  ctx.globalAlpha = preview ? 0.65 : 1;
  ctx.fillStyle = sticker.color || '#e4ff69';
  ctx.fillRect(p[0], p[1], p[2], p[3]);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
  ctx.strokeRect(p[0], p[1], p[2], p[3]);
  // Artwork stays inside the backing even while it bounces.
  ctx.beginPath(); ctx.rect(p[0], p[1], p[2], p[3]); ctx.clip();
  const img = assets.images[sticker.src];
  if (img) {
    const size = Math.min(p[2] * 0.82, p[3] * 0.9) * (scale || 1);
    ctx.drawImage(img, p[0] + (p[2] - size) / 2, p[1] + (p[3] - size) / 2, size, size);
  } else {
    ctx.fillStyle = INK; ctx.font = '700 12px ' + FONT; ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; ctx.fillText('ПРИКРЫТО', p[0] + p[2] / 2, p[1] + p[3] / 2);
  }
  ctx.restore();
}

function drawMissingBackground(ctx, level) {
  ctx.save();
  ctx.strokeStyle = 'rgba(24,33,44,.08)'; ctx.lineWidth = 1;
  for (let x = 0; x <= 360; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke(); }
  for (let y = 0; y <= 480; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(360, y); ctx.stroke(); }
  level.keepZones.forEach(function (zone) {
    if (zone.lines) return;
    const p = pixels(zone.rect);
    ctx.fillStyle = '#b2a3ed'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    roundedRect(ctx, p[0], p[1], p[2], p[3], 24); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = '800 17px ' + FONT; ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ГЛАВНЫЙ ПРЕДМЕТ', p[0] + p[2] / 2, p[1] + p[3] / 2 - 10);
    ctx.font = '600 13px ' + FONT;
    ctx.fillText('оставь его видимым', p[0] + p[2] / 2, p[1] + p[3] / 2 + 12);
  });
  ctx.restore();
}

export function renderBoard(options) {
  const canvas = options.canvas;
  const level = options.level;
  const assets = options.assets;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / 360, 0, 0, canvas.height / 480, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e9e6ff'; ctx.fillRect(0, 0, 360, 480);
  const background = assets.images[level.background];
  if (background) ctx.drawImage(background, 0, 0, 360, 480);
  else drawMissingBackground(ctx, level);
  level.keepZones.forEach(function (zone) {
    if (zone.lines) {
      if (zone.style === 'note') drawNote(ctx, zone);
      else drawCaption(ctx, zone);
    }
  });
  level.secrets.forEach(function (zone) { drawNote(ctx, zone); });
  const placements = options.placements || [];
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const bounce = bounceScales(canvas, placements, now);
  placements.forEach(function (placement) {
    drawSticker(ctx, placement, assets, false, bounce.scales[placement.id + ':' + placement.rect.join(',')]);
  });
  (options.hintIds || []).forEach(function (id) {
    const zone = level.secrets.find(function (s) { return s.id === id; });
    if (!zone) return;
    const p = pixels(zone.rect);
    ctx.save(); ctx.strokeStyle = '#7a398d'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
    ctx.strokeRect(p[0] - 4, p[1] - 4, p[2] + 8, p[3] + 8); ctx.restore();
  });
  if (options.preview) {
    const size = level.defaultStickerSize || { w: 0.3, h: 0.2 };
    drawSticker(ctx, {
      stickerId: options.preview.stickerId,
      rect: centeredRect(options.preview.x, options.preview.y, size.w, size.h)
    }, assets, true);
  }
  // Keep redrawing only while a bounce is running; the newest options always win.
  bounce.entry.last = options;
  if (bounce.animating && !bounce.entry.frame && typeof requestAnimationFrame === 'function') {
    bounce.entry.frame = requestAnimationFrame(function () {
      bounce.entry.frame = 0;
      if (canvas.isConnected) renderBoard(bounce.entry.last);
    });
  }
}

export function fitCanvas(canvas) {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return false;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width; canvas.height = height;
  }
  return true;
}
