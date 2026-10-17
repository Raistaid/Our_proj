import test from 'node:test';
import assert from 'node:assert/strict';
import { agentTitle } from '../game/src/feed.js';

test('Звание выбирает самого частого героя независимо от порядка и нулей', () => {
  for (const [id, title] of Object.entries({ sock: 'Мастер носков', cloud: 'Повелитель облаков', cucumber: 'Огуречный ниндзя' })) {
    assert.equal(agentTitle(null, { stickerCounts: { sock: 0, cloud: 1, cucumber: 2, [id]: 5 } }).title, title);
  }
});

test('Равенство двух или трёх лидеров даёт звание микса', () => {
  for (const stickerCounts of [{ sock: 4, cloud: 4, cucumber: 1 }, { sock: 3, cloud: 3, cucumber: 3 }]) {
    assert.equal(agentTitle(null, { stickerCounts }).title, 'Мастер стикер-микса');
  }
  assert.ok(agentTitle(null, { stickerCounts: {} }).title);
});

test('Награда обращается к игроку', () => {
  assert.equal(agentTitle(null, { stickerCounts: { cloud: 7 } }).text, 'Ты прикрыл секреты 7 раз!');
});
