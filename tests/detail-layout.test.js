import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTerrain,stairPosition } from '../src/nature.js';
import { createDetailLayout,terrainSampler,wakePlacement,WATER_LEVEL } from '../src/gpu/detail-layout.js';

const terrain=createTerrain(new THREE.Scene(),'low',{}),height=terrainSampler(terrain.surfaces);
const high=createDetailLayout(terrain.surfaces,'high'),low=createDetailLayout(terrain.surfaces,'low');

test('detail stones are embedded and grass/moss roots follow rendered terrain',()=>{
  for(const s of high.stones){
    assert.ok(Number.isFinite(s.x+s.y+s.z+s.rotation));
    assert.ok(s.y<=height(s.x,s.z));
    assert.ok(s.sx>0&&s.sy>0&&s.sz>0);
  }
  const steps=Array.from({length:75},(_,i)=>stairPosition(i/74));
  for(const s of [...high.tufts,...high.moss]){
    assert.ok(Math.abs(height(s.x,s.z)-s.y)<.07);
    assert.ok(Math.abs(Math.hypot(...s.normal)-1)<1e-6);
    assert.ok(s.normal[1]>=.69);
    assert.ok(steps.every(p=>Math.hypot(p.x-s.x,p.z-s.z)>=2.2));
  }
});

test('the bow of each wake stays centered on its protruding rock on river bends',()=>{
  for(const w of high.wakes){
    const rock=high.stones.find(s=>s.inStream&&s.x===w.x&&s.z===w.z);
    assert.ok(rock);assert.ok(rock.y+rock.sy*.78>WATER_LEVEL);
    const p=wakePlacement(w),bow=new THREE.Vector3(0,0,p.length*.23);
    bow.applyAxisAngle(new THREE.Vector3(0,1,0),p.rotation).add(new THREE.Vector3(p.x,p.y,p.z));
    assert.ok(Math.abs(bow.x-w.x)<1e-6&&Math.abs(bow.z-w.z)<1e-6);
    assert.ok(p.y>WATER_LEVEL&&p.y<WATER_LEVEL+.05);
  }
});

test('lower detail preserves the principal rocks while reducing vegetation and bank stones',()=>{
  assert.deepEqual(high.stones.filter(s=>s.inStream),low.stones.filter(s=>s.inStream));
  assert.deepEqual(high.wakes,low.wakes);
  for(const key of ['stones','tufts','moss'])assert.ok(low[key].length<high[key].length*.6);
});
