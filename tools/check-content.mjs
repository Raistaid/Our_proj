import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateContent, getRuntimeLevel } from '../game/src/content.js';
import { createLevelState, placeSticker, evaluateLevel } from '../game/src/game.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const gameRoot = path.join(root, 'game');
const content = JSON.parse(await readFile(path.join(gameRoot, 'data/content.json'), 'utf8'));
const validation = validateContent(content);
if (!validation.ok) {
  console.error(validation.errors.join('\n'));
  process.exitCode = 1;
} else {
  for (let i = 0; i < content.levels.length; i += 1) {
   // Every replay layout must be solvable too.
   const variants = 1 + (Array.isArray(content.levels[i].layouts) ? content.levels[i].layouts.length : 0);
   for (let v = 0; v < variants; v += 1) {
    const level = getRuntimeLevel(content, i, v);
    let state = createLevelState(level);
    for (const secret of level.secrets) {
      const r = secret.rect;
      const result = placeSticker(level, state, {
        stickerId: content.stickers.find(function (s) { return !s.shape || s.shape === 'rectangle'; }).id,
        x: r[0] + r[2] / 2, y: r[1] + r[3] / 2
      });
      if (!result.accepted) throw new Error(level.id + ' v' + v + ': нельзя поставить наклейку');
      state = result.state;
    }
    if (!evaluateLevel(level, state.placements).passed) throw new Error(level.id + ' v' + v + ': нет решения');
    console.log('OK ' + level.id + (v ? ' (раскладка ' + v + ')' : '') + ': ' + level.secrets.length + ' секретов, решение найдено');
   }
  }
  const paths = new Set(content.stickers.map(function (s) { return s.src; }));
  content.levels.forEach(function (level) { paths.add(level.background); });
  for (const asset of paths) await stat(path.join(gameRoot, asset));
}
async function sizeOf(folder) {
  let total = 0;
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    total += entry.isDirectory() ? await sizeOf(full) : (await stat(full)).size;
  }
  return total;
}
const bytes = await sizeOf(gameRoot);
console.log('Папка game: ' + bytes + ' байт (' + (bytes / 1024).toFixed(1) + ' КиБ)');
if (bytes > 5 * 1024 * 1024) {
  console.error('Превышен ориентир 5 МиБ');
  process.exitCode = 1;
}
