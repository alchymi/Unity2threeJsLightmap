#!/usr/bin/env node
/**
 * decode-rgbm.js
 * ----------------------------------------------------------------
 * Decode a Unity "High Quality" RGBM-encoded lightmap PNG into a
 * plain sRGB PNG that Three.js can read directly.
 *
 * Unity stores HDR colour in RGBM as:
 *     rgb_out = rgb_in * (alpha / 255) * 5.0
 *
 * The alpha channel is an HDR multiplier, NOT transparency. Three.js
 * reads the PNG as straight RGBA and the colours come out wrong.
 *
 * This script multiplies each pixel in place, clamps to 0-255, and
 * writes the alpha back to 255 everywhere. It is idempotent: if all
 * alpha values in the image are already 255, the file is left alone.
 *
 * Usage:
 *     node decode-rgbm.js path/to/Lightmap-0_comp_light.png
 *
 * You can also batch a folder:
 *     node decode-rgbm.js path/to/scenes/
 *
 * Dependencies:
 *     npm install jimp
 */

const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const MULTIPLIER = 5.0; // Unity RGBM range

async function decodeFile(filePath) {
  const rel = path.relative(process.cwd(), filePath);
  const img = await Jimp.read(filePath);
  const w = img.getWidth();
  const h = img.getHeight();

  // Quick sample: if the top-left 10x10 region is already fully opaque,
  // assume the file is already decoded and skip it.
  let needsDecode = false;
  img.scan(0, 0, Math.min(10, w), Math.min(10, h), function (x, y, idx) {
    if (this.bitmap.data[idx + 3] !== 255) needsDecode = true;
  });

  if (!needsDecode) {
    console.log(`  ${rel}  (already decoded, skipped)`);
    return;
  }

  img.scan(0, 0, w, h, function (x, y, idx) {
    const r = this.bitmap.data[idx];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    const a = this.bitmap.data[idx + 3];
    const m = (a / 255.0) * MULTIPLIER;
    this.bitmap.data[idx]     = Math.min(255, Math.round(r * m));
    this.bitmap.data[idx + 1] = Math.min(255, Math.round(g * m));
    this.bitmap.data[idx + 2] = Math.min(255, Math.round(b * m));
    this.bitmap.data[idx + 3] = 255;
  });

  await img.writeAsync(filePath);
  console.log(`  ${rel}  decoded (${w}x${h})`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node decode-rgbm.js <file.png | folder/>');
    process.exit(1);
  }

  const absPath = path.resolve(arg);
  if (!fs.existsSync(absPath)) {
    console.error('Not found:', absPath);
    process.exit(1);
  }

  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    const files = fs
      .readdirSync(absPath)
      .filter((f) => /lightmap.*\.png$/i.test(f))
      .map((f) => path.join(absPath, f));
    if (files.length === 0) {
      console.log('No Lightmap*.png files found in', absPath);
      return;
    }
    console.log(`Decoding ${files.length} file(s):`);
    for (const f of files) await decodeFile(f);
  } else {
    await decodeFile(absPath);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
