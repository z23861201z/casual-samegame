import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  applyGate, shootGate, damageZombie, collideCost, fireStats,
  starRating, createLevelState, progress, kindToAssetKey, enemyHeight
} from './core.js';

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
  barrel: 'assets/gltf/barrel.glb',
  cone: 'assets/gltf/traffic-cone.glb',
  light: 'assets/gltf/street-light.glb',
  hydrant: 'assets/gltf/fire-hydrant.glb',
  trash: 'assets/gltf/trash-bag.glb',
  rifle: 'assets/gltf/rifle.glb'
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
const startMeta = document.getElementById('startMeta');

let levels = [];
let levelIndex = 0; // 0-based
let level = null;
let state = null;
let running = false;
let playerX = 0;
let targetX = 0;
let drag = null;
let fireAcc = 0;
let shake = 0;
let clock = new THREE.Clock();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9ff);
scene.fog = new THREE.Fog(0xb7d7ff, 28, 95);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 2.9, -7.4);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.92);
composer.addPass(bloom);

const hemi = new THREE.HemisphereLight(0xfff2d8, 0x6f8f6a, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e0, 2.1);
sun.position.set(-8, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -10;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.45));

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

function setLoad(p, msg) {
  loadBar.style.width = `${Math.floor(p * 100)}%`;
  if (msg) loadMsg.textContent = msg;
}

async function loadLevels() {
  const res = await fetch('data/levels.json');
  levels = await res.json();
  levelIndex = 0;
  level = levels[0];
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
  const root = gltf.scene.clone(true);
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          m.side = THREE.FrontSide;
        });
      }
    }
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
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, key === 'dragonEvolved' ? 1.4 : 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color, emissive: 0x143014, roughness: 0.35, metalness: 0.7 })
  );
  mesh.castShadow = true;
  g.add(mesh);
  g.scale.setScalar(scale);
  return { root: g, mixer: null, actions: {}, gltf: null };
}

function playAnim(actions, names, fade = 0.2) {
  if (!actions) return null;
  const list = Array.isArray(names) ? names : [names];
  let act = null;
  for (const name of list) {
    act = actions[name] || actions[`CharacterArmature|${name}`];
    if (act) break;
  }
  if (!act) return null;
  Object.values(actions).forEach(a => { if (a !== act && a.isRunning?.()) a.fadeOut(fade); });
  act.reset().fadeIn(fade).play();
  return act;
}

function buildCity() {
  const g = new THREE.Group();
  g.position.y = -18;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 60; i++) {
    const h = 6 + Math.random() * 18;
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.58, 0.15, 0.45 + Math.random() * 0.2),
        roughness: 0.85,
        metalness: 0.05
      })
    );
    const side = i % 2 === 0 ? -1 : 1;
    m.scale.set(3 + Math.random() * 4, h, 3 + Math.random() * 5);
    m.position.set(side * (14 + Math.random() * 22), h / 2, Math.random() * 140 - 20);
    g.add(m);
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 220),
    new THREE.MeshStandardMaterial({ color: 0x8fa9c4, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  g.add(ground);
  return g;
}

function buildRoad(length) {
  while (roadGroup.children.length) roadGroup.remove(roadGroup.children[0]);
  const segLen = 8;
  const segs = Math.ceil(length / segLen) + 4;
  for (let i = 0; i < segs; i++) {
    const useCrack = i % 3 === 2;
    const { root } = cloneModel(useCrack ? 'streetCrack' : 'street', 1);
    root.scale.set(1, 1, 1);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.x > 0.01 && size.z > 0.01) {
      root.scale.set((level.roadHalfWidth * 2.35) / size.x, 1.15, segLen / size.z);
    }
    const box2 = new THREE.Box3().setFromObject(root);
    root.position.set(0, -box2.min.y, i * segLen + segLen * 0.5);
    roadGroup.add(root);

    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.2, segLen * 0.98),
        new THREE.MeshStandardMaterial({ color: side < 0 ? 0xffd400 : 0x222222, emissive: 0x332200, emissiveIntensity: 0.2 })
      );
      strip.position.set(side * (level.roadHalfWidth + 0.15), 0.12, i * segLen + segLen * 0.5);
      roadGroup.add(strip);
      const strip2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.2, segLen * 0.98),
        new THREE.MeshStandardMaterial({ color: side < 0 ? 0x222222 : 0xffd400, emissive: 0x221100, emissiveIntensity: 0.15 })
      );
      strip2.position.set(side * (level.roadHalfWidth + 0.5), 0.12, i * segLen + segLen * 0.5);
      roadGroup.add(strip2);
    }

    if (i % 2 === 0) {
      const { root: bar } = cloneModel(i % 4 === 0 ? 'barrier' : 'plastic', 1);
      fitProp(bar, 1.2);
      bar.position.set((i % 4 === 0 ? -1 : 1) * (level.roadHalfWidth + 1.3), 0, i * segLen + 2);
      roadGroup.add(bar);
    }
    if (i % 3 === 0) {
      const { root: barrel } = cloneModel('barrel', 1);
      fitProp(barrel, 0.9);
      barrel.position.set((i % 6 === 0 ? 1 : -1) * (level.roadHalfWidth + 1.8), 0, i * segLen + 5);
      roadGroup.add(barrel);
    }
    if (i % 4 === 1) {
      const { root: light } = cloneModel('light', 1);
      fitProp(light, 2.4);
      light.position.set(-level.roadHalfWidth - 2.2, 0, i * segLen + 3);
      roadGroup.add(light);
    }
  }

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(level.roadHalfWidth * 2 + 3.5, 0.6, length + 40),
    new THREE.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.85, metalness: 0.05 })
  );
  slab.position.set(0, -0.35, length / 2);
  slab.receiveShadow = true;
  roadGroup.add(slab);
}

function fitProp(root, targetHeight) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y < 1e-3) return;
  const s = targetHeight / size.y;
  root.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
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

function makeGateVisual(gate, side) {
  const group = new THREE.Group();
  const colors = gateSideColors(gate, side);
  const w = 2.6 * (gate.widthScale || 1);
  const mat = new THREE.MeshStandardMaterial({
    color: colors.color,
    emissive: colors.emissive,
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.82,
    roughness: 0.35,
    metalness: 0.08,
    side: THREE.DoubleSide
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), mat);
  panel.position.y = 1.35;
  group.add(panel);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.18, 2.58, 0.14),
    new THREE.MeshStandardMaterial({
      color: colors.frame,
      emissive: colors.emissive,
      emissiveIntensity: 0.45,
      roughness: 0.45,
      metalness: 0.15
    })
  );
  frame.position.y = 1.35;
  group.add(frame);

  const labelEl = document.createElement('div');
  labelEl.className = 'gate-num';
  labelEl.dataset.side = side < 0 ? 'left' : 'right';
  labelEl.textContent = gateLabelText(gate);
  document.getElementById('gateLabels').appendChild(labelEl);

  group.userData.labelEl = labelEl;
  group.userData.labelColor = colors.css;
  group.userData.redraw = (g) => {
    gate = g;
    labelEl.textContent = gateLabelText(g);
    const sx = (2.6 * (g.widthScale || 1)) / 2.6;
    panel.scale.x = sx;
    frame.scale.x = sx;
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

function spawnEnemy(ev, i, count) {
  const kind = ev.kind || 'zombie';
  const assetKey = kindToAssetKey(kind);
  const isBoss = ev.type === 'boss' || kind === 'dragon-evolved' && ev.hp >= 40;
  const { root, mixer, actions } = cloneModel(assetKey, 1);
  const height = enemyHeight(kind, isBoss, ev.scale || null);
  // Readable wave: slightly larger + spawn further ahead so they walk into camera.
  const readable = !!ev.readableWave;
  fitProp(root, readable ? height * 1.12 : height);
  const spread = ev.spread || 2.2;
  const x = count <= 1 ? 0 : ((i / Math.max(1, count - 1)) - 0.5) * spread;
  const zJitter = readable ? (Math.random() - 0.5) * 0.4 : (Math.random() - 0.5) * 1.2;
  const z = (ev.z || 0) + zJitter + (readable ? 2.5 : 0);
  root.position.set(x, 0, z);
  root.rotation.y = Math.PI;
  entityGroup.add(root);

  if (isBoss || assetKey === 'dragonEvolved' || assetKey === 'demon') {
    playAnim(actions, ['Flying_Idle', 'Idle', 'Walk', 'Run']);
  } else {
    playAnim(actions, readable ? ['Run', 'Walk', 'Idle'] : ['Walk', 'Run', 'Idle']);
  }

  const enemy = {
    root, mixer, actions,
    hp: ev.hp, maxHp: ev.hp, x, z,
    dead: false, hitCooldown: 0,
    kind, isBoss: !!isBoss || ev.type === 'boss',
    mini: !!ev.mini,
    attackAcc: 0,
    approachSpeed: readable ? 3.4 : (isBoss || ev.type === 'boss' ? 0.55 : 1.6),
    hpBar: null
  };
  if (enemy.isBoss) {
    enemy.hpBar = makeBossHpBar();
    updateBossHpBar(enemy);
  }
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

function spawnFromLevel() {
  gates.length = 0; zombies.length = 0;
  const labelHost = document.getElementById('gateLabels');
  if (labelHost) labelHost.innerHTML = '';
  document.querySelectorAll('.boss-hp').forEach(el => el.remove());
  while (entityGroup.children.length) entityGroup.remove(entityGroup.children[0]);
  for (const ev of level.events) {
    if (ev.type === 'gatePair') {
      for (const [sideName, side] of [['left', -1], ['right', 1]]) {
        const raw = { ...ev[sideName], widthScale: 0.55 + Math.min(1.2, (ev[sideName].value || 1) / 20), side, z: ev.z, consumed: false };
        const visual = makeGateVisual(raw, side);
        visual.position.set(side * 1.55, 0, ev.z);
        entityGroup.add(visual);
        gates.push({ ...raw, visual });
      }
    } else if (ev.type === 'zombies') {
      for (let i = 0; i < ev.count; i++) spawnEnemy(ev, i, ev.count);
    } else if (ev.type === 'boss') {
      spawnEnemy(ev, 0, 1);
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
  root.position.set(0, 0, 0);
  root.rotation.y = 0;
  world.add(root);
  playerRoot = root;
  playerMixer = mixer;
  playerActions = actions;
  playAnim(actions, ['Run_Gun', 'Run', 'Idle_Gun', 'Idle']);
  squad.push({ root, mixer, actions });

  if (templates.rifle) {
    const { root: gun } = cloneModel('rifle', 1);
    fitProp(gun, 0.55);
    gun.position.set(0.25, 0.95, 0.35);
    gun.rotation.y = Math.PI;
    root.add(gun);
  }
}

function syncSquadCount() {
  const want = Math.min(9, state.people);
  while (squad.length < want) {
    const { root, mixer, actions } = cloneModel('sam', 1);
    fitProp(root, 1.55);
    world.add(root);
    playAnim(actions, ['Run_Gun', 'Run']);
    squad.push({ root, mixer, actions });
  }
  while (squad.length > want) {
    const s = squad.pop();
    world.remove(s.root);
  }
  const cols = Math.ceil(Math.sqrt(squad.length));
  squad.forEach((s, i) => {
    if (i === 0) {
      s.root.position.x = playerX;
      s.root.position.z = state.z;
      return;
    }
    const row = Math.floor(i / cols);
    const col = i % cols;
    s.root.position.x = playerX + (col - (cols - 1) / 2) * 0.55;
    s.root.position.z = state.z - row * 0.55 - 0.4;
  });
}

function spawnBullet(origin, dir, damage) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0xfff1a8, emissive: 0xffcc33, emissiveIntensity: 2.5 })
  );
  mesh.position.copy(origin);
  bulletGroup.add(mesh);
  bullets.push({ mesh, dir: dir.clone().normalize(), speed: 42, damage, life: 1.2 });
}

function spawnFloat(text, pos, color = '#fff') {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);color:${color};font-weight:800;font-size:20px;text-shadow:0 2px 8px rgba(0,0,0,.45);pointer-events:none;`;
  document.getElementById('hud').appendChild(el);
  floats.push({ el, pos: pos.clone(), life: 0.8, vy: 1.2 });
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
    f.el.style.opacity = String(Math.max(0, f.life / 0.8));
    if (f.life <= 0) {
      f.el.remove();
      floats.splice(i, 1);
    }
  }
}

/** Only render nearest 1–2 gate pairs ahead (no horizon label stack). */
function updateGateLabels() {
  const w = innerWidth, h = innerHeight;
  const zNow = state ? state.z : 0;
  const pairMap = new Map();
  for (const g of gates) {
    if (g.consumed || g.op === 'finish' || !g.visual?.userData?.labelEl) continue;
    if (g.z < zNow - 1.5) continue;
    const key = Math.round(g.z * 10) / 10;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(g);
  }
  const nearestZs = [...pairMap.keys()].sort((a, b) => a - b).slice(0, 2);
  const show = new Set(nearestZs);

  for (const g of gates) {
    const el = g.visual?.userData?.labelEl;
    if (!el) continue;
    const key = Math.round(g.z * 10) / 10;
    const allowed = show.has(key) && !g.consumed && g.op !== 'finish' && g.visual.visible !== false && running;
    if (!allowed) {
      el.style.display = 'none';
      continue;
    }
    const worldPos = new THREE.Vector3();
    g.visual.getWorldPosition(worldPos);
    worldPos.y += 1.35;
    const v = worldPos.project(camera);
    if (v.z > 1) {
      el.style.display = 'none';
      continue;
    }
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    el.style.display = 'block';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = g.visual.userData.labelColor || '#fff';
  }
}

function refreshStartCard() {
  const lv = levels[levelIndex];
  if (!lv) return;
  startMeta.textContent = `第 ${lv.id} 关 · ${lv.name}`;
  btnStart.textContent = `开始关卡 ${lv.id}`;
  if (hudLevel) hudLevel.textContent = String(lv.id);
}

function resetRun() {
  mixers.length = 0;
  level = levels[levelIndex];
  state = createLevelState(level);
  playerX = 0; targetX = 0; fireAcc = 0; shake = 0;
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
  hudPeople.textContent = String(state.people);
  hudFire.textContent = String(state.firepower);
  hudScore.textContent = String(state.score);
  hudProg.style.width = `${Math.floor(progress(state) * 100)}%`;
  if (hudLevel) hudLevel.textContent = String(level?.id ?? 1);
}

function endGame(won) {
  running = false;
  state.won = won;
  state.lost = !won;
  state.finished = true;
  const stars = starRating(state, level);
  document.getElementById('settleTitle').textContent = won ? `第 ${level.id} 关结算` : '挑战失败';
  document.getElementById('settleResult').textContent = won ? (level.id >= 10 ? '通关终局！' : '胜利！') : '再冲一次';
  const starHint = level.stars
    ? `（通关1★ · 人数≥${level.stars.twoPeople}=2★ · 人数≥${level.stars.threePeople}+火力≥${level.stars.threeFirepower}=3★）`
    : '';
  document.getElementById('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('starHint').textContent = starHint;
  document.getElementById('settleScore').textContent = String(state.score);
  document.getElementById('settleKills').textContent = String(state.kills);
  document.getElementById('settlePeople').textContent = String(state.people);
  document.getElementById('settleFire').textContent = String(state.firepower);

  const hasNext = won && levelIndex < levels.length - 1;
  btnNext.disabled = !hasNext;
  btnNext.title = hasNext ? `进入第 ${levelIndex + 2} 关` : (won ? '已是最终关' : '通关后解锁下一关');
  btnNext.textContent = hasNext ? `下一关 · 第 ${levelIndex + 2} 关` : (won ? '已通关全部关卡' : '下一关（未解锁）');
  btnNext.classList.toggle('ghost', !hasNext);
  settle.classList.remove('hidden');
}

function tryFire() {
  const fs = fireStats(state.people, state.firepower);
  fireAcc = 0;
  const origin = new THREE.Vector3(playerX, 1.2, state.z + 0.6);
  for (let i = 0; i < fs.pellets; i++) {
    const spread = (i - (fs.pellets - 1) / 2) * 0.06;
    const dir = new THREE.Vector3(spread, 0.02, 1);
    spawnBullet(origin.clone().add(new THREE.Vector3(spread * 0.4, 0, 0)), dir, fs.damage);
  }
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

function pointerX(e) {
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  return (x / innerWidth) * 2 - 1;
}
canvas.addEventListener('pointerdown', e => {
  drag = { x0: pointerX(e), px: targetX };
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (drag == null) return;
  const dx = pointerX(e) - drag.x0;
  targetX = THREE.MathUtils.clamp(drag.px + dx * level.roadHalfWidth * 1.4, -level.roadHalfWidth + 0.4, level.roadHalfWidth - 0.4);
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
addEventListener('keydown', e => {
  if (!level) return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') targetX = Math.max(-level.roadHalfWidth + 0.4, targetX - 0.6);
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') targetX = Math.min(level.roadHalfWidth - 0.4, targetX + 0.6);
});

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
  if (!running) return;
  state.z += level.runSpeed * dt;
  playerX += (targetX - playerX) * Math.min(1, dt * 12);

  for (const z of zombies) {
    if (z.dead) continue;
    z.z -= z.approachSpeed * dt;
    z.root.position.z = z.z;
    z.root.position.x += (z.x - z.root.position.x) * dt * 2;
    z.hitCooldown = Math.max(0, z.hitCooldown - dt);

    if (z.isBoss) {
      z.attackAcc += dt;
      if (z.attackAcc > 2.4 && Math.abs(z.z - state.z) < 14) {
        z.attackAcc = 0;
        playAnim(z.actions, ['Punch', 'Headbutt', 'Weapon']);
        setTimeout(() => {
          if (!z.dead) playAnim(z.actions, ['Flying_Idle', 'Idle', 'Walk']);
        }, 600);
        // Boss breath / swipe chip when close
        if (Math.abs(z.z - state.z) < 4.5) {
          const loss = z.mini ? 2 : 4;
          state.people = Math.max(0, state.people - loss);
          shake = Math.max(shake, 0.7);
          spawnFloat(`-${loss}`, z.root.position.clone().setY(2.6), '#ff6b8a');
          syncSquadCount();
          updateHud();
          if (state.people <= 0) {
            banner.textContent = '被 Boss 击溃';
            endGame(false);
            return;
          }
        }
      }
      updateBossHpBar(z);
    }

    const hitR = z.isBoss ? 1.6 : 0.9;
    const hitX = z.isBoss ? 1.35 : 0.85;
    if (Math.abs(z.z - state.z) < hitR && Math.abs(z.root.position.x - playerX) < hitX) {
      state.people = collideCost(state.people, z.hp);
      shake = Math.max(shake, z.isBoss ? 0.85 : 0.55);
      spawnFloat(`-${Math.max(1, Math.ceil(z.hp / 2))}`, z.root.position.clone().setY(2), '#ff6b8a');
      if (!z.isBoss) {
        z.dead = true;
        z.root.visible = false;
      } else {
        // Boss contact: knock player slightly and keep boss
        z.z += 2.2;
        playAnim(z.actions, ['Punch', 'Headbutt']);
      }
      updateHud();
      syncSquadCount();
      if (state.people <= 0) {
        banner.textContent = z.isBoss ? '被 Boss 撞到' : '人数归零 · 被怪物撞到';
        endGame(false);
        return;
      }
    }
  }

  const fs = fireStats(state.people, state.firepower);
  fireAcc += dt;
  if (fireAcc >= fs.interval) tryFire();

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.mesh.position.addScaledVector(b.dir, b.speed * dt);
    b.life -= dt;
    let hit = false;
    for (const g of gates) {
      if (g.consumed || g.op === 'finish') continue;
      if (Math.abs(b.mesh.position.z - g.z) < 0.55 && Math.abs(b.mesh.position.x - g.visual.position.x) < 1.5) {
        const next = shootGate(g, b.damage);
        Object.assign(g, next);
        g.visual.userData.redraw?.(g);
        spawnFloat(gateLabelText(g), g.visual.position.clone().setY(2.2), '#ffe66d');
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const z of zombies) {
        if (z.dead) continue;
        const zr = z.isBoss ? 1.1 : 0.7;
        const xr = z.isBoss ? 1.0 : 0.55;
        if (Math.abs(b.mesh.position.z - z.z) < zr && Math.abs(b.mesh.position.x - z.root.position.x) < xr) {
          const dmg = damageZombie(z, b.damage);
          Object.assign(z, dmg);
          spawnFloat(`-${b.damage}`, z.root.position.clone().setY(1.8), '#9cffb0');
          updateBossHpBar(z);
          if (z.dead) {
            state.kills += 1;
            state.score += z.isBoss ? (200 + b.damage * 5) : (20 + b.damage * 2);
            if (z.isBoss) {
              state.bossDefeated = true;
              banner.textContent = z.mini ? '迷你龙倒下！' : '巨龙倒下！';
            }
            playAnim(z.actions, ['Death']);
            if (z.hpBar) z.hpBar.remove();
            setTimeout(() => { z.root.visible = false; }, z.isBoss ? 900 : 500);
          } else {
            playAnim(z.actions, ['HitReact']);
            setTimeout(() => {
              if (!z.dead) {
                playAnim(z.actions, z.isBoss ? ['Flying_Idle', 'Idle', 'Walk'] : ['Walk', 'Run', 'Idle']);
              }
            }, 350);
          }
          hit = true;
          break;
        }
      }
    }
    if (hit || b.life <= 0 || b.mesh.position.z > state.z + 40) {
      bulletGroup.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }

  // Must defeat remaining boss before finish counts as win if still alive near finish
  for (const g of gates) {
    if (g.consumed) continue;
    if (g.op === 'finish') {
      if (state.z >= g.z) {
        const liveBoss = zombies.some(z => z.isBoss && !z.dead);
        if (liveBoss) {
          // Hold player at finish gate until boss dies — soft fail if they linger without killing
          state.z = Math.min(state.z, g.z);
          banner.textContent = '先击败 Boss！';
          continue;
        }
        g.consumed = true;
        if (state.people >= (g.value || 8)) {
          state.score += 500 + state.people * 10;
          banner.textContent = '冲过终点门！';
          endGame(true);
        } else {
          banner.textContent = `人数不足（需要 ${g.value}）`;
          endGame(false);
        }
        return;
      }
      continue;
    }
    if (state.z >= g.z && Math.abs(playerX - g.visual.position.x) < 1.55) {
      g.consumed = true;
      const beforeP = state.people;
      const beforeF = state.firepower;
      const next = applyGate(state.people, state.firepower, g);
      state.people = next.people;
      state.firepower = next.firepower;
      state.score += 50 + Math.max(0, state.people - beforeP) * 5 + Math.max(0, state.firepower - beforeF) * 20;
      shake = Math.max(shake, 0.35);
      let msg = gateLabelText(g);
      if (g.op === 'add' || g.op === 'mul') msg = `人数${gateLabelText(g)}`;
      if (g.op === 'fire' || g.op === 'fireMul') msg = `火力${g.op === 'fireMul' ? '×' : '+'}${g.value}`;
      spawnFloat(msg, g.visual.position.clone().setY(2.4), '#fff');
      g.visual.visible = false;
      if (g.visual.userData.labelEl) g.visual.userData.labelEl.style.display = 'none';
      syncSquadCount();
      updateHud();
    } else if (state.z >= g.z + 1.2) {
      g.consumed = true;
      g.visual.visible = false;
      if (g.visual.userData.labelEl) g.visual.userData.labelEl.style.display = 'none';
    }
  }

  if (state.z >= level.length + 5 && !state.finished) {
    const liveBoss = zombies.some(z => z.isBoss && !z.dead);
    endGame(!liveBoss && state.people > 0);
  }

  syncSquadCount();
  updateHud();
}

function render() {
  const dt = Math.min(0.033, clock.getDelta());
  mixers.forEach(m => m.update(dt));

  update(dt);

  shake = Math.max(0, shake - dt * 1.8);
  const camX = playerX * 0.55 + (Math.random() - 0.5) * shake;
  // PR2 camera: full Sam body + gun in portrait frame (not gun-row crop).
  const camY = 2.75 + (Math.random() - 0.5) * shake * 0.3;
  const camZ = state ? state.z - 7.5 : -7.5;
  camera.position.set(camX, camY, camZ);
  camera.lookAt(playerX * 0.25, 1.05, (state ? state.z : 0) + 5.8);
  camera.updateMatrixWorld();

  updateFloats(dt);
  updateGateLabels();

  city.position.z = (state ? state.z * 0.35 : 0);
  composer.render();
  requestAnimationFrame(render);
}

(async function boot() {
  try {
    setLoad(0.05, '读取关卡…');
    await loadLevels();
    setLoad(0.1, '加载 glTF…');
    await loadAssets();
    setLoad(1, '就绪');
    refreshStartCard();
    buildRoad(level.length);
    spawnFromLevel();
    spawnPlayer();
    state = createLevelState(level);
    syncSquadCount();
    loading.classList.add('hidden');
    overlay.classList.remove('hidden');
    requestAnimationFrame(render);
  } catch (err) {
    console.error(err);
    loadMsg.textContent = '加载失败：' + err.message;
  }
})();
