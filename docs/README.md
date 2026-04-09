# docs/ — visual assets for the main README

Drop your comparison images here:

```
docs/
  before.jpg    ← screenshot with lightmap OFF (flat PBR, direct lights only)
  after.jpg     ← screenshot with lightmap ON (full Unity-baked look)
  compare.gif   ← optional animated before/after loop for the top of README.md
```

## How to capture them from the Arcade in OrbitGraveyard

The arcade scene in this project doubles as a test-bed for the lightmap
pipeline. Its debug panel has a `LIGHTMAP: ON/OFF` toggle that bypasses
the lightmap contribution via a shader uniform, so you can take the
exact same frame twice — lightmap on, lightmap off — without reloading
the page.

1. Run the game, open the arcade (or go to `/arcade/?debug` directly).
2. When the blocker shows, click to enter pointer lock.
3. In the debug panel (top-left), find the **LIGHTMAP** button.
4. Take a screenshot of the same frame with:
   - `LIGHTMAP: ON  (N mats)`  → save as `after.jpg`
   - `LIGHTMAP: OFF (N mats)`  → save as `before.jpg`
5. Optional: record a short MP4 while toggling, convert to GIF:

```bash
ffmpeg -i capture.mp4 -vf "fps=10,scale=720:-1:flags=lanczos,palettegen" palette.png
ffmpeg -i capture.mp4 -i palette.png -filter_complex "fps=10,scale=720:-1:flags=lanczos [x]; [x][1:v] paletteuse" compare.gif
```

Then reference them at the top of [`../README.md`](../README.md):

```markdown
| Lightmap OFF (flat) | Lightmap ON (Unity-baked) |
|---|---|
| ![before](docs/before.jpg) | ![after](docs/after.jpg) |

![animated comparison](docs/compare.gif)
```
