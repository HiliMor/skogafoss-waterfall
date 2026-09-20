import * as THREE from 'three/webgpu';
import { Fn, uv, positionLocal, positionWorld, cameraPosition, uniform, vec2, vec3, vec4, float, texture, mix, smoothstep, sin, sqrt, exp, normalize, dot, reflector, reflect } from 'three/tsl';
import { surface,riverCenter,riverWidth,upperRiverCenter,upperRiverHeight,upperRiverWidth } from '../nature.js';
import { waterfallPoint } from '../water.js';
import { fbm2,noise2 } from './noise.js';

export function createGPUWater(scene,quality,weather,time,assets){
  const tint=weather.lightColor.mul(weather.light);
  const upperColor=Fn(([p,t])=>{
    const n=fbm2(vec2(p.x.mul(.6),p.y.mul(.43).sub(t.mul(2.2))));
    return mix(vec3(.055,.10,.12),vec3(.64,.75,.78),smoothstep(.48,.79,n).mul(.85))
      .add(sin(p.y.mul(1.9).sub(t.mul(6)).add(n.mul(8))).max(0).pow(16).mul(.19));
  }).setLayout({name:'upstreamWater',type:'vec3',inputs:[{name:'p',type:'vec2'},{name:'t',type:'float'}]});
  const sheet=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:true});
  sheet.positionNode=Fn(()=>{
    const p=positionLocal.toVar(),depth=float(60).sub(p.y).div(59).clamp(),travel=sqrt(depth),body=smoothstep(.26,.45,uv().y);
    const folds=fbm2(vec2(uv().x.mul(24).add(sin(travel.mul(18).sub(time.mul(3))).mul(.7)),travel.mul(32).sub(time.mul(5))));
    p.z.addAssign(body.mul(folds.sub(.5)).mul(depth.mul(5).add(1)));
    p.x.addAssign(body.mul(depth).mul(sin(travel.mul(29).sub(time.mul(4)).add(uv().x.mul(11))).mul(.6).add(weather.wind.mul(depth).mul(.65))));
    return p;
  })();
  const falling=Fn(()=>{
    const v=uv(),depth=float(60).sub(positionWorld.y).div(59).clamp(),travel=sqrt(depth),aeration=smoothstep(.03,.72,depth);
    const flow=vec2(v.x.mul(62),travel.mul(132).sub(time.mul(19.5)));
    const warp=vec2(fbm2(flow.mul(.63)),fbm2(flow.mul(.49).add(17))).sub(.5);
    const billow=flow.add(warp.mul(vec2(2.8,3.2)).mul(aeration));
    const broad=fbm2(vec2(v.x.mul(12).add(warp.x.mul(aeration)),travel.mul(16).sub(time.mul(2.5))));
    const ribbon=fbm2(vec2(v.x.mul(148).add(warp.x.mul(aeration).mul(6)),travel.mul(73).sub(time.mul(10.8))));
    const plume=fbm2(billow),fine=noise2(billow.mul(vec2(7,3))),froth=smoothstep(.23,.76,plume.add(ribbon.mul(.18)));
    const stream=sin(v.x.mul(17).add(.8)).mul(.23).add(sin(v.x.mul(39).add(1.5)).mul(.17)).add(.5);
    const a=exp(v.x.sub(.27).sub(warp.x.mul(.035)).div(.04).pow(2).negate()).mul(.8);
    const b=exp(v.x.sub(.61).sub(warp.y.mul(.05)).div(.028).pow(2).negate());
    const c=exp(v.x.sub(.83).sub(warp.x.mul(.025)).div(.02).pow(2).negate()).mul(.65);
    const channels=a.add(b).add(c).mul(smoothstep(.22,.92,depth).oneMinus());
    const foam=stream.mul(.18).add(broad.mul(.17)).add(ribbon.mul(.35)).add(froth.mul(aeration.mul(.23).add(.3))).sub(channels.mul(.29)).add(.1).clamp();
    const ridge=fbm2(billow.add(vec2(.4,-.25))).sub(plume);
    const color=mix(vec3(.07,.12,.15),vec3(.60,.70,.74),smoothstep(.08,.97,foam)).mul(froth.mul(.18).add(fine.mul(.2)).add(ridge.mul(.65)).add(.71));
    const edgeNoise=fbm2(vec2(travel.mul(110).sub(time.mul(16)),v.x.mul(39)));
    const width=depth.mul(edgeNoise.mul(.05).add(.009)).add(.003),fray=edgeNoise.sub(.5).mul(depth).mul(.025);
    const edge=smoothstep(0,width,v.x.add(fray)).mul(smoothstep(0,width.mul(.75),v.x.oneMinus().sub(fray)));
    const thin=smoothstep(.2,.5,stream.add(ribbon.mul(.3)));
    const alpha=edge.mul(mix(1,thin.mul(.35).sub(channels.mul(.34)).add(.65),smoothstep(.3,.5,v.y))).mul(smoothstep(.955,1,v.y).oneMinus());
    return vec4(mix(upperColor(positionWorld.xz,time),color,smoothstep(.205,.31,v.y)).mul(tint),alpha);
  })();
  sheet.colorNode=falling.rgb;sheet.opacityNode=falling.a;
  const waterfall=new THREE.Mesh(surface(110,230,waterfallPoint),sheet);waterfall.name='TSL continuous waterfall';scene.add(waterfall);
  const upperMat=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide});
  upperMat.colorNode=upperColor(positionWorld.xz,time).mul(tint);
  upperMat.positionNode=Fn(()=>{const p=positionLocal.toVar();p.y.addAssign(smoothstep(-50,-36,p.z).oneMinus().mul(sin(p.z.mul(1.4).sub(time.mul(3))).mul(.045).add(sin(p.x.mul(1.8).add(p.z.mul(.7)).sub(time.mul(2))).mul(.025))));return p;})();
  const upper=new THREE.Mesh(surface(30,420,(u,v)=>{const z=-36-v*v*3664;return[upperRiverCenter(z)+(u-.5)*upperRiverWidth(z)*2,upperRiverHeight(z),z];}),upperMat);scene.add(upper);

  // The reflection target lies in local XY; the river mesh rotates it to XZ.
  const riverGeo=surface(34,290,(u,v)=>{const z=-2+v*v*3502;return[riverCenter(z)+(u-.5)*riverWidth(z)*2,-z,0];},true);
  const riverMat=new THREE.MeshBasicNodeMaterial();
  const river=new THREE.Mesh(riverGeo,riverMat);river.rotation.x=-Math.PI/2;river.position.y=.48;
  const mirror=reflector({resolutionScale:quality==='low'?.25:.5});river.add(mirror.target);
  const normal=Fn(()=>{
    const p=positionWorld.xz;
    const dx=fbm2(p.mul(vec2(.7,.4)).add(vec2(time.mul(.6),time.mul(-1.7)))).sub(.5);
    const dz=fbm2(p.mul(vec2(.6,.9)).add(vec2(time.mul(-.4),time.mul(-1.2))).add(7)).sub(.5);
    return normalize(vec3(dx.mul(.65),1,dz.mul(.65)));
  })();
  const view=cameraPosition.sub(positionWorld).normalize();
  const distortion=normal.xz.mul(float(.001).add(float(1).div(cameraPosition.distance(positionWorld)))).mul(2.5);
  mirror.uvNode=mirror.uvNode.add(distortion);
  const fresnel=dot(view,normal).max(0).oneMinus().pow(5).mul(.98).add(.02);
  const glint=dot(view,reflect(weather.sunDirection.negate(),normal)).max(0).pow(100).mul(weather.sunColor).mul(.65);
  const waterBase=vec3(.024,.055,.062).mul(weather.light).add(weather.sunColor.mul(.012));
  const reflected=mix(waterBase,mirror.rgb.add(glint),fresnel.mul(.82));
  riverMat.colorNode=Fn(()=>{
    const p=positionWorld.xz,n=fbm2(vec2(p.x.mul(.48),p.y.mul(.65).sub(time.mul(2.3))));
    const impact=smoothstep(8,34,p.sub(vec2(0,11)).mul(vec2(.8,1)).length()).oneMinus().mul(smoothstep(.29,.65,n));
    const bank=uv().x.mul(2).sub(1).abs().pow(15).mul(smoothstep(.52,.76,n)).mul(.45);
    const wake=smoothstep(24,160,p.y).oneMinus().mul(smoothstep(8,25,p.x.abs()).oneMinus()).mul(smoothstep(.69,.82,n)).mul(.44);
    const shallows=smoothstep(.48,.98,uv().x.mul(2).sub(1).abs());
    const gravel=texture(assets['river_small_rocks-color'],p.mul(.34)).rgb.mul(vec3(.34,.42,.34)).mul(weather.light);
    const current=smoothstep(.70,.86,fbm2(vec2(p.x.mul(.8),p.y.mul(.075).sub(time.mul(.6))))).mul(smoothstep(24,55,p.y)).mul(.055);
    const riverColor=mix(reflected,gravel.add(waterBase.mul(.5)),shallows.mul(.56));
    return mix(riverColor,vec3(.65,.78,.83).mul(tint),impact.mul(.92).add(bank).add(wake).add(current).clamp(0,.95));
  })();
  scene.add(river);
  return {waterfall,river};
}
