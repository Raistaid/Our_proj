// One layout for the visible text and for the privacy check (logical 360 × 480 pixels).
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const LINE = 1.18;
const FORMS = ['phone', 'tag', 'paper', 'badge', 'message'];
const KIND_FORM = { code: 'phone', private_location: 'phone', address: 'tag', password: 'paper' };

export function noteForm(level, zone) {
  if (FORMS.includes(zone.form)) return zone.form;
  if (zone.kind && KIND_FORM[zone.kind]) return KIND_FORM[zone.kind];
  let hash = 0;
  for (const char of level.id + ':' + zone.id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ['phone', 'tag', 'paper'][Math.abs(hash) % 3];
}

export function pixels(rect) { return [rect[0] * 360, rect[1] * 480, rect[2] * 360, rect[3] * 480]; }

export function tagGeometry(level, zone, p = pixels(zone.rect)) {
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
  return { side, hole, anchor };
}

export function noteTextSpec(level, zone) {
  const p = pixels(zone.rect);
  const form = noteForm(level, zone);
  let box = [p[0] + 2, p[1] + 1, p[2] - 4, p[3] - 2];
  let maxFont = 16;
  if (form === 'phone') box = [p[0] + 2, p[1] + 18, p[2] - 4, p[3] - 20];
  if (form === 'message') box = [p[0] + 3, p[1] + 3, p[2] - 6, p[3] - 12];
  if (form === 'badge') box = [p[0] + 8, p[1] + 8, p[2] - 16, p[3] - 16];
  if (form === 'tag') {
    const side = tagGeometry(level, zone, p).side;
    box = side === 'top' ? [p[0] + 2, p[1] + 16, p[2] - 4, p[3] - 18] :
      side === 'right' ? [p[0] + 2, p[1] + 2, p[2] - 18, p[3] - 4] : [p[0] + 16, p[1] + 2, p[2] - 18, p[3] - 4];
  }
  if (form !== 'paper') maxFont = 15;
  return { box, maxFont, boldFirst: form !== 'paper', angle: form === 'badge' ? -0.04 : 0, p };
}

export function textLayout(ctx, lines, box, maxFont, opts = {}) {
  if (!lines || !lines.length) return [];
  const padY = lines.length > 1 ? 3 : 1;
  let font = Math.max(9, Math.min(maxFont, (box[3] - padY * 2) / (lines.length * LINE)));
  const weight = i => opts.bold || (opts.boldFirst && i === 0) ? '800 ' : '600 ';
  function tooWide() {
    return lines.some(function (line, i) {
      ctx.font = weight(i) + font + 'px ' + FONT;
      return ctx.measureText(line).width > box[2] - 8;
    });
  }
  while (font > 9 && tooWide()) font -= 0.5;
  const top = box[1] + box[3] / 2 - (lines.length - 1) * font * LINE / 2;
  return lines.map((text, index) => ({ text, index, x: box[0] + 4, y: top + font * LINE * index,
    font: weight(index) + font + 'px ' + FONT, size: font }));
}

export function paintText(ctx, lines, box, maxFont, opts = {}, selectedLines) {
  ctx.save();
  ctx.beginPath(); ctx.rect(...box); ctx.clip();
  ctx.fillStyle = '#18212c'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const run of textLayout(ctx, lines, box, maxFont, opts)) {
    if (selectedLines && !selectedLines.includes(run.index)) continue;
    ctx.font = run.font;
    ctx.fillText(run.text, run.x, run.y);
  }
  ctx.restore();
}

export function paintNoteText(ctx, level, zone, selectedLines) {
  const spec = noteTextSpec(level, zone);
  paintText(ctx, zone.lines, spec.box, spec.maxFont, spec, selectedLines);
}

export function sensitiveLines(zone) {
  return zone.sensitiveLines || (zone.lines || []).map((_, i) => i).slice(zone.lines.length > 1 ? 1 : 0);
}
