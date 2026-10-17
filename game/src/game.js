import { validRect, centeredRect } from './geometry.js';
import { stickerShape, stickerSize, pointInSticker, stickerIntersectsRect, stickersCoverRect } from './sticker-shapes.js';

export function createLevelState(level) {
  return { levelId: level.id, placements: [], history: [], nextId: 1,
    checks: 0, hintUsed: false, firstCheckPassed: null, locked: false };
}

function copyPlacements(items) {
  return items.map(function (p) {
    return { ...p, rect: p.rect.slice() };
  });
}

// Every position uses the same fixed mask in preview, placement and export.
export function getStickerRect(level, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  const size = stickerSize(level, point.stickerId);
  const rect = centeredRect(point.x, point.y, size.w, size.h);
  return validRect(rect) ? rect : null;
}

export function placeSticker(level, state, drop) {
  if (state.locked) return { state: state, accepted: false, reason: 'locked' };
  const rect = getStickerRect(level, drop);
  if (!rect) return { state: state, accepted: false, reason: 'outside' };
  if (!drop.stickerId || (level.allowedStickerIds &&
      level.allowedStickerIds.indexOf(drop.stickerId) === -1)) {
    return { state: state, accepted: false, reason: 'unknown' };
  }
  const placement = { id: 'p' + state.nextId, stickerId: drop.stickerId, shape: stickerShape(level, drop.stickerId), rect: rect };
  return { accepted: true, reason: null, state: Object.assign({}, state, {
    placements: state.placements.concat([placement]),
    history: state.history.concat([copyPlacements(state.placements)]),
    nextId: state.nextId + 1
  }) };
}

// The final placement is drawn on top and therefore receives the pointer first.
export function hitTestSticker(placements, point) {
  if (!Array.isArray(placements) || !point ||
      !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  for (let index = placements.length - 1; index >= 0; index -= 1) {
    const placement = placements[index];
    if (placement && validRect(placement.rect) && pointInSticker(placement, point.x, point.y)) return placement;
  }
  return null;
}

export function moveSticker(level, state, drop) {
  if (state.locked) return { state: state, accepted: false, reason: 'locked' };
  const index = drop ? state.placements.findIndex(function (p) { return p.id === drop.placementId; }) : -1;
  if (index === -1) return { state: state, accepted: false, reason: 'unknown' };
  if (!Number.isFinite(drop.x) || !Number.isFinite(drop.y) ||
      drop.x < 0 || drop.x > 1 || drop.y < 0 || drop.y > 1) {
    return { state: state, accepted: false, reason: 'outside' };
  }
  const placement = state.placements[index];
  const rect = centeredRect(drop.x, drop.y, placement.rect[2], placement.rect[3]);
  if (!validRect(rect)) return { state: state, accepted: false, reason: 'outside' };
  if (rect.every(function (value, part) { return value === placement.rect[part]; })) {
    return { state: state, accepted: false, reason: 'unchanged' };
  }
  const placements = state.placements.slice();
  placements[index] = Object.assign({}, placement, { rect: rect });
  return { accepted: true, reason: null, state: Object.assign({}, state, {
    placements: placements,
    history: state.history.concat([copyPlacements(state.placements)])
  }) };
}

export function removeSticker(state, placementId) {
  if (state.locked) return { state: state, accepted: false, reason: 'locked' };
  if (!state.placements.some(function (p) { return p.id === placementId; })) {
    return { state: state, accepted: false, reason: 'unknown' };
  }
  return { accepted: true, reason: null, state: Object.assign({}, state, {
    placements: state.placements.filter(function (p) { return p.id !== placementId; }),
    history: state.history.concat([copyPlacements(state.placements)])
  }) };
}

export function undoPlacement(state) {
  if (state.locked || !state.history.length) return state;
  return Object.assign({}, state, {
    placements: copyPlacements(state.history[state.history.length - 1]),
    history: state.history.slice(0, -1)
  });
}

export function evaluateLevel(level, placements) {
  const list = Array.isArray(placements) ? placements : [];
  const valid = list.filter(function (p) { return p && validRect(p.rect); })
    .map(function (p) { return { ...p, shape: stickerShape(level, p.stickerId) }; });
  const covered = level.secrets.filter(function (s) {
    return stickersCoverRect(valid, s.rect);
  }).map(function (s) { return s.id; });
  const missing = level.secrets.filter(function (s) {
    return covered.indexOf(s.id) === -1;
  }).map(function (s) { return s.id; });
  const blocked = level.keepZones.filter(function (k) {
    return valid.some(function (p) { return stickerIntersectsRect(p, k.rect); });
  }).map(function (k) { return k.id; });
  return { passed: level.secrets.length > 0 && missing.length === 0 &&
    blocked.length === 0 && valid.length === list.length,
    coveredSecretIds: covered, missingSecretIds: missing, blockedKeepIds: blocked };
}

export function checkLevel(level, state) {
  const report = evaluateLevel(level, state.placements);
  return { report: report, state: Object.assign({}, state, {
    checks: state.checks + 1,
    firstCheckPassed: state.checks === 0 ? report.passed : state.firstCheckPassed,
    locked: report.passed
  }) };
}

export function useHint(state) {
  return Object.assign({}, state, { hintUsed: true });
}

export function getLevelHint(level, placements) {
  const report = evaluateLevel(level, placements);
  const blocked = level.keepZones.find(function (zone) {
    return report.blockedKeepIds.indexOf(zone.id) !== -1;
  });
  // Fix the visible area first; do not highlight a different task at the same time.
  if (blocked) return { hintIds: [], text: blocked.hint };
  const missing = level.secrets.find(function (zone) {
    return report.missingSecretIds.indexOf(zone.id) !== -1;
  });
  return missing ? { hintIds: [missing.id], text: missing.why } :
    { hintIds: [], text: 'Личное уже закрыто. Можно нажать «Готово».' };
}
