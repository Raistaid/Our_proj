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
