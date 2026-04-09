// ================================================================
// Unity → Three.js Lightmap Demo
// ----------------------------------------------------------------
// Loads a GLTF scene that has been pre-baked in Unity with
// BakeLightmapUVs.cs (lightmap scale/offset baked into UV2), applies
// the decoded lightmap texture, and exposes a debug panel to tweak
// lighting, fog and bloom at runtime.
//
// See README.md for the full pipeline.
// ================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ================================================================
// Configuration — edit these paths to point to your own scene
// ================================================================
const config = {
  scenePath:    './scenes/scene.gltf',
  lightmapPath: './scenes/Lightmap-0_comp_light.png',

  ambient:     { color: '#ffffff', intensity: 0.6 },
  directional: { color: '#ffffff', intensity: 1.0, position: [5, 10, 5] },

  lightMapIntensity: 1.5,

  fog: { enabled: true, color: '#0a0f1a', near: 10, far: 120 },
  bloom: { strength: 0.35, radius: 0.4, threshold: 0.85 },
  exposure: 1.0,
  background: '#040a14',
};

// ================================================================
// Renderer + scene + camera
// ================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = config.exposure;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(config.background);
scene.fog = new THREE.Fog(config.fog.color, config.fog.near, config.fog.far);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(6, 4, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

// ----- Lights -----
const ambient = new THREE.AmbientLight(config.ambient.color, config.ambient.intensity);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(config.directional.color, config.directional.intensity);
dirLight.position.set(...config.directional.position);
scene.add(dirLight);

// ----- Post-processing -----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  config.bloom.strength, config.bloom.radius, config.bloom.threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ================================================================
// Load GLTF + apply lightmap
// ================================================================
const gltfLoader = new GLTFLoader();
const texLoader  = new THREE.TextureLoader();

let model = null;
let lightmapTexture = null;

// Load the lightmap first so we can apply it as soon as the model is ready.
texLoader.load(
  config.lightmapPath,
  (tex) => {
    // ---------- The three magic lines ----------
    tex.flipY = false;                       // GLTF spec: do not flip Y
    tex.channel = 1;                          // Read from UV2 (TEXCOORD_1)
    tex.colorSpace = THREE.SRGBColorSpace;    // Lightmap is stored in sRGB
    // ------- Nice-to-have filtering -------
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    lightmapTexture = tex;
    console.log('Lightmap loaded:', tex.image.width + 'x' + tex.image.height);
    if (model) applyLightmapToModel(model, tex);
  },
  undefined,
  (err) => {
    console.warn('Lightmap not found at', config.lightmapPath, '— scene will render without it.');
  }
);

gltfLoader.load(
  config.scenePath,
  (gltf) => {
    model = gltf.scene;
    scene.add(model);

    // Frame the camera on the model's bounding box
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(size * 0.4, size * 0.25, size * 0.4));
    camera.near = Math.max(size / 500, 0.01);
    camera.far  = size * 10;
    camera.updateProjectionMatrix();

    if (lightmapTexture) applyLightmapToModel(model, lightmapTexture);
    console.log('Scene loaded:', model.name || '(unnamed)');
  },
  undefined,
  (err) => {
    console.error('Failed to load scene:', err);
    document.getElementById('hint').innerHTML =
      '<b style="color:#ff6080;">Scene failed to load.</b><br>' +
      'Expected file: <b>' + config.scenePath + '</b>. See README.md.';
  }
);

function applyLightmapToModel(root, tex) {
  let count = 0;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mat = obj.material;
    if (!mat) return;
    // Only PBR materials have a lightMap slot
    if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;
    mat.lightMap = tex;
    mat.lightMapIntensity = config.lightMapIntensity;
    mat.needsUpdate = true;
    count++;
  });
  console.log(`Lightmap applied to ${count} mesh(es) using tex.channel = ${tex.channel}`);
}

// ================================================================
// Debug panel
// ================================================================
buildPanel();

function buildPanel() {
  const p = document.createElement('div');
  p.id = 'debugPanel';

  const row = (label, inner) =>
    `<div class="row"><span class="lbl">${label}</span>${inner}</div>`;
  const slider = (id, min, max, step, val) =>
    `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
     <span id="${id}-v" class="val">${val}</span>`;
  const color = (id, val) =>
    `<input type="color" id="${id}" value="${val}">`;
  const check = (id, val) =>
    `<input type="checkbox" id="${id}" ${val ? 'checked' : ''}>`;

  p.innerHTML = `
    <div class="hdr">LIGHTMAP DEMO · DEBUG</div>

    <div class="grp">AMBIENT</div>
    ${row('Intensity', slider('amb-i', 0, 3, 0.01, config.ambient.intensity))}
    ${row('Color',     color('amb-c', config.ambient.color))}

    <div class="grp">DIRECTIONAL</div>
    ${row('Intensity', slider('dir-i', 0, 3, 0.01, config.directional.intensity))}
    ${row('Color',     color('dir-c', config.directional.color))}

    <div class="grp">LIGHTMAP</div>
    ${row('Intensity', slider('lm-i', 0, 5, 0.01, config.lightMapIntensity))}

    <div class="grp">FOG</div>
    ${row('Enabled',   check('fog-e', config.fog.enabled))}
    ${row('Color',     color('fog-c', config.fog.color))}
    ${row('Near',      slider('fog-n', 0, 500, 0.5, config.fog.near))}
    ${row('Far',       slider('fog-f', 10, 1000, 1, config.fog.far))}

    <div class="grp">BLOOM</div>
    ${row('Strength',  slider('bl-s', 0, 2, 0.01, config.bloom.strength))}
    ${row('Radius',    slider('bl-r', 0, 1, 0.01, config.bloom.radius))}
    ${row('Threshold', slider('bl-t', 0, 1, 0.01, config.bloom.threshold))}

    <div class="grp">EXPOSURE</div>
    ${row('Tone map',  slider('exp', 0, 3, 0.01, config.exposure))}

    <button id="print-btn">Print config (copy to clipboard)</button>
  `;
  document.body.appendChild(p);

  const bindS = (id, apply) => {
    const el = p.querySelector('#' + id);
    const vl = p.querySelector('#' + id + '-v');
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      vl.textContent = (+v.toFixed(3)).toString();
      apply(v);
    });
  };
  const bindC = (id, apply) => {
    const el = p.querySelector('#' + id);
    el.addEventListener('input', () => apply(el.value));
  };
  const bindX = (id, apply) => {
    const el = p.querySelector('#' + id);
    el.addEventListener('change', () => apply(el.checked));
  };

  bindS('amb-i', v => { config.ambient.intensity = v; ambient.intensity = v; });
  bindC('amb-c', v => { config.ambient.color = v; ambient.color.set(v); });
  bindS('dir-i', v => { config.directional.intensity = v; dirLight.intensity = v; });
  bindC('dir-c', v => { config.directional.color = v; dirLight.color.set(v); });

  bindS('lm-i', v => {
    config.lightMapIntensity = v;
    if (!model) return;
    model.traverse(o => {
      if (o.isMesh && o.material && (o.material.isMeshStandardMaterial || o.material.isMeshPhysicalMaterial)) {
        o.material.lightMapIntensity = v;
      }
    });
  });

  bindX('fog-e', v => {
    config.fog.enabled = v;
    scene.fog = v ? new THREE.Fog(config.fog.color, config.fog.near, config.fog.far) : null;
  });
  bindC('fog-c', v => {
    config.fog.color = v;
    if (scene.fog) scene.fog.color.set(v);
  });
  bindS('fog-n', v => {
    config.fog.near = v;
    if (scene.fog) scene.fog.near = v;
  });
  bindS('fog-f', v => {
    config.fog.far = v;
    if (scene.fog) scene.fog.far = v;
  });

  bindS('bl-s', v => { config.bloom.strength = v; bloomPass.strength = v; });
  bindS('bl-r', v => { config.bloom.radius = v; bloomPass.radius = v; });
  bindS('bl-t', v => { config.bloom.threshold = v; bloomPass.threshold = v; });

  bindS('exp', v => { config.exposure = v; renderer.toneMappingExposure = v; });

  p.querySelector('#print-btn').addEventListener('click', () => {
    const out = {
      ambient: config.ambient,
      directional: config.directional,
      lightMapIntensity: config.lightMapIntensity,
      fog: config.fog,
      bloom: config.bloom,
      exposure: config.exposure,
    };
    const text = JSON.stringify(out, null, 2);
    console.log(text);
    navigator.clipboard?.writeText(text).then(() => {
      const btn = p.querySelector('#print-btn');
      const orig = btn.textContent;
      btn.textContent = '✓ Copied to clipboard';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => {});
  });
}

// ================================================================
// Resize + render loop
// ================================================================
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

function animate() {
  controls.update();
  composer.render();
  requestAnimationFrame(animate);
}
animate();
