import * as THREE from 'three';

export function randomGenerator(seed = 815) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const fract = x => x - Math.floor(x);
function hash(x, y) { return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123); }
export function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let u = fract(x), v = fract(y);
  u = u*u*(3-2*u); v = v*v*(3-2*v);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),u),THREE.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),u),v);
}
export function fbm(x, y) { return noise(x,y)*.57 + noise(x*2.03+3,y*2.03)*.28 + noise(x*4.17,y*4.17+6)*.15; }
export const smooth = (a,b,x) => THREE.MathUtils.smoothstep(x,a,b);
export function surface(nx, ny, point, reverse=false) {
  const p=[],uv=[],idx=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){p.push(...point(i/nx,j/ny));uv.push(i/nx,j/ny);}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1; reverse?idx.push(a,c,b,b,c,d):idx.push(a,b,c,b,d,c);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
export const noiseGLSL = `
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);}
float f2(vec2 p){return .57*n2(p)+.28*n2(p*2.03+3.)+.15*n2(p*4.17+6.);}
`;

export const cliffHeight = x => 58.3 + 13*Math.exp(-(((x+71)/43)**2)) + 8*Math.exp(-(((x-75)/50)**2)) + Math.sin(x*.083)*1.2*smooth(12,30,Math.abs(x));
export function cliffFront(x,y) {
  const h=cliffHeight(x),s=Math.abs(x),flank=smooth(12,29,s);
  const shelves=Math.sin(y*.67+noise(x*.019,9)*5)*noise(x*.13,y*.026)*1.15;
  const fissures=(noise(x*.35,y*.016)-.5)*3.5;
  return -4 + flank*(18+7*Math.sin(x*.048)+9*(1-y/h)) + flank*((fbm(x*.11,y*.14)-.5)*8+shelves+fissures);
}
export const riverCenter = z => -3+Math.sin(z*.019)*13;
export const riverWidth = z => 16+Math.max(0,z)*.033+Math.sin(z*.03)*3;
export function groundHeight(x,z) {
  const edge=Math.abs(x-riverCenter(z))-riverWidth(z);
  return -1.3+smooth(-2,5,edge)*(2.5+fbm(x*.14,z*.14)*1.25)+Math.max(0,Math.abs(x)-115)*.08;
}

function natureMaterial() {
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.92});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vNaturePosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      vec4 natureP=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        natureP=instanceMatrix*natureP;
      #endif
      vNaturePosition=(modelMatrix*natureP).xyz;`);
    shader.fragmentShader='varying vec3 vNaturePosition;\n'+noiseGLSL+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float grain=f2(vNaturePosition.xz*1.6+vNaturePosition.y*.65);
      float seam=smoothstep(.70,.92,n2(vec2(vNaturePosition.x*.11,vNaturePosition.y*1.2)));
      diffuseColor.rgb*=.62+grain*.64;
      diffuseColor.rgb*=1.-seam*.26;`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float textureHeight=f2(vNaturePosition.xy*2.8+vNaturePosition.z*.7)*.065+f2(vNaturePosition.xz*5.)*.045;
      vec3 dp1=dFdx(-vViewPosition),dp2=dFdy(-vViewPosition);
      vec3 r1=cross(dp2,normal),r2=cross(normal,dp1);
      float det=dot(dp1,r1);
      vec3 grad=sign(det)*(dFdx(textureHeight)*r1+dFdy(textureHeight)*r2);
      normal=normalize(abs(det)*normal-grad);`);
  };
  return mat;
}
function colorGeometry(g,fn) {
  const p=g.attributes.position,c=[];
  for(let i=0;i<p.count;i++){const col=fn(p.getX(i),p.getY(i),p.getZ(i));c.push(col.r,col.g,col.b);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
}

export function createTerrain(scene,quality) {
  const rand=randomGenerator(1909),mat=natureMaterial();
  const basalt=new THREE.Color('#414740'),shade=new THREE.Color('#27342f'),moss=new THREE.Color('#4e6838'),sunMoss=new THREE.Color('#7d874a');
  const cliff=surface(300,110,(u,v)=>{const x=(u-.5)*360;let y=-1+v*(cliffHeight(x)+1);y+=(fbm(x*.32,y*.4)-.5)*.65*smooth(.02,.08,v)*(1-smooth(.95,1,v));return [x,y,cliffFront(x,y)];});
  colorGeometry(cliff,(x,y,z)=>{
    const n=fbm(x*.06,y*.09),h=cliffHeight(x);
    const c=basalt.clone().lerp(shade,noise(x*.11,y*.07));
    const green=smooth(.55,.96,y/h+n*.38)*smooth(11,18,Math.abs(x));
    c.lerp(moss.clone().lerp(sunMoss,noise(x*.23,y*.18)),green);
    c.multiplyScalar(.72+.32*noise(x*.3,y*.12));return c;
  });
  const cliffMesh=new THREE.Mesh(cliff,mat);cliffMesh.castShadow=true;cliffMesh.receiveShadow=true;scene.add(cliffMesh);
  const plateau=surface(240,120,(u,v)=>{const x=(u-.5)*360,z=cliffFront(x,cliffHeight(x))-v*270;let y=cliffHeight(x)+v*14+(fbm(x*.027,z*.028)-.5)*22*smooth(0,.08,v);const channel=1-smooth(11,16,Math.abs(x-4*Math.sin(-z*.012)));y=THREE.MathUtils.lerp(y,59.6+Math.max(0,-z)*14/270,channel);return[x,y,z];});
  colorGeometry(plateau,(x,y,z)=>moss.clone().lerp(sunMoss,fbm(x*.07,z*.07)).multiplyScalar(.8+noise(x*.35,z*.35)*.25));
  const topMesh=new THREE.Mesh(plateau,mat);topMesh.receiveShadow=true;scene.add(topMesh);
  // The eastern flank slopes into the river valley and carries the staircase.
  const hillside=surface(140,110,(u,v)=>{const x=28+u*175,z=cliffFront(x,cliffHeight(x))+v*106,y=cliffHeight(x)*Math.pow(1-v,1.6)*smooth(28,51,x)+1.1;return[x,y,z];},true);
  colorGeometry(hillside,(x,y,z)=>moss.clone().lerp(sunMoss,fbm(x*.09,z*.09)).lerp(basalt,smooth(.54,.75,fbm(x*.17,z*.13))));
  const hill=new THREE.Mesh(hillside,mat);hill.receiveShadow=true;hill.castShadow=true;scene.add(hill);
  const ground=surface(260,260,(u,v)=>{const x=(u-.5)*760,z=-80+v*730;return [x,groundHeight(x,z),z];},true);
  colorGeometry(ground,(x,y,z)=>new THREE.Color('#424942').lerp(new THREE.Color('#747466'),noise(x*.65,z*.65)).multiplyScalar(.65+noise(x*.06,z*.06)*.25));
  const groundMesh=new THREE.Mesh(ground,mat);groundMesh.receiveShadow=true;scene.add(groundMesh);

  // Shared instanced boulders and pebbles keep the scene economical.
  const rockGeo=new THREE.IcosahedronGeometry(1,1);const rp=rockGeo.attributes.position;
  for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),d=.84+noise(x*6+z*8,y*7)*.26;rp.setXYZ(i,x*d,y*d,z*d);}rockGeo.computeVertexNormals();
  colorGeometry(rockGeo,()=>new THREE.Color('#788079'));
  const rockCount=quality==='low'?1500:6200,rocks=new THREE.InstancedMesh(rockGeo,mat,rockCount),dummy=new THREE.Object3D();
  for(let i=0;i<rockCount;i++){
    const z=rand()*260-2,x=(rand()-.5)*200;
    let size=.09+rand()**7*1.8;if(i<95)size=.8+rand()*2.6;
    if(Math.abs(x-riverCenter(z))<riverWidth(z)+.4)size*=.42;
    dummy.position.set(x,groundHeight(x,z)+size*.25,z);dummy.scale.set(size*(.8+rand()*.8),size*(.4+rand()*.4),size*(.7+rand()*.8));dummy.rotation.set(rand(),rand()*6.28,rand());dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
    rocks.setColorAt(i,new THREE.Color().setRGB(.4+rand()*.25,.43+rand()*.25,.4+rand()*.22));
  }
  rocks.receiveShadow=true;rocks.castShadow=true;scene.add(rocks);

  // Low turf tufts on the plateau; a few silhouettes add scale at the rim.
  const grassMat=new THREE.MeshStandardMaterial({color:'#777d44',side:THREE.DoubleSide,roughness:1});
  const grassGeo=new THREE.BufferGeometry();grassGeo.setAttribute('position',new THREE.Float32BufferAttribute([-.13,0,0,.13,0,0,.03,1,0,0,0,-.13,0,0,.13,0,.8,.03],3));grassGeo.computeVertexNormals();
  const grass=new THREE.InstancedMesh(grassGeo,grassMat,quality==='low'?1300:3800);
  for(let i=0;i<grass.count;i++){const x=(rand()-.5)*255,z=cliffFront(x,cliffHeight(x))-rand()*7;if(Math.abs(x)<15){dummy.position.set(0,-200,0);}else{dummy.position.set(x,cliffHeight(x),z);}dummy.scale.setScalar(.25+rand()*.65);dummy.rotation.set(0,rand()*6.28,0);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);grass.setColorAt(i,new THREE.Color().setHSL(.18+rand()*.025,.2+rand()*.2,.4+rand()*.18));}scene.add(grass);

  createStairs(scene);
  createHikers(scene);
  return {cliff:cliffMesh,rockCount};
}

function createStairs(scene){
  // An interpretive version of the path and lookout to the right of the falls.
  const mat=new THREE.MeshStandardMaterial({color:'#756e5e',roughness:1});
  const railMat=new THREE.MeshStandardMaterial({color:'#4b5148',roughness:.8});
  const count=220,steps=new THREE.InstancedMesh(new THREE.BoxGeometry(2,.18,.43),mat,count),d=new THREE.Object3D();
  const path=t=>{const x=123-67*t;return new THREE.Vector3(x,cliffHeight(x)*Math.pow(t,1.6)+1.3,cliffFront(x,cliffHeight(x))+(1-t)*106);};
  for(let i=0;i<count;i++){const t=i/(count-1),p=path(t);d.position.copy(p);d.rotation.y=.3;d.updateMatrix();steps.setMatrixAt(i,d.matrix);}steps.receiveShadow=true;scene.add(steps);
  const posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.045,1.1,5),railMat,90);let postIndex=0;
  for(const side of [-1,1]){
    const pts=[];
    for(let j=0;j<=44;j++){const p=path(j/44);p.x+=side*1.05;d.position.copy(p).y+=.55;d.rotation.set(0,0,0);d.updateMatrix();posts.setMatrixAt(postIndex++,d.matrix);pts.push(p.add(new THREE.Vector3(0,1.1,0)));}
    const rail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),100,.035,4,false),railMat);scene.add(rail);
  }
  scene.add(posts);const platform=new THREE.Mesh(new THREE.BoxGeometry(7,.35,4),mat);platform.position.copy(path(1));scene.add(platform);
}
function createHikers(scene){
  const positions=[[-26,52,.08],[-28,54,-.3],[25,32,1.2],[42,95,2],[-24,78,.4]];
  const colors=['#cf6c36','#bac2b2','#b39d4f','#718387','#a3573c'];
  positions.forEach(([x,z,rot],i)=>{
    const person=new THREE.Group(),coat=new THREE.MeshStandardMaterial({color:colors[i],roughness:.9}),dark=new THREE.MeshStandardMaterial({color:'#283331'}),skin=new THREE.MeshStandardMaterial({color:'#b7a18a'});
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.49,3,5),coat);body.position.y=1.05;person.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.145,7,5),skin);head.position.y=1.63;person.add(head);
    for(const side of [-1,1]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.075,.07,.72,5),dark);leg.position.set(side*.1,.4,0);person.add(leg);const arm=new THREE.Mesh(new THREE.CylinderGeometry(.065,.07,.6,5),coat);arm.position.set(side*.24,1.05,.02);arm.rotation.z=side*.12;person.add(arm);}
    person.position.set(x,groundHeight(x,z),z);person.rotation.y=rot;scene.add(person);
  });
}
