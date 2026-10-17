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
  const p = pixels(rect);
  drawText(ctx, lines, [p[0] + 2, p[1] + 1, p[2] - 4, p[3] - 2], maxFont, { bold: bold });
}

// Lines inside a pixel box: the largest font that fits its height, then smaller only if a line
// is too wide. Text is clipped to the box, so it never leaves its note.
function drawText(ctx, lines, box, maxFont, opts) {
  if (!lines || !lines.length) return;
  const padX = 4;
  const padY = lines.length > 1 ? 3 : 1;
  let font = Math.max(9, Math.min(maxFont, (box[3] - padY * 2) / (lines.length * LINE)));
  function weight(i) { return opts.bold || (opts.boldFirst && i === 0) ? '800 ' : '600 '; }
  function tooWide() {
    return lines.some(function (line, i) {
      ctx.font = weight(i) + font + 'px ' + FONT;
      return ctx.measureText(line).width > box[2] - padX * 2;
    });
  }
  while (font > 9 && tooWide()) font -= 0.5;
  ctx.save();
  ctx.beginPath(); ctx.rect(box[0], box[1], box[2], box[3]); ctx.clip();
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lineHeight = font * LINE;
  const top = box[1] + box[3] / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach(function (line, i) {
    ctx.font = weight(i) + font + 'px ' + FONT;
    ctx.fillText(line, box[0] + padX, top + lineHeight * i);
  });
  ctx.restore();
}

function drawNote(ctx, zone) {
  const p = pixels(zone.rect);
  ctx.save();
  ctx.fillStyle = 'rgba(24,33,44,.12)'; ctx.fillRect(p[0] + 2, p[1] + 3, p[2], p[3]);
  ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(zone.color || '') ? zone.color : '#fff9e9';
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.fillRect(p[0], p[1], p[2], p[3]); ctx.strokeRect(p[0], p[1], p[2], p[3]);
  ctx.fillStyle = '#b2a3ed'; ctx.fillRect(p[0] + p[2] * 0.37, p[1] - 3, p[2] * 0.26, 6);
  drawLines(ctx, zone.lines, zone.rect, 16, false);
  ctx.restore();
}

// ---------- Notes that belong to the scene ----------
// A note is a phone notification, a luggage tag tied to the main object, or paper.
// The form never depends on whether the note is private: ordinary notes use the same forms,
// so the child has to read the text. Every form stays inside its rect, so a sticker
// covers the whole note, even while it animates.
const FORMS = ['phone', 'tag', 'paper'];
// A badge glued onto an object of the picture; only used when the data asks for it (zone.form).
const EXTRA_FORMS = ['badge', 'message'];
const BADGE_STICK = 520;
const KIND_FORM = { code: 'phone', private_location: 'phone', address: 'tag', password: 'paper' };
const PHONE_IN = 420;
const PHONE_BUZZ = 480;
const TAG_SWING = 1300;
const STAGGER = 220;

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function noteForm(level, zone) {
  if (FORMS.indexOf(zone.form) !== -1 || EXTRA_FORMS.indexOf(zone.form) !== -1) return zone.form;
  if (zone.kind && KIND_FORM[zone.kind]) return KIND_FORM[zone.kind];
  return FORMS[hash(level.id + ':' + zone.id) % FORMS.length];
}

function easeOutBack(x) {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

function clipTo(ctx, p) {
  ctx.beginPath(); ctx.rect(p[0], p[1], p[2], p[3]); ctx.clip();
}

// t: ms since this note started to appear; null means a still picture (poster, tests).
function drawMessage(ctx, zone, p) {
  ctx.save();
  clipTo(ctx, p);
  roundedRect(ctx, p[0] + 1, p[1] + 1, p[2] - 2, p[3] - 7, 10);
  ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(zone.color || '') ? zone.color : '#ffffff';
  ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p[0] + 12, p[1] + p[3] - 7);
  ctx.lineTo(p[0] + 6, p[1] + p[3] - 1);
  ctx.lineTo(p[0] + 26, p[1] + p[3] - 7);
  ctx.fill(); ctx.stroke();
  drawText(ctx, zone.lines, [p[0] + 3, p[1] + 3, p[2] - 6, p[3] - 12], 15, { boldFirst: true });
  ctx.restore();
}

function drawPhone(ctx, zone, p, t) {
  if (t !== null && t < 0) return;
  let dx = 0;
  let dy = 0;
  if (t !== null) {
    dy = -(1 - easeOutBack(Math.min(1, t / PHONE_IN))) * p[3];
    const buzz = t - PHONE_IN;
    if (buzz > 0 && buzz < PHONE_BUZZ) dx = Math.sin(buzz / 22) * 2.2 * (1 - buzz / PHONE_BUZZ);
  }
  ctx.save();
  clipTo(ctx, p);
  ctx.translate(dx, dy);
  roundedRect(ctx, p[0] + 1, p[1] + 1, p[2] - 2, p[3] - 2, 9);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  // App icon with a tick: the notification "came from the phone".
  roundedRect(ctx, p[0] + 5, p[1] + 5, 12, 12, 3.5);
  ctx.fillStyle = '#21a038'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p[0] + 8, p[1] + 11); ctx.lineTo(p[0] + 10.2, p[1] + 13.2); ctx.lineTo(p[0] + 14, p[1] + 8.8);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  // Header row like a real notification; the lines get the full card width below it.
  ctx.fillStyle = '#7b8590'; ctx.font = '600 8px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('сейчас', p[0] + 21, p[1] + 11);
  drawText(ctx, zone.lines, [p[0] + 2, p[1] + 18, p[2] - 4, p[3] - 20], 15, { boldFirst: true });
  ctx.restore();
}

// zone.anchor ([x, y] in board fractions) ties the tag to a point of the picture, e.g. a zipper.
// Without it the string goes to the main object. A tag right below its anchor hangs by its top.
function tagGeometry(level, zone, p) {
  let anchor;
  if (Array.isArray(zone.anchor) && zone.anchor.length === 2 && zone.anchor.every(Number.isFinite)) {
    anchor = [zone.anchor[0] * 360, zone.anchor[1] * 480];
  } else {
    const hero = level.keepZones.find(function (k) { return !k.lines; });
    const h = hero ? pixels(hero.rect) : [120, 160, 120, 160];
    const toward = p[0] + p[2] / 2 < h[0] + h[2] / 2 ? p[0] + p[2] : p[0];
    anchor = [Math.max(h[0] + h[2] * 0.3, Math.min(h[0] + h[2] * 0.7, toward)),
      p[1] + p[3] / 2 < h[1] ? h[1] + h[3] * 0.06 : h[1] + h[3] * 0.94];
  }
  const side = anchor[1] <= p[1] && anchor[0] >= p[0] && anchor[0] <= p[0] + p[2] ? 'top' :
    anchor[0] > p[0] + p[2] / 2 ? 'right' : 'left';
  const hole = side === 'top' ? [p[0] + p[2] / 2, p[1] + 9] :
    [side === 'right' ? p[0] + p[2] - 8 : p[0] + 8, p[1] + p[3] / 2];
  return { side: side, hole: hole, anchor: anchor };
}

function drawTagString(ctx, level, zone) {
  const p = pixels(zone.rect);
  const g = tagGeometry(level, zone, p);
  ctx.save();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(g.hole[0], g.hole[1]);
  const sag = g.side === 'top' ? 0 : 16;
  ctx.quadraticCurveTo((g.hole[0] + g.anchor[0]) / 2, Math.max(g.hole[1], g.anchor[1]) + sag, g.anchor[0], g.anchor[1]);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(g.anchor[0], g.anchor[1], 3, 0, Math.PI * 2);
  ctx.fillStyle = INK; ctx.fill();
  ctx.restore();
}

function drawTag(ctx, level, zone, p, t) {
  const g = tagGeometry(level, zone, p);
  const angle = t === null || t < 0 ? 0 : 0.1 * Math.exp(-t / 450) * Math.sin(t / 110);
  const x0 = p[0] + 1; const y0 = p[1] + 1; const x1 = p[0] + p[2] - 1; const y1 = p[1] + p[3] - 1;
  const cut = Math.min(13, p[3] / 3);
  ctx.save();
  clipTo(ctx, p);
  ctx.translate(g.hole[0], g.hole[1]); ctx.rotate(angle); ctx.translate(-g.hole[0], -g.hole[1]);
  ctx.beginPath();
  if (g.side === 'top') {
    ctx.moveTo(x0, y0 + cut); ctx.lineTo(x0 + cut, y0); ctx.lineTo(x1 - cut, y0);
    ctx.lineTo(x1, y0 + cut); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1);
  } else if (g.side === 'right') {
    ctx.moveTo(x0, y0); ctx.lineTo(x1 - cut, y0); ctx.lineTo(x1, y0 + cut);
    ctx.lineTo(x1, y1 - cut); ctx.lineTo(x1 - cut, y1); ctx.lineTo(x0, y1);
  } else {
    ctx.moveTo(x1, y0); ctx.lineTo(x0 + cut, y0); ctx.lineTo(x0, y0 + cut);
    ctx.lineTo(x0, y1 - cut); ctx.lineTo(x0 + cut, y1); ctx.lineTo(x1, y1);
  }
  ctx.closePath();
  ctx.fillStyle = '#f6d58a'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); ctx.arc(g.hole[0], g.hole[1], 5.5, 0, Math.PI * 2);
  ctx.strokeStyle = '#c99a3c'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(g.hole[0], g.hole[1], 3.2, 0, Math.PI * 2);
  ctx.fillStyle = '#fff9e9'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  const box = g.side === 'top' ? [p[0] + 2, p[1] + 16, p[2] - 4, p[3] - 18] :
    g.side === 'right' ? [p[0] + 2, p[1] + 2, p[2] - 18, p[3] - 4] : [p[0] + 16, p[1] + 2, p[2] - 18, p[3] - 4];
  drawText(ctx, zone.lines, box, 15, { boldFirst: true });
  ctx.restore();
}

// Badge glued onto the picture: it pops on and settles, always inside its rect.
function drawBadge(ctx, zone, p, t) {
  let scale = 1;
  let angle = -0.04;
  if (t !== null) {
    if (t < 0) return;
    const k = Math.min(1, t / BADGE_STICK);
    scale = 0.6 + 0.4 * easeOutBack(k);
    angle = -0.04 - 0.12 * (1 - k);
  }
  const cx = p[0] + p[2] / 2;
  const cy = p[1] + p[3] / 2;
  ctx.save();
  clipTo(ctx, p);
  ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
  roundedRect(ctx, p[0] + 3, p[1] + 3, p[2] - 6, p[3] - 6, 10);
  ctx.fillStyle = '#fff3b0'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
  // Stitched edge: it is sewn / glued onto the backpack.
  roundedRect(ctx, p[0] + 7, p[1] + 7, p[2] - 14, p[3] - 14, 7);
  ctx.setLineDash([4, 3]); ctx.strokeStyle = '#c99a3c'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.setLineDash([]);
  drawText(ctx, zone.lines, [p[0] + 8, p[1] + 8, p[2] - 16, p[3] - 16], 15, { boldFirst: true });
  ctx.restore();
}

function textZones(level) {
  return level.keepZones.filter(function (zone) { return zone.lines && zone.style === 'note'; })
    .concat(level.secrets);
}

// Draws every note; returns true while an entrance animation is still running.
function drawNotes(ctx, level, now) {
  const zones = textZones(level);
  let animating = false;
  zones.forEach(function (zone) {
    if (noteForm(level, zone) === 'tag') drawTagString(ctx, level, zone);
  });
  zones.forEach(function (zone, i) {
    const form = noteForm(level, zone);
    const p = pixels(zone.rect);
    const t = now === null ? null : now - i * STAGGER;
    if (form === 'message') {
      drawMessage(ctx, zone, p);
    } else if (form === 'phone') {
      drawPhone(ctx, zone, p, t);
      if (t !== null && t < PHONE_IN + PHONE_BUZZ) animating = true;
    } else if (form === 'tag') {
      drawTag(ctx, level, zone, p, t);
      if (t !== null && t < TAG_SWING) animating = true;
    } else if (form === 'badge') {
      drawBadge(ctx, zone, p, t);
      if (t !== null && t < BADGE_STICK) animating = true;
    } else {
      drawNote(ctx, zone);
    }
  });
  return animating;
}

// Entrance timing per canvas and level: the animation runs once when a scene appears.
const entrances = new WeakMap();
function entranceTime(canvas, level) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const reduce = typeof window !== 'undefined' && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return null;
  const entry = entrances.get(canvas);
  if (!entry || entry.levelId !== level.id) {
    entrances.set(canvas, { levelId: level.id, start: now });
    return 0;
  }
  return now - entry.start;
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
  if (options.bare) {
    // Palette card: only the artwork, same size and position as on the board; the card itself
    // is the button's background.
    const sticker = options.assets.stickers[options.stickerId] || {};
    const img = options.assets.images[sticker.src];
    const p = pixels([0, 0, rect[2], rect[3]]);
    if (img) {
      const size = Math.min(p[2] * 0.82, p[3] * 0.9);
      ctx.drawImage(img, (p[2] - size) / 2, (p[3] - size) / 2, size, size);
    }
    return;
  }
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
  // options.area = [x, y, width, height] in canvas pixels draws the frame into a part of the
  // canvas (the poster); by default the frame fills the whole canvas.
  const area = Array.isArray(options.area) && options.area.length === 4 ? options.area :
    [0, 0, canvas.width, canvas.height];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(area[0], area[1], area[2], area[3]);
  ctx.save();
  ctx.beginPath(); ctx.rect(area[0], area[1], area[2], area[3]); ctx.clip();
  ctx.setTransform(area[2] / 360, 0, 0, area[3] / 480, area[0], area[1]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e9e6ff'; ctx.fillRect(0, 0, 360, 480);
  const background = assets.images[level.background];
  if (background) ctx.drawImage(background, 0, 0, 360, 480);
  else drawMissingBackground(ctx, level);
  level.keepZones.forEach(function (zone) {
    if (zone.lines && zone.style !== 'note') drawCaption(ctx, zone);
  });
  // options.animate: the caller redraws while this returns { animating: true }.
  // The renderer itself never schedules frames.
  const animating = drawNotes(ctx, level, options.animate ? entranceTime(canvas, level) : null);
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
  ctx.restore();
  return { animating: animating };
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
