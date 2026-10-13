(function (global) {
  'use strict';

  var STORAGE_KEY = 'casual-samegame-progress-v1';

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { unlocked: 1, stars: {}, best: {} };
      var p = JSON.parse(raw);
      p.unlocked = p.unlocked || 1;
      p.stars = p.stars || {};
      p.best = p.best || {};
      return p;
    } catch (e) {
      return { unlocked: 1, stars: {}, best: {} };
    }
  }

  function saveProgress(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  function UI(root) {
    this.root = root;
    this.progress = loadProgress();
    this.handlers = {};
    this._build();
  }

  UI.prototype.on = function (evt, fn) {
    this.handlers[evt] = fn;
  };

  UI.prototype.emit = function (evt, data) {
    if (this.handlers[evt]) this.handlers[evt](data);
  };

  UI.prototype._build = function () {
    var r = this.root;
    r.innerHTML =
      '<div id="screen-menu" class="screen">' +
      '  <div class="panel hero">' +
      '    <h1>消灭同色方块</h1>' +
      '    <p class="tagline">SameGame · 连击爆炸 · 高爽消除</p>' +
      '    <button class="btn primary" data-act="play">开始游戏</button>' +
      '    <button class="btn" data-act="levels">选择关卡</button>' +
      '    <button class="btn ghost" data-act="help">玩法说明</button>' +
      '  </div>' +
      '</div>' +
      '<div id="screen-levels" class="screen hidden">' +
      '  <div class="panel">' +
      '    <h2>选择关卡</h2>' +
      '    <div id="level-grid" class="level-grid"></div>' +
      '    <button class="btn" data-act="back-menu">返回</button>' +
      '  </div>' +
      '</div>' +
      '<div id="screen-help" class="screen hidden">' +
      '  <div class="panel">' +
      '    <h2>玩法说明</h2>' +
      '    <ul class="help-list">' +
      '      <li>点击 <b>≥2</b> 个上下左右相连的同色方块消除</li>' +
      '      <li>消除后重力下落，空列向左压缩</li>' +
      '      <li>得分 = (消除数−2)² × 连击倍率</li>' +
      '      <li>3 秒内连续消除提升连击（最高 ×3）</li>' +
      '      <li>灰色石块不可消除，会挡住路径</li>' +
      '      <li>达到目标分即可通关；注意步数限制</li>' +
      '    </ul>' +
      '    <button class="btn" data-act="back-menu">返回</button>' +
      '  </div>' +
      '</div>' +
      '<div id="screen-game" class="screen hidden game-screen">' +
      '  <div id="hud" class="hud">' +
      '    <div class="hud-left">' +
      '      <button class="btn tiny" data-act="pause">暂停</button>' +
      '      <span id="hud-level" class="hud-label"></span>' +
      '    </div>' +
      '    <div class="hud-stats">' +
      '      <div><span class="k">分数</span><span id="hud-score">0</span></div>' +
      '      <div><span class="k">目标</span><span id="hud-target">0</span></div>' +
      '      <div><span class="k">步数</span><span id="hud-moves">∞</span></div>' +
      '      <div><span class="k">连击</span><span id="hud-combo">×1</span></div>' +
      '    </div>' +
      '    <div class="progress-wrap"><div id="hud-bar" class="progress-bar"></div></div>' +
      '  </div>' +
      '  <canvas id="game-canvas"></canvas>' +
      '  <div id="toast" class="toast hidden"></div>' +
      '</div>' +
      '<div id="screen-pause" class="screen overlay hidden">' +
      '  <div class="panel">' +
      '    <h2>暂停</h2>' +
      '    <button class="btn primary" data-act="resume">继续</button>' +
      '    <button class="btn" data-act="restart">重开本关</button>' +
      '    <button class="btn" data-act="to-levels">关卡选择</button>' +
      '    <button class="btn ghost" data-act="back-menu">主菜单</button>' +
      '  </div>' +
      '</div>' +
      '<div id="screen-result" class="screen overlay hidden">' +
      '  <div class="panel">' +
      '    <h2 id="result-title">通关！</h2>' +
      '    <p id="result-detail"></p>' +
      '    <div id="result-stars" class="stars"></div>' +
      '    <button class="btn primary" data-act="next" id="btn-next">下一关</button>' +
      '    <button class="btn" data-act="restart">再试一次</button>' +
      '    <button class="btn ghost" data-act="to-levels">关卡选择</button>' +
      '  </div>' +
      '</div>';

    var self = this;
    r.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'play') self.emit('play');
      else if (act === 'levels') { self.showLevels(); self.show('levels'); }
      else if (act === 'help') self.show('help');
      else if (act === 'back-menu') self.show('menu');
      else if (act === 'pause') self.emit('pause');
      else if (act === 'resume') self.emit('resume');
      else if (act === 'restart') self.emit('restart');
      else if (act === 'to-levels') { self.showLevels(); self.show('levels'); self.emit('abort'); }
      else if (act === 'next') self.emit('next');
    });
  };

  UI.prototype.show = function (name) {
    var map = {
      menu: 'screen-menu',
      levels: 'screen-levels',
      help: 'screen-help',
      game: 'screen-game',
      pause: 'screen-pause',
      result: 'screen-result'
    };
    Object.keys(map).forEach(function (k) {
      var el = document.getElementById(map[k]);
      if (!el) return;
      if (k === 'pause' || k === 'result') {
        el.classList.toggle('hidden', k !== name);
      } else {
        var showMain = (name === 'pause' || name === 'result') ? 'game' : name;
        el.classList.toggle('hidden', k !== showMain);
        if (k === 'pause' || k === 'result') el.classList.add('hidden');
      }
    });
    if (name === 'pause') document.getElementById('screen-pause').classList.remove('hidden');
    if (name === 'result') document.getElementById('screen-result').classList.remove('hidden');
    if (name === 'game') {
      document.getElementById('screen-pause').classList.add('hidden');
      document.getElementById('screen-result').classList.add('hidden');
    }
  };

  UI.prototype.setLevelsData = function (levels) {
    this.levels = levels;
  };

  UI.prototype.showLevels = function () {
    var grid = document.getElementById('level-grid');
    var self = this;
    grid.innerHTML = '';
    (this.levels || []).forEach(function (lv) {
      var unlocked = lv.id <= self.progress.unlocked;
      var btn = document.createElement('button');
      btn.className = 'level-btn' + (unlocked ? '' : ' locked');
      btn.disabled = !unlocked;
      var stars = self.progress.stars[lv.id] || 0;
      btn.innerHTML = '<span class="num">' + lv.id + '</span><span class="name">' + lv.name + '</span>' +
        '<span class="starline">' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + '</span>';
      if (unlocked) {
        btn.addEventListener('click', function () { self.emit('start-level', lv.id); });
      }
      grid.appendChild(btn);
    });
  };

  UI.prototype.updateHud = function (state) {
    document.getElementById('hud-level').textContent = '第 ' + state.levelId + ' 关 · ' + (state.levelName || '');
    document.getElementById('hud-score').textContent = String(state.score);
    document.getElementById('hud-target').textContent = String(state.target);
    document.getElementById('hud-moves').textContent =
      state.movesLeft == null ? '∞' : String(state.movesLeft);
    document.getElementById('hud-combo').textContent = '×' + (state.combo || 1);
    var pct = Math.min(100, (state.score / Math.max(1, state.target)) * 100);
    document.getElementById('hud-bar').style.width = pct + '%';
    document.getElementById('hud-moves').classList.toggle('warn', state.movesLeft != null && state.movesLeft <= 5);
  };

  UI.prototype.toast = function (msg, ms) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { el.classList.add('hidden'); }, ms || 1600);
  };

  UI.prototype.showResult = function (result) {
    document.getElementById('result-title').textContent = result.win ? '通关！' : '未达成';
    document.getElementById('result-detail').textContent =
      '得分 ' + result.score + ' / 目标 ' + result.target +
      (result.cleared ? ' · 全清奖励已计入' : '') +
      (result.win ? '' : (result.reason || ''));
    var stars = result.stars || 0;
    document.getElementById('result-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    var nextBtn = document.getElementById('btn-next');
    nextBtn.style.display = result.win && result.hasNext ? '' : 'none';
    this.show('result');

    if (result.win) {
      this.progress.unlocked = Math.max(this.progress.unlocked, result.levelId + 1);
      var prev = this.progress.stars[result.levelId] || 0;
      this.progress.stars[result.levelId] = Math.max(prev, stars);
      var best = this.progress.best[result.levelId] || 0;
      this.progress.best[result.levelId] = Math.max(best, result.score);
      saveProgress(this.progress);
    }
  };

  global.GameUI = UI;
})(typeof window !== 'undefined' ? window : global);
