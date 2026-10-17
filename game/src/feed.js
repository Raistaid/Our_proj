// "Post feed": after a check the frame is shown as a post in a made-up social feed.
// Texts come from content.json (feed); these short defaults keep the fallback scene working.
export const DEFAULT_FEED = {
  author: '@мой_пост', likes: [87],
  names: ['@kot_v_shapke', '@masha.risuet', '@robo_fan'],
  fans: { any: ['Классный кадр!', 'Хочу такие же наклейки'] },
  strangers: { any: { who: '@незнакомец_42', text: 'О, это теперь видят все? 👀' } },
  titles: [{ minFirstTry: 0, maxHints: 99, title: 'Стажёр секретной службы', text: 'Секреты спрятаны.' }]
};

export function pick(list, index) { return list && list.length ? list[index % list.length] : ''; }

// Fan comments: first one per sticker used in the frame, then a general one. Deterministic,
// so the same frame always gets the same reactions (no randomness, no lottery).
export function fanComments(feed, levelIndex, stickerIds, count) {
  const f = feed || DEFAULT_FEED;
  const fans = f.fans || DEFAULT_FEED.fans;
  const seen = [];
  (stickerIds || []).forEach(function (id) { if (seen.indexOf(id) === -1) seen.push(id); });
  const texts = seen.map(function (id) { return pick(fans[id], levelIndex); }).filter(Boolean);
  texts.push(pick(fans.any, levelIndex));
  return texts.filter(Boolean).slice(0, count).map(function (text, i) {
    return { who: pick(f.names || DEFAULT_FEED.names, levelIndex * 2 + i), text: text };
  });
}

export function strangerComment(feed, missingKinds) {
  const strangers = (feed || DEFAULT_FEED).strangers || DEFAULT_FEED.strangers;
  for (const kind of missingKinds || []) if (strangers[kind]) return strangers[kind];
  return missingKinds && missingKinds.length ? strangers.any || DEFAULT_FEED.strangers.any : null;
}

export function agentTitle(feed, stats) {
  const titles = (feed || DEFAULT_FEED).titles || DEFAULT_FEED.titles;
  const levels = stats && stats.levels || 0;
  const firstTry = stats && stats.firstTry || 0;
  const hints = stats && stats.hints || 0;
  // minFirstTry is out of 5 frames; scale it if the set has another length.
  return titles.find(function (t) {
    return firstTry >= Math.min(levels, t.minFirstTry * levels / 5) && hints <= t.maxHints;
  }) || titles[titles.length - 1];
}
