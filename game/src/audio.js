// Own short sounds, synthesized in code (no audio files, nothing to download).
// Off until the player turns sound on: browsers and the sandbox also require a tap first.
// Phone speakers are small: the designed volumes are doubled.
const LOUD = 2;

export function createAudio() {
  let context = null;
  let master = null;
  let enabled = false;
  let keepAlive = null;

  // A tiny silent WAV made in code. Playing it through an <audio> element moves iOS to the
  // "playback" audio session, so Web Audio is heard even when the ring/silent switch is on silent.
  function silentWavUrl() {
    const rate = 8000;
    const samples = 800;
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const text = function (offset, value) { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, 36 + samples, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
    text(36, 'data'); view.setUint32(40, samples, true);
    for (let i = 0; i < samples; i += 1) view.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  // Everything here runs synchronously inside the tap, as mobile browsers require.
  function unlock() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (error) { /* Safari 17+ only */ }
    try {
      if (!keepAlive && typeof Audio === 'function') {
        keepAlive = new Audio(silentWavUrl());
        keepAlive.loop = true;
        keepAlive.setAttribute('playsinline', '');
      }
      if (keepAlive) { const p = keepAlive.play(); if (p && p.catch) p.catch(function () {}); }
    } catch (error) { /* optional */ }
    try {
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, context.sampleRate);
      source.connect(context.destination);
      source.start(0);
    } catch (error) { /* optional */ }
  }

  function tone(freq, at, duration, options) {
    const o = options || {};
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, at);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime((o.volume || 0.06) * LOUD, at + 0.012);
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
    gain.gain.value = volume * LOUD;
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
      if (enabled) {
        enabled = false;
        if (keepAlive) keepAlive.pause();
        return false;
      }
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return false;
      try {
        if (!context) {
          context = new AudioContextType();
          const limiter = context.createDynamicsCompressor();
          master = context.createGain();
          master.gain.value = 1;
          master.connect(limiter); limiter.connect(context.destination);
        }
        unlock();
        const resumed = context.resume();
        // A short confirmation once audio runs, so the player hears that sound is on.
        enabled = true;
        await resumed;
        SOUNDS.place(context.currentTime + 0.01);
      } catch (error) { enabled = false; }
      return enabled;
    },
    play: function (kind) {
      if (!enabled || !context) return;
      // iOS suspends audio after a call or when the app goes to the background; every play
      // comes from a tap, so resuming here is allowed.
      if (context.state !== 'running') {
        const resumed = context.resume();
        if (resumed && resumed.catch) resumed.catch(function () {});
      }
      const sound = SOUNDS[kind] || SOUNDS.place;
      try { sound(context.currentTime + 0.01); } catch (error) { /* a missed sound must never break the game */ }
    }
  };
}
