import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const groupServers = new THREE.Group();
const groupQ_Pref = new THREE.Group();
const groupQ_Gen = new THREE.Group();

let matBox, matBoxPref, matBusy, matBusyPref, matPref, matGen, matGround;
const geoPerson = new THREE.CapsuleGeometry(1.5, 3, 4, 8);
const geoBox = new THREE.BoxGeometry(6, 4, 4);

let scene, camera, renderer;

export function init3D(containerId) {
    const container = document.getElementById(containerId);
    scene = new THREE.Scene();
    
    matBox = new THREE.MeshStandardMaterial({ color: 0x10b981 });
    matBoxPref = new THREE.MeshStandardMaterial({ color: 0xd946ef });
    matBusy = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    matBusyPref = new THREE.MeshStandardMaterial({ color: 0xbe185d }); // Fucsia Oscuro
    matPref = new THREE.MeshStandardMaterial({ color: 0xd946ef });
    matGen = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
    matGround = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    updateThemeColors(document.documentElement.classList.contains('dark'));

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 50, 80); camera.lookAt(0,0,0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(20, 50, 20); light.castShadow = true;
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), matGround);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);
    
    const grid = new THREE.GridHelper(300, 50, 0x334155, 0x1e293b);
    grid.name = "gridHelper";
    scene.add(grid);

    scene.add(groupServers); scene.add(groupQ_Pref); scene.add(groupQ_Gen);
    
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

export function updateThemeColors(isDark) {
    if(!scene) return;
    if (isDark) {
        scene.background = new THREE.Color(0x0f172a); 
        scene.fog = new THREE.Fog(0x0f172a, 200, 800);
        matGround.color.setHex(0x1e293b); 
        const grid = scene.getObjectByName("gridHelper");
        if(grid) grid.material.color.setHex(0x334155);
    } else {
        scene.background = new THREE.Color(0xf1f5f9); 
        scene.fog = new THREE.Fog(0xf1f5f9, 200, 800);
        matGround.color.setHex(0xe2e8f0); 
        const grid = scene.getObjectByName("gridHelper");
        if(grid) grid.material.color.setHex(0xcbd5e1); 
    }
}

export function buildLayout(engine) {
    groupServers.clear(); groupQ_Pref.clear(); groupQ_Gen.clear();
    const spacing = 16;
    const startX = -((engine.s - 1) * spacing) / 2;

    for(let i=0; i<engine.s; i++) {
        const g = new THREE.Group();
        g.position.set(startX + (i * spacing), 2, -10);
        
        const mat = engine.servidores[i].type === 'PREF' ? matBoxPref : matBox;
        const mesh = new THREE.Mesh(geoBox, mat);
        mesh.castShadow = true; g.add(mesh);
        
        const client = new THREE.Mesh(geoPerson, matGen);
        client.position.set(0, 3, 5); client.visible = false;
        g.add(client);
        groupServers.add(g);
    }

    groupQ_Pref.position.set(startX + ((engine.s - 1) * spacing) + 8, 0, 5);
    for(let i=0; i<engine.m; i++) {
        const g = new THREE.Group();
        const width = (engine.s * spacing) * 0.7;
        let x = startX;
        if(engine.m > 1) x = startX + (i * (width / (engine.m - 1)));
        g.position.set(x, 0, 5);
        groupQ_Gen.add(g);
    }
}

export function update3D(engine) {
    engine.servidores.forEach((srv, i) => {
        const g = groupServers.children[i];
        if(g) {
            const box = g.children[0];
            const p = g.children[1];
            if (srv.busy) {
                box.material = srv.type === 'PREF' ? matBusyPref : matBusy;
                p.visible = true;
                p.material = srv.clientType === 'PREF' ? matPref : matGen;
                p.position.y = 3 + Math.sin(Date.now() * 0.005) * 0.2;
            } else {
                box.material = srv.type === 'PREF' ? matBoxPref : matBox;
                p.visible = false;
            }
        }
    });
    updateQ(groupQ_Pref, engine.qPref.length, matPref);
    for(let i=0; i<engine.m; i++) {
        updateQ(groupQ_Gen.children[i], engine.qGen[i].length, matGen);
    }
}

export function renderScene() {
    if(renderer && scene && camera) renderer.render(scene, camera);
}

function updateQ(grp, count, mat) {
    const limit = 20; 
    const vis = Math.min(count, limit);
    while(grp.children.length < vis) {
        const m = new THREE.Mesh(geoPerson, mat);
        m.castShadow = true; grp.add(m);
    }
    while(grp.children.length > vis) grp.remove(grp.children[grp.children.length-1]);
    grp.children.forEach((m, i) => m.position.set(0, 2.5, i * 4.5));
}