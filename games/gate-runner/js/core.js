/** Pure logic for Gate Runner — Node-testable, no Three.js. */

export const EDGE_INSET = 0.4;
export const KEY_NUDGE = 0.45;
export const ENEMY_BODY_X = 0.85;
export const ENEMY_BODY_Z = 0.9;
export const ENEMY_BULLET_X = 0.55;
export const ENEMY_BULLET_Z = 0.7;
export const BOSS_BODY_Z = 1.6;
export const BOSS_BULLET_Z = 1.25;
/** Fight distance once the boss appears. Kept inside 16–22 the whole duel. */
export const BOSS_RANGE_NEAR = 16;
export const BOSS_RANGE_FAR = 22;
export const BOSS_STANDOFF = 19;
export const BOSS_LEASH_SECONDS = 8;
/** Flat chip cadence. Four hits wipe an edge squad inside 12s; a serious squad lives through a 5–8s kill. */
export const BOSS_STRIKE_INTERVAL = 2.2;
/** World height tuned for the pulled-back portrait boss camera, not a ~2.3 safety squash. */
export const BOSS_MINI_HEIGHT = 10.8;
export const BOSS_FINALE_HEIGHT = 14;
export const CAM_FOV = 50;
export const CAM_BACK = 14;
export const CAM_Y = 3.15;
export const CAM_LOOK_Y = 1.25;
export const CAM_LOOK_AHEAD = 0.6;
export const BOSS_CAM_BACK = 17.5;
export const BOSS_CAM_Y = 5.4;
export const BOSS_CAM_LOOK_Y = 3.6;
export const BOSS_CAM_LOOK_AHEAD = 7;
export const GATE_VIS_X = 1.15;
export const GATE_BULLET_X = 0.95;
export const GATE_BULLET_Z = 0.55;
export const GATE_PASS_OUTER = 1.7;
export const BULLET_SPEED = 42;
export const BULLET_LIFE = 1.2;
export const BULLET_MAX_AHEAD = 40;
export const FULL_BLOCK_MAX_GAP = 0.8;
export const PLAYER_SMOOTH = 26;
export const SERIOUS_LANE = 0.65;
/** Squad ceiling when a level does not set `maxPeople`. */
export const DEFAULT_MAX_PEOPLE = 80;
/** add/sub/fire face numbers stay two digits. Width already saturates by value/20. */
export const MAX_GATE_LINEAR = 99;
/** mul / fireMul face numbers. Shooting may climb, never past this. */
export const MAX_GATE_MUL = 5;

export function playableLimit(roadHalfWidth) {
  return roadHalfWidth - EDGE_INSET;
}

export function clampLane(x, roadHalfWidth) {
  const m = playableLimit(roadHalfWidth);
  return Math.max(-m, Math.min(m, x));
}

/** A/D and arrows: one tap steps 0.45 world units. Sign is chosen by the caller. */
export function nudgeLane(x, dir, roadHalfWidth) {
  const s = dir < 0 ? -1 : 1;
  return clampLane(x + s * KEY_NUDGE, roadHalfWidth);
}

/**
 * Absolute pointer map. `screenLeft` / `screenRight` are the road edges
 * projected to CSS pixels (they may sit outside the canvas). Not a
 * (clientX / innerWidth) * 2 - 1 delta.
 */
export function mapRoadPointer(clientX, screenLeft, screenRight, roadHalfWidth) {
  const span = screenRight - screenLeft;
  if (!Number.isFinite(span) || Math.abs(span) < 1e-4) return 0;
  const f = (clientX - screenLeft) / span;
  const raw = -roadHalfWidth + f * (roadHalfWidth * 2);
  return clampLane(raw, roadHalfWidth);
}

/**
 * Which gate a runner takes at this x.
 * -1 left, +1 right, 0 miss (rails sit outside the gate mouths).
 * x = 0 is on the left gate so the old ±1.55 strict test cannot whiff center.
 */
export function gateSideAtX(x, roadHalfWidth = 3.2) {
  const outer = Math.min(GATE_PASS_OUTER, playableLimit(roadHalfWidth) - 0.35);
  if (x <= 0 && x >= -outer) return -1;
  if (x > 0 && x <= outer) return 1;
  return 0;
}

/** Level override wins when it is a finite count of at least 1. Otherwise 80. */
export function maxPeopleFor(level) {
  const raw = level?.maxPeople;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return DEFAULT_MAX_PEOPLE;
}

/**
 * Shared people write. A wiped squad stays 0.
 * Any positive count is clamped to [1, maxPeople].
 */
export function capPeople(people, level) {
  const cap = maxPeopleFor(level);
  const n = Math.floor(Number.isFinite(people) ? people : 0);
  if (n <= 0) return 0;
  if (n >= cap) return cap;
  return n;
}

/** Face-number ceiling. mul/fireMul ≤ 5. add/sub/fire ≤ 99. Other ops stay ≥ 1. */
export function clampGateValue(op, value) {
  const raw = Number.isFinite(value) ? value : 1;
  const n = Math.max(1, Math.floor(raw));
  if (op === 'mul' || op === 'fireMul') return Math.min(MAX_GATE_MUL, n);
  if (op === 'add' || op === 'sub' || op === 'fire') return Math.min(MAX_GATE_LINEAR, n);
  return n;
}

export function applyGate(people, firepower, gate, level = null) {
  const op = gate.op;
  const v = clampGateValue(op, gate.value || 1);
  let p = Math.floor(Number.isFinite(people) ? people : 0);
  let f = firepower;
  if (op === 'add') p += v;
  else if (op === 'mul') p = Math.max(1, Math.floor(p * v));
  else if (op === 'sub') p = Math.max(1, p - v);
  else if (op === 'fire') f += v;
  else if (op === 'fireMul') f = Math.max(1, Math.floor(f * v));
  // Gates never wipe the squad. Sub/mul/add stay at least 1. Collision owns 0.
  if (op === 'add' || op === 'mul' || op === 'sub') p = Math.max(1, p);
  return { people: capPeople(p, level), firepower: f };
}

export function shootGate(gate, damage, rng = Math.random) {
  const hp = Math.max(0, (gate.hp ?? 0) - damage);
  let value = gate.value;
  if (gate.op === 'add' || gate.op === 'sub' || gate.op === 'fire') {
    const bump = Math.max(1, Math.floor(Math.max(0, damage) / 2));
    value = (gate.value || 1) + bump;
  } else if (gate.op === 'mul' || gate.op === 'fireMul') {
    if (damage > 0 && rng() < 0.15) value = (gate.value || 2) + 1;
  }
  value = clampGateValue(gate.op, value);
  const widthScale = 0.55 + Math.min(1.2, value / 20);
  return { ...gate, hp, value, widthScale };
}

export function damageZombie(z, damage) {
  const hp = Math.max(0, z.hp - damage);
  return { ...z, hp, dead: hp <= 0 };
}

/** Squad loss on body contact. Bosses use a flat chip so high HP cannot wipe instantly. */
export function collideCost(people, enemyHp, { boss = false, mini = false } = {}) {
  let loss;
  if (boss) {
    loss = mini ? 2 : 3;
  } else {
    loss = Math.max(1, Math.ceil(enemyHp / 2));
  }
  return Math.max(0, people - loss);
}

/** Flat people lost on one boss bump (for HUD float / tests). */
export function bossCollideLoss(mini = false) {
  return mini ? 2 : 3;
}

/** 1 / 4 / 8 / 16 people — four visible densities, hard cap 7. */
export function pelletCount(people) {
  const p = Math.max(0, Math.floor(people));
  if (p >= 16) return 7;
  if (p >= 8) return 5;
  if (p >= 4) return 3;
  return 1;
}

export function fireStats(people, firepower) {
  const pellets = pelletCount(people);
  const damage = Math.max(1, firepower);
  const interval = Math.max(0.08, 0.28 - Math.min(people, 30) * 0.006 - firepower * 0.012);
  return { pellets, damage, interval };
}

export function countEnemies(level) {
  let n = 0;
  const half = level?.roadHalfWidth || 3.2;
  for (const ev of level?.events || []) {
    if (ev.type === 'zombies') {
      n += ev.block === 'full' ? fullBlockXs(half, ev.count).length : (ev.count || 0);
    } else if (ev.type === 'boss') n += 1;
  }
  return n;
}

export function twoKillsFor(level) {
  return Math.ceil(countEnemies(level) * 0.5);
}

export function threeKillsFor(level) {
  return Math.ceil(countEnemies(level) * 0.7);
}

/**
 * 0 lost. 1 clear. 2 clear + kills >= 50% (ceil).
 * 3 clear + people + firepower + kills >= 70% (ceil).
 * People and firepower without the kill line cannot reach 3.
 * Legacy callers without a level keep the old score thresholds.
 */
export function starRating(state, level = null) {
  if (!state?.won) return 0;
  const people = state.people ?? 0;
  const firepower = state.firepower ?? 1;
  const kills = state.kills ?? 0;
  const score = state.score ?? 0;
  if (!level) {
    let stars = 1;
    if (people >= 8 || kills >= 10) stars = 2;
    if (people >= 15 && kills >= 14 && score >= 800) stars = 3;
    return stars;
  }
  const two = twoKillsFor(level);
  const three = threeKillsFor(level);
  const threeP = level.stars?.threePeople ?? 15;
  const threeF = level.stars?.threeFirepower ?? 2;
  if (people >= threeP && firepower >= threeF && kills >= three) return 3;
  if (kills >= two) return 2;
  return 1;
}

export function createLevelState(level) {
  return {
    levelId: level.id ?? 1,
    z: 0,
    people: capPeople(level.startPeople, level),
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

export function enemyHeight(kind, isBoss = false, scaleHint = null, mini = false) {
  if (isBoss || kind === 'dragon-evolved') {
    const hinted = Number(scaleHint);
    // 3.4 / 2.3 were camera-safety shrinks. Only an explicit tall hint is honored.
    if (Number.isFinite(hinted) && hinted >= 8) return hinted;
    return mini ? BOSS_MINI_HEIGHT : BOSS_FINALE_HEIGHT;
  }
  if (scaleHint) return scaleHint;
  switch (kind) {
    case 'big-arm': return 3.05;
    case 'orc': return 2.95;
    case 'demon': return 3.0;
    case 'yeti': return 3.15;
    case 'zombie-half': return 2.45;
    default: return 2.65;
  }
}

/** 1–3 same count, 4–8 at least 5, 9+ is 7–10 bodies. */
export function visibleBodyCount(people) {
  const p = Math.max(0, Math.floor(people));
  if (p <= 0) return 0;
  if (p <= 3) return p;
  if (p <= 8) return Math.max(5, p);
  if (p <= 12) return 7;
  if (p <= 16) return 8;
  if (p <= 20) return 9;
  return 10;
}

/** World-space label. Empty until 9 people, where bodies drop below the count. */
export function squadPlusText(people) {
  const p = Math.max(0, Math.floor(people));
  const extra = p - visibleBodyCount(p);
  if (p < 9 || extra <= 0) return '';
  return `+${extra}`;
}

/** Local offsets behind the leader. Caller clamps world x onto the road. */
export function squadOffsets(count) {
  const n = Math.max(0, count | 0);
  const offsets = [];
  let i = 0;
  let row = 0;
  while (i < n) {
    const cols = row === 0 ? 1 : Math.min(row + 1, n - i);
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? 0 : ((c / (cols - 1)) - 0.5) * Math.min(2.2, 0.58 * (cols + 1));
      offsets.push({ x, z: -0.72 * row });
      i += 1;
    }
    row += 1;
  }
  return offsets;
}

/**
 * Oncoming speed so an 8m close band lasts ~0.8s against this run speed.
 * Full-width walls pass 0 and stand still (longer shoot window).
 */
export function normalApproach(runSpeed) {
  const closing = 8 / 0.8;
  return Math.max(0.5, Math.min(3, closing - runSpeed));
}

export function closeWindowSeconds(runSpeed) {
  return 8 / (runSpeed + normalApproach(runSpeed));
}

export function enemyApproach(ev, runSpeed) {
  if (!ev || ev.type === 'boss' || ev.block === 'full') return 0;
  return normalApproach(runSpeed);
}

/** Centers for a block:"full" wave. Endpoints sit on the clamps so rails overlap. */
export function fullBlockXs(roadHalfWidth, count, hitX = ENEMY_BODY_X) {
  const limit = playableLimit(roadHalfWidth);
  const minN = Math.max(2, Math.ceil((2 * limit) / (2 * hitX + FULL_BLOCK_MAX_GAP)));
  const n = Math.max(minN, count | 0, 2);
  const xs = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    xs.push(-limit + t * (2 * limit));
  }
  return xs;
}

export function spreadXs(count, spread = 2.2) {
  const n = count | 0;
  if (n <= 1) return [0];
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(((i / (n - 1)) - 0.5) * spread);
  return xs;
}

/** Longest uncovered run inside the clamps. Collision is strict `< hitX`. */
export function maxUncoveredGap(roadHalfWidth, xs, hitX = ENEMY_BODY_X) {
  const limit = playableLimit(roadHalfWidth);
  const step = 0.02;
  let gap = 0;
  let maxGap = 0;
  for (let x = -limit; x <= limit + 1e-8; x += step) {
    const covered = xs.some(ex => Math.abs(ex - x) < hitX - 1e-9);
    if (!covered) {
      gap += step;
      if (gap > maxGap) maxGap = gap;
    } else {
      gap = 0;
    }
  }
  return maxGap;
}

export function clampCovered(roadHalfWidth, xs, hitX = ENEMY_BODY_X) {
  const limit = playableLimit(roadHalfWidth);
  const hit = (x) => xs.some(ex => Math.abs(ex - x) < hitX - 1e-9);
  return hit(limit) && hit(-limit);
}

export function enemyRadii(enemy, roadHalfWidth) {
  if (enemy.isBoss) {
    return {
      bodyX: roadHalfWidth,
      bodyZ: BOSS_BODY_Z,
      bulletX: roadHalfWidth,
      bulletZ: BOSS_BULLET_Z
    };
  }
  return {
    bodyX: ENEMY_BODY_X,
    bodyZ: ENEMY_BODY_Z,
    bulletX: ENEMY_BULLET_X,
    bulletZ: ENEMY_BULLET_Z
  };
}

export function finishNeed(level) {
  const fin = (level?.events || []).find(e => e.type === 'finish');
  return fin ? fin.needPeople : Infinity;
}

export function durationSeconds(level) {
  return level.length / level.runSpeed;
}

export function gateScore(people, firepower, gate, level = null) {
  const next = applyGate(people, firepower, gate, level);
  return (next.people - people) * 10 + (next.firepower - firepower) * 25;
}

export function betterGateSide(left, right, people, firepower, level = null) {
  const sl = gateScore(people, firepower, left, level);
  const sr = gateScore(people, firepower, right, level);
  return sr > sl ? 1 : -1;
}

/**
 * Boss stays at its mark until the runner is 22m out, then appears on the
 * 16–22m band and holds BOSS_STANDOFF. Never walks behind the gun to -Z.
 */
export function stepBossZ(bossZ, homeZ, playerZ, engaged, dt, strong = false) {
  const distHome = homeZ - playerZ;
  const born = engaged || distHome <= BOSS_RANGE_FAR;
  if (!born) return { z: homeZ, engaged: false, born: false };
  const stand = playerZ + BOSS_STANDOFF;
  const rate = strong ? 14 : 8;
  let z = engaged ? bossZ + (stand - bossZ) * Math.min(1, dt * rate) : stand;
  const minZ = playerZ + BOSS_RANGE_NEAR;
  const maxZ = playerZ + BOSS_RANGE_FAR;
  if (z < minZ) z = minZ;
  if (z > maxZ) z = maxZ;
  return { z, engaged: true, born: true };
}

/** Centered boss breath covers both clamps (±playableLimit). */
export function bossCoversLane(bossX, playerX, roadHalfWidth) {
  const limit = playableLimit(roadHalfWidth);
  const reach = limit + Math.abs(bossX || 0);
  return Math.abs(playerX - (bossX || 0)) <= reach + 1e-4;
}

/**
 * Portrait screen fraction of a boss of `height` standing `standoff` meters
 * ahead of the runner. Matches THREE.PerspectiveCamera fov (vertical).
 */
export function portraitBossFraction(height, standoff, cam = null) {
  const eyeY = cam?.y ?? BOSS_CAM_Y;
  const eyeZ = -(cam?.back ?? BOSS_CAM_BACK);
  const lookY = cam?.lookY ?? BOSS_CAM_LOOK_Y;
  const lookZ = cam?.lookAhead ?? BOSS_CAM_LOOK_AHEAD;
  const fov = cam?.fov ?? CAM_FOV;
  let zx = 0 - 0;
  let zy = eyeY - lookY;
  let zz = eyeZ - lookZ;
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const tan = Math.tan((fov * Math.PI / 180) / 2);
  const ndcY = (wy, wz) => {
    const py = wy - eyeY;
    const pz = wz - eyeZ;
    const vy = py * yy + pz * yz;
    const vz = py * zy + pz * zz;
    return (vy / -vz) / tan;
  };
  return Math.abs(ndcY(height, standoff) - ndcY(0, standoff)) / 2;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function norm3(x, y, z) {
  const m = Math.hypot(x, y, z) || 1;
  return [x / m, y / m, z / m];
}

function zHits(z0, z1, target, rad) {
  const lo = Math.min(z0, z1);
  const hi = Math.max(z0, z1);
  return hi >= target - rad && lo <= target + rad;
}

/**
 * Headless run used by the serious / edge scripts.
 * policy 'edge' pins x to the right clamp. 'serious' takes the better gate
 * and strafes onto living enemies between gates.
 */
export function simulateLevel(level, policy = 'serious') {
  const edgeRight = policy === 'edge' || policy === 'edge-right';
  const edgeLeft = policy === 'edge-left';
  const pinned = edgeRight || edgeLeft;
  const rng = mulberry32((level.id || 1) * 9973 + (edgeLeft ? 29 : edgeRight ? 17 : 3));
  const half = level.roadHalfWidth;
  const limit = playableLimit(half);
  const need = finishNeed(level);
  const dt = 1 / 60;
  let z = 0;
  let x = edgeLeft ? -limit : edgeRight ? limit : 0;
  let targetX = x;
  let people = capPeople(level.startPeople, level);
  let firepower = level.startFirepower;
  let kills = 0;
  let score = 0;
  let fireAcc = 0;
  let holding = false;
  let bossHold = 0;
  let finished = false;
  let won = false;
  let lost = false;
  let reason = '';
  let t = 0;
  let bossEngageT = null;
  let bossKillT = null;
  let bossWipeT = null;
  let bossEngagePeople = 0;
  let bossEngageFire = 0;
  let bossMinDist = Infinity;
  let bossMaxDist = -Infinity;
  const bullets = [];
  const enemies = [];
  const gates = [];
  let finishZ = level.length;

  for (const ev of level.events) {
    if (ev.type === 'gatePair') {
      for (const [name, side] of [['left', -1], ['right', 1]]) {
        const raw = ev[name];
        gates.push({
          ...raw,
          side,
          z: ev.z,
          x: side * GATE_VIS_X,
          consumed: false,
          hp: raw.hp ?? 10,
          value: clampGateValue(raw.op, raw.value ?? 1),
          op: raw.op
        });
      }
    } else if (ev.type === 'zombies') {
      const xs = ev.block === 'full'
        ? fullBlockXs(half, ev.count)
        : spreadXs(ev.count, ev.spread ?? 1.6);
      const approach = enemyApproach(ev, level.runSpeed);
      xs.forEach((ex) => {
        enemies.push({
          x: ex, z: ev.z, hp: ev.hp, maxHp: ev.hp, dead: false,
          approach, isBoss: false, mini: false, kind: ev.kind || 'zombie'
        });
      });
    } else if (ev.type === 'boss') {
      enemies.push({
        x: 0, z: ev.z, homeZ: ev.z, hp: ev.hp, maxHp: ev.hp, dead: false,
        approach: 0, isBoss: true, mini: !!ev.mini, engaged: false, born: false,
        strikeCd: BOSS_STRIKE_INTERVAL,
        kind: ev.kind || 'dragon-evolved'
      });
    } else if (ev.type === 'finish') {
      finishZ = ev.z;
    }
  }

  const enemyCount = enemies.length;
  const maxT = durationSeconds(level) + BOSS_LEASH_SECONDS + 2;

  const nextGateZ = () => {
    let best = null;
    for (const g of gates) {
      if (g.consumed) continue;
      if (g.z < z - 0.05) continue;
      if (best == null || g.z < best) best = g.z;
    }
    return best;
  };

  while (!finished && t < maxT) {
    if (pinned) {
      targetX = edgeLeft ? -limit : limit;
      x = targetX;
    } else {
      const gz = nextGateZ();
      if (gz != null && gz - z < 3.2) {
        const left = gates.find(g => !g.consumed && g.z === gz && g.side < 0);
        const right = gates.find(g => !g.consumed && g.z === gz && g.side > 0);
        const side = left && right ? betterGateSide(left, right, people, firepower, level) : -1;
        targetX = side < 0 ? -SERIOUS_LANE : SERIOUS_LANE;
      } else {
        const foes = enemies.filter(e => !e.dead && !e.isBoss && e.z >= z - 0.3 && e.z - z < BULLET_MAX_AHEAD);
        if (foes.length) {
          foes.sort((a, b) => (a.z - b.z) || (Math.abs(a.x - x) - Math.abs(b.x - x)));
          targetX = clampLane(foes[0].x, half);
        } else if (gz != null) {
          const left = gates.find(g => !g.consumed && g.z === gz && g.side < 0);
          const right = gates.find(g => !g.consumed && g.z === gz && g.side > 0);
          const side = left && right ? betterGateSide(left, right, people, firepower, level) : -1;
          targetX = side < 0 ? -SERIOUS_LANE : SERIOUS_LANE;
        } else {
          targetX = 0;
        }
      }
      x += (targetX - x) * Math.min(1, dt * PLAYER_SMOOTH);
      x = clampLane(x, half);
    }

    if (holding) z = finishZ;
    else z += level.runSpeed * dt;

    for (const e of enemies) {
      if (e.dead) continue;
      if (e.isBoss) {
        const wasBorn = e.born;
        const step = stepBossZ(e.z, e.homeZ, z, e.engaged, dt, holding);
        e.z = step.z;
        e.engaged = step.engaged;
        e.born = step.born;
        if (e.born && !wasBorn) e.strikeCd = BOSS_STRIKE_INTERVAL;
        if (e.born && bossEngageT == null) {
          bossEngageT = t;
          bossEngagePeople = people;
          bossEngageFire = firepower;
        }
        if (e.born) {
          const dist = e.z - z;
          if (dist < bossMinDist) bossMinDist = dist;
          if (dist > bossMaxDist) bossMaxDist = dist;
        }
      } else {
        e.z -= e.approach * dt;
      }
    }

    const fs = fireStats(people, firepower);
    fireAcc += dt;
    if (fireAcc >= fs.interval) {
      fireAcc = 0;
      const n = fs.pellets;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.06;
        const [dx, , dz] = norm3(spread, 0.02, 1);
        bullets.push({
          x: x + spread * 0.4,
          z: z + 0.6,
          vx: dx * BULLET_SPEED,
          vz: dz * BULLET_SPEED,
          damage: fs.damage,
          life: BULLET_LIFE
        });
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const z0 = b.z;
      b.z += b.vz * dt;
      b.x += b.vx * dt;
      b.life -= dt;
      let hit = false;
      for (const g of gates) {
        if (g.consumed || g.op === 'finish') continue;
        if (zHits(z0, b.z, g.z, GATE_BULLET_Z) && Math.abs(b.x - g.x) < GATE_BULLET_X) {
          const next = shootGate(g, b.damage, rng);
          g.hp = next.hp;
          g.value = next.value;
          g.widthScale = next.widthScale;
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const e of enemies) {
          if (e.dead) continue;
          if (e.isBoss && !e.born) continue;
          const rad = enemyRadii(e, half);
          if (zHits(z0, b.z, e.z, rad.bulletZ) && Math.abs(b.x - e.x) < rad.bulletX) {
            const dmg = damageZombie(e, b.damage);
            e.hp = dmg.hp;
            e.dead = dmg.dead;
            if (e.dead) {
              kills += 1;
              score += e.isBoss ? 200 : 20;
              if (e.isBoss) {
                score += 80;
                if (bossKillT == null) bossKillT = t;
              }
            }
            hit = true;
            break;
          }
        }
      }
      if (hit || b.life <= 0 || b.z > z + BULLET_MAX_AHEAD) bullets.splice(i, 1);
    }

    for (const e of enemies) {
      if (e.dead) continue;
      if (e.isBoss) {
        if (!e.born) continue;
        e.strikeCd -= dt;
        if (e.strikeCd > 0 || !bossCoversLane(e.x, x, half)) continue;
        e.strikeCd = BOSS_STRIKE_INTERVAL;
        people = capPeople(collideCost(people, e.hp, { boss: true, mini: !!e.mini }), level);
        if (people <= 0) {
          people = capPeople(0, level);
          lost = true;
          won = false;
          finished = true;
          reason = 'dead';
          if (bossWipeT == null) bossWipeT = t;
          break;
        }
        continue;
      }
      const rad = enemyRadii(e, half);
      if (Math.abs(e.z - z) < rad.bodyZ && Math.abs(e.x - x) < rad.bodyX) {
        people = capPeople(collideCost(people, e.hp, { boss: false, mini: false }), level);
        e.dead = true;
        if (people <= 0) {
          people = capPeople(0, level);
          lost = true;
          won = false;
          finished = true;
          reason = 'dead';
          break;
        }
      }
    }
    if (finished) break;

    const takenZ = new Set();
    for (const g of gates) {
      if (g.consumed) continue;
      if (z < g.z) continue;
      const side = gateSideAtX(x, half);
      if (g.side === side && side !== 0 && !takenZ.has(g.z)) {
        takenZ.add(g.z);
        g.consumed = true;
        const next = applyGate(people, firepower, g, level);
        const gained = Math.max(0, next.people - people);
        people = capPeople(next.people, level);
        firepower = next.firepower;
        score += 50 + gained * 5;
      } else {
        g.consumed = true;
      }
    }

    if (z >= finishZ) {
      const boss = enemies.find(e => e.isBoss && !e.dead);
      if (boss) {
        holding = true;
        z = finishZ;
        bossHold += dt;
        if (bossHold >= BOSS_LEASH_SECONDS) {
          lost = true;
          won = false;
          finished = true;
          reason = 'boss-timeout';
        }
      } else if (people >= need) {
        won = true;
        lost = false;
        finished = true;
        reason = 'clear';
        score += 500 + people * 10;
      } else {
        lost = true;
        won = false;
        finished = true;
        reason = 'need';
      }
    }

    t += dt;
  }

  if (!finished) {
    lost = true;
    won = false;
    reason = reason || 'timeout';
  }

  const state = {
    won, lost, people, firepower, kills, score,
    finished: true, bossDefeated: enemies.every(e => !e.isBoss || e.dead)
  };
  return {
    ...state,
    stars: starRating(state, level),
    enemyCount,
    reason,
    t,
    bossHold,
    need,
    bossEngageT,
    bossKillT,
    bossWipeT,
    bossEngagePeople,
    bossEngageFire,
    bossMinDist: Number.isFinite(bossMinDist) ? bossMinDist : null,
    bossMaxDist: Number.isFinite(bossMaxDist) ? bossMaxDist : null,
    bossFight: bossEngageT == null ? null : (bossKillT ?? bossWipeT ?? t) - bossEngageT
  };
}

/** Contract problems for one level. Empty array means the row is legal. */
export function levelProblems(lv) {
  const p = [];
  if (!lv) return ['missing'];
  const dur = durationSeconds(lv);
  if (!(dur >= 15 && dur <= 30)) p.push(`duration ${dur.toFixed(2)}`);
  if (lv.id === 1 && dur < 18) p.push('L1 duration');
  if (lv.id === 5 && dur < 20) p.push('L5 duration');
  if (lv.id === 10 && !(dur >= 22 && dur <= 30)) p.push('L10 duration');
  const need = finishNeed(lv);
  if (!(lv.startPeople < need)) p.push('startPeople >= needPeople');
  const cap = maxPeopleFor(lv);
  if (Number.isFinite(need) && cap < need) p.push('maxPeople < needPeople');
  if ((lv.stars?.threePeople ?? 0) > cap) p.push('maxPeople < threePeople');
  const blob = JSON.stringify(lv);
  if (blob.includes('readableWave')) p.push('readableWave');
  const gateZs = [...new Set((lv.events || []).filter(e => e.type === 'gatePair').map(e => e.z))].sort((a, b) => a - b);
  if (!gateZs.length) p.push('no gates');
  else {
    // Opening hook: the first gate and a zombie pack sit inside ~3s of road.
    const reachT = gateZs[0] / lv.runSpeed;
    if (!(reachT >= 1.5 && reachT <= 3.05)) p.push(`first gate reach ${reachT.toFixed(2)}`);
    const openZ = lv.runSpeed * 3;
    if (!(lv.events || []).some((e) => e.type === 'zombies' && e.z <= openZ + 0.05)) {
      p.push('opening zombies');
    }
    for (let i = 1; i < gateZs.length; i++) {
      const meters = gateZs[i] - gateZs[i - 1];
      const gap = meters / lv.runSpeed;
      // 2.0–3.5s, and close enough that two boards read together (≤18.5m).
      if (!(gap >= 2 - 1e-6 && gap <= 3.5 && meters <= 18.5)) p.push(`gate interval ${gap.toFixed(2)}`);
    }
    const pairs = (lv.events || []).filter(e => e.type === 'gatePair');
    if (!pairs.some(e => e.left?.op === 'sub' || e.right?.op === 'sub')) p.push('no sub');
  }
  const blocks = (lv.events || []).filter(e => e.type === 'zombies' && e.block === 'full');
  if (blocks.length < 2) p.push('need 2 full blocks');
  for (const b of blocks) {
    const xs = fullBlockXs(lv.roadHalfWidth, b.count);
    if (!clampCovered(lv.roadHalfWidth, xs)) p.push(`block clamp L${lv.id}`);
    const gap = maxUncoveredGap(lv.roadHalfWidth, xs);
    if (gap > FULL_BLOCK_MAX_GAP + 1e-6) p.push(`gap ${gap.toFixed(2)}`);
  }
  if (lv.id === 5 && !(lv.events || []).some(e => e.type === 'boss')) p.push('L5 boss');
  if (lv.id === 10 && !(lv.events || []).some(e => e.type === 'boss' && !e.mini)) p.push('L10 boss');
  if (!(lv.stars?.threePeople > 0)) p.push('stars people');
  if (!(lv.stars?.threeFirepower > 0)) p.push('stars fp');
  const win = closeWindowSeconds(lv.runSpeed);
  if (!(win >= 0.6 && win <= 1.0)) p.push(`close window ${win.toFixed(2)}`);
  return p;
}
