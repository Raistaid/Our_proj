import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../game/src/input.js';

function fixture() {
  const listeners = {};
  const drops = [];
  const previews = [];
  let selected = 'sock';
  let enabled = true;
  const canvas = { getBoundingClientRect: function () { return { left: 20, top: 30, width: 180, height: 240 }; } };
  const root = {
    addEventListener: function (name, fn) { listeners[name] = fn; },
    setPointerCapture: function () {}, hasPointerCapture: function () { return false; }
  };
  const input = bindInput({
    rootElement: root, canvas: canvas, enabled: function () { return enabled; },
    selectedSticker: function () { return selected; },
    onSelect: function (id) { selected = id; },
    onPreview: function (p) { previews.push(p); }, onDrop: function (p) { drops.push(p); }
  });
  function emit(type, extra) {
    listeners[type](Object.assign({ target: canvas, clientX: 110, clientY: 150,
      pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0,
      preventDefault: function () {} }, extra));
  }
  const palette = { dataset: { stickerId: 'cloud' } };
  const paletteTarget = { closest: function () { return palette; } };
  return { emit: emit, drops: drops, previews: previews, input: input, paletteTarget: paletteTarget,
    disable: function () { enabled = false; } };
}
test('Тап по масштабированному Canvas даёт относительные координаты', function () {
  const f = fixture();
  f.emit('pointerdown'); f.emit('pointerup');
  assert.deepEqual(f.drops, [{ stickerId: 'sock', x: 0.5, y: 0.5 }]);
});
test('Тап по палитре только выбирает; перетаскивание добавляет наклейку', function () {
  const f = fixture();
  f.emit('pointerdown', { target: f.paletteTarget, clientY: 300 });
  f.emit('pointerup', { target: f.paletteTarget, clientY: 300 });
  assert.equal(f.drops.length, 0);
  f.emit('pointerdown', { target: f.paletteTarget, clientY: 300 });
  f.emit('pointermove'); f.emit('pointerup');
  assert.deepEqual(f.drops, [{ stickerId: 'cloud', x: 0.5, y: 0.5 }]);
});
test('Сброс жеста при повороте, pointercancel и уход за кадр не создают ход', function () {
  const f = fixture();
  f.emit('pointerdown'); f.input.cancel(); f.emit('pointerup');
  f.emit('pointerdown'); f.emit('pointercancel'); f.emit('pointerup');
  f.emit('pointerdown'); f.emit('pointerup', { clientX: 500 });
  assert.equal(f.drops.length, 0);
  assert.equal(f.previews.at(-1), null);
});
test('Второй палец не завершает жест первого; выключенный ввод не срабатывает', function () {
  const f = fixture();
  f.emit('pointerdown');
  f.emit('pointerdown', { pointerId: 2, isPrimary: false });
  f.emit('pointerup', { pointerId: 2, isPrimary: false });
  assert.equal(f.drops.length, 0);
  f.emit('pointerup');
  assert.equal(f.drops.length, 1);
  f.disable();
  f.emit('pointerdown'); f.emit('pointerup');
  assert.equal(f.drops.length, 1);
});
