import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../game/src/input.js';

function fixture(options = {}) {
  const listeners = {};
  const drops = [];
  const previews = [];
  const moves = [];
  const removals = [];
  const captures = new Set();
  const releases = [];
  let selected = options.selectedSticker === undefined ? 'sock' : options.selectedSticker;
  let enabled = true;
  let bounds = { left: 20, top: 30, width: 180, height: 240 };
  const canvas = { getBoundingClientRect: function () { return bounds; } };
  const root = {
    addEventListener: function (name, fn) { listeners[name] = fn; },
    setPointerCapture: function (pointerId) { captures.add(pointerId); },
    hasPointerCapture: function (pointerId) { return captures.has(pointerId); },
    releasePointerCapture: function (pointerId) {
      assert.equal(captures.delete(pointerId), true);
      releases.push(pointerId);
      // A synchronous event also exercises cancellation reentrancy.
      listeners.lostpointercapture({ pointerId: pointerId });
    }
  };
  const input = bindInput({
    rootElement: root, canvas: canvas, enabled: function () { return enabled; },
    selectedSticker: function () { return selected; },
    hitTest: options.hitTest,
    onMove: function (item) { moves.push(item); },
    onRemove: function (item) {
      removals.push(item);
      if (options.onRemove) options.onRemove(item);
    },
    onSelect: function (id) { selected = id; },
    onPreview: function (p) { previews.push(p); }, onDrop: function (p) { drops.push(p); }
  });
  function emit(type, extra) {
    const event = Object.assign({ target: canvas, clientX: 110, clientY: 150,
      pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0,
      preventDefault: function () {} }, extra);
    if (type === 'lostpointercapture') captures.delete(event.pointerId);
    listeners[type](event);
  }
  const palette = { dataset: { stickerId: 'cloud' } };
  const paletteTarget = { closest: function () { return palette; } };
  return { emit: emit, drops: drops, previews: previews, moves: moves, removals: removals,
    input: input, paletteTarget: paletteTarget,
    captures: captures, releases: releases,
    setBounds: function (changes) { bounds = Object.assign({}, bounds, changes); },
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

for (const type of ['pointercancel', 'lostpointercapture']) {
  test(type + ' другого пальца не сбрасывает активный жест', function () {
    const f = fixture();
    f.emit('pointerdown');
    const previewCount = f.previews.length;
    f.emit(type, { pointerId: 2, isPrimary: false });
    assert.equal(f.previews.length, previewCount);
    assert.equal(f.captures.has(1), true);
    f.emit('pointermove', { clientX: 155 });
    assert.deepEqual(f.previews.at(-1), { stickerId: 'sock', x: 0.75, y: 0.5 });
    f.emit('pointerup');
    assert.equal(f.drops.length, 1);
    assert.deepEqual(f.releases, [1]);
  });

  test(type + ' активного пальца отменяет жест и очищает захват', function () {
    const f = fixture();
    f.emit('pointerdown');
    const previewCount = f.previews.length;
    f.emit(type);
    assert.equal(f.previews.length, previewCount + 1);
    assert.equal(f.previews.at(-1), null);
    assert.equal(f.captures.size, 0);
    assert.deepEqual(f.releases, type === 'pointercancel' ? [1] : []);
    f.emit('pointermove');
    f.emit('pointerup');
    assert.equal(f.previews.length, previewCount + 1);
    assert.equal(f.drops.length, 0);
    f.emit('pointerdown');
    f.emit('pointerup');
    assert.equal(f.drops.length, 1);
  });
}

test('Программная отмена освобождает захват без повторной очистки предпросмотра', function () {
  const f = fixture();
  f.emit('pointerdown');
  const previewCount = f.previews.length;
  f.input.cancel();
  assert.equal(f.previews.length, previewCount + 1);
  assert.equal(f.previews.at(-1), null);
  assert.equal(f.captures.size, 0);
  assert.deepEqual(f.releases, [1]);
  f.emit('pointerup');
  assert.equal(f.drops.length, 0);
});

test('Попадание в верхнюю наклейку выбирает перемещение, а не добавление выбранной', function () {
  const placements = [
    Object.freeze({ id: 'bottom', stickerId: 'sock', rect: Object.freeze([0.25, 0.25, 0.5, 0.5]) }),
    Object.freeze({ id: 'top', stickerId: 'cloud', rect: Object.freeze([0.375, 0.375, 0.25, 0.25]) })
  ];
  const hits = [];
  const f = fixture({ selectedSticker: '', hitTest: function (p) {
    hits.push(p);
    return placements.slice().reverse().find(function (item) {
      const r = item.rect;
      return p.x >= r[0] && p.x <= r[0] + r[2] && p.y >= r[1] && p.y <= r[1] + r[3];
    }) || null;
  } });
  f.emit('pointerdown');
  assert.deepEqual(f.previews.at(-1), { placementId: 'top', stickerId: 'cloud', x: 0.5, y: 0.5 });
  f.emit('pointermove', { clientX: 155 });
  assert.equal(f.moves.length, 0, 'the placement is unchanged until release');
  f.emit('pointerup', { clientX: 155 });
  assert.deepEqual(hits, [{ x: 0.5, y: 0.5 }], 'hit testing is delegated once at gesture start');
  assert.deepEqual(f.moves, [{ placementId: 'top', stickerId: 'cloud', x: 0.75, y: 0.5 }]);
  assert.equal(f.drops.length, 0);
  assert.deepEqual(placements[1].rect, [0.375, 0.375, 0.25, 0.25]);
});

test('Перемещение за край наклейки сохраняет смещение захвата и не меняет исходный rect', function () {
  const placement = Object.freeze({ id: 'p1', stickerId: 'cloud', rect: Object.freeze([0.25, 0.25, 0.5, 0.25]) });
  const f = fixture({ hitTest: function () { return placement; } });
  f.emit('pointerdown', { clientX: 132.5, clientY: 150 });
  assert.deepEqual(f.previews.at(-1), { placementId: 'p1', stickerId: 'cloud', x: 0.5, y: 0.375 });
  f.emit('pointermove', { clientX: 177.5, clientY: 210 });
  assert.deepEqual(f.previews.at(-1), { placementId: 'p1', stickerId: 'cloud', x: 0.75, y: 0.625 });
  assert.equal(f.moves.length, 0);
  f.emit('pointerup', { clientX: 177.5, clientY: 210 });
  assert.deepEqual(f.moves, [{ placementId: 'p1', stickerId: 'cloud', x: 0.75, y: 0.625 }]);
  assert.deepEqual(placement.rect, [0.25, 0.25, 0.5, 0.25]);
  assert.equal(f.drops.length, 0);
});

test('Обычный тап и движение до порога по установленной наклейке не создают ход', function () {
  const f = fixture({ hitTest: function () {
    return { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] };
  } });
  f.emit('pointerdown'); f.emit('pointerup');
  f.emit('pointerdown'); f.emit('pointermove', { clientX: 115 }); f.emit('pointerup', { clientX: 115 });
  assert.equal(f.moves.length, 0);
  assert.equal(f.drops.length, 0);
  assert.equal(f.previews.at(-1), null);
});

test('Смещение захвата ограничивает центр кадром, а отпускание вне кадра удаляет наклейку', function () {
  const f = fixture({ hitTest: function () {
    return { id: 'p1', stickerId: 'cloud', rect: [0.25, 0.25, 0.5, 0.25] };
  } });
  f.emit('pointerdown', { clientX: 132.5, clientY: 150 });
  f.emit('pointermove', { clientX: 20, clientY: 30 });
  assert.deepEqual(f.previews.at(-1), { placementId: 'p1', stickerId: 'cloud', x: 0, y: 0 });
  f.emit('pointerup', { clientX: 20, clientY: 30 });
  assert.deepEqual(f.moves, [{ placementId: 'p1', stickerId: 'cloud', x: 0, y: 0 }]);
  f.emit('pointerdown', { clientX: 87.5, clientY: 90 });
  f.emit('pointermove', { clientX: 200, clientY: 270 });
  assert.deepEqual(f.previews.at(-1), { placementId: 'p1', stickerId: 'cloud', x: 1, y: 1 });
  f.emit('pointerup', { clientX: 200, clientY: 270 });
  assert.deepEqual(f.moves.at(-1), { placementId: 'p1', stickerId: 'cloud', x: 1, y: 1 });
  f.emit('pointerdown');
  f.emit('pointermove', { clientX: 500 });
  assert.deepEqual(f.previews.at(-1), { placementId: 'p1', stickerId: 'cloud', removing: true });
  assert.equal(f.removals.length, 0, 'leaving the board alone does not remove the placement');
  f.emit('pointerup', { clientX: 500 });
  assert.equal(f.moves.length, 2);
  assert.deepEqual(f.removals, [{ placementId: 'p1', stickerId: 'cloud' }]);
  assert.equal(f.drops.length, 0);
});

for (const cancellation of ['pointercancel', 'lostpointercapture', 'manual', 'disabled']) {
  test('Перемещение отменяется: ' + cancellation, function () {
    const f = fixture({ hitTest: function () {
      return { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] };
    } });
    f.emit('pointerdown');
    f.emit('pointermove', { clientX: 155 });
    if (cancellation === 'manual') f.input.cancel();
    else if (cancellation === 'disabled') f.disable();
    else f.emit(cancellation);
    f.emit('pointerup', { clientX: 155 });
    assert.equal(f.moves.length, 0);
    assert.equal(f.removals.length, 0);
    assert.equal(f.drops.length, 0);
    assert.equal(f.previews.at(-1), null);
    assert.equal(f.captures.size, 0);
  });
}

test('Чужие касания не сбрасывают перенос, а промах hitTest сохраняет добавление', function () {
  const f = fixture({ hitTest: function (p) {
    return p.x === 0.5 ? { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] } : null;
  } });
  f.emit('pointerdown');
  f.emit('pointerdown', { pointerId: 2, isPrimary: false });
  f.emit('pointercancel', { pointerId: 2, isPrimary: false });
  f.emit('lostpointercapture', { pointerId: 2, isPrimary: false });
  f.emit('pointerup', { pointerId: 2, isPrimary: false });
  f.emit('pointermove', { clientX: 155 });
  f.emit('pointerup', { clientX: 155 });
  assert.deepEqual(f.moves, [{ placementId: 'p1', stickerId: 'cloud', x: 0.75, y: 0.5 }]);
  f.emit('pointerdown', { clientX: 65 });
  f.emit('pointerup', { clientX: 65 });
  assert.deepEqual(f.drops, [{ stickerId: 'sock', x: 0.25, y: 0.5 }]);
});

test('Заблокированный кадр не начинает перенос и не вызывает hitTest', function () {
  const f = fixture({ hitTest: function () { assert.fail('Locked input must not hit test'); } });
  f.disable();
  f.emit('pointerdown');
  f.emit('pointermove', { clientX: 155 });
  f.emit('pointerup', { clientX: 155 });
  assert.equal(f.previews.length, 0);
  assert.equal(f.moves.length, 0);
  assert.equal(f.drops.length, 0);
});

test('Возврат установленной наклейки в кадр после выхода продолжает перенос', function () {
  const f = fixture({ hitTest: function () {
    return { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] };
  } });
  f.emit('pointerdown');
  f.emit('pointermove', { clientX: 500 });
  assert.deepEqual(f.previews.at(-1), { placementId: 'p1', stickerId: 'cloud', removing: true });
  f.emit('pointermove', { clientX: 155 });
  assert.deepEqual(f.previews.at(-1), { placementId: 'p1', stickerId: 'cloud', x: 0.75, y: 0.5 });
  f.emit('pointerup', { clientX: 155 });
  assert.deepEqual(f.moves, [{ placementId: 'p1', stickerId: 'cloud', x: 0.75, y: 0.5 }]);
  assert.equal(f.removals.length, 0);
  assert.equal(f.drops.length, 0);
});

for (const cancellation of ['pointercancel', 'lostpointercapture', 'manual', 'disabled']) {
  test('Отмена вне кадра не удаляет наклейку: ' + cancellation, function () {
    const f = fixture({ hitTest: function () {
      return { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] };
    } });
    f.emit('pointerdown');
    f.emit('pointermove', { clientX: 500 });
    if (cancellation === 'manual') f.input.cancel();
    else if (cancellation === 'disabled') f.disable();
    else f.emit(cancellation, { clientX: 500 });
    f.emit('pointerup', { clientX: 500 });
    assert.equal(f.removals.length, 0);
    assert.equal(f.moves.length, 0);
    assert.equal(f.drops.length, 0);
    assert.equal(f.previews.at(-1), null);
  });
}

test('Отпускание второго пальца за кадром не удаляет наклейку первого', function () {
  const f = fixture({ hitTest: function () {
    return { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] };
  } });
  f.emit('pointerdown');
  const shown = f.previews.at(-1);
  f.emit('pointerdown', { pointerId: 2, isPrimary: false, clientX: 500 });
  f.emit('pointermove', { pointerId: 2, isPrimary: false, clientX: 500 });
  f.emit('pointerup', { pointerId: 2, isPrimary: false, clientX: 500 });
  assert.deepEqual(f.previews.at(-1), shown);
  assert.equal(f.removals.length, 0);
  f.emit('pointerup');
  assert.equal(f.removals.length, 0);
  assert.equal(f.moves.length, 0);
});

test('Выход за край менее порога перетаскивания не удаляет наклейку', function () {
  const f = fixture({ hitTest: function () {
    return { id: 'p1', stickerId: 'cloud', rect: [0.75, 0.375, 0.25, 0.25] };
  } });
  f.emit('pointerdown', { clientX: 199 });
  f.emit('pointermove', { clientX: 201 });
  assert.equal(f.previews.at(-1), null, 'a movement below the threshold must not promise removal');
  f.emit('pointerup', { clientX: 201 });
  assert.equal(f.removals.length, 0);
  assert.equal(f.moves.length, 0);
  assert.equal(f.drops.length, 0);
});

test('Отпускание новых наклеек вне кадра не вызывает удаление', function () {
  const f = fixture();
  f.emit('pointerdown');
  f.emit('pointermove', { clientX: 500 });
  assert.equal(f.previews.at(-1), null);
  f.emit('pointerup', { clientX: 500 });
  f.emit('pointerdown', { target: f.paletteTarget, clientY: 300 });
  f.emit('pointermove', { clientX: 500 });
  assert.equal(f.previews.at(-1), null);
  f.emit('pointerup', { clientX: 500 });
  assert.equal(f.removals.length, 0);
  assert.equal(f.moves.length, 0);
  assert.equal(f.drops.length, 0);
});

for (const invalidBounds of [{ width: 0 }, { height: 0 }, { width: NaN }, { height: Infinity }]) {
  test('Потеря размеров canvas не считается отпусканием за кадром: ' + Object.keys(invalidBounds)[0] +
      '=' + Object.values(invalidBounds)[0], function () {
    const f = fixture({ hitTest: function () {
      return { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] };
    } });
    f.emit('pointerdown');
    f.setBounds(invalidBounds);
    f.emit('pointermove', { clientX: 500 });
    assert.equal(f.previews.at(-1), null);
    f.emit('pointerup', { clientX: 500 });
    assert.equal(f.removals.length, 0);
    assert.equal(f.moves.length, 0);
    assert.equal(f.drops.length, 0);
  });
}

test('Захват и предпросмотр очищаются до вызова onRemove', function () {
  const f = fixture({ hitTest: function () {
    return { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] };
  }, onRemove: function () {
    assert.equal(f.captures.size, 0);
    assert.equal(f.previews.at(-1), null);
    assert.deepEqual(f.releases, [1]);
  } });
  f.emit('pointerdown');
  f.emit('pointerup', { clientX: 500 });
  assert.deepEqual(f.removals, [{ placementId: 'p1', stickerId: 'cloud' }]);
});

for (const invalidPoint of [{ clientX: NaN }, { clientX: Infinity }, { clientY: NaN }, { clientY: -Infinity }]) {
  test('Невалидные координаты указателя не удаляют наклейку: ' + Object.keys(invalidPoint)[0] +
      '=' + Object.values(invalidPoint)[0], function () {
    const f = fixture({ hitTest: function () {
      return { id: 'p1', stickerId: 'cloud', rect: [0.375, 0.375, 0.25, 0.25] };
    } });
    f.emit('pointerdown');
    f.emit('pointermove', invalidPoint);
    assert.equal(f.previews.at(-1), null);
    f.emit('pointerup', invalidPoint);
    assert.equal(f.removals.length, 0);
    assert.equal(f.moves.length, 0);
    assert.equal(f.drops.length, 0);
    assert.equal(f.captures.size, 0);
  });
}
