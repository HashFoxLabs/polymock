// @ts-nocheck — ported verbatim from legacy inline script; tighten types incrementally if needed.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function initGlobeBubbleScene(): void {

const container = document.getElementById('three-container');
const bubbleContainerEarly = document.getElementById('bubble-container');
if (!container || !bubbleContainerEarly) return;
const morphNameEl = document.getElementById('morph-name');
const morphCounterEl = document.getElementById('morph-counter');
const dots = document.querySelectorAll('.dot-nav');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 2.5;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// No background — particle layer is transparent so bubbles show through
renderer.setClearColor(0x000000, 0);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

// Use the canvas as the control domElement — `document.body` captures pointer events
// and breaks native interactions (e.g. FAQ <details>) elsewhere on the page.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.04;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.4;
controls.enableZoom = false;
controls.enablePan = false;

// Lights
const ambient = new THREE.AmbientLight(0xffeedd, 3);
scene.add(ambient);

const keyLight = new THREE.PointLight(0xc4a882, 15, 50);
keyLight.position.set(3, 3, 4);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x4a6fa5, 8, 50);
fillLight.position.set(-4, -2, 3);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x8b7355, 10, 50);
rimLight.position.set(0, 4, -3);
scene.add(rimLight);

const frontLight = new THREE.PointLight(0xffffff, 12, 40);
frontLight.position.set(0, 0, 6);
scene.add(frontLight);

const bottomLight = new THREE.PointLight(0xc4a882, 8, 40);
bottomLight.position.set(0, -3, 3);
scene.add(bottomLight);

// === SHAPE DEFINITIONS ===
const PARTICLE_COUNT = 25000;
const shapes = [];
const shapeColors = [];

// =====================================================
// === BUBBLE BACKGROUND SYSTEM ========================
// =====================================================
const bubbleContainer = bubbleContainerEarly;
const bRenderer = new THREE.WebGLRenderer({ antialias: true });
bRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
bRenderer.setSize(window.innerWidth, window.innerHeight);
bRenderer.toneMapping = THREE.ACESFilmicToneMapping;
bRenderer.toneMappingExposure = 1.3;
bRenderer.shadowMap.enabled = true;
bRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
bubbleContainer.appendChild(bRenderer.domElement);

const bScene = new THREE.Scene();
bScene.background = new THREE.Color(0x080808);
bScene.fog = new THREE.Fog(0x080808, 20, 45);

const bCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
bCamera.position.set(0, 0, 18);

// Bubble lights
bScene.add(new THREE.AmbientLight(0xffffff, 2.5));
const bKeyLight = new THREE.DirectionalLight(0xffffff, 2.2);
bKeyLight.position.set(5, 10, 8);
bKeyLight.castShadow = true;
bScene.add(bKeyLight);
const bFillLight = new THREE.PointLight(0xff6600, 1.0, 45);
bFillLight.position.set(-6, 3, 4);
bScene.add(bFillLight);
const bRimLight = new THREE.PointLight(0xffffff, 0.8, 40);
bRimLight.position.set(4, -4, -6);
bScene.add(bRimLight);

// Orange only
const bubblePalette = [
    { color: 0xff6600, roughness: 0.20, metalness: 0.15, emissive: 0x220800 }, // deep orange
    { color: 0xf97316, roughness: 0.22, metalness: 0.10, emissive: 0x1f0800 }, // brand orange
    { color: 0xff8800, roughness: 0.18, metalness: 0.12, emissive: 0x1a0a00 }, // amber orange
    { color: 0xffaa33, roughness: 0.20, metalness: 0.12, emissive: 0x150900 }, // golden orange
    { color: 0xff5500, roughness: 0.25, metalness: 0.08, emissive: 0x280500 }, // red-orange
    { color: 0xff7700, roughness: 0.16, metalness: 0.18, emissive: 0x1c0a00 }, // mid orange
    { color: 0xffa020, roughness: 0.22, metalness: 0.10, emissive: 0x180b00 }, // light orange
    { color: 0xff6a00, roughness: 0.20, metalness: 0.14, emissive: 0x200700 }, // vivid orange
];

// Build env map for bubble reflections
const pmrem = new THREE.PMREMGenerator(bRenderer);
const envSceneB = new THREE.Scene();
const eL1 = new THREE.PointLight(0xff6600, 90, 100); eL1.position.set(10,10,10); envSceneB.add(eL1);
const eL2 = new THREE.PointLight(0xffffff, 60, 100); eL2.position.set(-10,-5,-10); envSceneB.add(eL2);
const eL3 = new THREE.PointLight(0xff9900, 50, 100); eL3.position.set(0,10,-10); envSceneB.add(eL3);
const bEnvMap = pmrem.fromScene(envSceneB, 0, 0.1, 100).texture;
pmrem.dispose();

const bMaterials = bubblePalette.map(p => new THREE.MeshStandardMaterial({
    color: p.color, roughness: p.roughness, metalness: p.metalness,
    emissive: p.emissive ?? 0x000000, emissiveIntensity: 0.6,
    envMap: bEnvMap, envMapIntensity: 0.4,
}));

// Physics constants
const B_DAMPING = 0.96;
const B_SPRING  = 0.002;
const B_MOUSE_R = 4.5;
const B_MOUSE_F = 0.40;

const bSphereGroup = new THREE.Group();
bScene.add(bSphereGroup);
const bSpheres = [];

function bRandomInSphere(radius) {
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * Math.cbrt(Math.random());
    return { x: r*Math.sin(phi)*Math.cos(theta), y: r*Math.sin(phi)*Math.sin(theta)*0.65, z: r*Math.cos(phi)*0.7 };
}

for (let i = 0; i < 55; i++) {
    const radius = 0.4 + Math.random() * 0.9;
    const pos = bRandomInSphere(4.8);
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = bMaterials[i % bMaterials.length];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.castShadow = true;
    bSphereGroup.add(mesh);
    bSpheres.push({
        mesh, radius, mass: radius * radius,
        basePos: { ...pos },
        velocity: { x: 0, y: 0, z: 0 },
        phase: Math.random() * Math.PI * 2,
        floatSpeed: 0.3 + Math.random() * 0.4,
        floatAmp: 0.02 + Math.random() * 0.04,
    });
}

function bResolveCollisions() {
    for (let i = 0; i < bSpheres.length; i++) {
        for (let j = i + 1; j < bSpheres.length; j++) {
            const a = bSpheres[i], b = bSpheres[j];
            const dx = a.mesh.position.x - b.mesh.position.x;
            const dy = a.mesh.position.y - b.mesh.position.y;
            const dz = a.mesh.position.z - b.mesh.position.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            const minDist = (a.radius + b.radius) * 1.05;
            if (dist < minDist && dist > 0.001) {
                const overlap = (minDist - dist) * 0.5;
                const nx = dx/dist, ny = dy/dist, nz = dz/dist;
                a.mesh.position.x += nx*overlap; a.mesh.position.y += ny*overlap; a.mesh.position.z += nz*overlap;
                b.mesh.position.x -= nx*overlap; b.mesh.position.y -= ny*overlap; b.mesh.position.z -= nz*overlap;
                const tm = a.mass + b.mass;
                const rvx = a.velocity.x - b.velocity.x, rvy = a.velocity.y - b.velocity.y, rvz = a.velocity.z - b.velocity.z;
                const dot = rvx*nx + rvy*ny + rvz*nz;
                if (dot > 0) continue;
                const imp = -(1 + 0.6) * dot / tm;
                a.velocity.x += imp*b.mass*nx; a.velocity.y += imp*b.mass*ny; a.velocity.z += imp*b.mass*nz;
                b.velocity.x -= imp*a.mass*nx; b.velocity.y -= imp*a.mass*ny; b.velocity.z -= imp*a.mass*nz;
            }
        }
    }
}

// Initial collision settle
for (let p = 0; p < 20; p++) bResolveCollisions();
bSpheres.forEach(s => { s.basePos = { x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z }; });

// Shared mouse NDC (also used by particle system below)
const bMouseNDC = new THREE.Vector2();
const bInteractionPlane = new THREE.Plane(new THREE.Vector3(0,0,1), 0);
const bRaycaster = new THREE.Raycaster();
const bMouse3D = new THREE.Vector3();
let bMouseTarget = { x: 0, y: 0 };
let bMouseSmooth = { x: 0, y: 0 };

document.addEventListener('mousemove', e => {
    const howSec = document.getElementById('how-section');
    if (howSec && window.scrollY > howSec.offsetTop) return;
    bMouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    bMouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    bMouseTarget.x = (e.clientX / window.innerWidth - 0.5) * 2;
    bMouseTarget.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});

document.addEventListener('mousedown', () => {
    bRaycaster.setFromCamera(bMouseNDC, bCamera);
    const hit = new THREE.Vector3();
    bRaycaster.ray.intersectPlane(bInteractionPlane, hit);
    if (hit) {
        bSpheres.forEach(s => {
            const dx = s.mesh.position.x - hit.x, dy = s.mesh.position.y - hit.y, dz = s.mesh.position.z - hit.z;
            const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
            if (dist < 6 && dist > 0.01) {
                const f = (1 - dist/6) * 0.9;
                s.velocity.x += (dx/dist)*f; s.velocity.y += (dy/dist)*f; s.velocity.z += (dz/dist)*f;
            }
        });
    }
});

function bUpdatePhysics(t) {
    // Mouse repulsion
    bRaycaster.setFromCamera(bMouseNDC, bCamera);
    const hit = new THREE.Vector3();
    bRaycaster.ray.intersectPlane(bInteractionPlane, hit);
    if (hit) bMouse3D.copy(hit);
    bSpheres.forEach(s => {
        const dx = s.mesh.position.x - bMouse3D.x, dy = s.mesh.position.y - bMouse3D.y, dz = s.mesh.position.z - bMouse3D.z;
        const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if (dist < B_MOUSE_R && dist > 0.01) {
            const f = (1 - dist/B_MOUSE_R) * B_MOUSE_F;
            s.velocity.x += (dx/dist)*f; s.velocity.y += (dy/dist)*f; s.velocity.z += (dz/dist)*f;
        }
        // Spring back to base
        s.velocity.x += (s.basePos.x - s.mesh.position.x) * B_SPRING;
        s.velocity.y += (s.basePos.y - s.mesh.position.y) * B_SPRING;
        s.velocity.z += (s.basePos.z - s.mesh.position.z) * B_SPRING;
        // Damping + float
        s.velocity.x *= B_DAMPING; s.velocity.y *= B_DAMPING; s.velocity.z *= B_DAMPING;
        const fy = Math.sin(t * s.floatSpeed + s.phase) * s.floatAmp;
        const fx = Math.cos(t * s.floatSpeed * 0.7 + s.phase) * s.floatAmp * 0.5;
        s.mesh.position.x += s.velocity.x + fx * 0.05;
        s.mesh.position.y += s.velocity.y + fy * 0.05;
        s.mesh.position.z += s.velocity.z;
        // Bounds
        const mb = 8;
        s.mesh.position.x = Math.max(-mb, Math.min(mb, s.mesh.position.x));
        s.mesh.position.y = Math.max(-mb, Math.min(mb, s.mesh.position.y));
        s.mesh.position.z = Math.max(-mb, Math.min(mb, s.mesh.position.z));
    });
    for (let p = 0; p < 3; p++) bResolveCollisions();
    // Mouse tilt
    bMouseSmooth.x += (bMouseTarget.x - bMouseSmooth.x) * 0.05;
    bMouseSmooth.y += (bMouseTarget.y - bMouseSmooth.y) * 0.05;
    bSphereGroup.rotation.y += (bMouseSmooth.x * 0.25 - bSphereGroup.rotation.y) * 0.03;
    bSphereGroup.rotation.x += (bMouseSmooth.y * 0.12 - bSphereGroup.rotation.x) * 0.03;
    // Breathe
    const breathe = 1 + Math.sin(t * 0.4) * 0.008;
    bSphereGroup.scale.set(breathe, breathe, breathe);
    bFillLight.position.x = Math.sin(t * 0.3) * 6;
    bFillLight.position.y = Math.cos(t * 0.2) * 3;
}
// =====================================================
// === END BUBBLE SYSTEM ===============================
// =====================================================

// Helper: sample points on geometry surface
function sampleGeometry(geometry, count) {
    const pos = new Float32Array(count * 3);
    const posAttr = geometry.attributes.position;
    const indexAttr = geometry.index;
    
    // Get triangle data
    const triangles = [];
    const triCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const areas = [];
    let totalArea = 0;

    for (let i = 0; i < triCount; i++) {
        let a, b, c;
        if (indexAttr) {
            a = indexAttr.getX(i * 3);
            b = indexAttr.getX(i * 3 + 1);
            c = indexAttr.getX(i * 3 + 2);
        } else {
            a = i * 3; b = i * 3 + 1; c = i * 3 + 2;
        }
        vA.fromBufferAttribute(posAttr, a);
        vB.fromBufferAttribute(posAttr, b);
        vC.fromBufferAttribute(posAttr, c);
        const area = new THREE.Triangle(vA.clone(), vB.clone(), vC.clone()).getArea();
        areas.push(area);
        totalArea += area;
        triangles.push([vA.clone(), vB.clone(), vC.clone()]);
    }

    // Weighted random sampling
    for (let i = 0; i < count; i++) {
        let r = Math.random() * totalArea;
        let triIdx = 0;
        for (let j = 0; j < areas.length; j++) {
            r -= areas[j];
            if (r <= 0) { triIdx = j; break; }
        }
        const tri = triangles[triIdx];
        let u = Math.random(), v = Math.random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;
        pos[i * 3]     = tri[0].x * w + tri[1].x * u + tri[2].x * v;
        pos[i * 3 + 1] = tri[0].y * w + tri[1].y * u + tri[2].y * v;
        pos[i * 3 + 2] = tri[0].z * w + tri[1].z * u + tri[2].z * v;
    }
    return pos;
}

// === CANDLESTICK CHART DATA ===
// Shape 0: Globe — sphere surface with latitude/longitude grid lines
function makeGlobe() {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const R = 1.4;
    const latLines = 16;
    const lonLines = 32;
    const totalLines = latLines + lonLines;
    const perLine = Math.floor(PARTICLE_COUNT * 0.55 / totalLines);
    const gridTotal = perLine * totalLines;
    const surfCount = PARTICLE_COUNT - gridTotal;
    let idx = 0;

    // Latitude rings — evenly spaced, skip poles
    for (let li = 0; li < latLines; li++) {
        const phi = (Math.PI / (latLines + 1)) * (li + 1);
        const y = R * Math.cos(phi);
        const r = R * Math.sin(phi);
        for (let i = 0; i < perLine; i++, idx++) {
            const theta = Math.random() * Math.PI * 2;
            pos[idx*3]   = r * Math.cos(theta);
            pos[idx*3+1] = y;
            pos[idx*3+2] = r * Math.sin(theta);
        }
    }

    // Longitude meridians — evenly spaced
    for (let lo = 0; lo < lonLines; lo++) {
        const theta = (Math.PI * 2 / lonLines) * lo;
        for (let i = 0; i < perLine; i++, idx++) {
            const phi = Math.random() * Math.PI;
            pos[idx*3]   = R * Math.sin(phi) * Math.cos(theta);
            pos[idx*3+1] = R * Math.cos(phi);
            pos[idx*3+2] = R * Math.sin(phi) * Math.sin(theta);
        }
    }

    // Scattered surface fill
    while (idx < PARTICLE_COUNT) {
        const u = Math.random(), v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi   = Math.acos(2 * v - 1);
        pos[idx*3]   = R * Math.sin(phi) * Math.cos(theta);
        pos[idx*3+1] = R * Math.cos(phi);
        pos[idx*3+2] = R * Math.sin(phi) * Math.sin(theta);
        idx++;
    }

    return pos;
}

function makeGlobeColors() {
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const perLine = Math.floor(PARTICLE_COUNT * 0.55 / (16 + 32));
    const gridTotal = perLine * (16 + 32);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (i < gridTotal) {
            // Grid lines: bright white
            col[i*3] = 1.00; col[i*3+1] = 1.00; col[i*3+2] = 1.00;
        } else {
            // Surface scatter: soft white
            col[i*3] = 0.75; col[i*3+1] = 0.75; col[i*3+2] = 0.75;
        }
    }
    return col;
}

function makeWhiteColors() {
    const col = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) col[i] = 1.0;
    return col;
}

// Shape 1: Dollar Sign ($)
// Two thick filled arcs (upper + lower bowl) with matching gaps, plus two vertical bars
function makeDollar() {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    let idx = 0;
    const Z = 0.12;

    function addPt(x, y) {
        if (idx + 2 < PARTICLE_COUNT * 3) {
            pos[idx++] = x;
            pos[idx++] = y;
            pos[idx++] = (Math.random() - 0.5) * Z;
        }
    }

    // Two parallel vertical bars (left + right), full height including beyond bowls
    const barN = Math.floor(PARTICLE_COUNT * 0.07);
    for (let i = 0; i < barN; i++) {
        const y = (i / barN) * 3.0 - 1.5;
        addPt(-0.13 + (Math.random() - 0.5) * 0.055, y);
        addPt( 0.13 + (Math.random() - 0.5) * 0.055, y);
    }

    // Upper bowl: center (0, 0.55)
    // Gap at BOTTOM (230°–310°), arc spans 280°
    // Sampling: aDeg = (310 + rand*280) % 360 → 310→360→0→…→230
    const uN = Math.floor(PARTICLE_COUNT * 0.43);
    for (let i = 0; i < uN; i++) {
        const aDeg = (310 + Math.random() * 280) % 360;
        const a = aDeg * Math.PI / 180;
        const r = 0.42 + Math.random() * 0.24;
        addPt(r * Math.cos(a), 0.55 + r * Math.sin(a));
    }

    // Lower bowl: center (0, -0.55)
    // Gap at TOP (50°–130°), arc spans 280°
    // Sampling: aDeg = (130 + rand*280) % 360 → 130→180→…→360→0→50
    const lN = Math.floor(PARTICLE_COUNT * 0.43);
    for (let i = 0; i < lN; i++) {
        const aDeg = (130 + Math.random() * 280) % 360;
        const a = aDeg * Math.PI / 180;
        const r = 0.42 + Math.random() * 0.24;
        addPt(r * Math.cos(a), -0.55 + r * Math.sin(a));
    }

    // Fill any remainder
    while (idx + 2 < PARTICLE_COUNT * 3) {
        const upper = Math.random() > 0.5;
        const aDeg = upper ? (310 + Math.random() * 280) % 360 : (130 + Math.random() * 280) % 360;
        const a = aDeg * Math.PI / 180;
        const r = 0.42 + Math.random() * 0.24;
        addPt(r * Math.cos(a), (upper ? 0.55 : -0.55) + r * Math.sin(a));
    }

    return pos;
}

// Shape 2: Diamond / Gem (larger, centered, shifted up)
function makeDiamond() {
    const yOffset = 0.35;
    const topGeo = new THREE.ConeGeometry(1.4, 0.9, 8);
    topGeo.translate(0, 0.45 + yOffset, 0);
    const bottomGeo = new THREE.ConeGeometry(1.4, 2.0, 8);
    bottomGeo.rotateX(Math.PI);
    bottomGeo.translate(0, -1.0 + yOffset, 0);

    const topNonIdx = topGeo.toNonIndexed();
    const botNonIdx = bottomGeo.toNonIndexed();
    const topIdxGeo = new THREE.BufferGeometry();
    topIdxGeo.setAttribute('position', topNonIdx.attributes.position);
    const topIdx = []; for (let i = 0; i < topNonIdx.attributes.position.count; i++) topIdx.push(i);
    topIdxGeo.setIndex(topIdx);

    const botIdxGeo = new THREE.BufferGeometry();
    botIdxGeo.setAttribute('position', botNonIdx.attributes.position);
    const botIdx = []; for (let i = 0; i < botNonIdx.attributes.position.count; i++) botIdx.push(i);
    botIdxGeo.setIndex(botIdx);

    const topCount = Math.floor(PARTICLE_COUNT * 0.4);
    const botCount = PARTICLE_COUNT - topCount;
    const topPts = sampleGeometry(topIdxGeo, topCount);
    const botPts = sampleGeometry(botIdxGeo, botCount);

    const pos = new Float32Array(PARTICLE_COUNT * 3);
    pos.set(topPts);
    for (let i = 0; i < botCount * 3; i++) {
        pos[topCount * 3 + i] = botPts[i];
    }
    return pos;
}

shapes.push(makeDiamond());

const _whiteColors = makeWhiteColors();
shapeColors.push(_whiteColors);

// === PARTICLE SYSTEM ===
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const colors = new Float32Array(PARTICLE_COUNT * 3);
const sizes = new Float32Array(PARTICLE_COUNT);
const randoms = new Float32Array(PARTICLE_COUNT);

// Initialize with first shape
positions.set(shapes[0]);
colors.set(shapeColors[0]);

for (let i = 0; i < PARTICLE_COUNT; i++) {
    sizes[i] = 0.012 + Math.random() * 0.02;
    randoms[i] = Math.random();
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));

// Custom shader for soft particles
const material = new THREE.ShaderMaterial({
    uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uMorph: { value: 0 },
        uMouse3D: { value: new THREE.Vector3(0, 0, 0) },
        uMouseActive: { value: 0 },
    },
    vertexShader: `
        attribute float aSize;
        attribute float aRandom;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uMorph;

        uniform vec3 uMouse3D;
        uniform float uMouseActive;

        void main() {
            vColor = color;
            vec3 pos = position;
            
            // Subtle breathing
            float breath = sin(uTime * 0.5 + aRandom * 6.28) * 0.02;
            pos += normalize(pos) * breath;
            
            // During morph, particles scatter outward slightly
            float scatter = sin(uMorph * 3.14159) * 0.3;
            pos += normalize(pos + vec3(0.001)) * scatter * aRandom;

            // Mouse influence — swirl + push with depth-agnostic distance
            vec3 toParticle = pos - uMouse3D;
            // Use only XY distance so depth doesn't reduce influence
            float xyDist = length(toParticle.xy);
            float fullDist = length(toParticle);
            float mouseRadius = 1.4;
            float influence = 1.0 - smoothstep(0.0, mouseRadius, xyDist);
            influence = influence * influence * uMouseActive;
            
            if (influence > 0.001) {
                // Push away from mouse
                vec3 pushDir = fullDist > 0.001 ? normalize(toParticle) : vec3(0.0, 1.0, 0.0);
                float pushStrength = influence * 0.3;
                pos += pushDir * pushStrength;
                
                // Swirl around mouse (rotate in XY plane around mouse position)
                float swirlSpeed = uTime * 2.0 + aRandom * 6.28;
                float swirlStrength = influence * 0.25;
                vec2 radial = pos.xy - uMouse3D.xy;
                float angle = swirlStrength * (1.0 + sin(swirlSpeed) * 0.3);
                float cosA = cos(angle);
                float sinA = sin(angle);
                vec2 rotated = vec2(
                    radial.x * cosA - radial.y * sinA,
                    radial.x * sinA + radial.y * cosA
                );
                pos.xy = uMouse3D.xy + rotated;
                
                // Z-axis gentle orbit for depth feel
                pos.z += sin(swirlSpeed * 0.7 + aRandom * 3.14) * influence * 0.15;
                
                // Organic jitter
                float jitter = sin(uTime * 4.0 + aRandom * 18.0) * 0.02 * influence;
                pos += pushDir * jitter;
            }

            vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = aSize * uPixelRatio * 500.0 / -mvPos.z;
            gl_PointSize = max(gl_PointSize, 1.5);
            gl_Position = projectionMatrix * mvPos;
            
            vAlpha = 0.85 + 0.15 * (1.0 - smoothstep(0.0, 10.0, -mvPos.z));
        }
    `,
    fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
            vec3 brightColor = vColor * 2.2 + 0.15;
            gl_FragColor = vec4(brightColor, alpha);
        }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
});

const particles = new THREE.Points(geometry, material);
particles.position.y = -0.4;
scene.add(particles);

const clock = new THREE.Clock();

// === MOUSE RAYCASTING ===
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2(9999, 9999);
const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const mouse3D = new THREE.Vector3();
let mouseOnScreen = false;
let mouseActiveSmooth = 0;

// Mouse interaction disabled — globe is non-interactive background element

// === ANIMATION ===
// Pre-allocate reusable objects to avoid GC pressure
const _invMatrix = new THREE.Matrix4();
const _localMouse = new THREE.Vector3();
const _intersectPoint = new THREE.Vector3();

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

let lastUIUpdate = -1;

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    const elapsed = clock.getElapsedTime();
    material.uniforms.uTime.value = elapsed;

    // Smooth mouse activation
    const mouseTarget = mouseOnScreen ? 1 : 0;
    mouseActiveSmooth += (mouseTarget - mouseActiveSmooth) * 0.08;
    material.uniforms.uMouseActive.value = mouseActiveSmooth;

    // Update mouse 3D position via raycasting onto a plane at z=0
    raycaster.setFromCamera(mouseNDC, camera);
    raycaster.ray.intersectPlane(mousePlane, _intersectPoint);
    // Transform to particle local space (reuse matrices)
    _invMatrix.copy(particles.matrixWorld).invert();
    _localMouse.copy(_intersectPoint).applyMatrix4(_invMatrix);
    material.uniforms.uMouse3D.value.copy(_localMouse);

    // Globe spins steadily
    particles.rotation.y = elapsed * 0.05;
    particles.position.y = -0.4 + Math.sin(elapsed * 0.3) * 0.05;

    // Light animation
    const sinT = Math.sin(elapsed * 0.2);
    const cosT = Math.cos(elapsed * 0.2);
    keyLight.position.x = sinT * 4;
    keyLight.position.z = cosT * 4;

    // Bubble physics + render (background layer)
    bUpdatePhysics(elapsed);
    bRenderer.render(bScene, bCamera);

    // Particle chart render (transparent, on top)
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    bCamera.aspect = window.innerWidth / window.innerHeight;
    bCamera.updateProjectionMatrix();
    bRenderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
}
