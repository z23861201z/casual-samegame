/** Pure logic for Gate Runner — Node-testable, no Three.js. */

export function applyGate(people, firepower, gate) {
  const op = gate.op;
  const v = Math.max(1, Math.floor(gate.value || 1));
  let p = people;
  let f = firepower;
  if (op === 'add') p += v;
  else if (op === 'mul') p = Math.max(1, Math.floor(p * v));
  else if (op === 'sub') p = Math.max(0, p - v);
  else if (op === 'fire') f += v;
  else if (op === 'fireMul') f = Math.max(1, Math.floor(f * v));
  return { people: p, firepower: f };
}

export function shootGate(gate, damage) {
  const hp = Math.max(0, (gate.hp ?? 0) - damage);
  let value = gate.value;
  if (gate.op === 'add' || gate.op === 'sub' || gate.op === 'fire') {
    value = Math.max(1, Math.floor((gate.value || 1) + Math.max(1, Math.floor(damage / 2))));
  } else if (gate.op === 'mul' || gate.op === 'fireMul') {
    if (damage > 0 && Math.random() < 0.15) value = Math.min(5, (gate.value || 2) + 1);
  }
  const widthScale = 0.55 + Math.min(1.2, value / 20);
  return { ...gate, hp, value, widthScale };
}

export function damageZombie(z, damage) {
  const hp = Math.max(0, z.hp - damage);
  return { ...z, hp, dead: hp <= 0 };
}

export function collideCost(people, enemyHp) {
  const loss = Math.max(1, Math.ceil(enemyHp / 2));
  return Math.max(0, people - loss);
}

export function fireStats(people, firepower) {
  const pellets = Math.min(7, 1 + Math.floor((people - 1) / 3) + Math.max(0, firepower - 1));
  const damage = Math.max(1, firepower);
  const interval = Math.max(0.08, 0.28 - people * 0.008 - firepower * 0.01);
  return { pellets, damage, interval };
}

/**
 * Star thresholds from level data:
 * clear = 1★; people >= twoPeople = 2★; people+firepower thresholds = 3★.
 * Legacy fallback retained for older callers/tests without level.stars.
 */
export function starRating(state, level = null) {
  if (!state?.won) return 0;
  const people = state.people ?? 0;
  const firepower = state.firepower ?? 1;
  const kills = state.kills ?? 0;
  const score = state.score ?? 0;
  const starsCfg = level?.stars;
  if (starsCfg) {
    let stars = 1;
    const two = starsCfg.twoPeople ?? 8;
    const threeP = starsCfg.threePeople ?? 15;
    const threeF = starsCfg.threeFirepower ?? 2;
    if (people >= two) stars = 2;
    if (people >= threeP && firepower >= threeF) stars = 3;
    return stars;
  }
  let stars = 1;
  if (people >= 8 || kills >= 10) stars = 2;
  if (people >= 15 && kills >= 14 && score >= 800) stars = 3;
  return stars;
}

export function createLevelState(level) {
  return {
    levelId: level.id ?? 1,
    z: 0,
    people: level.startPeople,
    firepower: level.startFirepower,
    score: 0,
    kills: 0,
    won: false,
    lost: false,
    finished: false,
    length: level.length,
    bossDefeated: false
  };
}

export function progress(state) {
  return Math.max(0, Math.min(1, state.z / state.length));
}

export function kindToAssetKey(kind) {
  switch (kind) {
    case 'zombie-half': return 'zombieHalf';
    case 'big-arm': return 'bigArm';
    case 'orc': return 'orc';
    case 'demon': return 'demon';
    case 'yeti': return 'yeti';
    case 'dragon-evolved': return 'dragonEvolved';
    case 'zombie':
    default: return 'zombie';
  }
}

export function enemyHeight(kind, isBoss = false, scaleHint = null) {
  if (scaleHint) return scaleHint;
  if (isBoss || kind === 'dragon-evolved') return 4.0;
  switch (kind) {
    case 'big-arm': return 3.05;
    case 'orc': return 2.95;
    case 'demon': return 3.0;
    case 'yeti': return 3.15;
    case 'zombie-half': return 2.45;
    default: return 2.65;
  }
}
