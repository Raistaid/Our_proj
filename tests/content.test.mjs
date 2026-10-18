import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRuntimeLevel } from '../game/src/content.js';
import { validateContent } from '../game/src/content.js';
import { intersectsRect } from '../game/src/geometry.js';
import { evaluateLevel } from '../game/src/game.js';
import { sensitiveRegions } from '../game/src/sensitive-text.js';

const content = JSON.parse(await readFile(new URL('../game/data/content.json', import.meta.url), 'utf8'));

test('Переписка идёт сверху вниз, входящие слева и исходящие справа во всех раскладках', () => {
  const index = content.levels.findIndex(level => level.id === 'frame_06');
  const order = ['chat_greeting', 'chat_reply', 'chat_question', 'chat_code', 'public_note'];
  for (let variant = 0; variant <= content.levels[index].layouts.length; variant++) {
    const level = getRuntimeLevel(content, index, variant);
    const zones = level.secrets.concat(level.keepZones);
    const messages = order.map(id => zones.find(zone => zone.id === id));
    messages.forEach((message, i) => {
      if (i) assert.ok(messages[i - 1].rect[1] + messages[i - 1].rect[3] < message.rect[1], 'Сообщения не должны стоять на одной высоте');
      const middle = message.rect[0] + message.rect[2] / 2;
      assert.equal(middle >= .5, message.lines[0].startsWith('Ты'));
      assert.ok(message.rect[1] + message.rect[3] < 345 / 480, 'Сообщение должно быть выше поля ввода');
    });
  }
});

test('Школа засчитывается только при закрытии самого названия Орбита во всех раскладках', () => {
  const index = content.levels.findIndex(level => level.secrets.some(s => s.id === 'school'));
  for (let variant = 0; variant <= content.levels[index].layouts.length; variant++) {
    const original = getRuntimeLevel(content, index, variant);
    const school = original.secrets.find(s => s.id === 'school');
    assert.deepEqual(school.sensitiveLines.map(i => school.lines[i]), ['Орбита']);
    const level = { ...original, secrets: [school], keepZones: [] };
    const masks = regions => regions.map(rect => ({ stickerId: 'sock', rect }));
    const heading = sensitiveRegions(level, { ...school, sensitiveLines: [0] });
    assert.equal(evaluateLevel(level, masks(heading)).passed, false, 'Закрытый заголовок не заменяет название');
    const letters = sensitiveRegions(level, school);
    assert.equal(evaluateLevel(level, masks(letters.slice(0, 3))).passed, true, 'Половины самого названия достаточно');
    assert.equal(evaluateLevel(level, masks(letters.slice(0, 2))).passed, false);
  }
});

test('Пять разных сцен без повторов; последний кадр — самостоятельная проверка', function () {
  assert.equal(content.levels.length, 5);
  assert.equal(new Set(content.levels.map(level => level.background)).size, content.levels.length);
  assert.equal(content.levels.filter(level => level.mode === 'transfer').length, 1);
  assert.equal(content.levels.at(-1).mode, 'transfer');
  assert.equal(content.feed.likes.length, content.levels.length);
});

test('Одна сцена телефона содержит СМС, личный номер и адрес', function () {
  const phones = content.levels.filter(level => level.background.endsWith('/phone.svg'));
  assert.equal(phones.length, 1, 'Повторная сцена с телефоном не нужна');
  const phone = phones[0];
  assert.deepEqual(new Set(phone.secrets.map(secret => secret.kind)), new Set(['code', 'phone', 'address']));
  const sms = phone.secrets.find(secret => secret.kind === 'code');
  assert.match(sms.lines[0], /СМС/);
  assert.match(sms.lines[1], /^[1-9]\d{2} \d{3}$/);
  assert.equal(phone.secrets.find(secret => secret.kind === 'phone').lines[1], '8 (800) 555-55-50');
});

test('Учебные данные содержат читаемые значения вместо нулевых заглушек', function () {
  for (const level of content.levels) {
    for (const secret of level.secrets) {
      const values = secret.sensitiveLines.map(index => secret.lines[index]);
      assert.ok(values.every(value => !/^[0\s-]+$/.test(value)), level.id + '/' + secret.id);
      assert.ok(values.every(value => !/Планета Пример|Дом 0|Школа Пример/.test(value)), level.id + '/' + secret.id);
    }
  }
});

test('Секреты и обычные записки телефона разделены в каждой раскладке', function () {
  const index = content.levels.findIndex(level => level.background.endsWith('/phone.svg'));
  for (let variant = 0; variant <= content.levels[index].layouts.length; variant += 1) {
    const level = getRuntimeLevel(content, index, variant);
    const ordinary = level.keepZones.filter(zone => zone.style === 'note');
    for (const secret of level.secrets) {
      for (const note of ordinary) assert.equal(intersectsRect(secret.rect, note.rect), false);
    }
  }
});

test('Заметки разных размеров и наклонов остаются в кадре при повторной игре', () => {
  assert.deepEqual(validateContent(content), { ok: true, errors: [] });
  const notes = content.levels.flatMap(l => l.secrets.concat(l.keepZones.filter(z => z.style === 'note')));
  assert.ok(new Set(notes.map(z => z.rect.slice(2).join(','))).size >= 8);
  assert.ok(notes.some(z => z.rotation > 0));
  assert.ok(notes.some(z => z.rotation < 0));
  const broken = structuredClone(content);
  broken.levels[0].secrets[0].rotation = 90;
  assert.equal(validateContent(broken).ok, false);
});

test('Везде используется выбранный номер и реплика про звонок', () => {
  for (const level of content.levels) {
    for (const secret of level.secrets.filter(s => s.kind === 'phone')) {
      assert.equal(secret.lines[1], '8 (800) 555-55-50');
    }
  }
  assert.equal(content.feed.strangers.phone.text, 'Теперь у меня есть твой номер. Позвоню тебе.');
});
