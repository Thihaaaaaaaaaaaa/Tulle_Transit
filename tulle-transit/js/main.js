import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- setup ----------
const qs = new URLSearchParams(location.search);
const DEBUG_P = qs.has('p') ? parseFloat(qs.get('p')) : null;          // ?p=0.5 freezes the camera at a point on the ride
const isMobile = matchMedia('(max-width: 760px)').matches || /Mobi|Android/i.test(navigator.userAgent);
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color('#0d1615');
scene.background = FOG.clone();
scene.fog = new THREE.FogExp2(FOG, 0.075);

const camera = new THREE.PerspectiveCamera(isMobile ? 62 : 48, innerWidth / innerHeight, 0.01, 60);

// ---------- figure placement (station units: floor y=-0.44, ceiling y≈0.76) ----------
const FIG = new THREE.Vector3(0.38, -0.44, -1.0);
const FIG_H = 0.62;                                   // standing height in station units
const HEAD = new THREE.Vector3(FIG.x, FIG.y + FIG_H * 0.93, FIG.z);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight('#9fc4c6', '#1a1214', 0.55));
const key = new THREE.SpotLight('#ffe8f1', 9, 3.2, 0.62, 0.85, 1.4);
key.position.set(FIG.x + 0.15, 0.72, FIG.z + 0.45);
key.target.position.copy(FIG).add(new THREE.Vector3(0, 0.3, 0));
key.castShadow = !isMobile; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.radius = 4;
scene.add(key, key.target);
const rim = new THREE.PointLight('#b49bff', 2.2, 2.2, 1.6); rim.position.set(FIG.x - 0.25, 0.15, FIG.z - 0.6); scene.add(rim);
const fill = new THREE.PointLight('#7fd3e0', 0.9, 3, 1.5); fill.position.set(FIG.x + 0.5, -0.1, FIG.z + 0.9); scene.add(fill);
const tunnelLight = new THREE.PointLight('#fff1dc', 0, 9, 1.4); tunnelLight.position.set(1.85, -0.25, -8.5); scene.add(tunnelLight);

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- loading ----------
const manager = new THREE.LoadingManager();
const bar = document.getElementById('loader-bar'), pct = document.getElementById('loader-pct');
manager.onProgress = (_u, l, t) => { const v = Math.round((l / t) * 100); bar.style.width = v + '%'; pct.textContent = v + '%'; };
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);

const fileProgress = {};
function load(url) {
  return new Promise((res, rej) => loader.load(url, res, e => {
    if (e.total) { fileProgress[url] = e.loaded / e.total; const vals = Object.values(fileProgress); const v = Math.round(vals.reduce((a, b) => a + b, 0) / 2 * 100); bar.style.width = v + '%'; pct.textContent = Math.min(v, 99) + '%'; }
  }, rej));
}

const [station, figure] = await Promise.all([load('models/station.glb'), load('models/figure.glb')]);

// station: make the bright ceiling strips glow, receive her shadow
station.scene.traverse(o => {
  if (!o.isMesh) return;
  o.receiveShadow = true;
  const m = o.material;
  if (m && !m.map && m.color) {
    const c = m.color; const lum = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
    if (lum > 0.85) { m.emissive = c.clone(); m.emissiveIntensity = 0.9; }
  }
  if (m) { m.envMapIntensity = 0.4; }
});
scene.add(station.scene);

// figure: painted vertex colours + tulle sheen
const fig = figure.scene;
const bb = new THREE.Box3().setFromObject(fig); const h = bb.max.y - bb.min.y;
fig.scale.setScalar(FIG_H / h);
fig.position.copy(FIG);
fig.rotation.y = 0.42;
fig.traverse(o => {
  if (!o.isMesh) return;
  o.castShadow = true; o.receiveShadow = true;
  o.material = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide,
    sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#e6dcef'),
    emissive: new THREE.Color('#2a1f33'), emissiveIntensity: 0.12,
  });
});
scene.add(fig);

// soft halo behind her
function radialTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const haloTex = radialTexture([[0, 'rgba(230,205,255,0.55)'], [0.35, 'rgba(200,170,255,0.18)'], [1, 'rgba(0,0,0,0)']]);
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
halo.scale.set(1.3, 1.3, 1); halo.position.copy(FIG).add(new THREE.Vector3(-0.05, 0.38, -0.25)); scene.add(halo);

// tunnel headlights (grow at departure)
const headTex = radialTexture([[0, 'rgba(255,250,235,1)'], [0.2, 'rgba(255,230,200,0.5)'], [1, 'rgba(0,0,0,0)']]);
const heads = [];
for (const dx of [-0.16, 0.16]) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
  s.position.set(1.85 + dx, -0.3, -9.2); s.scale.set(0.5, 0.5, 1); scene.add(s); heads.push(s);
}

// ---------- 3D typography planes (true depth parallax) ----------
await document.fonts.ready;
function textPlane(text, { font = 'italic 300 220px "Cormorant Garamond"', color = 'rgba(243,220,230,1)', stroke = false, w = 2048, hgt = 400, width = 2 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt; const g = c.getContext('2d');
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (stroke) { g.strokeStyle = color; g.lineWidth = 2.5; g.strokeText(text, w / 2, hgt / 2); } else { g.fillStyle = color; g.fillText(text, w / 2, hgt / 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * hgt / w), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.7, blending: THREE.AdditiveBlending, fog: true }));
  scene.add(m); return m;
}
const words = [
  Object.assign(textPlane('tulle', { width: 3.2 }), { base: new THREE.Vector3(1.95, 0.05, -3.4), ry: -Math.PI / 2, amp: 0.03 }),
  Object.assign(textPlane('transit', { stroke: true, color: 'rgba(211,193,236,1)', width: 3.4 }), { base: new THREE.Vector3(-1.6, 0.1, -5.2), ry: Math.PI / 2, amp: 0.03 }),
  Object.assign(textPlane('PLATFORM B · 23:58', { font: '300 120px "JetBrains Mono"', color: 'rgba(255,181,71,1)', width: 1.2 }), { base: new THREE.Vector3(0.2, 0.55, -6.8), ry: 0, amp: 0.01 }),
  Object.assign(textPlane('she stays', { color: 'rgba(255,240,230,1)', width: 1.5 }), { base: new THREE.Vector3(1.85, 0.2, -7.6), ry: 0, amp: 0.02 }),
];
words.forEach(w => { w.position.copy(w.base); w.rotation.y = w.ry; });
words[3].material.opacity = 0;

// ---------- petals ----------
function petalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 64, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#e8d8f0');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 4); g.bezierCurveTo(60, 14, 58, 50, 32, 60); g.bezierCurveTo(6, 50, 4, 14, 32, 4); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const PETALS = isMobile ? 220 : 520;
const petalGeo = new THREE.PlaneGeometry(0.022, 0.028, 1, 2);
{ const p = petalGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.abs(p.getX(i)) * 0.4); }
const petalMat = new THREE.MeshBasicMaterial({ map: petalTexture(), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, depthWrite: false });
const petals = new THREE.InstancedMesh(petalGeo, petalMat, PETALS);
const palette = ['#f3dce6', '#e8c8da', '#d3c1ec', '#f6eff6', '#e4b8cf'].map(c => new THREE.Color(c));
const pd = [];
for (let i = 0; i < PETALS; i++) {
  pd.push({ x: THREE.MathUtils.randFloat(-1.6, 1.4), y: THREE.MathUtils.randFloat(-0.44, 0.7), z: THREE.MathUtils.randFloat(-8, 6),
    sp: THREE.MathUtils.randFloat(0.15, 0.45), ph: Math.random() * 6.28, rx: Math.random() * 6.28, ry: Math.random() * 6.28, spin: THREE.MathUtils.randFloat(0.5, 2) });
  petals.setColorAt(i, palette[i % palette.length]);
}
scene.add(petals);

// ---------- dust ----------
const DUST = isMobile ? 600 : 1600;
const dg = new THREE.BufferGeometry(); const dp = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) { dp[i * 3] = THREE.MathUtils.randFloat(-1.9, 2.6); dp[i * 3 + 1] = THREE.MathUtils.randFloat(-0.44, 0.75); dp[i * 3 + 2] = THREE.MathUtils.randFloat(-9, 7); }
dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.006, color: '#e9dcff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(dust);

// ---------- camera ride ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const H = HEAD;
const keys = [
  { p: V(0.85, 0.02, 6.2),  t: V(0.4, -0.12, -3.5), fov: 0 },   // 0 arrival — far down the platform
  { p: V(0.62, -0.06, 2.4), t: V(0.38, -0.18, -1.0), fov: 0 },  // 1 platform
  { p: V(-0.42, -0.08, 0.0), t: V(0.38, -0.16, -1.05), fov: 0 },// 2 her (three-quarter from the pillar side)
  { p: V(0.6, 0.12, -0.3), t: V(H.x, H.y - 0.1, H.z), fov: -8 }, // 3 portrait
  { p: V(0.9, -0.36, -2.15), t: V(0.32, -0.28, -1.0), fov: 4 },  // 4 train of tulle, low
  { p: V(0.4, 0.66, -0.75),  t: V(0.38, -0.44, -1.02), fov: 0 },// 5 above
  { p: V(0.15, -0.12, 0.9),  t: V(1.8, -0.25, -9.0), fov: 0 },  // 6 departure — turn to the tunnel
];
const posCurve = new THREE.CatmullRomCurve3(keys.map(k => k.p), false, 'centripetal', 0.5);
const tgtCurve = new THREE.CatmullRomCurve3(keys.map(k => k.t), false, 'centripetal', 0.5);
const baseFov = camera.fov;

// ---------- scroll + parallax DOM ----------
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let target = 0, prog = DEBUG_P ?? 0;
const sections = [...document.querySelectorAll('.panel')];
const links = [...document.querySelectorAll('.line-map a')];
const speedEls = [...document.querySelectorAll('[data-speed]')];
const tiltEls = [...document.querySelectorAll('[data-tilt]')];
const flash = document.querySelector('.flash');

// each camera keyframe lands exactly when its chapter is centred on screen
function readScroll() {
  if (DEBUG_P != null) { target = DEBUG_P; return; }
  const max = document.documentElement.scrollHeight - innerHeight;
  const stops = sections.map((s, i) => i === 0 ? 0 : i === sections.length - 1 ? max : s.offsetTop + s.offsetHeight / 2 - innerHeight / 2);
  const y = scrollY; let k = 0;
  while (k < stops.length - 2 && y > stops[k + 1]) k++;
  const f = THREE.MathUtils.clamp((y - stops[k]) / Math.max(1, stops[k + 1] - stops[k]), 0, 1);
  target = (k + f) / (keys.length - 1);
}
addEventListener('scroll', readScroll, { passive: true });
readScroll();
links.forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); const s = document.querySelector(a.getAttribute('href'));
  scrollTo({ top: s.offsetTop, behavior: reduced ? 'auto' : 'smooth' });
}));
document.querySelector('.restart').addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); });

let mx = 0, my = 0, smx = 0, smy = 0;
addEventListener('pointermove', e => { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1; });
addEventListener('deviceorientation', e => { if (e.gamma != null) { mx = THREE.MathUtils.clamp(e.gamma / 30, -1, 1); my = THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1); } });

const motionBtn = document.getElementById('motion-toggle');
function setReduced(v) { reduced = v; document.body.classList.toggle('reduced', v); motionBtn.textContent = 'MOTION: ' + (v ? 'CALM' : 'ON'); motionBtn.setAttribute('aria-pressed', v); }
motionBtn.addEventListener('click', () => setReduced(!reduced));
setReduced(reduced);

function updateDOM() {
  const vh = innerHeight;
  for (const el of speedEls) {
    const host = el.closest('.panel'); const r = host.getBoundingClientRect();
    const d = host.id === 's0' ? r.top : (r.top + r.height / 2 - vh / 2);
    const s = parseFloat(el.dataset.speed);
    const tx = el.dataset.tilt ? smx * parseFloat(el.dataset.tilt) : 0;
    el.style.transform = `translate3d(${tx}px, ${(-d * s * (reduced ? 0.3 : 1)).toFixed(1)}px, 0)`;
  }
  for (const el of tiltEls) if (!el.dataset.speed) el.style.transform = `translate3d(${smx * el.dataset.tilt}px,${smy * el.dataset.tilt * 0.5}px,0)`;
  // active chapter + per-section opacity fade
  let active = 0;
  sections.forEach((s, i) => {
    const r = s.getBoundingClientRect(); if (r.top < vh * 0.55) active = i;
    const c = (r.top + r.height / 2 - vh / 2) / vh; const o = THREE.MathUtils.clamp(1.25 - Math.abs(c) * 1.1, 0, 1);
    s.style.opacity = o.toFixed(3);
  });
  links.forEach((a, i) => a.classList.toggle('on', i === active));
}

// station clock
const clock = document.getElementById('clock');
const t0 = performance.now();
function tickClock(p) { const secs = Math.floor(58 * 60 + p * 59.9); const mm = Math.floor(secs / 60), ss = secs % 60; clock.textContent = `23:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }

// ---------- resize ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); readScroll();
});

// ---------- loop ----------
const clk = new THREE.Clock();
const dummy = new THREE.Object3D();
const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();
let frames = 0;
function frame() {
  const dt = Math.min(clk.getDelta(), 0.05); const time = clk.elapsedTime;
  prog += (target - prog) * (DEBUG_P != null ? 1 : 1 - Math.pow(0.0015, dt));
  smx += (mx - smx) * 0.05; smy += (my - smy) * 0.05;

  // camera along the ride
  const u = THREE.MathUtils.clamp(prog, 0, 1);
  const seg = u * (keys.length - 1); const i = Math.min(Math.floor(seg), keys.length - 2); const f = ease(seg - i);
  const uu = (i + f) / (keys.length - 1);
  posCurve.getPoint(uu, tmpP); tgtCurve.getPoint(uu, tmpT);
  const par = reduced ? 0.25 : 1;
  const breathe = reduced ? 0 : Math.sin(time * 0.6) * 0.006;
  camera.position.set(tmpP.x + smx * 0.07 * par, tmpP.y - smy * 0.04 * par + breathe, tmpP.z);
  camera.lookAt(tmpT.x + smx * 0.03 * par, tmpT.y - smy * 0.02 * par, tmpT.z);
  camera.fov = baseFov + THREE.MathUtils.lerp(keys[i].fov, keys[i + 1].fov, f); camera.updateProjectionMatrix();

  // mood: cold fluorescent -> lilac near her -> warm tunnel light at the end
  const near = Math.exp(-Math.pow((u - 0.5) / 0.22, 2));
  const dep = THREE.MathUtils.smoothstep(u, 0.8, 1);
  scene.fog.density = 0.075 + near * 0.02 - dep * 0.025;
  scene.fog.color.copy(FOG).lerp(new THREE.Color('#1a1424'), near * 0.8).lerp(new THREE.Color('#2a2420'), dep * 0.7);
  scene.background.copy(scene.fog.color);
  key.intensity = 3.2 + near * 1.6; rim.intensity = 1.2 + near * 1.4;
  halo.material.opacity = 0.3 + near * 0.25 + Math.sin(time * 1.3) * 0.04;
  tunnelLight.intensity = dep * 6;
  heads.forEach((s, k) => { s.material.opacity = dep; const sc = 0.4 + dep * 1.6; s.scale.set(sc, sc, 1); s.position.z = -9.2 + dep * 1.2; });
  bloom.strength = 0.32 + dep * 0.55;
  flash.style.opacity = (dep * dep * 0.18).toFixed(3);
  words[3].material.opacity = dep * 0.9;

  // floating type drifts on its own axis (depth parallax comes from the moving camera)
  words.forEach((w, k) => { w.position.y = w.base.y + Math.sin(time * 0.5 + k) * w.amp; });

  // petals: wind along the platform, stronger when the train approaches
  const wind = (reduced ? 0.25 : 1) * (0.06 + dep * 0.9);
  for (let k = 0; k < PETALS; k++) {
    const p = pd[k];
    p.z += wind * p.sp * dt * 3; p.y -= p.sp * dt * 0.05 * (reduced ? 0.3 : 1); p.x += Math.sin(time * 0.7 + p.ph) * dt * 0.02;
    if (p.z > 6.5) p.z = -8; if (p.y < -0.43) p.y = 0.72;
    dummy.position.set(p.x, p.y + Math.sin(time * p.spin + p.ph) * 0.02, p.z);
    dummy.rotation.set(p.rx + time * p.spin * (reduced ? 0.2 : 1), p.ry + time * 0.6, Math.sin(time + p.ph));
    dummy.updateMatrix(); petals.setMatrixAt(k, dummy.matrix);
  }
  petals.instanceMatrix.needsUpdate = true;
  dust.rotation.y = Math.sin(time * 0.05) * 0.01; dust.position.y = Math.sin(time * 0.2) * 0.01;

  composer.render();
  updateDOM(); tickClock(u);
  if (++frames === 8) { document.getElementById('loader').classList.add('done'); window.__ready = true; }
  requestAnimationFrame(frame);
}
bar.style.width = '100%'; pct.textContent = '100%';
document.getElementById('loader-led').textContent = 'ARRIVED';
requestAnimationFrame(frame);
