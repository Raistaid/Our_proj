import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLevelState, placeSticker, undoPlacement, evaluateLevel, checkLevel, useHint } from '../game/src/game.js';
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
  assert.ok(containsRect(result.state.placements.at(-1).rect, r),
    'Обычная записка подстраивает наклейку так же, как секретная');
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
test('Лимит, неизвестная наклейка и выход за кадр не добавляют ход', function () {
  const level = getRuntimeLevel(content, 0);
  let state = createLevelState(level);
  for (let i = 0; i < level.maxStickers; i += 1) {
    state = placeSticker(level, state, { stickerId: 'sock', x: 0.5, y: 0.5 }).state;
  }
  assert.equal(placeSticker(level, state, { stickerId: 'sock', x: 0.5, y: 0.5 }).reason, 'limit');
  assert.equal(placeSticker(level, state, { stickerId: 'sock', x: -0.1, y: 0.5 }).reason, 'outside');
  assert.equal(placeSticker(level, state, { stickerId: 'unknown', x: 0.5, y: 0.5 }).reason, 'unknown');
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
    function (c) { c.levels[0].maxStickers = 1; },
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
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});
