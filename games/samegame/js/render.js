(function (global) {
  'use strict';

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function easeOutQuad(t) {
    return t * (2 - t);
  }

  function BoardRenderer(canvas, particles) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = particles;
    this.colors = ['#FF4D6D', '#4D96FF', '#6BCB77', '#FFD93D', '#C77DFF', '#FF8C42'];
    this.stoneColor = '#5a6270';
    this.board = null;
    this.hover = null;
    this.cellSize = 40;
    this.pad = 8;
    this.offsetX = 0;
    this.offsetY = 0;
    this.shake = 0;
    this.floats = [];
    this.comboPop = null;
    this.tweens = [];
    this.hidden = {}; // key "r,c" during pop animation
    this.visualPos = {}; // key -> {x,y} override during fall/shift
    this.bg = '#12141c';
  }

  BoardRenderer.prototype.setColors = function (arr) {
    if (arr && arr.length) this.colors = arr.slice();
  };

  BoardRenderer.prototype.setBoard = function (board) {
    this.board = board;
    this.hidden = {};
    this.visualPos = {};
    this._layout();
  };

  BoardRenderer.prototype._layout = function () {
    if (!this.board) return;
    var rows = this.board.length, cols = this.board[0].length;
    var w = this.canvas.clientWidth || this.canvas.width;
    var h = this.canvas.clientHeight || this.canvas.height;
    var dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = w; this.viewH = h;
    var usableW = w - this.pad * 2;
    var usableH = h - this.pad * 2;
    this.cellSize = Math.floor(Math.min(usableW / cols, usableH / rows, 56));
    var bw = this.cellSize * cols;
    var bh = this.cellSize * rows;
    this.offsetX = Math.floor((w - bw) / 2);
    this.offsetY = Math.floor((h - bh) / 2);
  };

  BoardRenderer.prototype.resize = function () {
    this._layout();
  };

  BoardRenderer.prototype.cellAt = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect();
    var x = clientX - rect.left - this.offsetX;
    var y = clientY - rect.top - this.offsetY;
    if (!this.board) return null;
    var col = Math.floor(x / this.cellSize);
    var row = Math.floor(y / this.cellSize);
    if (row < 0 || col < 0 || row >= this.board.length || col >= this.board[0].length) return null;
    return { row: row, col: col };
  };

  BoardRenderer.prototype.setHover = function (cells) {
    this.hover = cells;
  };

  BoardRenderer.prototype.addShake = function (amount) {
    this.shake = Math.min(14, Math.max(this.shake, amount));
  };

  BoardRenderer.prototype.addFloat = function (text, row, col, color) {
    this.floats.push({
      text: text,
      x: this.offsetX + (col + 0.5) * this.cellSize,
      y: this.offsetY + (row + 0.5) * this.cellSize,
      vy: -70,
      life: 0.9,
      maxLife: 0.9,
      color: color || '#fff',
      size: 18
    });
  };

  BoardRenderer.prototype.showCombo = function (n) {
    if (n < 2) return;
    this.comboPop = { n: n, life: 0.55, maxLife: 0.55 };
  };

  BoardRenderer.prototype.playRemoveAnim = function (change, cells, onDone) {
    var self = this;
    var cs = this.cellSize;
    // hide removed immediately after short pop
    cells.forEach(function (cell) {
      var key = cell.row + ',' + cell.col;
      self.tweens.push({
        type: 'pop',
        key: key,
        t: 0,
        dur: 0.14,
        cell: cell
      });
    });

    var fallStart = 0.14;
    var maxFall = 0;
    (change.moved || []).forEach(function (m, idx) {
      var dist = Math.abs(m.to.row - m.from.row);
      var dur = Math.max(0.12, 0.055 * dist);
      maxFall = Math.max(maxFall, dur);
      self.tweens.push({
        type: 'move',
        t: -fallStart - (idx % 3) * 0.012,
        dur: dur,
        from: m.from,
        to: m.to,
        value: m.value,
        ease: easeOutCubic
      });
    });

    var shiftStart = fallStart + maxFall + 0.02;
    var maxShift = 0;
    (change.shifted || []).forEach(function (m, idx) {
      var dist = Math.abs(m.to.col - m.from.col);
      var dur = Math.max(0.1, 0.045 * dist);
      maxShift = Math.max(maxShift, dur);
      self.tweens.push({
        type: 'move',
        t: -shiftStart - (idx % 4) * 0.008,
        dur: dur,
        from: m.from,
        to: m.to,
        value: m.value,
        ease: easeOutQuad
      });
    });

    var total = shiftStart + maxShift + 0.05;
    this.tweens.push({
      type: 'done',
      t: 0,
      dur: total,
      onDone: onDone
    });
  };

  BoardRenderer.prototype.update = function (dt) {
    if (this.shake > 0.3) this.shake *= 0.88;
    else this.shake = 0;

    var i = this.floats.length;
    while (i--) {
      var f = this.floats[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    if (this.comboPop) {
      this.comboPop.life -= dt;
      if (this.comboPop.life <= 0) this.comboPop = null;
    }

    this.visualPos = {};
    this.hidden = {};
    var still = [];
    for (var t = 0; t < this.tweens.length; t++) {
      var tw = this.tweens[t];
      tw.t += dt;
      if (tw.type === 'pop') {
        if (tw.t < tw.dur) {
          this.hidden[tw.key] = {
            scale: 1 - easeOutCubic(Math.max(0, tw.t) / tw.dur),
            value: tw.cell.color,
            row: tw.cell.row,
            col: tw.cell.col
          };
          still.push(tw);
        }
      } else if (tw.type === 'move') {
        var p = Math.min(1, Math.max(0, tw.t) / tw.dur);
        var mk = tw.to.row + ',' + tw.to.col;
        var x0 = this.offsetX + tw.from.col * this.cellSize;
        var y0 = this.offsetY + tw.from.row * this.cellSize;
        var x1 = this.offsetX + tw.to.col * this.cellSize;
        var y1 = this.offsetY + tw.to.row * this.cellSize;
        if (tw.t < tw.dur) {
          var e = tw.t < 0 ? 0 : tw.ease(p);
          this.visualPos[mk] = {
            x: x0 + (x1 - x0) * e,
            y: y0 + (y1 - y0) * e,
            value: tw.value,
            ghost: true
          };
          still.push(tw);
        }
      } else if (tw.type === 'done') {
        if (tw.t >= tw.dur) {
          if (tw.onDone) tw.onDone();
        } else still.push(tw);
      }
    }
    this.tweens = still;

    if (this.particles) this.particles.update(dt);
  };

  BoardRenderer.prototype._drawCell = function (ctx, x, y, value, scale, highlight) {
    var s = this.cellSize;
    var gap = Math.max(2, s * 0.08);
    var sz = (s - gap) * (scale != null ? scale : 1);
    var ox = x + (s - sz) / 2;
    var oy = y + (s - sz) / 2;
    var r = Math.max(4, sz * 0.18);
    ctx.save();
    if (value === SameGameCore.STONE) {
      ctx.fillStyle = this.stoneColor;
    } else {
      ctx.fillStyle = this.colors[value] || '#888';
    }
    this._roundRect(ctx, ox, oy, sz, sz, r);
    ctx.fill();
    // gloss
    if (value !== SameGameCore.STONE) {
      var g = ctx.createLinearGradient(ox, oy, ox, oy + sz);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0.15)');
      ctx.fillStyle = g;
      this._roundRect(ctx, ox, oy, sz, sz, r);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(ox + sz * 0.2, oy + sz * 0.25, sz * 0.6, sz * 0.12);
    }
    if (highlight) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = Math.max(2, s * 0.06);
      this._roundRect(ctx, ox - 1, oy - 1, sz + 2, sz + 2, r + 1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      this._roundRect(ctx, ox, oy, sz, sz, r);
      ctx.fill();
    }
    ctx.restore();
  };

  BoardRenderer.prototype._roundRect = function (ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  BoardRenderer.prototype.draw = function () {
    var ctx = this.ctx;
    var w = this.viewW, h = this.viewH;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);

    // board panel
    if (!this.board) return;
    var rows = this.board.length, cols = this.board[0].length;
    var bw = cols * this.cellSize, bh = rows * this.cellSize;

    var sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() * 2 - 1) * this.shake;
      sy = (Math.random() * 2 - 1) * this.shake;
    }
    ctx.save();
    ctx.translate(sx, sy);

    // panel bg
    ctx.fillStyle = '#1a1e2b';
    this._roundRect(ctx, this.offsetX - 6, this.offsetY - 6, bw + 12, bh + 12, 12);
    ctx.fill();

    var hoverSet = {};
    if (this.hover) {
      for (var hi = 0; hi < this.hover.length; hi++) {
        hoverSet[this.hover[hi].row + ',' + this.hover[hi].col] = true;
      }
    }

    var animating = this.tweens.length > 0;
    // During animation: draw board but skip cells that are visually moving (ghosts drawn separately)
    // Simpler approach: if animating after remove, board already updated — draw static board
    // but overlay ghosts from visualPos for moving tiles; hide cells whose keys are in visualPos as ghost source
    // Actually after removeAt, board is NEW. During fall, we need to NOT draw final positions until arrived,
    // and draw ghosts along path. Keys in visualPos with ghost:true mean draw at visual, and suppress board cell at `to`.

    var suppress = {};
    for (var vk in this.visualPos) {
      if (this.visualPos[vk].ghost) suppress[vk] = true;
    }
    for (var hk in this.hidden) suppress[hk] = true;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var key = r + ',' + c;
        var val = this.board[r][c];
        if (val === null) continue;
        if (suppress[key] && this.visualPos[key]) continue;
        if (suppress[key] && !this.hidden[key]) continue;
        this._drawCell(
          ctx,
          this.offsetX + c * this.cellSize,
          this.offsetY + r * this.cellSize,
          val,
          1,
          !!hoverSet[key]
        );
      }
    }

    // popping removed cells
    for (var hk2 in this.hidden) {
      var hd = this.hidden[hk2];
      if (hd.scale > 0.05) {
        this._drawCell(
          ctx,
          this.offsetX + hd.col * this.cellSize,
          this.offsetY + hd.row * this.cellSize,
          hd.value,
          hd.scale,
          false
        );
      }
    }

    // ghosts
    for (var gk in this.visualPos) {
      var g = this.visualPos[gk];
      this._drawCell(ctx, g.x, g.y, g.value, 1, false);
    }

    if (this.particles) this.particles.draw(ctx);
    ctx.restore();

    // floats (no shake)
    for (var fi = 0; fi < this.floats.length; fi++) {
      var fl = this.floats[fi];
      var a = fl.life / fl.maxLife;
      ctx.globalAlpha = a;
      ctx.fillStyle = fl.color;
      ctx.font = 'bold ' + (fl.size + (1 - a) * 6) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fl.text, fl.x, fl.y);
      ctx.globalAlpha = 1;
    }

    if (this.comboPop) {
      var cp = this.comboPop;
      var ca = Math.min(1, cp.life / 0.2) * Math.min(1, (cp.maxLife - cp.life) / 0.15 + 0.5);
      ctx.globalAlpha = Math.min(1, ca);
      ctx.fillStyle = cp.n >= 4 ? '#FF6B35' : '#FFD93D';
      ctx.font = 'bold ' + (32 + Math.min(cp.n, 6) * 2) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 4;
      var tx = w / 2, ty = h * 0.22;
      ctx.strokeText('COMBO ×' + cp.n, tx, ty);
      ctx.fillText('COMBO ×' + cp.n, tx, ty);
      ctx.globalAlpha = 1;
    }
  };

  BoardRenderer.prototype.isAnimating = function () {
    return this.tweens.length > 0;
  };

  global.BoardRenderer = BoardRenderer;
})(typeof window !== 'undefined' ? window : global);
