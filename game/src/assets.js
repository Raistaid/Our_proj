// Let the game start with fallback artwork after one second, while retaining
// each image request so a slow connection can still replace that fallback.
export async function loadAssets(content, onUpdate) {
  const assets = { images: {}, stickers: {}, missing: [] };
  content.stickers.forEach(function (sticker) { assets.stickers[sticker.id] = sticker; });
  const paths = new Set(content.stickers.map(function (sticker) { return sticker.src; }));
  content.levels.forEach(function (level) { paths.add(level.background); });
  let ready = false;

  await Promise.all(Array.from(paths).map(function (path) {
    return new Promise(function (resolve) {
      let img = null;
      let initialSettled = false;
      let finished = false;
      const timer = setTimeout(function () {
        markMissing();
        finishInitial();
      }, 1000);

      function markMissing() {
        if (!assets.missing.includes(path)) assets.missing.push(path);
      }
      function finishInitial() {
        if (initialSettled) return;
        initialSettled = true;
        clearTimeout(timer);
        resolve();
      }
      function finish(ok) {
        if (finished) return;
        finished = true;
        if (img) img.onload = img.onerror = null;
        if (ok) {
          assets.images[path] = img;
          const index = assets.missing.indexOf(path);
          if (index !== -1) assets.missing.splice(index, 1);
        } else {
          markMissing();
        }
        finishInitial();
        // Initial successes are already included in the returned object. Only
        // successes arriving after it is ready require another render.
        if (ok && ready && typeof onUpdate === 'function') onUpdate(assets, path);
      }

      try {
        img = new Image();
        img.onload = function () { finish(true); };
        img.onerror = function () { finish(false); };
        img.src = new URL(path, document.baseURI).href;
      } catch (_) {
        finish(false);
      }
    });
  }));

  ready = true;
  return assets;
}
