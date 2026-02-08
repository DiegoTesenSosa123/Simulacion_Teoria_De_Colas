import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
const groupServers = new THREE.Group();
const groupQ_Pref = new THREE.Group();
const groupQ_Gen = new THREE.Group();

const mats = {
    box: new THREE.MeshStandardMaterial({ color: 0x10b981 }), 
    boxPref: new THREE.MeshStandardMaterial({ color: 0xd946ef }), 
    busy: new THREE.MeshStandardMaterial({ color: 0xef4444 }), 
    busyPref: new THREE.MeshStandardMaterial({ color: 0xbe185d }), 
    pref: new THREE.MeshStandardMaterial({ color: 0xd946ef }), 
    gen: new THREE.MeshStandardMaterial({ color: 0xf59e0b }), 
    ground: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
};

const geoPerson = new THREE.CapsuleGeometry(1.5, 3, 4, 8);
const geoBox = new THREE.BoxGeometry(6, 4, 4);

export function initScene() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    
    // Cámara un poco más alejada para acomodar filas anchas
    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 80, 130); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(30, 70, 40);
    light.castShadow = true;
    scene.add(light, new THREE.AmbientLight(0xffffff, 0.5));

    // PISO Y GRID
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), mats.ground);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(600, 60, 0x64748b, 0x334155);
    grid.position.y = 0.1;
    grid.name = "gridHelper";
    scene.add(grid);

    scene.add(groupServers, groupQ_Pref, groupQ_Gen);
    updateThemeColors(document.documentElement.classList.contains('dark'));
}

export function buildLayout(engine) {
    [groupServers, groupQ_Pref, groupQ_Gen].forEach(g => g.clear());
    
    // Aumenté un poco el espaciado base para que respiren mejor
    const serverSpacing = 22; 
    const queueSpacing = 16;  
    
    const totalS = engine.s;
    const totalM = engine.m;
    
    const startServerX = -((totalS - 1) * serverSpacing) / 2;
    const serverPositions = [];

    // 1. CONSTRUIR SERVIDORES (CAJAS)
    engine.servidores.forEach((srv, i) => {
        const x = startServerX + (i * serverSpacing);
        serverPositions.push(x);

        const g = new THREE.Group();
        g.position.set(x, 2, -15);
        
        const mesh = new THREE.Mesh(geoBox, srv.type === 'PREF' ? mats.boxPref : mats.box);
        mesh.castShadow = true;
        
        const clientMesh = new THREE.Mesh(geoPerson, mats.gen);
        clientMesh.position.set(0, 3, 6);
        clientMesh.visible = false;
        
        g.add(mesh, clientMesh);
        groupServers.add(g);
    });

    const genServersX = serverPositions.filter((_, i) => engine.servidores[i].type === 'GEN');
    const prefServersX = serverPositions.filter((_, i) => engine.servidores[i].type === 'PREF');

    // Variable para rastrear dónde termina la última cola naranja
    let rightMostGenQueueX = -99999;

    // 2. COLOCAR COLAS GENERALES
    if (totalM > 0) {
        let centerGenX = 0;
        if (genServersX.length > 0) {
            const min = genServersX[0];
            const max = genServersX[genServersX.length - 1];
            centerGenX = (min + max) / 2;
        } else {
            // Si solo hay servidores PREF (raro) o s=0, centramos en 0 o izquierda
            centerGenX = serverPositions.length > 0 ? serverPositions[0] - 20 : 0;
        }

        const totalQueueWidth = (totalM - 1) * queueSpacing;
        const startQueueX = centerGenX - (totalQueueWidth / 2);

        for (let i = 0; i < totalM; i++) {
            const qG = new THREE.Group();
            const posX = startQueueX + (i * queueSpacing);
            
            qG.position.set(posX, 0, 15);
            groupQ_Gen.add(qG);
            
            // Guardamos la posición de la cola más a la derecha
            if (posX > rightMostGenQueueX) {
                rightMostGenQueueX = posX;
            }
        }
    }

    // 3. COLOCAR COLA PREFERENCIAL (Con lógica Anti-Choque)
    let prefQX = 0;
    
    if (prefServersX.length > 0) {
        // Posición ideal: Centrada en sus cajas
        prefQX = prefServersX.reduce((a, b) => a + b, 0) / prefServersX.length;
    } else {
        // Fallback: A la derecha de la última caja
        const lastBoxX = serverPositions[serverPositions.length - 1] || 0;
        prefQX = lastBoxX + 20;
    }

    // --- CORRECCIÓN DE CHOQUE ---
    // Si la posición ideal de la cola VIP (prefQX) está muy cerca 
    // o a la izquierda de la última cola general... EMPUJAR.
    const safetyMargin = 18; // Distancia mínima segura
    if (totalM > 0 && prefQX < (rightMostGenQueueX + safetyMargin)) {
        prefQX = rightMostGenQueueX + safetyMargin;
    }

    groupQ_Pref.position.set(prefQX, 0, 15);
}

export function update3D(engine) {
    engine.servidores.forEach((srv, i) => {
        const g = groupServers.children[i];
        if(!g) return;
        const [box, client] = g.children;
        
        if (srv.busy) {
            box.material = srv.type === 'PREF' ? mats.busyPref : mats.busy;
            client.visible = true;
            client.material = srv.clientType === 'PREF' ? mats.pref : mats.gen;
            client.position.y = 3 + Math.sin(Date.now() * 0.008) * 0.3;
        } else {
            box.material = srv.type === 'PREF' ? mats.boxPref : mats.box;
            client.visible = false;
        }
    });

    updateQueueVisuals(groupQ_Pref, engine.qPref.length, mats.pref);
    engine.qGen.forEach((q, i) => {
        if (groupQ_Gen.children[i]) {
            updateQueueVisuals(groupQ_Gen.children[i], q.length, mats.gen);
        }
    });
}

function updateQueueVisuals(group, count, material) {
    const maxVisible = 15;
    const current = Math.min(count, maxVisible);
    
    while(group.children.length < current) {
        const m = new THREE.Mesh(geoPerson, material);
        m.castShadow = true;
        group.add(m);
    }
    while(group.children.length > current) group.remove(group.children[group.children.length - 1]);
    
    group.children.forEach((m, i) => {
        // Separación vertical en la fila (Z)
        m.position.set(0, 2.5, i * 6); 
    });
}

export function updateThemeColors(isDark) {
    if(!scene) return;
    scene.background = new THREE.Color(isDark ? 0x0f172a : 0xf1f5f9);
    mats.ground.color.setHex(isDark ? 0x1e293b : 0xe2e8f0);
    
    const grid = scene.getObjectByName("gridHelper");
    if(grid) grid.material.color.setHex(isDark ? 0x334155 : 0xcbd5e1);
}

export function renderLoop() {
    if(renderer) renderer.render(scene, camera);
}