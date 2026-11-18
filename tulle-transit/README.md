# Tulle / Transit

An artistic, scroll-driven 3D page: a painted figure in a tulle gown waiting on an empty metro platform.
Plain static site (HTML + CSS + three.js). No build step and no npm install.

## Deploy on Render
1. Push this folder to a GitHub repo (the files must sit at the repo root).
2. On Render: **New → Static Site** and pick the repo.
   - Build command: leave empty (or `echo ok`)
   - Publish directory: `.`
3. Deploy. `render.yaml` is included, so **New → Blueprint** works too.

## Run locally
Browsers block ES modules on `file://`, so serve the folder:
```
python3 -m http.server 8000   # then open http://localhost:8000
```

## What's inside
| Path | What it is |
|---|---|
| `index.html` | Page structure: 7 chapters, metro line-map nav, LED board |
| `css/style.css` | Typography, parallax layers, film grain, vignette |
| `js/main.js` | three.js scene: camera ride, lights, bloom, petals, dust, 3D type |
| `models/station.glb` | WorldGen MRT platform (WebP textures, meshopt-compressed) |
| `models/figure.glb` | The painted gown sculpture (vertex colours, meshopt-compressed) |
| `vendor/` | three.js r170 and only the addons it uses |

## Things to tweak (all in `js/main.js`)
- `FIG` / `FIG_H` / `fig.rotation.y`: where she stands, her height, and which way she faces
- `keys`: the 7 camera stops (position `p`, look-at `t`), one per chapter
- `PETALS`, `DUST`: particle counts
- `bloom`, `key`, `rim`: glow and lighting mood

The **MOTION** button (top right) calms parallax and particles. The site also respects the OS "reduce motion" setting.
