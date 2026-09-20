# Changelog

## 2026-09-20 — WebGPU as the main experience

- Made the enhanced WebGPU scene the default at `/`, retaining the original WebGL2 scene at `/webgl.html`.
- Added visible links between both versions and updated the WebGPU recovery screen to open WebGL2.
- Kept `/webgpu.html` as a compatibility redirect, preserving query parameters, fragments and the deployment base path.
- Added the WebGPU demo cover to the repository overview; included the comparison gallery, MP4 and cover image in `docs/media/`.

## 2026-09-20 — WebGPU landscape details

On branch `codex/webgpu-water-study`:

- Added grounded river boulders and clustered bank stones, with photographic texture and a wet waterline.
- Added local bow foam and downstream wakes aligned with exposed rocks and river bends.
- Added shallow-water color, gravel detail and moving current streaks to the lower river.
- Varied green terrain at several scales and added clustered bent grass and low moss cushions with slope-aware placement.
- Kept channels and stair access clear, with reduced instance counts on the coarse-pointer path.
- Added placement/alignment tests and the [WebGPU implementation guide](docs/WEBGPU.md).

## 2026-09-20 — Initial WebGPU study

- Added `/webgpu.html` alongside the original `/` page.
- Ported custom materials and weather effects to TSL.
- Added native compute-driven falling droplets, splashes and mist with fixed-step gravity, wind, impact and recycling.
- Added wind/spray controls, on-demand GPU state validation and six-second frame timing.
- Preserved five viewpoints, four skies, pause, reduced-motion preferences and optional audio.
- Added explicit backend verification, initialization recovery and device-loss handling.
