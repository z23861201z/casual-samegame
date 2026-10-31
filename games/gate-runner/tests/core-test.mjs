import {
  applyGate, shootGate, damageZombie, collideCost, fireStats, starRating,
  createLevelState, progress, kindToAssetKey, enemyHeight
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
assert(applyGate(3, 1, { op: 'fire', value: 2 }).firepower === 3, 'fire add');
assert(applyGate(3, 2, { op: 'fireMul', value: 2 }).firepower === 4, 'fire mul');

const g = shootGate({ op: 'add', value: 1, hp: 10 }, 4);
assert(g.hp === 6, 'gate hp');
assert(g.value >= 1, 'gate value');

const z = damageZombie({ hp: 5 }, 5);
assert(z.dead && z.hp === 0, 'zombie dead');

assert(collideCost(5, 4) === 3, 'collide cost');
assert(fireStats(9, 2).pellets >= 2, 'pellets');

// Legacy stars
assert(starRating({ won: true, people: 16, kills: 15, score: 900 }) === 3, 'legacy stars');

const level = {
  id: 4,
  startPeople: 10,
  startFirepower: 1,
  length: 100,
  stars: { twoPeople: 12, threePeople: 18, threeFirepower: 3 }
};
assert(starRating({ won: true, people: 10, firepower: 1 }, level) === 1, 'clear 1 star');
assert(starRating({ won: true, people: 12, firepower: 1 }, level) === 2, 'people 2 star');
assert(starRating({ won: true, people: 18, firepower: 3 }, level) === 3, 'people+fp 3 star');
assert(starRating({ won: false, people: 99, firepower: 9 }, level) === 0, 'lose 0');

assert(progress(createLevelState({ startPeople: 1, startFirepower: 1, length: 100 })) === 0, 'progress0');
assert(kindToAssetKey('dragon-evolved') === 'dragonEvolved', 'kind map');
assert(kindToAssetKey('orc') === 'orc', 'orc map');
assert(enemyHeight('yeti') > enemyHeight('zombie-half'), 'yeti taller');

const here = dirname(fileURLToPath(import.meta.url));
const levels = JSON.parse(readFileSync(join(here, '../data/levels.json'), 'utf8'));
assert(levels.length === 10, '10 levels');
const kinds = new Set();
let hasMini = false, hasFinale = false;
for (const lv of levels) {
  assert(lv.stars?.twoPeople && lv.stars?.threePeople && lv.stars?.threeFirepower, `stars L${lv.id}`);
  for (const ev of lv.events) {
    if (ev.kind) kinds.add(ev.kind);
    if (ev.type === 'boss' && ev.mini) hasMini = true;
    if (ev.type === 'boss' && !ev.mini) hasFinale = true;
  }
}
for (const k of ['zombie', 'zombie-half', 'big-arm', 'orc', 'demon', 'yeti', 'dragon-evolved']) {
  assert(kinds.has(k), `kind present: ${k}`);
}
assert(hasMini && hasFinale, 'mini + finale boss');
assert(levels[4].id === 5 && levels[4].events.some(e => e.type === 'boss'), 'L5 boss');
assert(levels[9].id === 10 && levels[9].events.some(e => e.type === 'boss' && !e.mini), 'L10 boss');

console.log('gate-runner core-test: OK');
