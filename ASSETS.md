# Landscape assets

Photographic materials and the sky are downloaded from **Poly Haven**, at 1K for terrain materials and the storm sky, and 2K for the additional weather skies, and included locally. The site makes no runtime requests to their API.

Poly Haven assets are released under [CC0 1.0](https://polyhaven.com/license). These are general natural materials; they are not scans of Skógafoss itself.

| Files in `public/textures/` | Original asset | Creator | Use |
| --- | --- | --- | --- |
| `dark_rock-{color,normal,arm}.jpg` | [Dark Rock](https://polyhaven.com/a/dark_rock) | Amal Kumar | Cliff faces, outcrops and boulders |
| `aerial_grass_rock-{color,normal,arm}.jpg` | [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) | Rob Tuytel | Mossy turf, meadows and slopes |
| `river_small_rocks-{color,normal,arm}.jpg` | [River Small Rocks](https://polyhaven.com/a/river_small_rocks) | Rob Tuytel; minor adjustment by Rico Cilliers | Gravel banks and pebbles |
| `sky.hdr` | [Kloppenheim 03 Pure Sky](https://polyhaven.com/a/kloppenheim_03_puresky) | Greg Zaal; sky edits by Jarod Guest | Clouded sky and environmental lighting |

`color` is the source diffuse photograph; `normal` is its OpenGL normal map; `arm` contains ambient occlusion, roughness and metallic channels. Files are unmodified; tinting, blending and surface mapping happen in the shader. Texture source URLs and checksums are in `public/textures/manifest.json`.

Water ripple normals, waterfall flow, droplets, mist, terrain geometry, plants, path and hikers are constructed in code. The river reflection implementation uses Three.js's MIT-licensed Water addon. Three.js and Vite retain their upstream licenses. UI fonts are DM Sans and Libre Caslon Display via Google Fonts, with local fallback fonts.

## Weather panoramas

The following CC0 panoramas live in `public/skies/`. They load on demand and their original file URLs and checksums are recorded in `public/skies/manifest.json`.

| File | Original | Authors | Mode |
| --- | --- | --- | --- |
| `clear.hdr` | [Kloofendal 43d Clear](https://polyhaven.com/a/kloofendal_43d_clear_puresky) | Greg Zaal | Clear |
| `golden.hdr` | [Kloppenheim 06 Pure Sky](https://polyhaven.com/a/kloppenheim_06_puresky) | Greg Zaal; sky edits by Jarod Guest | Golden |
| `night.hdr` | [Qwantani Night](https://polyhaven.com/a/qwantani_night_puresky) | Greg Zaal; processing by Jarod Guest | Aurora |

Storm mode reuses `public/textures/sky.hdr`. Rain, aurora curtains and additional stars are generated in shaders. All modes adjust exposure and lighting for this scene; the sky photographs were not captured at Skógafoss.
