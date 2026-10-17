export function bindInput(options) {
  let gesture = null;
  const root = options.rootElement;
  const canvas = options.canvas;

  function point(event) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x: x, y: y } : null;
  }
  function cancel() {
    if (gesture && root.hasPointerCapture && root.hasPointerCapture(gesture.pointerId)) {
      root.releasePointerCapture(gesture.pointerId);
    }
    gesture = null;
    options.onPreview(null);
  }
  root.addEventListener('pointerdown', function (event) {
    if (gesture || !options.enabled() || event.isPrimary === false ||
        (event.pointerType === 'mouse' && event.button !== 0)) return;
    const button = event.target.closest ? event.target.closest('[data-sticker-id]') : null;
    const onBoard = event.target === canvas;
    if (!button && !onBoard) return;
    const stickerId = button ? button.dataset.stickerId : options.selectedSticker();
    if (!stickerId) return;
    if (button) options.onSelect(stickerId);
    gesture = { pointerId: event.pointerId, stickerId: stickerId, fromPalette: Boolean(button),
      startX: event.clientX, startY: event.clientY };
    try { root.setPointerCapture(event.pointerId); } catch (error) { /* optional capture */ }
    const p = point(event);
    options.onPreview(p ? Object.assign({ stickerId: stickerId }, p) : null);
    if (onBoard) event.preventDefault();
  });
  root.addEventListener('pointermove', function (event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const p = point(event);
    options.onPreview(p ? Object.assign({ stickerId: gesture.stickerId }, p) : null);
    event.preventDefault();
  });
  root.addEventListener('pointerup', function (event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const id = gesture.stickerId;
    const p = point(event);
    const moved = Math.abs(event.clientX - gesture.startX) + Math.abs(event.clientY - gesture.startY) > 5;
    const shouldPlace = p && (!gesture.fromPalette || moved);
    cancel();
    if (shouldPlace && options.enabled()) options.onDrop({ stickerId: id, x: p.x, y: p.y });
  });
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', function () {
    if (gesture) { gesture = null; options.onPreview(null); }
  });
  return { cancel: cancel };
}
