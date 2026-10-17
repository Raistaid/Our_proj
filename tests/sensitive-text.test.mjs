import test from 'node:test';
import assert from 'node:assert/strict';
import { secretTargetRect } from '../game/src/sensitive-text.js';
import { evaluateLevel, getLevelHint, secretTargetRect as gameTargetRect } from '../game/src/game.js';
import { stickersCoverRect } from '../game/src/sticker-shapes.js';

const zone = { id: 'code', rect: [.1, .1, .4, .16], form: 'paper',
  lines: ['Код из СМС', '482 913'], sensitiveLines: [1], why: 'Код нужен только тебе.' };
const level = { id: 'target-test', secrets: [zone], keepZones: [], stickers: [{ id: 'sock', shape: 'rectangle' }] };
function masks(regions) { return regions.map((rect, i) => ({ id: String(i), stickerId: 'sock', rect })); }
function closeRect(actual, expected) {
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-12,
    `${index}: expected ${expected[index]}, received ${value}`));
}

test('Цель отступает ровно на 8 логических пикселей от каждой стороны записки', () => {
  const target = secretTargetRect(zone);
  assert.equal(gameTargetRect, secretTargetRect, 'Проверка и подсказка используют одну функцию');
  closeRect(target, [44 / 360, 56 / 480, 128 / 360, 60.8 / 480]);
  assert.equal(evaluateLevel(level, masks([target])).passed, true);
  assert.equal(stickersCoverRect(masks([target]), zone.rect), false, 'Поля записки могут остаться открытыми');
});

test('Открытый участок у любой границы внутренней цели мешает прохождению', () => {
  const [x, y, w, h] = secretTargetRect(zone);
  for (const rect of [
    [x + 1 / 360, y, w - 1 / 360, h], [x, y, w - 1 / 360, h],
    [x, y + 1 / 480, w, h - 1 / 480], [x, y, w, h - 1 / 480]
  ]) {
    const placed = masks([rect]);
    assert.deepEqual(evaluateLevel(level, placed).missingSecretIds, [zone.id]);
    assert.deepEqual(getLevelHint(level, placed), { hintIds: [zone.id], text: zone.why });
  }
});

test('У маленьких записок отступ ограничен четвертью каждой стороны', () => {
  const small = { ...zone, rect: [36 / 360, 48 / 480, 16 / 360, 12 / 480] };
  const target = secretTargetRect(small);
  closeRect(target, [40 / 360, 51 / 480, 8 / 360, 6 / 480]);
  assert.equal(evaluateLevel({ ...level, secrets: [small] }, []).passed, false);
  assert.equal(evaluateLevel({ ...level, secrets: [small] }, masks([target])).passed, true);
  closeRect(secretTargetRect({ rect: [.1, .1, 16 / 360, 80 / 480] }),
    [40 / 360, 56 / 480, 8 / 360, 64 / 480]);
  closeRect(secretTargetRect({ rect: [.1, .1, 144 / 360, 12 / 480] }),
    [44 / 360, 51 / 480, 128 / 360, 6 / 480]);
});

test('Несколько наклеек могут совместно закрыть цель, но щель между ними не засчитывается', () => {
  const [x, y, w, h] = secretTargetRect(zone);
  const left = [x, y, w / 2, h];
  const right = [x + w / 2, y, w / 2, h];
  assert.equal(evaluateLevel(level, masks([left, right])).passed, true);
  assert.equal(evaluateLevel(level, masks([[x, y, w * .6, h], right])).passed, true);
  assert.equal(evaluateLevel(level, masks([left, [right[0] + .5 / 360, y, right[2] - .5 / 360, h]])).passed, false);
});

test('Форма, текст и чувствительные строки не меняют геометрическую цель', () => {
  const target = secretTargetRect(zone);
  for (const form of ['paper', 'phone', 'message', 'tag', 'badge']) {
    for (const lines of [[], ['482 913'], ['Совсем другой текст', '+7 (999) 123-45-67']]) {
      const secret = { ...zone, form, lines, sensitiveLines: [0] };
      assert.deepEqual(secretTargetRect(secret), target);
      assert.equal(evaluateLevel({ ...level, secrets: [secret] }, masks([target])).passed, true);
    }
  }
  assert.equal(evaluateLevel(level, masks([[.2, .2, .05, .015]])).passed, false,
    'Закрытие отдельных цифр не заменяет закрытие внутреннего прямоугольника');
});

test('Прозрачные углы круглых и скруглённых наклеек не закрывают цель', () => {
  const secret = { id: 'small', rect: [.1, .1, .005, .005] };
  for (const shape of ['circle', 'rounded-square']) {
    const frame = { ...level, secrets: [secret], stickers: [{ id: 'curved', shape }] };
    const placement = { stickerId: 'curved', shape: 'rectangle', rect: [.1, .1, .3, .225] };
    assert.equal(evaluateLevel(frame, [placement]).passed, false);
    placement.rect = [0, 0, .3, .225];
    assert.equal(evaluateLevel(frame, [placement]).passed, true);
  }
});

test('Обычные объекты и подписи можно закрывать; исходные размеры и текст не меняются', () => {
  const frame = structuredClone({ ...level, keepZones: [
    { id: 'hero', rect: [.6, .1, .3, .2] }, { id: 'caption', rect: [.1, .8, .8, .1] },
    { id: 'public_note', rect: [.5, .5, .3, .2] }
  ] });
  const before = structuredClone(frame);
  Object.freeze(frame.secrets[0].rect);
  Object.freeze(frame.secrets[0].lines);
  Object.freeze(frame.secrets[0]);
  const placed = masks([secretTargetRect(frame.secrets[0]), ...frame.keepZones.map(z => z.rect)]);
  const report = evaluateLevel(frame, placed);
  assert.equal(report.passed, true);
  assert.deepEqual(report.blockedKeepIds, []);
  assert.deepEqual(getLevelHint(frame, placed), { hintIds: [], text: 'Личное уже закрыто. Можно нажать «Готово».' });
  assert.deepEqual(frame, before);
});
