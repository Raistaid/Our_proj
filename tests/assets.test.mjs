import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssets } from '../game/src/assets.js';

function fixture(t) {
  const originals = new Map(['Image', 'document', 'setTimeout', 'clearTimeout'].map(function (key) {
    return [key, Object.getOwnPropertyDescriptor(globalThis, key)];
  }));
  const images = [];
  const timers = new Map();
  let nextTimer = 0;
  globalThis.document = { baseURI: 'https://example.test/nested/game/index.html' };
  globalThis.Image = class {
    constructor() { images.push(this); }
    succeed() { this.onload?.(); }
    fail() { this.onerror?.(); }
  };
  globalThis.setTimeout = function (callback, milliseconds) {
    assert.equal(milliseconds, 1000);
    const id = ++nextTimer;
    timers.set(id, callback);
    return id;
  };
  globalThis.clearTimeout = function (id) { timers.delete(id); };
  t.after(function () {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    images, timers,
    expire: function () {
      for (const callback of Array.from(timers.values())) callback();
    }
  };
}

const content = {
  stickers: [{ id: 'sock', src: './assets/sock.svg' }],
  levels: [{ background: './assets/room.svg' }]
};

test('quick image loads are returned without late-update notifications', async function (t) {
  const f = fixture(t);
  const updates = [];
  const pending = loadAssets(content, function (...args) { updates.push(args); });
  assert.equal(f.images[0].src, 'https://example.test/nested/game/assets/sock.svg');
  f.images.forEach(function (img) { img.succeed(); });
  const assets = await pending;
  assert.equal(assets.images['./assets/sock.svg'], f.images[0]);
  assert.equal(assets.images['./assets/room.svg'], f.images[1]);
  assert.equal(assets.stickers.sock, content.stickers[0]);
  assert.deepEqual(assets.missing, []);
  assert.deepEqual(updates, []);
  assert.equal(f.timers.size, 0);
});

test('timeout permits fallback startup and a late success updates the same assets', async function (t) {
  const f = fixture(t);
  const updates = [];
  const pending = loadAssets(content, function (...args) { updates.push(args); });
  f.images[1].succeed();
  f.expire();
  const assets = await pending;
  const missing = assets.missing;
  assert.deepEqual(missing, ['./assets/sock.svg']);
  assert.equal(assets.images['./assets/sock.svg'], undefined);
  assert.deepEqual(updates, []);

  f.images[0].succeed();
  assert.equal(assets.images['./assets/sock.svg'], f.images[0]);
  assert.equal(assets.missing, missing);
  assert.deepEqual(missing, []);
  assert.deepEqual(updates, [[assets, './assets/sock.svg']]);
  f.images[0].succeed();
  assert.equal(updates.length, 1);
  assert.equal(f.timers.size, 0);
});

test('an error returns fallback immediately and a late error does not duplicate missing paths', async function (t) {
  const f = fixture(t);
  const updates = [];
  const pending = loadAssets(content, function (...args) { updates.push(args); });
  f.images[0].fail();
  f.expire();
  const assets = await pending;
  assert.deepEqual(assets.missing, ['./assets/sock.svg', './assets/room.svg']);
  f.images[1].fail();
  assert.deepEqual(assets.missing, ['./assets/sock.svg', './assets/room.svg']);
  assert.deepEqual(assets.images, {});
  assert.deepEqual(updates, []);
  assert.equal(f.timers.size, 0);
});

test('a shared path is requested once and remains available for all sticker IDs', async function (t) {
  const f = fixture(t);
  const shared = './assets/shared.svg';
  const pending = loadAssets({
    stickers: [{ id: 'one', src: shared }, { id: 'two', src: shared }],
    levels: [{ background: shared }, { background: shared }]
  });
  assert.equal(f.images.length, 1);
  f.images[0].succeed();
  const assets = await pending;
  assert.equal(assets.images[shared], f.images[0]);
  assert.equal(assets.stickers.one.src, shared);
  assert.equal(assets.stickers.two.src, shared);
  assert.deepEqual(assets.missing, []);
});

test('a success after its timeout but before startup completes needs no update callback', async function (t) {
  const f = fixture(t);
  const updates = [];
  const pending = loadAssets(content, function (...args) { updates.push(args); });
  Array.from(f.timers.values())[0]();
  f.images[0].succeed();
  f.images[1].succeed();
  const assets = await pending;
  assert.equal(assets.images['./assets/sock.svg'], f.images[0]);
  assert.deepEqual(assets.missing, []);
  assert.deepEqual(updates, []);
});

test('a synchronous image setup error uses fallback rather than rejecting startup', async function (t) {
  const f = fixture(t);
  globalThis.Image = class {
    set src(_) { throw new Error('Image request could not be started'); }
  };
  const assets = await loadAssets(content);
  assert.deepEqual(assets.images, {});
  assert.deepEqual(assets.missing, ['./assets/sock.svg', './assets/room.svg']);
  assert.equal(f.timers.size, 0);
});
