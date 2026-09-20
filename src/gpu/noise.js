import { Fn, vec2, float, fract, sin, dot, floor, mix } from 'three/tsl';

// Named functions keep the same small shader functions reusable across the
// water, terrain and compute stages rather than expanding large expression trees.
export const hash21 = Fn(([p]) => fract(sin(dot(p,vec2(127.1,311.7))).mul(43758.5453)))
  .setLayout({name:'landscapeHash',type:'float',inputs:[{name:'p',type:'vec2'}]});
export const noise2 = Fn(([p]) => {
  const i=floor(p),f=fract(p).toVar();f.assign(f.mul(f).mul(float(3).sub(f.mul(2))));
  return mix(mix(hash21(i),hash21(i.add(vec2(1,0))),f.x),mix(hash21(i.add(vec2(0,1))),hash21(i.add(1)),f.x),f.y);
}).setLayout({name:'landscapeNoise',type:'float',inputs:[{name:'p',type:'vec2'}]});
export const fbm2 = Fn(([p]) => noise2(p).mul(.57).add(noise2(p.mul(2.03).add(3)).mul(.28)).add(noise2(p.mul(4.17).add(6)).mul(.15)))
  .setLayout({name:'landscapeFbm',type:'float',inputs:[{name:'p',type:'vec2'}]});
