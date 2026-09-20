import { Vector3 } from 'three';
import { randomGenerator, riverCenter, riverWidth, upperRiverCenter, upperRiverWidth, surfaceHeightAt, stairPosition, noise } from '../nature.js';

export const WATER_LEVEL=.48;

export function terrainSampler(surfaces){
  return (x,z)=>Math.max(...surfaces.map(g=>surfaceHeightAt(g,x,z)??-Infinity));
}

export function groundNormal(height,x,z){
  const e=.4,dx=height(x+e,z)-height(x-e,z),dz=height(x,z+e)-height(x,z-e);
  return new Vector3(-dx,e*2,-dz).normalize();
}

// Fixed seeds keep the two quality levels and successive visits recognizable.
export function createDetailLayout(surfaces,quality='high'){
  const rand=randomGenerator(90317),height=terrainSampler(surfaces),stones=[],wakes=[],moss=[],tufts=[];
  const riverbed=(x,z)=>surfaceHeightAt(surfaces[0],x,z);
  const addStone=(x,z,radius,inStream=false)=>{
    const bed=inStream?riverbed(x,z):height(x,z);
    if(!Number.isFinite(bed))return;
    const sy=radius*(inStream?.86:.60),sz=radius*(.7+rand()*.35);
    const stone={x,y:bed-sy*.10,z,sx:radius,sy,sz,rotation:rand()*Math.PI*2,variant:Math.floor(rand()*3),bed,inStream};
    stones.push(stone);
    // Estimate the exposed ellipse at the waterline. Wake size follows the
    // emerging part of a rock, rather than drawing a ring around its buried base.
    const slice=(WATER_LEVEL-stone.y)/sy;
    if(inStream&&slice>-.5&&slice<.78){
      const radiusAtWater=radius*Math.sqrt(1-slice*slice)*.88;
      const dx=riverCenter(z+1)-riverCenter(z-1);
      wakes.push({x,z,radius:radiusAtWater,rotation:Math.atan2(dx,2)});
    }
  };
  const anchors=[[39,.58,3.2],[55,-.28,3.7],[72,.36,3.5],[91,-.68,3.2],[116,.06,3.9],[142,.64,3.4],[177,-.35,3.7],[218,.44,4],[264,-.62,3.8],[329,.2,4.3],[398,.62,4.1],[490,-.35,4.5]];
  for(const [z,f,r] of anchors){
    addStone(riverCenter(z)+riverWidth(z)*f,z,r,true);
    // Smaller companions on the shallower side of each cluster.
    const side=f<0?-1:1;
    for(let j=0;j<2;j++){
      const zz=z+4+rand()*8;
      addStone(riverCenter(zz)+side*riverWidth(zz)*(.82+rand()*.12),zz,.6+rand()*1.3,true);
    }
  }
  const clusters=quality==='low'?22:38,perCluster=quality==='low'?8:14;
  for(let c=0;c<clusters;c++){
    const z0=30+rand()**1.6*480,side=rand()<.5?-1:1;
    const f=.94+rand()*.15;
    for(let i=0;i<perCluster;i++){
      const z=z0+(rand()-.5)*15,x=riverCenter(z)+side*riverWidth(z)*f+(rand()-.5)*4;
      addStone(x,z,.13+rand()**2*1.05);
    }
  }
  const path=Array.from({length:75},(_,i)=>stairPosition(i/74));
  const candidate=()=>{
    let x,z;
    if(rand()<.37){z=-32-rand()**1.6*1300;x=upperRiverCenter(z)+(rand()<.5?-1:1)*(upperRiverWidth(z)+20+rand()**1.4*150);}
    else{z=28+rand()**1.8*730;x=riverCenter(z)+(rand()<.5?-1:1)*(riverWidth(z)+22+rand()**1.7*180);}
    return {x,z};
  };
  const groupCount=quality==='low'?95:180;
  for(let c=0;c<groupCount;c++){
    const center=candidate(),spread=3+rand()*12;
    for(let i=0;i<(quality==='low'?12:20);i++){
      const angle=rand()*Math.PI*2,r=Math.sqrt(rand())*spread,x=center.x+Math.cos(angle)*r,z=center.z+Math.sin(angle)*r;
      const channel=z<0?Math.abs(x-upperRiverCenter(z))-upperRiverWidth(z):Math.abs(x-riverCenter(z))-riverWidth(z);
      if(channel<14||path.some(p=>Math.hypot(p.x-x,p.z-z)<2.2))continue;
      const y=height(x,z),normal=groundNormal(height,x,z);
      if(!Number.isFinite(y)||!Number.isFinite(normal.y)||normal.y<.69)continue;
      // Clumps share a patch color, with smaller local variation at each root.
      const hue=.20+(noise(x*.06,z*.06)-.5)*.055;
      tufts.push({x,y:y-.035,z,normal:normal.toArray(),scale:.35+rand()**1.4*.8,rotation:rand()*Math.PI*2,hue,seed:rand()});
      if(i%4===0)moss.push({x,y:y-.06,z,normal:normal.toArray(),scale:.4+rand()*1.1,rotation:rand()*Math.PI*2,hue,seed:rand()});
    }
  }
  return {stones,wakes,tufts,moss};
}

export function wakePlacement(w){
  const length=w.radius*9.5;
  // The foam shader places its bow at v=.23; map that point to the stone even
  // on river bends. Merely shifting global Z makes the wake slide sideways.
  return {x:w.x-Math.sin(w.rotation)*length*.23,y:WATER_LEVEL+.026,z:w.z-Math.cos(w.rotation)*length*.23,width:w.radius*5.7,length,rotation:w.rotation};
}
