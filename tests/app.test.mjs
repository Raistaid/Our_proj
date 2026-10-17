import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyLayout } from '../game/src/content.js';

// This harness exercises the real app, UI, input, renderer, export and bridge.
// Canvas drawing is recorded, not rasterized: device rendering and native sharing
// still need verification in the official application on a phone.
class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = new Map();
    this.classes = new Set();
    this.capturedPointers = new Set();
    const properties = new Map();
    this.style = {
      setProperty: (name, value) => properties.set(name, String(value)),
      getPropertyValue: name => properties.get(name) || ''
    };
    this.hidden = false;
    this.disabled = false;
    this.width = 360;
    this.height = 480;
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classes.has(name) : force;
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
        return enabled;
      }
    };
    if (this.tagName === 'canvas') {
      this.calls = [];
      this.context = new Proxy({
        measureText: text => ({ width: String(text).length * 6 })
      }, {
        get: (context, name) => {
          if (name in context) return context[name];
          return (...args) => this.calls.push({ name, args, strokeStyle: context.strokeStyle });
        }
      });
    }
  }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text || ''; }
  set src(value) { this.setAttribute('src', value); }
  get src() { return this.getAttribute('src'); }
  get isConnected() { return Boolean(this.parentElement); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.ownerDocument.ids.set(value, this);
    if (name === 'class') this.className = value;
    if (name === 'hidden' || name === 'disabled') this[name] = true;
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
  }
  getAttribute(name) {
    if (name.startsWith('data-')) {
      return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? null;
    }
    return this.attributes[name] ?? null;
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  matches(selector) {
    if (selector[0] === '.') return this.classes.has(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:=([^\]]+))?\]$/);
    if (attribute) {
      const value = this.getAttribute(attribute[1]);
      return value !== null && (attribute[2] === undefined || value === attribute[2]);
    }
    return this.tagName === selector;
  }
  closest(selector) {
    return this.matches(selector) ? this : this.parentElement?.closest(selector) || null;
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
  getBoundingClientRect() {
    if (this.classes.has('sticker-thumbnail')) {
      const style = this.ownerDocument.getElementById('palette').style;
      return { left: 0, top: 500,
        width: parseFloat(style.getPropertyValue('--sticker-width')) || 158.4,
        height: parseFloat(style.getPropertyValue('--sticker-height')) || 86.4 };
    }
    return this.bounds || { left: 0, top: 0, width: 360, height: 480 };
  }
  setPointerCapture(pointerId) { this.capturedPointers.add(pointerId); }
  hasPointerCapture(pointerId) { return this.capturedPointers.has(pointerId); }
  releasePointerCapture(pointerId) { this.capturedPointers.delete(pointerId); }
  getContext(type) { assert.equal(type, '2d'); return this.context; }
  toDataURL(type) {
    this.exportType = type;
    // createPoster validates the PNG data URL. A real PNG encoder is outside this harness.
    return 'data:image/png;base64,' + 'a'.repeat(2196) +
      String(this.ownerDocument.canvases.length).padStart(4, '0');
  }
}

function makeDocument(html) {
  const document = {
    ids: new Map(), canvases: [], hidden: false,
    baseURI: 'https://game.example/subfolder/game/',
    createElement(tagName) {
      const element = new Element(tagName, this);
      if (tagName === 'canvas') this.canvases.push(element);
      return element;
    },
    getElementById(id) { return this.ids.get(id) || null; },
    addEventListener() {}
  };
  const stack = [document.createElement('html')];
  const voidTags = new Set(['meta', 'link', 'img', 'input', 'br', 'hr']);
  for (const match of html.matchAll(/<\/?([a-z][\w-]*)([^>]*)>/gi)) {
    const tag = match[1].toLowerCase();
    if (match[0].startsWith('</')) { if (!voidTags.has(tag)) stack.pop(); continue; }
    const element = document.createElement(tag);
    for (const attribute of match[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
      element.setAttribute(attribute[1], attribute[2] || '');
    }
    stack.at(-1).appendChild(element);
    if (!voidTags.has(tag)) stack.push(element);
  }
  return document;
}

test('real app: sticker movement/removal, hints, undo, all frames, poster, sharing and replay', async t => {
  const [html, rawContent] = await Promise.all([
    readFile(new URL('../game/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../game/data/content.json', import.meta.url), 'utf8')
  ]);
  const content = JSON.parse(rawContent);
  assert.equal(content.levels.length, 7);
  const document = makeDocument(html);
  const messages = [];
  const frames = new Map();
  const loadedImages = [];
  const windowListeners = new Map();
  const initialTimers = new Map();
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const delayedPath = new URL(content.levels.at(-1).background, document.baseURI).href;
  let delayedImage = null;
  let frameId = 0;
  const requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  function flushFrames() {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(0));
  }
  const globals = {
    document,
    window: {
      devicePixelRatio: 1, requestAnimationFrame,
      matchMedia: () => ({ matches: true }),
      addEventListener(type, handler) {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type).push(handler);
      },
      postMessage: (message, origin) => { assert.equal(origin, '*'); messages.push(message); },
      location: { reload() { assert.fail('Unexpected page reload'); } }
    },
    requestAnimationFrame,
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, milliseconds, ...args) => {
      if (milliseconds !== 1000) return nativeSetTimeout(callback, milliseconds, ...args);
      const id = {};
      initialTimers.set(id, callback);
      return id;
    },
    clearTimeout: id => {
      if (initialTimers.has(id)) initialTimers.delete(id);
      else nativeClearTimeout(id);
    },
    Image: class {
      set src(value) {
        this.url = value;
        this.complete = true;
        this.naturalWidth = 360;
        this.naturalHeight = 480;
        loadedImages.push(value);
        if (value === delayedPath) delayedImage = this;
        else queueMicrotask(() => this.onload?.());
      }
      get src() { return this.url; }
    },
    fetch: async url => {
      assert.equal(url, './data/content.json');
      return { ok: true, json: async () => JSON.parse(rawContent) };
    }
  };
  const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  const root = document.getElementById('app');
  const board = document.getElementById('board');
  const byId = id => document.getElementById(id);
  function click(action) {
    const button = root.querySelector('[data-action=' + action + ']');
    assert.ok(button, 'button exists: ' + action);
    root.dispatch('click', { target: button });
    flushFrames();
  }
  function pointer(type, x, y) {
    const bounds = board.getBoundingClientRect();
    root.dispatch(type, { target: board, pointerId: 1, pointerType: 'touch', isPrimary: true,
      button: 0, clientX: bounds.left + x * bounds.width,
      clientY: bounds.top + y * bounds.height, preventDefault() {} });
    flushFrames();
  }
  function tap(rect) {
    const x = rect[0] + rect[2] / 2;
    const y = rect[1] + rect[3] / 2;
    pointer('pointerdown', x, y);
    pointer('pointerup', x, y);
  }
  function stickerMasks() {
    return board.calls.filter(call => call.name === 'fillRect' &&
      Math.abs(call.args[2] - content.defaultStickerSize.w * 360) < 1e-8 &&
      Math.abs(call.args[3] - content.defaultStickerSize.h * 480) < 1e-8).map(call => call.args);
  }
  function assertPaletteMatches(selectedId = content.stickers[0].id) {
    const buttons = byId('palette').querySelectorAll('button');
    const thumbnails = byId('palette').querySelectorAll('canvas');
    assert.equal(buttons.length, content.stickers.length);
    assert.equal(thumbnails.length, content.stickers.length);
    thumbnails.forEach((thumbnail, stickerIndex) => {
      const sticker = content.stickers[stickerIndex];
      const bounds = thumbnail.getBoundingClientRect();
      assert.equal(bounds.width, board.getBoundingClientRect().width * content.defaultStickerSize.w);
      assert.equal(bounds.height, board.getBoundingClientRect().height * content.defaultStickerSize.h);
      assert.equal(thumbnail.width, Math.round(bounds.width));
      assert.equal(thumbnail.height, Math.round(bounds.height));
      assert.equal(thumbnail.getAttribute('aria-hidden'), 'true');
      assert.ok(thumbnail.calls.some(call => call.name === 'drawImage' &&
        call.args[0].src === new URL(sticker.src, document.baseURI).href),
      'palette cards render the sticker artwork');
    });
    buttons.forEach((button, stickerIndex) => {
      const sticker = content.stickers[stickerIndex];
      assert.equal(button.dataset.stickerId, sticker.id);
      assert.equal(button.querySelector('span').textContent, sticker.shortLabel || sticker.label);
      assert.equal(button.getAttribute('aria-pressed'), String(sticker.id === selectedId));
      assert.equal(button.classes.has('selected'), false);
    });
  }
  async function settleUntil(predicate) {
    for (let tries = 0; tries < 100; tries += 1) {
      await new Promise(resolve => setImmediate(resolve));
      flushFrames();
      if (predicate()) return;
    }
    assert.fail('Application did not reach the expected state');
  }
  const count = type => messages.filter(message => message.type === type).length;

  await import('../game/src/app.js');
  await settleUntil(() => delayedImage && initialTimers.size === 1);
  for (const callback of [...initialTimers.values()]) callback();
  await settleUntil(() => root.dataset.screen === 'start');
  assert.ok(loadedImages.length > 0);
  assert.ok(loadedImages.every(url => url.startsWith(document.baseURI + 'assets/')),
    'images resolve relative to a deployed subfolder');

  // variant: which replay layout the app shows (0 = original, 1 = first replay…).
  async function playSession(exerciseMistakes, variant = 0) {
    for (let index = 0; index < content.levels.length; index += 1) {
      const level = applyLayout(content.levels[index], variant);
      assert.equal(root.dataset.screen, 'playing');
      assert.equal(byId('level-title').textContent, level.title);
      assertPaletteMatches();
      if (exerciseMistakes && index === 0) {
        const choices = byId('palette').querySelectorAll('button');
        root.dispatch('click', { target: choices[1].querySelector('canvas') });
        flushFrames();
        assertPaletteMatches(content.stickers[1].id);
        root.dispatch('click', { target: choices[0] });
        flushFrames();
        assertPaletteMatches();
        const originalBounds = board.getBoundingClientRect();
        board.bounds = { left: 0, top: 0, width: 270, height: 360 };
        for (const handler of windowListeners.get('resize')) handler({});
        flushFrames();
        assertPaletteMatches();
        board.bounds = originalBounds;
        for (const handler of windowListeners.get('resize')) handler({});
        flushFrames();
        assertPaletteMatches();
        const publicNote = level.keepZones.find(zone => zone.id === 'public_note');
        assert.ok(publicNote);
        board.calls.length = 0;
        tap(publicNote.rect);
        const originalMask = stickerMasks().at(-1);
        assert.ok(originalMask);
        const grab = { x: publicNote.rect[0] + publicNote.rect[2] / 2 + 0.04,
          y: publicNote.rect[1] + publicNote.rect[3] / 2 + 0.02 };
        board.calls.length = 0;
        pointer('pointerdown', grab.x, grab.y);
        assert.deepEqual(stickerMasks().at(-1), originalMask,
          'grabbing an existing sticker away from its center must not make it jump');
        pointer('pointerup', grab.x, grab.y);
        assert.equal(byId('sticker-count').textContent, '1 / ' + level.maxStickers,
          'tapping an existing sticker does not add another sticker');
        const secret = level.secrets[0].rect;
        // Aim at the secret's own centre so the test follows the scene data, not a fixed spot.
        const destination = { x: secret[0] + secret[2] / 2, y: secret[1] + secret[3] / 2 };
        pointer('pointerdown', grab.x, grab.y);
        pointer('pointermove', destination.x + 0.04, destination.y + 0.02);
        board.calls.length = 0;
        pointer('pointerup', destination.x + 0.04, destination.y + 0.02);
        assert.equal(byId('sticker-count').textContent, '1 / ' + level.maxStickers,
          'moving a sticker keeps the sticker count unchanged');
        const movedMask = stickerMasks().at(-1);
        assert.ok(Math.abs((movedMask[0] + movedMask[2] / 2) / 360 - destination.x) < 1e-8);
        assert.ok(Math.abs((movedMask[1] + movedMask[3] / 2) / 480 - destination.y) < 1e-8);
        click('hint');
        assert.equal(byId('feedback-text').textContent, level.secrets[1].why,
          'moving from the ordinary note to the first secret fixes both areas');
        board.calls.length = 0;
        click('undo');
        assert.deepEqual(stickerMasks().at(-1), originalMask, 'undo restores the previous sticker position');
        assert.equal(byId('sticker-count').textContent, '1 / ' + level.maxStickers);
        pointer('pointerdown', grab.x, grab.y);
        board.calls.length = 0;
        pointer('pointermove', 1.2, grab.y);
        assert.deepEqual(stickerMasks(), [], 'the sticker is hidden while its removal is previewed');
        assert.equal(byId('sticker-count').textContent, '1 / ' + level.maxStickers,
          'previewing removal does not commit it');
        assert.equal(byId('feedback-text').textContent, 'Отпусти за кадром, чтобы убрать наклейку.');
        assert.equal(byId('feedback').dataset.kind, 'warning');
        board.calls.length = 0;
        pointer('pointercancel', 1.2, grab.y);
        assert.deepEqual(stickerMasks().at(-1), originalMask,
          'cancelling outside the board restores the existing sticker');
        assert.equal(byId('sticker-count').textContent, '1 / ' + level.maxStickers);

        pointer('pointerdown', grab.x, grab.y);
        pointer('pointermove', 1.2, grab.y);
        board.calls.length = 0;
        for (const handler of windowListeners.get('resize')) handler({});
        flushFrames();
        pointer('pointerup', 1.2, grab.y);
        assert.deepEqual(stickerMasks().at(-1), originalMask,
          'resize cancels a pending removal and a later pointerup cannot delete');
        assert.equal(byId('sticker-count').textContent, '1 / ' + level.maxStickers);

        pointer('pointerdown', grab.x, grab.y);
        pointer('pointermove', 1.2, grab.y);
        pointer('pointermove', destination.x + 0.04, destination.y + 0.02);
        board.calls.length = 0;
        pointer('pointerup', destination.x + 0.04, destination.y + 0.02);
        assert.equal(byId('sticker-count').textContent, '1 / ' + level.maxStickers,
          'returning inside before release moves the sticker instead of deleting it');
        const returnedMask = stickerMasks().at(-1);
        assert.ok(Math.abs((returnedMask[0] + returnedMask[2] / 2) / 360 - destination.x) < 1e-8);
        assert.ok(Math.abs((returnedMask[1] + returnedMask[3] / 2) / 480 - destination.y) < 1e-8);
        board.calls.length = 0;
        click('undo');
        assert.deepEqual(stickerMasks().at(-1), originalMask);

        pointer('pointerdown', grab.x, grab.y);
        pointer('pointermove', 1.2, grab.y);
        board.calls.length = 0;
        pointer('pointerup', 1.2, grab.y);
        assert.equal(byId('sticker-count').textContent, '0 / ' + level.maxStickers,
          'releasing outside removes the existing sticker');
        assert.deepEqual(stickerMasks(), [], 'the removed sticker no longer renders');
        assert.equal(byId('undo-button').disabled, false);
        board.calls.length = 0;
        click('undo');
        assert.deepEqual(stickerMasks().at(-1), originalMask,
          'undo restores a removed sticker at its previous position');
        assert.equal(byId('sticker-count').textContent, '1 / ' + level.maxStickers);
        click('check');
        assert.equal(root.dataset.screen, 'playing');
        assert.equal(byId('feedback').dataset.kind, 'warning');
        board.calls.length = 0;
        click('hint');
        assert.equal(byId('feedback-text').textContent, publicNote.hint);
        assert.equal(board.calls.filter(call => call.name === 'strokeRect' && call.strokeStyle === '#7a398d').length, 0,
          'a hint about a blocked ordinary note must not highlight a different secret');
        click('undo');
        assert.equal(byId('sticker-count').textContent, '0 / ' + level.maxStickers);
        assert.equal(byId('undo-button').disabled, true);
        board.calls.length = 0;
        click('hint');
        assert.equal(byId('feedback-text').textContent, level.secrets[0].why);
        assert.equal(board.calls.filter(call => call.name === 'strokeRect' && call.strokeStyle === '#7a398d').length, 1,
          'after undo the hint may highlight the missing secret');
      }
      if (exerciseMistakes && level.mode === 'transfer') {
        assert.equal(byId('hint-button').disabled, true);
        click('check');
        assert.equal(byId('hint-button').disabled, false);
      }
      level.secrets.forEach(secret => tap(secret.rect));
      click('check');
      assert.equal(root.dataset.screen, 'levelPassed', 'passed frame ' + level.id);
      assert.equal(byId('check-button').disabled, true);
      assert.equal(byId('undo-button').disabled, true);
      const placedCount = byId('sticker-count').textContent;
      board.calls.length = 0;
      const firstSecret = level.secrets[0].rect;
      pointer('pointerdown', firstSecret[0] + firstSecret[2] / 2,
        firstSecret[1] + firstSecret[3] / 2);
      pointer('pointermove', 0.5, 0.5);
      pointer('pointermove', 1.2, 0.5);
      pointer('pointerup', 1.2, 0.5);
      assert.equal(board.calls.length, 0, 'a passed frame ignores attempts to move or remove existing stickers');
      tap(level.keepZones[0].rect);
      click('undo');
      assert.equal(byId('sticker-count').textContent, placedCount,
        'a passed frame cannot be changed');
      click('next');
    }
    await settleUntil(() => root.dataset.screen === 'result' && !byId('share-button').disabled);
    const poster = document.canvases.at(-1);
    assert.notEqual(poster, board);
    assert.equal(poster.width, 720);
    assert.equal(poster.height, 960);
    assert.equal(poster.exportType, 'image/png');
    assert.equal(byId('poster-image').hidden, false);
    assert.match(byId('poster-image').src, /^data:image\/png;base64,/);
    const expectedTotal = content.levels.reduce((sum, level) => sum + level.secrets.length, 0);
    assert.match(byId('sticker-summary').textContent, new RegExp('Всего наклеек: ' + expectedTotal + '\\.'));
  }

  click('start');
  await playSession(true);
  assert.equal(count('COMPLETED_EVENT'), 1);
  assert.equal(count('FINISH_EVENT'), 1);
  assert.equal(count('VIBRATION_EVENT'), content.levels.length);
  const firstPoster = document.canvases.at(-1);
  const firstPosterUrl = byId('poster-image').src;
  assert.equal(firstPoster.calls.some(call => call.name === 'drawImage' && call.args[0] === delayedImage), false);
  const canvasCount = document.canvases.length;
  delayedImage.onload();
  assert.equal(byId('share-button').disabled, true, 'sharing waits for an updated poster');
  await settleUntil(() => !byId('share-button').disabled);
  assert.equal(document.canvases.length, canvasCount + 1, 'late image rebuilds the poster');
  assert.notEqual(byId('poster-image').src, firstPosterUrl);
  assert.equal(document.canvases.at(-1).calls.some(call =>
    call.name === 'drawImage' && call.args[0] === delayedImage), true);
  assert.equal(count('COMPLETED_EVENT'), 1, 'poster refresh must not award completion again');
  assert.equal(count('FINISH_EVENT'), 1, 'poster refresh must not send FINISH_EVENT again');
  click('share');
  assert.equal(count('SHARING_EVENT'), 1);
  assert.equal(messages.find(message => message.type === 'SHARING_EVENT').image, byId('poster-image').src);

  click('replay');
  // A replay moves the notes, so it has to be read again rather than remembered.
  assert.ok(content.levels.some(function (level) {
    return JSON.stringify(applyLayout(level, 1).secrets.map(s => s.rect)) !==
      JSON.stringify(level.secrets.map(s => s.rect));
  }), 'replay uses another layout of the notes');
  await playSession(false, 1);
  assert.equal(count('COMPLETED_EVENT'), 1, 'replay must not award completion again');
  assert.equal(count('FINISH_EVENT'), 1, 'replay must not send FINISH_EVENT again');
  assert.equal(count('VIBRATION_EVENT'), content.levels.length * 2);
  click('share');
  assert.equal(count('SHARING_EVENT'), 2);
  click('close');
  assert.equal(count('CLOSE_EVENT'), 1);
  assert.equal(root.dataset.screen, 'start');
});
