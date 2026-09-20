import * as THREE from 'three/webgpu';
import { Fn, uv, positionWorld, positionGeometry, vec2, vec3, float, mix, smoothstep, sin, exp } from 'three/tsl';
import { noise, randomGenerator } from '../nature.js';
import { coverGeometry } from '../materials.js';
import { terrainNodeMaterial,grassNodeMaterial } from './materials.js';
import { noise2,fbm2 } from './noise.js';
import { createDetailLayout,wakePlacement,WATER_LEVEL } from './detail-layout.js';

function stoneGeometry(variant){
  const g=new THREE.IcosahedronGeometry(1,variant===0?2:1),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),shape=.88+noise(x*3+variant*7,z*3+y*2)*.19;
    p.setXYZ(i,x*shape,y*shape*(1-.12*Math.abs(x)),z*shape);
  }
  g.computeVertexNormals();
  return coverGeometry(g,(x,y,z)=>[Math.max(0,y-.42)*(.24+noise(x*4,z*4)*.18),.38]);
}

function tuftGeometry(){
  const rand=randomGenerator(592),positions=[],indices=[];
  for(let b=0;b<5;b++){
    const angle=b*2.399,height=.55+rand()*.45,bend=.2+rand()*.3,width=.022+rand()*.025;
    const dx=Math.cos(angle),dz=Math.sin(angle),start=positions.length/3;
    for(let j=0;j<3;j++){
      const t=j/2,w=width*(1-t*.92),r=bend*t*t;
      for(const side of [-1,1])positions.push(dx*r-dz*w*side,height*t,dz*r+dx*w*side);
    }
    for(let j=0;j<2;j++){const a=start+j*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

function mossGeometry(){
  const p=[],index=[],rings=3,segments=9;
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
    const r=j/rings,a=i/segments*Math.PI*2,edge=.88+Math.sin(a*3+.4)*.06+Math.cos(a*5)*.04;
    const x=Math.cos(a)*r*edge,z=Math.sin(a)*r*edge;
    p.push(x,Math.cos(r*Math.PI/2)*.30+(noise(x*5,z*5)-.5)*.075-r*r*.08,z);
  }
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;index.push(a,b,c,b,d,c);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(index);g.computeVertexNormals();return g;
}

export function createLandscapeDetails({scene,quality,surfaces,assets,weather,time}){
  const layout=createDetailLayout(surfaces,quality),dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  const stoneMat=terrainNodeMaterial(assets,false,weather);
  const wet=smoothstep(WATER_LEVEL-.08,WATER_LEVEL+.42,positionWorld.y);
  stoneMat.colorNode=stoneMat.colorNode.mul(mix(.53,1,wet));
  stoneMat.roughnessNode=mix(.29,stoneMat.roughnessNode,wet);
  for(let variant=0;variant<3;variant++){
    const rows=layout.stones.filter(s=>s.variant===variant),mesh=new THREE.InstancedMesh(stoneGeometry(variant),stoneMat,rows.length);
    rows.forEach((s,i)=>{
      dummy.position.set(s.x,s.y,s.z);dummy.scale.set(s.sx,s.sy,s.sz);dummy.rotation.set(0,s.rotation,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,new THREE.Color().setHSL(.14+(i%5)*.015,.045+(i%3)*.015,.68+(i%7)*.025));
    });
    mesh.name=`Embedded stream stones ${variant+1}`;mesh.receiveShadow=true;mesh.castShadow=variant===0;scene.add(mesh);
  }
  const vegetationMat=grassNodeMaterial(time,weather.wind);
  vegetationMat.colorNode=mix(vec3(.065,.11,.025),vec3(.39,.41,.16),smoothstep(0,.95,positionGeometry.y));
  const mossMat=new THREE.MeshStandardNodeMaterial({roughness:1});
  const grain=noise2(positionWorld.xz.mul(16));
  mossMat.colorNode=mix(vec3(.055,.092,.018),vec3(.24,.30,.09),grain.mul(.52).add(.27));
  for(const [name,rows,geometry,material] of [['Clustered bent grass',layout.tufts,tuftGeometry(),vegetationMat],['Low moss cushions',layout.moss,mossGeometry(),mossMat]]){
    const mesh=new THREE.InstancedMesh(geometry,material,rows.length),phases=[];
    rows.forEach((s,i)=>{
      dummy.position.set(s.x,s.y,s.z);dummy.scale.set(s.scale,s.scale*(name==='Low moss cushions'?.75:1),s.scale);
      dummy.quaternion.setFromUnitVectors(up,new THREE.Vector3(...s.normal));dummy.rotateY(s.rotation);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,new THREE.Color().setHSL(s.hue,.18+s.seed*.17,.58+s.seed*.18));
      phases.push(s.x*.31+s.z*.18);
    });
    geometry.setAttribute('aGrassPhase',new THREE.InstancedBufferAttribute(new Float32Array(phases),1));
    mesh.name=name;mesh.receiveShadow=true;scene.add(mesh);
  }
  // A single instanced draw for broken bow foam and downstream V-shaped wakes.
  // All animation uses the same paused clock as the waterfall.
  const wakeMat=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const foam=Fn(()=>{
    const q=vec2(uv().x.sub(.5),uv().y.oneMinus()),t=time.mul(1.2);
    const n=fbm2(vec2(q.x.mul(37),q.y.mul(24).sub(t))),broken=smoothstep(.33,.67,n);
    const bow=exp(q.sub(vec2(0,.23)).mul(vec2(3.8,6)).length().sub(.77).abs().mul(-24));
    const arms=exp(q.x.abs().sub(q.y.sub(.23).mul(.22).add(.17)).abs().mul(-65)).mul(smoothstep(.22,.35,q.y));
    const ripples=sin(q.y.mul(66).sub(t.mul(9)).add(n.mul(8))).mul(.5).add(.5).pow(8);
    return bow.mul(.66).add(arms.mul(.36).add(ripples.mul(.035)).mul(smoothstep(.8,1,q.y).oneMinus())).mul(broken).mul(smoothstep(.015,.09,q.y)).mul(smoothstep(.9,1,q.y).oneMinus());
  })();
  wakeMat.colorNode=vec3(.50,.63,.64).mul(weather.lightColor).mul(weather.light);
  wakeMat.opacityNode=foam.mul(.66);
  const wakeGeo=new THREE.PlaneGeometry(1,1);wakeGeo.rotateX(-Math.PI/2);wakeGeo.translate(0,0,.5);
  const wakes=new THREE.InstancedMesh(wakeGeo,wakeMat,layout.wakes.length);
  layout.wakes.forEach((w,i)=>{
    const p=wakePlacement(w);dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.width,1,p.length);dummy.rotation.set(0,p.rotation,0);dummy.updateMatrix();wakes.setMatrixAt(i,dummy.matrix);
  });
  wakes.name='Foam around stream stones';wakes.renderOrder=3;scene.add(wakes);
  return {layout};
}
