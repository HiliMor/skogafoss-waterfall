import '../style.css';
import './style.css';
import { createViews } from '../views.js';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTerrain, terrainHeightAt } from '../nature.js';
import { loadLandscapeAssets } from '../materials.js';
import { createGPUWater } from './water.js';
import { createSpraySimulation,SIMULATION_STEP } from './simulation.js';
import { terrainNodeMaterial,grassNodeMaterial } from './materials.js';
import { uniform } from 'three/tsl';
import { createGPUWeather } from './weather.js';
import { attachLab } from './lab.js';

const canvas=document.querySelector('#scene');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const quality=matchMedia('(pointer: coarse)').matches?'low':'high';
let paused=reducedMotion,renderer,scene,camera,controls,water,terrain,weather,flight=null,time=3,last=performance.now(),frame=0,audio=null,sound=false;
const views=createViews();
let selected='approach';
const sceneTime=uniform(3);
let simulation,lab,accumulator=0;

function showError(message){document.querySelector('#gpu-backend').textContent='Not running';document.querySelector('#error-message').textContent=message;document.querySelector('#error').hidden=false;document.querySelector('#loading').classList.add('done');}
function setView(name,animate=true){
  const view=views[name];if(!view||!camera)return;
  selected=name;document.querySelector(`[data-view="${name}"]`)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:reducedMotion?'instant':'smooth'});document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
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
    await audio.context.resume();sound=!sound;audio.gain.gain.setTargetAtTime(sound ? .22 : 0,audio.context.currentTime,.4);
    b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label',sound?'Mute ambient water sound':'Enable ambient water sound');b.querySelector('.tool-label').textContent=sound?'Sound on':'Sound off';
  }catch(error){b.querySelector('.tool-label').textContent='Sound unavailable';b.disabled=true;console.warn('Ambient audio unavailable',error);}
}


async function init(){
  if(!navigator.gpu)throw new Error('WebGPU is unavailable in this browser. Open the original scene below, or try a current Chrome or Edge browser.');
  document.querySelector('#loading-message').textContent='Connecting to WebGPU…';
  renderer=new THREE.WebGPURenderer({canvas,antialias:true,powerPreference:'high-performance'});
  // Some browsers defer adapter creation in background tabs. Only count time
  // spent in the foreground, and dispose an adapter that arrives after failure.
  let initTimeout,expired=false;
  const watchVisibility=()=>{
    clearTimeout(initTimeout);
    if(!document.hidden)initTimeout=setTimeout(()=>{expired=true;rejectInitialization(new Error('WebGPU did not respond. Bring this tab to the foreground and try again, or open the original scene below.'));},15000);
  };
  let rejectInitialization;
  try{
    await new Promise((resolve,reject)=>{
      rejectInitialization=reject;
      document.addEventListener('visibilitychange',watchVisibility);watchVisibility();
      renderer.init().then(()=>{if(expired)renderer.dispose();else resolve();},reject);
    });
  }finally{clearTimeout(initTimeout);document.removeEventListener('visibilitychange',watchVisibility);}
  if(!renderer.backend.isWebGPUBackend){renderer.dispose();throw new Error('A WebGPU graphics adapter could not be opened. This study does not substitute WebGL for GPU compute. Open the original scene below.');}
  document.querySelector('#gpu-backend').textContent='WebGPU active';
  canvas.dataset.backend='webgpu';
  renderer.backend.device.addEventListener('uncapturederror',event=>{renderer.setAnimationLoop(null);showError(`The GPU could not render this study: ${event.error.message.split('\n')[0].slice(0,220)}`);});
  renderer.backend.device.lost.then(info=>{if(info.reason!=='destroyed'){renderer.setAnimationLoop(null);showError('The GPU connection was interrupted. Reload the study or open the original scene.');}});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,quality==='low'?1.3:1.7));
  renderer.setSize(innerWidth,innerHeight,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#bed0dc');scene.fog=new THREE.FogExp2('#bed0dc',.00065);
  camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.3,5200);
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.enablePan=true;controls.screenSpacePanning=false;controls.panSpeed=.55;controls.minDistance=28;controls.maxDistance=950;controls.minPolarAngle=.18;controls.maxPolarAngle=1.54;controls.minAzimuthAngle=-1.45;controls.maxAzimuthAngle=1.45;controls.rotateSpeed=.4;controls.zoomSpeed=.7;
  if(innerWidth<650){camera.fov=52;camera.updateProjectionMatrix();views.approach.position=[47,40,192];}
  controls.addEventListener('start',()=>{flight=null;document.querySelector('#gesture-hint').style.opacity='0';});
  const hemi=new THREE.HemisphereLight('#dae7f0','#55573b',1.05);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#fff2d9',2.2);sun.position.set(-85,150,105);sun.castShadow=true;
  sun.shadow.mapSize.set(quality==='low'?1024:2048,quality==='low'?1024:2048);Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-100,near:5,far:380});sun.shadow.bias=-.0004;sun.shadow.normalBias=.35;sun.shadow.radius=3;sun.target.position.set(0,25,0);scene.add(sun,sun.target);
  const assets=await loadLandscapeAssets(renderer,(loaded,total)=>{document.querySelector('#loading-message').textContent=`Gathering rock, moss & sky… ${loaded} / ${total}`;});
  scene.environment=assets.sky;
  weather=createGPUWeather({scene,renderer,camera,sun,hemi,assets,quality,reducedMotion,time:sceneTime});
  terrain=createTerrain(scene,quality,assets,weather.state,terrainNodeMaterial);
  const grass=scene.getObjectByName('Wind-swept grass'),phases=[];
  for(let i=0;i<grass.count;i++)phases.push(grass.instanceMatrix.array[i*16+12]*.31+grass.instanceMatrix.array[i*16+14]*.18);
  grass.geometry.setAttribute('aGrassPhase',new THREE.InstancedBufferAttribute(new Float32Array(phases),1));
  grass.material.dispose();grass.material=grassNodeMaterial(sceneTime,weather.state.wind);
  water=createGPUWater(scene,quality,weather.state,sceneTime);
  simulation=createSpraySimulation({scene,renderer,quality,weather:weather.state,time:sceneTime,surfaces:terrain.surfaces});
  lab=attachLab({simulation,canvas,isPaused:()=>paused,getView:()=>selected,getWeather:()=>weather.current});
  document.querySelector('#loading-message').textContent='Opening the clear sky…';
  await weather.setMode('clear',true);
  setView('approach',false);updateMotion();
  // Compile before removing the loader, so the opening view is a complete frame.
  document.querySelector('#loading-message').textContent='Letting the water flow…';
  await renderer.compileAsync(scene,camera);resize();last=performance.now();renderer.setAnimationLoop(now=>{try{render(now);}catch(error){console.error(error);renderer.setAnimationLoop(null);showError(error.message);}});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelectorAll('button[data-weather]').forEach(b=>b.addEventListener('click',()=>weather.setMode(b.dataset.weather)));
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
    if(['1','2','3','4','5'].includes(e.key))setView(Object.keys(views)[Number(e.key)-1]);
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
  controls.target.x=THREE.MathUtils.clamp(controls.target.x,-550,550);
  controls.target.z=THREE.MathUtils.clamp(controls.target.z,-950,650);
  controls.target.y=THREE.MathUtils.clamp(controls.target.y,2,180);
  controls.update();
  const floor=terrainHeightAt(camera.position.x,camera.position.z)+3;
  if(camera.position.y<floor){camera.position.y=floor;camera.lookAt(controls.target);}
  sceneTime.value=time;weather.update(now);
  if(!paused){accumulator=Math.min(accumulator+dt,.05);while(accumulator>=SIMULATION_STEP){simulation.step();accumulator-=SIMULATION_STEP;}}
  renderer.render(scene,camera);frame++;lab.frame(now);

  if(frame===3){document.querySelector('#loading').classList.add('done');canvas.dataset.ready='true';console.info(`Skógafoss ready: ${renderer.info.render.triangles} triangles, ${renderer.info.render.drawCalls} draw calls, ${quality} quality`);}
}
init().catch(error=>{console.error(error);showError(error.message || 'The WebGPU study could not load. Try reloading or open the original scene.');});
