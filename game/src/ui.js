const SYMBOLS = { info: '✳', warning: '!', success: '✓' };

export function mountUI(callbacks) {
  const root = document.getElementById('app');
  const canvas = document.getElementById('board');
  const palette = document.getElementById('palette');
  let paletteKey = '';
  let stickerCanvases = [];
  const actions = { start: 'onStart', close: 'onClose', sound: 'onSoundToggle',
    undo: 'onUndo', hint: 'onHint', check: 'onCheck', next: 'onNext',
    replay: 'onReplay', share: 'onShare', reload: 'onReload' };
  root.addEventListener('click', function (event) {
    const button = event.target.closest ? event.target.closest('button') : null;
    if (!button || button.disabled) return;
    if (button.dataset.stickerId) {
      callbacks.onStickerSelect(button.dataset.stickerId); return;
    }
    const callback = callbacks[actions[button.dataset.action]];
    if (callback) callback();
  });
  function setText(id, value) { document.getElementById(id).textContent = value || ''; }
  function show(id, visible) { document.getElementById(id).hidden = !visible; }
  function updateUI(vm) {
    const playing = vm.screen === 'playing' || vm.screen === 'levelPassed';
    show('loading-screen', vm.screen === 'loading');
    show('start-screen', vm.screen === 'start');
    show('play-screen', playing);
    show('result-screen', vm.screen === 'result');
    show('error-screen', vm.screen === 'error');
    root.dataset.screen = vm.screen;
    show('brand', !playing);
    show('level-info', playing);
    const sound = root.querySelector('[data-action=sound]');
    sound.querySelector('.sound-icon').textContent = vm.soundOn ? '🔊' : '🔇';
    sound.querySelector('.sound-label').textContent = vm.soundOn ? 'Звук вкл.' : 'Звук выкл.';
    sound.setAttribute('aria-pressed', String(Boolean(vm.soundOn)));
    sound.setAttribute('aria-label', vm.soundOn ? 'Выключить звук' : 'Включить звук');
    setText('start-note', vm.isFallback ?
      'Основные кадры не загрузились. Можно попробовать один и открыть игру снова.' :
      'Все данные в сценах вымышленные. Звук — по желанию.');
    if (playing) {
      setText('level-title', vm.title);
      setText('task', vm.task);
      setText('level-counter', 'Кадр ' + vm.levelIndex + ' / ' + vm.levelCount);
      const progress = document.getElementById('progress');
      progress.textContent = '';
      for (let i = 1; i <= vm.levelCount; i += 1) {
        const dot = document.createElement('span');
        dot.className = i < vm.levelIndex ? 'done' : i === vm.levelIndex ? 'current' : '';
        progress.appendChild(dot);
      }
      const key = vm.stickers.map(function (s) { return s.id; }).join('|');
      if (paletteKey !== key) {
        palette.textContent = '';
        stickerCanvases = [];
        vm.stickers.forEach(function (sticker) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'sticker-choice';
          button.dataset.stickerId = sticker.id;
          button.setAttribute('aria-label', sticker.label);
          const thumbnail = document.createElement('canvas');
          thumbnail.className = 'sticker-thumbnail';
          thumbnail.setAttribute('aria-hidden', 'true');
          stickerCanvases.push({ canvas: thumbnail, stickerId: sticker.id });
          const label = document.createElement('span');
          label.textContent = sticker.shortLabel || sticker.label;
          button.appendChild(thumbnail); button.appendChild(label); palette.appendChild(button);
        });
        paletteKey = key;
      }
      Array.from(palette.querySelectorAll('button')).forEach(function (button) {
        const selected = button.dataset.stickerId === vm.selectedStickerId;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = vm.screen === 'levelPassed';
      });
      setText('sticker-count', vm.usedStickers + ' / ' + vm.maxStickers);
      document.getElementById('undo-button').disabled = !vm.canUndo;
      document.getElementById('hint-button').disabled = !vm.canHint;
      document.getElementById('hint-button').title = vm.hintLocked ?
        'Сначала попробуй подготовить этот кадр самостоятельно' : '';
      document.getElementById('check-button').disabled = vm.screen === 'levelPassed';
      const feedback = document.getElementById('feedback');
      const kind = vm.feedback.kind || 'info';
      feedback.dataset.kind = kind;
      // Color is never the only signal: every kind has its own symbol.
      setText('feedback-symbol', SYMBOLS[kind] || SYMBOLS.info);
      setText('feedback-text', vm.feedback.text);
      // Only on the first frame, and constant within it so buttons never jump under a finger.
      show('gesture-help', vm.levelIndex === 1);
      const passed = vm.screen === 'levelPassed';
      show('passed-notice', passed);
      root.querySelector('.workspace').dataset.passed = String(passed);
      document.getElementById('board-frame').classList.toggle('passed', passed);
      setText('success-text', vm.successText);
      setText('next-button', vm.levelIndex === vm.levelCount ? 'Мой коллаж ↗' : 'Следующий кадр ↗');
      show('fallback-note', vm.isFallback);
    }
    if (vm.screen === 'result') {
      const poster = document.getElementById('poster-image');
      if (vm.posterDataUrl && poster.getAttribute('src') !== vm.posterDataUrl) poster.src = vm.posterDataUrl;
      show('poster-image', Boolean(vm.posterDataUrl));
      show('poster-placeholder', !vm.posterDataUrl);
      document.getElementById('share-button').disabled = !vm.canShare;
      setText('result-status', vm.resultStatus);
      setText('result-description', vm.isFallback ?
        'Пробный кадр готов. Попробуй открыть игру снова, чтобы получить основной набор.' :
        'Кадры готовы. Твои идеи остались видны, личное — за кадром.');
    }
  }
  function setStickerSize(width, height) {
    palette.style.setProperty('--sticker-width', width + 'px');
    palette.style.setProperty('--sticker-height', height + 'px');
  }
  return { canvas: canvas, boardElement: canvas, paletteElement: palette, rootElement: root,
    updateUI: updateUI, setStickerSize: setStickerSize,
    getStickerCanvases: function () { return stickerCanvases.slice(); } };
}
