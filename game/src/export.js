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
  let image = '';
  try {
    image = canvas.toDataURL('image/png');
  } catch (error) {
    // A foreign-origin image taints the canvas; never hand a broken result to the app.
    throw new Error('Картинка не получилась: ' + error.message);
  }
  // An empty canvas still yields a tiny "data:," string or a near-empty PNG.
  if (image.indexOf('data:image/png;base64,') !== 0 || image.length < 2000) {
    throw new Error('Картинка не получилась');
  }
  return image;
}
