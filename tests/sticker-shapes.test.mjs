import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRuntimeLevel, validateContent } from '../game/src/content.js';
import { createLevelState, placeSticker, moveSticker, undoPlacement, hitTestSticker, evaluateLevel } from '../game/src/game.js';
import { pointInSticker, stickerContainsRect, stickerIntersectsRect, stickersCoverRect, stickerCoverageRatio } from '../game/src/sticker-shapes.js';

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
  assert.equal(evaluateLevel(level, [a, b]).passed, false, 'Opaque sticker area must not cover ordinary content');
  assert.deepEqual(evaluateLevel(level, [a, b]).blockedKeepIds, ['visible-corner']);
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

test('Covered area counts the union once and clips masks to the ordinary note', function () {
  const rect = [.2, .2, .5, .5];
  const a = { rect: [.2, .2, .075, .5] };
  const b = { rect: [.225, .2, .075, .5] };
  assert.ok(Math.abs(stickerCoverageRatio([a, b, a, b], rect) - .2) < 1e-10);
  assert.ok(Math.abs(stickerCoverageRatio([{ rect: [.1, .1, .2, .7] }], rect) - .2) < 1e-10);
  assert.equal(stickerCoverageRatio([{ rect: [.7, .2, .1, .1] }], rect), 0);
  assert.equal(stickerCoverageRatio([{ rect }], rect), 1);
});

test('Circle and rounded-square area excludes transparent corners', function () {
  const rect = [.2, .2, .5, .5];
  const circle = { shape: 'circle', rect };
  assert.ok(Math.abs(stickerCoverageRatio([circle, circle], rect) - Math.PI / 4) < 1e-7);
  const half = [.45, .2, .25, .5];
  assert.ok(Math.abs(stickerCoverageRatio([circle], half) - Math.PI / 4) < 1e-7);
  const radius = Math.min(rect[2] * 360, rect[3] * 480) * .18;
  const expected = 1 - (4 - Math.PI) * radius * radius / (rect[2] * 360 * rect[3] * 480);
  assert.ok(Math.abs(stickerCoverageRatio([{ shape: 'rounded-square', rect }], rect) - expected) < 1e-7);
});

test('Several individually small stickers block only when their combined covered area exceeds 20%', function () {
  const level = { secrets: [{ id: 'secret', rect: [.05, .05, .1, .1] }],
    keepZones: [{ id: 'idea', rect: [.4, .4, .4, .3] }] };
  const solved = { stickerId: 'sock', rect: level.secrets[0].rect };
  const a = { stickerId: 'sock', rect: [.4, .4, .04, .3] };
  const b = { stickerId: 'sock', rect: [.6, .4, .04, .3] };
  assert.equal(evaluateLevel(level, [solved, a, a, b, b]).passed, true);
  assert.equal(evaluateLevel(level, [solved, a, b, { ...b, rect: [.7, .4, .01, .3] }]).passed, false);
  assert.equal(evaluateLevel(level, [solved, { ...a, rect: [.5, .4, .08, .3] }]).passed, true,
    'Exactly 20% in the middle is also allowed');
});

test('20% rule uses the actual curved backing instead of its bounding rectangle', function () {
  const rect = [.4, .4, .4, .3];
  const base = { secrets: [{ id: 'secret', rect: [.05, .05, .1, .1] }], keepZones: [{ id: 'idea', rect }] };
  for (const [shape, smaller, larger] of [['circle', .5, .51], ['rounded-square', .45, .46]]) {
    const level = { ...base, stickers: [{ id: 'sock', shape: 'rectangle' }, { id: 'curved', shape }] };
    const solved = { stickerId: 'sock', rect: base.secrets[0].rect };
    for (const fraction of [smaller, larger]) {
      const p = { stickerId: 'curved', shape: 'rectangle', rect: [.4, .4, .4 * fraction, .3 * fraction] };
      assert.equal(evaluateLevel(level, [solved, p]).passed, fraction === smaller, shape);
    }
  }
});
