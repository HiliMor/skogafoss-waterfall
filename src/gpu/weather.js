import * as THREE from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Fn, If, uniform, texture, vec2, vec3, float, positionWorldDirection, positionLocal, attribute, mix, normalize, sin, asin, atan, fract, dot, exp, max, smoothstep, floor, length, step } from 'three/tsl';
import { WEATHER } from '../weather-presets.js';
import { randomGenerator } from '../nature.js';
import { hash21,fbm2 } from './noise.js';

export function createGPUWeather({scene,renderer,camera,sun,hemi,assets,quality,reducedMotion,time}){
  const state={
    wetness:uniform(0),wind:uniform(.25),lightColor:uniform(new THREE.Color('#d6e3e6')),light:uniform(.85),
    sunColor:uniform(sun.color.clone()),sunDirection:uniform(sun.position.clone().normalize()),
    spray:uniform(.68),rain:uniform(0),aurora:uniform(0)
  };
  const skyA=texture(assets.sky),skyB=texture(assets.sky),blend=uniform(0);
  const gainA=uniform(.3),gainB=uniform(.3),rotA=uniform(.65),rotB=uniform(.65);
  const tintA=uniform(new THREE.Vector3(1,1,1)),tintB=uniform(new THREE.Vector3(1,1,1));
  const skyUv=(d,rotation)=>vec2(fract(atan(d.z,d.x).div(Math.PI*2).add(.5).add(rotation.div(Math.PI*2))),asin(d.y.clamp(-1,1)).div(Math.PI).add(.5));
  const grade=(c,tint,elevation)=>{
    const graded=c.mul(mix(tint,vec3(1),smoothstep(.05,.8,elevation).mul(.65)));
    return mix(vec3(dot(graded,vec3(.2126,.7152,.0722))),graded,1.16).max(0);
  };
  scene.backgroundNode=Fn(()=>{
    const d=normalize(positionWorldDirection),az=atan(d.z,d.x),elevation=asin(d.y.clamp(-1,1)),t=time.mul(.025);
    const c=mix(grade(skyA.sample(skyUv(d,rotA)).rgb.mul(gainA),tintA,d.y),grade(skyB.sample(skyUv(d,rotB)).rgb.mul(gainB),tintB,d.y),blend).toVar();
    If(state.aurora.greaterThan(.001).and(d.y.greaterThan(0)),()=>{
      for(let k=0;k<2;k++){
        const base=sin(az.mul(1.5).add(t).add(k*1.2)).mul(.18).add(sin(az.mul(4.5).sub(t.mul(.2)).add(k)).mul(.06)).add(.22+k*.17);
        const h=elevation.sub(base),curtain=smoothstep(-.018,.028,h).mul(exp(max(h,0).mul(-10-k))).mul(smoothstep(.2,1.1,elevation).oneMinus());
        const rays=fbm2(vec2(az.mul(105).add(k*30),t.mul(1.3))).pow(1.4).mul(.88).add(.12);
        const folds=sin(az.mul(4.2).add(t).add(k*2)).pow(2).mul(.65).add(.35);
        c.addAssign(mix(vec3(.075,.7,.37),vec3(.29,.065,.48),smoothstep(.055,.20,h)).mul(curtain).mul(rays).mul(folds).mul(state.aurora).mul(.7));
      }
      const starUv=skyUv(d,float(0)).mul(vec2(1300,650));
      const star=step(.9985,hash21(floor(starUv))).mul(smoothstep(.05,.24,length(fract(starUv).sub(.5))).oneMinus());
      c.addAssign(vec3(.65,.79,1).mul(star).mul(state.aurora).mul(smoothstep(0,.2,d.y)));
    });
    return c;
  })();
  const rand=randomGenerator(415),p=[],ends=[];
  for(let i=0;i<(quality==='low'?1700:4800);i++){
    const x=(rand()-.5)*170,y=rand()*100,z=(rand()-.5)*170;p.push(x,y,z,x,y,z);ends.push(0,1);
  }
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(p,3));rg.setAttribute('aEnd',new THREE.Float32BufferAttribute(ends,1));
  const rainMat=new THREE.MeshBasicNodeMaterial({color:'#a3c2d1',transparent:true,depthWrite:false});
  const camY=uniform(camera.position.y);
  rainMat.positionNode=Fn(()=>{const p=positionLocal.toVar(),end=attribute('aEnd','float');p.y.assign(camY.add(45).sub(p.y.add(time.mul(34)).mod(100)));p.x.addAssign(p.y.mul(.16).sub(end.mul(.4)));p.y.addAssign(end.mul(1.8));return p;})();
  rainMat.opacityNode=state.rain.mul(.17);
  const rain=new THREE.LineSegments(rg,rainMat);rain.frustumCulled=false;rain.visible=false;scene.add(rain);
  const cache=new Map([['storm',Promise.resolve(assets.sky)]]),status=document.querySelector('#weather-status');
  let request=0,transition=null,current=null;
  const getSky=name=>{
    if(!cache.has(name))cache.set(name,new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}skies/${name}.hdr`).then(t=>{t.mapping=THREE.EquirectangularReflectionMapping;return t;}).catch(e=>{cache.delete(name);throw e;}));
    return cache.get(name);
  };
  function capture(){return{
    sun:sun.color.clone(),sunPower:sun.intensity,sunPosition:sun.position.toArray(),hemi:hemi.color.clone(),ground:hemi.groundColor.clone(),hemiPower:hemi.intensity,
    fog:scene.fog.color.clone(),density:scene.fog.density,exposure:renderer.toneMappingExposure,environment:scene.environmentIntensity,
    water:state.lightColor.value.clone(),waterLight:state.light.value,...Object.fromEntries(['wetness','wind','spray','rain','aurora'].map(k=>[k,state[k].value]))
  };}
  function apply(from,to,t){
    const lerp=k=>THREE.MathUtils.lerp(from[k],to[k],t);
    sun.color.lerpColors(from.sun,new THREE.Color(to.sun),t);sun.intensity=lerp('sunPower');sun.position.lerpVectors(new THREE.Vector3(...from.sunPosition),new THREE.Vector3(...to.sunPosition),t);
    state.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity*.5);state.sunDirection.value.copy(sun.position).sub(sun.target.position).normalize();
    hemi.color.lerpColors(from.hemi,new THREE.Color(to.hemi),t);hemi.groundColor.lerpColors(from.ground,new THREE.Color(to.ground),t);hemi.intensity=lerp('hemiPower');
    scene.fog.color.lerpColors(from.fog,new THREE.Color(to.fog),t);scene.fog.density=lerp('density');
    renderer.toneMappingExposure=lerp('exposure');scene.environmentIntensity=lerp('environment');
    state.lightColor.value.lerpColors(from.water,new THREE.Color(to.water),t);state.light.value=lerp('waterLight');
    for(const k of ['wetness','wind','spray','rain','aurora'])state[k].value=lerp(k);
    rain.visible=state.rain.value>.001;
  }
  async function setMode(name,instant=false){
    if(!WEATHER[name])return false;
    const id=++request,config=WEATHER[name];status.textContent=`Opening ${config.label.toLowerCase()}…`;status.setAttribute('aria-busy','true');
    try{
      const map=await getSky(config.sky);if(id!==request)return false;
      const from=capture();skyA.value=skyB.value;gainA.value=gainB.value;rotA.value=rotB.value;tintA.value.copy(tintB.value);
      skyB.value=map;gainB.value=config.skyGain;rotB.value=config.rotation;tintB.value.fromArray(config.skyTint??[1,1,1]);blend.value=0;
      scene.environment=map;scene.environmentRotation.y=config.rotation;
      if(instant||reducedMotion){apply(from,config,1);blend.value=1;transition=null;}else transition={from,to:config,start:performance.now()};
      current=name;document.querySelector('#experience').dataset.weather=name;
      document.querySelectorAll('button[data-weather]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weather===name)));
      status.textContent=config.label;status.setAttribute('aria-busy',String(!!transition));return true;
    }catch(error){if(id===request){status.textContent='Sky unavailable — tap to retry';status.setAttribute('aria-busy','false');}console.warn('Sky could not load',error);return false;}
  }
  return {state,setMode,get current(){return current;},update(now){
    camY.value=camera.position.y;rain.position.set(camera.position.x,0,camera.position.z);
    if(transition){const f=Math.min(1,(now-transition.start)/2200),t=f*f*(3-2*f);apply(transition.from,transition.to,t);blend.value=t;if(f===1){transition=null;status.setAttribute('aria-busy','false');}}
  }};
}
