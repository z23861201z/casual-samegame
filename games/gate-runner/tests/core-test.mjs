import {
  applyGate, shootGate, damageZombie, collideCost, bossCollideLoss, fireStats, starRating,
  createLevelState, progress, kindToAssetKey, enemyHeight,
  pelletCount, visibleBodyCount, squadPlusText, gateSideAtX, mapRoadPointer, nudgeLane,
  fullBlockXs, clampCovered, maxUncoveredGap,
  twoKillsFor, threeKillsFor, levelProblems, simulateLevel, durationSeconds, finishNeed,
  closeWindowSeconds, countEnemies,
  capPeople, maxPeopleFor, clampGateValue,
  DEFAULT_MAX_PEOPLE, MAX_GATE_LINEAR, MAX_GATE_MUL,
  portraitBossFraction, bossCoversLane, playableLimit,
  BOSS_MINI_HEIGHT, BOSS_FINALE_HEIGHT, BOSS_STANDOFF, BOSS_RANGE_NEAR, BOSS_RANGE_FAR
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

assert(DEFAULT_MAX_PEOPLE === 80, 'default maxPeople is 80');
assert(MAX_GATE_LINEAR <= 99 && MAX_GATE_LINEAR >= 12, 'add/sub/fire face cap stays readable');
assert(MAX_GATE_MUL === 5, 'mul face cap stays 5');
assert(maxPeopleFor(null) === 80, 'missing level uses 80');
assert(maxPeopleFor({ maxPeople: 40 }) === 40, 'level maxPeople');
assert(maxPeopleFor({ maxPeople: 0 }) === 80, 'non-positive maxPeople ignored');
assert(capPeople(0, null) === 0, 'wipe stays 0');
assert(capPeople(1, null) === 1, 'one stays');
assert(capPeople(80, null) === 80 && capPeople(81, null) === 80, 'default cap binds');
assert(capPeople(500, { maxPeople: 36 }) === 36, 'level cap binds');
assert(capPeople(0, { maxPeople: 36 }) === 0, 'level cap keeps a wipe at 0');

// Uncapped mul is 200. This assertion goes red if applyGate stops clamping.
assert(40 * 5 > DEFAULT_MAX_PEOPLE, 'mul fixture exceeds the cap');
assert(applyGate(40, 1, { op: 'mul', value: 5 }).people === 80, 'mul cannot break 80');
assert(applyGate(40, 1, { op: 'mul', value: 5 }, { maxPeople: 36 }).people === 36, 'mul respects level maxPeople');
assert(applyGate(70, 1, { op: 'add', value: 50 }).people === 80, 'add respects cap');
assert(applyGate(6, 1, { op: 'add', value: 100000 }).people === 80, 'astronomical add cannot pass the cap');
assert(applyGate(40, 1, { op: 'sub', value: 3 }, { maxPeople: 40 }).people === 37, 'sub under the cap');
assert(applyGate(2, 1, { op: 'sub', value: 99 }).people === 1, 'sub floor still 1');
assert(applyGate(0, 1, { op: 'sub', value: 4 }).people === 1, 'sub does not leave 0');
assert(applyGate(0, 1, { op: 'mul', value: 4 }).people === 1, 'mul does not leave 0');
assert(applyGate(200, 2, { op: 'fire', value: 2 }).people === 80, 'fire pass still caps people');
assert(applyGate(200, 2, { op: 'fire', value: 2 }).firepower === 4, 'fire still adds');
assert(clampGateValue('add', 100000) === MAX_GATE_LINEAR, 'add face ceiling');
assert(clampGateValue('sub', 100000) === MAX_GATE_LINEAR, 'sub face ceiling');
assert(clampGateValue('fire', 100000) === MAX_GATE_LINEAR, 'fire face ceiling');
assert(clampGateValue('mul', 9) === 5, 'mul face ceiling');
assert(clampGateValue('fireMul', 9) === 5, 'fireMul face ceiling');

const g = shootGate({ op: 'add', value: 1, hp: 10 }, 4);
assert(g.hp === 6, 'gate hp');
assert(g.value >= 1 && g.value <= MAX_GATE_LINEAR, 'gate value');

const raised = shootGate({ op: 'add', value: 6, hp: 40 }, 4, () => 0);
assert(raised.value > 6 && raised.value <= 99, 'one burst raises add under the ceiling');

function hammer(op, value) {
  let gate = { op, value, hp: 9000 };
  for (let i = 0; i < 400; i++) gate = shootGate(gate, 12, () => 0);
  return gate;
}
const addFace = hammer('add', 6);
const subFace = hammer('sub', 2);
const fireFace = hammer('fire', 1);
assert(addFace.value === MAX_GATE_LINEAR && addFace.value <= 99, `add face ${addFace.value}`);
assert(subFace.value === MAX_GATE_LINEAR && subFace.value <= 99, `sub face ${subFace.value}`);
assert(fireFace.value === MAX_GATE_LINEAR && fireFace.value <= 99, `fire face ${fireFace.value}`);
assert(applyGate(6, 1, addFace).people === 80, 'passing a maxed add gate fills to 80 and stops');
assert(applyGate(50, 1, { op: 'mul', value: hammer('mul', 2).value }).people <= 80, 'shot mul still caps people');

let mulFace = { op: 'mul', value: 2, hp: 40 };
for (let i = 0; i < 8; i++) mulFace = shootGate(mulFace, 3, () => 0);
assert(mulFace.value === 5, 'mul climbs to 5 and stops');
assert(shootGate({ op: 'mul', value: 2, hp: 10 }, 4, () => 1).value === 2, 'mul stays put without the proc');
assert(shootGate({ op: 'fireMul', value: 5, hp: 10 }, 4, () => 0).value === 5, 'fireMul stays at 5');

assert(createLevelState({ startPeople: 200, startFirepower: 1, length: 100 }).people === 80, 'start people capped');
assert(createLevelState({ startPeople: 200, startFirepower: 1, length: 100, maxPeople: 25 }).people === 25, 'start uses level cap');

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
assert(enemyHeight('dragon-evolved', true, 2.3, false) === BOSS_FINALE_HEIGHT, 'finale ignores 2.3 squash');
assert(enemyHeight('dragon-evolved', true, 3.4, true) === BOSS_MINI_HEIGHT, 'mini ignores safety scale');
assert(BOSS_FINALE_HEIGHT > 8 && BOSS_MINI_HEIGHT > 8, 'boss world height stays tall');
assert(BOSS_STANDOFF >= BOSS_RANGE_NEAR && BOSS_STANDOFF <= BOSS_RANGE_FAR, 'standoff inside 16-22');
assert(bossCoversLane(0, playableLimit(3.2), 3.2) && bossCoversLane(0, -playableLimit(3.2), 3.2), 'boss covers both clamps');
for (const d of [BOSS_RANGE_NEAR, BOSS_STANDOFF, BOSS_RANGE_FAR]) {
  const miniF = portraitBossFraction(BOSS_MINI_HEIGHT, d);
  const finF = portraitBossFraction(BOSS_FINALE_HEIGHT, d);
  assert(miniF >= 0.28 && miniF <= 0.40, `mini screen fraction @${d} ${miniF.toFixed(3)}`);
  assert(finF >= 0.35 && finF <= 0.50, `finale screen fraction @${d} ${finF.toFixed(3)}`);
}
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
assert(levels[4].events.find(e => e.type === 'boss').scale === BOSS_MINI_HEIGHT, 'L5 boss scale');
assert(levels[9].events.find(e => e.type === 'boss').scale === BOSS_FINALE_HEIGHT, 'L10 boss scale');

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

const DURATION = { 1: 20, 2: 19, 3: 21, 4: 22, 5: 23, 6: 20, 7: 24, 8: 18, 9: 25, 10: 26 };

function specCap(lv) {
  return (typeof lv.maxPeople === 'number' && Number.isFinite(lv.maxPeople) && lv.maxPeople >= 1)
    ? Math.floor(lv.maxPeople)
    : 80;
}

const rows = [];
for (const lv of levels) {
  const probs = levelProblems(lv);
  assert(probs.length === 0, `L${lv.id} contract: ${probs.join('; ')}`);
  const dur = durationSeconds(lv);
  assert(Math.abs(dur - DURATION[lv.id]) < 1e-9, `L${lv.id} duration changed to ${dur}`);
  const cap = specCap(lv);
  assert(maxPeopleFor(lv) === cap, `maxPeopleFor L${lv.id}`);
  const serious = simulateLevel(lv, 'serious');
  const edge = simulateLevel(lv, 'edge');
  const edgeLeft = simulateLevel(lv, 'edge-left');
  const needKills = threeKillsFor(lv);
  assert(serious.won && serious.stars === 3, `serious L${lv.id} won=${serious.won} stars=${serious.stars} reason=${serious.reason} k=${serious.kills} people=${serious.people}`);
  assert(serious.kills >= needKills, `serious L${lv.id} kills ${serious.kills} < ${needKills}`);
  assert(serious.people <= cap, `serious L${lv.id} people ${serious.people} > maxPeople ${cap}`);
  assert(edge.people <= cap && edgeLeft.people <= cap, `edge L${lv.id} people over cap`);
  assert(!edge.won && edge.stars === 0, `edge L${lv.id} won=${edge.won} reason=${edge.reason}`);
  assert(!edgeLeft.won && edgeLeft.stars === 0, `edge-left L${lv.id} won=${edgeLeft.won} reason=${edgeLeft.reason}`);
  if (lv.id === 5 || lv.id === 10) {
    const killT = serious.bossKillT - serious.bossEngageT;
    assert(killT >= 5 && killT <= 8, `serious L${lv.id} boss kill ${killT}`);
    const wipeT = edge.bossWipeT - edge.bossEngageT;
    const wipeL = edgeLeft.bossWipeT - edgeLeft.bossEngageT;
    assert(edge.bossKillT == null && wipeT > 0 && wipeT <= 12, `edge L${lv.id} wipe ${wipeT}`);
    assert(edgeLeft.bossKillT == null && wipeL > 0 && wipeL <= 12, `edge-left L${lv.id} wipe ${wipeL}`);
    for (const run of [serious, edge, edgeLeft]) {
      assert(run.bossMinDist >= BOSS_RANGE_NEAR - 1e-3 && run.bossMaxDist <= BOSS_RANGE_FAR + 1e-3,
        `L${lv.id} boss left the 16-22 band ${run.bossMinDist}..${run.bossMaxDist}`);
    }
  }
  rows.push({
    id: lv.id,
    dur: +dur.toFixed(2),
    maxPeople: cap,
    serious: { won: serious.won, stars: serious.stars, kills: serious.kills, people: serious.people, firepower: serious.firepower, reason: serious.reason, t: +serious.t.toFixed(2) },
    edge: { won: edge.won, stars: edge.stars, people: edge.people, kills: edge.kills, reason: edge.reason },
    edgeLeft: { won: edgeLeft.won, reason: edgeLeft.reason, people: edgeLeft.people }
  });
}

const mainSrc = readFileSync(join(here, '../js/main.js'), 'utf8');
const coreSrc = readFileSync(join(here, '../js/core.js'), 'utf8');
const audioSrc = readFileSync(join(here, '../js/audio.js'), 'utf8');
const html = readFileSync(join(here, '../index.html'), 'utf8');
const simSrc = coreSrc.slice(coreSrc.indexOf('export function simulateLevel'), coreSrc.indexOf('export function levelProblems'));
const applySrc = coreSrc.slice(coreSrc.indexOf('export function applyGate'), coreSrc.indexOf('export function shootGate'));
const shootSrc = coreSrc.slice(coreSrc.indexOf('export function shootGate'), coreSrc.indexOf('export function damageZombie'));
const createSrc = coreSrc.slice(coreSrc.indexOf('export function createLevelState'), coreSrc.indexOf('export function progress'));
for (const snippet of [
  'let people = capPeople(',
  'people = capPeople(collideCost',
  'people = capPeople(0',
  'people = capPeople(next.people'
]) {
  assert(simSrc.includes(snippet), `simulateLevel missing ${snippet}`);
}
assert(applySrc.includes('capPeople('), 'applyGate caps people');
assert(shootSrc.includes('clampGateValue'), 'shootGate caps face numbers');
assert(createSrc.includes('capPeople('), 'createLevelState caps people');
assert(mainSrc.includes('capPeople(collideCost'), 'main collide uses capPeople');
assert(mainSrc.includes('BOSS_CORPSE_DUR = 0.72'), 'boss corpse hold stays 0.72');
assert(mainSrc.includes('bossCoversLane'), 'main boss threat covers the lane');
assert(mainSrc.includes('BOSS_CAM_BACK'), 'boss camera pulls back');
assert(mainSrc.includes('capPeople(next.people'), 'main gate uses capPeople');
assert(mainSrc.includes('shownPeople'), 'HUD reads the capped count');
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
  peopleWithinCap: rows.every(r => r.serious.people <= r.maxPeople && r.edge.people <= r.maxPeople && r.edgeLeft.people <= r.maxPeople),
  maxSeriousPeople: Math.max(...rows.map(r => r.serious.people)),
  rows
};
console.log('gate-runner core-test: OK');
console.log(JSON.stringify(summary, null, 2));
