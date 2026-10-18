// Coordinates are board fractions; distances use the logical 360 × 480 canvas.
const EPS = 1e-8;
export function stickerShape(level, stickerId) {
  const sticker = (level.stickers || []).find(function (s) { return s.id === stickerId; });
  return sticker && sticker.shape || 'rectangle';
}

export function stickerSize(level, stickerId) {
  const size = level.defaultStickerSize || { w: 0.40, h: 0.16 };
  // Compact circles and squares have the same 108 px side/diameter.
  return stickerShape(level, stickerId) === 'rectangle' ? size : {
    w: Number((size.w * 0.75).toFixed(10)), h: Number((size.w * 0.75 * 360 / 480).toFixed(10))
  };
}

export function pointInSticker(placement, x, y) {
  const [left, top, width, height] = placement.rect;
  if (x < left - EPS || y < top - EPS || x > left + width + EPS || y > top + height + EPS) return false;
  const shape = placement.shape || 'rectangle';
  if (shape === 'circle') {
    return Math.pow((x - left - width / 2) / (width / 2), 2) +
      Math.pow((y - top - height / 2) / (height / 2), 2) <= 1 + EPS;
  }
  if (shape === 'rounded-square') {
    const w = width * 360; const h = height * 480;
    const r = Math.min(w, h) * 0.18;
    const px = (x - left) * 360; const py = (y - top) * 480;
    const dx = Math.max(r - px, 0, px - (w - r));
    const dy = Math.max(r - py, 0, py - (h - r));
    return dx * dx + dy * dy <= r * r + EPS;
  }
  return true;
}

function corners(rect) {
  return [[rect[0], rect[1]], [rect[0] + rect[2], rect[1]],
    [rect[0], rect[1] + rect[3]], [rect[0] + rect[2], rect[1] + rect[3]]];
}

export function stickerContainsRect(placement, rect) {
  return corners(rect).every(function (p) { return pointInSticker(placement, p[0], p[1]); });
}

export function stickerIntersectsRect(placement, rect) {
  const p = placement.rect;
  if (Math.min(p[0] + p[2], rect[0] + rect[2]) <= Math.max(p[0], rect[0]) + EPS ||
      Math.min(p[1] + p[3], rect[1] + rect[3]) <= Math.max(p[1], rect[1]) + EPS) return false;
  // For these convex, axis-aligned shapes the closest point to the centre suffices.
  const x = Math.max(rect[0], Math.min(rect[0] + rect[2], p[0] + p[2] / 2));
  const y = Math.max(rect[1], Math.min(rect[1] + rect[3], p[1] + p[3] / 2));
  // A tangent has zero area and does not obscure the protected zone.
  const inset = { ...placement, rect: [p[0] + EPS, p[1] + EPS, p[2] - EPS * 2, p[3] - EPS * 2] };
  return pointInSticker(inset, x, y);
}

// Vertical cross-section of the opaque backing, clipped to the ordinary note.
function coveredHeight(placements, rect, x) {
  const intervals = [];
  for (const p of placements) {
    const [left, top, width, height] = p.rect;
    let inset = 0;
    if (p.shape === 'circle') {
      const dx = (x - left - width / 2) / (width / 2);
      inset = height / 2 * (1 - Math.sqrt(Math.max(0, 1 - dx * dx)));
    } else if (p.shape === 'rounded-square') {
      const radius = Math.min(width * 360, height * 480) * .18;
      const rx = radius / 360, ry = radius / 480;
      const dx = Math.max(left + rx - x, 0, x - (left + width - rx)) / rx;
      inset = ry * (1 - Math.sqrt(Math.max(0, 1 - dx * dx)));
    }
    const start = Math.max(rect[1], top + inset);
    const end = Math.min(rect[1] + rect[3], top + height - inset);
    if (end > start) intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let length = 0, end = -Infinity;
  for (const interval of intervals) {
    length += Math.max(0, interval[1] - Math.max(end, interval[0]));
    end = Math.max(end, interval[1]);
  }
  return length;
}

function integrateArea(fn, left, right, tolerance) {
  const middle = (left + right) / 2;
  const a = fn(left), b = fn(middle), c = fn(right);
  const whole = (right - left) * (a + 4 * b + c) / 6;
  function refine(left, right, a, b, c, whole, tolerance, depth) {
    const middle = (left + right) / 2;
    const d = fn((left + middle) / 2), e = fn((middle + right) / 2);
    const first = (middle - left) * (a + 4 * d + b) / 6;
    const second = (right - middle) * (b + 4 * e + c) / 6;
    const delta = first + second - whole;
    if (!depth || Math.abs(delta) <= 15 * tolerance) return first + second + delta / 15;
    return refine(left, middle, a, d, b, first, tolerance / 2, depth - 1) +
      refine(middle, right, b, e, c, second, tolerance / 2, depth - 1);
  }
  return refine(left, right, a, b, c, whole, tolerance, 18);
}

// Integrate the union, so stacked stickers count once and transparent corners never count.
// Splitting at backing edges makes rectangular coverage exact, including the 20% boundary.
export function stickerCoverageRatio(placements, rect) {
  const relevant = placements.filter(p => stickerIntersectsRect(p, rect));
  if (!relevant.length) return 0;
  if (relevant.some(p => stickerContainsRect(p, rect))) return 1;
  const left = rect[0], right = left + rect[2];
  const edges = [left, right];
  for (const p of relevant) {
    const [x, , w, h] = p.rect;
    const radius = Math.min(w * 360, h * 480) * .18 / 360;
    const breaks = p.shape === 'circle' ? [x, x + w / 2, x + w] :
      p.shape === 'rounded-square' ? [x, x + radius, x + w - radius, x + w] : [x, x + w];
    edges.push(...breaks.filter(x => x > left && x < right));
  }
  const sorted = [...new Set(edges)].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const start = sorted[i - 1], end = sorted[i];
    const active = relevant.filter(p => p.rect[0] < end && p.rect[0] + p.rect[2] > start);
    if (!active.length) continue;
    const tolerance = (end - start) * rect[3] * 1e-10;
    area += integrateArea(x => coveredHeight(active, rect, x), start, end, tolerance);
  }
  return Math.max(0, Math.min(1, area / (rect[2] * rect[3])));
}

// Prove coverage using convex masks. No cell is accepted just from sampled pixels:
// all four corners must lie in one mask. Overlapping masks may cover different cells.
// Unresolved boundaries fail conservatively instead of leaking part of a secret.
export function stickersCoverRect(placements, rect, depth = 0) {
  const relevant = placements.filter(function (p) { return stickerIntersectsRect(p, rect); });
  if (relevant.some(function (p) { return stickerContainsRect(p, rect); })) return true;
  if (!relevant.length || depth >= 18 || corners(rect).some(function (c) {
    return !relevant.some(function (p) { return pointInSticker(p, c[0], c[1]); });
  })) return false;
  const axis = rect[2] * 360 >= rect[3] * 480 ? 0 : 1;
  const end = rect[axis] + rect[axis + 2];
  const edges = relevant.flatMap(function (p) { return [p.rect[axis], p.rect[axis] + p.rect[axis + 2]]; });
  const split = edges.find(function (v) { return v > rect[axis] + EPS && v < end - EPS; }) ||
    rect[axis] + rect[axis + 2] / 2;
  const a = rect.slice(); const b = rect.slice();
  a[axis + 2] = split - rect[axis]; b[axis] = split; b[axis + 2] = end - split;
  return stickersCoverRect(relevant, a, depth + 1) && stickersCoverRect(relevant, b, depth + 1);
}
