import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  applyGate, shootGate, damageZombie, collideCost, fireStats,
  starRating, createLevelState, progress
} from './core.js';

const ASSET = {
  sam: 'assets/gltf/sam.glb',
  zombie: 'assets/gltf/zombie.glb',
  zombieHalf: 'assets/gltf/zombie-half.glb',
  bigArm: 'assets/gltf/big-arm.glb',
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
const banner = document.getElementById('banner');
const overlay = document.getElementById('overlay');
const settle = document.getElementById('settle');
const loading = document.getElementById('loading');
const loadMsg = document.getElementById('loadMsg');
const loadBar = document.getElementById('loadBar');

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

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 6.2, -8.5);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 0.85);
composer.addPass(bloom);

// Lights — bright enough for screen recording
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

async function loadLevel() {
  const res = await fetch('data/level1.json');
  level = await res.json();
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
  let mesh;
  if (key.includes('zombie') || key === 'bigArm') {
    mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x5aa85a, emissive: 0x143014, roughness: 0.35, roughness: 0.7 })
    );
  } else if (key === 'sam') {
    mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.95, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3d7dff, emissive: 0x102040, roughness: 0.4, roughness: 0.55 })
    );
  } else {
    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xb0b8c8, roughness: 0.5, roughness: 0.4 })
    );
  }
  mesh.castShadow = true;
  g.add(mesh);
  g.scale.setScalar(scale);
  return { root: g, mixer: null, actions: {}, gltf: null };
}

function playAnim(actions, name, fade = 0.2) {
  if (!actions) return;
  const act = actions[name] || actions[`CharacterArmature|${name}`];
  if (!act) return;
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

    // hazard edge strips
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

  // elevated slab under road for readability
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

function makeGateVisual(gate, side) {
  const group = new THREE.Group();
  const color = gate.op === 'mul' || gate.op === 'fireMul' ? 0xb56bff : (side < 0 ? 0xffd34d : 0x4da3ff);
  const emissive = gate.op === 'mul' ? 0x5a20a0 : (side < 0 ? 0xaa7700 : 0x1040aa);
  const w = 2.6 * (gate.widthScale || 1);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive, emissiveIntensity: 1.35,
    transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), mat);
  panel.position.y = 1.35;
  group.add(panel);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.15, 2.55, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.55, roughness: 0.4 })
  );
  frame.position.y = 1.35;
  group.add(frame);

  const canvas2 = document.createElement('canvas');
  canvas2.width = 256; canvas2.height = 256;
  const ctx = canvas2.getContext('2d');
  const drawLabel = () => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, 256, 256);
    ctx.font = 'bold 120px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    const label = gate.op === 'mul' || gate.op === 'fireMul' ? `×${gate.value}` : `+${gate.value}`;
    ctx.strokeText(label, 128, 128);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 128, 128);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(canvas2);
  tex.colorSpace = THREE.SRGBColorSpace;
  const labelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.85, w * 0.85),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  labelMesh.position.y = 1.35;
  labelMesh.position.z = 0.08;
  group.add(labelMesh);
  drawLabel();
  group.userData.redraw = (g) => {
    gate = g;
    drawLabel();
    panel.scale.x = (2.6 * (g.widthScale || 1)) / 2.6;
    frame.scale.x = panel.scale.x;
  };
  return group;
}

function spawnFromLevel() {
  gates.length = 0; zombies.length = 0;
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
      const kind = ev.kind === 'zombie-half' ? 'zombieHalf' : (ev.kind === 'big-arm' ? 'bigArm' : 'zombie');
      for (let i = 0; i < ev.count; i++) {
        const { root, mixer, actions } = cloneModel(kind, 1);
        fitProp(root, kind === 'bigArm' ? 2.1 : 1.7);
        const x = ((i / Math.max(1, ev.count - 1)) - 0.5) * ev.spread;
        root.position.set(x, 0, ev.z + (Math.random() - 0.5) * 1.2);
        root.rotation.y = Math.PI; // face player (coming from -z camera looking +z-ish)
        entityGroup.add(root);
        playAnim(actions, 'Walk') || playAnim(actions, 'Run') || playAnim(actions, 'Idle');
        zombies.push({
          root, mixer, actions,
          hp: ev.hp, maxHp: ev.hp, x, z: root.position.z,
          dead: false, hitCooldown: 0
        });
      }
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
  // Quaternius characters often face +Z; we run toward +Z, camera behind at -Z
  root.rotation.y = 0;
  world.add(root);
  playerRoot = root;
  playerMixer = mixer;
  playerActions = actions;
  playAnim(actions, 'Run_Gun') || playAnim(actions, 'Run') || playAnim(actions, 'Idle_Gun');
  squad.push({ root, mixer, actions });

  // rifle attach approx
  if (templates.rifle) {
    const { root: gun } = cloneModel('rifle', 1);
    fitProp(gun, 0.55);
    gun.position.set(0.25, 0.95, 0.35);
    gun.rotation.y = Math.PI;
    root.add(gun);
  }
}

function syncSquadCount() {
  // visual extras as ghost clones beside leader
  const want = Math.min(9, state.people);
  while (squad.length < want) {
    const { root, mixer, actions } = cloneModel('sam', 1);
    fitProp(root, 1.55);
    world.add(root);
    playAnim(actions, 'Run_Gun') || playAnim(actions, 'Run');
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

function resetRun() {
  mixers.length = 0;
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
  banner.textContent = '左右拖动 · 自动前进开火';
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
}

function endGame(won) {
  running = false;
  state.won = won;
  state.lost = !won;
  state.finished = true;
  const stars = starRating(state);
  document.getElementById('settleTitle').textContent = won ? '关卡结算' : '挑战失败';
  document.getElementById('settleResult').textContent = won ? '胜利！' : '再冲一次';
  document.getElementById('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars) + '（占位）';
  document.getElementById('settleScore').textContent = String(state.score);
  document.getElementById('settleKills').textContent = String(state.kills);
  document.getElementById('settlePeople').textContent = String(state.people);
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
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') targetX = Math.max(-level.roadHalfWidth + 0.4, targetX - 0.6);
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') targetX = Math.min(level.roadHalfWidth - 0.4, targetX + 0.6);
});

document.getElementById('btnStart').onclick = () => resetRun();
document.getElementById('btnRetry').onclick = () => resetRun();

function update(dt) {
  if (!running) return;
  state.z += level.runSpeed * dt;
  playerX += (targetX - playerX) * Math.min(1, dt * 12);

  // zombies walk toward player a bit
  for (const z of zombies) {
    if (z.dead) continue;
    z.z -= 1.6 * dt;
    z.root.position.z = z.z;
    z.root.position.x += (z.x - z.root.position.x) * dt * 2;
    z.hitCooldown = Math.max(0, z.hitCooldown - dt);
    // collision
    if (Math.abs(z.z - state.z) < 0.9 && Math.abs(z.root.position.x - playerX) < 0.85) {
      state.people = collideCost(state.people, z.hp);
      shake = Math.max(shake, 0.55);
      spawnFloat(`-${Math.max(1, Math.ceil(z.hp / 2))}`, z.root.position.clone().setY(2), '#ff6b8a');
      z.dead = true;
      z.root.visible = false;
      updateHud();
      syncSquadCount();
      if (state.people <= 0) {
        banner.textContent = '人数归零 · 被僵尸撞到';
        endGame(false);
        return;
      }
    }
  }

  // fire
  const fs = fireStats(state.people, state.firepower);
  fireAcc += dt;
  if (fireAcc >= fs.interval) tryFire();

  // bullets
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
        spawnFloat(g.op === 'mul' ? `×${g.value}` : `+${g.value}`, g.visual.position.clone().setY(2.2), '#ffe66d');
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const z of zombies) {
        if (z.dead) continue;
        if (Math.abs(b.mesh.position.z - z.z) < 0.7 && Math.abs(b.mesh.position.x - z.root.position.x) < 0.55) {
          const dmg = damageZombie(z, b.damage);
          Object.assign(z, dmg);
          spawnFloat(`-${b.damage}`, z.root.position.clone().setY(1.8), '#9cffb0');
          if (z.dead) {
            state.kills += 1;
            state.score += 20 + b.damage * 2;
            playAnim(z.actions, 'Death');
            setTimeout(() => { z.root.visible = false; }, 500);
          } else {
            playAnim(z.actions, 'HitReact');
            setTimeout(() => playAnim(z.actions, 'Walk') || playAnim(z.actions, 'Run'), 350);
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

  // pass gates
  for (const g of gates) {
    if (g.consumed) continue;
    if (g.op === 'finish') {
      if (state.z >= g.z) {
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
      const before = state.people;
      const next = applyGate(state.people, state.firepower, g);
      state.people = next.people;
      state.firepower = next.firepower;
      state.score += 50 + Math.max(0, state.people - before) * 5;
      shake = Math.max(shake, 0.35);
      spawnFloat(g.op === 'mul' ? `人数×${g.value}` : `人数+${g.value}`, g.visual.position.clone().setY(2.4), '#fff');
      g.visual.visible = false;
      // hide sibling if any still ahead? keep other side
      syncSquadCount();
      updateHud();
    } else if (state.z >= g.z + 1.2) {
      g.consumed = true;
      g.visual.visible = false;
    }
  }

  if (state.z >= level.length + 5 && !state.finished) {
    endGame(state.people > 0);
  }

  syncSquadCount();
  updateHud();
}

function render() {
  const dt = Math.min(0.033, clock.getDelta());
  mixers.forEach(m => m.update(dt));

  update(dt);
  updateFloats(dt);

  shake = Math.max(0, shake - dt * 1.8);
  const camX = playerX * 0.85 + (Math.random() - 0.5) * shake;
  const camY = 5.8 + (Math.random() - 0.5) * shake * 0.5;
  const camZ = state ? state.z - 9.2 : -9.2;
  camera.position.set(camX, camY, camZ);
  camera.lookAt(playerX * 0.4, 1.4, (state ? state.z : 0) + 10);

  city.position.z = (state ? state.z * 0.35 : 0);
  composer.render();
  requestAnimationFrame(render);
}

(async function boot() {
  try {
    setLoad(0.05, '读取关卡…');
    await loadLevel();
    setLoad(0.1, '加载 glTF…');
    await loadAssets();
    setLoad(1, '就绪');
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
