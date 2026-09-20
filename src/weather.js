import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { noiseGLSL, randomGenerator } from './nature.js';

export const WEATHER = {
  clear: { label:'Clear day', sky:'clear', rotation:2.0, skyGain:.34, skyTint:[.66,.92,1.24], sun:'#fff3e2', sunPower:2.2, sunPosition:[-90,150,100], hemi:'#b6d7ef', ground:'#465a3b', hemiPower:1, fog:'#91b1c8', density:.00032, exposure:.97, environment:.48, water:'#d6e3e6', waterLight:.85, wetness:0, wind:.25, rain:0, aurora:0, spray:.68 },
  golden: { label:'Golden hour', sky:'golden', rotation:2.75, skyGain:.27, skyTint:[1.6,.86,.40], sun:'#ffc47f', sunPower:2.3, sunPosition:[-130,65,100], hemi:'#bbb8d7', ground:'#515b41', hemiPower:.78, fog:'#c6a8a3', density:.00042, exposure:.98, environment:.5, water:'#f9ddc6', waterLight:.85, wetness:.05, wind:.18, rain:0, aurora:0, spray:.8 },
  storm: { label:'Passing storm', sky:'storm', rotation:.65, skyGain:.3, sun:'#abc4d8', sunPower:.3, sunPosition:[-85,140,100], hemi:'#9bb5ca', ground:'#293d37', hemiPower:.9, fog:'#798f9d', density:.0012, exposure:.95, environment:.45, water:'#b9d0dc', waterLight:.68, wetness:.92, wind:1, rain:1, aurora:0, spray:1.6 },
  aurora: { label:'Northern lights', sky:'night', rotation:1.9, skyGain:.012, sun:'#b1cbe8', sunPower:.22, sunPosition:[-60,140,70], hemi:'#7193b5', ground:'#182b2e', hemiPower:.46, fog:'#12232f', density:.0008, exposure:.86, environment:.18, water:'#9cbacb', waterLight:.36, wetness:.12, wind:.1, rain:0, aurora:1, spray:.72 }
};

export function createWeather({ scene, renderer, camera, sun, hemi, assets, quality, reducedMotion }) {
  const state = {
    wetness:{value:0}, wind:{value:.2}, lightColor:{value:new THREE.Color('#ebf3ef')}, light:{value:1},
    sunColor:{value:sun.color.clone()},sunDirection:{value:sun.position.clone().normalize()},fogColor:{value:scene.fog.color}, fogDensity:{value:scene.fog.density}, spray:{value:1}
  };
  const skyUniforms = {
    uSkyA:{value:assets.sky},uSkyB:{value:assets.sky},uBlend:{value:0},uGainA:{value:.8},uGainB:{value:.8},
    uRotationA:{value:.65},uRotationB:{value:.65},uTintA:{value:new THREE.Vector3(1,1,1)},uTintB:{value:new THREE.Vector3(1,1,1)},uAurora:{value:0},uTime:{value:0}
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1,48,24),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:skyUniforms,
    vertexShader:`varying vec3 vDirection;void main(){vDirection=position;vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader:`varying vec3 vDirection;uniform sampler2D uSkyA,uSkyB;uniform vec3 uTintA,uTintB;uniform float uBlend,uGainA,uGainB,uRotationA,uRotationB,uAurora,uTime;${noiseGLSL}
      vec2 skyUv(vec3 d,float rotation){return vec2(fract(atan(d.z,d.x)/6.2831853+.5+rotation/6.2831853),asin(clamp(d.y,-1.,1.))/3.14159265+.5);}
      vec3 skyGrade(vec3 c,vec3 tint,float elevation){
        // Keep the upper atmosphere cooler while warming the lit cloud banks.
        vec3 grade=mix(tint,vec3(1.),smoothstep(.05,.8,elevation)*.65);
        c*=grade;float l=dot(c,vec3(.2126,.7152,.0722));return max(vec3(0.),mix(vec3(l),c,1.16));
      }
      void main(){vec3 d=normalize(vDirection);vec3 col=mix(skyGrade(texture2D(uSkyA,skyUv(d,uRotationA)).rgb*uGainA,uTintA,d.y),skyGrade(texture2D(uSkyB,skyUv(d,uRotationB)).rgb*uGainB,uTintB,d.y),uBlend);
        if(uAurora>.001&&d.y>0.){
          float az=atan(d.z,d.x),elevation=asin(d.y),t=uTime*.025;
          for(int i=0;i<2;i++){
            float k=float(i),base=.22+k*.17+.18*sin(az*1.5+t+k*1.2)+.06*sin(az*4.5-t*.2+k);
            float h=elevation-base;
            float curtain=smoothstep(-.018,.028,h)*exp(-max(h,0.)*(10.+k))*(1.-smoothstep(.2,1.1,elevation));
            float rays=.12+.88*pow(f2(vec2(az*105.+k*30.,t*1.3)),1.4);
            float folds=.35+.65*sin(az*4.2+t+k*2.)*sin(az*4.2+t+k*2.);
            vec3 aurora=mix(vec3(.075,.7,.37),vec3(.29,.065,.48),smoothstep(.055,.20,h));
            col+=aurora*curtain*rays*folds*uAurora*.7;
          }
          vec2 starUv=skyUv(d,0.)*vec2(1300.,650.);vec2 cell=floor(starUv);
          float star=step(.9985,hash21(cell))*(1.-smoothstep(.05,.24,length(fract(starUv)-.5)));
          col+=vec3(.65,.79,1.)*star*uAurora*smoothstep(0.,.2,d.y);
        }
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.frustumCulled=false;sky.renderOrder=-100;scene.background=null;scene.add(sky);
  const rainUniforms={uTime:skyUniforms.uTime,uRain:{value:0},uCameraY:{value:0}};
  const random=randomGenerator(415),rainPositions=[],ends=[];
  for(let i=0;i<(quality==='low'?1700:4800);i++){
    const x=(random()-.5)*170,y=random()*100,z=(random()-.5)*170;
    rainPositions.push(x,y,z,x,y,z);ends.push(0,1);
  }
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(rainPositions,3));rg.setAttribute('aEnd',new THREE.Float32BufferAttribute(ends,1));
  const rain=new THREE.LineSegments(rg,new THREE.ShaderMaterial({uniforms:rainUniforms,transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime,uCameraY;attribute float aEnd;varying float vAlpha;void main(){vec3 p=position;p.y=uCameraY+45.-mod(position.y+uTime*34.,100.);p.x+=p.y*.16;p.y+=aEnd*1.8;p.x-=aEnd*.4;vec4 mv=modelViewMatrix*vec4(p,1.);vAlpha=(1.-smoothstep(20.,90.,-mv.z))*.28;gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float uRain;varying float vAlpha;void main(){gl_FragColor=vec4(.64,.76,.82,vAlpha*uRain);}`
  }));rain.frustumCulled=false;rain.visible=false;scene.add(rain);
  const cache=new Map([['storm',Promise.resolve(assets.sky)]]);
  let request=0,transition=null,current=null;
  const getSky = name => {
    if(!cache.has(name))cache.set(name,new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}skies/${name}.hdr`).then(t=>{t.mapping=THREE.EquirectangularReflectionMapping;return t;}).catch(e=>{cache.delete(name);throw e;}));
    return cache.get(name);
  };
  const status=document.querySelector('#weather-status');
  function capture(){return {
    sun:sun.color.clone(),sunPower:sun.intensity,sunPosition:sun.position.toArray(),hemi:hemi.color.clone(),ground:hemi.groundColor.clone(),hemiPower:hemi.intensity,
    fog:scene.fog.color.clone(),density:scene.fog.density,exposure:renderer.toneMappingExposure,environment:scene.environmentIntensity,
    water:state.lightColor.value.clone(),waterLight:state.light.value,wetness:state.wetness.value,wind:state.wind.value,rain:rainUniforms.uRain.value,aurora:skyUniforms.uAurora.value,spray:state.spray.value
  };}
  function apply(from,to,t){
    const mix=(key)=>THREE.MathUtils.lerp(from[key],to[key],t);
    sun.color.lerpColors(from.sun,new THREE.Color(to.sun),t);sun.intensity=mix('sunPower');sun.position.lerpVectors(new THREE.Vector3(...from.sunPosition),new THREE.Vector3(...to.sunPosition),t);
    state.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity*.5);state.sunDirection.value.copy(sun.position).sub(sun.target.position).normalize();
    hemi.color.lerpColors(from.hemi,new THREE.Color(to.hemi),t);hemi.groundColor.lerpColors(from.ground,new THREE.Color(to.ground),t);hemi.intensity=mix('hemiPower');
    scene.fog.color.lerpColors(from.fog,new THREE.Color(to.fog),t);scene.fog.density=mix('density');state.fogDensity.value=scene.fog.density;
    renderer.toneMappingExposure=mix('exposure');scene.environmentIntensity=mix('environment');
    state.lightColor.value.lerpColors(from.water,new THREE.Color(to.water),t);state.light.value=mix('waterLight');
    for(const key of ['wetness','wind','spray'])state[key].value=mix(key);
    rainUniforms.uRain.value=mix('rain');rain.visible=rainUniforms.uRain.value>.001;skyUniforms.uAurora.value=mix('aurora');
  }
  async function setMode(name,instant=false){
    if(!WEATHER[name])return false;
    const id=++request,config=WEATHER[name];status.textContent=`Opening ${config.label.toLowerCase()}…`;status.setAttribute('aria-busy','true');
    try{
      const texture=await getSky(config.sky);if(id!==request)return false;
      const from=capture();
      skyUniforms.uSkyA.value=skyUniforms.uSkyB.value;skyUniforms.uGainA.value=skyUniforms.uGainB.value;skyUniforms.uRotationA.value=skyUniforms.uRotationB.value;
      skyUniforms.uTintA.value.copy(skyUniforms.uTintB.value);skyUniforms.uTintB.value.fromArray(config.skyTint??[1,1,1]);
      skyUniforms.uSkyB.value=texture;skyUniforms.uGainB.value=config.skyGain;skyUniforms.uRotationB.value=config.rotation;skyUniforms.uBlend.value=0;
      scene.environment=texture;scene.environmentRotation.y=config.rotation;
      if(instant||reducedMotion){apply(from,config,1);skyUniforms.uBlend.value=1;transition=null;}
      else transition={from,to:config,start:performance.now()};
      current=name;document.querySelectorAll('button[data-weather]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weather===name)));
      document.querySelector('#experience').dataset.weather=name;status.textContent=config.label;status.setAttribute('aria-busy',String(!!transition));return true;
    }catch(error){if(id===request){status.textContent='Sky unavailable — tap a mode to retry';status.setAttribute('aria-busy','false');}console.warn('Sky could not load',error);return false;}
  }
  return {state,setMode,get current(){return current;},update(time,now){
    skyUniforms.uTime.value=time;rainUniforms.uCameraY.value=camera.position.y;rain.position.set(camera.position.x,0,camera.position.z);
    if(transition){const f=Math.min(1,(now-transition.start)/2200),t=f*f*(3-2*f);apply(transition.from,transition.to,t);skyUniforms.uBlend.value=t;if(f===1){transition=null;status.setAttribute('aria-busy','false');}}
  }};
}
