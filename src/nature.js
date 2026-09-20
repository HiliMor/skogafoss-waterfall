import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();g.userData.grid={nx,ny};return g;
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
// Sample the rendered triangles rather than the continuous height function. This
// matters at coarse grid cells: using the latter left stones suspended above them.
export function surfaceHeightAt(g, x, z) {
  const { nx, ny } = g.userData.grid, p = g.attributes.position, stride = nx + 1;
  if (x < p.getX(0) || x > p.getX(nx)) return undefined;
  let lo = 0, hi = nx;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.getX(m) > x) hi = m; else lo = m; }
  const i = Math.min(lo, nx - 1), f = (x - p.getX(i)) / (p.getX(i + 1) - p.getX(i));
  const rowZ = j => THREE.MathUtils.lerp(p.getZ(j * stride + i), p.getZ(j * stride + i + 1), f);
  const ascending = rowZ(ny) > rowZ(0), first = rowZ(0), last = rowZ(ny);
  if (z < Math.min(first,last) || z > Math.max(first,last)) return undefined;
  lo = 0; hi = ny;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if ((rowZ(m) > z) === ascending) hi = m; else lo = m; }
  const a = Math.min(lo,ny - 1) * stride + i, b = a + 1, c = a + stride, d = c + 1;
  const interpolate = (a,b,c) => {
    const ax=p.getX(a),az=p.getZ(a),bx=p.getX(b),bz=p.getZ(b),cx=p.getX(c),cz=p.getZ(c);
    const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
    const wa=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det, wb=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det;
    return {inside:wa>=-1e-5&&wb>=-1e-5&&wa+wb<=1.00001, y:wa*p.getY(a)+wb*p.getY(b)+(1-wa-wb)*p.getY(c)};
  };
  const firstTriangle = interpolate(a,b,c);
  return firstTriangle.inside ? firstTriangle.y : interpolate(b,d,c).y;
}

// Concentrate tessellation around the waterfall while extending the horizon.
const spread = (u, extent, power = 1.65) => Math.sign(u - .5) * Math.abs(2 * u - 1) ** power * extent;

export function createTerrain(scene, quality, assets, weather) {
  const rand = randomGenerator(1909), mat = terrainMaterial(assets, false, weather), gravelMat = terrainMaterial(assets, true, weather);
  const add = (geometry, material, shadow = false) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; mesh.castShadow = shadow; scene.add(mesh); return mesh;
  };
  const cliff = surface(390, 105, (u, v) => {
    const x = spread(u, 2600, 2.05);
    const lip = Math.min(cliffHeight(x), plateauHeight(x, cliffFront(x,cliffHeight(x))));
    const y = -1 + v * (lip + 1);
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


  const rockGeo = new THREE.IcosahedronGeometry(1, 2), rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), d = .79 + noise(x * 6 + z * 8, y * 7) * .32;
    rp.setXYZ(i, x * d, y * d, z * d);
  }
  rockGeo.computeVertexNormals(); coverGeometry(rockGeo, (x, y) => [smooth(.45, 1, y) * .38, .4]);
  const rockCount = quality === 'low' ? 850 : 2100;
  const terrainMeshes = [ground, plateau, hillside];
  const renderedHeight = (x,z) => Math.max(...terrainMeshes.map(g=>surfaceHeightAt(g,x,z) ?? -Infinity));
  const rocks = new THREE.InstancedMesh(rockGeo, mat, rockCount), dummy = new THREE.Object3D();
  for (let i = 0; i < rockCount; i++) {
    const z = rand() ** 1.7 * 660, bankSide = rand() < .5 ? -1 : 1;
    const x = riverCenter(z) + bankSide * (riverWidth(z) + (rand() - .09) * 64);
    let size = .10 + rand() ** 5 * 1.1; if (i < 70) size = .6 + rand() * 1.5;
    dummy.position.set(x, renderedHeight(x, z) - size * .12, z);
    dummy.scale.set(size * (.8 + rand() * .9), size * (.42 + rand() * .6), size * (.7 + rand() * .9));
    dummy.rotation.set(rand() * .22, rand() * 6.28, rand() * .18); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.name='Riverbank stones'; rocks.receiveShadow = true; rocks.castShadow = true; scene.add(rocks);
  // Rock relief belongs to the cliff surface. Separate decorative cliff stones
  // were removed because their silhouettes read as unsupported floating objects.
  const highlandRocks = new THREE.InstancedMesh(rockGeo, mat, quality === 'low' ? 350 : 950);
  for (let i = 0; i < highlandRocks.count; i++) {
    const z = -8 - rand() ** 1.5 * 1250;
    const x = upperRiverCenter(z) + (rand() < .5 ? -1 : 1) * (upperRiverWidth(z) + (rand() - .15) * 55);
    const s = .10 + rand() ** 4 * 1.45;
    dummy.position.set(x, renderedHeight(x, z) - s * .16, z); dummy.scale.set(s * 1.2, s * .7, s);
    dummy.rotation.set(rand() * .2, rand() * 6.28, rand() * .2); dummy.updateMatrix(); highlandRocks.setMatrixAt(i, dummy.matrix);
  }
  highlandRocks.name='Highland stones'; highlandRocks.receiveShadow = true; scene.add(highlandRocks);

  const pebbleGeo = coverGeometry(new THREE.IcosahedronGeometry(1, 0), () => [0, .35]);
  const pebbles = new THREE.InstancedMesh(pebbleGeo, gravelMat, quality === 'low' ? 2500 : 9500);
  for (let i = 0; i < pebbles.count; i++) {
    const z = rand() ** 1.6 * 320, x = riverCenter(z) + (rand() < .5 ? -1 : 1) * (riverWidth(z) - 1 + rand() * 24);
    const s = .045 + rand() ** 3 * .25;
    dummy.position.set(x, renderedHeight(x, z) - s * .12, z); dummy.scale.set(s * 1.5, s * .65, s);
    dummy.rotation.set(rand() * .2, rand() * 6.28, rand() * .2); dummy.updateMatrix(); pebbles.setMatrixAt(i, dummy.matrix);
  }
  pebbles.name='Riverbank pebbles'; pebbles.receiveShadow = true; scene.add(pebbles);

  const wind = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({ color: '#a6a96c', side: THREE.DoubleSide, roughness: 1 });
  grassMat.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = wind; shader.uniforms.uWindStrength = weather?.wind ?? {value:.3};
    shader.vertexShader = 'uniform float uWindTime; uniform float uWindStrength;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.x += sin(uWindTime * 1.8 + instanceMatrix[3].x * .31 + instanceMatrix[3].z * .18) * position.y * position.y * (.10 + uWindStrength * .4);`);
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
    dummy.position.set(x, renderedHeight(x,z) - .08, z); dummy.scale.setScalar(.3 + rand() * .65); dummy.rotation.set(0, rand() * 6.28, 0); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, new THREE.Color().setHSL(.18 + rand() * .05, .21 + rand() * .22, .43 + rand() * .2));
  }
  grass.receiveShadow = true; scene.add(grass);
  createStairs(scene); createHikers(scene,renderedHeight);
  return { cliff: cliffMesh, rockCount: rockCount + pebbles.count, surfaces:terrainMeshes, update(t) { wind.value = t; } };
}

export function stairPosition(t) {
  const x=123-67*t,z=cliffFront(x,cliffHeight(x))+(1-t)*125;
  return new THREE.Vector3(x,hillsideHeight(x,z)+.2,z);
}

function createStairs(scene){
  // An interpretive version of the path and lookout to the right of the falls.
  const mat=new THREE.MeshStandardMaterial({color:'#756e5e',roughness:1});
  const railMat=new THREE.MeshStandardMaterial({color:'#4b5148',roughness:.8});
  const count=220,steps=new THREE.InstancedMesh(new THREE.BoxGeometry(2,.18,.43),mat,count),d=new THREE.Object3D();
  const path=stairPosition;
  for(let i=0;i<count;i++){const t=i/(count-1),p=path(t);d.position.copy(p);d.rotation.y=.3;d.updateMatrix();steps.setMatrixAt(i,d.matrix);}steps.receiveShadow=true;scene.add(steps);
  const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.045,1.1,5),railMat,90);let postIndex=0;
  for(const side of [-1,1]){
    const pts=[];
    for(let j=0;j<=44;j++){const p=path(j/44);p.x+=side*1.05;d.position.copy(p).y+=.55;d.rotation.set(0,0,0);d.updateMatrix();posts.setMatrixAt(postIndex++,d.matrix);pts.push(p.add(new THREE.Vector3(0,1.1,0)));}
    const rail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),100,.035,4,false),railMat);scene.add(rail);
  }
  scene.add(posts);const platform=new THREE.Mesh(new THREE.BoxGeometry(7,.35,4),mat);platform.position.copy(path(1));scene.add(platform);
  // The overlook has its own guardrail and visitors share its exact deck height.
  for(const side of [-1,1]){
    const rail=new THREE.Mesh(new THREE.BoxGeometry(6.8,.055,.055),railMat);rail.position.copy(path(1)).add(new THREE.Vector3(0,1.12,side*1.85));scene.add(rail);
    for(const x of [-3.2,0,3.2]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1.1,5),railMat);post.position.copy(path(1)).add(new THREE.Vector3(x,.65,side*1.85));scene.add(post);}
  }
}
function createHikers(scene, renderedHeight){
  const positions=[[-26,52,.08],[-28,54,-.3],[25,32,1.2],[42,95,2],[-24,78,.4]].map(([x,z,rotation])=>({p:new THREE.Vector3(x,renderedHeight(x,z),z),rotation}));
  for(const step of [24,49,55,92,131,166,196]) positions.push({p:stairPosition(step/219).add(new THREE.Vector3(step%2 ? -.4 : .35,.09,0)),rotation:step%2 ? -.5 : 2.6});
  for(const [x,z] of [[-2.6,-1.25],[-1.4,-1.3],[1.5,.6],[2.6,1.1]]) positions.push({p:stairPosition(1).add(new THREE.Vector3(x,.175,z)),rotation:-1.5});
  const colors=['#d87534','#c4d1ba','#c9ae4e','#597f97','#a3483c','#cad3d4'];
  const dark=new THREE.MeshStandardMaterial({color:'#263235',roughness:.9}),skin=new THREE.MeshStandardMaterial({color:'#c6a58a'});
  const pieces=[];
  positions.forEach(({p,rotation},i)=>{
    const person=new THREE.Group();person.name=`Visitor ${i+1}`;
    const coat=new THREE.MeshStandardMaterial({color:colors[i%colors.length],roughness:.9});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.49,3,6),coat);body.position.y=1.04;person.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.145,8,6),skin);head.position.y=1.6;person.add(head);
    const hat=new THREE.Mesh(new THREE.SphereGeometry(.15,8,4,0,Math.PI*2,0,Math.PI*.55),coat);hat.position.y=1.64;person.add(hat);
    const pack=new THREE.Mesh(new THREE.BoxGeometry(.29,.43,.18),dark);pack.position.set(0,1.04,-.23);person.add(pack);
    for(const side of [-1,1]){
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.072,.065,.71,6),dark);leg.position.set(side*.11,.39,0);person.add(leg);
      const boot=new THREE.Mesh(new THREE.BoxGeometry(.15,.13,.26),dark);boot.position.set(side*.11,.065,.04);person.add(boot);
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.065,.07,.59,6),coat);arm.position.set(side*.24,1.05,.02);arm.rotation.z=side*.14;
      if(i>=12){arm.rotation.x=-1.05;arm.position.z=.14;arm.position.y=1.18;}person.add(arm);
    }
    person.position.copy(p);person.rotation.y=rotation;person.updateMatrixWorld(true);
    person.traverse(o=>{if(o.isMesh){const g=o.geometry.clone().applyMatrix4(o.matrixWorld),c=o.material.color,a=[];for(let j=0;j<g.attributes.position.count;j++)a.push(c.r,c.g,c.b);g.setAttribute('color',new THREE.Float32BufferAttribute(a,3));pieces.push(g);}});
  });
  const visitors=new THREE.Mesh(mergeGeometries(pieces),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88}));
  visitors.name='Visitors on the riverbed, stairs and overlook';visitors.userData.feet=positions.map(v=>v.p.toArray());visitors.castShadow=true;visitors.receiveShadow=true;scene.add(visitors);for(const g of pieces)g.dispose();
}
