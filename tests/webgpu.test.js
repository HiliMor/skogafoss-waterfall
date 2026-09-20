import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionField, COLLISION_GRID, summarizeParticleState } from '../src/gpu/simulation.js';
import { surface } from '../src/nature.js';
import { frameSummary } from '../src/gpu/lab.js';
import { createViews } from '../src/views.js';

const plane = y => surface(1,1,(u,v)=>[-100+200*u,y,-100+200*v]);

test('droplet collisions use the water floor and banks, excluding the overhead plateau',()=>{
  const field=createCollisionField([plane(-2),plane(60),plane(-1)]);
  assert.equal(field.length,COLLISION_GRID.size**2);
  assert.ok(field.every(y=>Math.abs(y-.48)<1e-6));
  const bank=createCollisionField([plane(-2),plane(60),plane(4)]);
  assert.ok(bank.every(y=>y===4));
});

test('GPU readback rejects untouched, non-finite, escaped and malformed state',()=>{
  const blank=new Float32Array(12);
  assert.equal(summarizeParticleState(blank,blank).initialized,false);
  const p=new Float32Array([0,60,2,0, 1,2,11,.1, 4,8,16,2]);
  const v=new Float32Array([0,-8,3,0, 1,4,6,1, 2,1,2,2]);
  const state=summarizeParticleState(p,v);
  assert.deepEqual([state.falling,state.splash,state.mist,state.invalid,state.initialized],[1,1,1,0,true]);
  assert.equal(state.minY,2);assert.equal(state.maxY,60);
  p[0]=NaN;p[5]=100;
  assert.equal(summarizeParticleState(p,v).invalid,2);
  assert.throws(()=>summarizeParticleState(p,new Float32Array(8)),/different shapes/);
});

test('frame timing reports stalls instead of averaging instantaneous FPS',()=>{
  const stats=frameSummary([...Array(19).fill(10),110]);
  assert.equal(stats.fps,1000/15);
  assert.equal(stats.median,10);assert.equal(stats.p95,110);assert.equal(stats.frames,20);
  assert.equal(frameSummary([]),null);
});

test('responsive changes in one renderer cannot alter the other view presets',()=>{
  const a=createViews(),b=createViews();
  a.approach.position[0]=999;a.approach.target[1]=123;
  assert.deepEqual(b.approach.position,[57,37,170]);
  assert.deepEqual(b.approach.target,[0,29,4]);
});
