# Skógafoss — Field Notes

An interactive 3D interpretation of Skógafoss, Iceland: a flowing waterfall, a reflective river, moss-covered cliffs and a broader valley and highland landscape. All views are rendered in real time and can be explored with the camera.

## Run

Requires Node.js 22.12+ (developed with Node 24).

```sh
npm ci
npm run dev
```

`npm run build` creates `dist/`, ready for a static web host. `npm run preview` serves the production build locally. For a subdirectory deployment, pass the base path, for example `npm run build -- --base=/skogafoss-waterfall/`.

## What's in the scene

- A detailed valley around the fall, extended into several kilometres of composed landscape: a winding upper river, broad meadows and distant highlands.
- Photographic rock, turf and gravel textures, including surface normals and roughness; triplanar mapping and varying texture offsets soften visible repetition.
- Embedded boulders and pebbles sampled against the actual terrain triangles, wind-animated grass and 16 visitors distributed between the riverbed, staircase and lookout.
- A continuous river-to-waterfall surface with a rounded lip, unequal streams, turbulent folds, droplets and wind-driven spray. The lower river has live planar reflections and foam.
- Five camera viewpoints: Approach, Riverbed, Lookout, Highlands and Valley.
- Four selectable atmospheres: Clear, Golden, Storm and Aurora. HDR panoramas crossfade with lighting, fog, water color, terrain wetness and wind; storm mode adds rain, and night mode adds animated northern lights.

## Controls

- Drag to orbit; wheel/pinch to zoom. Right-drag or two-finger drag to pan.
- Viewpoint buttons or keys 1–5 select views. H returns to the approach.
- Space pauses or resumes water, mist, rain, aurora and vegetation motion.
- Sound is opt-in and synthesized locally with the Web Audio API.
- Reduced-motion preferences start the scene paused and disable camera and weather transitions.
- Coarse-pointer devices use fewer instances, a smaller reflection target and a lower pixel ratio.

## Source files

- `src/nature.js`: terrain height functions, instanced details, staircase and hikers.
- `src/materials.js`: local asset loading and blended triplanar PBR materials.
- `src/water.js`: waterfall, river reflection, foam, droplets and mist.
- `src/weather.js`: asynchronous sky loading, atmosphere transitions, rain and aurora.
- `src/main.js`: camera, lighting, interaction and ambient audio.
- `src/style.css`: responsive interface.
- [ASSETS.md](ASSETS.md): asset authors, licenses and sources.

## Validation

`npm test` checks terrain triangle sampling, grounded stones, water-lip continuity, visitor placement, finite geometry and asset checksums. `npm run build` validates the production bundle.

## Reference and scope

Approximate waterfall dimensions: 60 m high and 25 m wide, referenced from [Visit South Iceland](https://www.south.is/en/place/skogafoss-waterfall).

This is an artistic reconstruction, not surveyed terrain or photogrammetry. Rock positions, the winding rivers, wider topography, stairs and camera framing are composed approximations. The CC0 photographic materials are general rock and vegetation samples, not location-specific scans. The four atmospheres are artistic presets, not live meteorological conditions or a physical weather forecast. This is not a walking simulation.

The production build and all five viewpoints were checked in the desktop browser, with a narrow viewport check for the mobile interface. Actual phone GPU performance is not yet profiled. The scene requires WebGL 2. Terrain textures and the initial overcast sky total approximately 8.8 MB. The selected 2K panorama adds roughly 5 MB; other skies load on demand and are cached for the session; no asset API key or paid service is required. Google Fonts is optional and has fallback fonts.

Visual reference for the continuous crest and unequal sheets of water: [Mr Iceland — Skógafoss](https://mriceland.is/south-coast-destinations/skogafoss/). Reference photographs are not bundled into the scene.
