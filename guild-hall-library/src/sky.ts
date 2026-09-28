import * as THREE from 'three';

// Aurora night sky rendered into a cube render target, one face per frame,
// so the (fairly expensive) aurora shader never runs at full XR resolution.
// The cube is used as scene.background and as the reflecting pool's env map.

const vert = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uIntensity;
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x), mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x), f.y); }
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }
float tri(float x){ return abs(fract(x)-.5); }
vec2 tri2(vec2 p){ return vec2(tri(p.x)+tri(p.y), tri(p.y+tri(p.x))); }
// triangle-noise curtains (after nimitz's aurora technique)
float triNoise2d(vec2 p, float spd){
  float z=1.8, z2=2.5, rz=0.;
  p *= rot(p.x*0.06);
  vec2 bp = p;
  for (float i=0.; i<5.; i++){
    vec2 dg = tri2(bp*1.85)*.75;
    dg *= rot(uTime*spd);
    p -= dg/z2;
    bp *= 1.3; z2 *= .45; z *= .42;
    p *= 1.21 + (rz-1.0)*.02;
    rz += tri(p.x+tri(p.y))*z;
    p *= -mat2(0.95534, 0.29552, -0.29552, 0.95534);
  }
  return clamp(1./pow(rz*29., 1.3), 0., .55);
}
vec4 aurora(vec3 rd){
  vec4 col = vec4(0);
  vec4 avgCol = vec4(0);
  for (float i=0.; i<28.; i++){
    float of = 0.006*hash2(gl_FragCoord.xy)*smoothstep(0.,15., i);
    float pt = ((.8+pow(i,1.4)*.002))/(rd.y*2.+0.4);
    pt -= of;
    vec2 bpos = rd.xz*pt;
    float rzt = triNoise2d(bpos, 0.06);
    vec4 col2 = vec4(0,0,0, rzt);
    col2.rgb = (sin(1.-vec3(2.15,-.5, 1.2)+i*0.043)*0.5+0.5)*rzt;
    avgCol = mix(avgCol, col2, .5);
    col += avgCol*exp2(-i*0.065 - 2.5)*smoothstep(0.,5., i);
  }
  col *= clamp(rd.y*15.+.4, 0., 1.);
  return col*1.8;
}
vec3 stars(vec3 p){
  vec3 c = vec3(0.);
  float res = 900.;
  for (float i=0.; i<3.; i++){
    vec3 q = fract(p*(.15*res))-0.5;
    vec3 id = floor(p*(.15*res));
    vec2 rn = vec2(hash(id), hash(id+13.1));
    float c2 = 1.-smoothstep(0., .6, length(q));
    c2 *= step(rn.x, .0006+i*i*0.0012);
    c += c2*(mix(vec3(1.0,0.55,0.35), vec3(0.8,0.9,1.), rn.y)*0.35+0.65);
    p *= 1.3;
  }
  return c*c*1.1;
}
void main(){
  vec3 rd = normalize(vDir);
  float h = rd.y;
  vec3 zen = vec3(0.006,0.012,0.035), hor = vec3(0.03,0.07,0.11);
  vec3 col = mix(hor, zen, smoothstep(-0.05, 0.6, h));
  // faint milky band
  float band = exp(-pow(dot(rd, normalize(vec3(0.6,0.5,-0.62)))*3.2, 2.));
  col += vec3(0.05,0.06,0.09)*band*noise(rd.xz*6.+rd.y*3.);
  col += stars(rd) * smoothstep(-0.02, 0.2, h);
  if (h > 0.0) {
    vec4 aur = smoothstep(0., 1.5, aurora(rd)) * uIntensity;
    col = col*(1.-aur.a) + aur.rgb;
  }
  // below horizon: dark hills handled by geometry; keep a deep ground tone
  col = mix(col, vec3(0.01,0.018,0.02), smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(col, 1.0);
}`;

export class AuroraSky {
  rt: THREE.WebGLCubeRenderTarget;
  private scene = new THREE.Scene();
  private cams: THREE.PerspectiveCamera[] = [];
  private face = 0;
  mat: THREE.ShaderMaterial;
  animate = true;
  private frame = 0;

  constructor(private renderer: THREE.WebGLRenderer, size = 512) {
    this.rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1.0 } },
    });
    this.scene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), this.mat));
    const cube = new THREE.CubeCamera(0.1, 100, this.rt);
    // copy the exact camera setup CubeCamera uses (handles coordinate system)
    cube.coordinateSystem = renderer.coordinateSystem;
    cube.updateCoordinateSystem();
    this.cams = cube.children as THREE.PerspectiveCamera[];
    this.cube = cube;
    this.scene.add(cube);
    this.scene.updateMatrixWorld(true);
  }
  private cube: THREE.CubeCamera;

  /** Render every face now (used at startup). */
  renderAll(time = 0) {
    this.mat.uniforms.uTime.value = time;
    for (let f = 0; f < 6; f++) this.renderFace(f);
  }

  private renderFace(f: number) {
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevXR = r.xr.enabled;
    const prevTM = r.toneMapping;
    r.xr.enabled = false;
    r.toneMapping = THREE.NoToneMapping;
    this.rt.texture.generateMipmaps = f === 5;
    r.setRenderTarget(this.rt, f);
    r.render(this.scene, this.cams[f]);
    r.setRenderTarget(prevRT);
    r.xr.enabled = prevXR;
    r.toneMapping = prevTM;
  }

  /** One face per call; call once per frame. `every` throttles in XR. */
  update(time: number, every = 1) {
    if (!this.animate) return;
    this.frame++;
    if (this.frame % every) return;
    if (this.face === 0) this.mat.uniforms.uTime.value = time;
    this.renderFace(this.face);
    this.face = (this.face + 1) % 6;
  }
}
