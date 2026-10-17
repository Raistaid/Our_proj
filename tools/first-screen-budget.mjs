// Estimates how fast the first playable screen appears on a slow mobile network.
// The sandbox WebView has no cache, so everything is downloaded on every launch.
// Budget of the hackathon: first playable screen within 3 s on a mobile network.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const game = fileURLToPath(new URL('../game/', import.meta.url));
const BANDWIDTH = 1.6e6 / 8; // bytes per second, "regular 3G" class network
const RTT = 0.15;            // seconds per request round trip
const BUDGET = 3;            // seconds

async function size(file) { return (await stat(path.join(game, file))).size; }

// What the start screen needs before the first tap:
// page → stylesheet and module graph → content.json → every picture used by the scenes.
const html = await readFile(path.join(game, 'index.html'), 'utf8');
const pageAssets = Array.from(html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)).map(m => m[1]);
const modules = (await readdir(path.join(game, 'src'))).filter(f => f.endsWith('.js')).map(f => 'src/' + f);
const content = JSON.parse(await readFile(path.join(game, 'data/content.json'), 'utf8'));
const pictures = new Set(content.stickers.map(s => s.src.replace('./', '')));
content.levels.forEach(l => pictures.add(l.background.replace('./', '')));

const files = Array.from(new Set(['index.html', ...pageAssets, ...modules, 'data/content.json', ...pictures]));
let bytes = 0;
for (const file of files) bytes += await size(file);

// Round trips in a row: page, app.js, its imports (two levels deep), content.json, pictures.
const roundTrips = 6;
const seconds = bytes / BANDWIDTH + roundTrips * RTT;
const line = 'Первый экран: ' + files.length + ' файлов, ' + Math.round(bytes / 1024) + ' КБ, ' +
  'оценка ' + seconds.toFixed(2) + ' с на сети 1,6 Мбит/с (бюджет ' + BUDGET + ' с)';
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, '### ' + line + '\n');
}
if (seconds > BUDGET) {
  console.error('Слишком тяжёлый старт: уменьшите картинки или код.');
  process.exitCode = 1;
}
