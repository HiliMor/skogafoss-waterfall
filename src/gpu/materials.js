import { MeshStandardNodeMaterial, Color, DoubleSide } from 'three/webgpu';
import { Fn, attribute, positionWorld, positionLocal, positionGeometry, normalWorld, normalView, cameraViewMatrix, texture, vec3, vec4, vec2, float, mix, pow, abs, dot, normalize, smoothstep, clamp, sin, floor } from 'three/tsl';
import { noise2 } from './noise.js';

export function terrainNodeMaterial(assets,gravel=false,weather){
  const base=gravel?'river_small_rocks':'dark_rock';
  const material=new MeshStandardNodeMaterial({roughness:.95,envMapIntensity:.42});
  const weights=Fn(()=>{const w=pow(abs(normalWorld),vec3(4));return w.div(dot(w,vec3(1)).max(.001));})();
  const sample=(tex,p)=>{
    const n=texture(tex);
    const cell=noise2(p.mul(.24)).mul(8),i=floor(cell),f=cell.fract();
    const a=sin(vec2(3,7).mul(i.add(1))).mul(3),b=sin(vec2(3,7).mul(i.add(2))).mul(3);
    return mix(n.sample(p.add(a)),n.sample(p.add(b)),smoothstep(.15,.85,f)).rgb;
  };
  const tri=(tex,p)=>sample(tex,p.zy).mul(weights.x).add(sample(tex,p.xz).mul(weights.y)).add(sample(tex,p.xy).mul(weights.z));
  const triNormal=(tex,p)=>{
    const x=sample(tex,p.zy).mul(2).sub(1),y=sample(tex,p.xz).mul(2).sub(1),z=sample(tex,p.xy).mul(2).sub(1);
    return vec3(0,x.y,x.x).mul(weights.x).add(vec3(y.x,0,y.y).mul(weights.y)).add(vec3(z.x,z.y,0).mul(weights.z));
  };
  const rockP=positionWorld.mul(gravel?.30:.14),turfP=positionWorld.mul(.061);
  const cover=smoothstep(.08,.9,attribute('aCover','float'));
  const wet=attribute('aWetness','float').add(weather.wetness.mul(.6)).clamp();
  const rock=tri(assets[`${base}-color`],rockP).mul(new Color(gravel?'#818c91':'#aaaeb1'));
  const turf=tri(assets['aerial_grass_rock-color'],turfP).mul(vec3(.51,.90,.44));
  const arm=mix(tri(assets[`${base}-arm`],rockP),tri(assets['aerial_grass_rock-arm'],turfP),cover);
  material.colorNode=mix(rock,turf,cover).mul(noise2(positionWorld.xz.mul(.07).add(positionWorld.y.mul(.1))).mul(.32).add(.8)).mul(mix(.72,1,arm.r)).mul(float(1).sub(wet.mul(.37)));
  material.roughnessNode=clamp(arm.g.mul(.94).sub(wet.mul(.26)),.25,1);
  const perturb=mix(triNormal(assets[`${base}-normal`],rockP),triNormal(assets['aerial_grass_rock-normal'],turfP),cover);
  material.normalNode=normalize(normalView.add(cameraViewMatrix.mul(vec4(perturb,0)).xyz.mul(.38)));
  return material;
}

export function grassNodeMaterial(time,wind){
  const material=new MeshStandardNodeMaterial({color:'#a6a96c',side:DoubleSide,roughness:1});
  material.positionNode=Fn(()=>{
    const p=positionLocal.toVar();
    // A phase attached to each clump avoids whole hills swaying in unison.
    p.x.addAssign(sin(time.mul(1.8).add(attribute('aGrassPhase','float'))).mul(positionGeometry.y.pow(2)).mul(wind.mul(.4).add(.10)));
    return p;
  })();
  return material;
}
