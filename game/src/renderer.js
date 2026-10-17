import { getStickerRect } from './game.js';
import { centeredRect, validRect } from './geometry.js';
export { loadAssets } from './assets.js';

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

function drawSticker(ctx, placement, assets, preview) {
  const p = pixels(placement.rect);
  const sticker = assets.stickers[placement.stickerId] || { color: '#e4ff69' };
  ctx.save();
  // This is an opaque rectangular mask. The artwork may have transparent pixels.
  ctx.globalAlpha = preview ? 0.65 : 1;
  ctx.fillStyle = sticker.color || '#e4ff69';
  ctx.fillRect(p[0], p[1], p[2], p[3]);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.8;
  ctx.strokeRect(p[0], p[1], p[2], p[3]);
  // Preview, placed artwork and exported artwork share the same fixed size.
  ctx.beginPath(); ctx.rect(p[0], p[1], p[2], p[3]); ctx.clip();
  const img = assets.images[sticker.src];
  if (img) {
    const size = Math.min(p[2] * 0.82, p[3] * 0.9);
    ctx.drawImage(img, p[0] + (p[2] - size) / 2, p[1] + (p[3] - size) / 2, size, size);
  } else {
    ctx.fillStyle = INK; ctx.font = '700 12px ' + FONT; ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; ctx.fillText('ПРИКРЫТО', p[0] + p[2] / 2, p[1] + p[3] / 2);
  }
  ctx.restore();
}

// Palette cards use the exact same drawing and proportions as placed stickers.
export function renderStickerCard(options) {
  const canvas = options.canvas;
  const rect = getStickerRect(options.level, { x: 0.5, y: 0.5 });
  const ctx = canvas.getContext('2d');
  if (!ctx || !rect) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / (rect[2] * 360), 0, 0,
    canvas.height / (rect[3] * 480), 0, 0);
  drawSticker(ctx, { stickerId: options.stickerId, rect: [0, 0, rect[2], rect[3]] }, options.assets, false);
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
  let previewPlacement = null;
  if (options.preview) {
    const point = options.preview;
    const original = point.placementId ? placements.find(function (p) { return p.id === point.placementId; }) : null;
    const rect = original && Number.isFinite(point.x) && Number.isFinite(point.y) ?
      centeredRect(point.x, point.y, original.rect[2], original.rect[3]) :
      !point.placementId ? getStickerRect(level, point) : null;
    if (rect && validRect(rect)) previewPlacement = { stickerId: original ? original.stickerId : point.stickerId, rect: rect };
  }
  placements.forEach(function (placement) {
    if (options.preview && options.preview.removing && options.preview.placementId === placement.id) return;
    if (previewPlacement && options.preview.placementId === placement.id) {
      drawSticker(ctx, previewPlacement, assets, true);
    } else drawSticker(ctx, placement, assets, false);
  });
  (options.hintIds || []).forEach(function (id) {
    const zone = level.secrets.find(function (s) { return s.id === id; });
    if (!zone) return;
    const p = pixels(zone.rect);
    ctx.save(); ctx.strokeStyle = '#7a398d'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
    ctx.strokeRect(p[0] - 4, p[1] - 4, p[2] + 8, p[3] + 8); ctx.restore();
  });
  if (previewPlacement && !options.preview.placementId) drawSticker(ctx, previewPlacement, assets, true);
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
