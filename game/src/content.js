import { validRect, intersectsRect } from './geometry.js';
import { noteBounds } from './note-text.js';

function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function localAsset(value) {
  return text(value) && /^\.\/assets\/[a-zA-Z0-9_/-]+\.(svg|png|webp)$/.test(value) &&
    value.indexOf('..') === -1;
}

export function validateContent(content) {
  const errors = [];
  if (!content || typeof content !== 'object') return { ok: false, errors: ['Нет данных'] };
  if (content.schemaVersion !== 1) errors.push('Неизвестная версия');
  if (content.requiredTextFraction !== undefined &&
      (!Number.isFinite(content.requiredTextFraction) || content.requiredTextFraction <= 0 || content.requiredTextFraction > 1)) {
    errors.push('Доля обязательного текста должна быть больше 0 и не больше 1');
  }
  if (!content.board || content.board.width !== 360 || content.board.height !== 480) {
    errors.push('Размер кадра должен быть 360 × 480');
  }
  const size = content.defaultStickerSize;
  const validSize = size && Number.isFinite(size.w) && Number.isFinite(size.h) &&
    size.w > 0 && size.w <= 0.5 && size.h > 0 && size.h <= 0.4;
  if (!validSize) {
    errors.push('Некорректный размер наклейки');
  }
  if (!Array.isArray(content.stickers) || !content.stickers.length) errors.push('Нет наклеек');
  const stickerIds = new Set();
  (Array.isArray(content.stickers) ? content.stickers : []).forEach(function (s) {
    if (!s || !text(s.id) || stickerIds.has(s.id) || !text(s.label) || !localAsset(s.src) ||
        typeof s.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.color) ||
        (s.shape !== undefined && !['rectangle', 'circle', 'rounded-square'].includes(s.shape))) {
      errors.push('Некорректная наклейка');
    } else stickerIds.add(s.id);
  });
  if (!Array.isArray(content.levels) || !content.levels.length) errors.push('Нет кадров');
  const levelIds = new Set();
  (Array.isArray(content.levels) ? content.levels : []).forEach(function (level) {
    if (!level || !text(level.id)) { errors.push('Кадр без ID'); return; }
    const name = level.id + ': ';
    if (levelIds.has(level.id)) errors.push(name + 'повтор ID');
    levelIds.add(level.id);
    const layouts = Array.isArray(level.layouts) ? level.layouts : [];
    layouts.forEach(function (layout, i) {
      const ids = (level.secrets || []).concat(level.keepZones || []).map(function (z) { return z && z.id; });
      Object.keys(layout || {}).forEach(function (id) {
        if (ids.indexOf(id) === -1) errors.push(name + 'раскладка ' + (i + 1) + ': неизвестная область ' + id);
      });
    });
    // The original layout and every replay layout pass the same checks.
    [level].concat(layouts.map(function (_, i) { return applyLayout(level, i + 1); })).forEach(function (level, v) {
    const name = level.id + (v ? ' (раскладка ' + v + ')' : '') + ': ';
    if (!text(level.title) || !text(level.brief) || !text(level.successText) || !localAsset(level.background)) {
      errors.push(name + 'нет заголовка, задачи или локального фона');
    }
    if (['practice', 'transfer'].indexOf(level.mode) === -1) errors.push(name + 'неизвестный режим');
    const secrets = Array.isArray(level.secrets) ? level.secrets : [];
    const keep = Array.isArray(level.keepZones) ? level.keepZones : [];
    if (!secrets.length || !keep.length) errors.push(name + 'нет областей');
    const ids = new Set();
    secrets.concat(keep).forEach(function (zone) {
      if (!zone || !text(zone.id) || ids.has(zone.id) || !validRect(zone.rect)) {
        errors.push(name + 'некорректная область');
      } else ids.add(zone.id);
      if (zone && zone.rotation !== undefined) {
        if (!Number.isFinite(zone.rotation) || Math.abs(zone.rotation) > 12) {
          errors.push(name + 'некорректный наклон записки');
        } else if (validRect(zone.rect)) {
          const b = noteBounds(zone);
          if (!validRect([b[0] / 360, b[1] / 480, b[2] / 360, b[3] / 480])) {
            errors.push(name + 'повёрнутая записка выходит за кадр');
          }
        }
      }
    });
    secrets.forEach(function (s, index) {
      if (!s || !validRect(s.rect)) return;
      if (!Array.isArray(s.lines) || !s.lines.length || s.lines.length > 3 ||
          !s.lines.every(text) || !text(s.why)) errors.push(name + 'нет текста или объяснения');
      if (s.sensitiveLines !== undefined && (!Array.isArray(s.sensitiveLines) || !s.sensitiveLines.length ||
          !s.sensitiveLines.every(i => Number.isInteger(i) && i >= 0 && i < (s.lines || []).length) ||
          new Set(s.sensitiveLines).size !== s.sensitiveLines.length)) {
        errors.push(name + 'некорректные строки с личными данными');
      }
      secrets.slice(index + 1).forEach(function (other) {
        if (other && validRect(other.rect) && intersectsRect(s.rect, other.rect)) {
          errors.push(name + 'секреты пересекаются');
        }
      });
    });
    keep.forEach(function (k) {
      if (!k || !text(k.hint)) errors.push(name + 'нет объяснения видимой области');
      if (k && k.lines && (!Array.isArray(k.lines) || !k.lines.length ||
          k.lines.length > 3 || !k.lines.every(text))) errors.push(name + 'неподходящий видимый текст');
    });
    });
  });
  return { ok: errors.length === 0, errors: errors };
}

// Replay layouts: variant 0 is the original; variant n uses layouts[(n - 1) % length], which moves
// notes (secrets and ordinary ones alike) to other places so a replay has to be read again.
export function applyLayout(level, variant) {
  const layouts = level && Array.isArray(level.layouts) ? level.layouts : [];
  if (!variant || !layouts.length) return level;
  const layout = layouts[(variant - 1) % layouts.length] || {};
  function move(zone) { return zone && layout[zone.id] ? Object.assign({}, zone, layout[zone.id]) : zone; }
  return Object.assign({}, level, {
    secrets: (level.secrets || []).map(move),
    keepZones: (level.keepZones || []).map(move)
  });
}

export function getRuntimeLevel(content, index, variant) {
  return Object.assign({}, applyLayout(content.levels[index], variant || 0), {
    defaultStickerSize: content.defaultStickerSize,
    requiredTextFraction: content.requiredTextFraction ?? 1,
    stickers: content.stickers,
    allowedStickerIds: content.stickers.map(function (s) { return s.id; })
  });
}

function fallbackContent() {
  return { schemaVersion: 1, board: { width: 360, height: 480 },
    defaultStickerSize: { w: 0.40, h: 0.16 }, isFallback: true,
    stickers: [{ id: 'sock', label: 'Серьёзный носок', src: './assets/stickers/sock.svg', color: '#e4ff69' }],
    levels: [{ id: 'practice', title: 'Пробный кадр',
      brief: 'Закрой все цифры учебного кода.',
      background: './assets/scenes/room.svg', mode: 'practice',
      secrets: [{ id: 'code', kind: 'code', rect: [0.05, 0.08, 0.38, 0.14],
        lines: ['Учебный код', '000000'], why: 'Код не стоит оставлять в открытом доступе.' }],
      keepZones: [{ id: 'hero', rect: [0.26, 0.3, 0.48, 0.38], hint: 'Пусть рюкзак останется видимым.' }],
      helpText: 'Посмотри на записку в верхней части кадра.',
      successText: 'Пробный кадр готов.', posterCaption: 'Секрет остался за кадром' }] };
}

export async function loadContent() {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(function () { controller.abort(); }, 1800) : null;
  try {
    const requestOptions = { cache: 'no-store' };
    if (controller) requestOptions.signal = controller.signal;
    const response = await fetch('./data/content.json', requestOptions);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const content = await response.json();
    const result = validateContent(content);
    if (!result.ok) throw new Error(result.errors.join('; '));
    return Object.assign({}, content, { isFallback: false });
  } catch (error) {
    console.warn('Не удалось загрузить набор игры:', error.message);
    return fallbackContent();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
