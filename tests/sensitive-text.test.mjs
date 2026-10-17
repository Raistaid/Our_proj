import test from 'node:test';
import assert from 'node:assert/strict';
import { sensitiveRegions, inkRegions } from '../game/src/sensitive-text.js';
import { noteTextSpec, textLayout, paintNoteText } from '../game/src/note-text.js';
import { evaluateLevel } from '../game/src/game.js';
import { stickersCoverRect } from '../game/src/sticker-shapes.js';

const zone = { id: 'code', rect: [.1, .1, .4, .16], form: 'paper',
  lines: ['Код для входа', '12 34'], sensitiveLines: [1] };
const level = { id: 'sensitive-test', secrets: [zone], keepZones: [], stickers: [{ id: 'sock', shape: 'rectangle' }] };
function masks(regions) { return regions.map((rect, i) => ({ id: String(i), stickerId: 'sock', rect })); }

test('Только символы значения обязательны: заголовок, пробелы и края остаются открытыми', () => {
  const regions = sensitiveRegions(level, zone);
  assert.equal(regions.length, 4);
  assert.equal(evaluateLevel(level, masks(regions)).passed, true);
  assert.equal(stickersCoverRect(masks(regions), zone.rect), false);
  assert.ok(regions.every(r => r[0] > zone.rect[0] && r[1] > zone.rect[1]));
  for (let i = 0; i < regions.length; i += 1) {
    assert.equal(evaluateLevel(level, masks(regions.filter((_, n) => n !== i))).passed, false,
      'Каждая цифра должна быть закрыта');
  }
});

test('Заголовок можно закрыть, но он не заменяет скрытие значения', () => {
  const r = zone.rect;
  assert.equal(evaluateLevel(level, masks([[r[0], r[1], r[2], .04]])).passed, false);
});

test('Все слова адреса, @ и точки почты участвуют в проверке', () => {
  for (const text of ['Планета Пример, дом 0', 'user@example.test']) {
    const secret = { ...zone, id: text, lines: [text, 'Подпись'], sensitiveLines: [0] };
    const frame = { ...level, secrets: [secret] };
    const regions = sensitiveRegions(frame, secret);
    assert.equal(regions.length, [...text].filter(c => !/\s/.test(c)).length);
    assert.equal(evaluateLevel(frame, masks(regions)).passed, true);
    for (let i = 0; i < regions.length; i += 1) {
      assert.equal(evaluateLevel(frame, masks(regions.filter((_, n) => n !== i))).passed, false);
    }
  }
});

test('Наклейки на любых обычных объектах и подписях не блокируют готовность', () => {
  const frame = { ...level, keepZones: [
    { id: 'hero', rect: [.6, .1, .3, .2] }, { id: 'caption', rect: [.1, .8, .8, .1] },
    { id: 'public_note', rect: [.5, .5, .3, .2] }
  ] };
  const placed = masks(sensitiveRegions(frame, zone).concat(frame.keepZones.map(z => z.rect)));
  assert.equal(evaluateLevel(frame, placed).passed, true);
  assert.deepEqual(evaluateLevel(frame, placed).blockedKeepIds, []);
});

test('Растр использует каждый пиксель чернил и пропускает прозрачные промежутки', () => {
  const data = new Uint8ClampedArray(4 * 4 * 2);
  for (const [x, y, alpha] of [[0, 0, 1], [1, 0, 255], [3, 0, 80], [2, 1, 255]]) {
    data[(y * 4 + x) * 4 + 3] = alpha;
  }
  assert.deepEqual(inkRegions(data, 4, 2, 36, 48), [
    [.1, .1, 1 / 360, .5 / 480], [(36 + 1.5) / 360, .1, .5 / 360, .5 / 480],
    [37 / 360, 48.5 / 480, .5 / 360, .5 / 480]
  ]);
});

test('Текст для проверки использует ту же вёрстку, что видимая записка', () => {
  const calls = [];
  const ctx = new Proxy({ measureText: text => ({ width: text.length * 6 }),
    fillText: (...args) => calls.push([ctx.font, ...args]) },
  { get: (target, key) => key in target ? target[key] : () => {} });
  for (const form of ['paper', 'phone', 'message', 'tag', 'badge']) {
    const secret = { ...zone, form };
    const spec = noteTextSpec(level, secret);
    const runs = textLayout(ctx, secret.lines, spec.box, spec.maxFont, spec);
    calls.length = 0;
    paintNoteText(ctx, level, secret, [1]);
    assert.deepEqual(calls, [[runs[1].font, runs[1].text, runs[1].x, runs[1].y]]);
  }
});

test('Прозрачный угол круглой наклейки не скрывает даже один символ', () => {
  const secret = { id: 'pixel', rect: [.1, .1, .005, .005] };
  const frame = { ...level, stickers: [{ id: 'cloud', shape: 'circle' }], secrets: [secret] };
  assert.equal(evaluateLevel(frame, [{ stickerId: 'cloud', rect: [.1, .1, .3, .225] }]).passed, false);
});
