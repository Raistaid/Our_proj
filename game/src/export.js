import { evaluateLevel } from './game.js';
import { renderBoard, roundedRect } from './renderer.js';
import { DEFAULT_FEED, fanComments, agentTitle } from './feed.js';

const W = 720;
const H = 960;
const INK = '#18212c';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
// The frame keeps its 3:4 shape; below it there is room for the title and a comment.
const BOARD = { x: 84, y: 26, w: 552, h: 736 };

function fitText(ctx, text, maxWidth, size, weight) {
  let font = size;
  ctx.font = weight + ' ' + font + 'px ' + FONT;
  while (font > 14 && ctx.measureText(text).width > maxWidth) {
    font -= 1;
    ctx.font = weight + ' ' + font + 'px ' + FONT;
  }
  return font;
}

// Poster band: the agent title, the likes of all posts and one fan comment about the stickers.
function drawBand(ctx, options) {
  const feed = options.feed || DEFAULT_FEED;
  const title = agentTitle(feed, options.stats);
  const levels = options.stats ? options.stats.levels : 0;
  const likes = (feed.likes || []).slice(0, levels).reduce(function (sum, n) { return sum + n; }, 0);
  const comment = fanComments(feed, 4, options.placements.map(function (p) { return p.stickerId; }), 1)[0];
  const top = BOARD.y + BOARD.h + 22;

  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  // Title badge
  ctx.font = '800 15px ' + FONT;
  ctx.fillStyle = INK;
  ctx.fillText('ТВОЁ ЗВАНИЕ', BOARD.x, top + 8);
  if (title) {
    fitText(ctx, title.title, 360, 40, '900');
    ctx.fillText(title.title, BOARD.x, top + 44);
  }
  // Likes, right aligned
  ctx.textAlign = 'right';
  ctx.font = '900 34px ' + FONT;
  ctx.fillStyle = '#d2366a';
  if (likes) ctx.fillText('♥ ' + likes, BOARD.x + BOARD.w, top + 44);
  ctx.font = '600 15px ' + FONT;
  ctx.fillStyle = '#59635f';
  if (likes) ctx.fillText('за ' + levels + ' постов', BOARD.x + BOARD.w, top + 8);
  // One comment bubble
  if (comment) {
    const y = top + 82;
    roundedRect(ctx, BOARD.x, y, BOARD.w, 50, 14);
    ctx.fillStyle = '#f4f1ff'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'left';
    const who = comment.who + ' ';
    ctx.font = '800 19px ' + FONT;
    ctx.fillStyle = INK;
    ctx.fillText(who, BOARD.x + 16, y + 25);
    const whoWidth = ctx.measureText(who).width;
    fitText(ctx, comment.text, BOARD.w - 32 - whoWidth, 19, '600');
    ctx.fillText(comment.text, BOARD.x + 16 + whoWidth, y + 25);
  }
}

export async function createPoster(options) {
  if (!evaluateLevel(options.level, options.placements).passed) {
    throw new Error('Сначала подготовь кадр');
  }
  // With feed data the poster gets a band below the frame; without it, the frame fills the poster.
  const withBand = Boolean(options.feed || options.stats);
  // The frame is drawn by the same renderBoard first; the poster canvas is created last.
  const frame = document.createElement('canvas');
  frame.width = withBand ? BOARD.w : W; frame.height = withBand ? BOARD.h : H;
  renderBoard({ canvas: frame, level: options.level, placements: options.placements,
    assets: options.assets, preview: null, hintIds: [] });
  let canvas = frame;
  if (withBand) {
    canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7f4eb'; ctx.fillRect(0, 0, W, H);
    // Offset shadow and ink border, like the frame on screen.
    ctx.fillStyle = '#c9bdff';
    ctx.fillRect(BOARD.x + 10, BOARD.y + 10, BOARD.w, BOARD.h);
    ctx.drawImage(frame, BOARD.x, BOARD.y, BOARD.w, BOARD.h);
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.strokeRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
    drawBand(ctx, options);
  }
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
