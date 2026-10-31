import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
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
let bossIFrames = 0; // short invuln after boss bump / breath
let clock = new THREE.Clock();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9ff);
scene.fog = new THREE.Fog(0xb7d7ff, 28, 95);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.35, 200);
camera.position.set(0, 3.0, -7.2);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.18, 0.4, 0.96);
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

/** Safety net: hide absurd near-camera meshes (bone-scale blowups / leftovers). */
function hideNearCameraOccluders() {
  const camPos = camera.position;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const roots = [];
  if (world) roots.push(world);
  for (const s of squad) if (s?.root) roots.push(s.root);
  for (const root of roots) {
    root.traverse(o => {
      if (!o.isMesh || o.visible === false) return;
      // Never hide the intentional bright gun.
      if (o.name === 'primitiveGun' || o.parent?.name === 'primitiveGun') return;
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
  // Continuous asphalt underlay first — kills yellow void tears between glTF street tiles.
  // Thin slab (h≈0.12) with top near y=0 so the road never reads as a tall dark block.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(level.roadHalfWidth * 2 + 4.2, 0.12, length + 48),
    new THREE.MeshStandardMaterial({ color: 0x5c636b, roughness: 0.92, metalness: 0.04 })
  );
  slab.position.set(0, -0.06, length / 2);
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
    root.position.set(0, -box2.min.y + 0.02, i * segLen + segLen * 0.5);
    roadGroup.add(root);

    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.18, segLen * 1.02),
        new THREE.MeshStandardMaterial({ color: side < 0 ? 0xffd400 : 0x222222, emissive: 0x332200, emissiveIntensity: 0.2 })
      );
      strip.position.set(side * (level.roadHalfWidth + 0.15), 0.12, i * segLen + segLen * 0.5);
      roadGroup.add(strip);
      const strip2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.18, segLen * 1.02),
        new THREE.MeshStandardMaterial({ color: side < 0 ? 0x222222 : 0xffd400, emissive: 0x221100, emissiveIntensity: 0.15 })
      );
      strip2.position.set(side * (level.roadHalfWidth + 0.5), 0.12, i * segLen + segLen * 0.5);
      roadGroup.add(strip2);
    }

    if (i % 2 === 0) {
      const { root: bar } = cloneModel(i % 4 === 0 ? 'barrier' : 'plastic', 1);
      fitProp(bar, 1.2);
      placeOnGround(bar, (i % 4 === 0 ? -1 : 1) * (level.roadHalfWidth + 2.0), i * segLen + 2);
      roadGroup.add(bar);
    }
    // No barrel.glb roadside props — at distance they read as gun barrels / planted rifles.
    if (i % 4 === 1) {
      const { root: light } = cloneModel('light', 1);
      fitProp(light, 2.4);
      placeOnGround(light, -level.roadHalfWidth - 2.8, i * segLen + 3);
      roadGroup.add(light);
    }
    if (i % 5 === 3) {
      const { root: cone } = cloneModel('cone', 1);
      fitProp(cone, 0.7);
      placeOnGround(cone, (i % 10 === 3 ? 1 : -1) * (level.roadHalfWidth + 2.1), i * segLen + 4);
      roadGroup.add(cone);
    }
  }
}

/** Scale only. Prefers height; falls back to max-axis if Y is tiny (avoids giant barrels/dragons). */
function fitProp(root, targetHeight) {
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
  // Pathological flat/thin Y (rifle, some dragon rests) → scale by longest axis.
  let s;
  if (size.y < 1e-3 || size.y < maxAxis * 0.12 || (targetHeight / Math.max(size.y, 1e-6)) > 12) {
    s = targetHeight / maxAxis;
  } else {
    s = targetHeight / size.y;
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
  // Boss heights capped so mesh never swallows the follow cam.
  let height = enemyHeight(kind, isBoss, ev.scale || null);
  const bossLike = isBoss || ev.type === 'boss' || kind === 'dragon-evolved';
  if (bossLike) {
    // Mini ~2.6 fills mid-lane; finale ~2.2–2.4 — readable, not speck or face-plant.
    height = ev.mini ? 2.6 : 2.3;
  }
  // Readable debut: target ~2.2m tall; lazy-activate when player nears.
  const readable = !!ev.readableWave;
  if (bossLike) {
    fitProp(root, height);
    root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(root);
    const sz = new THREE.Vector3();
    b.getSize(sz);
    const span = Math.max(sz.x, sz.z);
    const maxSpan = height * (ev.mini ? 1.35 : 1.15); // mini wings read; still one model
    if (span > maxSpan && span > 1e-3) {
      root.scale.multiplyScalar(maxSpan / span);
    }
  } else if (readable) {
    fitProp(root, Math.max(2.2, height));
  } else {
    fitProp(root, height);
  }
  const spread = ev.spread || 2.2;
  const x = count <= 1 ? 0 : ((i / Math.max(1, count - 1)) - 0.5) * spread;
  const zJitter = readable ? (Math.random() - 0.5) * 0.15 : (Math.random() - 0.5) * 1.2;
  // Spawn at event z; bosses park mid gun-range (mini) or ≥25m ahead (finale).
  let z = (ev.z || 0) + zJitter;
  if (bossLike) {
    const startZ = state ? state.z : 0;
    if (ev.mini) {
      z = Math.max(ev.z || 0, startZ + 18);
      z = Math.min(z, startZ + 28);
    } else {
      z = Math.max(z, ev.z || 0, startZ + 25);
    }
  }
  // Quaternius +Z forward: Math.PI faces -Z toward player/camera behind.
  root.rotation.y = Math.PI;
  const groundY = placeOnGround(root, x, z);
  entityGroup.add(root);

  // Mini (L5) + finale (L10): hide until run starts so menu never shows wrong mesh.
  let appearAfterZ = -Infinity;
  {
    const qLevel = new URLSearchParams(location.search).get('level');
    const isL10 = level?.id === 10 || qLevel === '10';
    const isL5 = level?.id === 5 || qLevel === '5';
    if (bossLike && (ev.mini || isL10 || isL5)) {
      appearAfterZ = 1;
      root.visible = false;
    }
  }

  if (isBoss || assetKey === 'dragonEvolved' || assetKey === 'demon') {
    playAnim(actions, ['Flying_Idle', 'Idle', 'Walk', 'Run']);
  } else {
    playAnim(actions, ['Walk', 'Run', 'Idle']);
  }

  const enemy = {
    root, mixer, actions,
    hp: ev.hp, maxHp: ev.hp, x, z,
    groundY,
    dead: false, hitCooldown: 0,
    kind, isBoss: !!isBoss || ev.type === 'boss',
    mini: !!ev.mini,
    attackAcc: 0,
    readable,
    showcaseT: 0,
    showcased: false,
    showcaseActive: false,
    showcaseScaled: false,
    spawnedVisible: !readable, // readable waves lazy-activate into frame
    appearAfterZ,
    eventZ: ev.z || 0,
    // Slow crawl until showcase pins them in the readable band.
    // Mini crawls slower so mid-lane fight stays readable (~0.32).
    approachSpeed: readable ? 0.45 : (ev.mini ? 0.32 : (isBoss || ev.type === 'boss' ? 0.5 : 1.6)),
    hpBar: null
  };
  if (readable) {
    // Park far / invisible until activation band — prevents off-screen deletes.
    root.visible = false;
  }
  // Boss HP bar is created/shown only while running & in range (see syncBossHpBarVisibility).
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

/** Boss bar only while running, past start, and within 40m of a live boss. */
function syncBossHpBarVisibility() {
  const bosses = zombies.filter(z => z.isBoss && !z.dead);
  for (const z of bosses) {
    const dist = Math.abs((z.z ?? 0) - (state?.z ?? 0));
    const show = !!(running && state && state.z > 1 && z.root?.visible !== false && dist < 40);
    if (show) {
      if (!z.hpBar) z.hpBar = makeBossHpBar();
      z.hpBar.style.display = '';
      updateBossHpBar(z);
    } else if (z.hpBar) {
      z.hpBar.style.display = 'none';
    }
  }
  // Menu / pre-run / no boss: strip any leftover bars.
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
  stripLooseWeapons(root); // hide Axe / bind-pose guns — never plant rifles on the road
  root.rotation.y = 0;
  const groundY = placeOnGround(root, 0, 0);
  world.add(root);
  playerRoot = root;
  playerMixer = mixer;
  playerActions = actions;
  // Run clip + bright root-parented gun (never bone-parented).
  playAnim(actions, ['Run', 'Idle']);
  attachPrimitiveGun(root);
  squad.push({ root, mixer, actions, groundY });
}

function syncSquadCount() {
  // Cap visible clones at 3 (incl. lead); side flanks only — never a rifle wall.
  const want = Math.min(3, Math.max(1, state.people));
  while (squad.length < want) {
    const { root, mixer, actions } = cloneModel('sam', 1);
    fitProp(root, 1.55);
    stripLooseWeapons(root);
    const groundY = placeOnGround(root, 0, state ? state.z : 0);
    world.add(root);
    playAnim(actions, ['Run', 'Idle']);
    attachPrimitiveGun(root);
    squad.push({ root, mixer, actions, groundY });
  }
  while (squad.length > want) {
    const s = squad.pop();
    world.remove(s.root);
  }
  // Lead on lane center; clones side-only. Re-ground every frame (anim/sync must not zero Y).
  squad.forEach((s, i) => {
    // Refresh groundY periodically from live bounds in case scale/children changed.
    const gy = s.groundY ?? 0;
    if (i === 0) {
      s.root.position.x = playerX;
      s.root.position.z = state.z;
      s.root.position.y = gy;
      return;
    }
    const side = (i % 2 === 0) ? 1 : -1;
    const rank = Math.ceil(i / 2);
    s.root.position.x = playerX + side * Math.min(1.45, 0.75 * rank);
    s.root.position.z = state.z;
    s.root.position.y = gy;
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

function spawnFloat(text, pos, color = '#fff', opts = {}) {
  // Gate reward floats must never stack into a second "gate number" string.
  if (opts.gate) {
    for (let i = floats.length - 1; i >= 0; i--) {
      if (floats[i].gate) {
        floats[i].el.remove();
        floats.splice(i, 1);
      }
    }
  } else {
    // Combat floats: only 1 non-gate float at a time (replace previous → no -2-2-2 stack).
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
  floats.push({ el, pos: pos.clone(), life: opts.gate ? 0.55 : 0.8, vy: 1.2, gate: !!opts.gate });
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

/** Strictly nearest 1 gate pair ahead (distance-capped; no vanishing-point stack). */
function updateGateLabels() {
  const w = innerWidth, h = innerHeight;
  const zNow = state ? state.z : 0;
  const MAX_AHEAD = 18;
  const pairMap = new Map();
  for (const g of gates) {
    if (g.consumed || g.op === 'finish') continue;
    const dz = g.z - zNow;
    if (dz < -1.2 || dz > MAX_AHEAD) continue;
    const key = Math.round(g.z * 10) / 10;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(g);
  }
  const nearestZs = [...pairMap.keys()].sort((a, b) => a - b).slice(0, 1);
  const show = new Set(nearestZs);

  for (const g of gates) {
    if (g.op === 'finish') continue;
    const key = Math.round(g.z * 10) / 10;
    const isNearest = show.has(key) && !g.consumed;
    // Hide non-nearest pair 3D panels too (not just HTML labels).
    if (g.visual && !g.consumed) {
      g.visual.visible = !!isNearest;
    }
    const el = g.visual?.userData?.labelEl;
    if (!el) continue;
    const allowed = isNearest && running && g.visual.visible !== false;
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
  playerX = 0; targetX = 0; fireAcc = 0; shake = 0; bossIFrames = 0;
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
  bossIFrames = Math.max(0, bossIFrames - dt);

  for (const z of zombies) {
    if (z.dead) continue;

    // Boss: stay hidden until player has moved past appearAfterZ.
    if (z.appearAfterZ > -Infinity && state.z <= z.appearAfterZ) {
      z.root.visible = false;
      const holdAhead = z.mini ? 22 : 25;
      z.root.position.z = Math.max(z.z, state.z + holdAhead);
      z.z = z.root.position.z;
      z.root.position.y = z.groundY ?? 0;
      continue;
    }
    if (z.appearAfterZ > -Infinity && !z.root.visible && !z.dead) {
      z.root.visible = true;
      if (z.mini) {
        // Mid gun-range: ~18–26 ahead, hard cap ~28 — one clear dragon, not a speck.
        const desired = Math.max(state.z + 18, Math.min(z.eventZ || (state.z + 22), state.z + 26));
        z.z = Math.min(desired, state.z + 28);
      } else {
        // Finale: park ≥25m ahead so it reads within first ~15s (not fogged at 120m).
        z.z = Math.max(state.z + 25, Math.min(z.eventZ || (state.z + 25), state.z + 55));
      }
      z.groundY = placeOnGround(z.root, z.x, z.z);
    }

    // Lazy-activate readable wave when event is within 14m; place pack at z+8.5 for 1.6s.
    if (z.readable && !z.showcased) {
      const eventDist = (z.eventZ || z.z) - state.z;
      if (!z.spawnedVisible && eventDist < 14) {
        z.spawnedVisible = true;
        z.showcaseActive = true;
        z.showcaseT = 0;
        z.z = state.z + 8.5;
        z.root.visible = true;
        z.root.rotation.y = Math.PI; // face camera / player
        // Showcase packs sit ahead of Sam — disable castShadow so they don't paint
        // a near-camera black slab on the road under the player's feet.
        z.root.traverse(o => {
          if (o.isMesh) {
            o.userData._castShadowBeforeShowcase = o.castShadow;
            o.castShadow = false;
          }
        });
        if (!z.showcaseScaled) {
          // Nudge toward ~2.2m readable height if still small.
          z.root.scale.multiplyScalar(1.12);
          z.showcaseScaled = true;
        }
        z.groundY = placeOnGround(z.root, z.x, z.z);
        playAnim(z.actions, ['Idle', 'Walk']);
      }
      if (z.showcaseActive) {
        z.showcaseT = (z.showcaseT || 0) + dt;
        z.z = state.z + 8.5; // freeze in readable band ≥1.6s
        z.root.visible = true;
        z.root.rotation.y = Math.PI;
        if (z.showcaseT >= 1.6) {
          z.showcased = true;
          z.showcaseActive = false;
          z.root.traverse(o => {
            if (o.isMesh && '_castShadowBeforeShowcase' in o.userData) {
              o.castShadow = o.userData._castShadowBeforeShowcase;
              delete o.userData._castShadowBeforeShowcase;
            }
          });
          playAnim(z.actions, ['Walk', 'Run', 'Idle']);
        }
      } else if (z.spawnedVisible) {
        z.root.visible = true;
        z.z -= z.approachSpeed * dt;
      }
      // else: still waiting for activation — keep parked at event z, hidden
    } else {
      z.z -= z.approachSpeed * dt;
    }

    z.root.position.z = z.z;
    z.root.position.x += (z.x - z.root.position.x) * dt * 2;
    // Reassert grounding every frame after z updates (anim must not bury/float).
    z.root.position.y = z.groundY ?? 0;
    z.hitCooldown = Math.max(0, z.hitCooldown - dt);

    if (z.isBoss) {
      z.attackAcc += dt;
      if (z.attackAcc > 2.4 && Math.abs(z.z - state.z) < 14) {
        z.attackAcc = 0;
        playAnim(z.actions, ['Punch', 'Headbutt', 'Weapon']);
        setTimeout(() => {
          if (!z.dead) playAnim(z.actions, ['Flying_Idle', 'Idle', 'Walk']);
        }, 600);
        // Boss breath / swipe chip when close (respects player i-frames)
        if (bossIFrames <= 0 && Math.abs(z.z - state.z) < 4.5) {
          const loss = z.mini ? 1 : 3;
          state.people = Math.max(0, state.people - loss);
          bossIFrames = z.mini ? 1.0 : 0.8;
          z.hitCooldown = bossIFrames;
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
    const canHit = z.isBoss
      ? (bossIFrames <= 0 && z.hitCooldown <= 0)
      : true;
    if (canHit && Math.abs(z.z - state.z) < hitR && Math.abs(z.root.position.x - playerX) < hitX) {
      const before = state.people;
      state.people = collideCost(state.people, z.hp, { boss: !!z.isBoss, mini: !!z.mini });
      const lost = Math.max(0, before - state.people);
      shake = Math.max(shake, z.isBoss ? 0.85 : 0.55);
      spawnFloat(`-${lost || 1}`, z.root.position.clone().setY(2), '#ff6b8a');
      if (!z.isBoss) {
        z.dead = true;
        z.root.visible = false;
      } else {
        // Boss contact: knock back, short i-frames so multi-tick cannot wipe
        z.z += 2.2;
        bossIFrames = z.mini ? 1.0 : 0.85;
        z.hitCooldown = bossIFrames;
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

  // Soft-pause autofire while any readable pack is mid-showcase (invulnerable + hush).
  let showcaseHold = false;
  for (const z of zombies) {
    if (z.dead || !z.readable) continue;
    if (z.showcaseActive && !z.showcased) showcaseHold = true;
    if (!z.showcased && z.spawnedVisible) showcaseHold = true;
    const ed = (z.eventZ || z.z) - state.z;
    if (!z.spawnedVisible && ed < 16 && ed > 0) showcaseHold = true;
  }
  const fs = fireStats(state.people, state.firepower);
  if (!showcaseHold) {
    fireAcc += dt;
    if (fireAcc >= fs.interval) tryFire();
  } else {
    fireAcc = Math.min(fireAcc, fs.interval * 0.5);
  }

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
        // No spawnFloat here — HTML gate labels already update; floats looked like stacked pairs.
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const z of zombies) {
        if (z.dead) continue;
        // Keep debut waves alive/readable until showcase completes.
        if (z.readable && !z.showcased) continue;
        const zr = z.isBoss ? 1.1 : 0.7;
        const xr = z.isBoss ? 1.0 : 0.55;
        if (Math.abs(b.mesh.position.z - z.z) < zr && Math.abs(b.mesh.position.x - z.root.position.x) < xr) {
          const dmg = damageZombie(z, b.damage);
          Object.assign(z, dmg);
          spawnFloat(`-${b.damage}`, z.root.position.clone().setY(1.8), '#d7ffe0');
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
      spawnFloat(msg, g.visual.position.clone().setY(2.4), '#fff', { gate: true });
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
  const z0 = state ? state.z : 0;
  // Raise/pull cam so lower FOV has less ground fill; look at torso.
  const camX = playerX * 0.08 + (Math.random() - 0.5) * shake * 0.25;
  const camY = 3.0 + (Math.random() - 0.5) * shake * 0.12;
  const camZ = z0 - 7.2;
  camera.position.set(camX, camY, camZ);
  camera.lookAt(playerX, 1.35, z0 + 0.5);
  camera.updateMatrixWorld();

  // Sun follows the runner so shadows don't stretch toward the camera from packs ahead.
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

  // Hide road/prop chunks that have fully passed behind the camera.
  for (const child of roadGroup.children) {
    if (child.name === 'asphaltUnderlay') {
      child.visible = true;
      continue;
    }
    child.updateWorldMatrix(true, false);
    const bbox = new THREE.Box3().setFromObject(child);
    child.visible = !(bbox.max.z < camZ - 2);
  }

  // Re-ground Sam each frame so animation/sync never zeros Y.
  for (const s of squad) {
    if (s.root) s.root.position.y = s.groundY ?? 0;
  }

  hideNearCameraOccluders();
  syncBossHpBarVisibility();

  updateFloats(dt);
  updateGateLabels();
  if (DEBUG) updateDebugOverlay(camX, camY, camZ);

  city.position.z = (state ? state.z * 0.35 : 0);
  composer.render();
  requestAnimationFrame(render);
}

function updateDebugOverlay(camX, camY, camZ) {
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
  window.__grDbg = {
    cam: { x: camX, y: camY, z: camZ },
    enemies: zombies.filter(z => !z.dead).map(z => {
      z.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(z.root);
      const size = new THREE.Vector3();
      box.getSize(size);
      return {
        kind: z.kind, isBoss: !!z.isBoss, z: +z.z.toFixed(2), gy: z.groundY,
        scale: +z.root.scale.x.toFixed(3), minY: +box.min.y.toFixed(3),
        size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)]
      };
    }),
    squad: squad.map(s => ({ scale: +s.root.scale.x.toFixed(3), y: +s.root.position.y.toFixed(3), gy: s.groundY }))
  };
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
