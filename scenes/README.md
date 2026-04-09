# scenes/ — drop your Unity export here

Expected layout after exporting from Unity (any of the prefrontalcortex
or matrix-org UnityGLTF forks, with "Export textures externally"):

```
scenes/
  scene.gltf
  scene.bin
  Lightmap-0_comp_light.png     ← decoded by scripts/decode-rgbm.js
  [all the other textures your materials reference]
```

Then update `scenePath` / `lightmapPath` at the top of [`../main.js`](../main.js)
if your files are named differently.

## Reminder: the full pipeline

1. Unity: bake lightmaps normally (`Window → Rendering → Lighting → Generate Lighting`)
2. Unity: `Tools → Bake Lightmap UVs into Meshes` (the Editor script in [`../unity/`](../unity/))
3. Unity: export GLTF
4. Unity: `Tools → Restore Original Meshes`
5. Terminal: `node scripts/decode-rgbm.js scenes/Lightmap-0_comp_light.png`
6. Open `../index.html` via `npx serve ..` at the repo root

See the main [README.md](../README.md) for the gory details.
