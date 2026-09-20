import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { surface, noiseGLSL, randomGenerator, riverCenter, riverWidth, upperRiverCenter, upperRiverWidth, upperRiverHeight } from './nature.js';

export function createWater(scene,quality){
  const uniforms={uTime:{value:0},uSun:{value:new THREE.Vector3(-.5,.7,.4).normalize()}};
  const waterfallGeo=surface(95,160,(u,v)=>{
    const f=1-v,w=25+f*f*8,x=(u-.5)*w,y=1.5+v*58.5,z=-.7+f*f*9;
    return[x,y,z];
  });
  const waterfallMat=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,transparent:true,depthWrite:true,
    vertexShader:`varying vec2 vUv;varying vec3 vWorld;uniform float uTime;${noiseGLSL}
      void main(){vUv=uv;vec3 p=position;float f=1.-uv.y;
      p.z+=f*(sin(uv.x*110.+uTime*3.+uv.y*7.)*.32+sin(uv.y*33.+uTime*8.+uv.x*30.)*.43);
      p.x+=f*f*sin(uv.y*29.+uTime*4.+uv.x*18.)*.48;
      p.z+=f*f*f*f2(vec2(uv.x*27.,uv.y*55.+uTime*8.))*2.8;
      vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uTime;varying vec2 vUv;varying vec3 vWorld;${noiseGLSL}
      void main(){
        float t=uTime;float depth=1.-vUv.y;
        float broad=f2(vec2(vUv.x*19.+sin(vUv.y*4.-t)*.25,vUv.y*4.+t*1.8));
        float ribbon=f2(vec2(vUv.x*90.,vUv.y*9.+t*5.8));
        float fine=n2(vec2(vUv.x*270.,vUv.y*31.+t*17.));
        float edge=smoothstep(0.,.035+broad*.025,vUv.x)*smoothstep(0.,.035+broad*.025,1.-vUv.x);
        float furrow=smoothstep(.24,.75,ribbon);
        float billow=f2(vec2(vUv.x*25.,vUv.y*42.+t*9.));
        vec3 water=mix(vec3(.09,.15,.17),vec3(.91,.97,1.),clamp(.12+broad*.70+furrow*.35+billow*depth*.28,0.,1.));
        water+=fine*.025;water*=.84+.16*smoothstep(0.,.6,depth);
        float alpha=edge*(.91+.09*ribbon)*smoothstep(0.,.02,vUv.y);
        gl_FragColor=vec4(water,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const waterfall=new THREE.Mesh(waterfallGeo,waterfallMat);scene.add(waterfall);


  const riverMat=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,
    vertexShader:`varying vec3 vWorld;varying vec2 vUv;uniform float uTime;void main(){vUv=uv;vec3 p=position;p.y+=.05*sin(p.z*1.4-uTime*3.)+.035*sin(p.x*1.8+p.z*.7-uTime*2.);vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uTime;uniform vec3 uSun;varying vec3 vWorld;varying vec2 vUv;${noiseGLSL}
      void main(){vec2 p=vWorld.xz;float t=uTime;
        float n=f2(vec2(p.x*.23,p.y*.37-t*1.3));
        float ripple=sin(p.y*2.4-t*5.+f2(p*.7)*5.);
        vec3 N=normalize(vec3(.13*sin(p.x*1.9+p.y*.6-t*1.4),1.,.15*ripple));
        vec3 V=normalize(cameraPosition-vWorld);float fres=pow(1.-max(dot(N,V),0.),3.);
        vec3 col=mix(vec3(.07,.13,.13),vec3(.30,.38,.36),fres*.75+n*.25);
        float spec=pow(max(dot(reflect(-uSun,N),V),0.),65.);col+=vec3(.95,.83,.6)*spec*.6;
        float distanceToFall=length((p-vec2(0.,9.))*vec2(.85,1.));
        float impact=(1.-smoothstep(8.,29.,distanceToFall))*smoothstep(.35,.64,f2(vec2(p.x*.45,p.y*.65-t*1.4)));
        float foam=smoothstep(.70,.86,n2(vec2(p.x*.85,p.y*1.6-t*3.)))*.25;
        foam+=impact*.75;float streak=pow(max(0.,sin(p.y*3.-t*5.+n*5.)),18.)*.1;
        col=mix(col,vec3(.70,.78,.74),min(1.,foam+streak));
        float reflection=exp(-pow(p.x/18.,2.))*(1.-smoothstep(5.,100.,p.y))*smoothstep(-5.,0.,p.y)*(.15+.16*n);
        col+=vec3(.55,.62,.60)*reflection;
        float fog=1.-exp(-.000003*pow(length(cameraPosition-vWorld),2.));col=mix(col,vec3(.49,.59,.66),fog);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });const river=createReflectiveRiver(scene,quality);
  const upperGeo=surface(26,420,(u,v)=>{const z=-.7-v*v*3700;return[upperRiverCenter(z)+(u-.5)*upperRiverWidth(z)*2,upperRiverHeight(z),z];});
  const upperRiver=new THREE.Mesh(upperGeo,riverMat);scene.add(upperRiver);

  const rand=randomGenerator(108),count=quality==='low'?1600:3800,p=[],seeds=[],sizes=[];
  for(let i=0;i<count;i++){p.push((rand()-.5)*32,rand(),rand());seeds.push(rand());sizes.push(.10+rand()*.22);}
  const dropsGeo=new THREE.BufferGeometry();dropsGeo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));dropsGeo.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));dropsGeo.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
  const dropsMat=new THREE.ShaderMaterial({uniforms:{...uniforms,uPixelRatio:{value:Math.min(devicePixelRatio,1.75)}},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime;uniform float uPixelRatio;attribute float aSeed;attribute float aSize;varying float vAlpha;void main(){float life=fract(position.y+uTime*(.17+aSeed*.1));vec3 p=vec3(position.x*(.8+life*.25),60.-59.*life*life,1.+life*life*9.+sin(aSeed*111.)*1.4);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*850.*uPixelRatio/-mv.z,1.,10.);vAlpha=.22*life;}`,
    fragmentShader:`varying float vAlpha;void main(){vec2 p=gl_PointCoord-.5;float a=1.-smoothstep(.1,.5,length(p));gl_FragColor=vec4(.87,.94,.9,a*vAlpha);}`
  });const drops=new THREE.Points(dropsGeo,dropsMat);drops.frustumCulled=false;scene.add(drops);

  const mistCount=quality==='low'?100:180,mp=[],ms=[];
  for(let i=0;i<mistCount;i++){mp.push(rand(),rand(),rand());ms.push(rand());}
  const mistGeo=new THREE.BufferGeometry();mistGeo.setAttribute('position',new THREE.Float32BufferAttribute(mp,3));mistGeo.setAttribute('aSeed',new THREE.Float32BufferAttribute(ms,1));
  const mistMat=new THREE.ShaderMaterial({uniforms:{...uniforms,uPixelRatio:{value:Math.min(devicePixelRatio,1.75)}},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime;uniform float uPixelRatio;attribute float aSeed;varying float vAlpha;varying float vSeed;void main(){float age=fract(position.z+uTime*(.035+aSeed*.025));float spread=10.+age*25.;vec3 p=vec3((position.x-.5)*spread*2.+sin(age*3.+aSeed*10.)*3.,1.+age*(9.+position.y*10.),8.+age*24.+position.y*5.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(240.,(6.+age*15.)*720.*uPixelRatio/-mv.z);vAlpha=sin(age*3.14159)*.13;vSeed=aSeed;}`,
    fragmentShader:`uniform float uTime;varying float vAlpha;varying float vSeed;${noiseGLSL}void main(){vec2 q=gl_PointCoord-.5;float d=length(q);float n=f2(q*6.+vSeed*31.+uTime*.08);float a=(1.-smoothstep(.05,.5,d))*(.3+n*.7);gl_FragColor=vec4(.87,.92,.96,a*vAlpha);}`
  });const mist=new THREE.Points(mistGeo,mistMat);mist.frustumCulled=false;mist.renderOrder=5;scene.add(mist);
  return{update(t){uniforms.uTime.value=t;river.material.uniforms.time.value=t;},waterfall,river};
}


function createReflectiveRiver(scene, quality) {
  // Water's mirror plane is local XY. Rotate to XZ after making the river outline.
  const geometry = surface(34, 290, (u, v) => {
    const z = -2 + v * v * 3502;
    return [riverCenter(z) + (u - .5) * riverWidth(z) * 2, -z, 0];
  }, true);
  const size = 256, data = new Uint8Array(size * size * 4);
  // Periodic normal field, so all four scrolling samples tile without seams.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const nx = Math.sin(u * 7 + v * 11) * .24 + Math.sin(u * 19 - v * 7) * .11;
    const ny = Math.cos(v * 13 + u * 3) * .27 + Math.sin(v * 27 + u * 17) * .08;
    const n = new THREE.Vector3(nx, ny, 1).normalize(), i = (y * size + x) * 4;
    data[i] = (n.x * .5 + .5) * 255; data[i + 1] = (n.y * .5 + .5) * 255; data[i + 2] = (n.z * .5 + .5) * 255; data[i + 3] = 255;
  }
  const normals = new THREE.DataTexture(data, size, size);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.magFilter = THREE.LinearFilter; normals.minFilter = THREE.LinearMipmapLinearFilter; normals.generateMipmaps = true; normals.needsUpdate = true;
  const river = new Water(geometry, {
    textureWidth: quality === 'low' ? 256 : 768, textureHeight: quality === 'low' ? 256 : 768,
    waterNormals: normals, sunDirection: new THREE.Vector3(-.6, .8, .6).normalize(),
    sunColor: '#e5e9de', waterColor: '#253e43', distortionScale: 3.5, fog: true
  });
  river.rotation.x = -Math.PI / 2; river.position.y = .48;
  river.material.uniforms.size.value = 13;
  river.material.vertexShader = 'varying vec2 vRiverUv;\n' + river.material.vertexShader;
  river.material.vertexShader = river.material.vertexShader.replace('worldPosition = mirrorCoord.xyzw;', 'worldPosition = mirrorCoord.xyzw; vRiverUv = uv;');
  river.material.fragmentShader = 'varying vec2 vRiverUv;\n' + noiseGLSL + river.material.fragmentShader;
  river.material.fragmentShader = river.material.fragmentShader.replace('vec3 outgoingLight = albedo;', `
    vec2 flowP = worldPosition.xz;
    float turbulent = f2(vec2(flowP.x * .48, flowP.y * .65 - time * 2.3));
    float impact = (1. - smoothstep(8., 34., length((flowP - vec2(0., 11.)) * vec2(.8, 1.)))) * smoothstep(.29, .65, turbulent);
    float bank = pow(abs(vRiverUv.x * 2. - 1.), 15.) * smoothstep(.52, .76, turbulent) * .45;
    float wake = (1. - smoothstep(24., 160., flowP.y)) * (1. - smoothstep(8., 25., abs(flowP.x))) * smoothstep(.69, .82, turbulent) * .44;
    vec3 outgoingLight = mix(albedo, vec3(.72, .83, .86), clamp(impact * .92 + bank + wake, 0., .95));`);
  river.receiveShadow = true; scene.add(river); return river;
}
