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
- A continuous river-to-waterfall surface with a rounded lip, asymmetric banks, unequal streams, fine turbulent ridges and independently falling bodies of aerated foam. Droplets and wind-driven spray soften its edges. The lower river has live planar reflections and foam.
- Five camera viewpoints: Approach, Riverbed, Lookout, Highlands and Valley.
- Four selectable atmospheres: Clear, Golden, Storm and Aurora. HDR panoramas crossfade with lighting, fog, water color, terrain wetness and wind; storm mode adds rain, and night mode adds animated northern lights.

## Controls

- Drag to orbit; wheel/pinch to zoom. Right-drag or two-finger drag to pan.
- Viewpoint buttons or keys 1–5 select views. H returns to the approach.
- Space pauses or resumes water, mist, rain, aurora and vegetation motion.
- Sound is opt-in and synthesized locally with the Web Audio API.
- Reduced-motion preferences start the scene paused and disable camera and weather transitions.
- Coarse-pointer devices use fewer instances, a smaller reflection target and a lower pixel ratio.

## WebGPU water study

See the [implementation guide](docs/WEBGPU.md) for architecture, controls, detail placement, validation and limitations, and the [changelog](CHANGELOG.md) for the development history.

This branch adds a separate experiment at **`/webgpu.html`**. The original WebGL 2 scene remains at `/`; its About dialog links to the study. Both pages are included in the static production build. No additional packages, asset services or paid APIs are required.

The study uses Three.js `WebGPURenderer` and TSL node materials for the landscape, continuous waterfall, river reflections, skies, rain and grass. Native WebGPU compute updates **24,576 particles** (12,288 on coarse-pointer devices) in resident position/velocity storage buffers. A fixed 1/120-second simulation step applies gravity, wind, terrain/water impacts, short splashes and a smaller drifting mist population. A sampled height field follows the rendered riverbed and front slope. Pause stops the simulation and all animated material clocks.

Open **Water study** to adjust wind, toggle the GPU spray, read back particle state or measure six seconds of frame timing. A readback reports the falling/splash/mist populations, height range and simulation step count; it also detects uninitialized, non-finite and escaped state. It runs only on request. The normal animation loop does not read particle buffers back to the CPU.

The **WebGPU active** badge is set only after the native backend initializes. If WebGPU is unavailable, initialization fails or the device is lost, the page shows an explanation and a link to the original. The compute experiment does not silently fall back to WebGL. Serve over localhost or HTTPS in a browser/device combination with WebGPU support. Some embedded browsers defer adapter creation for background tabs; open the study in the foreground and use Try again if an initialization timeout appears.

This is a hybrid artistic scene, **not a full fluid solver**: the main curtain is a continuous animated surface, droplets do not interact with one another, and collisions use a height field rather than the cliff/stair/rock meshes. TSL materials and reflection filtering differ from the original GLSL version, so visual parity is approximate. A WebGPU renderer alone does not guarantee better visuals or faster frames.

### River and vegetation details

The WebGPU version adds partially submerged river boulders, clustered bank stones and broken foam wakes that follow the river bends. Wet rock shading, gravel-colored shallows and finer current streaks tie the stones into the water. Meadow colors vary at several scales, with clustered bent grass and low moss cushions sampled against the rendered terrain; river channels, steep faces and the staircase corridor stay clear. Detail counts scale down for coarse-pointer devices. All assets remain local and reuse the existing CC0 material set.

### Experiment checks

- Production scene checked in the local desktop browser with a native WebGPU backend: five viewpoints, four atmospheres, particle readback and animation controls. Narrow-screen layout also checked; actual phone hardware has not been profiled.
- Before the landscape-detail pass, a 1280×800 Clear/Approach sample measured approximately 52 fps with spray and 56 fps with spray disabled. These short, sequential samples include the whole scene and browser scheduling; they are illustrative, not GPU timings or a controlled WebGPU-versus-WebGL benchmark.
- After the detail pass, a local 1280×800 Clear/Approach sample with spray enabled measured 46.6 fps (median 20.7 ms, p95 28.0 ms). It was not a controlled comparison with the earlier sample.
- `npm test` includes collision-floor/plateau exclusion, GPU readback validation, frame-timing statistics and independent camera presets, grounded detail placement, stair clearance and wake alignment, alongside the original landscape tests.
- Shader compilation and runtime GPU state require browser verification; passing Node tests alone does not establish GPU correctness.

Implementation: `src/gpu/` (renderer, TSL materials, simulation, weather and lab), shared `src/views.js` and `src/weather-presets.js`. The two HTML entry points are configured in `vite.config.js`.

Technical references: [Three.js WebGPU renderer](https://threejs.org/manual/pages/webgpurenderer), [TSL](https://threejs.org/docs/pages/TSL.html) and the [official compute-particles example](https://threejs.org/examples/webgpu_compute_particles.html).

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

Visual references for the continuous crest and unequal sheets of water: [Mr Iceland — Skógafoss](https://mriceland.is/south-coast-destinations/skogafoss/) and the close-up [Cascading Force](https://community.naturephotographers.network/t/cascading-force/46946), especially its shaded channels, torn edges and clumps of white water. Reference photographs are not bundled into the scene.
