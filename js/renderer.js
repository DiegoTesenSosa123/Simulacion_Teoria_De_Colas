import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
const groups = { 
    servers: new THREE.Group(), 
    qPref: new THREE.Group(), 
    qGen: new THREE.Group() 
};

// Materiales
const mats = {
    vipBox: new THREE.MeshStandardMaterial({ color: 0xd946ef, roughness: 0.2 }), 
    genBox: new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.2 }),
    vipBusy: new THREE.MeshStandardMaterial({ color: 0xbe185d, emissive: 0x500724 }), 
    genBusy: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, emissive: 0x172554 }), 
    
    personVip: new THREE.MeshStandardMaterial({ color: 0xf0abfc }), 
    personGen: new THREE.MeshStandardMaterial({ color: 0x93c5fd }), 
    
    floor: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 }),
    // vipFloor eliminado ya que no se usa
};

const geoPerson = new THREE.CapsuleGeometry(1.2, 2.5, 4, 8);
const geoBox = new THREE.BoxGeometry(6, 5, 6);

export function initScene() {
    const container = document.getElementById('canvas-container');
    if(!container) return;
    while(container.firstChild) container.removeChild(container.firstChild);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.0035);

    camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(45, 65, 110); 

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(50, 100, 50);
    sun.castShadow = true;
    scene.add(new THREE.AmbientLight(0xffffff, 0.5), sun);

    // --- PISO TÉCNICO ---
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(1000, 50, 0x334155, 0x1e293b);
    gridHelper.position.y = 0.1; 
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    scene.add(gridHelper);

    scene.add(groups.servers, groups.qPref, groups.qGen);
}

export function buildLayout(engine) {
    groups.servers.clear(); groups.qPref.clear(); groups.qGen.clear();
    const SPACING = 24;
    const offsetX = ((engine.s - 1) * SPACING) / 2;
    const genPos = []; const vipPos = [];

    engine.servidores.forEach((srv, i) => {
        const x = (i * SPACING) - offsetX;
        const g = new THREE.Group();
        g.position.set(x, 2.5, -25);
        
        const isVip = srv.type === 'PREF';
        
        const mesh = new THREE.Mesh(geoBox, isVip ? mats.vipBox : mats.genBox);
        mesh.name = "serverBox"; 
        mesh.castShadow = true;
        
        const client = new THREE.Mesh(geoPerson, mats.personGen);
        client.position.set(0, 0, 7);
        client.visible = false;
        client.name = "activeClient"; 
        
        // CAMBIO AQUI: Se eliminó el bloque que añadía la "carpet" morada
        if(isVip) {
            vipPos.push(x);
        } else { 
            genPos.push(x); 
        }

        g.add(mesh, client);
        groups.servers.add(g);
    });

    if (vipPos.length > 0) groups.qPref.position.set(vipPos.reduce((a,b)=>a+b,0)/vipPos.length, 0, 10);
    
    if (engine.m > 0 && genPos.length > 0) {
        const start = genPos[0], end = genPos[genPos.length-1];
        for(let i=0; i<engine.m; i++) {
            const qC = new THREE.Group();
            qC.position.set(engine.m === 1 ? (start+end)/2 : start + (i * ((end-start)/(engine.m-1))), 0, 10);
            groups.qGen.add(qC);
        }
    }
}

export function update3D(engine) {
    if(controls) controls.update();
    engine.servidores.forEach((srv, i) => {
        const g = groups.servers.children[i];
        if(!g) return;
        
        const mesh = g.getObjectByName("serverBox"); 
        const client = g.getObjectByName("activeClient");
        
        if (srv.busy) {
            mesh.material = srv.type === 'PREF' ? mats.vipBusy : mats.genBusy;
            mesh.position.y = -0.4;
            client.visible = true;
            // El color del cliente depende de SU tipo, no de la caja
            client.material = srv.clientType === 'PREF' ? mats.personVip : mats.personGen;
        } else {
            mesh.material = srv.type === 'PREF' ? mats.vipBox : mats.genBox;
            mesh.position.y = 0;
            client.visible = false;
        }
    });

    updateQueueVisuals(groups.qPref, engine.qPref.length, mats.personVip);
    engine.qGen.forEach((q, i) => { 
        if(groups.qGen.children[i]) updateQueueVisuals(groups.qGen.children[i], q.length, mats.personGen); 
    });
}

function updateQueueVisuals(container, count, material) {
    const vis = Math.min(count, 30);
    while(container.children.length < vis) { 
        const p = new THREE.Mesh(geoPerson, material); 
        p.castShadow = true; 
        container.add(p); 
    }
    while(container.children.length > vis) { 
        container.remove(container.children[container.children.length - 1]); 
    }
    container.children.forEach((m, idx) => m.position.set(0, 1.25, idx * 4.8));
}

export function renderLoop() { if(renderer && scene && camera) renderer.render(scene, camera); }