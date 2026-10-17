import { evaluateLevel } from './game.js';
import { renderBoard } from './renderer.js';

export async function createPoster(options) {
  if (!evaluateLevel(options.level, options.placements).passed) {
    throw new Error('Сначала подготовь кадр');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 720; canvas.height = 960;
  renderBoard({ canvas: canvas, level: options.level, placements: options.placements,
    assets: options.assets, preview: null, hintIds: [] });
  const image = canvas.toDataURL('image/png');
  if (image.indexOf('data:image/png;base64,') !== 0) throw new Error('Картинка не получилась');
  return image;
}
