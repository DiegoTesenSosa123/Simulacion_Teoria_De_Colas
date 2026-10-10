import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SPACING = 24;
const MAX_QUEUE_VISUALS = 30; // Límite para object pooling
let scene, camera, renderer, controls, container, floor, grid, sun, ambient, engineRef = null;
const qLabels = { pref: null, gen: [] };

const groups = {
    servers: new THREE.Group(),
    qPref: new THREE.Group(),
    qGen: new THREE.Group(),
    deco: new THREE.Group()
};

/* ------------------------------------------------------------------
   Paleta de la escena. Es la misma que los tokens de css/ui.css:
   general = azul, preferencial = violeta, y el resto es neutro.
   ------------------------------------------------------------------ */
const PALETTE = {
    dark: {
        bg: 0x0b0f17, floor: 0x0f1521, gridMain: 0x1f2937, gridSub: 0x151c2a, gridOpacity: 0.55,
        ambient: 0.55, sun: 1.3, lane: 0.07,
        genBox: 0x3b82f6, genBusy: 0x2563eb, genGlow: 0x1e3a8a,
        vipBox: 0x8b5cf6, vipBusy: 0x7c3aed, vipGlow: 0x4c1d95,
        personGen: 0x93c5fd, personVip: 0xc4b5fd,
        label: { bg: 'rgba(14,17,23,.9)', border: 'rgba(255,255,255,.18)', text: '#e2e8f0', gen: '#60a5fa', vip: '#a78bfa' }
    },
    light: {
        bg: 0xeef1f6, floor: 0xe4e9f1, gridMain: 0xcbd5e1, gridSub: 0xdbe2ec, gridOpacity: 0.8,
        ambient: 0.85, sun: 1.0, lane: 0.1,
        genBox: 0x60a5fa, genBusy: 0x2563eb, genGlow: 0x000000,
        vipBox: 0xa78bfa, vipBusy: 0x7c3aed, vipGlow: 0x000000,
        personGen: 0x3b82f6, personVip: 0x8b5cf6,
        label: { bg: 'rgba(255,255,255,.95)', border: '#cbd5e1', text: '#0f172a', gen: '#2563eb', vip: '#7c3aed' }
    }
};
const isDark = () => document.documentElement.classList.contains('dark');
const pal = () => (isDark() ? PALETTE.dark : PALETTE.light);

const mats = {
    vipBox: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 }),
    genBox: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 }),
    vipBusy: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 }),
    genBusy: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 }),
    personVip: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    personGen: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    floor: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    laneVip: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    laneGen: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
};

const geoPerson = new THREE.CapsuleGeometry(1.2, 2.5, 4, 8);
const geoBox = new THREE.BoxGeometry(6, 5, 6);
const geoLane = new THREE.PlaneGeometry(6, 150);

/* Etiquetas: píldora plana con un punto del color del rol y texto neutro. */
const LW = 512, LH = 128;

function makeLabel(text, role) {
    const c = document.createElement('canvas');
    c.width = LW; c.height = LH;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.set(24, 6, 1);
    let cur = '';

    const draw = () => {
        const L = pal().label;
        const g = c.getContext('2d');
        g.clearRect(0, 0, LW, LH);
        g.beginPath();
        if (g.roundRect) g.roundRect(8, 20, LW - 16, 88, 20); else g.rect(8, 20, LW - 16, 88);
        g.fillStyle = L.bg; g.fill();
        g.lineWidth = 2; g.strokeStyle = L.border; g.stroke();
        g.fillStyle = L[role];
        g.beginPath(); g.arc(52, 64, 11, 0, Math.PI * 2); g.fill();
        g.fillStyle = L.text;
        g.font = '600 44px Inter, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(cur, 284, 66);
        tex.needsUpdate = true;
    };

    sprite.userData.set = (t) => { if (t === cur) return; cur = t; draw(); };
    sprite.userData.redraw = draw;
    sprite.userData.set(text);
    return sprite;
}

function redrawLabels() {
    groups.deco.children.forEach((o) => o.isSprite && o.userData.redraw?.());
}

function addQueueDeco(x, laneMat, role) {
    const lane = new THREE.Mesh(geoLane, laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(x, 0.15, 85);
    const lb = makeLabel('Cola', role);
    lb.position.set(x, 7, 5);
    groups.deco.add(lane, lb);
    return lb;
}

/* Aplica la paleta activa (claro/oscuro) a toda la escena. */
function applyPalette() {
    if (!scene) return;
    const p = pal();
    scene.background = new THREE.Color(p.bg);
    scene.fog.color.set(p.bg);
    mats.floor.color.set(p.floor);

    mats.genBox.color.set(p.genBox); mats.genBox.emissive.set(0x000000);
    mats.genBusy.color.set(p.genBusy); mats.genBusy.emissive.set(p.genGlow);
    mats.vipBox.color.set(p.vipBox); mats.vipBox.emissive.set(0x000000);
    mats.vipBusy.color.set(p.vipBusy); mats.vipBusy.emissive.set(p.vipGlow);
    mats.personGen.color.set(p.personGen);
    mats.personVip.color.set(p.personVip);

    mats.laneGen.color.set(p.genBox); mats.laneGen.opacity = p.lane;
    mats.laneVip.color.set(p.vipBox); mats.laneVip.opacity = p.lane;

    ambient.intensity = p.ambient;
    sun.intensity = p.sun;

    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    grid = new THREE.GridHelper(1000, 50, p.gridMain, p.gridSub);
    grid.position.y = 0.1;
    grid.material.transparent = true;
    grid.material.opacity = p.gridOpacity;
    scene.add(grid);

    redrawLabels();
}

// main.js lo llama al cambiar de tema
export function refreshTheme() { applyPalette(); }

function resize() {
    if (!renderer || !container) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

export function initScene() {
    if (renderer) { resize(); return true; }
    container = document.getElementById('canvas-container');
    if (!container) return false;

    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch (e) {
        container.textContent = 'WebGL no está disponible en este navegador o dispositivo.';
        container.classList.add('flex', 'items-center', 'justify-center', 'text-red-400', 'p-6', 'text-center');
        return false;
    }

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.0008);

    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
    camera.position.set(45, 65, 110);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 30;
    controls.maxDistance = 900;

    ambient = new THREE.AmbientLight(0xffffff, 0.5);
    sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 400 });
    scene.add(ambient, sun);

    floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    scene.add(groups.servers, groups.qPref, groups.qGen, groups.deco);
    applyPalette();
    document.fonts?.ready.then(redrawLabels);

    new ResizeObserver(resize).observe(container);
    resize();

    renderer.setAnimationLoop(() => {
        controls.update();
        if (engineRef) sync(engineRef);
        renderer.render(scene, camera);
    });
    return true;
}

// Pooling: Crea las instancias apagadas
function initializeQueuePool(container, material) {
    container.clear();
    for (let i = 0; i < MAX_QUEUE_VISUALS; i++) {
        const p = new THREE.Mesh(geoPerson, material);
        p.castShadow = true;
        p.position.set(0, 1.25, i * 4.8);
        p.visible = false;
        container.add(p);
    }
}

export function loadEngine(engine) {
    if (!renderer) return;
    const fit = !engineRef || engineRef.s !== engine.s;
    engineRef = engine;
    groups.deco.children.forEach((o) => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
    groups.deco.clear();
    qLabels.pref = null; qLabels.gen = [];
    groups.servers.clear(); groups.qPref.clear(); groups.qGen.clear();
    groups.qPref.position.set(0, 0, 10);

    const offsetX = ((engine.s - 1) * SPACING) / 2;
    const gen = [], vip = [];

    engine.servidores.forEach((srv, i) => {
        const x = i * SPACING - offsetX;
        const isVip = srv.type === 'PREF';

        const g = new THREE.Group();
        g.position.set(x, 2.5, -25);
        const mesh = new THREE.Mesh(geoBox, isVip ? mats.vipBox : mats.genBox);
        mesh.castShadow = true;
        const client = new THREE.Mesh(geoPerson, mats.personGen);
        client.position.set(0, 0, 7);
        client.castShadow = true;
        client.visible = false;

        g.userData = { mesh, client };
        g.add(mesh, client);
        groups.servers.add(g);
        (isVip ? vip : gen).push(x);
        const lb = makeLabel(isVip ? `VIP ${vip.length}` : `Caja ${gen.length}`, isVip ? 'vip' : 'gen');
        lb.position.set(x, 10, -25);
        groups.deco.add(lb);
    });

    if (vip.length) {
        const vx = vip.reduce((a, b) => a + b, 0) / vip.length;
        groups.qPref.position.set(vx, 0, 10);
        qLabels.pref = addQueueDeco(vx, mats.laneVip, 'vip');
        initializeQueuePool(groups.qPref, mats.personVip); // Setup Pool
    }

    const lanes = gen.length ? gen : vip;
    const start = lanes[0], end = lanes[lanes.length - 1];
    for (let i = 0; i < engine.m; i++) {
        const q = new THREE.Group();
        q.position.set(engine.m === 1 ? (start + end) / 2 : start + i * ((end - start) / (engine.m - 1)), 0, 10);
        groups.qGen.add(q);
        qLabels.gen.push(addQueueDeco(q.position.x, mats.laneGen, 'gen'));
        initializeQueuePool(q, mats.personGen); // Setup Pool
    }

    if (fit) setView(currentView);
}

function sync(engine) {
    engine.servidores.forEach((srv, i) => {
        const g = groups.servers.children[i];
        if (!g) return;
        const { mesh, client } = g.userData;
        const vip = srv.type === 'PREF';
        mesh.material = srv.busy ? (vip ? mats.vipBusy : mats.genBusy) : (vip ? mats.vipBox : mats.genBox);
        mesh.position.y = srv.busy ? -0.4 : 0;
        client.visible = srv.busy;
        if (srv.busy) client.material = srv.clientType === 'PREF' ? mats.personVip : mats.personGen;
    });

    updateQueueVis(groups.qPref, engine.qPref.length);
    qLabels.pref?.userData.set(`VIP · ${engine.qPref.length}`);
    qLabels.gen.forEach((lb, i) => lb.userData.set(`Cola ${i + 1} · ${engine.qGen[i]?.length ?? 0}`));

    engine.qGen.forEach((q, i) => {
        if (groups.qGen.children[i]) updateQueueVis(groups.qGen.children[i], q.length);
    });
}

// Pooling Updater: No instancia nuevos objetos, modifica el estado
function updateQueueVis(container, count) {
    const vis = Math.min(count, MAX_QUEUE_VISUALS);
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
        children[i].visible = (i < vis);
    }
}

const VIEWS = { front: [38, 0], top: [82, 0], iso: [35, 42] };
let currentView = 'front';

export function setView(name = currentView) {
    if (!camera || !engineRef || !VIEWS[name]) return;
    currentView = name;
    const [el, az] = VIEWS[name].map((d) => THREE.MathUtils.degToRad(d));
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
    const width = engineRef.s * SPACING + 50;
    const dist = Math.max((width / 2 / Math.tan(hfov / 2)) * 1.1, 130);
    controls.target.set(0, 0, 20);
    camera.position.set(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), 20 + dist * Math.cos(el) * Math.cos(az));
    controls.update();
}

export function cycleView() {
    const names = Object.keys(VIEWS);
    setView(names[(names.indexOf(currentView) + 1) % names.length]);
    return currentView;
}