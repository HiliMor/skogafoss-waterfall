import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { terrainMaterial, coverGeometry } from './materials.js';

export function randomGenerator(seed = 815) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const perlin = new ImprovedNoise();
export function noise(x, y) { return perlin.noise(x, y, 13.73) * .5 + .5; }
export function fbm(x, y) { return noise(x,y)*.57 + noise(x*2.03+3,y*2.03)*.28 + noise(x*4.17,y*4.17+6)*.15; }
export const smooth = (a,b,x) => THREE.MathUtils.smoothstep(x,a,b);
export function surface(nx, ny, point, reverse=false) {
  const p=[],uv=[],idx=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){p.push(...point(i/nx,j/ny));uv.push(i/nx,j/ny);}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1; reverse?idx.push(a,c,b,b,c,d):idx.push(a,b,c,b,d,c);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
export const noiseGLSL = `
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);}
float f2(vec2 p){return .57*n2(p)+.28*n2(p*2.03+3.)+.15*n2(p*4.17+6.);}
`;

// Metres, with the fall at the origin and downstream toward +Z.
// The wider landscape is composed, not surveyed terrain.
export const cliffHeight = x => 60 + smooth(13, 45, Math.abs(x)) * (9 + 8 * fbm(x * .019, 8)) + smooth(110, 700, Math.abs(x)) * (30 + 35 * fbm(x * .01, 2));
export function cliffFront(x, y) {
  const flank = smooth(12, 30, Math.abs(x));
  const folds = (fbm(x * .085, y * .085) - .5) * 10;
  const ledges = (noise(x * .14, Math.floor(y / 5.8)) - .5) * 2.6;
  return -3 + flank * (16 + 7 * Math.sin(x * .035) + 8 * (1 - y / cliffHeight(x)) + folds + ledges) - Math.max(0, Math.abs(x) - 160) ** 1.25 * .18;
}
export const riverCenter = z => -3 + Math.sin(z * .014) * (13 + Math.max(0, z) * .065);
export const riverWidth = z => 16 + Math.max(0, z) * .021 + Math.sin(z * .029) * 2;
export const upperRiverCenter = z => 34 * Math.sin(-z * .004) * smooth(0, 180, -z) + 12 * Math.sin(-z * .012) * smooth(0, 70, -z);
export const upperRiverWidth = z => 12.5 + smooth(20, 800, -z) * 6 + Math.sin(-z * .015) * 2 * smooth(0, 30, -z);
export const upperRiverHeight = z => 60.1 + Math.max(0, -z) * .075;
export function groundHeight(x, z) {
  const edge = Math.abs(x - riverCenter(z)) - riverWidth(z);
  const banks = smooth(-2, 6, edge) * (2.4 + fbm(x * .13, z * .13) * 1.7);
  const field = smooth(14, 80, edge) * (1.5 + fbm(x * .021, z * .023) * 6);
  const valley = smooth(110, 800, Math.abs(x)) * (8 + fbm(x * .006, z * .008) * 45);
  return -1.3 + banks + field + valley * smooth(30, 140, edge);
}
export function plateauHeight(x, z) {
  const distance = Math.max(0, cliffFront(x, cliffHeight(x)) - z);
  const hills = smooth(0, 32, distance) * ((fbm(x * .009, z * .012) - .35) * 62 + distance * .06) + smooth(1000, 1900, distance) * fbm(x * .002, z * .002) * 260;
  const channel = 1 - smooth(upperRiverWidth(z) - 1, upperRiverWidth(z) + 16, Math.abs(x - upperRiverCenter(z)));
  return THREE.MathUtils.lerp(cliffHeight(x) + hills, upperRiverHeight(z) - .7, channel);
}
function hillsideHeight(x, z) {
  const front = cliffFront(x, cliffHeight(x));
  const v = THREE.MathUtils.clamp((z - front) / 125, 0, 1);
  const slope = (1 - v) ** 1.65 * smooth(28, 51, x) * (1 - smooth(140, 400, x));
  return THREE.MathUtils.lerp(groundHeight(x, z), cliffHeight(x), slope) + (fbm(x * .15, z * .12) - .5) * 1.6 * Math.sin(v * Math.PI);
}
export function terrainHeightAt(x, z) {
  if (z < cliffFront(x, cliffHeight(x))) return plateauHeight(x, z);
  if (x > 28 && x < 400) return Math.max(groundHeight(x, z), hillsideHeight(x, z));
  return groundHeight(x, z);
}
// Concentrate tessellation around the waterfall while extending the horizon.
const spread = (u, extent, power = 1.65) => Math.sign(u - .5) * Math.abs(2 * u - 1) ** power * extent;

export function createTerrain(scene, quality, assets) {
  const rand = randomGenerator(1909), mat = terrainMaterial(assets), gravelMat = terrainMaterial(assets, true);
  const add = (geometry, material, shadow = false) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; mesh.castShadow = shadow; scene.add(mesh); return mesh;
  };
  const cliff = surface(390, 105, (u, v) => {
    const x = spread(u, 2600, 2.05), y = -1 + v * (cliffHeight(x) + 1);
    return [x, y, cliffFront(x, y)];
  });
  coverGeometry(cliff, (x, y, z) => {
    const wet = (1 - smooth(15, 43, Math.abs(x))) * (1 - smooth(10, 57, y));
    const cover = smooth(.48, 1.02, y / cliffHeight(x) + (fbm(x * .065, y * .10) - .5) * .65) * smooth(12, 22, Math.abs(x));
    return [cover, wet];
  });
  const cliffMesh = add(cliff, mat, true);
  const plateau = surface(340, 180, (u, v) => {
    const x = spread(u, 2600, 2.05), z = cliffFront(x, cliffHeight(x)) - v ** 2 * 4200;
    return [x, plateauHeight(x, z), z];
  });
  coverGeometry(plateau, (x, y, z) => {
    const bank = Math.abs(x - upperRiverCenter(z)) - upperRiverWidth(z);
    return [(.68 + fbm(x * .06, z * .06) * .37) * smooth(-2, 10, bank), 1 - smooth(0, 9, bank)];
  });
  add(plateau, mat);
  const hillside = surface(160, 115, (u, v) => {
    const x = 28 + u * 372, z = cliffFront(x, cliffHeight(x)) + v * 125;
    return [x, hillsideHeight(x, z), z];
  }, true);
  coverGeometry(hillside, (x, y, z) => [.28 + fbm(x * .036, z * .05) * 1.25, 0]);
  add(hillside, mat, true);
  const ground = surface(310, 280, (u, v) => {
    const x = spread(u, 3800, 2.05), z = v < .4 ? -4800 * (1 - v / .4) ** 2 : 3500 * ((v - .4) / .6) ** 2;
    return [x, groundHeight(x, z), z];
  }, true);
  coverGeometry(ground, (x, y, z) => {
    const bank = Math.abs(x - riverCenter(z)) - riverWidth(z);
    return [smooth(13, 47, bank) * (.7 + noise(x * .04, z * .04) * .4), 1 - smooth(0, 11, bank)];
  });
  add(ground, gravelMat);


  const rockGeo = new THREE.IcosahedronGeometry(1, 1), rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), d = .79 + noise(x * 6 + z * 8, y * 7) * .32;
    rp.setXYZ(i, x * d, y * d, z * d);
  }
  rockGeo.computeVertexNormals(); coverGeometry(rockGeo, (x, y) => [smooth(.45, 1, y) * .38, .4]);
  const rockCount = quality === 'low' ? 1100 : 2900;
  const rocks = new THREE.InstancedMesh(rockGeo, mat, rockCount), dummy = new THREE.Object3D();
  for (let i = 0; i < rockCount; i++) {
    const z = rand() ** 1.7 * 660, bankSide = rand() < .5 ? -1 : 1;
    const x = riverCenter(z) + bankSide * (riverWidth(z) + (rand() - .09) * 64);
    let size = .18 + rand() ** 5 * 1.5; if (i < 150) size = .7 + rand() * 2.5;
    dummy.position.set(x, groundHeight(x, z) + size * .23, z);
    dummy.scale.set(size * (.8 + rand() * .9), size * (.42 + rand() * .6), size * (.7 + rand() * .9));
    dummy.rotation.set(rand(), rand() * 6.28, rand()); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.receiveShadow = true; rocks.castShadow = true; scene.add(rocks);
  // Broken outcrops interrupt the broad cliff form and catch grazing light.
  const fragments = new THREE.InstancedMesh(rockGeo, mat, quality === 'low' ? 240 : 520);
  for (let i = 0; i < fragments.count; i++) {
    const x = (rand() < .5 ? -1 : 1) * (17 + rand() ** 1.7 * 205);
    const y = rand() * cliffHeight(x) * .85, z = cliffFront(x, y);
    const s = 1.3 + rand() ** 2 * 4.4;
    dummy.position.set(x, y, z - s * .66); dummy.scale.set(s * (1.2 + rand()), s * (.3 + rand() * .5), s * .78);
    dummy.rotation.set(rand() * .3, rand() * .7, (rand() - .5) * .7); dummy.updateMatrix(); fragments.setMatrixAt(i, dummy.matrix);
  }
  fragments.castShadow = true; fragments.receiveShadow = true; scene.add(fragments);
  const highlandRocks = new THREE.InstancedMesh(rockGeo, mat, quality === 'low' ? 550 : 1900);
  for (let i = 0; i < highlandRocks.count; i++) {
    const z = -8 - rand() ** 1.5 * 1250;
    const x = upperRiverCenter(z) + (rand() < .5 ? -1 : 1) * (upperRiverWidth(z) + (rand() - .15) * 55);
    const s = .17 + rand() ** 4 * 3;
    dummy.position.set(x, plateauHeight(x, z) + s * .22, z); dummy.scale.set(s * 1.2, s * .7, s);
    dummy.rotation.set(rand(), rand() * 6.28, rand()); dummy.updateMatrix(); highlandRocks.setMatrixAt(i, dummy.matrix);
  }
  highlandRocks.receiveShadow = true; scene.add(highlandRocks);

  const pebbleGeo = coverGeometry(new THREE.IcosahedronGeometry(1, 0), () => [0, .35]);
  const pebbles = new THREE.InstancedMesh(pebbleGeo, gravelMat, quality === 'low' ? 2500 : 9500);
  for (let i = 0; i < pebbles.count; i++) {
    const z = rand() ** 1.6 * 320, x = riverCenter(z) + (rand() < .5 ? -1 : 1) * (riverWidth(z) - 1 + rand() * 24);
    const s = .045 + rand() ** 3 * .25;
    dummy.position.set(x, groundHeight(x, z) + s * .24, z); dummy.scale.set(s * 1.5, s * .65, s);
    dummy.rotation.set(rand(), rand() * 6.28, rand()); dummy.updateMatrix(); pebbles.setMatrixAt(i, dummy.matrix);
  }
  pebbles.receiveShadow = true; scene.add(pebbles);

  const wind = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({ color: '#a6a96c', side: THREE.DoubleSide, roughness: 1 });
  grassMat.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = wind;
    shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.x += sin(uWindTime * 1.8 + instanceMatrix[3].x * .31 + instanceMatrix[3].z * .18) * position.y * position.y * .19;`);
  };
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.17,0,0,.1,0,0,.06,.82,0, -.05,0,-.15,.04,0,.16,.08,.65,.03, -.16,0,-.12,.16,0,.12,-.06,.48,.04], 3));
  grassGeo.computeVertexNormals();
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, quality === 'low' ? 5000 : 18000);
  for (let i = 0; i < grass.count; i++) {
    let x, y, z;
    if (i < grass.count * .35) {
      z = -6 - rand() ** 2 * 1000; x = upperRiverCenter(z) + (rand() < .5 ? -1 : 1) * (upperRiverWidth(z) + 8 + rand() * 120);
      if (Math.abs(x - upperRiverCenter(z)) < upperRiverWidth(z) + 6) x += 40;
      y = plateauHeight(x, z);
    } else {
      z = rand() ** 1.7 * 750; x = riverCenter(z) + (rand() < .5 ? -1 : 1) * (riverWidth(z) + 19 + rand() ** 1.7 * 95);
      y = terrainHeightAt(x, z);
    }
    dummy.position.set(x, y - .08, z); dummy.scale.setScalar(.3 + rand() * .65); dummy.rotation.set(0, rand() * 6.28, 0); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, new THREE.Color().setHSL(.18 + rand() * .05, .21 + rand() * .22, .43 + rand() * .2));
  }
  grass.receiveShadow = true; scene.add(grass);
  createStairs(scene); createHikers(scene);
  return { cliff: cliffMesh, rockCount: rockCount + pebbles.count, update(t) { wind.value = t; } };
}

function createStairs(scene){
  // An interpretive version of the path and lookout to the right of the falls.
  const mat=new THREE.MeshStandardMaterial({color:'#756e5e',roughness:1});
  const railMat=new THREE.MeshStandardMaterial({color:'#4b5148',roughness:.8});
  const count=220,steps=new THREE.InstancedMesh(new THREE.BoxGeometry(2,.18,.43),mat,count),d=new THREE.Object3D();
  const path=t=>{const x=123-67*t,z=cliffFront(x,cliffHeight(x))+(1-t)*125;return new THREE.Vector3(x,hillsideHeight(x,z)+.2,z);};
  for(let i=0;i<count;i++){const t=i/(count-1),p=path(t);d.position.copy(p);d.rotation.y=.3;d.updateMatrix();steps.setMatrixAt(i,d.matrix);}steps.receiveShadow=true;scene.add(steps);
  const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.045,1.1,5),railMat,90);let postIndex=0;
  for(const side of [-1,1]){
    const pts=[];
    for(let j=0;j<=44;j++){const p=path(j/44);p.x+=side*1.05;d.position.copy(p).y+=.55;d.rotation.set(0,0,0);d.updateMatrix();posts.setMatrixAt(postIndex++,d.matrix);pts.push(p.add(new THREE.Vector3(0,1.1,0)));}
    const rail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),100,.035,4,false),railMat);scene.add(rail);
  }
  scene.add(posts);const platform=new THREE.Mesh(new THREE.BoxGeometry(7,.35,4),mat);platform.position.copy(path(1));scene.add(platform);
}
function createHikers(scene){
  const positions=[[-26,52,.08],[-28,54,-.3],[25,32,1.2],[42,95,2],[-24,78,.4]];
  const colors=['#cf6c36','#bac2b2','#b39d4f','#718387','#a3573c'];
  positions.forEach(([x,z,rot],i)=>{
    const person=new THREE.Group(),coat=new THREE.MeshStandardMaterial({color:colors[i],roughness:.9}),dark=new THREE.MeshStandardMaterial({color:'#283331'}),skin=new THREE.MeshStandardMaterial({color:'#b7a18a'});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.49,3,5),coat);body.position.y=1.05;person.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.145,7,5),skin);head.position.y=1.63;person.add(head);
    for(const side of [-1,1]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.075,.07,.72,5),dark);leg.position.set(side*.1,.4,0);person.add(leg);const arm=new THREE.Mesh(new THREE.CylinderGeometry(.065,.07,.6,5),coat);arm.position.set(side*.24,1.05,.02);arm.rotation.z=side*.12;person.add(arm);}
    person.position.set(x,terrainHeightAt(x,z),z);person.rotation.y=rot;scene.add(person);
  });
}
