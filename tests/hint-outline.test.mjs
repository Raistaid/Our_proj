import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRuntimeLevel } from '../game/src/content.js';
import { sensitiveRegions } from '../game/src/sensitive-text.js';
import { noteTextSpec, rotatePoint } from '../game/src/note-text.js';
import { hintOutline, HINT_COLOR, HINT_WIDTH } from '../game/src/hint-outline.js';

test('Яркая обводка следует наклону текста и не касается ни одного чувствительного символа', async () => {
  const content = JSON.parse(await readFile(new URL('../game/data/content.json', import.meta.url), 'utf8'));
  assert.equal(HINT_COLOR, '#e6006f');
  for (let i = 0; i < content.levels.length; i++) {
    for (let variant = 0; variant <= (content.levels[i].layouts || []).length; variant++) {
      const level = getRuntimeLevel(content, i, variant);
      for (const zone of level.secrets) {
        const outline = hintOutline(level, zone), spec = noteTextSpec(level, zone);
        assert.equal(outline.angle, spec.angle);
        const [left, top, w, h] = outline.rect;
        for (const [x, y, width, height] of sensitiveRegions(level, zone)) {
          for (const [px, py] of [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]) {
            const local = rotatePoint([px * 360, py * 480], spec.p, -outline.angle);
            assert.ok(local[0] > left + HINT_WIDTH / 2);
            assert.ok(local[0] < left + w - HINT_WIDTH / 2);
            assert.ok(local[1] > top + HINT_WIDTH / 2);
            assert.ok(local[1] < top + h - HINT_WIDTH / 2);
          }
        }
      }
    }
  }
});
