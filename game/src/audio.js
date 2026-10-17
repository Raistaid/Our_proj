export function createAudio() {
  let context = null;
  let enabled = false;
  return {
    toggle: async function () {
      if (enabled) { enabled = false; return false; }
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return false;
      try {
        if (!context) context = new AudioContextType();
        await context.resume();
        enabled = true;
      } catch (error) { enabled = false; }
      return enabled;
    },
    play: function (kind) {
      if (!enabled || !context || context.state !== 'running') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'success' ? 660 : 440, start);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'success' ? 990 : 550, start + 0.08);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.045, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + 0.15);
    }
  };
}
