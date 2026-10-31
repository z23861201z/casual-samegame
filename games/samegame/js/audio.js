(function (global) {
  'use strict';

  function AudioEngine() {
    this.ctx = null;
    this.enabled = true;
    this._unlocked = false;
  }

  AudioEngine.prototype.unlock = function () {
    if (this._unlocked) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = this.ctx || new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._unlocked = true;
    } catch (e) { /* ignore */ }
  };

  AudioEngine.prototype._beep = function (freq, dur, type, gain, slideTo) {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  };

  AudioEngine.prototype._noise = function (dur, gain) {
    if (!this.enabled || !this.ctx) return;
    var ctx = this.ctx;
    var len = (ctx.sampleRate * dur) | 0;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.value = gain || 0.12;
    src.connect(filter); filter.connect(g); g.connect(ctx.destination);
    src.start();
  };

  AudioEngine.prototype.playRemove = function (n, combo) {
    this.unlock();
    var base = 440 * Math.pow(2, (Math.min(combo, 8) - 1) / 12);
    this._noise(0.06 + Math.min(n, 20) * 0.004, 0.1 + Math.min(n, 15) * 0.008);
    this._beep(base, 0.12, 'square', 0.06, base * 1.5);
    if (combo >= 2) this._beep(base * 1.25, 0.1, 'triangle', 0.05);
  };

  AudioEngine.prototype.playClear = function () {
    this.unlock();
    var notes = [523.25, 659.25, 783.99, 1046.5];
    var self = this;
    notes.forEach(function (f, i) {
      setTimeout(function () { self._beep(f, 0.18, 'sine', 0.1); }, i * 90);
    });
  };

  AudioEngine.prototype.playFail = function () {
    this.unlock();
    this._beep(320, 0.25, 'sawtooth', 0.07, 90);
  };

  AudioEngine.prototype.playWin = function () {
    this.unlock();
    this.playClear();
  };

  AudioEngine.prototype.playClick = function () {
    this.unlock();
    this._beep(660, 0.04, 'square', 0.03);
  };

  global.AudioEngine = AudioEngine;
})(typeof window !== 'undefined' ? window : global);
