import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLevelState, placeSticker, moveSticker, removeSticker, hitTestSticker, undoPlacement, evaluateLevel, checkLevel, useHint, getLevelHint } from '../game/src/game.js';
import { validateContent, getRuntimeLevel, loadContent } from '../game/src/content.js';
import { validRect, containsRect, intersectsRect } from '../game/src/geometry.js';
import { createBridge } from '../game/src/bridge.js';

const content = JSON.parse(await readFile(new URL('../game/data/content.json', import.meta.url), 'utf8'));
const fresh = function () { return structuredClone(content); };
function solve(level, initial) {
  let state = initial || createLevelState(level);
  for (const secret of level.secrets) {
    const r = secret.rect;
    const placed = placeSticker(level, state, {
      stickerId: 'sock', x: r[0] + r[2] / 2, y: r[1] + r[3] / 2
    });
    assert.equal(placed.accepted, true);
    assert.equal(containsRect(placed.state.placements.at(-1).rect, secret.rect), true);
    state = placed.state;
  }
  return state;
}
test('Полный набор проходит проверку схемы', function () {
  assert.deepEqual(validateContent(content), { ok: true, errors: [] });
  assert.equal(content.levels.length, 5);
  assert.equal(content.levels.at(-1).mode, 'transfer');
});
for (let index = 0; index < content.levels.length; index += 1) {
  test('Проходимость ' + content.levels[index].id, function () {
    const level = getRuntimeLevel(content, index);
    const solved = solve(level);
    const checked = checkLevel(level, solved);
    assert.equal(checked.report.passed, true);
    assert.equal(checked.state.locked, true);
    assert.equal(checked.state.firstCheckPassed, true);
    assert.equal(checked.report.blockedKeepIds.length, 0);
  });
}
test('Обычную идею нельзя заклеить даже после закрытия всех секретов', function () {
  const level = getRuntimeLevel(content, 0);
  const r = level.keepZones.find(function (z) { return z.id === 'public_note'; }).rect;
  const result = placeSticker(level, solve(level), { stickerId: 'sock',
    x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 });
  const report = evaluateLevel(level, result.state.placements);
  assert.equal(report.passed, false);
  assert.ok(report.blockedKeepIds.includes('public_note'));
  assert.deepEqual(result.state.placements.at(-1).rect.slice(2), [0.40, 0.16],
    'Обычная записка не меняет фиксированный размер наклейки');
});

test('Each character keeps its fixed shape size on every scene, notes, free space and board edges', function () {
  assert.deepEqual(content.defaultStickerSize, { w: 0.40, h: 0.16 });
  for (let index = 0; index < content.levels.length; index += 1) {
    const level = getRuntimeLevel(content, index);
    const notes = level.secrets.concat(level.keepZones.filter(function (zone) { return zone.style === 'note'; }));
    const points = notes.map(function (note) {
      return { x: note.rect[0] + note.rect[2] / 2, y: note.rect[1] + note.rect[3] / 2 };
    }).concat([
      { x: 0.5, y: 0.05 }, { x: 0.5, y: 0.5 },
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 },
      { x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }
    ]);
    for (const sticker of content.stickers) {
      for (const point of points) {
        const placed = placeSticker(level, createLevelState(level), { stickerId: sticker.id, ...point });
        assert.equal(placed.accepted, true);
        const rect = placed.state.placements[0].rect;
        assert.deepEqual(rect.slice(2), sticker.id === 'sock' ? [0.40, 0.16] : [0.30, 0.225], level.id + '/' + sticker.id + ': size changed');
        assert.ok(validRect(rect), level.id + '/' + sticker.id + ': edge placement must stay inside the board');
      }
    }
  }
});

test('Crossing any note boundary moves the fixed rectangle continuously without snapping', function () {
  const epsilon = 0.00001;
  for (let index = 0; index < content.levels.length; index += 1) {
    const level = getRuntimeLevel(content, index);
    const notes = level.secrets.concat(level.keepZones.filter(function (zone) { return zone.style === 'note'; }));
    for (const note of notes) {
      const [x, y, w, h] = note.rect;
      const boundaries = [
        [{ x: x - epsilon, y: y + h / 2 }, { x: x + epsilon, y: y + h / 2 }],
        [{ x: x + w - epsilon, y: y + h / 2 }, { x: x + w + epsilon, y: y + h / 2 }],
        [{ x: x + w / 2, y: y - epsilon }, { x: x + w / 2, y: y + epsilon }],
        [{ x: x + w / 2, y: y + h - epsilon }, { x: x + w / 2, y: y + h + epsilon }]
      ];
      for (const sticker of content.stickers) {
        for (const pair of boundaries) {
          const rects = pair.map(function (point) {
            const result = placeSticker(level, createLevelState(level), { stickerId: sticker.id, ...point });
            assert.equal(result.accepted, true);
            return result.state.placements[0].rect;
          });
          assert.deepEqual(rects[0].slice(2), sticker.id === 'sock' ? [0.40, 0.16] : [0.30, 0.225]);
          assert.deepEqual(rects[1].slice(2), sticker.id === 'sock' ? [0.40, 0.16] : [0.30, 0.225]);
          assert.ok(Math.abs(rects[1][0] - rects[0][0]) <= 2 * epsilon + 1e-12,
            level.id + '/' + note.id + ': horizontal snap');
          assert.ok(Math.abs(rects[1][1] - rects[0][1]) <= 2 * epsilon + 1e-12,
            level.id + '/' + note.id + ': vertical snap');
        }
      }
    }
  }
});
test('Частично закрытый секрет не засчитывается', function () {
  const level = getRuntimeLevel(content, 0);
  const solved = solve(level);
  solved.placements[0].rect[2] /= 2;
  assert.ok(evaluateLevel(level, solved.placements).missingSecretIds.includes(level.secrets[0].id));
});
test('Наклейка на главном предмете блокирует готовность', function () {
  const level = getRuntimeLevel(content, 0);
  const result = placeSticker(level, solve(level), { stickerId: 'sock', x: 0.5, y: 0.5 });
  assert.ok(evaluateLevel(level, result.state.placements).blockedKeepIds.includes('hero'));
});
test('Координаты и история не изменяют предыдущее состояние', function () {
  const level = getRuntimeLevel(content, 0);
  const before = createLevelState(level);
  const result = placeSticker(level, before, { stickerId: 'sock', x: 0, y: 0 });
  assert.equal(result.accepted, true);
  assert.equal(before.placements.length, 0);
  assert.ok(validRect(result.state.placements[0].rect));
  assert.equal(undoPlacement(result.state).placements.length, 0);
  assert.equal(result.state.placements.length, 1);
});
test('Unlimited stickers are accepted; unknown stickers and outside drops are rejected', function () {
  const level = getRuntimeLevel(content, 0);
  let state = createLevelState(level);
  for (let i = 0; i < 12; i += 1) {
    state = placeSticker(level, state, { stickerId: 'sock', x: 0.5, y: 0.5 }).state;
  }
  assert.equal(state.placements.length, 12);
  assert.equal(placeSticker(level, state, { stickerId: 'sock', x: 0.5, y: 0.5 }).accepted, true);
  assert.equal(placeSticker(level, state, { stickerId: 'sock', x: -0.1, y: 0.5 }).reason, 'outside');
  assert.equal(placeSticker(level, state, { stickerId: 'unknown', x: 0.5, y: 0.5 }).reason, 'unknown');
});

test('A solved frame passes with more stickers than the former limit', function () {
  const level = { ...getRuntimeLevel(content, 0), maxStickers: 4 };
  let state = solve(level);
  const rect = level.secrets[0].rect;
  for (let index = 0; index < 12; index += 1) {
    const result = placeSticker(level, state, {
      stickerId: 'sock', x: rect[0] + rect[2] / 2, y: rect[1] + rect[3] / 2
    });
    assert.equal(result.accepted, true);
    state = result.state;
  }
  assert.ok(state.placements.length > 4);
  assert.equal(checkLevel(level, state).report.passed, true);
});

test('Moving an existing sticker among many stickers preserves identity, size, count and layer order', function () {
  const level = getRuntimeLevel(content, 0);
  let state = createLevelState(level);
  for (let index = 0; index < 12; index += 1) {
    state = placeSticker(level, state, { stickerId: 'sock', x: 0.5, y: 0.5 }).state;
  }
  const before = structuredClone(state);
  const target = state.placements[0];
  const moved = moveSticker({ ...level, defaultStickerSize: { w: 0.1, h: 0.1 } }, state, {
    placementId: target.id, x: 0, y: 1
  });
  assert.equal(moved.accepted, true);
  assert.equal(moved.reason, null);
  assert.deepEqual(state, before, 'Moving must not mutate the prior state');
  assert.notEqual(moved.state, state);
  assert.notEqual(moved.state.placements[0], target);
  assert.equal(moved.state.placements.length, 12);
  assert.equal(moved.state.nextId, before.nextId);
  assert.deepEqual(moved.state.placements.map(function (p) { return p.id; }), before.placements.map(function (p) { return p.id; }));
  assert.equal(moved.state.placements[0].stickerId, target.stickerId);
  assert.deepEqual(moved.state.placements[0].rect, [0, 1 - target.rect[3], target.rect[2], target.rect[3]]);
  assert.ok(validRect(moved.state.placements[0].rect));
  assert.deepEqual(moved.state.placements.slice(1), before.placements.slice(1));
  assert.equal(moved.state.history.length, before.history.length + 1);
  assert.deepEqual(moved.state.history.at(-1), before.placements);
  assert.notEqual(moved.state.history.at(-1)[0].rect, target.rect, 'Undo must keep its own rectangle snapshot');
  assert.deepEqual(undoPlacement(moved.state), before);
  assert.equal(undoPlacement(undoPlacement(moved.state)).placements.length, 12 - 1);
});

test('Moving a sticker off a normal note updates evaluation and undo restores the original position', function () {
  const level = getRuntimeLevel(content, 0);
  const note = level.keepZones.find(function (zone) { return zone.style === 'note'; });
  const placed = placeSticker(level, createLevelState(level), {
    stickerId: 'sock', x: note.rect[0] + note.rect[2] / 2, y: note.rect[1] + note.rect[3] / 2
  }).state;
  assert.ok(evaluateLevel(level, placed.placements).blockedKeepIds.includes(note.id));
  const secret = level.secrets[0];
  const moved = moveSticker(level, placed, {
    placementId: placed.placements[0].id,
    x: secret.rect[0] + secret.rect[2] / 2, y: secret.rect[1] + secret.rect[3] / 2
  });
  assert.equal(moved.accepted, true);
  const report = evaluateLevel(level, moved.state.placements);
  assert.equal(report.blockedKeepIds.includes(note.id), false);
  assert.ok(report.coveredSecretIds.includes(secret.id));
  assert.deepEqual(undoPlacement(moved.state), placed);
});

test('Locked, missing, invalid and unchanged moves keep the original state and history', function () {
  const level = getRuntimeLevel(content, 0);
  const state = placeSticker(level, createLevelState(level), { stickerId: 'sock', x: 0.5, y: 0.5 }).state;
  const id = state.placements[0].id;
  const before = structuredClone(state);
  for (const point of [
    { x: -0.1, y: 0.5 }, { x: 0.5, y: 1.1 }, { x: NaN, y: 0.5 },
    { x: 0.5, y: Infinity }, { x: '0.5', y: 0.5 }, { x: 0.5 }
  ]) {
    assert.deepEqual(moveSticker(level, state, { placementId: id, ...point }), {
      state: state, accepted: false, reason: 'outside'
    });
  }
  for (const drop of [null, {}, { placementId: 'missing', x: 0.5, y: 0.5 }]) {
    const result = moveSticker(level, state, drop);
    assert.equal(result.reason, 'unknown');
    assert.equal(result.accepted, false);
    assert.equal(result.state, state);
  }
  const unchanged = moveSticker(level, state, { placementId: id, x: 0.5, y: 0.5 });
  assert.deepEqual(unchanged, { state: state, accepted: false, reason: 'unchanged' });
  const clamped = moveSticker(level, state, { placementId: id, x: 0, y: 0 }).state;
  assert.deepEqual(moveSticker(level, clamped, { placementId: id, x: 0.01, y: 0.01 }), {
    state: clamped, accepted: false, reason: 'unchanged'
  });
  const locked = checkLevel(level, solve(level)).state;
  const result = moveSticker(level, locked, { placementId: locked.placements[0].id, x: 0.5, y: 0.5 });
  assert.deepEqual(result, { state: locked, accepted: false, reason: 'locked' });
  assert.equal(result.state, locked);
  assert.deepEqual(state, before);
});

test('Hit testing selects the topmost containing sticker and respects edges and invalid points', function () {
  const bottom = { id: 'bottom', stickerId: 'sock', rect: [0.1, 0.1, 0.5, 0.5] };
  const top = { id: 'top', stickerId: 'cloud', rect: [0.3, 0.3, 0.2, 0.2] };
  const placements = [bottom, top];
  assert.equal(hitTestSticker(placements, { x: 0.4, y: 0.4 }), top);
  assert.equal(hitTestSticker(placements, { x: 0.2, y: 0.2 }), bottom);
  assert.equal(hitTestSticker(placements, { x: 0.3, y: 0.3 }), top);
  assert.equal(hitTestSticker(placements, { x: 0.5, y: 0.5 }), top);
  assert.equal(hitTestSticker(placements, { x: 0.9, y: 0.9 }), null);
  assert.equal(hitTestSticker([], { x: 0.4, y: 0.4 }), null);
  for (const point of [null, {}, { x: NaN, y: 0.4 }, { x: 0.4, y: Infinity }, { x: '0.4', y: 0.4 }]) {
    assert.equal(hitTestSticker(placements, point), null);
  }
  assert.deepEqual(placements, [bottom, top]);
});

for (const layer of ['top', 'underneath']) {
  test('Removing the ' + layer + ' sticker among many stickers and undo restores its exact layer', function () {
    const level = getRuntimeLevel(content, 0);
    let state = useHint(checkLevel(level, createLevelState(level)).state);
    for (let index = 0; index < 12; index += 1) {
      state = placeSticker(level, state, {
        stickerId: content.stickers[index % content.stickers.length].id, x: 0.5, y: 0.5
      }).state;
    }
    const before = structuredClone(state);
    const index = layer === 'top' ? state.placements.length - 1 : 0;
    const target = state.placements[index];
    const removed = removeSticker(state, target.id);
    assert.equal(removed.accepted, true);
    assert.equal(removed.reason, null);
    assert.notEqual(removed.state, state);
    assert.deepEqual(state, before, 'Removal must not mutate its input');
    assert.equal(removed.state.placements.length, 12 - 1);
    assert.deepEqual(removed.state.placements, before.placements.filter(function (p) { return p.id !== target.id; }));
    assert.equal(removed.state.nextId, before.nextId);
    assert.equal(removed.state.checks, before.checks);
    assert.equal(removed.state.firstCheckPassed, before.firstCheckPassed);
    assert.equal(removed.state.hintUsed, before.hintUsed);
    assert.equal(removed.state.locked, before.locked);
    assert.equal(removed.state.history.length, before.history.length + 1);
    assert.deepEqual(removed.state.history.at(-1), before.placements);
    assert.notEqual(removed.state.history.at(-1)[index].rect, target.rect);
    const undone = undoPlacement(removed.state);
    assert.deepEqual(undone, before, 'Undo must restore the ID, rectangle and draw order');
    assert.equal(undone.placements[index].id, target.id);
    assert.equal(hitTestSticker(undone.placements, { x: 0.5, y: 0.5 }).id, before.placements.at(-1).id);

    const readded = placeSticker(level, removed.state, { stickerId: 'sock', x: 0.2, y: 0.2 });
    assert.equal(readded.accepted, true, 'Adding another sticker after removal must succeed');
    assert.equal(readded.state.placements.length, 12);
    assert.equal(readded.state.placements.at(-1).id, 'p' + before.nextId);
    assert.equal(readded.state.placements.some(function (p) { return p.id === target.id; }), false);
    const undoAdded = undoPlacement(readded.state);
    assert.deepEqual(undoAdded.placements, removed.state.placements);
    assert.deepEqual(undoPlacement(undoAdded).placements, before.placements);
  });
}

test('Removing the last sticker clears the board and remains reversible', function () {
  const level = getRuntimeLevel(content, 0);
  const state = placeSticker(level, createLevelState(level), { stickerId: 'sock', x: 0.2, y: 0.2 }).state;
  const result = removeSticker(state, state.placements[0].id);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.state.placements, []);
  assert.deepEqual(undoPlacement(result.state), state);
});

test('Unknown IDs and locked frames reject removal without changing state or history', function () {
  const level = getRuntimeLevel(content, 0);
  const state = placeSticker(level, createLevelState(level), { stickerId: 'sock', x: 0.2, y: 0.2 }).state;
  const before = structuredClone(state);
  for (const id of [undefined, null, '', 1, {}, 'missing']) {
    const result = removeSticker(state, id);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'unknown');
    assert.equal(result.state, state);
  }
  assert.deepEqual(state, before);
  const locked = checkLevel(level, solve(level)).state;
  const lockedBefore = structuredClone(locked);
  const result = removeSticker(locked, locked.placements[0].id);
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'locked');
  assert.equal(result.state, locked);
  assert.deepEqual(locked, lockedBefore);
});
test('После успеха нельзя изменить готовый кадр', function () {
  const level = getRuntimeLevel(content, 0);
  const state = checkLevel(level, solve(level)).state;
  assert.equal(placeSticker(level, state, { stickerId: 'sock', x: 0.5, y: 0.5 }).accepted, false);
  assert.equal(undoPlacement(state), state);
});
test('Неудачная первая попытка и подсказка сохраняются в статистике кадра', function () {
  const level = getRuntimeLevel(content, 0);
  let state = checkLevel(level, createLevelState(level)).state;
  state = useHint(state);
  state = solve(level, state);
  state = checkLevel(level, state).state;
  assert.equal(state.checks, 2);
  assert.equal(state.firstCheckPassed, false);
  assert.equal(state.hintUsed, true);
});

test('Подсказка сначала просит освободить обычную записку и не выделяет другой секрет', function () {
  const level = getRuntimeLevel(content, 0);
  const note = level.keepZones.find(function (zone) { return zone.style === 'note'; });
  const placed = placeSticker(level, createLevelState(level), {
    stickerId: 'sock', x: note.rect[0] + note.rect[2] / 2, y: note.rect[1] + note.rect[3] / 2
  }).state;
  assert.deepEqual(getLevelHint(level, placed.placements), { hintIds: [], text: note.hint });
  const undone = undoPlacement(placed);
  assert.deepEqual(getLevelHint(level, undone.placements), {
    hintIds: [level.secrets[0].id], text: level.secrets[0].why
  });
});

test('После закрытия секретов подсказка предлагает проверку без подсветки', function () {
  const level = getRuntimeLevel(content, 0);
  assert.deepEqual(getLevelHint(level, solve(level).placements), {
    hintIds: [], text: 'Личное уже закрыто. Можно нажать «Готово».'
  });
});
test('Касание границ разрешено; пересечение положительной площади запрещено', function () {
  assert.equal(intersectsRect([0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5]), false);
  assert.equal(intersectsRect([0, 0, 0.51, 0.5], [0.5, 0, 0.5, 0.5]), true);
  assert.equal(validRect([0, 0, Infinity, 1]), false);
});
test('Сломанные данные, внешний ресурс и прозрачная подложка отвергаются', function () {
  const mutations = [
    function (c) { c.board.width = 400; },
    function (c) { c.stickers[0].src = 'https://example.org/sticker.svg'; },
    function (c) { c.stickers[0].color = 'transparent'; },
    function (c) { c.levels[0].secrets[0].rect = [-0.1, 0, 0.5, 0.2]; },
    function (c) { c.levels[0].secrets[0].rect = [0.3, 0.35, 0.2, 0.2]; },
    function (c) { c.levels[0].secrets.push(null); },
    function (c) { c.levels[0].keepZones.push(null); },
    function (c) { c.defaultStickerSize.w = '0.3'; }
  ];
  mutations.forEach(function (mutate) {
    const candidate = fresh(); mutate(candidate);
    assert.equal(validateContent(candidate).ok, false);
  });
  assert.equal(validateContent(null).ok, false);
});

test('A finite fixed sticker size that cannot cover the secrets is rejected', function () {
  for (const size of [{ w: 0.30, h: 0.16 }, { w: 0.40, h: 0.10 }]) {
    const candidate = fresh();
    candidate.defaultStickerSize = size;
    const result = validateContent(candidate);
    assert.equal(result.ok, false, JSON.stringify(size) + ' must not create an impossible game');
    assert.ok(result.errors.some(function (error) { return error.includes('секрет не помещается'); }));
  }
});
test('Мост завершает задание один раз на открытие, включая повторную игру', function () {
  const sent = [];
  const bridge = createBridge(function (m) { sent.push(m); });
  for (let replay = 0; replay < 3; replay += 1) {
    bridge.completeOnce(); bridge.finishOnce();
  }
  assert.deepEqual(sent.map(function (m) { return m.type; }), ['COMPLETED_EVENT', 'FINISH_EVENT']);
  assert.equal(bridge.getLog().length, 2);
});
test('Мост передаёт PNG, текст, закрытие и вибрацию без сторонних API', function () {
  const sent = [];
  const bridge = createBridge(function (m) { sent.push(m); });
  assert.equal(bridge.sharePoster('text', 'https://example.org/pic.png'), false);
  assert.equal(bridge.sharePoster('text', 'data:image/png;base64,abc'), true);
  bridge.closeGame(); bridge.vibrate();
  assert.deepEqual(sent, [
    { type: 'SHARING_EVENT', text: 'text', image: 'data:image/png;base64,abc' },
    { type: 'CLOSE_EVENT' }, { type: 'VIBRATION_EVENT' }
  ]);
  assert.equal(JSON.stringify(bridge.getLog()).includes('base64'), false);
});
test('Неуспешная отправка не выставляет флаг завершения', function () {
  let attempts = 0;
  const bridge = createBridge(function () { attempts += 1; return attempts > 1; });
  assert.equal(bridge.completeOnce(), false);
  assert.equal(bridge.completeOnce(), true);
  assert.equal(bridge.completeOnce(), false);
});
test('При недоступном JSON загружается отдельный пробный кадр', async function () {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  try {
    globalThis.fetch = async function () { return { ok: false, status: 404 }; };
    console.warn = function () {};
    const fallback = await loadContent();
    assert.equal(fallback.isFallback, true);
    assert.equal(fallback.levels.length, 1);
    assert.equal(validateContent(fallback).ok, true);
    const level = getRuntimeLevel(fallback, 0);
    assert.deepEqual(fallback.defaultStickerSize, { w: 0.40, h: 0.16 });
    assert.equal(evaluateLevel(level, solve(level).placements).passed, true);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});
