(function () {
  'use strict';

  var levelsData = null;
  var ui, audio, particles, renderer;
  var canvas;
  var state = null;
  var inputLocked = false;
  var raf = 0;
  var lastTs = 0;
  var running = false;

  function $(id) { return document.getElementById(id); }

  function fetchLevels() {
    return fetch('data/levels.json')
      .then(function (r) {
        if (!r.ok) throw new Error('levels fetch failed');
        return r.json();
      })
      .catch(function () {
        // file:// fallback embed
        return null;
      });
  }

  function startLevel(id) {
    var lv = levelsData.levels.find(function (x) { return x.id === id; });
    if (!lv) return;

    var board = SameGameCore.createBoard(
      lv.rows, lv.cols, lv.colorCount, lv.seed,
      lv.stoneCount || 0, lv.minLargestGroup || 0
    );

    state = {
      level: lv,
      board: board,
      score: 0,
      combo: 0,
      lastRemoveAt: 0,
      movesLeft: lv.moveLimit == null ? null : lv.moveLimit,
      over: false,
      initialCells: SameGameCore.countColorCells(board)
    };

    renderer.setColors(levelsData.colors);
    renderer.setBoard(board);
    particles.clear();
    inputLocked = false;
    ui.show('game');
    ui.updateHud(hudPayload());
    if (lv.tutorial) {
      ui.toast('点击相连的同色方块（至少 2 个）');
      var largest = SameGameCore.getLargestRegion(board);
      renderer.setHover(largest.length >= 2 ? largest : null);
    } else {
      renderer.setHover(null);
    }
    ensureLoop();
  }

  function hudPayload() {
    return {
      levelId: state.level.id,
      levelName: state.level.name,
      score: state.score,
      target: state.level.targetScore,
      movesLeft: state.movesLeft,
      combo: Math.max(1, state.combo)
    };
  }

  function computeStars(lv, score, remaining, cleared) {
    if (score < lv.targetScore) return 0;
    var ratio = remaining / Math.max(1, state.initialCells);
    var stars = 1;
    if (cleared || ratio <= (lv.star3RemainingRatio != null ? lv.star3RemainingRatio : 0.05)) stars = 3;
    else if (ratio <= (lv.star2RemainingRatio != null ? lv.star2RemainingRatio : 0.15)) stars = 2;
    return stars;
  }

  function endGame(win, reason, cleared) {
    if (state.over) return;
    state.over = true;
    inputLocked = true;
    var remaining = SameGameCore.countColorCells(state.board);
    var stars = win ? computeStars(state.level, state.score, remaining, cleared) : 0;
    var hasNext = levelsData.levels.some(function (l) { return l.id === state.level.id + 1; });
    if (win) audio.playWin();
    else audio.playFail();
    ui.showResult({
      win: win,
      score: state.score,
      target: state.level.targetScore,
      cleared: !!cleared,
      reason: reason || '',
      stars: stars,
      levelId: state.level.id,
      hasNext: hasNext
    });
  }

  function checkAfterMove(result) {
    ui.updateHud(hudPayload());
    if (result.cleared) {
      if (state.score >= state.level.targetScore) {
        endGame(true, '', true);
      } else {
        // cleared but somehow under target — still win with clear
        endGame(true, '', true);
      }
      return;
    }
    if (state.score >= state.level.targetScore) {
      endGame(true, '', false);
      return;
    }
    if (state.movesLeft != null && state.movesLeft <= 0) {
      endGame(false, ' · 步数用尽');
      return;
    }
    if (!result.hasMoves) {
      endGame(false, ' · 无步可走');
    }
  }

  function tryRemove(row, col) {
    if (!state || state.over || inputLocked || renderer.isAnimating()) return;
    var now = performance.now();
    var result = SameGameCore.removeAt(state.board, row, col, {
      now: now,
      lastRemoveAt: state.lastRemoveAt,
      combo: state.combo,
      comboWindowMs: levelsData.score.comboWindowMs,
      comboMultipliers: levelsData.score.comboMultipliers,
      clearBonus: state.level.clearBonus != null ? state.level.clearBonus : levelsData.score.clearBonusDefault
    });
    if (!result.ok) {
      audio.playClick();
      return;
    }

    inputLocked = true;
    state.board = result.board;
    state.score += result.scoreGain;
    state.combo = result.combo;
    state.lastRemoveAt = now;
    if (state.movesLeft != null) state.movesLeft -= 1;

    var cent = SameGameCore.centroid(result.cells);
    renderer.addFloat('+' + result.scoreGain, cent.row, cent.col, levelsData.colors[result.cells[0].color]);
    renderer.showCombo(result.combo);
    var shake = Math.min(14, 2 + Math.log2(Math.max(2, result.n)) * 2 + (result.combo - 1) * 0.8);
    renderer.addShake(shake);
    particles.burst(result.cells, renderer.cellSize, renderer.offsetX, renderer.offsetY, levelsData.colors);
    if (result.cleared) audio.playClear();
    else audio.playRemove(result.n, result.combo);

    // Keep renderer board as OLD visually until anim done? We set new board but anim overlays.
    renderer.setBoard(result.board);
    renderer.setHover(null);
    ui.updateHud(hudPayload());

    renderer.playRemoveAnim(result.change, result.cells, function () {
      inputLocked = false;
      renderer.setBoard(state.board);
      checkAfterMove(result);
    });
  }

  function onPointerMove(clientX, clientY) {
    if (!state || state.over || inputLocked) return;
    var cell = renderer.cellAt(clientX, clientY);
    if (!cell) { renderer.setHover(null); return; }
    var group = SameGameCore.match(state.board, cell.row, cell.col);
    renderer.setHover(group);
  }

  function onPointerDown(clientX, clientY) {
    audio.unlock();
    if (!state || state.over || inputLocked) return;
    var cell = renderer.cellAt(clientX, clientY);
    if (!cell) return;
    tryRemove(cell.row, cell.col);
  }

  function loop(ts) {
    if (!running) return;
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    renderer.update(dt);
    renderer.draw();
    raf = requestAnimationFrame(loop);
  }

  function ensureLoop() {
    if (running) return;
    running = true;
    lastTs = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function bindInput() {
    canvas.addEventListener('mousemove', function (e) {
      onPointerMove(e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseleave', function () {
      renderer.setHover(null);
    });
    canvas.addEventListener('click', function (e) {
      onPointerDown(e.clientX, e.clientY);
    });
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches[0]) {
        audio.unlock();
        var t = e.touches[0];
        onPointerMove(t.clientX, t.clientY);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches[0]) onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      if (t) onPointerDown(t.clientX, t.clientY);
    }, { passive: false });
    window.addEventListener('resize', function () {
      renderer.resize();
    });
  }

  function wireUI() {
    ui.on('play', function () {
      var maxId = levelsData.levels[levelsData.levels.length - 1].id;
      var id = Math.min(ui.progress.unlocked || 1, maxId);
      startLevel(id);
    });
    ui.on('start-level', function (id) { startLevel(id); });
    ui.on('pause', function () {
      if (state && !state.over) ui.show('pause');
    });
    ui.on('resume', function () { ui.show('game'); });
    ui.on('restart', function () {
      if (state) startLevel(state.level.id);
    });
    ui.on('next', function () {
      if (state) startLevel(state.level.id + 1);
    });
    ui.on('abort', function () {
      state = null;
    });
  }

  function boot(data) {
    levelsData = data;
    ui = new GameUI($('app'));
    ui.setLevelsData(levelsData.levels);
    audio = new AudioEngine();
    particles = new ParticleSystem();
    canvas = $('game-canvas');
    // ensure canvas exists after UI build
    canvas = document.getElementById('game-canvas');
    renderer = new BoardRenderer(canvas, particles);
    bindInput();
    wireUI();
    ui.show('menu');
    ensureLoop();
  }

  // Embedded fallback if fetch fails (file://)
  var EMBEDDED = typeof window !== "undefined" ? window.__LEVELS__ : null;

  document.addEventListener('DOMContentLoaded', function () {
    fetchLevels().then(function (data) {
      boot(data || EMBEDDED);
    }).catch(function () {
      if (EMBEDDED) boot(EMBEDDED);
      else {
        document.body.innerHTML = '<p style="color:#fff;padding:2rem">无法加载关卡数据。</p>';
      }
    });
  });
})();
