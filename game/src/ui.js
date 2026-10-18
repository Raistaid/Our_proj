import { DEFAULT_FEED, pick, fanComments, strangerComment, agentTitle } from './feed.js';
// --- БЛИЦ-ТАЙМЕР И ИНТЕРАКТИВНЫЙ ВОРИШКА ---
const BLITZ_SECONDS = 20;
let blitzInterval = null;
let blitzLeft = BLITZ_SECONDS;
let currentTimedLevel = -1;
let totalSeconds = 0;
let blitzWins = 0;
let lastStickersCount = 0;
let annoyedTimer = null;
let bonkTimer = null;
let bonkBound = false;

function updateBlitzDisplay(el, frame) {
  if (!el) return;
  if (blitzLeft > 0) {
    el.textContent = '⚡ Блиц: ' + blitzLeft + ' с';
    el.dataset.state = blitzLeft <= 5 ? 'hurry' : 'active';
    if (frame) frame.classList.toggle('thief-hurry', blitzLeft <= 5);
  } else {
    el.textContent = '⏱ В своём темпе';
    el.dataset.state = 'calm';
    if (frame) frame.classList.remove('thief-hurry');
  }
}

function handleBlitzTimer(vm) {
  const el = document.getElementById('blitz-timer');
  const frame = document.getElementById('board-frame');
  if (frame && !bonkBound && frame.addEventListener) {
    bonkBound = true;
    frame.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.thief-spy')) {
        frame.classList.add('thief-bonked');
        clearTimeout(bonkTimer);
        bonkTimer = setTimeout(function () { frame.classList.remove('thief-bonked'); }, 1600);
      }
    });
  }
  if (!el) return;

  if (vm.screen === 'playing') {
    if (currentTimedLevel !== vm.levelIndex) {
      currentTimedLevel = vm.levelIndex;
      blitzLeft = BLITZ_SECONDS;
      lastStickersCount = 0;
      if (frame) {
        frame.classList.remove('thief-annoyed', 'thief-gloat', 'thief-bonked', 'thief-hurry');
      }
      if (blitzInterval) clearInterval(blitzInterval);
      updateBlitzDisplay(el, frame);
      blitzInterval = setInterval(function () {
        totalSeconds += 1;
        if (blitzLeft > 0) blitzLeft -= 1;
        updateBlitzDisplay(el, frame);
      }, 1000);
      if (blitzInterval && typeof blitzInterval.unref === 'function') blitzInterval.unref();
    }
    if (frame) {
      const isWarning = vm.feedback && vm.feedback.kind === 'warning' &&
        vm.post && vm.post.missingKinds && vm.post.missingKinds.length > 0;
      frame.classList.toggle('thief-gloat', Boolean(isWarning));
      if (vm.usedStickers > lastStickersCount) {
        frame.classList.add('thief-annoyed');
        clearTimeout(annoyedTimer);
        annoyedTimer = setTimeout(function () { frame.classList.remove('thief-annoyed'); }, 1300);
      }
      lastStickersCount = vm.usedStickers;
    }
  } else if (vm.screen === 'levelPassed') {
    if (blitzInterval) {
      clearInterval(blitzInterval);
      blitzInterval = null;
      if (blitzLeft > 0) blitzWins += 1;
    }
    if (frame) frame.classList.remove('thief-hurry', 'thief-annoyed', 'thief-gloat');
    el.textContent = blitzLeft > 0 ? '⚡ Блиц! +50 ♥' : '✓ Кадр защищён';
    el.dataset.state = blitzLeft > 0 ? 'bonus' : 'calm';
  } else {
    if (blitzInterval) { clearInterval(blitzInterval); blitzInterval = null; }
    currentTimedLevel = -1;
    if (vm.screen === 'result') {
      const summaryEl = document.getElementById('blitz-summary');
      if (summaryEl) {
        summaryEl.textContent = '⚡ Блиц-кадров: ' + blitzWins + ' из ' + (vm.levelCount || 5) +
          ' · Время защиты: ' + Math.max(1, totalSeconds) + ' с';
      }
    }
    if (vm.screen === 'start') {
      totalSeconds = 0;
      blitzWins = 0;
    }
  }
}
import { stickerIntersectsRect } from './sticker-shapes.js';

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
  // Browsers keep a running animation on its old coordinates; restart it when the start changes,
  // so the finger always comes out of the card the player has just chosen.
  const key = card.dataset.stickerId + ':' + Math.round(from.left) + ':' + Math.round(board.width);
  if (hand.dataset.from !== key) {
    hand.dataset.from = key;
    hand.style.animation = 'none';
    void hand.offsetWidth;
    hand.style.animation = '';
  }
  return true;
}

// Live elements under a sticker are hidden (the clock hand must not stick out of a sticker).
// Their boxes are widened a little because they move (rotation, rising steam).
function hideUnderStickers(fx, frame, placements) {
  const base = frame.getBoundingClientRect();
  if (!base.width || !base.height) return;
  Array.from(fx.querySelectorAll('span')).forEach(function (el) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) { el.classList.remove('covered'); return; }
    const pad = 0.04;
    const box = [(r.left - base.left) / base.width - pad, (r.top - base.top) / base.height - pad * 2,
      r.width / base.width + pad * 2, r.height / base.height + pad * 3];
    const covered = placements.some(function (p) { return stickerIntersectsRect(p, box); });
    el.classList.toggle('covered', covered);
  });
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
  const panel = document.getElementById('settings-panel');
  const gear = root.querySelector('[data-action=settings]');
  let lastAudio = { music: 0.6, effects: 0.5, clicks: false };
  function openSettings(open) {
    panel.hidden = !open;
    if (gear) gear.setAttribute('aria-expanded', String(open));
  }
  ['music', 'effects'].forEach(function (channel) {
    const slider = document.getElementById(channel + '-volume');
    if (slider) slider.addEventListener('input', function () {
      const next = {}; next[channel] = Number(slider.value) / 100;
      if (callbacks.onSettings) callbacks.onSettings(next);
    });
  });
  root.addEventListener('click', function (event) {
    const button = event.target.closest ? event.target.closest('button') : null;
    // A tap outside the open settings panel closes it.
    if (!panel.hidden && !(event.target.closest && (event.target.closest('#settings-panel') ||
        event.target.closest('[data-action=settings]')))) openSettings(false);
    if (!button || button.disabled) return;
    if (callbacks.onButtonTap) callbacks.onButtonTap();
    if (button.dataset.action === 'settings') { openSettings(panel.hidden); return; }
    if (button.dataset.action === 'clicks') {
      if (callbacks.onSettings) callbacks.onSettings({ clicks: !lastAudio.clicks });
      return;
    }
    if (button.dataset.stickerId) {
      callbacks.onStickerSelect(button.dataset.stickerId); return;
    }
    const callback = callbacks[actions[button.dataset.action]];
    if (callback) callback();
  });
  function setText(id, value) { document.getElementById(id).textContent = value || ''; }
  function show(id, visible) { document.getElementById(id).hidden = !visible; }
  function updateUI(vm) {
    handleBlitzTimer(vm);
    const playing = vm.screen === 'playing' || vm.screen === 'levelPassed';
    show('loading-screen', vm.screen === 'loading');
    show('start-screen', vm.screen === 'start');
    show('play-screen', playing);
    show('result-screen', vm.screen === 'result');
    show('error-screen', vm.screen === 'error');
    root.dataset.screen = vm.screen;
    const sceneCount = document.getElementById('scene-count');
    if (sceneCount && vm.levelCount) sceneCount.textContent = vm.levelCount + (vm.levelCount === 1 ? ' кадр' : ' кадров');
    show('brand', !playing);
    // Exit is available on every main screen (TZ: CLOSE_EVENT in all main states).
    const exit = root.querySelector('[data-action=close]');
    if (exit) exit.hidden = vm.screen === 'loading';
    show('level-info', playing);
    // The sound switch lives in the settings panel.
    root.querySelectorAll('[data-action=sound]').forEach(function (sound) {
      const icon = sound.querySelector('.sound-icon');
      if (icon) icon.textContent = vm.soundOn ? '🔊' : '🔇';
      sound.setAttribute('aria-pressed', String(Boolean(vm.soundOn)));
      sound.setAttribute('aria-label', vm.soundOn ? 'Выключить звук' : 'Включить звук');
    });
    // Mixer: sliders and the button-sounds switch show only while sound is on.
    if (vm.audio) lastAudio = vm.audio;
    document.getElementById('mixer').hidden = !vm.soundOn;
    const musicSlider = document.getElementById('music-volume');
    const effectsSlider = document.getElementById('effects-volume');
    if (document.activeElement !== musicSlider) musicSlider.value = String(Math.round(lastAudio.music * 100));
    if (document.activeElement !== effectsSlider) effectsSlider.value = String(Math.round(lastAudio.effects * 100));
    const clicks = root.querySelector('[data-action=clicks]');
    if (clicks) clicks.setAttribute('aria-pressed', String(Boolean(lastAudio.clicks)));
    setText('start-note', vm.isFallback ?
      'Основные кадры не загрузились. Можно попробовать один и открыть игру снова.' :
      'Все данные в сценах вымышленные. Звук и музыка — в настройках ⚙.');
    if (playing) {
      setText('level-title', vm.title);
      setText('task', vm.task);
      setText('level-counter', 'Уровень ' + vm.levelIndex + ' / ' + vm.levelCount);
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
      setText('sticker-count', 'Наклеек: ' + vm.usedStickers);
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
        who.textContent = stranger.who + ': ';
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
      // The live layer shows the current scene's animations (scene file name: room, desk, phone…).
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
      hideUnderStickers(fx, frame, vm.placements || []);
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
        fanComments(feed, vm.levelIndex - 1, vm.post ? vm.post.stickerIds : [], 2, frame.dataset.scene).forEach(function (c) {
          const item = document.createElement('li');
          const who = document.createElement('b');
          who.textContent = c.who + ': ';
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
      const counts = vm.stats && vm.stats.stickerCounts || {};
      const total = Object.values(counts).reduce(function (sum, n) { return sum + n; }, 0);
      setText('sticker-summary', 'Всего наклеек: ' + total + '. ' + (vm.stickers || []).map(function (s) {
        return (s.shortLabel || s.label) + ': ' + (counts[s.id] || 0);
      }).join(' · '));
      const feed = vm.feed || DEFAULT_FEED;
      const title = agentTitle(feed, vm.stats);
      show('agent-title', Boolean(title) && !vm.isFallback);
      const rKey = title ? title.title + ':' + (vm.stats ? vm.stats.levels : 0) + ':' + JSON.stringify(counts) : '';
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
        'Личные данные закрыты. Твой коллаж готов!');
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
