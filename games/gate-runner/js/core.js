/** Pure logic for Gate Runner — Node-testable, no Three.js. */

export const EDGE_INSET = 0.4;
export const KEY_NUDGE = 0.45;
export const ENEMY_BODY_X = 0.85;
export const ENEMY_BODY_Z = 0.9;
export const ENEMY_BULLET_X = 0.55;
export const ENEMY_BULLET_Z = 0.7;
export const BOSS_BODY_Z = 1.6;
export const BOSS_BULLET_Z = 1.25;
export const BOSS_STANDOFF = 14;
export const BOSS_LEASH_SECONDS = 8;
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

export function applyGate(people, firepower, gate) {
  const op = gate.op;
  const v = Math.max(1, Math.floor(gate.value || 1));
  let p = people;
  let f = firepower;
  if (op === 'add') p += v;
  else if (op === 'mul') p = Math.max(1, Math.floor(p * v));
  else if (op === 'sub') p = Math.max(1, p - v);
  else if (op === 'fire') f += v;
  else if (op === 'fireMul') f = Math.max(1, Math.floor(f * v));
  return { people: p, firepower: f };
}

export function shootGate(gate, damage, rng = Math.random) {
  const hp = Math.max(0, (gate.hp ?? 0) - damage);
  let value = gate.value;
  if (gate.op === 'add' || gate.op === 'sub' || gate.op === 'fire') {
    value = Math.max(1, Math.floor((gate.value || 1) + Math.max(1, Math.floor(damage / 2))));
  } else if (gate.op === 'mul' || gate.op === 'fireMul') {
    if (damage > 0 && rng() < 0.15) value = Math.min(5, (gate.value || 2) + 1);
  }
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
  if (isBoss || kind === 'dragon-evolved') return 2.8;
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

export function gateScore(people, firepower, gate) {
  const next = applyGate(people, firepower, gate);
  return (next.people - people) * 10 + (next.firepower - firepower) * 25;
}

export function betterGateSide(left, right, people, firepower) {
  const sl = gateScore(people, firepower, left);
  const sr = gateScore(people, firepower, right);
  return sr > sl ? 1 : -1;
}

/** Boss z stays in gun range once the runner is close. Never walks off to -Z. */
export function stepBossZ(bossZ, homeZ, playerZ, engaged, dt, strong = false) {
  let on = engaged || (homeZ - playerZ) <= 36;
  if (!on) return { z: homeZ, engaged: false };
  const rate = strong ? 8 : 2.5;
  const stand = playerZ + BOSS_STANDOFF;
  let z = bossZ + (stand - bossZ) * Math.min(1, dt * rate);
  const minZ = playerZ + 8;
  const maxZ = playerZ + 22;
  if (z < minZ) z = minZ;
  if (z > maxZ) z = maxZ;
  return { z, engaged: true };
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
  let people = level.startPeople;
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
          value: raw.value ?? 1,
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
        approach: 0, isBoss: true, mini: !!ev.mini, engaged: false,
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
        const side = left && right ? betterGateSide(left, right, people, firepower) : -1;
        targetX = side < 0 ? -SERIOUS_LANE : SERIOUS_LANE;
      } else {
        const foes = enemies.filter(e => !e.dead && !e.isBoss && e.z >= z - 0.3 && e.z - z < BULLET_MAX_AHEAD);
        if (foes.length) {
          foes.sort((a, b) => (a.z - b.z) || (Math.abs(a.x - x) - Math.abs(b.x - x)));
          targetX = clampLane(foes[0].x, half);
        } else if (gz != null) {
          const left = gates.find(g => !g.consumed && g.z === gz && g.side < 0);
          const right = gates.find(g => !g.consumed && g.z === gz && g.side > 0);
          const side = left && right ? betterGateSide(left, right, people, firepower) : -1;
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
        const step = stepBossZ(e.z, e.homeZ, z, e.engaged, dt, holding);
        e.z = step.z;
        e.engaged = step.engaged;
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
          const rad = enemyRadii(e, half);
          if (zHits(z0, b.z, e.z, rad.bulletZ) && Math.abs(b.x - e.x) < rad.bulletX) {
            const dmg = damageZombie(e, b.damage);
            e.hp = dmg.hp;
            e.dead = dmg.dead;
            if (e.dead) {
              kills += 1;
              score += e.isBoss ? 200 : 20;
              if (e.isBoss) score += 80;
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
      const rad = enemyRadii(e, half);
      if (Math.abs(e.z - z) < rad.bodyZ && Math.abs(e.x - x) < rad.bodyX) {
        people = collideCost(people, e.hp, { boss: !!e.isBoss, mini: !!e.mini });
        if (!e.isBoss) e.dead = true;
        else e.z += 2.2;
        if (people <= 0) {
          people = 0;
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
        const next = applyGate(people, firepower, g);
        const gained = Math.max(0, next.people - people);
        people = next.people;
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
    need
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
  const blob = JSON.stringify(lv);
  if (blob.includes('readableWave')) p.push('readableWave');
  const gateZs = [...new Set((lv.events || []).filter(e => e.type === 'gatePair').map(e => e.z))].sort((a, b) => a - b);
  if (!gateZs.length) p.push('no gates');
  else {
    const t0 = (gateZs[0] - BULLET_MAX_AHEAD) / lv.runSpeed;
    if (!(t0 >= 2 && t0 <= 3.5)) p.push(`first gate shootable ${t0.toFixed(2)}`);
    for (let i = 1; i < gateZs.length; i++) {
      const gap = (gateZs[i] - gateZs[i - 1]) / lv.runSpeed;
      if (!(gap >= 2 && gap <= 3.5)) p.push(`gate interval ${gap.toFixed(2)}`);
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
