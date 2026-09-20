import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTerrain, noiseGLSL } from './nature.js';
import { createWater } from './water.js';

const canvas=document.querySelector('#scene');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const quality=matchMedia('(pointer: coarse)').matches?'low':'high';
let paused=reducedMotion,renderer,scene,camera,controls,water,flight=null,time=3,last=performance.now(),frame=0,audio=null,sound=false;
const views={
  approach:{position:[57,37,170],target:[0,29,4],title:'The approach',number:'01 / 03'},
  river:{position:[-32,10,125],target:[0,28,3],title:'Along the riverbed',number:'02 / 03'},
  cliff:{position:[94,108,126],target:[0,37,-2],title:'Above the falls',number:'03 / 03'}
};
let selected='approach';

function showError(message){document.querySelector('#error-message').textContent=message;document.querySelector('#error').hidden=false;document.querySelector('#loading').classList.add('done');}
function setView(name,animate=true){
  const view=views[name];if(!view||!camera)return;
  selected=name;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
  document.querySelector('#view-number').textContent=view.number;document.querySelector('#view-name').textContent=view.title;
  const p=new THREE.Vector3(...view.position),t=new THREE.Vector3(...view.target);
  if(animate&&!reducedMotion)flight={start:performance.now(),from:camera.position.clone(),to:p,targetFrom:controls.target.clone(),targetTo:t};
  else{flight=null;camera.position.copy(p);controls.target.copy(t);controls.update();}
}
function updateMotion(){const b=document.querySelector('#motion-button');b.setAttribute('aria-pressed',String(paused));b.setAttribute('aria-label',paused?'Play water animation':'Pause water animation');b.querySelector('.tool-label').textContent=paused?'Play':'Pause';document.querySelector('#motion-icon').textContent=paused?'▷':'Ⅱ';}
function toggleMotion(){paused=!paused;updateMotion();}

async function toggleSound(){
  const b=document.querySelector('#sound-button');
  try{
    if(!audio){
      const context=new AudioContext(),buffer=context.createBuffer(2,context.sampleRate*4,context.sampleRate);
      for(let c=0;c<2;c++){const data=buffer.getChannelData(c);let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.03)/1.02;data[i]=brown*3.5+(Math.random()*2-1)*.12;}}
      const source=context.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1150;
      const gain=context.createGain();gain.gain.value=0;source.connect(filter).connect(gain).connect(context.destination);source.start();audio={context,gain};
    }
    await audio.context.resume();sound=!sound;audio.gain.gain.setTargetAtTime(sound?.22:0,audio.context.currentTime,.4);
    b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label',sound?'Mute ambient water sound':'Enable ambient water sound');b.querySelector('.tool-label').textContent=sound?'Sound on':'Sound off';
  }catch(error){b.querySelector('.tool-label').textContent='Sound unavailable';b.disabled=true;console.warn('Ambient audio unavailable',error);}
}

function createSky(){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1000,32,18),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
    vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDirection;${noiseGLSL}void main(){vec3 d=normalize(vDirection);float h=max(0.,d.y);vec3 c=mix(vec3(.48,.55,.50),vec3(.26,.39,.40),pow(h,.4));vec2 p=d.xz/max(.15,h)*.7;float clouds=smoothstep(.38,.74,f2(p+vec2(2.8,1.)));c=mix(c,vec3(.65,.67,.58),clouds*.62*smoothstep(0.,.15,h));float warm=pow(max(0.,dot(d,normalize(vec3(-.8,.4,.5)))),7.);c+=vec3(.21,.14,.06)*warm;gl_FragColor=vec4(c,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`
  }));scene.add(sky);
}

function init(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,quality==='low'?1.3:1.7));
  renderer.setSize(innerWidth,innerHeight,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#899b91');scene.fog=new THREE.FogExp2('#899b91',.0017);
  camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.3,1600);
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=false;controls.minDistance=47;controls.maxDistance=280;controls.minPolarAngle=.39;controls.maxPolarAngle=1.90;controls.minAzimuthAngle=-.82;controls.maxAzimuthAngle=.84;controls.rotateSpeed=.4;controls.zoomSpeed=.7;
  if(innerWidth<650){camera.fov=52;camera.updateProjectionMatrix();views.approach.position=[47,40,192];}
  controls.addEventListener('start',()=>{flight=null;document.querySelector('#gesture-hint').style.opacity='0';});
  scene.add(new THREE.HemisphereLight('#d4e0d4','#354232',1.7));
  const sun=new THREE.DirectionalLight('#ffebbd',2.7);sun.position.set(-85,150,105);sun.castShadow=true;
  sun.shadow.mapSize.set(quality==='low'?1024:2048,quality==='low'?1024:2048);Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-100,near:5,far:380});sun.shadow.bias=-.0004;sun.shadow.normalBias=.35;sun.shadow.radius=3;sun.target.position.set(0,25,0);scene.add(sun,sun.target);
  createSky();createTerrain(scene,quality);water=createWater(scene,quality);setView('approach',false);updateMotion();
  // Compile before removing the loader, so the opening view is a complete frame.
  document.querySelector('#loading-message').textContent='Letting the water flow…';
  renderer.compile(scene,camera);resize();renderer.setAnimationLoop(render);
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelector('#reset-button').addEventListener('click',()=>setView('approach'));
  document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();setView('approach');});
  document.querySelector('#motion-button').addEventListener('click',toggleMotion);
  document.querySelector('#sound-button').addEventListener('click',toggleSound);
  const dialog=document.querySelector('#about-dialog');
  document.querySelector('#about-button').addEventListener('click',()=>dialog.showModal());
  document.querySelector('#close-about').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  addEventListener('keydown',e=>{
    if(dialog.open||e.ctrlKey||e.altKey||e.metaKey||['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(document.activeElement?.tagName))return;
    if(e.code==='Space'){e.preventDefault();toggleMotion();}
    if(e.key.toLowerCase()==='h')setView('approach');
    if(['1','2','3'].includes(e.key))setView(Object.keys(views)[Number(e.key)-1]);
  });
  addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{last=performance.now();if(audio){if(document.hidden)audio.context.suspend();else if(sound)audio.context.resume();}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);showError('The graphics context was interrupted. Reload to return to the waterfall.');});
  addEventListener('pagehide',()=>{audio?.context.close();renderer.setAnimationLoop(null);});
}
function resize(){if(!renderer)return;const w=canvas.clientWidth,h=canvas.clientHeight;camera.aspect=w/h;camera.fov=w<650?52:43;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
function render(now){
  const dt=Math.min((now-last)/1000,.05);last=now;if(document.hidden)return;
  if(!paused)time+=dt;
  if(flight){let t=Math.min(1,(now-flight.start)/2200);t=t*t*t*(t*(t*6-15)+10);camera.position.lerpVectors(flight.from,flight.to,t);controls.target.lerpVectors(flight.targetFrom,flight.targetTo,t);if(t===1)flight=null;}
  controls.update();if(camera.position.y<3){camera.position.y=3;camera.lookAt(controls.target);}water.update(time);renderer.render(scene,camera);frame++;
  if(frame===3){document.querySelector('#loading').classList.add('done');canvas.dataset.ready='true';console.info(`Skógafoss ready: ${renderer.info.render.triangles} triangles, ${renderer.info.render.calls} draw calls, ${quality} quality`);}
}
try{init();}catch(error){console.error(error);showError('This landscape needs WebGL 2. Try a current browser with hardware acceleration enabled.');}
