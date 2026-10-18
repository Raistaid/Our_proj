// All rectangles use normalized board coordinates: [x, y, width, height].
const EPS = 1e-8;

export function validRect(rect) {
  return Array.isArray(rect) && rect.length === 4 &&
    rect.every(Number.isFinite) && rect[2] > 0 && rect[3] > 0 &&
    rect[0] >= -EPS && rect[1] >= -EPS &&
    rect[0] + rect[2] <= 1 + EPS && rect[1] + rect[3] <= 1 + EPS;
}

export function pointInRect(x, y, rect) {
  return x >= rect[0] && y >= rect[1] &&
    x <= rect[0] + rect[2] && y <= rect[1] + rect[3];
}

export function containsRect(outer, inner) {
  return outer[0] <= inner[0] + EPS && outer[1] <= inner[1] + EPS &&
    outer[0] + outer[2] + EPS >= inner[0] + inner[2] &&
    outer[1] + outer[3] + EPS >= inner[1] + inner[3];
}

export function intersectsRect(a, b) {
  return Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]) > EPS &&
    Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]) > EPS;
}

export function inflateRect(rect, padding) {
  return [rect[0] - padding, rect[1] - padding,
    rect[2] + padding * 2, rect[3] + padding * 2];
}

export function centeredRect(x, y, width, height) {
  return [Math.max(0, Math.min(1 - width, x - width / 2)),
    Math.max(0, Math.min(1 - height, y - height / 2)), width, height];
}
