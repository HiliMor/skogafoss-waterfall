import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { surface, noiseGLSL, randomGenerator, riverCenter, riverWidth, upperRiverCenter, upperRiverWidth, upperRiverHeight } from './nature.js';

// One continuous sheet from the upstream reach, around the lip and down the fall.
export function waterfallPoint(u, v) {
  let z,y,depth;
  if(v<=.22){z=-36+(v/.22)*35.3;y=upperRiverHeight(z);depth=0;}
  else if(v<=.30){const angle=(v-.22)/.08*Math.PI/2;z=-.7+1.8*Math.sin(angle);y=upperRiverHeight(-.7)-1.8*(1-Math.cos(angle));depth=(60.15-y)/59;}
  else{const d=(v-.30)/.70;y=upperRiverHeight(-.7)-1.8-d*56.9;z=1.1+d*4+d*d*5;depth=d;}
  depth=Math.max(0,(upperRiverHeight(-.7)-y)/58.7);
  const width=v<.22 ? upperRiverWidth(z)*2 : upperRiverWidth(-.7)*2+depth*depth*(7+1.6*Math.sin(depth*11));
  const center=v<.22 ? upperRiverCenter(z) : upperRiverCenter(-.7)+depth*depth*.9;
  const x=center+(u-.5)*width+Math.sign(u-.5)*Math.abs(u-.5)*2*depth*Math.sin(depth*19+u*7)*.8;
  const lobes=(Math.sin(u*13+.8)+.5*Math.sin(u*29))*Math.sin(Math.min(1,depth)*Math.PI)*.7;
  return [x,y,z+lobes];
}

export function createWater(scene,quality,weather){
  const uniforms={
    uTime:{value:0},uSun:{value:new THREE.Vector3(-.5,.7,.4).normalize()},
    uWaterTint:weather.lightColor,uLight:weather.light,uFogColor:weather.fogColor,uFogDensity:weather.fogDensity,uWind:weather.wind,uSpray:weather.spray
  };
  const atmosphere=`uniform vec3 uWaterTint,uFogColor;uniform float uLight,uFogDensity;
    vec3 atmosphericWater(vec3 c,vec3 world){float f=1.-exp(-pow(length(cameraPosition-world)*uFogDensity,2.));return mix(c*uWaterTint*uLight,uFogColor,f);}`;
  const waterfallGeo=surface(110,230,waterfallPoint);
  const waterfallMat=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,transparent:true,depthWrite:true,
    vertexShader:`varying vec2 vUv;varying vec3 vWorld;uniform float uTime,uWind;${noiseGLSL}
      void main(){vUv=uv;vec3 p=position;float depth=clamp((60.-position.y)/59.,0.,1.);
        float body=smoothstep(.26,.45,uv.y);float travel=sqrt(depth);
        float folds=f2(vec2(uv.x*21.,travel*18.-uTime*2.6));
        p.z+=body*(folds-.5)*(.5+depth*2.5);
        p.x+=body*depth*(sin(travel*13.-uTime*2.+uv.x*9.)*.28+uWind*depth*.65);
        vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uTime;varying vec2 vUv;varying vec3 vWorld;${noiseGLSL}${atmosphere}
      void main(){
        float depth=clamp((60.-vWorld.y)/59.,0.,1.),travel=sqrt(depth),t=uTime;
        float broad=f2(vec2(vUv.x*13.+sin(travel*5.-t)*.24,travel*12.-t*3.1));
        float ribbon=f2(vec2(vUv.x*74.,travel*24.-t*7.4));
        float fine=n2(vec2(vUv.x*210.,travel*67.-t*19.));
        float plumes=f2(vec2(vUv.x*31.+sin(travel*9.)*.6,travel*56.-t*12.));
        float stream=.5+.25*sin(vUv.x*15.+.8)+.19*sin(vUv.x*32.);
        float aeration=smoothstep(.06,.8,depth);
        float channelA=exp(-pow((vUv.x-.32-sin(travel*7.)*.018)/.049,2.));
        float channelB=exp(-pow((vUv.x-.66-sin(travel*9.+1.)*.016)/.038,2.));
        float channels=(channelA*.8+channelB*.65)*(1.-smoothstep(.18,.78,depth));
        float foam=clamp(.08+stream*.30+broad*.37+ribbon*.40+aeration*plumes*.56-channels*.28,0.,1.);
        vec3 falling=mix(vec3(.09,.14,.16),vec3(.94,.98,1.),foam);
        falling+=fine*.035;
        vec2 p=vWorld.xz;
        float ripple=f2(vec2(p.x*.6,p.y*.43-t*2.2));
        vec3 upstream=mix(vec3(.055,.10,.12),vec3(.64,.75,.78),smoothstep(.48,.79,ripple)*.85);
        upstream+=pow(max(0.,sin(p.y*1.9-t*6.+ripple*8.)),16.)*.19;
        vec3 color=mix(upstream,falling,smoothstep(.205,.31,vUv.y));
        float edgeNoise=f2(vec2(vUv.y*42.-t*4.,vUv.x*23.));
        float edgeWidth=.007+depth*(.012+edgeNoise*.025);
        float edge=smoothstep(0.,edgeWidth,vUv.x)*smoothstep(0.,edgeWidth,1.-vUv.x);
        float thin=smoothstep(.05,.3,stream+ribbon*.18);
        float alpha=edge*mix(1.,.74+thin*.26-channels*.25,smoothstep(.3,.5,vUv.y))*(1.-smoothstep(.965,1.,vUv.y));
        gl_FragColor=vec4(atmosphericWater(color,vWorld),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const waterfall=new THREE.Mesh(waterfallGeo,waterfallMat);waterfall.name='Continuous river lip and waterfall';scene.add(waterfall);
  const riverMat=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,
    vertexShader:`varying vec3 vWorld;uniform float uTime;void main(){vec3 p=position;float upstream=(1.-smoothstep(-50.,-36.,p.z));p.y+=upstream*(.045*sin(p.z*1.4-uTime*3.)+.025*sin(p.x*1.8+p.z*.7-uTime*2.));vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uTime;varying vec3 vWorld;${noiseGLSL}${atmosphere}
      void main(){vec2 p=vWorld.xz;float n=f2(vec2(p.x*.6,p.y*.43-uTime*2.2));
        vec3 col=mix(vec3(.055,.10,.12),vec3(.64,.75,.78),smoothstep(.48,.79,n)*.85);
        col+=pow(max(0.,sin(p.y*1.9-uTime*6.+n*8.)),16.)*.19;
        gl_FragColor=vec4(atmosphericWater(col,vWorld),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const river=createReflectiveRiver(scene,quality,weather);
  const upperGeo=surface(30,420,(u,v)=>{const z=-36-v*v*3664;return[upperRiverCenter(z)+(u-.5)*upperRiverWidth(z)*2,upperRiverHeight(z),z];});
  const upperRiver=new THREE.Mesh(upperGeo,riverMat);scene.add(upperRiver);

  const rand=randomGenerator(108),count=quality==='low'?1900:4400,p=[],seeds=[],sizes=[];
  for(let i=0;i<count;i++){p.push((rand()-.5)*31,rand(),rand());seeds.push(rand());sizes.push(.09+rand()*.24);}
  const dropsGeo=new THREE.BufferGeometry();dropsGeo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));dropsGeo.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,1));dropsGeo.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
  const dropsMat=new THREE.ShaderMaterial({uniforms:{...uniforms,uPixelRatio:{value:Math.min(devicePixelRatio,1.75)}},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime,uPixelRatio,uWind;attribute float aSeed,aSize;varying float vAlpha;void main(){float life=fract(position.y+uTime*(.17+aSeed*.1));vec3 p=vec3(position.x*(.8+life*.25)+life*life*uWind,60.-59.*life*life,1.+life*life*9.+sin(aSeed*111.)*2.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*850.*uPixelRatio/-mv.z,1.,10.);vAlpha=.20*life;}`,
    fragmentShader:`uniform vec3 uWaterTint;uniform float uLight;varying float vAlpha;void main(){float a=1.-smoothstep(.08,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(uWaterTint*uLight,a*vAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });const drops=new THREE.Points(dropsGeo,dropsMat);drops.frustumCulled=false;scene.add(drops);
  const mistCount=quality==='low'?140:290,mp=[],ms=[];
  for(let i=0;i<mistCount;i++){mp.push(rand(),rand(),rand());ms.push(rand());}
  const mistGeo=new THREE.BufferGeometry();mistGeo.setAttribute('position',new THREE.Float32BufferAttribute(mp,3));mistGeo.setAttribute('aSeed',new THREE.Float32BufferAttribute(ms,1));
  const mistMat=new THREE.ShaderMaterial({uniforms:{...uniforms,uPixelRatio:{value:Math.min(devicePixelRatio,1.75)}},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime,uPixelRatio,uWind,uSpray;attribute float aSeed;varying float vAlpha,vSeed;void main(){float age=fract(position.z+uTime*(.035+aSeed*.025));float spread=11.+age*24.;vec3 p=vec3((position.x-.5)*spread*2.+age*uWind*13.,1.+age*(11.+position.y*12.),9.+age*25.+position.y*6.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(240.,(6.+age*16.)*720.*uPixelRatio/-mv.z);vAlpha=sin(age*3.14159)*.09*uSpray;vSeed=aSeed;}`,
    fragmentShader:`uniform float uTime,uLight;uniform vec3 uWaterTint;varying float vAlpha,vSeed;${noiseGLSL}void main(){vec2 q=gl_PointCoord-.5;float n=f2(q*7.+vSeed*31.+uTime*.08);float a=(1.-smoothstep(.03,.5,length(q)))*(.2+n*.8);gl_FragColor=vec4(uWaterTint*uLight*.86,a*vAlpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });const mist=new THREE.Points(mistGeo,mistMat);mist.frustumCulled=false;mist.renderOrder=5;scene.add(mist);
  return{update(t){uniforms.uTime.value=t;river.material.uniforms.time.value=t;},waterfall,river};
}


function createReflectiveRiver(scene, quality, weather) {
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
  river.material.uniforms.sunColor=weather.sunColor;river.material.uniforms.sunDirection=weather.sunDirection;
  river.material.uniforms.uWaterTint=weather.lightColor;river.material.uniforms.uLight=weather.light;
  river.material.vertexShader = 'varying vec2 vRiverUv;\n' + river.material.vertexShader;
  river.material.vertexShader = river.material.vertexShader.replace('worldPosition = mirrorCoord.xyzw;', 'worldPosition = mirrorCoord.xyzw; vRiverUv = uv;');
  river.material.fragmentShader = 'varying vec2 vRiverUv; uniform vec3 uWaterTint; uniform float uLight;\n' + noiseGLSL + river.material.fragmentShader;
  river.material.fragmentShader = river.material.fragmentShader.replace('vec3 outgoingLight = albedo;', `
    vec2 flowP = worldPosition.xz;
    float turbulent = f2(vec2(flowP.x * .48, flowP.y * .65 - time * 2.3));
    float impact = (1. - smoothstep(8., 34., length((flowP - vec2(0., 11.)) * vec2(.8, 1.)))) * smoothstep(.29, .65, turbulent);
    float bank = pow(abs(vRiverUv.x * 2. - 1.), 15.) * smoothstep(.52, .76, turbulent) * .45;
    float wake = (1. - smoothstep(24., 160., flowP.y)) * (1. - smoothstep(8., 25., abs(flowP.x))) * smoothstep(.69, .82, turbulent) * .44;
    vec3 outgoingLight = mix(albedo, vec3(.72, .83, .86)*uWaterTint*uLight, clamp(impact * .92 + bank + wake, 0., .95));`);
  river.receiveShadow = true; scene.add(river); return river;
}
