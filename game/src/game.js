import { validRect, pointInRect, containsRect, intersectsRect, inflateRect, centeredRect } from './geometry.js';

export function createLevelState(level) {
  return { levelId: level.id, placements: [], history: [], nextId: 1,
    checks: 0, hintUsed: false, firstCheckPassed: null, locked: false };
}

function copyPlacements(items) {
  return items.map(function (p) {
    return { id: p.id, stickerId: p.stickerId, rect: p.rect.slice() };
  });
}

export function placeSticker(level, state, drop) {
  if (state.locked) return { state: state, accepted: false, reason: 'locked' };
  if (!drop || !Number.isFinite(drop.x) || !Number.isFinite(drop.y) ||
      drop.x < 0 || drop.x > 1 || drop.y < 0 || drop.y > 1) {
    return { state: state, accepted: false, reason: 'outside' };
  }
  if (!drop.stickerId || (level.allowedStickerIds &&
      level.allowedStickerIds.indexOf(drop.stickerId) === -1)) {
    return { state: state, accepted: false, reason: 'unknown' };
  }
  if (state.placements.length >= level.maxStickers) {
    return { state: state, accepted: false, reason: 'limit' };
  }
  // Both private and ordinary notes snap identically: size must not reveal the answer.
  const notes = level.secrets.concat(level.keepZones.filter(function (zone) { return zone.style === 'note'; }));
  const target = notes.find(function (s) { return pointInRect(drop.x, drop.y, s.rect); });
  const size = level.defaultStickerSize || { w: 0.3, h: 0.2 };
  const padding = Number.isFinite(level.stickerPadding) ? level.stickerPadding : 0.012;
  const rect = target ? inflateRect(target.rect, padding) :
    centeredRect(drop.x, drop.y, size.w, size.h);
  if (!validRect(rect)) return { state: state, accepted: false, reason: 'outside' };
  const placement = { id: 'p' + state.nextId, stickerId: drop.stickerId, rect: rect };
  return { accepted: true, reason: null, state: Object.assign({}, state, {
    placements: state.placements.concat([placement]),
    history: state.history.concat([copyPlacements(state.placements)]),
    nextId: state.nextId + 1
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
  const valid = list.filter(function (p) { return p && validRect(p.rect); });
  const covered = level.secrets.filter(function (s) {
    return valid.some(function (p) { return containsRect(p.rect, s.rect); });
  }).map(function (s) { return s.id; });
  const missing = level.secrets.filter(function (s) {
    return covered.indexOf(s.id) === -1;
  }).map(function (s) { return s.id; });
  const blocked = level.keepZones.filter(function (k) {
    return valid.some(function (p) { return intersectsRect(p.rect, k.rect); });
  }).map(function (k) { return k.id; });
  return { passed: level.secrets.length > 0 && missing.length === 0 &&
    blocked.length === 0 && valid.length === list.length && list.length <= level.maxStickers,
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
