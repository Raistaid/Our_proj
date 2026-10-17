// The bridge belongs to one page opening, not to an individual replay.
export function createBridge(post) {
  let completionSent = false;
  let finishSent = false;
  const log = [];
  const send = post || function (message) {
    if (typeof window === 'undefined') return false;
    window.postMessage(message, '*');
    return true;
  };
  function emit(message) {
    try {
      if (send(message) === false) return false;
      log.push({ type: message.type, hasImage: Boolean(message.image), time: Date.now() });
      if (log.length > 100) log.shift();
      return true;
    } catch (error) {
      console.warn('Сообщение приложения не отправлено:', error.message);
      return false;
    }
  }
  return {
    closeGame: function () { return emit({ type: 'CLOSE_EVENT' }); },
    completeOnce: function () {
      if (completionSent) return false;
      completionSent = emit({ type: 'COMPLETED_EVENT' });
      return completionSent;
    },
    finishOnce: function () {
      if (finishSent) return false;
      finishSent = emit({ type: 'FINISH_EVENT' });
      return finishSent;
    },
    vibrate: function () { return emit({ type: 'VIBRATION_EVENT' }); },
    sharePoster: function (text, image) {
      if (typeof image !== 'string' || image.indexOf('data:image/png;base64,') !== 0) return false;
      return emit({ type: 'SHARING_EVENT', text: text, image: image });
    },
    getLog: function () { return log.slice(); }
  };
}
