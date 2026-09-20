# Skógafoss — Field Notes

A working first study of Skógafoss: a procedural 3D landscape, animated waterfall and river, mist, rock detail, a lookout path and three camera positions. No generated background image or video is used; the landscape is rendered in real time.

## Run

Requires Node.js 22.12+ (developed with Node 24).

```sh
npm ci
npm run dev
```

`npm run build` creates `dist/`, which can be hosted as a static site. `npm run preview` serves that production build locally.

## Controls

- Drag to orbit; wheel/pinch to zoom.
- Viewpoint buttons or keys 1–3 select views.
- H returns to the approach. Space pauses or resumes water animation.
- Sound is opt-in, synthesized locally with the Web Audio API.
- Reduced-motion preferences start the water paused and disable camera transitions.

## Source files

- `src/nature.js`: terrain, procedural surface detail, instanced stones/grass, stairs and tiny hikers.
- `src/water.js`: waterfall, flow, droplets and mist shaders.
- `src/main.js`: camera, lighting, sky, interaction and ambient audio.
- `src/style.css`: responsive editorial interface.

## Reference and scope

Approximate waterfall dimensions: 60 m high and 25 m wide.

- [Visit South Iceland — Skógafoss](https://www.south.is/en/place/skogafoss-waterfall)
- [Visit South Iceland — South coast waterfalls](https://www.south.is/en/travel-info/newsblog/best-waterfalls-in-south-iceland)

This is an artistic reconstruction, not a surveyed terrain model or photogrammetry. Rock positions, terrain beyond the fall, the path and camera framing are composed approximations. The stairs and people are simplified scale references. This version concentrates on a single lit scene; no weather system or walking simulation is included.

All scene geometry and shaders were created for this project. UI typefaces: DM Sans and Libre Caslon Display, delivered through Google Fonts with local serif/sans-serif fallbacks. Three.js and Vite are pinned in package-lock.json.
