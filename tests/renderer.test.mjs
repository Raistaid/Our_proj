import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderBoard, renderStickerCard } from '../game/src/renderer.js';
import { createLevelState, placeSticker } from '../game/src/game.js';
import { getRuntimeLevel } from '../game/src/content.js';

const content = JSON.parse(await readFile(new URL('../game/data/content.json', import.meta.url), 'utf8'));
const assets = { images: {}, stickers: Object.fromEntries(content.stickers.map(function (s) { return [s.id, s]; })) };

function drawingSurface(connected = false) {
  const rectangles = [];
  const images = [];
  const saved = [];
  const context = new Proxy({
    globalAlpha: 1,
    fillStyle: '',
    pathShape: null, clipShape: null,
    beginPath: function () { this.pathShape = null; },
    rect: function () { this.pathShape = 'rectangle'; },
    arc: function () { this.pathShape = 'circle'; },
    arcTo: function () { this.pathShape = 'rounded-square'; },
    clip: function () { this.clipShape = this.pathShape; },
    save: function () { saved.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, clipShape: this.clipShape }); },
    restore: function () { Object.assign(this, saved.pop()); },
    measureText: function (text) { return { width: text.length * 5 }; },
    fillRect: function (...rect) {
      rectangles.push({ rect: rect, alpha: this.globalAlpha, color: this.fillStyle, shape: this.clipShape });
    },
    drawImage: function (image, ...rect) {
      images.push({ image: image, rect: rect, alpha: this.globalAlpha });
    }
  }, { get: function (target, key) { return key in target ? target[key] : function () {}; } });
  const canvas = { width: 360, height: 480, isConnected: connected, getContext: function () { return context; } };
  return {
    card: function (options) {
      rectangles.length = 0;
      images.length = 0;
      renderStickerCard(Object.assign({ canvas: canvas, assets: assets }, options));
      return { rectangles: rectangles.slice(), images: images.slice() };
    },
    draw: function (options) {
      rectangles.length = 0;
      images.length = 0;
      renderBoard(Object.assign({ canvas: canvas, assets: assets }, options));
      return { rectangles: rectangles.slice(), images: images.slice() };
    }
  };
}

function draw(options) {
  return drawingSurface().draw(options).rectangles;
}

test('Palette cards draw the same backing and character dimensions as board stickers', function () {
  for (let index = 0; index < content.levels.length; index += 1) {
    const level = getRuntimeLevel(content, index);
    for (const sticker of content.stickers) {
      const image = { name: sticker.id };
      const loaded = { images: { [sticker.src]: image }, stickers: assets.stickers };
      const placed = placeSticker(level, createLevelState(level), { stickerId: sticker.id, x: 0.5, y: 0.5 });
      const board = drawingSurface().draw({ level: level, assets: loaded, placements: placed.state.placements });
      const card = drawingSurface().card({ level: level, assets: loaded, stickerId: sticker.id });
      const mask = board.rectangles.find(function (r) { return r.color === sticker.color; });
      assert.deepEqual(card.rectangles[0].rect, [0, 0, mask.rect[2], mask.rect[3]]);
      assert.equal(card.rectangles[0].alpha, 1);
      assert.equal(mask.shape, sticker.shape);
      assert.equal(card.rectangles[0].shape, sticker.shape);
      const relativeArtwork = [board.images[0].rect[0] - mask.rect[0],
        board.images[0].rect[1] - mask.rect[1], board.images[0].rect[2], board.images[0].rect[3]];
      card.images[0].rect.forEach(function (value, part) {
        assert.ok(Math.abs(value - relativeArtwork[part]) < 1e-8, 'artwork geometry differs');
      });
    }
  }
});

test('Moving preview draws the existing sticker once and cancellation restores its old position', function () {
  const level = getRuntimeLevel(content, 0);
  const sticker = content.stickers[0];
  const image = {};
  const loaded = { images: { [sticker.src]: image }, stickers: assets.stickers };
  const placed = placeSticker(level, createLevelState(level), { stickerId: sticker.id, x: 0.2, y: 0.2 });
  const original = structuredClone(placed.state.placements);
  const surface = drawingSurface();
  const moving = surface.draw({ level: level, assets: loaded, placements: placed.state.placements,
    preview: { placementId: original[0].id, stickerId: sticker.id, x: 0.7, y: 0.6 } });
  const masks = moving.rectangles.filter(function (r) { return r.color === sticker.color; });
  assert.equal(masks.length, 1, 'the source must not remain as a second sticker');
  assert.equal(masks[0].alpha, 0.65);
  assert.equal(moving.images.length, 1);
  const restored = surface.draw({ level: level, assets: loaded, placements: placed.state.placements });
  const restoredMask = restored.rectangles.find(function (r) { return r.color === sticker.color; });
  assert.equal(restoredMask.alpha, 1);
  const rect = original[0].rect;
  assert.deepEqual(restoredMask.rect, [rect[0] * 360, rect[1] * 480, rect[2] * 360, rect[3] * 480]);
  assert.deepEqual(placed.state.placements, original);
});

test('Moving an underlying sticker preserves its layer in preview and after release', function () {
  const level = getRuntimeLevel(content, 0);
  const bottom = content.stickers[0];
  const top = content.stickers[1];
  const bottomImage = {};
  const topImage = {};
  const loaded = { images: { [bottom.src]: bottomImage, [top.src]: topImage }, stickers: assets.stickers };
  let state = placeSticker(level, createLevelState(level), { stickerId: bottom.id, x: 0.2, y: 0.2 }).state;
  state = placeSticker(level, state, { stickerId: top.id, x: 0.7, y: 0.6 }).state;
  const rendered = drawingSurface().draw({ level: level, assets: loaded, placements: state.placements,
    preview: { placementId: state.placements[0].id, stickerId: bottom.id, x: 0.7, y: 0.6 } });
  assert.deepEqual(rendered.images.map(function (item) { return item.image; }), [bottomImage, topImage]);
  assert.deepEqual(rendered.images.map(function (item) { return item.alpha; }), [0.65, 1]);
});

test('Dragging out previews removal without deleting state and cancellation restores the sticker', function () {
  const level = getRuntimeLevel(content, 0);
  const sticker = content.stickers[0];
  const image = {};
  const loaded = { images: { [sticker.src]: image }, stickers: assets.stickers };
  const placed = placeSticker(level, createLevelState(level), { stickerId: sticker.id, x: 0.5, y: 0.5 }).state;
  const original = structuredClone(placed.placements);
  const surface = drawingSurface();
  const outside = surface.draw({ level: level, assets: loaded, placements: placed.placements,
    preview: { placementId: placed.placements[0].id, stickerId: sticker.id, removing: true } });
  assert.equal(outside.images.length, 0);
  assert.equal(outside.rectangles.some(function (rect) { return rect.color === sticker.color; }), false);
  assert.deepEqual(placed.placements, original);
  const cancelled = surface.draw({ level: level, assets: loaded, placements: placed.placements });
  assert.equal(cancelled.images.length, 1);
  assert.equal(cancelled.images[0].alpha, 1);
  assert.deepEqual(placed.placements, original);
});

test('Fixed preview, placement and exported artwork match on all scenes, notes and board edges', function () {
  for (let index = 0; index < content.levels.length; index += 1) {
    const level = getRuntimeLevel(content, index);
    const notes = level.secrets.concat(level.keepZones.filter(function (zone) { return zone.style === 'note'; }));
    const points = notes.map(function (note) {
      return { x: note.rect[0] + note.rect[2] / 2, y: note.rect[1] + note.rect[3] / 2 };
    }).concat([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 },
      { x: 0.5, y: 0.05 }, { x: 0.5, y: 0.5 },
      { x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }
    ]);
    for (const sticker of content.stickers) {
      const image = { name: sticker.id };
      const loaded = { images: { [sticker.src]: image }, stickers: assets.stickers };
      for (const point of points) {
        const drop = Object.assign({ stickerId: sticker.id }, point);
        const placed = placeSticker(level, createLevelState(level), drop);
        assert.equal(placed.accepted, true);
        const surface = drawingSurface(true);
        const preview = surface.draw({ level: level, assets: loaded, placements: [], preview: drop });
        const committed = surface.draw({ level: level, assets: loaded, placements: placed.state.placements });
        const exported = drawingSurface().draw({ level: level, assets: loaded, placements: placed.state.placements });
        const mask = preview.rectangles.find(function (r) { return r.alpha === 0.65 && r.color === sticker.color; });
        const opaque = committed.rectangles.find(function (r) { return r.alpha === 1 && r.color === sticker.color; });
        const exportedMask = exported.rectangles.find(function (r) { return r.alpha === 1 && r.color === sticker.color; });
        assert.ok(mask, level.id + ': предпросмотр отсутствует');
        assert.ok(opaque, level.id + ': непрозрачная подложка отсутствует');
        assert.deepEqual(mask.rect.slice(2), (sticker.id === 'sock' ? [0.40 * 360, 0.16 * 480] : [0.30 * 360, 0.225 * 480]), level.id + ': preview size changed');
        assert.equal(mask.shape, sticker.shape);
        assert.equal(opaque.shape, sticker.shape);
        assert.equal(exportedMask.shape, sticker.shape);
        assert.deepEqual(mask.rect, opaque.rect, level.id + ': размер меняется после установки');
        assert.deepEqual(exportedMask.rect, opaque.rect, level.id + ': exported backing changed');
        assert.equal(preview.images.length, 1);
        assert.equal(committed.images.length, 1);
        assert.equal(exported.images.length, 1);
        assert.equal(preview.images[0].image, image);
        assert.deepEqual(preview.images[0].rect, committed.images[0].rect, level.id + ': placed artwork changed');
        assert.deepEqual(preview.images[0].rect, exported.images[0].rect, level.id + ': exported artwork changed');
      }
    }
  }
});

test('Предпросмотр вне кадра и с некорректными координатами не рисуется', function () {
  const level = getRuntimeLevel(content, 0);
  for (const point of [{ x: -0.1, y: 0.5 }, { x: 0.5, y: 1.1 }, { x: NaN, y: 0.5 }]) {
    const rectangles = draw({ level: level, placements: [], preview: Object.assign({ stickerId: 'sock' }, point) });
    assert.equal(rectangles.some(function (r) { return r.alpha === 0.65; }), false);
  }
});

test('Dragging a loaded preview into a note keeps the backing and artwork dimensions unchanged', function () {
  const epsilon = 0.00001;
  for (let index = 0; index < content.levels.length; index += 1) {
    const level = getRuntimeLevel(content, index);
    const notes = level.secrets.concat(level.keepZones.filter(function (zone) { return zone.style === 'note'; }));
    for (const sticker of content.stickers) {
      const loaded = { images: { [sticker.src]: { name: sticker.id } }, stickers: assets.stickers };
      const surface = drawingSurface(true);
      for (const note of notes) {
        const draws = [-epsilon, epsilon].map(function (offset) {
          return surface.draw({ level: level, assets: loaded, placements: [], preview: {
            stickerId: sticker.id, x: note.rect[0] + offset, y: note.rect[1] + note.rect[3] / 2
          } });
        });
        const masks = draws.map(function (rendered) {
          return rendered.rectangles.find(function (r) { return r.alpha === 0.65 && r.color === sticker.color; }).rect;
        });
        assert.deepEqual(masks[0].slice(2), (sticker.id === 'sock' ? [0.40 * 360, 0.16 * 480] : [0.30 * 360, 0.225 * 480]));
        assert.deepEqual(masks[1].slice(2), masks[0].slice(2), level.id + '/' + note.id + ': backing resized');
        assert.deepEqual(draws[1].images[0].rect.slice(2), draws[0].images[0].rect.slice(2),
          level.id + '/' + note.id + ': artwork resized');
        assert.ok(Math.abs(masks[1][0] - masks[0][0]) <= 2 * epsilon * 360 + 1e-9,
          level.id + '/' + note.id + ': preview jumped to the note');
      }
    }
  }
});

test('Artwork keeps its preview geometry after placement, repeated renders and export', function (t) {
  const originals = new Map(['window', 'performance', 'requestAnimationFrame'].map(function (key) {
    return [key, Object.getOwnPropertyDescriptor(globalThis, key)];
  }));
  let now = 0;
  const frames = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    matchMedia: function () { return { matches: false }; }
  } });
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: function () { return now; } } });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: function (callback) {
    frames.push(callback);
    return frames.length;
  } });
  t.after(function () {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const level = getRuntimeLevel(content, 0);
  const note = level.secrets[0];
  for (const sticker of content.stickers) {
    now = 0;
    const image = { name: sticker.id };
    const loaded = { images: { [sticker.src]: image }, stickers: assets.stickers };
    const surface = drawingSurface(true);
    const drop = { stickerId: sticker.id, x: note.rect[0] + note.rect[2] / 2, y: note.rect[1] + note.rect[3] / 2 };
    const placed = placeSticker(level, createLevelState(level), drop);
    assert.equal(placed.accepted, true);
    const preview = surface.draw({ level: level, assets: loaded, placements: [], preview: drop });
    assert.equal(preview.images.length, 1);
    assert.equal(preview.images[0].image, image);
    assert.equal(preview.images[0].alpha, 0.65);

    for (const elapsed of [0, 105, 240, 500]) {
      now = elapsed;
      const committed = surface.draw({ level: level, assets: loaded, placements: placed.state.placements });
      assert.equal(committed.images.length, 1);
      assert.equal(committed.images[0].alpha, 1);
      assert.deepEqual(committed.images[0].rect, preview.images[0].rect, sticker.id + ' changed at ' + elapsed + 'ms');
    }
    const exported = drawingSurface().draw({ level: level, assets: loaded, placements: placed.state.placements });
    assert.deepEqual(exported.images[0].rect, preview.images[0].rect, sticker.id + ' changed during export');
    const cleared = surface.draw({ level: level, assets: loaded, placements: [] });
    assert.deepEqual(cleared.images, []);
  }
  assert.deepEqual(frames, [], 'Rendering must not schedule later redraws with an obsolete state');
});

test('The backpack idea tag stays still while other tags can animate', function () {
  const level = getRuntimeLevel(content, 0);
  const note = level.keepZones.find(zone => zone.id === 'public_note');
  assert.equal(note.animate, false);
  const canvas = { width: 360, height: 480, getContext: () => new Proxy({
    measureText: text => ({ width: text.length * 5 })
  }, { get: (target, key) => key in target ? target[key] : function () {} }) };
  const onlyTag = { ...level, keepZones: [note], secrets: [] };
  assert.equal(renderBoard({ canvas, level: onlyTag, assets, animate: true }).animating, false);
  const animated = { ...onlyTag, keepZones: [{ ...note, animate: true }] };
  assert.equal(renderBoard({ canvas, level: animated, assets, animate: true }).animating, true);
});
