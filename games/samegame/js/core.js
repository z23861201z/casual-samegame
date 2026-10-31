/**
 * SameGame core — pure logic, no DOM/Canvas.
 * Board: board[row][col]; null=empty; number 0..N-1 = color; -1 = STONE
 * removeAt returns { ok, cells, scoreGain, combo, mult, board, change, cleared, hasMoves }
 */
(function (global) {
  'use strict';

  var STONE = -1;
  var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cloneBoard(board) {
    return board.map(function (row) { return row.slice(); });
  }

  function isColor(v) {
    return v !== null && v !== STONE && typeof v === 'number' && v >= 0;
  }

  function match(board, row, col) {
    var rows = board.length, cols = board[0].length;
    var target = board[row] && board[row][col];
    if (!isColor(target)) return null;

    var visited = [];
    for (var i = 0; i < rows; i++) visited[i] = new Array(cols).fill(false);
    var cells = [];
    var stack = [[row, col]];
    visited[row][col] = true;

    while (stack.length) {
      var cur = stack.pop();
      var r = cur[0], c = cur[1];
      cells.push({ row: r, col: c, color: target });
      for (var d = 0; d < 4; d++) {
        var nr = r + DIRS[d][0], nc = c + DIRS[d][1];
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        if (visited[nr][nc]) continue;
        if (board[nr][nc] !== target) continue;
        visited[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
    return cells.length >= 2 ? cells : null;
  }

  function applyGravity(board) {
    var rows = board.length, cols = board[0].length;
    var moved = [];
    for (var c = 0; c < cols; c++) {
      var write = rows - 1;
      for (var r = rows - 1; r >= 0; r--) {
        var v = board[r][c];
        if (v !== null) {
          if (write !== r) {
            moved.push({ from: { row: r, col: c }, to: { row: write, col: c }, value: v });
            board[write][c] = v;
            board[r][c] = null;
          }
          write--;
        }
      }
    }
    return moved;
  }

  function compactLeft(board) {
    var rows = board.length, cols = board[0].length;
    var shifted = [];
    var writeCol = 0;
    for (var c = 0; c < cols; c++) {
      var empty = true;
      for (var r = 0; r < rows; r++) {
        if (board[r][c] !== null) { empty = false; break; }
      }
      if (!empty) {
        if (writeCol !== c) {
          for (var r2 = 0; r2 < rows; r2++) {
            var val = board[r2][c];
            if (val !== null) {
              shifted.push({ from: { row: r2, col: c }, to: { row: r2, col: writeCol }, value: val });
              board[r2][writeCol] = val;
              board[r2][c] = null;
            }
          }
        }
        writeCol++;
      }
    }
    return shifted;
  }

  function baseScore(n) {
    return (n - 2) * (n - 2);
  }

  function comboMultiplier(combo, table) {
    var t = table || [1, 1.5, 2, 2.5, 3];
    var idx = Math.max(0, Math.min(combo - 1, t.length - 1));
    return t[idx];
  }

  function hasMoves(board) {
    var rows = board.length, cols = board[0].length;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var v = board[r][c];
        if (!isColor(v)) continue;
        if (r + 1 < rows && board[r + 1][c] === v) return true;
        if (c + 1 < cols && board[r][c + 1] === v) return true;
      }
    }
    return false;
  }

  function isClear(board) {
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < board[r].length; c++) {
        if (isColor(board[r][c])) return false;
      }
    }
    return true;
  }

  function countColorCells(board) {
    var n = 0;
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < board[r].length; c++) {
        if (isColor(board[r][c])) n++;
      }
    }
    return n;
  }

  function getLargestRegion(board) {
    var rows = board.length, cols = board[0].length;
    var visited = [];
    for (var i = 0; i < rows; i++) visited[i] = new Array(cols).fill(false);
    var best = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (visited[r][c] || !isColor(board[r][c])) continue;
        var group = match(board, r, c);
        if (!group) {
          visited[r][c] = true;
          continue;
        }
        for (var k = 0; k < group.length; k++) {
          visited[group[k].row][group[k].col] = true;
        }
        if (group.length > best.length) best = group;
      }
    }
    return best;
  }

  function createBoard(rows, cols, colorCount, seed, stoneCount, minLargest) {
    var rng = mulberry32(seed >>> 0);
    var attempts = 0;
    var board;
    do {
      board = [];
      for (var r = 0; r < rows; r++) {
        board[r] = [];
        for (var c = 0; c < cols; c++) {
          board[r][c] = Math.floor(rng() * colorCount);
        }
      }
      var stones = stoneCount | 0;
      var placed = 0;
      var guard = 0;
      while (placed < stones && guard < rows * cols * 4) {
        guard++;
        var sr = Math.floor(rng() * rows);
        var sc = Math.floor(rng() * cols);
        if (board[sr][sc] !== STONE) {
          board[sr][sc] = STONE;
          placed++;
        }
      }
      if (!hasMoves(board)) {
        var rr = Math.floor(rng() * (rows - 1));
        var cc = Math.floor(rng() * cols);
        var colr = Math.floor(rng() * colorCount);
        board[rr][cc] = colr;
        board[rr + 1][cc] = colr;
      }
      attempts++;
    } while (
      attempts < 60 &&
      minLargest &&
      getLargestRegion(board).length < minLargest
    );
    return board;
  }

  /**
   * Apply removal at (row,col). Mutates nothing of input board (clones).
   * comboState: { combo, lastRemoveAt }  — updated by caller clock
   */
  function removeAt(board, row, col, opts) {
    opts = opts || {};
    var cells = match(board, row, col);
    if (!cells) {
      return { ok: false, cells: null, board: board, change: null };
    }

    var b = cloneBoard(board);
    var removed = [];
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      removed.push({ at: { row: cell.row, col: cell.col }, value: cell.color });
      b[cell.row][cell.col] = null;
    }

    var moved = applyGravity(b);
    var shifted = compactLeft(b);

    var n = cells.length;
    var base = baseScore(n);
    var now = opts.now != null ? opts.now : Date.now();
    var windowMs = opts.comboWindowMs != null ? opts.comboWindowMs : 3000;
    var prevCombo = opts.combo || 0;
    var lastAt = opts.lastRemoveAt || 0;
    var combo = 1;
    if (prevCombo > 0 && lastAt && (now - lastAt) <= windowMs) {
      combo = prevCombo + 1;
    }
    var mult = comboMultiplier(combo, opts.comboMultipliers);
    var scoreGain = Math.floor(base * mult);

    var cleared = isClear(b);
    var clearBonus = 0;
    if (cleared) {
      clearBonus = opts.clearBonus != null ? opts.clearBonus : 1000;
      scoreGain += clearBonus;
    }

    return {
      ok: true,
      cells: cells,
      n: n,
      base: base,
      combo: combo,
      mult: mult,
      scoreGain: scoreGain,
      clearBonus: clearBonus,
      board: b,
      change: { removed: removed, moved: moved, shifted: shifted },
      cleared: cleared,
      hasMoves: cleared ? false : hasMoves(b),
      remaining: countColorCells(b)
    };
  }

  function centroid(cells) {
    var sr = 0, sc = 0;
    for (var i = 0; i < cells.length; i++) {
      sr += cells[i].row;
      sc += cells[i].col;
    }
    return { row: sr / cells.length, col: sc / cells.length };
  }

  global.SameGameCore = {
    STONE: STONE,
    match: match,
    removeAt: removeAt,
    hasMoves: hasMoves,
    isClear: isClear,
    isColor: isColor,
    baseScore: baseScore,
    comboMultiplier: comboMultiplier,
    createBoard: createBoard,
    cloneBoard: cloneBoard,
    countColorCells: countColorCells,
    getLargestRegion: getLargestRegion,
    centroid: centroid,
    applyGravity: applyGravity,
    compactLeft: compactLeft
  };
})(typeof window !== 'undefined' ? window : global);
