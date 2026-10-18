import { noteTextSpec, noteForm, noteBounds, paintNoteText, sensitiveLines, textLayout } from './note-text.js';

// Rasterise only the sensitive lines, with the same font, clipping and settled rotation
// as the board. Empty paper, headings, spaces and holes inside letters are not targets.
const SCALE = 2;
const cache = new Map();
let surface;
function canvasSurface() {
  if (!surface && typeof document !== 'undefined') surface = document.createElement('canvas');
  return surface;
}

export function inkRegions(data, width, height, left, top, scale = SCALE) {
  const regions = [];
  for (let y = 0; y < height; y += 1) {
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const ink = x < width && data[(y * width + x) * 4 + 3] > 0;
      if (ink && start === -1) start = x;
      if (!ink && start !== -1) {
        regions.push([(left + start / scale) / 360, (top + y / scale) / 480,
          (x - start) / scale / 360, 1 / scale / 480]);
        start = -1;
      }
    }
  }
  return regions;
}

// Non-DOM tools and test runners use individual glyph bounds. Browsers always use
// the ink raster; this fallback also keeps the rules usable in a headless CLI.
function metricRegions(level, zone, ctx, fraction) {
  const spec = noteTextSpec(level, zone);
  const bounds = noteBounds(zone);
  const measure = ctx || { font: '', measureText(text) {
    return { width: text.length * (parseFloat(this.font.split(' ')[1]) || 12) * .6 };
  } };
  measure.textBaseline = 'middle';
  measure.textAlign = 'left';
  const regions = [];
  for (const run of textLayout(measure, zone.lines, spec.box, spec.maxFont, spec)) {
    if (!sensitiveLines(zone).includes(run.index)) continue;
    measure.font = run.font;
    const cutoff = run.x + measure.measureText(run.text).width * fraction;
    let prefix = '';
    for (const char of run.text) {
      const x = run.x + measure.measureText(prefix).width;
      prefix += char;
      if (/\s/.test(char)) continue;
      const m = measure.measureText(char);
      const left = Math.max(spec.box[0], x - (m.actualBoundingBoxLeft || 0));
      const top = Math.max(spec.box[1], run.y - (m.actualBoundingBoxAscent ?? run.size * .45));
      const right = Math.min(cutoff, spec.box[0] + spec.box[2], x + (m.actualBoundingBoxRight ?? m.width));
      const bottom = Math.min(spec.box[1] + spec.box[3], run.y + (m.actualBoundingBoxDescent ?? run.size * .45));
      const width = right - left, height = bottom - top;
      if (width <= 0 || height <= 0) continue;
      const corners = [[left, top], [left + width, top], [left, top + height], [left + width, top + height]].map(([px, py]) => {
        const cx = spec.p[0] + spec.p[2] / 2, cy = spec.p[1] + spec.p[3] / 2;
        return [cx + (px - cx) * Math.cos(spec.angle) - (py - cy) * Math.sin(spec.angle),
          cy + (px - cx) * Math.sin(spec.angle) + (py - cy) * Math.cos(spec.angle)];
      });
      const x0 = Math.max(bounds[0], Math.min(...corners.map(p => p[0])));
      const y0 = Math.max(bounds[1], Math.min(...corners.map(p => p[1])));
      const x1 = Math.min(bounds[0] + bounds[2], Math.max(...corners.map(p => p[0])));
      const y1 = Math.min(bounds[1] + bounds[3], Math.max(...corners.map(p => p[1])));
      if (x1 > x0 && y1 > y0) regions.push([x0 / 360, y0 / 480, (x1 - x0) / 360, (y1 - y0) / 480]);
    }
  }
  return regions;
}

export function sensitiveRegions(level, zone) {
  const fraction = level.requiredTextFraction ?? 1;
  // Synthetic geometry-only callers do not carry text.
  if (!zone.lines || !zone.lines.length) return [[zone.rect[0], zone.rect[1], zone.rect[2] * fraction, zone.rect[3]]];
  const key = JSON.stringify([level.id, level.keepZones, zone, fraction]);
  const canvas = canvasSurface();
  const modeKey = (canvas ? 'canvas:' : 'metrics:') + key;
  if (cache.has(modeKey)) return cache.get(modeKey);
  let regions;
  let ctx;
  if (canvas) {
    const spec = noteTextSpec(level, zone), p = spec.p;
    const bounds = noteBounds(zone);
    const left = Math.floor(bounds[0] * SCALE) / SCALE, top = Math.floor(bounds[1] * SCALE) / SCALE;
    canvas.width = Math.ceil((bounds[0] + bounds[2] - left) * SCALE);
    canvas.height = Math.ceil((bounds[1] + bounds[3] - top) * SCALE);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.setTransform(SCALE, 0, 0, SCALE, -left * SCALE, -top * SCALE);
      ctx.translate(p[0] + p[2] / 2, p[1] + p[3] / 2); ctx.rotate(spec.rotation);
      ctx.translate(-p[0] - p[2] / 2, -p[1] - p[3] / 2);
      if (noteForm(level, zone) !== 'paper') {
        ctx.beginPath(); ctx.rect(...p); ctx.clip();
      }
      ctx.translate(p[0] + p[2] / 2, p[1] + p[3] / 2); ctx.rotate(spec.badgeAngle);
      ctx.translate(-p[0] - p[2] / 2, -p[1] - p[3] / 2);
      paintNoteText(ctx, level, zone, sensitiveLines(zone), fraction);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (image && image.data) regions = inkRegions(image.data, canvas.width, canvas.height, left, top);
    }
  }
  if (!regions) regions = metricRegions(level, zone, ctx, fraction);
  // Never accept a secret vacuously if a broken canvas/font produced no glyphs.
  if (!regions.length) regions = [[zone.rect[0], zone.rect[1], zone.rect[2] * fraction, zone.rect[3]]];
  if (cache.size >= 128) cache.clear();
  cache.set(modeKey, regions);
  return regions;
}
