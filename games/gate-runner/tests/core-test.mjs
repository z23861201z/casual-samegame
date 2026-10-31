import {
  applyGate, shootGate, damageZombie, collideCost, fireStats, starRating, createLevelState, progress
} from '../js/core.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(applyGate(3, 1, { op: 'add', value: 8 }).people === 11, 'add people');
assert(applyGate(4, 1, { op: 'mul', value: 2 }).people === 8, 'mul people');
assert(applyGate(5, 1, { op: 'sub', value: 2 }).people === 3, 'sub people');
assert(applyGate(3, 1, { op: 'fire', value: 2 }).firepower === 3, 'fire add');

const g = shootGate({ op: 'add', value: 1, hp: 10 }, 4);
assert(g.hp === 6, 'gate hp');
assert(g.value >= 1, 'gate value');

const z = damageZombie({ hp: 5 }, 5);
assert(z.dead && z.hp === 0, 'zombie dead');

assert(collideCost(5, 4) === 3, 'collide cost');
assert(fireStats(9, 2).pellets >= 2, 'pellets');
assert(starRating({ won: true, people: 16, kills: 15, score: 900 }) === 3, 'stars');
assert(progress(createLevelState({ startPeople: 1, startFirepower: 1, length: 100 })) === 0, 'progress0');

console.log('gate-runner core-test: OK');
