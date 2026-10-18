import test from 'node:test';
import assert from 'node:assert/strict';
import { sensitiveRegions, inkRegions } from '../game/src/sensitive-text.js';
import { noteTextSpec, textLayout, paintNoteText, rotatePoint, pixels } from '../game/src/note-text.js';
import { evaluateLevel } from '../game/src/game.js';
import { stickersCoverRect } from '../game/src/sticker-shapes.js';
import { getLevelHint } from '../game/src/game.js';
import { createPoster } from '../game/src/export.js';

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

test('Обычные записки и подписи нужно оставить открытыми; главный предмет можно украшать', () => {
  const frame = { ...level, keepZones: [
    { id: 'hero', rect: [.6, .1, .3, .2] }, { id: 'caption', rect: [.1, .8, .8, .1], hint: 'Оставь подпись.' },
    { id: 'public_note', rect: [.5, .5, .3, .2], hint: 'Оставь обычную идею.' }
  ] };
  const solved = masks(sensitiveRegions(frame, zone));
  const before = structuredClone(frame);
  assert.equal(evaluateLevel(frame, solved).passed, true);
  for (const keep of frame.keepZones) {
    const placed = solved.concat(masks([keep.rect]));
    assert.equal(evaluateLevel(frame, placed).passed, keep.id === 'hero');
    assert.deepEqual(evaluateLevel(frame, placed).blockedKeepIds, keep.id === 'hero' ? [] : [keep.id]);
    if (keep.id !== 'hero') assert.deepEqual(getLevelHint(frame, placed), { hintIds: [], text: keep.hint });
  }
  assert.deepEqual(frame, before);
});

test('До 20% обычной записки можно закрыть; больше 20% блокирует успех, подсказку и экспорт', async () => {
  const frame = { ...level, keepZones: [{ id: 'idea', rect: [.6, .5, .2, .1], hint: 'Оставь идею видимой.' }] };
  const solved = masks(sensitiveRegions(frame, zone));
  const touching = { stickerId: 'sock', rect: [.4, .5, .2, .1] };
  assert.equal(evaluateLevel(frame, [...solved, touching]).passed, true);
  for (const ratio of [.05, .19999, .2]) {
    const slightOverlap = { ...touching, rect: [.4 + ratio * .2, .5, .2, .1] };
    assert.equal(evaluateLevel(frame, [...solved, slightOverlap]).passed, true);
    assert.deepEqual(getLevelHint(frame, [...solved, slightOverlap]).hintIds, []);
  }
  const overlapping = { ...touching, rect: [.4 + .20001 * .2, .5, .2, .1] };
  const placed = [...solved, overlapping];
  assert.deepEqual(evaluateLevel(frame, placed).blockedKeepIds, ['idea']);
  assert.equal(getLevelHint(frame, placed).text, frame.keepZones[0].hint);
  await assert.rejects(createPoster({ level: frame, placements: placed }), /Сначала подготовь кадр/);
});

test('Порог 20% одинаков на всех сторонах и защищает маленькие подписи', () => {
  const rect = [.6, .5, .2, .1];
  const frame = { ...level, keepZones: [{ id: 'idea', rect, hint: 'Оставь идею видимой.' }] };
  const solved = masks(sensitiveRegions(frame, zone));
  const [x, y, w, h] = rect;
  for (const ratio of [.2, .20001]) {
    const dx = ratio * w, dy = ratio * h;
    for (const strip of [[x, y, dx, h], [x + w - dx, y, dx, h],
      [x, y, w, dy], [x, y + h - dy, w, dy]]) {
      assert.equal(evaluateLevel(frame, solved.concat(masks([strip]))).passed, ratio === .2);
    }
  }
  const tiny = { ...frame, keepZones: [{ id: 'tiny', rect: [.6, .5, 6 / 360, 6 / 480] }] };
  assert.deepEqual(evaluateLevel(tiny, solved.concat(masks([tiny.keepZones[0].rect]))).blockedKeepIds, ['tiny']);
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

test('Чувствительные символы поворачиваются вместе с любой формой записки', () => {
  for (const form of ['paper', 'phone', 'message', 'tag', 'badge']) {
    const original = { ...zone, rect: [.2, .25, .36, .18], form, lines: ['Код', '123'] };
    const base = sensitiveRegions(level, original);
    for (const rotation of [-5, 4]) {
      const turned = sensitiveRegions(level, { ...original, rotation });
      assert.equal(turned.length, base.length);
      for (let i = 0; i < base.length; i++) {
        const [x, y, w, h] = base[i];
        const expected = rotatePoint([(x + w / 2) * 360, (y + h / 2) * 480], pixels(original.rect), rotation * Math.PI / 180);
        assert.ok(Math.abs((turned[i][0] + turned[i][2] / 2) * 360 - expected[0]) < 1e-8);
        assert.ok(Math.abs((turned[i][1] + turned[i][3] / 2) * 480 - expected[1]) < 1e-8);
      }
    }
  }
});

test('The first half of each personal line is sufficient; its uncovered start still fails', () => {
  for (const value of ['8 (800) 555-55-50', '482 719', 'ул. Облачная, 18', '4276 1234 5678 9012', 'Школа 17, класс 6Б']) {
    const secret = { ...zone, id: value, lines: ['Персональные данные', value] };
    const frame = { ...level, requiredTextFraction: 0.5, secrets: [secret] };
    const full = sensitiveRegions({ ...frame, requiredTextFraction: 1 }, secret);
    const required = sensitiveRegions(frame, secret);
    const left = Math.min(...required.map(r => r[0]));
    const top = Math.min(...required.map(r => r[1]));
    const right = Math.max(...required.map(r => r[0] + r[2]));
    const bottom = Math.max(...required.map(r => r[1] + r[3]));
    const fullRight = Math.max(...full.map(r => r[0] + r[2]));
    assert.ok(right < fullRight, value);
    const cover = masks([[left, top, right - left, bottom - top]]);
    assert.equal(evaluateLevel(frame, cover).passed, true, value);
    assert.equal(evaluateLevel({ ...frame, requiredTextFraction: 1 }, cover).passed, false, value);
    cover[0].rect[2] /= 2;
    assert.equal(evaluateLevel(frame, cover).passed, false, value);
  }
});
