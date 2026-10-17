import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRuntimeLevel, validateContent } from '../game/src/content.js';
import { createLevelState, placeSticker, moveSticker, undoPlacement, hitTestSticker, evaluateLevel } from '../game/src/game.js';
import { pointInSticker, stickerContainsRect, stickerIntersectsRect, stickersCoverRect } from '../game/src/sticker-shapes.js';

const content = JSON.parse(await readFile(new URL('../game/data/content.json', import.meta.url), 'utf8'));

test('The palette contains exactly one rectangle, circle and rounded square', function () {
  assert.deepEqual(content.stickers.map(function (s) { return s.shape; }), ['rectangle', 'circle', 'rounded-square']);
  const invalid = structuredClone(content);
  invalid.stickers[1].shape = 'triangle';
  assert.equal(validateContent(invalid).ok, false);
});

for (const [id, shape] of [['cloud', 'circle'], ['cucumber', 'rounded-square']]) {
  test(shape + ' has equal pixel sides, transparent corners and stable movement/undo', function () {
    const level = getRuntimeLevel(content, 0);
    const state = placeSticker(level, createLevelState(level), { stickerId: id, x: 0.5, y: 0.5 }).state;
    const p = state.placements[0];
    assert.equal(p.shape, shape);
    assert.equal(p.rect[2] * 360, p.rect[3] * 480);
    assert.equal(pointInSticker(p, 0.5, 0.5), true);
    assert.equal(hitTestSticker([p], { x: p.rect[0], y: p.rect[1] }), null);
    assert.equal(stickerContainsRect(p, p.rect), false, 'Transparent corners cannot hide secrets');
    assert.equal(stickerIntersectsRect(p, [p.rect[0], p.rect[1], 0.002, 0.002]), false);
    const underneath = { id: 'bottom', stickerId: 'sock', rect: p.rect.slice(), shape: 'rectangle' };
    assert.equal(hitTestSticker([underneath, p], { x: p.rect[0], y: p.rect[1] }).id, 'bottom');
    const moved = moveSticker(level, state, { placementId: p.id, x: 1, y: 0 }).state;
    assert.equal(moved.placements[0].shape, shape);
    assert.deepEqual(moved.placements[0].rect.slice(2), p.rect.slice(2));
    assert.deepEqual(undoPlacement(moved), state);
  });
}

test('Overlapping circles cover a long secret together, but a gap fails', function () {
  const a = { shape: 'circle', stickerId: 'cloud', rect: [0.10, 0.10, 0.30, 0.225] };
  const b = { shape: 'circle', stickerId: 'cloud', rect: [0.26, 0.10, 0.30, 0.225] };
  const secret = [0.14, 0.17, 0.38, 0.08];
  assert.equal(stickerContainsRect(a, secret), false);
  assert.equal(stickerContainsRect(b, secret), false);
  assert.equal(stickersCoverRect([a, b], secret), true);
  assert.equal(stickersCoverRect([a], secret), false);
  const apart = { ...b, rect: [0.41, 0.10, 0.30, 0.225] };
  assert.equal(stickersCoverRect([a, apart], [0.14, 0.17, 0.53, 0.08]), false);
  const level = { stickers: content.stickers, secrets: [{ id: 'secret', rect: secret }],
    keepZones: [{ id: 'visible-corner', rect: [0.10, 0.10, 0.01, 0.01] }] };
  assert.equal(evaluateLevel(level, [a, b]).passed, true);
  level.keepZones[0].rect = [0.20, 0.18, 0.01, 0.01];
  assert.equal(evaluateLevel(level, [a, b]).passed, true, 'Ordinary content never blocks completion');
});

test('Coverage rejects an interior hole even when all four outer corners are covered', function () {
  const masks = [
    { rect: [0.1, 0.1, 0.4, 0.05] }, { rect: [0.1, 0.45, 0.4, 0.05] },
    { rect: [0.1, 0.1, 0.05, 0.4] }, { rect: [0.45, 0.1, 0.05, 0.4] }
  ];
  assert.equal(stickersCoverRect(masks, [0.1, 0.1, 0.4, 0.4]), false);
  assert.equal(stickersCoverRect([{ rect: [0.1, 0.1, 0.2, 0.4] },
    { rect: [0.3, 0.1, 0.2, 0.4] }], [0.1, 0.1, 0.4, 0.4]), true);
});
