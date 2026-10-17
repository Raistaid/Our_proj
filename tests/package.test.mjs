import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const game = fileURLToPath(new URL('../game/', import.meta.url));
async function filesIn(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(full));
    else result.push(full);
  }
  return result;
}
test('Игра переносима: HTML, импорты и все ресурсы существуют по относительным путям', async function () {
  const html = await readFile(path.join(game, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(match[1].startsWith('./'), 'Внешний или абсолютный URL: ' + match[1]);
    await stat(path.join(game, match[1]));
  }
  const scripts = (await filesIn(path.join(game, 'src'))).filter(function (file) { return file.endsWith('.js'); });
  for (const file of scripts) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('./'), 'Чужой модуль: ' + match[1]);
      await stat(path.resolve(path.dirname(file), match[1]));
    }
    assert.equal(/https?:\/\//.test(source), false, 'URL в игровом коде: ' + file);
    assert.equal(/navigator\.(share|vibrate)|window\.open|localStorage|serviceWorker/.test(source), false);
  }
  for (const file of (await filesIn(path.join(game, 'assets')))) {
    if (file.endsWith('.svg')) {
      const svg = await readFile(file, 'utf8');
      assert.equal(/<(?:script|foreignObject)\b|(?:href|src)=["']https?:/i.test(svg), false, file);
    }
  }
});
test('В поставляемой игре нет зависимостей или файлов разработки', async function () {
  const files = await filesIn(game);
  const bytes = (await Promise.all(files.map(async function (file) { return (await stat(file)).size; })))
    .reduce(function (sum, value) { return sum + value; }, 0);
  assert.ok(bytes < 5 * 1024 * 1024);
  assert.equal(files.some(function (file) { return /node_modules|package\.json|\.test\./.test(file); }), false);
});
