// Own short sounds, synthesized in code (no audio files, nothing to download).
// Off until the player turns sound on: browsers and the sandbox also require a tap first.
export function createAudio() {
  let context = null;
  let master = null;
  let enabled = false;

  function tone(freq, at, duration, options) {
    const o = options || {};
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, at);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(o.volume || 0.06, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain); gain.connect(master);
    osc.start(at); osc.stop(at + duration + 0.02);
  }

  function hiss(at, duration, volume) {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass'; filter.frequency.value = 1800;
    gain.gain.value = volume;
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(at);
  }

  const SOUNDS = {
    // A sticker lands: a soft thump with a little paper "shh".
    place: function (t) {
      tone(150, t, 0.1, { type: 'sine', to: 55, volume: 0.09 });
      hiss(t, 0.04, 0.025);
    },
    // Frame ready: quick C-E-G, then the "ding" of likes.
    success: function (t) {
      [523.25, 659.25, 783.99].forEach(function (f, i) { tone(f, t + i * 0.07, 0.13); });
      tone(1567.98, t + 0.26, 0.45, { type: 'sine', volume: 0.04 });
      tone(2349.32, t + 0.26, 0.3, { type: 'sine', volume: 0.02 });
    },
    // The made-up stranger notices a secret: a suspicious "hmm".
    warning: function (t) {
      tone(392, t, 0.14, { type: 'sine', to: 370, volume: 0.05 });
      tone(311.13, t + 0.16, 0.22, { type: 'sine', to: 290, volume: 0.05 });
    },
    // Final screen with the agent title.
    fanfare: function (t) {
      [523.25, 659.25, 783.99].forEach(function (f, i) { tone(f, t + i * 0.1, 0.12, { volume: 0.05 }); });
      tone(1046.5, t + 0.3, 0.45, { volume: 0.06 });
      tone(1318.51, t + 0.3, 0.45, { type: 'sine', volume: 0.025 });
    }
  };

  return {
    toggle: async function () {
      if (enabled) { enabled = false; return false; }
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return false;
      try {
        if (!context) {
          context = new AudioContextType();
          master = context.createGain();
          master.gain.value = 0.8;
          master.connect(context.destination);
        }
        await context.resume();
        enabled = true;
      } catch (error) { enabled = false; }
      return enabled;
    },
    play: function (kind) {
      if (!enabled || !context || context.state !== 'running') return;
      const sound = SOUNDS[kind] || SOUNDS.place;
      try { sound(context.currentTime + 0.01); } catch (error) { /* a missed sound must never break the game */ }
    }
  };
}
