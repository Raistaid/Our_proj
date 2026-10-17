import { DEFAULT_FEED, pick, fanComments, strangerComment, agentTitle } from './feed.js';

const SYMBOLS = { info: '✳', warning: '!', success: '✓' };

// First-frame tutorial: a finger drags the chosen card into the frame until the first sticker
// is placed. It aims at an empty bit of wall, never at a secret (secrets are not highlighted).
const HAND_TARGET = { x: 0.1, y: 0.18 };
function placeHand(hand, palette, canvas) {
  const layout = hand.parentElement;
  const card = palette.querySelector('[aria-pressed=true]') || palette.querySelector('button');
  if (!layout || !card) return false;
  const base = layout.getBoundingClientRect();
  const from = card.getBoundingClientRect();
  const board = canvas.getBoundingClientRect();
  if (!from.width || !board.width) return false;
  hand.style.setProperty('--sx', (from.left + from.width / 2 - base.left) + 'px');
  hand.style.setProperty('--sy', (from.top + from.height / 2 - base.top) + 'px');
  hand.style.setProperty('--ex', (board.left + board.width * HAND_TARGET.x - base.left) + 'px');
  hand.style.setProperty('--ey', (board.top + board.height * HAND_TARGET.y - base.top) + 'px');
  return true;
}

function reduceMotion() {
  return typeof window === 'undefined' || !window.matchMedia ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Counts likes up once; with reduced motion (or no animation frames) shows the number at once.
function countUp(element, target) {
  const raf = typeof window !== 'undefined' && window.requestAnimationFrame;
  if (!raf || reduceMotion()) { element.textContent = '♥ ' + target; return; }
  const start = Date.now();
  // Frames may be paused (hidden WebView); the final number must still appear.
  setTimeout(function () { element.textContent = '♥ ' + target; }, 1000);
  (function step() {
    const k = Math.min(1, (Date.now() - start) / 900);
    element.textContent = '♥ ' + Math.round(target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) raf(step);
  })();
}

export function mountUI(callbacks) {
  const root = document.getElementById('app');
  const canvas = document.getElementById('board');
  const palette = document.getElementById('palette');
  let paletteKey = '';
  let stickerCanvases = [];
  let lastUsed = 0;
  let wasPassed = false;
  let reactTimer = 0;
  let postKey = '';
  let resultKey = '';
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
    // Sound buttons: the small one in the top bar and the big one on the start screen.
    root.querySelectorAll('[data-action=sound]').forEach(function (sound) {
      const icon = sound.querySelector('.sound-icon');
      const label = sound.querySelector('.sound-label');
      const textLabel = sound.querySelector('.sound-text');
      if (icon) icon.textContent = vm.soundOn ? '🔊' : '🔇';
      if (label) label.textContent = vm.soundOn ? 'Звук вкл.' : 'Звук выкл.';
      if (textLabel) textLabel.textContent = vm.soundOn ? 'Звук и музыка включены' : 'Включить звук и музыку';
      sound.setAttribute('aria-pressed', String(Boolean(vm.soundOn)));
      sound.setAttribute('aria-label', vm.soundOn ? 'Выключить звук' : 'Включить звук');
    });
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
      // After a failed check, a made-up "stranger" reacts to the secret that is still visible.
      const stranger = kind === 'warning' && vm.post ? strangerComment(vm.feed, vm.post.missingKinds) : null;
      const strangerLine = document.getElementById('stranger');
      strangerLine.hidden = !stranger;
      if (stranger) {
        strangerLine.textContent = '';
        const who = document.createElement('b');
        who.textContent = stranger.who + ' ';
        strangerLine.appendChild(who);
        const said = document.createElement('span');
        said.textContent = stranger.text;
        strangerLine.appendChild(said);
      }
      // Only on the first frame, and constant within it so buttons never jump under a finger.
      show('gesture-help', vm.levelIndex === 1 && !(kind === 'warning' && vm.post && vm.post.missingKinds.length));
      const passed = vm.screen === 'levelPassed';
      show('passed-notice', passed);
      root.querySelector('.workspace').dataset.passed = String(passed);
      const frame = document.getElementById('board-frame');
      frame.classList.toggle('passed', passed);
      // Micro-reaction to a new placement: only the frame glows; the canvas, its size and input stay untouched.
      // The live layer shows the current scene's animations (scene file name: room, desk, poster…).
      frame.dataset.scene = String(vm.scene || '').split('/').pop().replace(/\.svg$/, '');
      const fx = document.getElementById('scene-fx');
      // content.json → scenes: which live effects run, their speed, reactions and confetti.
      const setup = vm.scenes || {};
      const sceneSetup = setup[frame.dataset.scene] || {};
      const off = Object.keys(sceneSetup).filter(function (k) { return sceneSetup[k] === false; });
      if (setup.confetti === false) off.push('confetti');
      fx.dataset.off = off.join(' ');
      const speed = Number(setup.speed);
      fx.style.setProperty('--fx-speed', String(speed > 0 && speed <= 4 ? speed : 1));
      if (vm.screen === 'playing' && vm.usedStickers > lastUsed) {
        frame.classList.remove('just-placed'); void frame.offsetWidth; frame.classList.add('just-placed');
        // The scene answers a new sticker: the robot blinks, the teapot puffs, the clock spins.
        if (setup.reactions !== false) { fx.classList.remove('react'); void fx.offsetWidth; fx.classList.add('react'); }
        clearTimeout(reactTimer);
        reactTimer = setTimeout(function () { fx.classList.remove('react'); }, 900);
      }
      if (passed && !wasPassed) { fx.classList.remove('party'); void fx.offsetWidth; fx.classList.add('party'); }
      if (!passed) fx.classList.remove('party');
      wasPassed = passed;
      const hand = document.getElementById('tutorial-hand');
      const teach = vm.screen === 'playing' && vm.levelIndex === 1 && vm.usedStickers === 0 && !vm.isFallback;
      hand.hidden = !(teach && placeHand(hand, palette, canvas));
      lastUsed = vm.usedStickers;
      setText('success-text', vm.successText);
      // The passed frame becomes a post: likes count up, fans comment on the stickers.
      const feedKey = passed ? vm.levelIndex + ':' + (vm.post ? vm.post.stickerIds.join(',') : '') : '';
      if (passed && feedKey !== postKey) {
        const feed = vm.feed || DEFAULT_FEED;
        setText('post-author', feed.author || DEFAULT_FEED.author);
        const list = document.getElementById('post-comments');
        list.textContent = '';
        fanComments(feed, vm.levelIndex - 1, vm.post ? vm.post.stickerIds : [], 2).forEach(function (c) {
          const item = document.createElement('li');
          const who = document.createElement('b');
          who.textContent = c.who + ' ';
          item.appendChild(who);
          const said = document.createElement('span');
          said.textContent = c.text;
          item.appendChild(said);
          list.appendChild(item);
        });
        countUp(document.getElementById('post-likes'), pick(feed.likes || DEFAULT_FEED.likes, vm.levelIndex - 1));
      }
      postKey = feedKey;
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
      const feed = vm.feed || DEFAULT_FEED;
      const title = agentTitle(feed, vm.stats);
      show('agent-title', Boolean(title) && !vm.isFallback);
      const rKey = title ? title.title + ':' + (vm.stats ? vm.stats.levels : 0) : '';
      if (title && rKey !== resultKey) {
        setText('agent-name', title.title);
        setText('agent-text', title.text);
        const likes = (feed.likes || []).slice(0, vm.stats ? vm.stats.levels : 0)
          .reduce(function (sum, n) { return sum + n; }, 0);
        setText('agent-likes', likes ? 'Твои посты собрали ♥ ' + likes : '');
      }
      resultKey = rKey;
      setText('result-description', vm.isFallback ?
        'Пробный кадр готов. Попробуй открыть игру снова, чтобы получить основной набор.' :
        'Кадры готовы. Твои идеи остались видны, личное — за кадром.');
    }
  }
  function setStickerSize(width, height) {
    palette.style.setProperty('--sticker-width', width + 'px');
    palette.style.setProperty('--sticker-height', height + 'px');
    // Cards may be drawn smaller than the real sticker, but keep its exact proportions.
    if (width > 0 && height > 0) palette.style.setProperty('--sticker-ratio', String(width / height));
  }
  return { canvas: canvas, boardElement: canvas, paletteElement: palette, rootElement: root,
    updateUI: updateUI, setStickerSize: setStickerSize,
    getStickerCanvases: function () { return stickerCanvases.slice(); } };
}
