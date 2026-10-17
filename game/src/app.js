import { loadContent, getRuntimeLevel } from './content.js';
import { createLevelState, placeSticker, moveSticker, removeSticker, hitTestSticker, undoPlacement, checkLevel, evaluateLevel, useHint, getLevelHint } from './game.js';
import { renderBoard, renderStickerCard, fitCanvas, loadAssets } from './renderer.js';
import { mountUI } from './ui.js';
import { bindInput } from './input.js';
import { createBridge } from './bridge.js';
import { createAudio } from './audio.js';
import { createPoster } from './export.js';

// These two objects live for the entire page opening, including every replay.
const bridge = createBridge();
const audio = createAudio();
let content = null;
let assets = null;
let screen = 'loading';
let levelIndex = 0;
let state = null;
let selectedStickerId = '';
let preview = null;
let hintIds = [];
let feedback = { kind: 'info', text: '' };
let soundOn = false;
let soundBusy = false;
let posterDataUrl = '';
let resultStatus = '';
let records = [];
let exportNonce = 0;
let frameRequest = 0;
let input = null;

const ui = mountUI({
  onStart: startSession,
  onReplay: startSession,
  onStickerSelect: selectSticker,
  onUndo: undo,
  onHint: hint,
  onCheck: check,
  onNext: next,
  onSoundToggle: toggleSound,
  onShare: share,
  onClose: close,
  onReload: function () { window.location.reload(); }
});

function currentLevel() { return content ? getRuntimeLevel(content, levelIndex) : null; }
function playing() { return screen === 'playing'; }
function canHint() {
  const level = currentLevel();
  return playing() && (level.mode !== 'transfer' || state.checks > 0);
}
function redraw() {
  frameRequest = 0;
  if (!state || !assets || (screen !== 'playing' && screen !== 'levelPassed')) return;
  if (!fitCanvas(ui.canvas)) return;
  const level = currentLevel();
  const bounds = ui.canvas.getBoundingClientRect();
  ui.setStickerSize(bounds.width * level.defaultStickerSize.w, bounds.height * level.defaultStickerSize.h);
  ui.getStickerCanvases().forEach(function (card) {
    if (fitCanvas(card.canvas)) renderStickerCard({ canvas: card.canvas, stickerId: card.stickerId,
      level: level, assets: assets });
  });
  renderBoard({ canvas: ui.canvas, level: level, placements: state.placements,
    assets: assets, hintIds: hintIds, preview: preview });
}
function scheduleDraw() {
  if (!frameRequest) frameRequest = window.requestAnimationFrame(redraw);
}
function render() {
  const level = currentLevel();
  ui.updateUI({
    screen: screen, soundOn: soundOn, isFallback: content ? content.isFallback : false,
    title: level ? level.title : '', task: level ? level.brief : '',
    levelIndex: levelIndex + 1, levelCount: content ? content.levels.length : 0,
    stickers: content ? content.stickers : [], selectedStickerId: selectedStickerId,
    usedStickers: state ? state.placements.length : 0, maxStickers: level ? level.maxStickers : 0,
    canUndo: playing() && state.history.length > 0, canHint: canHint(),
    hintLocked: playing() && !canHint(), feedback: preview && preview.removing ?
      { kind: 'warning', text: 'Отпусти за кадром, чтобы убрать наклейку.' } : feedback,
    successText: level ? level.successText : '',
    posterDataUrl: posterDataUrl, canShare: screen === 'result' && Boolean(posterDataUrl),
    resultStatus: resultStatus
  });
  scheduleDraw();
}
function selectSticker(id) {
  if (!playing() || !content.stickers.some(function (s) { return s.id === id; })) return;
  selectedStickerId = id;
  render();
}
function startLevel(index) {
  if (input) input.cancel();
  levelIndex = index;
  state = createLevelState(currentLevel());
  hintIds = [];
  preview = null;
  screen = 'playing';
  feedback = { kind: 'info', text: currentLevel().mode === 'transfer' ?
    'Твой самостоятельный кадр. Подсказка появится после первой проверки.' :
    'Прикрой личное. Главного героя и обычную идею оставь видимыми.' };
  render();
}
function startSession() {
  if (!content || !assets) return;
  exportNonce += 1;
  records = [];
  posterDataUrl = '';
  resultStatus = '';
  selectedStickerId = content.stickers[0].id;
  startLevel(0);
}
function drop(item) {
  if (!playing()) return;
  const result = placeSticker(currentLevel(), state, item);
  if (!result.accepted) {
    feedback = { kind: 'warning', text: result.reason === 'limit' ?
      'Наклейки закончились. Отмени лишнюю и попробуй ещё раз.' :
      'Попробуй поставить наклейку внутри кадра.' };
  } else {
    state = result.state;
    hintIds = [];
    feedback = { kind: 'info', text: 'Готово? Проверь, что личное закрыто, а идея осталась видимой.' };
    audio.play('place');
  }
  render();
}
function undo() {
  if (!playing()) return;
  if (input) input.cancel();
  state = undoPlacement(state);
  hintIds = [];
  feedback = { kind: 'info', text: 'Последнее действие отменено. Можно попробовать другое место.' };
  render();
}
function hint() {
  if (!canHint()) return;
  state = useHint(state);
  const help = getLevelHint(currentLevel(), state.placements);
  hintIds = help.hintIds;
  feedback = { kind: 'info', text: help.text };
  render();
}
function check() {
  if (!playing()) return;
  if (input) input.cancel();
  const level = currentLevel();
  const result = checkLevel(level, state);
  state = result.state;
  hintIds = [];
  if (result.report.passed) {
    screen = 'levelPassed';
    if (input) input.cancel();
    records.push({ levelId: level.id, checks: state.checks,
      firstCheckPassed: state.firstCheckPassed, hintUsed: state.hintUsed });
    feedback = { kind: 'success', text: level.successText };
    audio.play('success');
    bridge.vibrate();
  } else {
    const blocked = level.keepZones.find(function (zone) {
      return result.report.blockedKeepIds.indexOf(zone.id) !== -1;
    });
    const missing = level.secrets.find(function (zone) {
      return result.report.missingSecretIds.indexOf(zone.id) !== -1;
    });
    feedback = { kind: 'warning', text: blocked ? blocked.hint :
      missing ? missing.why : 'Проверь расположение наклеек и попробуй ещё раз.' };
  }
  render();
}
function move(item) {
  if (!playing()) return;
  const result = moveSticker(currentLevel(), state, item);
  if (!result.accepted) return;
  state = result.state;
  hintIds = [];
  feedback = { kind: 'info', text: 'Наклейка перенесена. Проверь, что личное закрыто, а идея осталась видимой.' };
  audio.play('place');
  render();
}
function next() {
  if (screen !== 'levelPassed') return;
  if (levelIndex + 1 < content.levels.length) { startLevel(levelIndex + 1); return; }
  showResult();
}
function remove(item) {
  if (!playing()) return;
  const result = removeSticker(state, item.placementId);
  if (!result.accepted) return;
  state = result.state;
  hintIds = [];
  feedback = { kind: 'info', text: 'Наклейка убрана. Если передумал, нажми «Отменить».' };
  render();
}
function showResult() {
  if (!evaluateLevel(currentLevel(), state.placements).passed) return;
  screen = 'result';
  preview = null;
  hintIds = [];
  // A fallback frame never awards completion of the main task.
  if (!content.isFallback && records.length === content.levels.length) bridge.completeOnce();
  bridge.finishOnce();
  refreshPoster();
}
async function refreshPoster() {
  const level = currentLevel();
  const placements = state.placements.map(function (p) {
    return { id: p.id, stickerId: p.stickerId, rect: p.rect.slice() };
  });
  if (!evaluateLevel(level, placements).passed) return;
  const nonce = ++exportNonce;
  posterDataUrl = '';
  resultStatus = 'Готовим твой коллаж…';
  render();
  try {
    const image = await createPoster({ level: level, placements: placements, assets: assets });
    if (nonce !== exportNonce || screen !== 'result') return;
    posterDataUrl = image;
    resultStatus = 'Можно показать коллаж. Все личные записки на нём закрыты.';
  } catch (error) {
    if (nonce !== exportNonce || screen !== 'result') return;
    resultStatus = 'Картинка не собралась. Попробуй ещё один заход.';
    console.warn('Не удалось собрать коллаж:', error.message);
  }
  render();
}
function share() {
  if (screen !== 'result' || !posterDataUrl ||
      !evaluateLevel(currentLevel(), state.placements).passed) return;
  const sent = bridge.sharePoster('Серьёзный носок на посту. Личное осталось за кадром!', posterDataUrl);
  resultStatus = sent ? 'Коллаж готов к отправке. Выбирай, кому его показать.' :
    'Пока не получилось передать коллаж. Попробуй ещё раз.';
  render();
}
function close() {
  bridge.closeGame();
  if (!content || !assets) return;
  if (input) input.cancel();
  exportNonce += 1;
  screen = 'start';
  render();
}
async function toggleSound() {
  if (soundBusy) return;
  soundBusy = true;
  soundOn = await audio.toggle();
  soundBusy = false;
  render();
}

input = bindInput({
  rootElement: ui.rootElement, canvas: ui.canvas, enabled: playing,
  selectedSticker: function () { return selectedStickerId; },
  hitTest: function (point) { return state ? hitTestSticker(state.placements, point) : null; },
  onSelect: selectSticker,
  onPreview: function (point) {
    const removalChanged = Boolean(point && point.removing) !== Boolean(preview && preview.removing);
    preview = point;
    if (removalChanged) render();
    else scheduleDraw();
  },
  onDrop: drop,
  onMove: move,
  onRemove: remove
});
function resized() { input.cancel(); scheduleDraw(); }
window.addEventListener('resize', resized);
window.addEventListener('orientationchange', resized);
document.addEventListener('visibilitychange', function () { if (document.hidden) input.cancel(); });

async function init() {
  render();
  try {
    content = await loadContent();
    assets = await loadAssets(content, function () {
      if (!assets) return;
      // Late images replace fallback artwork in the board and the exported PNG.
      if (screen === 'result') refreshPoster();
      else scheduleDraw();
    });
    selectedStickerId = content.stickers[0].id;
    screen = 'start';
  } catch (error) {
    screen = 'error';
    console.error('Не удалось открыть игру:', error.message);
  }
  render();
}
init();
