/** Short synthesized cues. No external audio files. */

const STORAGE_KEY = 'gate-runner-muted';

function readMuted() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return false; }
}

function writeMuted(muted) {
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); }
  catch { /* private mode */ }
}

export function createAudio() {
  let ctx = null;
  let muted = readMuted();
  const last = {};

  function context() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function throttled(name, gap) {
    const now = performance.now();
    if (last[name] && now - last[name] < gap) return true;
    last[name] = now;
    return false;
  }

  function tone({ freq, dur, type, gain, slide, delay = 0 }) {
    const ac = context();
    if (!ac || muted) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.03, dur));
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise({ dur, gain, freq, delay = 0 }) {
    const ac = context();
    if (!ac || muted) return;
    const t0 = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = 0.7;
    const amp = ac.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(ac.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    get muted() { return muted; },
    unlock() { context(); },
    setMuted(next) {
      muted = !!next;
      writeMuted(muted);
      return muted;
    },
    toggleMuted() { return this.setMuted(!muted); },
    playShoot() {
      if (throttled('shoot', 45)) return;
      noise({ dur: 0.045, gain: 0.12, freq: 1800 });
      tone({ freq: 520, dur: 0.04, type: 'square', gain: 0.03, slide: 220 });
    },
    playGateHit() {
      if (throttled('gate', 55)) return;
      tone({ freq: 880, dur: 0.05, type: 'square', gain: 0.045, slide: 1320 });
    },
    playGateUp() {
      tone({ freq: 523, dur: 0.12, type: 'sine', gain: 0.07, slide: 880 });
      tone({ freq: 784, dur: 0.14, type: 'triangle', gain: 0.04, delay: 0.06 });
    },
    playGateDown() {
      tone({ freq: 440, dur: 0.16, type: 'sine', gain: 0.07, slide: 160 });
      tone({ freq: 220, dur: 0.14, type: 'triangle', gain: 0.04, delay: 0.05 });
    },
    playHit() {
      if (throttled('hit', 40)) return;
      tone({ freq: 196, dur: 0.07, type: 'triangle', gain: 0.06, slide: 90 });
    },
    playDeath() {
      noise({ dur: 0.12, gain: 0.1, freq: 400 });
      tone({ freq: 150, dur: 0.2, type: 'sawtooth', gain: 0.05, slide: 55 });
    },
    playLosePeople() {
      tone({ freq: 330, dur: 0.14, type: 'square', gain: 0.05, slide: 90 });
    },
    playWin() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        tone({ freq, dur: 0.16, type: 'sine', gain: 0.06, delay: i * 0.09 });
      });
    },
    playLose() {
      tone({ freq: 311, dur: 0.28, type: 'sawtooth', gain: 0.06, slide: 70 });
      tone({ freq: 196, dur: 0.36, type: 'triangle', gain: 0.04, slide: 55, delay: 0.12 });
    }
  };
}
