import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { createTerrain, surfaceHeightAt, stairPosition, upperRiverCenter, upperRiverWidth, upperRiverHeight } from '../src/nature.js';
import { waterfallPoint } from '../src/water.js';
import { WEATHER } from '../src/weather.js';

const scene = new THREE.Scene();
const terrain = createTerrain(scene, 'low', {});

test('surface sampling matches the actual rendered triangles', () => {
  const ray = new THREE.Raycaster();
  for (const geometry of terrain.surfaces) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld();
    const index = geometry.index, p = geometry.attributes.position;
    for (let i = 0; i < index.count - 3; i += Math.floor(index.count / 51 / 3) * 3) {
      const ids = [index.getX(i),index.getX(i+1),index.getX(i+2)];
      const x = ids.reduce((s,j)=>s+p.getX(j),0)/3, z = ids.reduce((s,j)=>s+p.getZ(j),0)/3;
      ray.set(new THREE.Vector3(x,2000,z),new THREE.Vector3(0,-1,0));
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit);
      assert.ok(Math.abs(surfaceHeightAt(geometry,x,z)-hit.point.y)<.002);
    }
  }
});

test('water is continuous around both sections of the curved lip', () => {
  for (const v of [.22,.30]) for (let u=0;u<=1;u+=.05) {
    const a=new THREE.Vector3(...waterfallPoint(u,v-1e-7)),b=new THREE.Vector3(...waterfallPoint(u,v+1e-7));
    assert.ok(a.distanceTo(b)<.001);
  }
  for(const u of [0,.25,.5,.75,1]) {
    const p=waterfallPoint(u,0);
    assert.equal(p[2],-36);
    assert.equal(p[1],upperRiverHeight(-36));
    assert.equal(p[0],upperRiverCenter(-36)+(u-.5)*upperRiverWidth(-36)*2);
  }
});

test('ground stones are embedded in the sampled terrain', () => {
  const matrix=new THREE.Matrix4(),center=new THREE.Vector3();
  for(const name of ['Riverbank stones','Highland stones','Riverbank pebbles']) {
    const rocks=scene.getObjectByName(name);assert.ok(rocks);
    for(let i=0;i<rocks.count;i+=7) {
      rocks.getMatrixAt(i,matrix);center.setFromMatrixPosition(matrix);
      const surface=Math.max(...terrain.surfaces.map(g=>surfaceHeightAt(g,center.x,center.z)??-Infinity));
      assert.ok(Number.isFinite(surface));
      assert.ok(center.y<=surface+.0002,`${name} ${i} is grounded`);
    }
  }
});

test('visitors stand on the stair treads and lookout deck', () => {
  const people=scene.getObjectByName('Visitors on the riverbed, stairs and overlook');
  assert.equal(people.userData.feet.length,16);
  [24,49,55,92,131,166,196].forEach((step,i)=>assert.ok(Math.abs(people.userData.feet[i+5][1]-stairPosition(step/219).y-.09)<.0001));
  for(const p of people.userData.feet.slice(-4))assert.ok(Math.abs(p[1]-stairPosition(1).y-.175)<.0001);
});

test('all generated geometry and instance transforms are finite', () => {
  scene.traverse(o=>{
    if(o.geometry)for(const a of Object.values(o.geometry.attributes))assert.ok(a.array.every(Number.isFinite));
    if(o.isInstancedMesh)assert.ok(o.instanceMatrix.array.every(Number.isFinite));
  });
});

test('every weather panorama is local and matches its source checksum', () => {
  for(const folder of ['textures','skies']) {
    const base=new URL(`../public/${folder}/`,import.meta.url);
    const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base)));
    for(const f of manifest.files)assert.equal(crypto.createHash('md5').update(fs.readFileSync(new URL(f.file,base))).digest('hex'),f.md5);
  }
  assert.equal(Object.keys(WEATHER).length,4);
  assert.equal(WEATHER.storm.rain,1);
  assert.equal(WEATHER.aurora.aurora,1);
});
