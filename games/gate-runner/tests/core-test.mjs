import {
  applyGate, shootGate, damageZombie, collideCost, bossCollideLoss, fireStats, starRating,
  createLevelState, progress, kindToAssetKey, enemyHeight,
  pelletCount, visibleBodyCount, squadPlusText, gateSideAtX, mapRoadPointer, nudgeLane,
  fullBlockXs, clampCovered, maxUncoveredGap,
  twoKillsFor, threeKillsFor, levelProblems, simulateLevel, durationSeconds, finishNeed,
  closeWindowSeconds, countEnemies
} from '../js/core.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(applyGate(3, 1, { op: 'add', value: 8 }).people === 11, 'add people');
assert(applyGate(4, 1, { op: 'mul', value: 2 }).people === 8, 'mul people');
assert(applyGate(5, 1, { op: 'sub', value: 2 }).people === 3, 'sub people');
assert(applyGate(1, 1, { op: 'sub', value: 5 }).people === 1, 'sub floor 1');
assert(applyGate(3, 1, { op: 'fire', value: 2 }).firepower === 3, 'fire add');
assert(applyGate(3, 2, { op: 'fireMul', value: 2 }).firepower === 4, 'fire mul');

const g = shootGate({ op: 'add', value: 1, hp: 10 }, 4);
assert(g.hp === 6, 'gate hp');
assert(g.value >= 1, 'gate value');

const z = damageZombie({ hp: 5 }, 5);
assert(z.dead && z.hp === 0, 'zombie dead');

assert(collideCost(5, 4) === 3, 'collide cost');
assert(bossCollideLoss(true) === 2, 'mini boss collide loss');
assert(bossCollideLoss(false) === 3, 'finale boss collide loss');
assert(collideCost(10, 45, { boss: true, mini: true }) === 8, 'mini boss collide people');
assert(collideCost(10, 120, { boss: true, mini: false }) === 7, 'finale boss collide people');
assert(collideCost(10, 45) === 0, 'legacy collide still harsh without boss flag');

assert(pelletCount(1) === 1 && pelletCount(3) === 1, 'pellet tier 1');
assert(pelletCount(4) === 3 && pelletCount(7) === 3, 'pellet tier 4');
assert(pelletCount(8) === 5 && pelletCount(15) === 5, 'pellet tier 8');
assert(pelletCount(16) === 7 && pelletCount(24) === 7, 'pellet tier 16 cap 7');
assert(fireStats(16, 1).pellets !== fireStats(3, 1).pellets, '16 and 3 pellets differ');
assert(fireStats(9, 2).pellets >= 2, 'pellets');

assert(visibleBodyCount(1) === 1 && visibleBodyCount(3) === 3, 'squad 1-3');
assert(visibleBodyCount(4) >= 5 && visibleBodyCount(8) >= 5, 'squad 4-8');
assert(visibleBodyCount(9) >= 7 && visibleBodyCount(9) <= 10, 'squad 9');
assert(visibleBodyCount(24) >= 7 && visibleBodyCount(24) <= 10, 'squad cap');
assert(squadPlusText(8) === '', 'no plus under 9');
assert(squadPlusText(9) === `+${9 - visibleBodyCount(9)}`, 'plus at 9');
assert(squadPlusText(24).startsWith('+'), 'plus at 24');

assert(gateSideAtX(0, 3.2) === -1, 'center takes left gate');
assert(gateSideAtX(0.2, 3.2) === 1, 'right mouth');
assert(gateSideAtX(-0.2, 3.2) === -1, 'left mouth');
assert(gateSideAtX(2.8, 3.2) === 0 && gateSideAtX(-2.8, 3.2) === 0, 'rails miss both gates');

assert(Math.abs(mapRoadPointer(100, 100, 300, 3.2) - (-2.8)) < 1e-6, 'pointer left edge');
assert(Math.abs(mapRoadPointer(200, 100, 300, 3.2)) < 1e-6, 'pointer center');
assert(Math.abs(mapRoadPointer(300, 100, 300, 3.2) - 2.8) < 1e-6, 'pointer right edge');
assert(Math.abs(mapRoadPointer(300, 300, 100, 3.2) - (-2.8)) < 1e-6, 'mirrored span left');
assert(Math.abs(mapRoadPointer(100, 300, 100, 3.2) - 2.8) < 1e-6, 'mirrored span right');
assert(nudgeLane(0, 1, 3.2) === 0.45, 'key step +');
assert(nudgeLane(0, -1, 3.2) === -0.45, 'key step -');
assert(Math.abs(nudgeLane(2.8, 1, 3.2) - 2.8) < 1e-9, 'key clamp');

assert(starRating({ won: true, people: 16, kills: 15, score: 900 }) === 3, 'legacy stars');
assert(starRating({ won: false, people: 99, firepower: 9, kills: 99 }) === 0, 'lose 0');

assert(progress(createLevelState({ startPeople: 1, startFirepower: 1, length: 100 })) === 0, 'progress0');
assert(kindToAssetKey('dragon-evolved') === 'dragonEvolved', 'kind map');
assert(kindToAssetKey('orc') === 'orc', 'orc map');
assert(enemyHeight('yeti') > enemyHeight('zombie-half'), 'yeti taller');
assert(closeWindowSeconds(9) === 0.8, 'close window');

const here = dirname(fileURLToPath(import.meta.url));
const levels = JSON.parse(readFileSync(join(here, '../data/levels.json'), 'utf8'));
const level1 = JSON.parse(readFileSync(join(here, '../data/level1.json'), 'utf8'));
assert(levels.length === 10, '10 levels');
assert(JSON.stringify(level1) === JSON.stringify(levels[0]), 'level1 matches levels[0]');
assert(!JSON.stringify(levels).includes('readableWave'), 'no readableWave field');

const kinds = new Set();
let hasMini = false, hasFinale = false, tough = 0;
for (const lv of levels) {
  assert(lv.stars?.threePeople && lv.stars?.threeFirepower, `stars L${lv.id}`);
  assert(lv.startPeople < finishNeed(lv), `start < need L${lv.id}`);
  if (finishNeed(lv) >= lv.startPeople + 6) tough += 1;
  for (const ev of lv.events) {
    if (ev.kind) kinds.add(ev.kind);
    if (ev.type === 'boss' && ev.mini) hasMini = true;
    if (ev.type === 'boss' && !ev.mini) hasFinale = true;
    if (ev.type === 'zombies' && ev.block === 'full') {
      const xs = fullBlockXs(lv.roadHalfWidth, ev.count);
      assert(clampCovered(lv.roadHalfWidth, xs), `full block covers clamps L${lv.id}`);
      assert(maxUncoveredGap(lv.roadHalfWidth, xs) <= 0.8 + 1e-6, `full block gap L${lv.id}`);
    }
  }
}
assert(tough >= 6, 'at least 6 levels need start+6');
for (const k of ['zombie', 'zombie-half', 'big-arm', 'orc', 'demon', 'yeti', 'dragon-evolved']) {
  assert(kinds.has(k), `kind present: ${k}`);
}
assert(hasMini && hasFinale, 'mini + finale boss');
assert(levels[4].id === 5 && levels[4].events.some(e => e.type === 'boss'), 'L5 boss');
assert(levels[9].id === 10 && levels[9].events.some(e => e.type === 'boss' && !e.mini), 'L10 boss');

const l1 = levels[0];
const two = twoKillsFor(l1);
const three = threeKillsFor(l1);
assert(countEnemies(l1) > 0 && two >= 1 && three > two, 'kill thresholds');
assert(starRating({ won: true, people: 999, firepower: 99, kills: 0 }, l1) === 1, 'clear without kills is 1');
assert(starRating({ won: true, people: 1, firepower: 1, kills: two }, l1) === 2, 'kills make 2');
assert(starRating({
  won: true, people: l1.stars.threePeople, firepower: l1.stars.threeFirepower, kills: two
}, l1) === 2, 'people+fp without 70% kills stays 2');
assert(starRating({
  won: true, people: l1.stars.threePeople, firepower: l1.stars.threeFirepower, kills: three
}, l1) === 3, 'people+fp+kills is 3');
assert(starRating({ won: false, people: 999, firepower: 99, kills: 999 }, l1) === 0, 'lose stays 0');

const broken = structuredClone(l1);
broken.startPeople = finishNeed(broken);
const brokenProblems = levelProblems(broken);
assert(brokenProblems.some(p => p.includes('startPeople')), `old threshold must fail, got ${brokenProblems.join(',')}`);

const rows = [];
for (const lv of levels) {
  const probs = levelProblems(lv);
  assert(probs.length === 0, `L${lv.id} contract: ${probs.join('; ')}`);
  const serious = simulateLevel(lv, 'serious');
  const edge = simulateLevel(lv, 'edge');
  const edgeLeft = simulateLevel(lv, 'edge-left');
  const needKills = threeKillsFor(lv);
  assert(serious.won && serious.stars === 3, `serious L${lv.id} won=${serious.won} stars=${serious.stars} reason=${serious.reason} k=${serious.kills}`);
  assert(serious.kills >= needKills, `serious L${lv.id} kills ${serious.kills} < ${needKills}`);
  assert(!edge.won && edge.stars === 0, `edge L${lv.id} won=${edge.won} reason=${edge.reason}`);
  assert(!edgeLeft.won && edgeLeft.stars === 0, `edge-left L${lv.id} won=${edgeLeft.won} reason=${edgeLeft.reason}`);
  rows.push({
    id: lv.id,
    dur: +durationSeconds(lv).toFixed(2),
    serious: { won: serious.won, stars: serious.stars, kills: serious.kills, people: serious.people, reason: serious.reason, t: +serious.t.toFixed(2) },
    edge: { won: edge.won, stars: edge.stars, people: edge.people, kills: edge.kills, reason: edge.reason },
    edgeLeft: { won: edgeLeft.won, reason: edgeLeft.reason, people: edgeLeft.people }
  });
}

const mainSrc = readFileSync(join(here, '../js/main.js'), 'utf8');
const audioSrc = readFileSync(join(here, '../js/audio.js'), 'utf8');
const html = readFileSync(join(here, '../index.html'), 'utf8');
for (const banned of ['readableWave', 'showcaseHold', 'setTimeout', 'playerX * 0.08', 'clientX / innerWidth', 'innerWidth) * 2']) {
  assert(!mainSrc.includes(banned), `main.js still has ${banned}`);
}
for (const need of ['mapRoadPointer', 'gateSideAtX', 'fullBlockXs', 'nudgeLane', 'createAudio', 'playDeath', 'stepBossZ', 'visibleBodyCount']) {
  assert(mainSrc.includes(need), `main.js missing ${need}`);
}
for (const name of ['playShoot', 'playGateHit', 'playGateUp', 'playGateDown', 'playHit', 'playDeath', 'playLosePeople', 'playWin', 'playLose', 'gate-runner-muted']) {
  assert(audioSrc.includes(name), `audio missing ${name}`);
}
assert(html.includes('id="btnMute"'), 'mute button');
assert(!audioSrc.includes('setTimeout'), 'audio schedules on the audio clock');

const summary = {
  l1Duration: rows[0].dur,
  l10Duration: rows[9].dur,
  seriousAllThreeStar: rows.every(r => r.serious.won && r.serious.stars === 3),
  edgeAllLose: rows.every(r => r.edge.won === false && r.edgeLeft.won === false),
  rows
};
console.log('gate-runner core-test: OK');
console.log(JSON.stringify(summary, null, 2));
