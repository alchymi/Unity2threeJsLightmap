# Unity → Three.js Lightmap Bridge

A working — but probably not **the** correct — pipeline to take a scene
baked in Unity and display it with its lightmaps intact in vanilla
Three.js.

> ⚠️ I am **not** claiming this is the canonical way. It is **a** way that
> worked for me after way too many hours of suffering. If you know a
> cleaner pipeline, please open an issue, I'll happily update this.

## Why?

I already know Unity well. I love Bakery / Progressive GPU. Rebuilding
the same knowledge inside Blender just to bake lighting for Three.js
was going to cost me days. This pipeline lets me **stay in Unity** for
level design and baking, and ship to Three.js without rewriting
everything.

## Why it's painful out of the box

Unity bakes beautiful lightmaps, but GLTF → Three.js is a minefield:

1. **Unity stores lightmap UV scale/offset OUTSIDE the mesh**, in a custom
   GLTF extension (`MX_lightmap`) that most loaders ignore. If your
   viewer doesn't honor the extension, your meshes read the lightmap
   at the wrong coordinates and you get rainbow-vomit artifacts on the
   walls and floor.

2. **"High Quality" lightmaps are RGBM encoded**. The alpha channel is
   an HDR multiplier. Three.js reads the PNG as straight RGBA and the
   colors come out completely wrong — black with flecks of oversaturated
   noise.

3. **Three.js `lightMap` is additive** while Unity applies it
   multiplicatively. Out of the box, the result never matches what you
   see in the Unity editor.

This repo tackles problems (1) and (2) and gives a reasonable answer to (3).

## Pipeline overview

```
 Unity scene
   │
   │  bake lightmaps normally
   ▼
 Unity Editor: Tools → Bake Lightmap UVs into Meshes    ← this repo
   │
   │  GLTF export (prefrontalcortex / matrix-org UnityGLTF)
   ▼
 Node: scripts/decode-rgbm.js Lightmap-0_comp_light.png ← this repo
   │
   │  drop scene into scenes/
   ▼
 Three.js: tex.channel = 1, flipY = false, sRGB         ← this repo
   │
   ▼
 Browser 🎉
```

## Prerequisites

- **Unity 6+** (tested on 6000.0.60f1, URP)
- A GLTF exporter that writes at least a valid UV2 (`TEXCOORD_1`):
  - [prefrontalcortex/UnityGLTF](https://github.com/prefrontalcortex/UnityGLTF), or
  - [matrix-org/UnityGLTF (thirdroom)](https://github.com/matrix-org/UnityGLTF) — branch `thirdroom/dev`
- **Node.js 18+** for the RGBM decoder
- **Three.js r152+** in your project (we need `Texture.channel`)

## Step-by-step

### 1. Drop the Unity script

Copy `unity/BakeLightmapUVs.cs` into your Unity project:
```
Assets/Editor/BakeLightmapUVs.cs
```

### 2. Bake lightmaps in Unity (as usual)

`Window → Rendering → Lighting → Generate Lighting`

Make sure your meshes have **"Generate Lightmap UVs"** checked in their
import settings if they don't already have a UV2 channel.

### 3. Run the bake script

`Tools → Bake Lightmap UVs into Meshes`

The script will, for every MeshRenderer with a valid `lightmapIndex`:

1. Duplicate the mesh
2. Apply `renderer.lightmapScaleOffset` directly into the **UV2** of the
   copy (the transformation Unity usually does at runtime via the
   atlas entry)
3. Save the copy as an asset under `Assets/BakedLM/`
4. Swap the filter's `sharedMesh` to the baked copy
5. Reset the renderer's `lightmapScaleOffset` to `(1,1,0,0)` so the
   Unity viewport doesn't double-transform in play mode

The originals are kept in memory for restore in step 5.

### 4. Export GLTF

Export your scene as usual with your GLTF exporter. Prefer **separate
textures** so you can inspect and decode the lightmap PNG next to the
`.gltf` and `.bin` files.

The exporter will serialize the **pre-baked UV2** into the mesh —
no extension support needed on the reader side.

### 5. Restore the original meshes in Unity

`Tools → Restore Original Meshes`

- Puts the original `sharedMesh` back on every `MeshFilter`
- Restores the original `lightmapScaleOffset` on every renderer
- Deletes the `Assets/BakedLM/` folder

Your Unity project is back to exactly how it was.

### 6. Decode the lightmap (RGBM → sRGB)

```bash
cd scripts
npm install
node decode-rgbm.js ../scenes/Lightmap-0_comp_light.png
```

This reads the PNG, multiplies each pixel's RGB by `(alpha / 255) * 5.0`
(the standard Unity RGBM decode), clamps to 0–255 and writes the file
back with alpha set to 255 everywhere. The decoder is idempotent — if
all alpha values are already 255, it leaves the file alone.

> **Tip**: you can skip this step entirely if you set **Player Settings
> → Other Settings → Lightmap Encoding → Normal Quality** before
> baking. Unity will then export a plain sRGB PNG. The tradeoff is
> slightly less HDR range in the bake.

### 7. Drop the scene into `scenes/`

```
scenes/
  scene.gltf
  scene.bin
  Lightmap-0_comp_light.png
  [all your other textures]
```

Update `scenePath` and `lightmapPath` in `main.js` if your filenames
are different.

### 8. Serve and open

```bash
npx serve .
# open http://localhost:3000
```

## The Three.js magic, in three lines

```js
lmTex.flipY = false;                    // GLTF spec: no Y flip
lmTex.channel = 1;                       // Read UV2 (TEXCOORD_1)
lmTex.colorSpace = THREE.SRGBColorSpace; // Lightmap is sRGB-encoded
```

The single most important line is `tex.channel = 1`. Without it
Three.js defaults to UV0 (the base color UV set) and your lightmap reads
the same coordinates as your diffuse map — hello rainbow walls.

## Debug panel

The demo includes a floating debug panel with sliders for:

- Ambient intensity & color
- Directional intensity & color
- Lightmap intensity
- Fog enabled / color / near / far
- Bloom strength / radius / threshold
- Tone mapping exposure

A **PRINT CONFIG** button copies the current settings to your clipboard
as JSON, so you can paste them straight into your own scene config.

## Known issues / open questions

- **Brightness mismatch vs Unity editor**: Three.js `lightMap` is
  **additive** where Unity applies it multiplicatively. The panel
  compensates via `lightMapIntensity`, ambient, and exposure, but it's
  not pixel-perfect. Patching the MeshStandardMaterial shader with
  `irradiance = lightMapIrradiance` (instead of `+=`) gets closer but
  is invasive and fights with direct lights. I left it out of this
  demo.

- **Directional lightmaps** (normal-aware) are ignored. Only the
  color lightmap is used.

- **Multiple lightmap atlases** (Unity splits into Lightmap-0, -1, -2…
  when a scene doesn't fit) are not handled. Force everything into one
  by raising **Lightmap Size** in Lighting Settings (2048 → 4096).

- **Shadowmask / subtractive** modes are untested.

- **Emissive strengths** exported via `KHR_materials_emissive_strength`
  can wash out the lightmap. Clamp them down to reasonable values
  before exporting, or post-process them in a traverse.

## Is this *the* way?

Honestly? **No idea.** This is what worked for me. If you have a
cleaner path — using `MX_lightmap` properly, a dedicated Three.js
extension plugin, or a better exporter — please tell me. I'll happily
update this repo and credit you.

## License

MIT. Use, fork, remix, tear apart, improve.

## Credits

- `Texture.channel` trick: [three.js discourse](https://discourse.threejs.org/t/lightmap-not-applying-correctly/58398)
- RGBM formula: the standard Unity `rgb * alpha * 5.0`
- Everyone who's already written about this on Twitter, Discord and
  forums — this repo is mostly a concrete, runnable synthesis of
  advice scattered across many threads.
