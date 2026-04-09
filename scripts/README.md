# Helper scripts

## decode-rgbm.js

Decodes a Unity "High Quality" RGBM-encoded lightmap PNG into a plain
sRGB PNG that Three.js can use as-is.

### Install

```bash
cd scripts
npm install
```

### Decode a single file

```bash
node decode-rgbm.js ../scenes/Lightmap-0_comp_light.png
```

### Decode a whole folder

```bash
node decode-rgbm.js ../scenes/
```

Only files matching `lightmap*.png` (case-insensitive) are touched.
The script is idempotent — running it twice on the same file is a no-op.

### Skip this entirely

In Unity: `Edit → Project Settings → Player → Other Settings →
Lightmap Encoding → Normal Quality`. Re-bake. The exported PNG will
already be sRGB. You lose a bit of HDR range but you can skip the
decoder step.
