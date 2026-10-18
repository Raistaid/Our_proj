import test from 'node:test';
import assert from 'node:assert/strict';
import { agentTitle, fanComments } from '../game/src/feed.js';
import { readFile } from 'node:fs/promises';

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

test('В сцене phone всегда пишет 67vadim6767: Лютая имба', async () => {
  const content = JSON.parse(await readFile(new URL('../game/data/content.json', import.meta.url), 'utf8'));
  for (const ids of [['sock'], ['cloud'], ['cucumber'], ['sock', 'cloud', 'cucumber']]) {
    const comments = fanComments(content.feed, 2, ids, 2, 'phone');
    assert.deepEqual(comments[0], { who: '@67vadim6767', text: 'Лютая имба' });
    assert.equal(comments.filter(c => c.who === '@67vadim6767').length, 1);
    assert.equal(comments.length, 2);
  }
  assert.equal(content.feed.names.includes('@pixel_dasha'), false);
  assert.equal(fanComments(content.feed, 0, ['sock'], 2, 'room').some(c => c.text === 'Лютая имба'), false);
});
