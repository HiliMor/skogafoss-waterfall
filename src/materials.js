import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Local CC0 photographs. See ASSETS.md for authors, originals and license.
export async function loadLandscapeAssets(renderer, onProgress) {
  const loader = new THREE.TextureLoader();
  const assets = {};
  let loaded = 0;
  const jobs = ['dark_rock', 'aerial_grass_rock', 'river_small_rocks'].flatMap(name =>
    ['color', 'normal', 'arm'].map(async kind => {
      const texture = await loader.loadAsync(`${import.meta.env.BASE_URL}textures/${name}-${kind}.jpg`);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (kind === 'color') texture.colorSpace = THREE.SRGBColorSpace;
      assets[`${name}-${kind}`] = texture;
      onProgress(++loaded, 10);
    })
  );
  jobs.push(new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}textures/sky.hdr`).then(sky => {
    sky.mapping = THREE.EquirectangularReflectionMapping;
    assets.sky = sky;
    onProgress(++loaded, 10);
  }));
  await Promise.all(jobs);
  return assets;
}

export function terrainMaterial(assets, gravel = false, weather) {
  const base = gravel ? 'river_small_rocks' : 'dark_rock';
  const mat = new THREE.MeshStandardMaterial({ roughness: .95, envMapIntensity: .42 });
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      uWeatherWet: weather?.wetness ?? {value:0},
      uRock: { value: assets[`${base}-color`] },
      uRockNormal: { value: assets[`${base}-normal`] },
      uRockArm: { value: assets[`${base}-arm`] },
      uTurf: { value: assets['aerial_grass_rock-color'] },
      uTurfNormal: { value: assets['aerial_grass_rock-normal'] },
      uTurfArm: { value: assets['aerial_grass_rock-arm'] },
      uTile: { value: gravel ? .30 : .14 },
      uRockTint: { value: new THREE.Color(gravel ? '#818c91' : '#aaaeb1') }
    });
    shader.vertexShader = `attribute float aCover; attribute float aWetness;
      varying vec3 vNaturePosition; varying vec3 vNatureNormal;
      varying float vCover; varying float vWetness;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 natureP = vec4(transformed, 1.);
      vec3 natureN = objectNormal;
      #ifdef USE_INSTANCING
        natureP = instanceMatrix * natureP;
        natureN = mat3(instanceMatrix) * natureN;
      #endif
      vNaturePosition = (modelMatrix * natureP).xyz;
      vNatureNormal = normalize(mat3(modelMatrix) * natureN);
      vCover = aCover; vWetness = aWetness;`);
    shader.fragmentShader = `
      varying vec3 vNaturePosition; varying vec3 vNatureNormal;
      varying float vCover; varying float vWetness;
      uniform sampler2D uRock, uRockNormal, uRockArm, uTurf, uTurfNormal, uTurfArm;
      uniform float uTile, uWeatherWet; uniform vec3 uRockTint;
      float materialHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float materialNoise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(materialHash(i),materialHash(i+vec2(1.,0.)),f.x),mix(materialHash(i+vec2(0.,1.)),materialHash(i+1.),f.x),f.y);
      }
      vec3 noTile(sampler2D tex, vec2 p) {
        float cell = materialNoise(p * .24) * 8.;
        float i = floor(cell), f = fract(cell);
        vec2 a = sin(vec2(3.,7.) * (i + 1.)) * 3.;
        vec2 b = sin(vec2(3.,7.) * (i + 2.)) * 3.;
        return mix(texture2D(tex,p+a).rgb, texture2D(tex,p+b).rgb, smoothstep(.15,.85,f));
      }
      vec3 triColor(sampler2D tex, vec3 p, vec3 w) {
        return noTile(tex,p.zy)*w.x + noTile(tex,p.xz)*w.y + noTile(tex,p.xy)*w.z;
      }
      vec3 triSample(sampler2D tex, vec3 p, vec3 w) {
        return texture2D(tex, p.zy).rgb * w.x + texture2D(tex, p.xz).rgb * w.y + texture2D(tex, p.xy).rgb * w.z;
      }
      vec3 triNormal(sampler2D tex, vec3 p, vec3 w) {
        vec3 x = noTile(tex, p.zy) * 2. - 1.;
        vec3 y = noTile(tex, p.xz) * 2. - 1.;
        vec3 z = noTile(tex, p.xy) * 2. - 1.;
        return vec3(0., x.y, x.x) * w.x + vec3(y.x, 0., y.y) * w.y + vec3(z.x, z.y, 0.) * w.z;
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 natureWeights = pow(abs(normalize(vNatureNormal)), vec3(4.));
      natureWeights /= max(.001, dot(natureWeights, vec3(1.)));
      vec3 rockP = vNaturePosition * uTile;
      vec3 turfP = vNaturePosition * .061;
      vec3 rock = triColor(uRock, rockP, natureWeights) * uRockTint;
      vec3 turf = triColor(uTurf, turfP, natureWeights) * vec3(.63, .87, .40);
      float coverage = smoothstep(.08, .9, vCover);
      vec3 arm = mix(triSample(uRockArm, rockP, natureWeights), triSample(uTurfArm, turfP, natureWeights), coverage);
      diffuseColor.rgb *= mix(rock, turf, coverage) * (.8 + .32 * materialNoise(vNaturePosition.xz * .07 + vNaturePosition.y * .1)) * mix(.72, 1., arm.r);
      diffuseColor.rgb *= 1. - clamp(vWetness + uWeatherWet * .6, 0., 1.) * .37;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(arm.g * .94 - (vWetness + uWeatherWet * .55) * .26, .25, 1.);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 textureNormal = mix(triNormal(uRockNormal, rockP, natureWeights), triNormal(uTurfNormal, turfP, natureWeights), coverage);
      normal = normalize(normal + mat3(viewMatrix) * textureNormal * .38);`);
  };
  mat.customProgramCacheKey = () => `landscape-pbr-${base}-v2`;
  return mat;
}

export function coverGeometry(geometry, sample) {
  const p = geometry.attributes.position, cover = [], wet = [];
  for (let i = 0; i < p.count; i++) {
    const values = sample(p.getX(i), p.getY(i), p.getZ(i));
    cover.push(values[0]); wet.push(values[1] || 0);
  }
  geometry.setAttribute('aCover', new THREE.Float32BufferAttribute(cover, 1));
  geometry.setAttribute('aWetness', new THREE.Float32BufferAttribute(wet, 1));
  return geometry;
}
