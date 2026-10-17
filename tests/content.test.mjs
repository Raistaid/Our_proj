import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRuntimeLevel } from '../game/src/content.js';
import { intersectsRect } from '../game/src/geometry.js';

const content = JSON.parse(await readFile(new URL('../game/data/content.json', import.meta.url), 'utf8'));

test('Одна сцена телефона содержит СМС, личный номер и адрес', function () {
  const phones = content.levels.filter(level => level.background.endsWith('/poster.svg'));
  assert.equal(phones.length, 1, 'Повторная сцена с телефоном не нужна');
  const phone = phones[0];
  assert.deepEqual(new Set(phone.secrets.map(secret => secret.kind)), new Set(['code', 'phone', 'address']));
  const sms = phone.secrets.find(secret => secret.kind === 'code');
  assert.match(sms.lines[0], /СМС/);
  assert.match(sms.lines[1], /^[1-9]\d{2} \d{3}$/);
  assert.match(phone.secrets.find(secret => secret.kind === 'phone').lines[1], /^\+1 202 555-01\d{2}$/);
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
  const index = content.levels.findIndex(level => level.background.endsWith('/poster.svg'));
  for (let variant = 0; variant <= content.levels[index].layouts.length; variant += 1) {
    const level = getRuntimeLevel(content, index, variant);
    const ordinary = level.keepZones.filter(zone => zone.style === 'note');
    for (const secret of level.secrets) {
      for (const note of ordinary) assert.equal(intersectsRect(secret.rect, note.rect), false);
    }
  }
});
