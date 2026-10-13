/**
 * Node-runnable core logic tests. Usage: node tests/core-test.js
 */
var path = require('path');
var fs = require('fs');
var vm = require('vm');

var code = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
var ctx = { console: console, Math: Math, Date: Date, performance: { now: Date.now } };
ctx.global = ctx;
ctx.window = undefined;
vm.runInNewContext(code, ctx);
var Core = ctx.SameGameCore;
if (!Core) throw new Error('SameGameCore not loaded');

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.log('  ✗', msg); }
}

console.log('=== SameGame Core Tests ===');

(function () {
  var b = [[0, 0, 1],[2, 1, 2],[1, 2, 1]];
  var m = Core.match(b, 0, 0);
  assert(m && m.length === 2, 'horizontal pair match size=2');
  assert(Core.match(b, 1, 0) === null, 'single cell no match');
})();

(function () {
  var b = [[0, 0, 1],[0, 2, 2],[1, 1, 2]];
  var m = Core.match(b, 0, 0);
  assert(m && m.length === 3, 'L-shape size=3');
})();

(function () {
  var b = [[0, 1],[null, 1],[0, null]];
  var moved = Core.applyGravity(b);
  assert(b[2][0] === 0 && b[1][0] === 0 && b[0][0] === null, 'gravity sinks col0');
  assert(b[2][1] === 1 && b[1][1] === 1 && b[0][1] === null, 'gravity sinks col1');
  assert(moved.length >= 2, 'moved events recorded');
})();

(function () {
  var b = [[null, 1, null, 2],[null, 1, null, 2],[null, 0, null, 0]];
  var shifted = Core.compactLeft(b);
  assert(b[0][0] === 1 && b[0][1] === 2, 'columns compacted left');
  assert(b[0][2] === null && b[0][3] === null, 'right pads empty');
  assert(shifted.length > 0, 'shifted events');
})();

assert(Core.baseScore(2) === 0, 'base (2-2)^2 = 0');
assert(Core.baseScore(5) === 9, 'base (5-2)^2 = 9');
assert(Core.comboMultiplier(1) === 1, 'combo1 x1');
assert(Core.comboMultiplier(3) === 2, 'combo3 x2');
assert(Core.comboMultiplier(9) === 3, 'combo cap x3');

(function () {
  var b = [[0, 0],[0, 0]];
  var r = Core.removeAt(b, 0, 0, { clearBonus: 1000, combo: 0 });
  assert(r.ok && r.n === 4, 'remove all 4');
  assert(r.cleared, 'board cleared');
  assert(r.scoreGain === 4 + 1000, 'base 4 + clear 1000');
  assert(Core.isClear(r.board), 'isClear');
})();

(function () {
  var b = [[Core.STONE, 0],[0, 1]];
  assert(Core.match(b, 0, 0) === null, 'stone not matchable');
  assert(Core.match(b, 1, 0) === null, 'color adjacent to stone only size1');
})();

(function () {
  var dead = [[0, 1, 0],[1, 0, 1],[0, 1, 0]];
  assert(!Core.hasMoves(dead), 'checkerboard dead');
  var live = [[0, 0, 1],[1, 2, 1],[2, 1, 2]];
  assert(Core.hasMoves(live), 'has pair');
})();

(function () {
  var a = Core.createBoard(8, 8, 3, 1001, 0, 0);
  var b = Core.createBoard(8, 8, 3, 1001, 0, 0);
  assert(JSON.stringify(a) === JSON.stringify(b), 'same seed same board');
  assert(Core.hasMoves(a), 'generated playable');
})();

(function () {
  var b = Core.createBoard(10, 12, 4, 6006, 5, 0);
  var stones = 0;
  for (var r = 0; r < b.length; r++)
    for (var c = 0; c < b[0].length; c++)
      if (b[r][c] === Core.STONE) stones++;
  assert(stones === 5, 'stoneCount=5 placed');
})();

(function () {
  var b = [[0,0,1],[1,2,1],[2,1,2]];
  var r1 = Core.removeAt(b, 0, 0, { now: 1000, combo: 0, lastRemoveAt: 0 });
  assert(r1.combo === 1, 'first combo=1');
  var r2 = Core.removeAt(r1.board, 0, 0, {
    now: 2000, combo: r1.combo, lastRemoveAt: 1000, comboWindowMs: 3000
  });
  assert(typeof r2.ok === 'boolean', 'second remove returns ok flag');
})();

(function () {
  var levels = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/levels.json'), 'utf8'));
  assert(levels.levels.length >= 10, '>=10 levels');
  levels.levels.forEach(function (lv) {
    var board = Core.createBoard(lv.rows, lv.cols, lv.colorCount, lv.seed, lv.stoneCount || 0, lv.minLargestGroup || 0);
    assert(Core.hasMoves(board), 'level ' + lv.id + ' playable');
  });
})();

function greedyReach(lv) {
  var board = Core.createBoard(lv.rows, lv.cols, lv.colorCount, lv.seed, lv.stoneCount || 0, lv.minLargestGroup || 0);
  var score = 0, combo = 0, last = 0, moves = 0;
  var limit = lv.moveLimit == null ? 120 : lv.moveLimit;
  for (var step = 0; step < limit; step++) {
    if (!Core.hasMoves(board)) break;
    var best = Core.getLargestRegion(board);
    if (!best.length) break;
    var r = Core.removeAt(board, best[0].row, best[0].col, {
      now: step * 400, lastRemoveAt: last, combo: combo,
      comboWindowMs: 3000, clearBonus: lv.clearBonus
    });
    if (!r.ok) break;
    board = r.board; score += r.scoreGain; combo = r.combo; last = step * 400; moves++;
    if (r.cleared || score >= lv.targetScore) break;
  }
  return { score: score, moves: moves, cleared: Core.isClear(board) };
}

(function () {
  var levels = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/levels.json'), 'utf8'));
  var r1 = greedyReach(levels.levels[0]);
  console.log('  · Level1 greedy: score=' + r1.score + ' moves=' + r1.moves + ' target=' + levels.levels[0].targetScore);
  assert(r1.score >= levels.levels[0].targetScore, 'level1 greedy reaches target');
  var r2 = greedyReach(levels.levels[1]);
  console.log('  · Level2 greedy: score=' + r2.score + ' moves=' + r2.moves + ' target=' + levels.levels[1].targetScore);
  assert(r2.score >= levels.levels[1].targetScore, 'level2 greedy reaches target');
  var r3 = greedyReach(levels.levels[2]);
  console.log('  · Level3 greedy: score=' + r3.score + ' moves=' + r3.moves + ' target=' + levels.levels[2].targetScore);
  assert(r3.score >= levels.levels[2].targetScore, 'level3 greedy reaches target');
})();

console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
