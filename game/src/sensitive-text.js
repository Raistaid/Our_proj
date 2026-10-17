// Coordinates use the logical 360 × 480 board, independently of display scale.
// Keep the note itself unchanged; only its coverage target has an inset.
export function secretTargetRect(zone) {
  const [x, y, width, height] = zone.rect;
  const insetX = Math.min(8 / 360, width / 4);
  const insetY = Math.min(8 / 480, height / 4);
  return [x + insetX, y + insetY, width - insetX * 2, height - insetY * 2];
}
