import { noteTextSpec, rotatePoint } from './note-text.js';
import { sensitiveRegions } from './sensitive-text.js';

export const HINT_COLOR = '#e6006f';
export const HINT_WIDTH = 2;
const GAP = 2;

export function hintOutline(level, zone) {
  const spec = noteTextSpec(level, zone);
  const points = sensitiveRegions(level, zone).flatMap(([x, y, w, h]) =>
    [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) =>
      rotatePoint([px * 360, py * 480], spec.p, -spec.angle)));
  const left = Math.min(...points.map(p => p[0])), top = Math.min(...points.map(p => p[1]));
  const right = Math.max(...points.map(p => p[0])), bottom = Math.max(...points.map(p => p[1]));
  return { rect: [left - GAP, top - GAP, right - left + GAP * 2, bottom - top + GAP * 2],
    angle: spec.angle, center: [spec.p[0] + spec.p[2] / 2, spec.p[1] + spec.p[3] / 2] };
}
