import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  applyGate, shootGate, damageZombie, collideCost, fireStats,
  starRating, createLevelState, progress, kindToAssetKey, enemyHeight,
  mapRoadPointer, nudgeLane, gateSideAtX, visibleBodyCount, squadPlusText,
  squadOffsets, fullBlockXs, spreadXs, enemyApproach, enemyRadii,
  stepBossZ, bossCoversLane, capPeople, clampGateValue, GATE_VIS_X, GATE_BULLET_X, GATE_BULLET_Z,
  BULLET_SPEED, BULLET_LIFE, BULLET_MAX_AHEAD,
  BOSS_LEASH_SECONDS, BOSS_STRIKE_INTERVAL, PLAYER_SMOOTH, clampLane, twoKillsFor, threeKillsFor,
  CAM_BACK, CAM_Y, CAM_LOOK_Y, CAM_LOOK_AHEAD,
  BOSS_CAM_BACK, BOSS_CAM_Y, BOSS_CAM_LOOK_Y, BOSS_CAM_LOOK_AHEAD
} from './core.js';
import { createAudio } from './audio.js';

const ASSET = {
  sam: 'assets/gltf/sam.glb',
  zombie: 'assets/gltf/zombie.glb',
  zombieHalf: 'assets/gltf/zombie-half.glb',
  bigArm: 'assets/gltf/big-arm.glb',
  orc: 'assets/gltf/orc.glb',
  demon: 'assets/gltf/demon.glb',
  yeti: 'assets/gltf/yeti.glb',
  dragonEvolved: 'assets/gltf/dragon-evolved.glb',
  street: 'assets/gltf/street-straight.glb',
  streetCrack: 'assets/gltf/street-straight-crack.glb',
  barrier: 'assets/gltf/traffic-barrier.glb',
  plastic: 'assets/gltf/plastic-barrier.glb',
  cone: 'assets/gltf/traffic-cone.glb',
  light: 'assets/gltf/street-light.glb',
  hydrant: 'assets/gltf/fire-hydrant.glb',
  trash: 'assets/gltf/trash-bag.glb'
};

const canvas = document.getElementById('c');
const hudPeople = document.getElementById('people');
const hudFire = document.getElementById('fire');
const hudScore = document.getElementById('score');
const hudProg = document.getElementById('prog');
const hudLevel = document.getElementById('levelNum');
const banner = document.getElementById('banner');
const overlay = document.getElementById('overlay');
const settle = document.getElementById('settle');
const loading = document.getElementById('loading');
const loadMsg = document.getElementById('loadMsg');
const loadBar = document.getElementById('loadBar');
const btnStart = document.getElementById('btnStart');
const btnNext = document.getElementById('btnNext');
const btnMute = document.getElementById('btnMute');
const startMeta = document.getElementById('startMeta');
const audio = createAudio();

let levels = [];
let levelIndex = 0; // 0-based
let level = null;
let state = null;
let running = false;
let playerX = 0;
let targetX = 0;
let heldPointer = null; // CSS clientX while the pointer is down; release keeps targetX
let fireAcc = 0;
let shake = 0;
let shakeAmp = 0;
let shakeLeft = 0;
let shakeDur = 0;
let shakePhase = 0;
let hitStop = 0;
let killFlash = 0;
let bossIFrames = 0; // short invuln after boss bump
let bossHold = 0;
let holdingFinish = false;
let ended = false;
let bossCamBlend = 0;
let frameKills = 0;
let clock = new THREE.Clock();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5d86ad);
// 2nd/3rd pairs sit ~32–70m from the camera. Start fog past them so the boards stay colored.
scene.fog = new THREE.Fog(0x6a90b6, 96, 240);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.35, 200);
camera.position.set(0, CAM_Y, -CAM_BACK);
camera.lookAt(0, CAM_LOOK_Y, 0.6);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Bloom stays off while any gate is inside GATE_CLOSE_Z. A lit fill-plane plus
// bloom was the white slab. Muzzle flashes still bloom once the gate is behind.
const BLOOM_STRENGTH = 0.32;
const BLOOM_RADIUS = 0.14;
const BLOOM_THRESHOLD = 0.86;
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD
);
composer.addPass(bloom);

const hemi = new THREE.HemisphereLight(0xfff2d8, 0x6f8f6a, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e0, 1.75);
sun.position.set(-8, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.02;
sun.shadow.camera.left = -24;
sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24;
sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.updateProjectionMatrix();
// Target must live in the scene so matrix updates follow the runner.
scene.add(sun.target);
scene.add(sun);
const ambient = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambient);

const world = new THREE.Group();
scene.add(world);
const roadGroup = new THREE.Group();
world.add(roadGroup);
const entityGroup = new THREE.Group();
world.add(entityGroup);
const bulletGroup = new THREE.Group();
world.add(bulletGroup);
const fxGroup = new THREE.Group();
world.add(fxGroup);
const burstGeo = new THREE.SphereGeometry(0.09, 6, 5);
const flashPlaneGeo = new THREE.PlaneGeometry(1, 1);
const flashSparkGeo = new THREE.SphereGeometry(0.2, 7, 6);
const particles = [];
const FX_CAP = 120;
const KILL_SHAKE_AMP = 3.8;
const KILL_SHAKE_DUR = 0.32;
const KILL_HITSTOP = 0.09;
const KILL_FLASH_SEC = 0.16;
const BOSS_KILL_SHAKE_AMP = 3.1;
const BOSS_KILL_SHAKE_DUR = 0.18;
const CORPSE_DUR = 1.35;
const BOSS_CORPSE_DUR = 0.72;
const POSE_HOLD_SEC = 0.32;
const CORPSE_LIE_X = 1.2;
const GATE_BOARDS_AHEAD = 3;
const GATE_CLOSE_Z = 14;
const GATE_FLASH_NEAR = 6;
const GATE_EMISSIVE = 0.04;
const GATE_GLASS_OPACITY = 0.58;
const GATE_STACK_Y = 0.8;
const GATE_AHEAD_MAX = 90;
const GATE_BURST_COUNT = 18;
const CITY_SEED = 20261101;

const city = buildCity();
scene.add(city);

const templates = {};
const mixers = [];
let playerRoot = null;
let playerMixer = null;
let playerActions = {};
let squad = [];

const gates = [];
const zombies = [];
const bullets = [];
const floats = [];
const DEBUG = new URLSearchParams(location.search).has('debug');
let debugEl = null;

function setLoad(p, msg) {
  loadBar.style.width = `${Math.floor(p * 100)}%`;
  if (msg) loadMsg.textContent = msg;
}

async function loadLevels() {
  const res = await fetch('data/levels.json');
  levels = await res.json();
  // Hidden QA deep link: ?level=5 / ?level=10 (1-based).
  const q = Number(new URLSearchParams(location.search).get('level'));
  if (Number.isFinite(q) && q >= 1 && q <= levels.length) {
    levelIndex = q - 1;
  } else {
    levelIndex = 0;
  }
  level = levels[levelIndex];
}

async function loadAssets() {
  const loader = new GLTFLoader();
  const entries = Object.entries(ASSET);
  let done = 0;
  await Promise.all(entries.map(async ([key, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      templates[key] = gltf;
    } catch (err) {
      console.warn('asset fail', key, err);
      templates[key] = null;
    }
    done += 1;
    setLoad(0.1 + 0.8 * (done / entries.length), `加载 ${key} (${done}/${entries.length})`);
  }));
}

function cloneModel(key, scale = 1) {
  const gltf = templates[key];
  if (!gltf) return makeFallback(key, scale);
  // SkeletonUtils keeps skinned meshes bound to the clone's bones (plain clone shares skeleton).
  const root = cloneSkinned(gltf.scene);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (!o.material) return;
    const srcMats = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = srcMats.map(m => {
      const mat = m.clone();
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.side = THREE.FrontSide;
      // Force readable opaque meshes (avoid fully-transparent zombie bodies).
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      if ('alphaTest' in mat) mat.alphaTest = Math.min(mat.alphaTest || 0, 0.01);
      return mat;
    });
    o.material = Array.isArray(o.material) ? cloned : cloned[0];
  });
  root.scale.setScalar(scale);
  const mixer = gltf.animations?.length ? new THREE.AnimationMixer(root) : null;
  const actions = {};
  if (mixer) {
    for (const clip of gltf.animations) {
      const short = clip.name.split('|').pop();
      actions[short] = mixer.clipAction(clip);
      actions[clip.name] = actions[short];
    }
    mixers.push(mixer);
  }
  return { root, mixer, actions, gltf };
}

function makeFallback(key, scale) {
  const g = new THREE.Group();
  const monsterKeys = ['zombie', 'zombieHalf', 'bigArm', 'orc', 'demon', 'yeti', 'dragonEvolved'];
  let color = 0xb0b8c8;
  if (monsterKeys.includes(key)) color = key === 'dragonEvolved' ? 0xc44a2f : 0x5aa85a;
  else if (key === 'sam') color = 0x3d7dff;
  // Bright capsule taller than 1.5 so missing glTF still reads on portrait cam.
  const bodyH = key === 'dragonEvolved' ? 1.8 : (monsterKeys.includes(key) ? 1.7 : 1.1);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, bodyH, 4, 8),
    new THREE.MeshStandardMaterial({
      color,
      emissive: monsterKeys.includes(key) ? 0x1a401a : 0x000000,
      emissiveIntensity: monsterKeys.includes(key) ? 0.35 : 0,
      roughness: 0.55,
      metalness: 0.2
    })
  );
  mesh.castShadow = true;
  g.add(mesh);
  g.scale.setScalar(scale);
  return { root: g, mixer: null, actions: {}, gltf: null };
}

const WEAPON_NAME_RE = /weapon|rifle|gun|pistol|shotgun|axe|knife|sword|bat/i;

/** Hide embedded bind-pose weapon meshes so they never look planted on the road. */
function stripLooseWeapons(root) {
  const hidden = [];
  root.traverse(o => {
    if (!o.isMesh && !o.isGroup) return;
    const n = o.name || '';
    if (!WEAPON_NAME_RE.test(n)) return;
    o.visible = false;
    hidden.push(o);
  });
  return hidden;
}

/**
 * Bright short gun parented ONLY to Sam root at a fixed local pose.
 * Never parent to Quaternius hand bones — non-1 bone scale turns the
 * dark cylinder into a near-camera black occluder (menu bar / wedges).
 */
function attachPrimitiveGun(root) {
  // Drop any previous primitive gun (squad rebuild / re-attach).
  const stale = root.getObjectByName('primitiveGun');
  if (stale) root.remove(stale);

  const gun = new THREE.Group();
  gun.name = 'primitiveGun';
  // Bright metal + orange so the held weapon reads clearly in portrait shots.
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.034, 0.28, 8),
    new THREE.MeshStandardMaterial({
      color: 0xd8dee6, metalness: 0.85, roughness: 0.25,
      emissive: 0x334455, emissiveIntensity: 0.25
    })
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 0.14);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.11, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0xff8a1f, metalness: 0.55, roughness: 0.4,
      emissive: 0x662200, emissiveIntensity: 0.35
    })
  );
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.07, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xcfd6df, metalness: 0.7, roughness: 0.3 })
  );
  stock.position.set(0, -0.02, -0.12);
  gun.add(body);
  gun.add(barrel);
  gun.add(stock);
  // Fixed local pose on character root — never a bone.
  // Slightly larger + more "held" so the orange/metal gun reads in portrait shots.
  gun.position.set(0.32, 0.92, 0.55);
  gun.rotation.set(-0.08, 0.18, 0.08);
  gun.scale.setScalar(1.5);
  root.add(gun);
  return gun;
}

/** Safety net for squad bone-scale blowups.
 *  Do not walk `world`: street tiles within 2.2m were latched invisible and the
 *  bare asphalt slab became the portrait foreground gray board. */
function hideNearCameraOccluders() {
  const camPos = camera.position;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const roots = [];
  for (const s of squad) if (s?.root) roots.push(s.root);
  for (const root of roots) {
    root.traverse(o => {
      if (!o.isMesh || o.visible === false) return;
      // Never hide the intentional bright gun.
      if (o.name === 'primitiveGun' || o.parent?.name === 'primitiveGun') return;
      let bossMesh = false;
      let p = o;
      while (p) {
        if (p.userData?.isBoss || p.userData?.isFoe) { bossMesh = true; break; }
        p = p.parent;
      }
      if (bossMesh) return;
      o.updateWorldMatrix(true, false);
      box.setFromObject(o);
      if (box.isEmpty()) return;
      box.getSize(size);
      const diag = size.length();
      // Closest point on AABB to camera (not center distance).
      closest.set(
        Math.min(Math.max(camPos.x, box.min.x), box.max.x),
        Math.min(Math.max(camPos.y, box.min.y), box.max.y),
        Math.min(Math.max(camPos.z, box.min.z), box.max.z)
      );
      const minDist = closest.distanceTo(camPos);
      if (minDist < 2.2 && diag > 1.8) {
        o.visible = false;
      }
    });
  }
}

function playAnim(actions, names, fade = 0.2, mode = 'loop') {
  if (!actions) return null;
  const list = Array.isArray(names) ? names : [names];
  let act = null;
  for (const name of list) {
    act = actions[name] || actions[`CharacterArmature|${name}`];
    if (act) break;
  }
  if (!act) return null;
  Object.values(actions).forEach(a => { if (a !== act && a.isRunning?.()) a.fadeOut(fade); });
  if (mode === 'once') {
    act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
  } else {
    act.setLoop(THREE.LoopRepeat, Infinity);
    act.clampWhenFinished = false;
  }
  act.reset().fadeIn(fade).play();
  return act;
}

/** Swap clips from the mixer's finished event. No timed stand-in. */
function afterClip(enemy, action, cb) {
  if (!action || !enemy.mixer) return;
  const token = enemy.animToken;
  const handler = (e) => {
    if (e.action !== action) return;
    enemy.mixer.removeEventListener('finished', handler);
    if (enemy.animToken !== token) return;
    cb();
  };
  enemy.mixer.addEventListener('finished', handler);
}

function playReaction(enemy, names, thenNames) {
  enemy.animToken = (enemy.animToken || 0) + 1;
  const act = playAnim(enemy.actions, names, 0.1, 'once');
  if (!act) {
    if (!enemy.dead && thenNames) playAnim(enemy.actions, thenNames, 0.12, 'loop');
    return;
  }
  afterClip(enemy, act, () => {
    if (enemy.dead) return;
    if (thenNames) playAnim(enemy.actions, thenNames, 0.12, 'loop');
  });
}

function playDeath(enemy) {
  enemy.dead = true;
  enemy.animToken = (enemy.animToken || 0) + 1;
  const dur = enemy.isBoss ? BOSS_CORPSE_DUR : CORPSE_DUR;
  // Same-frame kills fall in sequence so a whole row cannot pop out together.
  const slot = enemy.isBoss ? 0 : (frameKills++ % 8);
  const stagger = slot * 0.055;
  enemy.corpseT = dur + stagger;
  enemy.deathDur = dur + stagger;
  enemy.deathAge = 0;
  enemy.fallDelay = stagger;
  enemy.poseHold = 0;
  enemy.clipDone = false;
  enemy.knockFromX = enemy.root?.position.x ?? enemy.x;
  enemy.knockFromZ = enemy.root?.position.z ?? enemy.z;
  enemy.knockFromY = enemy.root?.position.y ?? enemy.groundY ?? 0;
  const side = (slot % 2 === 0 ? 1 : -1) * (Math.sign((enemy.x || 0) - playerX) || 1);
  enemy.knockSign = side || 1;
  const rawKnock = side * (enemy.isBoss ? 1.35 : 0.55);
  enemy.knockX = clampCorpseX(enemy.knockFromX + rawKnock) - enemy.knockFromX;
  enemy.knockZ = enemy.isBoss ? 0.85 : 0.28;
  if (enemy.root) {
    enemy.root.visible = true;
    enemy.root.frustumCulled = false;
    enemy.root.traverse((o) => { o.frustumCulled = false; });
    // Pitch the whole rig immediately. A missing or upright Death clip must not
    // leave the body standing. Boss tilt stays on the small C7 fall.
    if (!enemy.isBoss) layCorpseFlat(enemy, 0);
  }
  const act = playAnim(enemy.actions, ['Death'], 0.08, 'once');
  if (!act) {
    enemy.clipDone = true;
    return;
  }
  afterClip(enemy, act, () => {
    enemy.clipDone = true;
  });
}

/** Landed x stays inside the lane so a knock cannot fling the body off the road. */
function clampCorpseX(x) {
  const half = Math.max(0.5, (level?.roadHalfWidth ?? 3.2) - 0.45);
  return Math.max(-half, Math.min(half, x));
}

const _corpseBox = new THREE.Box3();

/** Yaw first, then pitch ~1.2 so the body lies along the lane. XYZ pitch was a backward lean. */
function layCorpseFlat(z, roll) {
  if (!z.root || z.isBoss) return;
  z.root.rotation.order = 'YXZ';
  z.root.rotation.y = Math.PI;
  z.root.rotation.x = CORPSE_LIE_X;
  z.root.rotation.z = roll || 0;
}

/** After the lie-down pitch, keep the body on the asphalt instead of clipping through it. */
function pinCorpseToRoad(z) {
  const root = z.root;
  if (!root || z.isBoss) return;
  root.updateMatrixWorld(true);
  _corpseBox.setFromObject(root);
  if (_corpseBox.isEmpty() || !Number.isFinite(_corpseBox.min.y)) return;
  root.position.y += -_corpseBox.min.y;
}

/** dt knockback. Non-boss bodies lie at rotation.x ≈ 1.2 and stay visible through poseHold. */
function stepCorpses(dt) {
  for (const z of zombies) {
    if (!z.dead || !z.root) continue;
    if (z.corpseT > 0) {
      z.root.visible = true;
      z.deathAge = (z.deathAge || 0) + dt;
      z.corpseT -= dt;
      const delay = z.fallDelay || 0;
      const fallT = Math.max(0, (z.deathAge || 0) - delay);
      const u = Math.min(1, fallT / 0.24);
      const ease = u * u * (3 - 2 * u);
      const slide = Math.max(ease, z.isBoss ? 0 : 0.4);
      z.root.position.x = clampCorpseX(z.knockFromX + (z.knockX || 0) * slide);
      z.root.position.z = z.knockFromZ + (z.knockZ || 0) * slide;
      if (z.isBoss) {
        const hop = Math.sin(Math.min(1, u) * Math.PI) * 0.65;
        z.root.position.y = (z.knockFromY || 0) + hop;
        z.root.rotation.z = (z.knockSign || 1) * 0.95 * ease;
        z.root.rotation.x = 0.22 * ease;
      } else {
        layCorpseFlat(z, (z.knockSign || 1) * 0.15 * ease);
        z.root.position.y = z.knockFromY || 0;
        pinCorpseToRoad(z);
      }
      if (z.corpseT <= 0) z.poseHold = z.isBoss ? 0.05 : POSE_HOLD_SEC;
    } else if (z.poseHold > 0) {
      z.root.visible = true;
      z.root.position.x = clampCorpseX(z.root.position.x);
      if (z.isBoss) z.root.position.y = z.knockFromY || 0;
      else {
        layCorpseFlat(z, z.root.rotation.z || 0);
        z.root.position.y = z.knockFromY || 0;
        pinCorpseToRoad(z);
      }
      z.poseHold -= dt;
    } else {
      z.root.visible = false;
    }
  }
}

function cityRng(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCity() {
  const rand = cityRng(CITY_SEED);
  const g = new THREE.Group();
  // Deck sits at y=0. This drop plus the side towers reads as an elevated highway.
  g.position.y = -36;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 84; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const rank = rand() < 0.42 ? 0 : 1;
    const lateral = 22 + rank * 16 + rand() * 10;
    const h = rank === 0 ? (8 + rand() * 12) : (18 + rand() * 26);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.58 + rand() * 0.05, 0.1 + rand() * 0.1, 0.26 + rand() * 0.2),
        roughness: 0.9,
        metalness: 0.05
      })
    );
    const x = side * lateral;
    const z = -40 + i * 4.7 + rand() * 2.4;
    m.scale.set(3.4 + rand() * 5.2, h, 3.4 + rand() * 5.8);
    m.position.set(x, h / 2, z);
    m.receiveShadow = true;
    g.add(m);
    if (rand() > 0.35) {
      const win = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: 0xffe2b0,
          emissive: 0xc4883a,
          emissiveIntensity: 0.22,
          roughness: 0.45
        })
      );
      win.scale.set(Math.max(0.6, m.scale.x * 0.42), 0.28 + rand() * 0.35, 0.12);
      win.position.set(x, h * (0.35 + rand() * 0.35), z);
      g.add(win);
    }
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 560),
    new THREE.MeshStandardMaterial({ color: 0x1c2838, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  g.add(ground);
  return g;
}

function buildRoad(length) {
  while (roadGroup.children.length) roadGroup.remove(roadGroup.children[0]);
  const segLen = 8;
  // Chase cam sits ~14m behind the runner. Tiles must exist behind z=0 or the
  // portrait near-field is only the flat gray underlay.
  const ROAD_LEAD = 28;
  const segs = Math.ceil((length + ROAD_LEAD) / segLen) + 4;
  const slabLen = length + ROAD_LEAD + 40;
  // Continuous asphalt underlay first — kills yellow void tears between glTF street tiles.
  // Thin slab (h≈0.12) with top near y=0 so the road never reads as a tall dark block.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(level.roadHalfWidth * 2 + 4.2, 0.12, slabLen),
    new THREE.MeshStandardMaterial({ color: 0x5c636b, roughness: 0.92, metalness: 0.04 })
  );
  slab.position.set(0, -0.06, (length - ROAD_LEAD) / 2);
  slab.name = 'asphaltUnderlay';
  slab.receiveShadow = true;
  slab.castShadow = false;
  roadGroup.add(slab);

  for (let i = 0; i < segs; i++) {
    // Street only (no streetCrack) — crack tiles caused yellow tear flash / gaps on showcase.
    const { root } = cloneModel('street', 1);
    root.scale.set(1, 1, 1);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.x > 0.01 && size.z > 0.01) {
      // Slight Z overlap (1.06×) so segments never open a gap; keep Y=1 (no stretch tear).
      root.scale.set((level.roadHalfWidth * 2.2) / size.x, 1, (segLen * 1.06) / size.z);
    }
    root.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(root);
    const zMid = -ROAD_LEAD + i * segLen + segLen * 0.5;
    root.position.set(0, -box2.min.y + 0.02, zMid);
    roadGroup.add(root);
    const flip = i % 2 === 0 ? 1 : -1;
    for (const side of [-1, 1]) {
      const yellow = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.26, segLen * 0.5),
        new THREE.MeshStandardMaterial({ color: 0xffd000, emissive: 0xffb000, emissiveIntensity: 0.55, roughness: 0.4 })
      );
      const black = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.26, segLen * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.72, metalness: 0.04 })
      );
      const lip = side * (level.roadHalfWidth + 0.34);
      yellow.position.set(lip, 0.18, zMid - flip * segLen * 0.25);
      black.position.set(lip, 0.18, zMid + flip * segLen * 0.25);
      roadGroup.add(yellow);
      roadGroup.add(black);
    }
    if (i % 2 === 0) {
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 18, 0.62),
          new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: 0.88, metalness: 0.06 })
        );
        pillar.position.set(side * (level.roadHalfWidth + 1.15), -9.05, zMid);
        pillar.castShadow = true;
        roadGroup.add(pillar);
      }
    }

    if (i % 2 === 0) {
      const { root: bar } = cloneModel(i % 4 === 0 ? 'barrier' : 'plastic', 1);
      fitProp(bar, 1.2);
      placeOnGround(bar, (i % 4 === 0 ? -1 : 1) * (level.roadHalfWidth + 2.0), zMid - 2);
      roadGroup.add(bar);
    }
    // No barrel.glb roadside props — at distance they read as gun barrels / planted rifles.
    if (i % 4 === 1) {
      const { root: light } = cloneModel('light', 1);
      fitProp(light, 2.4);
      placeOnGround(light, -level.roadHalfWidth - 2.8, zMid - 1);
      roadGroup.add(light);
    }
    if (i % 5 === 3) {
      const { root: cone } = cloneModel('cone', 1);
      fitProp(cone, 0.7);
      placeOnGround(cone, (i % 10 === 3 ? 1 : -1) * (level.roadHalfWidth + 2.1), zMid);
      roadGroup.add(cone);
    }
  }
}

/** Scale only. Prefers height; falls back to max-axis if Y is tiny (avoids giant barrels). Bosses lock height. */
function fitProp(root, targetHeight, opts = null) {
  const prev = root.position.clone();
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxAxis = Math.max(size.x, size.y, size.z);
  if (maxAxis < 1e-3) {
    root.position.copy(prev);
    return { scale: 1, groundY: 0 };
  }
  const lockHeight = !!(opts && opts.lockHeight);
  // Pathological flat/thin Y (rifle) → scale by longest axis. Bosses never take that shrink.
  let s;
  if (!lockHeight && (size.y < 1e-3 || size.y < maxAxis * 0.12 || (targetHeight / Math.max(size.y, 1e-6)) > 12)) {
    s = targetHeight / maxAxis;
  } else {
    s = targetHeight / Math.max(size.y, 1e-4);
  }
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const groundY = -box2.min.y;
  root.position.copy(prev);
  return { scale: s, groundY };
}

/** Scale by longest axis (safe for thin rifle meshes). */
function fitByMaxAxis(root, targetLen) {
  const prev = root.position.clone();
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const m = Math.max(size.x, size.y, size.z);
  if (m < 1e-3) {
    root.position.copy(prev);
    return { scale: 1, groundY: 0 };
  }
  const s = targetLen / m;
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const groundY = -box2.min.y;
  root.position.copy(prev);
  return { scale: s, groundY };
}

/** Set x/z and lift so world Box3.min.y == 0 after current scale/children. */
function placeOnGround(root, x, z) {
  root.position.set(x, 0, z);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.y = -box.min.y;
  return root.position.y;
}

function gateLabelText(gate) {
  if (gate.op === 'mul' || gate.op === 'fireMul') return `×${gate.value}`;
  if (gate.op === 'fire') return `火力+${gate.value}`;
  if (gate.op === 'sub') return `-${gate.value}`;
  return `+${gate.value}`;
}

function gateSideColors(gate, side) {
  if (gate.op === 'mul' || gate.op === 'fireMul') {
    return side < 0
      ? { color: 0xff7a18, emissive: 0x994400, frame: 0xffb347, css: '#ffb347' }
      : { color: 0x7a3cff, emissive: 0x3a1488, frame: 0xc9a0ff, css: '#e0c4ff' };
  }
  if (gate.op === 'fire') {
    return side < 0
      ? { color: 0xff5a3d, emissive: 0x881800, frame: 0xff9a7a, css: '#ffb09a' }
      : { color: 0xff8a3d, emissive: 0x883000, frame: 0xffc08a, css: '#ffd0a8' };
  }
  return side < 0
    ? { color: 0xffc933, emissive: 0xaa6600, frame: 0xffe066, css: '#ffe066' }
    : { color: 0x2f8bff, emissive: 0x0a3a9a, frame: 0x7ec0ff, css: '#b8dcff' };
}

function gateBoardWidth(gate) {
  const s = gate.widthScale || 1;
  // Stay narrow enough that the next pair is visible over/beside this one.
  return Math.min(2.35, 1.85 + Math.max(0, s - 0.55) * 0.42);
}

/** Rim only. A solid frame slab hid every gate behind the nearest pair. */
function makeGateRim(w, h, mat) {
  const g = new THREE.Group();
  const t = 0.1;
  const d = 0.08;
  const specs = [
    [w + t * 2, t, d, 0, h / 2],
    [w + t * 2, t, d, 0, -h / 2],
    [t, h, d, -(w / 2 + t / 2), 0],
    [t, h, d, w / 2 + t / 2, 0]
  ];
  for (const [bw, bh, bd, x, y] of specs) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    mesh.position.set(x, y, 0);
    g.add(mesh);
  }
  return g;
}

function makeGateVisual(gate, side) {
  const group = new THREE.Group();
  const colors = gateSideColors(gate, side);
  const w = gateBoardWidth(gate);
  const panelH = 2.2;
  const mat = new THREE.MeshStandardMaterial({
    color: colors.color,
    emissive: colors.emissive,
    emissiveIntensity: GATE_EMISSIVE,
    transparent: true,
    opacity: 1,
    roughness: 0.62,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: true,
    blending: THREE.NormalBlending
  });
  mat.fog = false;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, panelH), mat);
  // Toward the camera, in front of the rim, so the gate color is what you see.
  panel.position.set(0, 1.32, -0.12);
  panel.name = 'gatePanel';
  group.add(panel);
  // Unlit rim. A lit Standard frame blew out to white once it filled the portrait FOV.
  const frameMat = new THREE.MeshBasicMaterial({
    color: colors.frame,
    toneMapped: true,
    blending: THREE.NormalBlending
  });
  frameMat.fog = false;
  const frame = makeGateRim(w, panelH, frameMat);
  frame.position.y = 1.32;
  frame.name = 'gateFrame';
  group.add(frame);

  const labelEl = document.createElement('div');
  labelEl.className = 'gate-num';
  labelEl.dataset.side = side < 0 ? 'left' : 'right';
  labelEl.textContent = gateLabelText(gate);
  document.getElementById('gateLabels').appendChild(labelEl);

  group.userData.labelEl = labelEl;
  group.userData.labelColor = colors.css;
  group.userData.panel = panel;
  group.userData.panelMat = mat;
  group.userData.frameMat = frameMat;
  group.userData.baseColor = colors.color;
  group.userData.baseEmissive = colors.emissive;
  group.userData.baseFrame = colors.frame;
  group.userData.boardScaleX = 1;
  group.userData.redraw = (g) => {
    labelEl.textContent = gateLabelText(g);
    const sx = gateBoardWidth(g) / w;
    group.userData.boardScaleX = sx;
    if (group.userData.faceClose) {
      panel.scale.set(0.05, 0.05, 0.05);
      frame.scale.x = sx;
    } else {
      panel.scale.set(sx, 1, 1);
      frame.scale.x = sx;
    }
  };
  return group;
}

function makeBossHpBar() {
  const el = document.createElement('div');
  el.className = 'boss-hp';
  el.innerHTML = '<span class="boss-hp-label">BOSS</span><i></i>';
  document.getElementById('hud').appendChild(el);
  return el;
}

const squadPlusEl = document.createElement('div');
squadPlusEl.className = 'squad-plus';
squadPlusEl.style.display = 'none';
document.getElementById('hud').appendChild(squadPlusEl);

const _proj = new THREE.Vector3();

function zSpanHits(z0, z1, target, rad) {
  const lo = Math.min(z0, z1);
  const hi = Math.max(z0, z1);
  return hi >= target - rad && lo <= target + rad;
}

function hideGateVisual(g) {
  if (g.visual) g.visual.visible = false;
  const el = g.visual?.userData?.labelEl;
  if (el) el.style.display = 'none';
}

function spawnEnemy(ev, i, count, forcedX = null) {
  const kind = ev.kind || 'zombie';
  const assetKey = kindToAssetKey(kind);
  const bossLike = ev.type === 'boss' || (kind === 'dragon-evolved' && ev.hp >= 40);
  const { root, mixer, actions } = cloneModel(assetKey, 1);
  const height = enemyHeight(kind, !!bossLike, ev.scale || null, !!ev.mini);
  fitProp(root, height, { lockHeight: !!bossLike });
  root.userData.isFoe = true;
  if (bossLike) root.userData.isBoss = true;
  const x = forcedX == null
    ? (count <= 1 ? 0 : ((i / Math.max(1, count - 1)) - 0.5) * (ev.spread || 2.2))
    : forcedX;
  const z = ev.z || 0;
  // Quaternius glTF front is +Z. Math.PI turns that front toward the runner.
  root.rotation.y = Math.PI;
  root.visible = true;
  root.frustumCulled = false;
  root.traverse((o) => { o.frustumCulled = false; });
  const groundY = placeOnGround(root, x, z);
  entityGroup.add(root);
  if (bossLike || assetKey === 'dragonEvolved' || assetKey === 'demon') {
    playAnim(actions, ['Flying_Idle', 'Idle', 'Walk', 'Run']);
  } else {
    playAnim(actions, ['Walk', 'Run', 'Idle']);
  }
  const enemy = {
    root, mixer, actions,
    hp: ev.hp, maxHp: ev.hp,
    x, z, homeZ: z, groundY,
    dead: false, hitCooldown: 0,
    kind, isBoss: !!bossLike, mini: !!ev.mini,
    engaged: false, born: false, strikeCd: BOSS_STRIKE_INTERVAL,
    approachSpeed: enemyApproach(ev, level.runSpeed),
    animToken: 0, corpseT: 0, hpBar: null
  };
  zombies.push(enemy);
  return enemy;
}

function updateBossHpBar(z) {
  if (!z.hpBar) return;
  const pct = Math.max(0, z.hp / Math.max(1, z.maxHp));
  const fill = z.hpBar.querySelector('i');
  if (fill) fill.style.width = `${Math.floor(pct * 100)}%`;
  const label = z.hpBar.querySelector('.boss-hp-label');
  if (label) label.textContent = z.mini ? '迷你龙 BOSS' : '巨龙 BOSS';
}

/** Boss bar only while running and a live boss is inside gun range. */
function syncBossHpBarVisibility() {
  const bosses = zombies.filter(z => z.isBoss && !z.dead);
  for (const z of bosses) {
    const dist = Math.abs((z.z ?? 0) - (state?.z ?? 0));
    const show = !!(running && state && z.born && z.root?.visible !== false && dist < 40);
    if (show) {
      if (!z.hpBar) z.hpBar = makeBossHpBar();
      z.hpBar.style.display = '';
      updateBossHpBar(z);
    } else if (z.hpBar) {
      z.hpBar.style.display = 'none';
    }
  }
  if (!running || !bosses.length) {
    document.querySelectorAll('.boss-hp').forEach(el => { el.style.display = 'none'; });
  }
}

function spawnFromLevel() {
  gates.length = 0; zombies.length = 0;
  const labelHost = document.getElementById('gateLabels');
  if (labelHost) labelHost.innerHTML = '';
  document.querySelectorAll('.boss-hp').forEach(el => el.remove());
  while (entityGroup.children.length) entityGroup.remove(entityGroup.children[0]);
  for (const ev of level.events) {
    if (ev.type === 'gatePair') {
      for (const [sideName, side] of [['left', -1], ['right', 1]]) {
        const face = clampGateValue(ev[sideName].op, ev[sideName].value ?? 1);
        const raw = { ...ev[sideName], value: face, widthScale: 0.55 + Math.min(1.2, face / 20), side, z: ev.z, consumed: false };
        const visual = makeGateVisual(raw, side);
        const x = side * GATE_VIS_X;
        visual.position.set(x, 0, ev.z);
        entityGroup.add(visual);
        gates.push({ ...raw, x, visual });
      }
    } else if (ev.type === 'zombies') {
      const xs = ev.block === 'full'
        ? fullBlockXs(level.roadHalfWidth, ev.count)
        : spreadXs(ev.count, ev.spread ?? 1.6);
      xs.forEach((x, i) => spawnEnemy(ev, i, xs.length, x));
    } else if (ev.type === 'boss') {
      spawnEnemy(ev, 0, 1, 0);
    } else if (ev.type === 'finish') {
      const arch = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffe66d, emissive: 0xaa8800, emissiveIntensity: 1.2, transparent: true, opacity: 0.8 });
      const beam = new THREE.Mesh(new THREE.BoxGeometry(level.roadHalfWidth * 2.2, 0.35, 0.35), mat);
      beam.position.y = 2.8;
      arch.add(beam);
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.8, 0.35), mat);
        p.position.set(s * level.roadHalfWidth, 1.4, 0);
        arch.add(p);
      }
      arch.position.z = ev.z;
      entityGroup.add(arch);
      arch.userData.finishNeed = ev.needPeople || 8;
      arch.userData.isFinish = true;
      gates.push({ op: 'finish', value: ev.needPeople, z: ev.z, side: 0, visual: arch, consumed: false, hp: 0 });
    }
  }
}

function spawnPlayer() {
  squad.forEach(s => world.remove(s.root));
  squad = [];
  const { root, mixer, actions } = cloneModel('sam', 1);
  fitProp(root, 1.75);
  stripLooseWeapons(root);
  root.rotation.y = 0;
  const groundY = placeOnGround(root, 0, 0);
  world.add(root);
  playerRoot = root;
  playerMixer = mixer;
  playerActions = actions;
  playAnim(actions, ['Run', 'Idle']);
  attachPrimitiveGun(root);
  squad.push({ root, mixer, actions, groundY });
}

function shownPeople() {
  return capPeople(state.people, level);
}

function syncSquadCount() {
  const people = state ? shownPeople() : 1;
  const want = Math.max(1, visibleBodyCount(people));
  while (squad.length < want) {
    const { root, mixer, actions } = cloneModel('sam', 1);
    fitProp(root, 1.55);
    stripLooseWeapons(root);
    root.rotation.y = 0;
    const groundY = placeOnGround(root, playerX, state ? state.z : 0);
    world.add(root);
    playAnim(actions, ['Run', 'Idle']);
    attachPrimitiveGun(root);
    squad.push({ root, mixer, actions, groundY });
  }
  while (squad.length > want) {
    const s = squad.pop();
    if (s.mixer) {
      const idx = mixers.indexOf(s.mixer);
      if (idx >= 0) mixers.splice(idx, 1);
    }
    world.remove(s.root);
  }
  const half = level?.roadHalfWidth ?? 3.2;
  const inset = half - 0.35;
  const offsets = squadOffsets(squad.length);
  const baseZ = state ? state.z : 0;
  squad.forEach((s, i) => {
    const off = offsets[i] || { x: 0, z: 0 };
    const x = Math.max(-inset, Math.min(inset, playerX + off.x));
    s.root.position.x = x;
    s.root.position.z = baseZ + off.z;
    s.root.position.y = s.groundY ?? 0;
    s.root.rotation.y = 0;
  });
}

function updateSquadPlus() {
  const text = state ? squadPlusText(shownPeople()) : '';
  if (!text) {
    squadPlusEl.style.display = 'none';
    return;
  }
  _proj.set(playerX, 2.2, state.z);
  _proj.project(camera);
  const rect = canvas.getBoundingClientRect();
  const x = rect.left + (_proj.x * 0.5 + 0.5) * rect.width;
  const y = rect.top + (-_proj.y * 0.5 + 0.5) * rect.height;
  squadPlusEl.style.display = 'block';
  squadPlusEl.textContent = text;
  squadPlusEl.style.left = `${x}px`;
  squadPlusEl.style.top = `${y}px`;
}

function spawnBullet(origin, dir, damage) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffcc33, emissiveIntensity: 1.15 })
  );
  mesh.position.copy(origin);
  bulletGroup.add(mesh);
  const d = dir.clone().normalize();
  bullets.push({
    mesh, dir: d, speed: BULLET_SPEED, damage, life: BULLET_LIFE,
    x: origin.x, y: origin.y, z: origin.z
  });
}

function gateBurstColor(op) {
  switch (op) {
    case 'mul': return 0xff7a18;
    case 'fireMul': return 0xd2b0ff;
    case 'fire': return 0xff5a3d;
    case 'sub': return 0xff3b5c;
    case 'add':
    default: return 0xffe14a;
  }
}

function clearParticles() {
  while (particles.length) {
    const p = particles.pop();
    fxGroup.remove(p.mesh);
    p.mesh.material.dispose();
  }
}

function spawnBurst(x, y, z, color, count, life) {
  const need = Math.max(1, count | 0);
  evictParticles(need);
  const n = Math.min(need, FX_CAP);
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false
    });
    mat.fog = false;
    const mesh = new THREE.Mesh(burstGeo, mat);
    const ang = (i / n) * Math.PI * 2 + (i % 3) * 0.2;
    const speed = 1.4 + (i % 5) * 0.36;
    mesh.position.set(x + Math.cos(ang) * 0.18, y + (i % 5) * 0.1, z + Math.sin(ang) * 0.12);
    fxGroup.add(mesh);
    const maxLife = Math.max(0.45, life + (i % 4) * 0.03);
    particles.push({
      mesh,
      vx: Math.cos(ang) * speed,
      vy: 1.7 + (i % 4) * 0.42,
      vz: Math.sin(ang) * speed * 0.42,
      life: maxLife,
      maxLife
    });
  }
}

function spawnGateBurst(gate) {
  spawnBurst(gate.x, 1.3, gate.z, gateBurstColor(gate.op), Math.max(12, GATE_BURST_COUNT), 0.55);
}

function evictParticles(need) {
  const n = Math.max(1, need | 0);
  while (particles.length + n > FX_CAP && particles.length) {
    const old = particles.shift();
    fxGroup.remove(old.mesh);
    old.mesh.material.dispose();
  }
}

function nearestGateGap() {
  if (!state) return Infinity;
  let best = Infinity;
  for (const g of gates) {
    if (g.op === 'finish' || g.consumed) continue;
    const dz = Math.abs(g.z - state.z);
    if (dz < best) best = dz;
  }
  return best;
}

function spawnMuzzleFlash(origin) {
  const x = origin.x;
  const y = origin.y;
  const z = origin.z;
  const nearGate = nearestGateGap() < GATE_CLOSE_Z;
  if (nearGate) {
    // No additive billboard in the gate mouth. Stacked flashes were a second white slab.
    evictParticles(1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb060,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      depthTest: true,
      toneMapped: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });
    mat.fog = false;
    const spark = new THREE.Mesh(flashSparkGeo, mat);
    spark.position.set(x, y, z + 0.08);
    spark.scale.setScalar(0.16);
    spark.renderOrder = 3;
    fxGroup.add(spark);
    particles.push({
      mesh: spark, vx: 0, vy: 0.2, vz: 0.35, life: 0.06, maxLife: 0.06, flash: true, baseScale: 0.16
    });
    return;
  }
  const scaleMul = nearestGateGap() < GATE_FLASH_NEAR ? 0.35 : 1;
  const dim = nearestGateGap() < GATE_FLASH_NEAR ? 0.45 : 1;
  evictParticles(3);
  const makeMat = (color, opacity) => {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    mat.fog = false;
    return mat;
  };
  const push = (mesh, life, baseScale) => {
    mesh.scale.setScalar(baseScale);
    mesh.renderOrder = 3;
    fxGroup.add(mesh);
    particles.push({
      mesh, vx: 0, vy: 0, vz: 0.8, life, maxLife: life, flash: true, baseScale
    });
  };
  // Wide disc at the muzzle, high enough to clear the helmet from the chase cam.
  // Within 6m of a gate the flash shrinks and dims so it does not white out the board.
  const core = new THREE.Mesh(flashPlaneGeo, makeMat(0xfff8d0, dim));
  core.position.set(x, y, z);
  push(core, 0.1, 1.55 * scaleMul);
  const halo = new THREE.Mesh(flashPlaneGeo, makeMat(0xff6a00, 0.98 * dim));
  halo.position.set(x, y, z - 0.04);
  push(halo, 0.13, 2.45 * scaleMul);
  const spark = new THREE.Mesh(flashSparkGeo, makeMat(0xfff1a8, dim));
  spark.position.set(x, y, z + 0.14);
  push(spark, 0.11, 1.45 * scaleMul);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      fxGroup.remove(p.mesh);
      p.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    const k = Math.max(0, p.life / p.maxLife);
    if (p.flash) {
      p.mesh.material.opacity = k;
      if (p.baseScale) p.mesh.scale.setScalar(p.baseScale * (0.72 + 0.5 * k));
    } else {
      p.vy -= 2.6 * dt;
      p.mesh.material.opacity = k;
    }
  }
}

function addShake(amp, dur) {
  if (!(amp > 0) || !(dur > 0)) return;
  if (amp >= shakeAmp) {
    shakeAmp = amp;
    shakeDur = dur;
    shakeLeft = dur;
    shake = amp;
  }
}

function decayShake(dt) {
  if (shakeLeft <= 0) {
    shake = 0;
    shakeAmp = 0;
    shakeDur = 0;
    return;
  }
  shakeLeft = Math.max(0, shakeLeft - dt);
  shake = shakeDur > 0 ? shakeAmp * (shakeLeft / shakeDur) : 0;
  if (shakeLeft <= 0) {
    shake = 0;
    shakeAmp = 0;
  }
}

function spawnFloat(text, pos, color = '#fff', opts = {}) {
  if (opts.gate) {
    for (let i = floats.length - 1; i >= 0; i--) {
      if (floats[i].gate) {
        floats[i].el.remove();
        floats.splice(i, 1);
      }
    }
  } else {
    for (let i = floats.length - 1; i >= 0; i--) {
      if (!floats[i].gate) {
        floats[i].el.remove();
        floats.splice(i, 1);
      }
    }
  }
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);color:${color};font-weight:800;font-size:20px;text-shadow:0 2px 8px rgba(0,0,0,.45);pointer-events:none;`;
  document.getElementById('hud').appendChild(el);
  const life = opts.gate ? 0.64 : 0.8;
  floats.push({ el, pos: pos.clone(), life, maxLife: life, vy: 1.7, gate: !!opts.gate });
}

function updateFloats(dt) {
  const w = innerWidth, h = innerHeight;
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt;
    f.pos.y += f.vy * dt;
    const v = f.pos.clone().project(camera);
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    f.el.style.left = `${x}px`;
    f.el.style.top = `${y}px`;
    f.el.style.opacity = String(Math.max(0, f.life / (f.maxLife || 0.8)));
    if (f.life <= 0) {
      f.el.remove();
      floats.splice(i, 1);
    }
  }
}

function tuneGateSurface(g, rank, rankCount, dz) {
  const ud = g.visual?.userData;
  if (!ud?.panelMat) return;
  const close = dz < GATE_CLOSE_Z && dz > -2.5;
  const hasBehind = rank >= 0 && rank < rankCount - 1;
  const glassy = hasBehind && !close;
  ud.faceClose = close;
  ud.panelMat.blending = THREE.NormalBlending;
  ud.panelMat.transparent = true;
  if (ud.frameMat) ud.frameMat.blending = THREE.NormalBlending;
  if (close) {
    // Drop the fill. A bright plane this close becomes the white rectangle.
    // Rim stays; HTML digits stay. Scale is a backstop if visible flips back on.
    if (ud.panel) {
      ud.panel.visible = false;
      ud.panel.scale.set(0.05, 0.05, 0.05);
    }
    ud.panelMat.emissive.setHex(0x000000);
    ud.panelMat.emissiveIntensity = 0;
    ud.panelMat.opacity = 0.28;
    ud.panelMat.depthWrite = false;
    if (ud.baseColor != null) ud.panelMat.color.setHex(ud.baseColor).multiplyScalar(0.32);
    if (ud.frameMat && ud.baseFrame != null) ud.frameMat.color.setHex(ud.baseFrame);
  } else {
    if (ud.panel) {
      ud.panel.visible = true;
      const sx = ud.boardScaleX || 1;
      ud.panel.scale.set(sx, 1, 1);
      ud.panel.renderOrder = 10 - Math.max(0, rank);
    }
    if (ud.baseColor != null) ud.panelMat.color.setHex(ud.baseColor);
    if (ud.baseEmissive != null) ud.panelMat.emissive.setHex(ud.baseEmissive);
    ud.panelMat.emissiveIntensity = glassy ? 0 : GATE_EMISSIVE;
    ud.panelMat.opacity = glassy ? GATE_GLASS_OPACITY : 1;
    ud.panelMat.depthWrite = !glassy;
    if (ud.frameMat && ud.baseFrame != null) ud.frameMat.color.setHex(ud.baseFrame);
  }
}

/** Any gate still in the close band kills bloom for this frame. */
function syncCloseBloom() {
  let close = false;
  const zNow = state ? state.z : 0;
  if (state) {
    for (const g of gates) {
      if (g.consumed || g.op === 'finish') continue;
      const dz = g.z - zNow;
      if (dz < GATE_CLOSE_Z && dz > -2.5) { close = true; break; }
    }
  }
  bloom.enabled = !close;
  bloom.strength = close ? 0 : BLOOM_STRENGTH;
}

/** Next 2–3 gate pairs keep colored 3D boards. HTML digits mark only the nearest pair. */
function updateGateLabels(dt = 0) {
  const w = innerWidth, h = innerHeight;
  const zNow = state ? state.z : 0;
  const pairMap = new Map();
  for (const g of gates) {
    if (g.consumed || g.op === 'finish') continue;
    const dz = g.z - zNow;
    if (dz < -1.2 || dz > GATE_AHEAD_MAX) continue;
    const key = Math.round(g.z * 10) / 10;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(g);
  }
  const aheadZs = [...pairMap.keys()].sort((a, b) => a - b);
  const shownZs = aheadZs.slice(0, GATE_BOARDS_AHEAD);
  const boards = new Set(shownZs);
  const labelZ = shownZs.length ? shownZs[0] : null;
  const rankOf = new Map(shownZs.map((z, i) => [z, i]));

  for (const g of gates) {
    if (g.op === 'finish') continue;
    const key = Math.round(g.z * 10) / 10;
    const showBoard = boards.has(key) && !g.consumed;
    if (g.visual && !g.consumed) g.visual.visible = showBoard;
    if (g.visual && showBoard) {
      const rank = rankOf.get(key) ?? 0;
      const dz = g.z - zNow;
      tuneGateSurface(g, rank, shownZs.length, dz);
      const targetY = rank * GATE_STACK_Y;
      const k = dt > 0 ? Math.min(1, dt * 8) : 1;
      g.visual.position.y += (targetY - g.visual.position.y) * k;
    }
    const el = g.visual?.userData?.labelEl;
    if (!el) continue;
    const isNearest = labelZ != null && key === labelZ && !g.consumed;
    const allowed = isNearest && running && g.visual && g.visual.visible !== false;
    if (!allowed) {
      el.style.display = 'none';
      continue;
    }
    const worldPos = new THREE.Vector3();
    g.visual.getWorldPosition(worldPos);
    worldPos.y += 1.55;
    const v = worldPos.project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) {
      el.style.display = 'none';
      continue;
    }
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    el.style.display = 'block';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.fontSize = '42px';
    el.style.color = g.visual.userData.labelColor || '#fff';
  }
  syncCloseBloom();
}

function refreshStartCard() {
  const lv = levels[levelIndex];
  if (!lv) return;
  startMeta.textContent = `第 ${lv.id} 关 · ${lv.name}`;
  btnStart.textContent = `开始关卡 ${lv.id}`;
  if (hudLevel) hudLevel.textContent = String(lv.id);
}

function resetRun() {
  ended = false;
  holdingFinish = false;
  bossHold = 0;
  heldPointer = null;
  mixers.length = 0;
  level = levels[levelIndex];
  state = createLevelState(level);
  playerX = 0; targetX = 0; fireAcc = 10; shake = 0; shakeAmp = 0; shakeLeft = 0; shakeDur = 0;
  shakePhase = 0; hitStop = 0; killFlash = 0; bossIFrames = 0;
  const flashEl = document.getElementById('killFlash');
  if (flashEl) flashEl.style.opacity = '0';
  bossCamBlend = 0;
  clearParticles();
  bullets.splice(0).forEach(b => bulletGroup.remove(b.mesh));
  while (bulletGroup.children.length) bulletGroup.remove(bulletGroup.children[0]);
  floats.splice(0).forEach(f => f.el.remove());
  buildRoad(level.length);
  spawnFromLevel();
  spawnPlayer();
  syncSquadCount();
  updateHud();
  banner.textContent = `第 ${level.id} 关 · ${level.name}`;
  running = true;
  overlay.classList.add('hidden');
  settle.classList.add('hidden');
  clock.getDelta();
}

function updateHud() {
  hudPeople.textContent = String(shownPeople());
  hudFire.textContent = String(state.firepower);
  hudScore.textContent = String(state.score);
  hudProg.style.width = `${Math.floor(progress(state) * 100)}%`;
  if (hudLevel) hudLevel.textContent = String(level?.id ?? 1);
}

function endGame(won) {
  if (ended) return;
  ended = true;
  running = false;
  holdingFinish = false;
  state.won = won;
  state.lost = !won;
  state.finished = true;
  const stars = starRating(state, level);
  document.getElementById('settleTitle').textContent = won ? `第 ${level.id} 关结算` : '挑战失败';
  document.getElementById('settleResult').textContent = won ? (level.id >= 10 ? '通关终局！' : '胜利！') : '再冲一次';
  const two = twoKillsFor(level);
  const three = threeKillsFor(level);
  const tp = level.stars?.threePeople ?? 0;
  const tf = level.stars?.threeFirepower ?? 0;
  const starHint = `通关1★ · 击杀≥${two}(50%)=2★ · 人数≥${tp}+火力≥${tf}+击杀≥${three}(70%)=3★`;
  document.getElementById('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('starHint').textContent = starHint;
  document.getElementById('settleScore').textContent = String(state.score);
  document.getElementById('settleKills').textContent = String(state.kills);
  document.getElementById('settlePeople').textContent = String(shownPeople());
  document.getElementById('settleFire').textContent = String(state.firepower);

  const hasNext = won && levelIndex < levels.length - 1;
  btnNext.disabled = !hasNext;
  btnNext.title = hasNext ? `进入第 ${levelIndex + 2} 关` : (won ? '已是最终关' : '通关后解锁下一关');
  btnNext.textContent = hasNext ? `下一关 · 第 ${levelIndex + 2} 关` : (won ? '已通关全部关卡' : '下一关（未解锁）');
  btnNext.classList.toggle('ghost', !hasNext);
  settle.classList.remove('hidden');
  if (won) audio.playWin();
  else audio.playLose();
}

function tryFire() {
  const fs = fireStats(shownPeople(), state.firepower);
  fireAcc = 0;
  audio.playShoot();
  const origin = new THREE.Vector3(playerX, 1.2, state.z + 0.6);
  const n = fs.pellets;
  for (let i = 0; i < n; i++) {
    const spread = (i - (n - 1) / 2) * 0.06;
    const dir = new THREE.Vector3(spread, 0.02, 1);
    spawnBullet(origin.clone().add(new THREE.Vector3(spread * 0.4, 0, 0)), dir, fs.damage);
  }
  const guns = squad.length
    ? squad.map(s => new THREE.Vector3(s.root.position.x + 0.38, 1.42, s.root.position.z - 0.15))
    : [origin];
  const nearGate = nearestGateGap() < GATE_CLOSE_Z;
  const flashGuns = nearGate ? guns.slice(0, 1) : guns.slice(0, 4);
  for (const g of flashGuns) spawnMuzzleFlash(g);
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
addEventListener('resize', onResize);

/** Chase cam, pulled back while a boss is on screen so the tall model stays in frame.
 *  Shake offsets the camera only. lookAt stays on the road center — matching
 *  lookAt.x to the kicked camera cancelled the horizontal punch. */
function poseCamera(dt = 0) {
  const liveBoss = zombies.some(z => z.isBoss && z.born && (!z.dead || (z.corpseT || 0) > 0));
  const aim = liveBoss ? 1 : 0;
  bossCamBlend += (aim - bossCamBlend) * Math.min(1, Math.max(0, dt) * 4);
  if (!liveBoss && bossCamBlend < 0.001) bossCamBlend = 0;
  const u = bossCamBlend;
  const back = CAM_BACK + (BOSS_CAM_BACK - CAM_BACK) * u;
  const camHeight = CAM_Y + (BOSS_CAM_Y - CAM_Y) * u;
  const lookY = CAM_LOOK_Y + (BOSS_CAM_LOOK_Y - CAM_LOOK_Y) * u;
  const lookAhead = CAM_LOOK_AHEAD + (BOSS_CAM_LOOK_AHEAD - CAM_LOOK_AHEAD) * u;
  const z0 = state ? state.z : 0;
  shakePhase += Math.max(0, dt) * 36;
  const kickX = Math.max(-2.6, Math.min(2.6, Math.sin(shakePhase) * shake * 2.05));
  const kickY = Math.max(-1.2, Math.min(1.2, Math.cos(shakePhase * 1.17) * shake * 0.95));
  const kickZ = Math.max(-0.8, Math.min(0.8, Math.sin(shakePhase * 1.6) * shake * 0.55));
  const camX = kickX;
  const camY = camHeight + kickY;
  const camZ = z0 - back + kickZ;
  camera.position.set(camX, camY, camZ);
  camera.lookAt(0, lookY, z0 + lookAhead);
  camera.updateMatrixWorld();
  return { camX, camY, camZ };
}

function triggerKillPunch() {
  addShake(KILL_SHAKE_AMP, KILL_SHAKE_DUR);
  hitStop = Math.max(hitStop, KILL_HITSTOP);
  killFlash = 1;
}

function updateKillFlash(dt) {
  const el = document.getElementById('killFlash');
  if (killFlash > 0) killFlash = Math.max(0, killFlash - dt / KILL_FLASH_SEC);
  if (el) el.style.opacity = killFlash > 0 ? String(killFlash * 0.62) : '0';
}

/** Screen-right from camera matrix column 0. Behind the runner this column's world X is negative. */
function screenRightSign() {
  camera.updateMatrixWorld();
  return camera.matrixWorld.elements[0] >= 0 ? 1 : -1;
}

function projectClientX(worldX, worldY, worldZ) {
  _proj.set(worldX, worldY, worldZ);
  _proj.project(camera);
  const rect = canvas.getBoundingClientRect();
  return rect.left + (_proj.x * 0.5 + 0.5) * rect.width;
}

function steerFromPointer() {
  if (heldPointer == null || !level || !state) return;
  const half = level.roadHalfWidth;
  const z0 = state.z;
  const leftPx = projectClientX(-half, 0, z0);
  const rightPx = projectClientX(half, 0, z0);
  targetX = mapRoadPointer(heldPointer, leftPx, rightPx, half);
}

canvas.addEventListener('pointerdown', (e) => {
  heldPointer = e.clientX;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (heldPointer == null) return;
  heldPointer = e.clientX;
});
canvas.addEventListener('pointerup', () => { heldPointer = null; });
canvas.addEventListener('pointercancel', () => { heldPointer = null; });
addEventListener('keydown', (e) => {
  if (!level) return;
  let dir = 0;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dir = -1;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = 1;
  if (!dir) return;
  targetX = nudgeLane(targetX, dir * screenRightSign(), level.roadHalfWidth);
});

function syncMuteButton() {
  const muted = audio.muted;
  btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false');
  btnMute.textContent = muted ? '音效关' : '音效开';
}
syncMuteButton();
btnMute.addEventListener('click', (ev) => {
  ev.stopPropagation();
  ev.preventDefault();
  audio.toggleMuted();
  syncMuteButton();
});
window.addEventListener('pointerdown', () => { audio.unlock(); });

btnStart.onclick = () => resetRun();
document.getElementById('btnRetry').onclick = () => resetRun();
btnNext.onclick = () => {
  if (btnNext.disabled) return;
  if (levelIndex < levels.length - 1) {
    levelIndex += 1;
    refreshStartCard();
    resetRun();
  }
};

function update(dt) {
  if (!running || !state || !level) return;
  frameKills = 0;

  playerX += (targetX - playerX) * Math.min(1, dt * PLAYER_SMOOTH);
  playerX = clampLane(playerX, level.roadHalfWidth);
  bossIFrames = Math.max(0, bossIFrames - dt);

  const fin = gates.find(g => g.op === 'finish');
  const finishZ = fin ? fin.z : level.length;
  if (holdingFinish) state.z = finishZ;
  else state.z += level.runSpeed * dt;

  for (const z of zombies) {
    if (z.dead) continue;
    if (z.isBoss) {
      const wasBorn = z.born;
      const step = stepBossZ(z.z, z.homeZ ?? z.z, state.z, z.engaged, dt, holdingFinish);
      z.z = step.z;
      z.engaged = step.engaged;
      z.born = step.born;
      if (z.born && !wasBorn) z.strikeCd = BOSS_STRIKE_INTERVAL;
    } else {
      z.z -= z.approachSpeed * dt;
    }
    z.root.position.x = z.x;
    z.root.position.z = z.z;
    z.root.position.y = z.groundY ?? 0;
    z.root.visible = z.isBoss ? !!z.born : true;
    z.hitCooldown = Math.max(0, z.hitCooldown - dt);
  }

  const fs = fireStats(shownPeople(), state.firepower);
  fireAcc += dt;
  if (fireAcc >= fs.interval) tryFire();

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const z0 = b.z;
    b.x += b.dir.x * b.speed * dt;
    b.y += b.dir.y * b.speed * dt;
    b.z += b.dir.z * b.speed * dt;
    b.life -= dt;
    b.mesh.position.set(b.x, b.y, b.z);
    let hit = false;
    for (const g of gates) {
      if (g.consumed || g.op === 'finish') continue;
      if (zSpanHits(z0, b.z, g.z, GATE_BULLET_Z) && Math.abs(b.x - g.x) < GATE_BULLET_X) {
        const next = shootGate(g, b.damage);
        Object.assign(g, next);
        g.visual?.userData?.redraw?.(g);
        audio.playGateHit();
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const z of zombies) {
        if (z.dead || (z.isBoss && !z.born)) continue;
        const rad = enemyRadii(z, level.roadHalfWidth);
        if (zSpanHits(z0, b.z, z.z, rad.bulletZ) && Math.abs(b.x - z.x) < rad.bulletX) {
          const dmg = damageZombie(z, b.damage);
          z.hp = dmg.hp;
          spawnFloat(`-${b.damage}`, new THREE.Vector3(z.x, 1.8, z.z), '#d7ffe0');
          if (dmg.dead) {
            playDeath(z);
            spawnBurst(z.x, 1.4, z.z, z.isBoss ? 0xffd27a : 0xfff1c2, z.isBoss ? 14 : 10, 0.48);
            state.kills += 1;
            state.score += z.isBoss ? (200 + b.damage * 5) : (20 + b.damage * 2);
            if (z.isBoss) {
              state.bossDefeated = true;
              banner.textContent = z.mini ? '迷你龙倒下！' : '巨龙倒下！';
              addShake(BOSS_KILL_SHAKE_AMP, BOSS_KILL_SHAKE_DUR);
            } else {
              triggerKillPunch();
            }
            if (z.hpBar) { z.hpBar.remove(); z.hpBar = null; }
            audio.playDeath();
          } else {
            audio.playHit();
            playReaction(
              z,
              ['HitReact', 'Punch', 'Headbutt'],
              z.isBoss ? ['Flying_Idle', 'Idle', 'Walk'] : ['Walk', 'Run', 'Idle']
            );
          }
          updateBossHpBar(z);
          hit = true;
          break;
        }
      }
    }
    if (hit || b.life <= 0 || b.z > state.z + BULLET_MAX_AHEAD) {
      bulletGroup.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }

  for (const z of zombies) {
    if (z.dead) continue;
    if (z.isBoss) {
      if (!z.born) continue;
      z.strikeCd = (z.strikeCd ?? BOSS_STRIKE_INTERVAL) - dt;
      if (z.strikeCd > 0 || !bossCoversLane(z.x, playerX, level.roadHalfWidth)) continue;
      z.strikeCd = BOSS_STRIKE_INTERVAL;
      const before = state.people;
      state.people = capPeople(collideCost(state.people, z.hp, { boss: true, mini: !!z.mini }), level);
      const lost = Math.max(0, before - state.people);
      addShake(0.7, 0.16);
      if (lost > 0) {
        audio.playLosePeople();
        spawnFloat(`-${lost}`, new THREE.Vector3(playerX, 2.1, state.z + 1.2), '#ff6b8a');
        spawnBurst(playerX, 1.5, state.z, 0xff3b5c, 10, 0.48);
        playReaction(z, ['Headbutt', 'Punch'], ['Flying_Idle', 'Idle', 'Walk']);
      }
      updateHud();
      syncSquadCount();
      if (state.people <= 0) {
        banner.textContent = '被 Boss 撞到';
        endGame(false);
        return;
      }
      continue;
    }
    const rad = enemyRadii(z, level.roadHalfWidth);
    if (Math.abs(z.z - state.z) < rad.bodyZ && Math.abs(z.x - playerX) < rad.bodyX) {
      const before = state.people;
      state.people = capPeople(collideCost(state.people, z.hp, { boss: !!z.isBoss, mini: !!z.mini }), level);
      const lost = Math.max(0, before - state.people);
      addShake(z.isBoss ? 0.7 : 0.5, z.isBoss ? 0.16 : 0.12);
      if (lost > 0) {
        audio.playLosePeople();
        spawnFloat(`-${lost}`, new THREE.Vector3(z.x, 2, z.z), '#ff6b8a');
        spawnBurst(playerX, 1.5, state.z, 0xff3b5c, 10, 0.48);
      }
      playDeath(z);
      updateHud();
      syncSquadCount();
      if (state.people <= 0) {
        banner.textContent = '人数归零 · 被怪物撞到';
        endGame(false);
        return;
      }
    }
  }

  const takenZ = new Set();
  const sideNow = gateSideAtX(playerX, level.roadHalfWidth);
  for (const g of gates) {
    if (g.consumed || g.op === 'finish') continue;
    if (state.z < g.z) continue;
    if (g.side === sideNow && sideNow !== 0 && !takenZ.has(g.z)) {
      takenZ.add(g.z);
      g.consumed = true;
      const beforeP = state.people;
      const beforeF = state.firepower;
      const next = applyGate(state.people, state.firepower, g, level);
      state.people = capPeople(next.people, level);
      state.firepower = next.firepower;
      state.score += 50 + Math.max(0, state.people - beforeP) * 5 + Math.max(0, state.firepower - beforeF) * 20;
      addShake(0.32, 0.1);
      if (g.op === 'sub') audio.playGateDown();
      else audio.playGateUp();
      let msg = gateLabelText(g);
      if (g.op === 'add' || g.op === 'mul') msg = `人数${gateLabelText(g)}`;
      if (g.op === 'fire' || g.op === 'fireMul') msg = `火力${g.op === 'fireMul' ? '×' : '+'}${g.value}`;
      spawnFloat(msg, new THREE.Vector3(g.x, 2.4, g.z), '#fff', { gate: true });
      spawnGateBurst(g);
      hideGateVisual(g);
    } else {
      g.consumed = true;
      hideGateVisual(g);
    }
  }

  if (fin && !fin.consumed && state.z >= fin.z) {
    const liveBoss = zombies.find(z => z.isBoss && !z.dead);
    if (liveBoss) {
      holdingFinish = true;
      state.z = fin.z;
      bossHold += dt;
      banner.textContent = '先击败 Boss';
      if (bossHold >= BOSS_LEASH_SECONDS) {
        banner.textContent = 'Boss 未在时限内倒下';
        endGame(false);
        return;
      }
    } else {
      holdingFinish = false;
      fin.consumed = true;
      const need = fin.value || 8;
      if (state.people >= need) {
        state.score += 500 + state.people * 10;
        banner.textContent = '冲过终点门！';
        endGame(true);
      } else {
        banner.textContent = `人数不足（需要 ${need}）`;
        endGame(false);
      }
      return;
    }
  }

  if (!ended && !fin && state.z >= level.length + 5) {
    const liveBoss = zombies.some(z => z.isBoss && !z.dead);
    endGame(!liveBoss && state.people > 0);
    return;
  }

  syncSquadCount();
  updateHud();
}

function render() {
  const raw = Math.min(0.033, clock.getDelta());
  const pausing = hitStop > 0;
  if (pausing) hitStop = Math.max(0, hitStop - raw);
  const dt = pausing ? 0 : raw;
  mixers.forEach(m => m.update(dt));
  if (running && state) steerFromPointer();
  update(dt);

  stepCorpses(raw);
  updateParticles(raw);
  decayShake(raw);
  updateKillFlash(raw);
  const { camX, camY, camZ } = poseCamera(raw);

  const z0 = state ? state.z : 0;
  sun.target.position.set(playerX, 0, z0);
  sun.target.updateMatrixWorld();
  sun.position.set(playerX - 8, 18, z0 + 6);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.updateProjectionMatrix();

  for (const child of roadGroup.children) {
    if (child.name === 'asphaltUnderlay') {
      child.visible = true;
      continue;
    }
    child.updateWorldMatrix(true, false);
    const bbox = new THREE.Box3().setFromObject(child);
    child.visible = !(bbox.max.z < camZ - 2);
  }

  for (const s of squad) {
    if (s.root) s.root.position.y = s.groundY ?? 0;
  }

  hideNearCameraOccluders();
  syncBossHpBarVisibility();
  updateSquadPlus();
  updateFloats(dt);
  updateGateLabels(dt);
  if (DEBUG) updateDebugOverlay(camX, camY, camZ);

  city.position.z = (state ? state.z * 0.35 : 0);
  composer.render();
  requestAnimationFrame(render);
}

function updateDebugOverlay(camX, camY, camZ) {
  if (!window.__grCtl) {
    window.__grCtl = {
      jump(z) { if (state) state.z = z; },
      fire(n) { if (state) state.firepower = Math.max(1, n | 0); },
      people(n) { if (state && level) { state.people = capPeople(n, level); syncSquadCount(); } },
      killFront() {
        const zNow = state ? state.z : 0;
        const live = zombies.filter(z => !z.dead && !z.isBoss)
          .sort((a, b) => Math.abs(a.z - zNow) - Math.abs(b.z - zNow))[0];
        if (!live) return null;
        playDeath(live);
        triggerKillPunch();
        return { rx: live.root.rotation.x, x: live.root.position.x, vis: live.root.visible };
      },
      probe() {
        const zNow = state ? state.z : 0;
        return {
          z: zNow, running, bloom: bloom.enabled, strength: bloom.strength, shake, hitStop, killFlash,
          panels: gates.filter(g => !g.consumed && g.op !== 'finish').map(g => ({
            dz: +((g.z - zNow).toFixed(2)),
            panel: g.visual?.userData?.panel?.visible === true,
            sx: +(g.visual?.userData?.panel?.scale?.x || 0).toFixed(3),
            op: g.visual?.userData?.panelMat?.opacity,
            emis: g.visual?.userData?.panelMat?.emissiveIntensity
          })),
          corpses: zombies.filter(z => z.dead).map(z => {
            z.root.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(z.root);
            const size = new THREE.Vector3();
            box.getSize(size);
            const e = z.root.matrixWorld.elements;
            return {
              boss: !!z.isBoss,
              rx: +z.root.rotation.x.toFixed(3),
              ry: +z.root.rotation.y.toFixed(3),
              order: z.root.rotation.order,
              vis: z.root.visible !== false,
              x: +z.root.position.x.toFixed(2),
              y: +z.root.position.y.toFixed(2),
              h: +size.y.toFixed(2),
              minY: +box.min.y.toFixed(2),
              up: [+e[4].toFixed(2), +e[5].toFixed(2), +e[6].toFixed(2)],
              corpseT: +z.corpseT.toFixed(2),
              hold: +(z.poseHold || 0).toFixed(2)
            };
          })
        };
      }
    };
  }
  if (!debugEl) {
    debugEl = document.createElement('div');
    debugEl.id = 'debugOverlay';
    debugEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:40;padding:6px 8px;background:rgba(0,0,0,.65);color:#9f6;font:12px/1.35 monospace;white-space:pre;pointer-events:none;';
    document.body.appendChild(debugEl);
  }
  let enemyLine = 'enemy: none';
  const live = zombies.find(z => !z.dead && z.root?.visible !== false);
  if (live?.root) {
    live.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(live.root);
    enemyLine = `enemy min.y=${box.min.y.toFixed(3)} gy=${(live.groundY ?? 0).toFixed(3)} z=${live.z.toFixed(1)}`;
  }
  debugEl.textContent = `cam (${camX.toFixed(2)}, ${camY.toFixed(2)}, ${camZ.toFixed(2)})\n${enemyLine}`;
  const zNow = state ? state.z : 0;
  const liveBoards = gates.filter(g => g.op !== 'finish' && !g.consumed && g.visual?.visible).length;
  window.__grDbg = {
    cam: { x: camX, y: camY, z: camZ },
    targetX, playerX,
    enemies: zombies.filter(z => !z.dead).map(z => {
      z.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(z.root);
      const size = new THREE.Vector3();
      box.getSize(size);
      return {
        kind: z.kind, isBoss: !!z.isBoss, z: +z.z.toFixed(2), x: +z.x.toFixed(2), gy: z.groundY,
        scale: +z.root.scale.x.toFixed(3), minY: +box.min.y.toFixed(3),
        size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)]
      };
    }),
    squad: squad.map(s => ({ scale: +s.root.scale.x.toFixed(3), y: +s.root.position.y.toFixed(3), gy: s.groundY })),
    juice: {
      z: +zNow.toFixed(2),
      fx: fxGroup.children.length,
      particles: particles.length,
      shake: +shake.toFixed(3),
      bloom: { strength: bloom.strength, radius: bloom.radius, threshold: bloom.threshold, enabled: bloom.enabled },
      lie: zombies.filter(z => z.dead && !z.isBoss).map(z => ({
        rx: +(z.root?.rotation.x || 0).toFixed(2),
        vis: z.root?.visible !== false,
        x: +(z.root?.position.x || 0).toFixed(2),
        hold: +(z.poseHold || 0).toFixed(2),
        corpseT: +(z.corpseT || 0).toFixed(2)
      })),
      boards: liveBoards / 2,
      labels: [...document.querySelectorAll('.gate-num')].filter(el => el.style.display === 'block').length,
      corpses: zombies.filter(z => z.dead).map(z => ({
        boss: !!z.isBoss,
        corpseT: +z.corpseT.toFixed(3),
        visible: z.root?.visible !== false,
        age: +(z.deathAge || 0).toFixed(3)
      }))
    }
  };
}

(async function boot() {
  try {
    setLoad(0.05, '读取关卡…');
    await loadLevels();
    // HTML defaults the start card to level 1. Paint the deep-link label
    // as soon as levelIndex is known — do not wait out the glTF fetch.
    refreshStartCard();
    setLoad(0.1, '加载 glTF…');
    await loadAssets();
    setLoad(1, '就绪');
    refreshStartCard();
    buildRoad(level.length);
    spawnFromLevel();
    spawnPlayer();
    state = createLevelState(level);
    syncSquadCount();
    poseCamera();
    loading.classList.add('hidden');
    overlay.classList.remove('hidden');
    requestAnimationFrame(render);
  } catch (err) {
    console.error(err);
    loadMsg.textContent = '加载失败：' + err.message;
  }
})();
