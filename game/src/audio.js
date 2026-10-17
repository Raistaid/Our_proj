// Own sounds and a quiet background tune, synthesized in code (no audio files, nothing to download).
// Off until the player turns sound on: browsers and the sandbox also require a tap first.
// Mixer: music and effects have their own volume; button taps have their own switch.

// Volumes are 0…1 from the settings sliders; gain = volume² sounds even to the ear.
const DEFAULTS = { music: 0.6, effects: 0.5, clicks: false };

export function createAudio() {
  let context = null;
  let master = null;
  let musicBus = null;
  let effectsBus = null;
  let enabled = false;
  let keepAlive = null;
  let musicTimer = 0;
  let musicStep = 0;
  let nextStepAt = 0;
  const settings = Object.assign({}, DEFAULTS);

  // A tiny silent WAV made in code. Playing it through an <audio> element moves iOS to the
  // "playback" audio session, so sound is heard even when the ring/silent switch is on silent.
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

  function build() {
    context = new (window.AudioContext || window.webkitAudioContext)();
    const limiter = context.createDynamicsCompressor();
    master = context.createGain();
    master.connect(limiter); limiter.connect(context.destination);
    musicBus = context.createGain();
    musicBus.connect(master);
    // Effects pass a soft low-pass filter: no sharp, piercing highs.
    const soften = context.createBiquadFilter();
    soften.type = 'lowpass'; soften.frequency.value = 2600; soften.Q.value = 0.4;
    effectsBus = context.createGain();
    effectsBus.connect(soften); soften.connect(master);
    applyVolumes();
  }

  function applyVolumes() {
    if (!context) return;
    const now = context.currentTime;
    musicBus.gain.setTargetAtTime(settings.music * settings.music, now, 0.05);
    effectsBus.gain.setTargetAtTime(settings.effects * settings.effects, now, 0.05);
  }

  // A soft note: gentle attack and a smooth fade, never a click.
  function tone(bus, freq, at, duration, volume, type, glideTo) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.025, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain); gain.connect(bus);
    osc.start(at); osc.stop(at + duration + 0.03);
  }

  const SOUNDS = {
    // A sticker lands: a round, soft "pop".
    place: function (t) {
      tone(effectsBus, 440, t, 0.16, 0.18, 'sine', 220);
      tone(effectsBus, 880, t, 0.06, 0.04);
    },
    // A button tap: a tiny, quiet tick.
    click: function (t) { tone(effectsBus, 700, t, 0.06, 0.08); },
    // Frame ready: a gentle C-E-G and a soft bell for the likes.
    success: function (t) {
      [523.25, 659.25, 783.99].forEach(function (f, i) { tone(effectsBus, f, t + i * 0.09, 0.22, 0.14); });
      tone(effectsBus, 1046.5, t + 0.3, 0.6, 0.08);
    },
    // The made-up stranger notices a secret: a low, quiet "hmm".
    warning: function (t) {
      tone(effectsBus, 330, t, 0.2, 0.14, 'sine', 311);
      tone(effectsBus, 262, t + 0.2, 0.3, 0.14, 'sine', 247);
    },
    // Final screen with the agent title.
    fanfare: function (t) {
      [523.25, 659.25, 783.99].forEach(function (f, i) { tone(effectsBus, f, t + i * 0.11, 0.2, 0.12, 'triangle'); });
      tone(effectsBus, 1046.5, t + 0.33, 0.7, 0.14, 'triangle');
    }
  };

  // ---------- Background music: our own short tune, looped ----------
  // C major, 112 bpm, eighth-note steps; chords C – Am – F – G, two 4-bar phrases.
  const STEP = 60 / 112 / 2;
  const NOTE = { G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, C6: 1046.5 };
  const MELODY = [
    'E5', 'G5', 'C6', 'G5', 'E5', '', 'D5', 'E5',
    'C5', 'E5', 'A5', 'E5', 'C5', '', 'B4', 'C5',
    'A4', 'C5', 'F5', 'C5', 'A4', '', 'G4', 'A4',
    'B4', 'D5', 'G5', 'F5', 'E5', 'D5', 'C5', 'B4',
    'G5', '', 'E5', '', 'C5', 'D5', 'E5', '',
    'A5', '', 'E5', '', 'C5', 'D5', 'E5', '',
    'F5', 'E5', 'D5', 'C5', 'A4', 'C5', 'F5', '',
    'G5', 'F5', 'E5', 'D5', 'B4', '', 'G4', ''
  ];
  const BASS = [130.81, 110, 87.31, 98]; // C3, A2, F2, G2: one chord per bar

  function scheduleMusic() {
    // Look a little ahead so notes stay on time even if the page is busy.
    while (nextStepAt < context.currentTime + 0.25) {
      const step = musicStep % MELODY.length;
      const note = MELODY[step];
      if (note) tone(musicBus, NOTE[note], nextStepAt, 0.32, 0.07, 'triangle');
      if (step % 4 === 0) tone(musicBus, BASS[Math.floor(step / 8) % BASS.length], nextStepAt, 0.5, 0.1);
      nextStepAt += STEP;
      musicStep += 1;
    }
  }

  function startMusic() {
    if (!context || musicTimer || document.hidden) return;
    nextStepAt = context.currentTime + 0.1;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 100);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = 0; }
  }

  // Music pauses while the game is hidden (app in the background) and returns with it.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (!enabled) return;
      if (document.hidden) stopMusic(); else startMusic();
    });
  }

  function play(kind) {
    if (!enabled || !context) return;
    // iOS suspends audio after a call or when the app goes to the background; every play
    // comes from a tap, so resuming here is allowed.
    if (context.state !== 'running') {
      const resumed = context.resume();
      if (resumed && resumed.catch) resumed.catch(function () {});
    }
    const sound = SOUNDS[kind] || SOUNDS.place;
    try {
      if (kind === 'fanfare') {
        // The final fanfare sounds alone, then the tune comes back.
        const now = context.currentTime;
        const level = settings.music * settings.music;
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setTargetAtTime(0, now, 0.05);
        musicBus.gain.setTargetAtTime(level, now + 1.4, 0.4);
      }
      sound(context.currentTime + 0.01);
    } catch (error) { /* a missed sound must never break the game */ }
  }

  return {
    toggle: async function () {
      if (enabled) {
        enabled = false;
        stopMusic();
        if (keepAlive) keepAlive.pause();
        return false;
      }
      if (!(window.AudioContext || window.webkitAudioContext)) return false;
      try {
        if (!context) build();
        unlock();
        const resumed = context.resume();
        enabled = true;
        await resumed;
        // A short confirmation once audio runs, so the player hears that sound is on.
        SOUNDS.place(context.currentTime + 0.01);
        startMusic();
      } catch (error) { enabled = false; }
      return enabled;
    },
    play: play,
    // A tap on any button: only when "button sounds" is switched on.
    click: function () { if (settings.clicks) play('click'); },
    configure: function (next) {
      if (next && Number.isFinite(next.music)) settings.music = Math.max(0, Math.min(1, next.music));
      if (next && Number.isFinite(next.effects)) settings.effects = Math.max(0, Math.min(1, next.effects));
      if (next && typeof next.clicks === 'boolean') settings.clicks = next.clicks;
      applyVolumes();
      return Object.assign({}, settings);
    },
    settings: function () { return Object.assign({}, settings); }
  };
}
