export function bindInput(options) {
  let gesture = null;
  const root = options.rootElement;
  const canvas = options.canvas;

  function point(event) {
    const bounds = canvas.getBoundingClientRect();
    // Undefined means the position cannot be measured; null means genuinely outside.
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) ||
        bounds.width <= 0 || bounds.height <= 0) return undefined;
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x: x, y: y } : null;
  }
  function gestureMoved(event) {
    return Math.abs(event.clientX - gesture.startX) + Math.abs(event.clientY - gesture.startY) > 5;
  }
  function previewPoint(p, event) {
    if (!p) return p === null && gesture.placementId !== null && gestureMoved(event) ?
      { placementId: gesture.placementId, stickerId: gesture.stickerId, removing: true } : null;
    const item = { stickerId: gesture.stickerId,
      x: Math.max(0, Math.min(1, p.x - gesture.offsetX)),
      y: Math.max(0, Math.min(1, p.y - gesture.offsetY)) };
    if (gesture.placementId !== null) item.placementId = gesture.placementId;
    return item;
  }
  function cancel() {
    const cancelledGesture = gesture;
    gesture = null;
    if (cancelledGesture && root.hasPointerCapture && root.hasPointerCapture(cancelledGesture.pointerId)) {
      try { root.releasePointerCapture(cancelledGesture.pointerId); } catch (error) { /* capture may already be lost */ }
    }
    options.onPreview(null);
  }
  root.addEventListener('pointerdown', function (event) {
    if (gesture || !options.enabled() || event.isPrimary === false ||
        (event.pointerType === 'mouse' && event.button !== 0)) return;
    const button = event.target.closest ? event.target.closest('[data-sticker-id]') : null;
    const onBoard = event.target === canvas;
    if (!button && !onBoard) return;
    const p = point(event);
    const placement = onBoard && p && typeof options.hitTest === 'function' ? options.hitTest(p) : null;
    const stickerId = placement ? placement.stickerId :
      button ? button.dataset.stickerId : options.selectedSticker();
    if (!stickerId) return;
    if (button) options.onSelect(stickerId);
    gesture = { pointerId: event.pointerId, stickerId: stickerId, fromPalette: Boolean(button),
      placementId: placement ? placement.id : null,
      offsetX: placement ? p.x - (placement.rect[0] + placement.rect[2] / 2) : 0,
      offsetY: placement ? p.y - (placement.rect[1] + placement.rect[3] / 2) : 0,
      startX: event.clientX, startY: event.clientY };
    try { root.setPointerCapture(event.pointerId); } catch (error) { /* optional capture */ }
    options.onPreview(previewPoint(p, event));
    if (onBoard) event.preventDefault();
  });
  root.addEventListener('pointermove', function (event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const p = point(event);
    options.onPreview(previewPoint(p, event));
    event.preventDefault();
  });
  root.addEventListener('pointerup', function (event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const p = point(event);
    const item = previewPoint(p, event);
    const movingExisting = gesture.placementId !== null;
    const moved = gestureMoved(event);
    const shouldRemove = p === null && movingExisting && moved;
    const shouldCommit = p && ((!gesture.fromPalette && !movingExisting) || moved);
    cancel();
    if (!options.enabled()) return;
    if (shouldRemove) {
      if (typeof options.onRemove === 'function') {
        options.onRemove({ placementId: item.placementId, stickerId: item.stickerId });
      }
    } else if (shouldCommit) {
      if (movingExisting) {
        if (typeof options.onMove === 'function') options.onMove(item);
      } else options.onDrop(item);
    }
  });
  root.addEventListener('pointercancel', function (event) {
    if (gesture && gesture.pointerId === event.pointerId) cancel();
  });
  root.addEventListener('lostpointercapture', function (event) {
    if (gesture && gesture.pointerId === event.pointerId) cancel();
  });
  return { cancel: cancel };
}
