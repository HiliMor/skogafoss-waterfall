import * as THREE from 'three/webgpu';
import { Fn, If, uniform, instancedArray, instanceIndex, hash, vec2, vec3, vec4, ivec2, float, sin, exp, mix, smoothstep, textureLoad, uv } from 'three/tsl';
import { surfaceHeightAt } from '../nature.js';
import { fbm2 } from './noise.js';

export const SIMULATION_STEP=1/120;
export const COLLISION_GRID={size:96,minX:-64,maxX:64,minZ:-8,maxZ:88};

export function createCollisionField(surfaces){
  const {size,minX,maxX,minZ,maxZ}=COLLISION_GRID,data=new Float32Array(size*size);
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const x=minX+(maxX-minX)*i/(size-1),z=minZ+(maxZ-minZ)*j/(size-1);
    // Only the riverbed and front slope take impacts; the plateau lies above
    // falling water and must not behave as a horizontal collision lid.
    data[j*size+i]=Math.max(.48,surfaceHeightAt(surfaces[0],x,z)??-2,surfaceHeightAt(surfaces[2],x,z)??-2);
  }
  return data;
}

export function createSpraySimulation({scene,renderer,quality,weather,time,surfaces}){
  const count=quality==='low'?12288:24576;
  const positions=instancedArray(count,'vec4'),velocities=instancedArray(count,'vec4');
  const dt=uniform(SIMULATION_STEP),windScale=uniform(1);
  const {size,minX,maxX,minZ,maxZ}=COLLISION_GRID;
  const heightTexture=new THREE.DataTexture(createCollisionField(surfaces),size,size,THREE.RedFormat,THREE.FloatType);
  heightTexture.magFilter=heightTexture.minFilter=THREE.NearestFilter;heightTexture.needsUpdate=true;
  const rnd=hash(instanceIndex.add(7)),rnd2=hash(instanceIndex.add(103)),rnd3=hash(instanceIndex.add(491));
  const spawn=Fn(([p,v,age])=>{
    const u=rnd.mul(2).sub(1),speed=rnd2.mul(2.5).add(6.5);
    p.assign(vec4(u.mul(12.2).add(sin(u.mul(8)).mul(.22)),float(60.10).sub(speed.mul(age)).sub(age.pow(2).mul(4.905)),age.mul(3.6).add(1.8).add(rnd3.mul(.6)),age));
    v.assign(vec4(u.mul(1.0),speed.negate().sub(age.mul(9.81)),3.6,0));
  },'void');
  const initialize=Fn(()=>{spawn(positions.element(instanceIndex),velocities.element(instanceIndex),rnd3.mul(2.7));})().compute(count).setName('Seed Skogafoss water');
  const update=Fn(()=>{
    const p=positions.element(instanceIndex),v=velocities.element(instanceIndex);
    const w=weather.wind.mul(windScale),gust=fbm2(p.xz.mul(.08).add(time.mul(.15))).sub(.5);
    p.w.addAssign(dt);
    If(v.w.equal(0),()=>{
      v.y.subAssign(dt.mul(9.81));
      v.x.addAssign(dt.mul(w.mul(1.5).add(sin(p.y.mul(.3).add(time.mul(2)).add(rnd.mul(30))).mul(.7))));
      v.z.addAssign(dt.mul(gust.mul(1.2)));
    }).ElseIf(v.w.equal(1),()=>{
      v.y.subAssign(dt.mul(12));v.xz.mulAssign(exp(dt.mul(-.5)));
    }).Else(()=>{
      const target=vec3(w.mul(5).add(gust.mul(2)),rnd2.add(.2),rnd3.mul(2).add(1));
      v.xyz.assign(mix(v.xyz,target,float(1).sub(exp(dt.mul(-1.5)))));
    });
    p.xyz.addAssign(v.xyz.mul(dt));
    const grid=vec2(p.x.sub(minX).div(maxX-minX),p.z.sub(minZ).div(maxZ-minZ)).clamp(0,1).mul(size-1);
    const ground=textureLoad(heightTexture,ivec2(grid)).r;
    If(v.w.equal(0).and(p.y.lessThanEqual(ground.add(.12))).and(p.y.lessThan(25)),()=>{
      p.y.assign(ground.add(.18));p.w.assign(0);
      v.xyz.assign(vec3(p.x.mul(.22).add(rnd2.sub(.5).mul(5)),rnd3.mul(6).add(3),rnd.mul(6).add(3)));
      v.w.assign(instanceIndex.mod(8).equal(0).select(2,1));
    });
    // Short-lived splash droplets recycle; a smaller fraction becomes drifting
    // mist. All state remains resident in GPU storage buffers between frames.
    const expired=v.w.equal(1).and(p.w.greaterThan(.75)).or(v.w.equal(2).and(p.w.greaterThan(3.8)));
    const escaped=p.y.lessThan(-2).or(p.y.greaterThan(80)).or(p.x.abs().greaterThan(63)).or(p.z.greaterThan(86)).or(p.w.greaterThan(7));
    If(expired.or(escaped),()=>spawn(p,v,float(0)));
  })().compute(count).setName('Gravity, wind, impact and spray');

  const pos=positions.toAttribute(),vel=velocities.toAttribute();
  const seed=hash(instanceIndex.add(631)).toVarying('spraySeed'),phase=vel.w;
  const material=new THREE.SpriteNodeMaterial({transparent:true,depthWrite:false});
  material.positionNode=pos.xyz;
  const depth=float(60).sub(pos.y).div(60).clamp(),aerated=seed.greaterThan(.88);
  const dropSize=aerated.select(seed.mul(.9).add(.3).mul(depth.add(.35)),seed.mul(.12).add(.04));
  material.scaleNode=phase.equal(2).select(vec2(pos.w.mul(1.35).add(1.2)),vec2(dropSize,dropSize.mul(aerated.select(1.25,1.8))));
  const q=uv().sub(.5),grain=fbm2(q.mul(9).add(seed.mul(71)));
  const silhouette=smoothstep(.08,.5,q.length().add(grain.sub(.5).mul(.11))).oneMinus();
  const mistFade=sin(pos.w.div(3.8).clamp().mul(Math.PI)).mul(.036).mul(weather.spray);
  const dropFade=smoothstep(0,.08,pos.w).mul(phase.equal(1).select(smoothstep(.35,.75,pos.w).oneMinus(),1)).mul(aerated.select(.20,.10));
  material.opacityNode=silhouette.mul(phase.equal(2).select(mistFade,dropFade)).mul(grain.mul(.4).add(.6));
  material.colorNode=mix(vec3(.40,.53,.59),vec3(.89,.95,.98),grain.mul(.25).add(q.y.mul(.25)).add(.62).clamp()).mul(weather.lightColor).mul(weather.light);
  const particles=new THREE.Sprite(material);particles.count=count;particles.frustumCulled=false;particles.name='WebGPU gravity and impact spray';scene.add(particles);
  let enabled=true,dispatches=0;
  renderer.compute(initialize);
  return{
    count,windScale,particles,
    setEnabled(value){enabled=value;particles.visible=value;},
    get enabled(){return enabled;},
    step(){if(enabled){renderer.compute(update);dispatches++;}},
    async inspect(){
      // Queue both readbacks together so they describe the same simulation step.
      const step=dispatches;
      const [raw,vraw]=await Promise.all([renderer.getArrayBufferAsync(positions.value),renderer.getArrayBufferAsync(velocities.value)]);
      return {...summarizeParticleState(new Float32Array(raw),new Float32Array(vraw)),dispatches:step};
    }
  };
}

// This readback is opt-in; the frame loop never copies particle state to the CPU.
export function summarizeParticleState(p,v){
  const count=p.length/4;let falling=0,splash=0,mist=0,invalid=0,minY=Infinity,maxY=-Infinity;
  if(p.length!==v.length||p.length%4!==0)throw new Error('Particle buffers have different shapes.');
  for(let i=0;i<count;i++){
    const j=i*4;
    const finite=Number.isFinite(p[j]+p[j+1]+p[j+2]+p[j+3]+v[j]+v[j+1]+v[j+2]+v[j+3]);
    if(!finite||p[j+1]<-3||p[j+1]>81||Math.abs(p[j])>65||p[j+2]>90||p[j+3]<0)invalid++;
    minY=Math.min(minY,p[j+1]);maxY=Math.max(maxY,p[j+1]);
    if(v[j+3]===0)falling++;else if(v[j+3]===1)splash++;else if(v[j+3]===2)mist++;else invalid++;
  }
  // Finite all-zero buffers can still mean an initialization shader did no work.
  const initialized=count>0&&maxY-minY>10;
  return {count,falling,splash,mist,invalid,minY,maxY,initialized};
}
