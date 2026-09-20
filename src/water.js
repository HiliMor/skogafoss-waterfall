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
  // Unequal banks create a heavier left-hand plume and a narrower torn right edge.
  const left=-width*.5-depth*(1.7+Math.sin(depth*18+.5)*1.1);
  const right=width*.5+depth*(.5+Math.sin(depth*13+2)*.7);
  const x=v<.22 ? center+(u-.5)*width : center+left+(right-left)*u;
  const lobes=(Math.sin(u*17+.8)+.5*Math.sin(u*37+depth*8))*Math.sin(Math.min(1,depth)*Math.PI)*1.65;
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
        float folds=f2(vec2(uv.x*24.+sin(travel*18.-uTime*3.)*.7,travel*32.-uTime*5.));
        p.z+=body*(folds-.5)*(1.+depth*5.);
        p.x+=body*depth*(sin(travel*29.-uTime*4.+uv.x*11.)*.6+uWind*depth*.65);
        vWorld=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uTime;varying vec2 vUv;varying vec3 vWorld;${noiseGLSL}${atmosphere}
      void main(){
        float depth=clamp((60.-vWorld.y)/59.,0.,1.),travel=sqrt(depth),t=uTime;
        // A falling coordinate accelerates the texture; lateral warping grows as
        // compact upper ribbons break into irregular, aerated bodies below.
        float aeration=smoothstep(.03,.72,depth);
        vec2 flow=vec2(vUv.x*62.,travel*132.-t*19.5);
        vec2 warp=vec2(f2(flow*.63),f2(flow*.49+17.))-.5;
        vec2 billow=flow+warp*vec2(2.8,3.2)*aeration;
        float broad=f2(vec2(vUv.x*12.+warp.x*aeration,travel*16.-t*2.5));
        float ribbon=f2(vec2(vUv.x*148.+warp.x*aeration*6.,travel*73.-t*10.8));
        float fine=n2(billow*vec2(7.,3.));
        float plume=f2(billow);
        float froth=smoothstep(.23,.76,plume+ribbon*.18);
        float stream=.5+.23*sin(vUv.x*17.+.8)+.17*sin(vUv.x*39.+1.5);
        float channelA=exp(-pow((vUv.x-.27-warp.x*.035)/.040,2.));
        float channelB=exp(-pow((vUv.x-.61-warp.y*.05)/.028,2.));
        float channelC=exp(-pow((vUv.x-.83-warp.x*.025)/.020,2.));
        float channels=(channelA*.8+channelB+channelC*.65)*(1.-smoothstep(.22,.92,depth));
        float foam=clamp(.1+stream*.18+broad*.17+ribbon*.35+froth*(.3+aeration*.23)-channels*.29,0.,1.);
        vec3 falling=mix(vec3(.07,.12,.15),vec3(.60,.70,.74),smoothstep(.08,.97,foam));
        // Smaller moving ridges stay visible inside the bright plumes, instead
        // of letting tone mapping merge whole streams into flat white patches.
        float ridge=f2(billow+vec2(.4,-.25))-plume;
        falling*=.71+froth*.18+fine*.20+ridge*.65;
        vec2 p=vWorld.xz;
        float ripple=f2(vec2(p.x*.6,p.y*.43-t*2.2));
        vec3 upstream=mix(vec3(.055,.10,.12),vec3(.64,.75,.78),smoothstep(.48,.79,ripple)*.85);
        upstream+=pow(max(0.,sin(p.y*1.9-t*6.+ripple*8.)),16.)*.19;
        vec3 color=mix(upstream,falling,smoothstep(.205,.31,vUv.y));
        float edgeNoise=f2(vec2(travel*110.-t*16.,vUv.x*39.));
        float edgeWidth=.003+depth*(.009+edgeNoise*.05);
        float fray=(edgeNoise-.5)*depth*.025;
        float edge=smoothstep(0.,edgeWidth,vUv.x+fray)*smoothstep(0.,edgeWidth*.75,1.-vUv.x-fray);
        float thin=smoothstep(.20,.5,stream+ribbon*.3);
        float alpha=edge*mix(1.,.65+thin*.35-channels*.34,smoothstep(.3,.5,vUv.y))*(1.-smoothstep(.955,1.,vUv.y));
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
  // Larger, soft bodies of aerated water give the falling sheet volume. Their
  // ballistic paths and independent phases avoid a single repeating curtain.
  const foamCount=quality==='low'?1000:2400,fp=[],fs=[];
  for(let i=0;i<foamCount;i++){fp.push(rand(),rand(),rand());fs.push(rand());}
  const foamGeo=new THREE.BufferGeometry();foamGeo.setAttribute('position',new THREE.Float32BufferAttribute(fp,3));foamGeo.setAttribute('aSeed',new THREE.Float32BufferAttribute(fs,1));
  const foamMat=new THREE.ShaderMaterial({uniforms:{...uniforms,uPixelRatio:{value:Math.min(devicePixelRatio,1.75)}},transparent:true,depthWrite:false,
    vertexShader:`uniform float uTime,uPixelRatio,uWind;attribute float aSeed;varying float vAlpha,vSeed,vDepth;varying vec3 vWorld;
      void main(){float age=fract(position.y+uTime*(.23+aSeed*.04)),depth=age*age;
        float width=25.+depth*depth*(7.+1.6*sin(depth*11.));
        float left=-width*.5-depth*(1.7+sin(depth*18.+.5)*1.1);
        float right=width*.5+depth*(.5+sin(depth*13.+2.)*.7);
        float x=mix(left,right,position.x)+depth*depth*(.9+uWind*.65);
        float d=max(0.,(depth*58.7-1.8)/56.9);
        float lobe=(sin(position.x*17.+.8)+.5*sin(position.x*37.+depth*8.))*sin(depth*3.14159)*1.65;
        vec3 p=vec3(x,60.1525-depth*58.7,1.1+d*4.+d*d*5.+lobe+1.1+position.z*2.4);
        vWorld=(modelMatrix*vec4(p,1.)).xyz;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        float size=(.25+pow(aSeed,2.)*1.5)*(.45+depth*.95);
        gl_PointSize=clamp(size*850.*uPixelRatio/-mv.z,1.,90.);
        vAlpha=smoothstep(.04,.18,depth)*(1.-smoothstep(.86,1.,depth))*(.27+aSeed*.34);vSeed=aSeed;vDepth=depth;
      }`,
    fragmentShader:`uniform float uTime;varying float vAlpha,vSeed,vDepth;varying vec3 vWorld;${noiseGLSL}${atmosphere}
      void main(){vec2 q=gl_PointCoord-.5;q.x*=1.6-vDepth*.55;
        float n=f2(q*10.+vSeed*71.);
        float radius=length(q)+(.5-n)*.18;
        float a=(1.-smoothstep(.12,.46,radius))*(.48+n*.52)*vAlpha;
        float light=clamp(.64-q.x*.4+q.y*.24+(n-.5)*.35,.2,1.);
        vec3 col=mix(vec3(.28,.40,.46),vec3(.87,.94,.97),light);
        gl_FragColor=vec4(atmosphericWater(col,vWorld),a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });const foamBodies=new THREE.Points(foamGeo,foamMat);foamBodies.name='Aerated waterfall plumes';foamBodies.frustumCulled=false;scene.add(foamBodies);
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
