import * as THREE from 'three';

// Aurora night sky rendered into cube render targets, one face per frame,
// so the (fairly expensive) aurora shader never runs at full XR resolution.

const vert = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform float uIntensity;
uniform float uMode;        // 0 = procedural aurora, 1 = equirectangular image (V3 skies)
uniform sampler2D uImage;
uniform float uRot;         // image yaw, radians
uniform float uTwinkle;     // star shimmer on night images
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
vec3 image(vec3 rd){
  float a = atan(rd.z, rd.x) + uRot;
  vec2 uv = vec2(a * 0.15915494 + 0.5, asin(clamp(rd.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  vec3 c = texture2D(uImage, uv).rgb;
  if (uTwinkle > 0.0) c += stars(rd) * 0.35 * uTwinkle * (0.6 + 0.4 * sin(uTime * 2.3 + hash(floor(rd * 400.0)) * 6.28)) * smoothstep(0.0, 0.2, rd.y);
  return c;
}
void main(){
  vec3 rd = normalize(vDir);
  float h = rd.y;
  if (uMode > 0.5) { gl_FragColor = vec4(image(rd), 1.0); return; }
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

/** Shows keyframe `uA` fading into `uB`; with uW = 1 it copies `uB`. Drawn at the far plane, wherever nothing else is. */
const blendVert = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`;
const blendFrag = /* glsl */ `
varying vec3 vDir;
uniform samplerCube uA, uB;
uniform float uW;
void main(){
  gl_FragColor = vec4(mix(textureCube(uA, vDir).rgb, textureCube(uB, vDir).rgb, uW), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const cubeRT = (size: number, mips: boolean) => {
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: mips, minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return rt;
};

/**
 * The aurora is drawn a face at a time into a hidden keyframe cube; finished keyframes are cross-faded on screen
 * (`backdrop`), so a half-updated cube never shows a seam and the motion stays smooth however slowly faces are drawn.
 * `rt` holds the latest finished keyframe, for reflections.
 */
export class AuroraSky {
  rt: THREE.WebGLCubeRenderTarget;
  backdrop: THREE.Mesh;
  private keys: [THREE.WebGLCubeRenderTarget, THREE.WebGLCubeRenderTarget, THREE.WebGLCubeRenderTarget];
  private scene = new THREE.Scene();
  private copyScene = new THREE.Scene();
  private cams: THREE.PerspectiveCamera[] = [];
  private face = 0;
  private cycleFrame = 0;
  private every = 1;
  mat: THREE.ShaderMaterial;
  private show: THREE.ShaderMaterial;
  animate = true;
  private frame = 0;

  constructor(private renderer: THREE.WebGLRenderer, size = 512) {
    this.rt = cubeRT(size, true);
    this.keys = [cubeRT(size, false), cubeRT(size, false), cubeRT(size, false)];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1.0 }, uMode: { value: 0 }, uImage: { value: null as THREE.Texture | null }, uRot: { value: Math.PI }, uTwinkle: { value: 0 } },
    });
    this.scene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), this.mat));
    const blend = (w: number) => new THREE.ShaderMaterial({
      vertexShader: blendVert, fragmentShader: blendFrag, side: THREE.BackSide, depthWrite: false,
      uniforms: { uA: { value: this.keys[0].texture }, uB: { value: this.keys[1].texture }, uW: { value: w } },
    });
    this.show = blend(0);
    this.backdrop = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), this.show);
    this.backdrop.name = 'Sky'; this.backdrop.frustumCulled = false; this.backdrop.renderOrder = 1e6;
    this.copyScene.add(new THREE.Mesh(this.backdrop.geometry, blend(1)));
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

  /** Render every face now (used at startup and when the sky changes): no fade, and reflections updated. */
  renderAll(time = 0) {
    this.mat.uniforms.uTime.value = time;
    for (const k of this.keys) for (let f = 0; f < 6; f++) this.renderFace(this.scene, k, f);
    this.face = 0; this.cycleFrame = 0; this.show.uniforms.uW.value = 0;
    this.copyToReflections();
  }

  private renderFace(scene: THREE.Scene, target: THREE.WebGLCubeRenderTarget, f: number) {
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevXR = r.xr.enabled;
    const prevTM = r.toneMapping;
    r.xr.enabled = false;
    r.toneMapping = THREE.NoToneMapping;
    target.texture.generateMipmaps = target === this.rt && f === 5;
    r.setRenderTarget(target, f);
    r.render(scene, this.cams[f]);
    r.setRenderTarget(prevRT);
    r.xr.enabled = prevXR;
    r.toneMapping = prevTM;
  }

  private copyToReflections() {
    (this.copyScene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material.uniforms.uB.value = this.keys[1].texture;
    for (let f = 0; f < 6; f++) this.renderFace(this.copyScene, this.rt, f);
  }

  /** Switch to an equirectangular image sky (null = back to the procedural aurora). Re-renders all six faces. */
  setImage(tex: THREE.Texture | null, opts: { twinkle?: number; rot?: number } = {}) {
    const u = this.mat.uniforms;
    u.uMode.value = tex ? 1 : 0; u.uImage.value = tex; u.uTwinkle.value = opts.twinkle ?? 0; u.uRot.value = opts.rot ?? Math.PI;
    this.still = !!tex && !opts.twinkle;
    this.renderAll(u.uTime.value);
  }
  /** An image sky without twinkle never changes, so it costs nothing per frame. */
  private still = false;

  /** Call once per frame; one keyframe face is drawn every `every` frames, so a keyframe takes 6 × `every` frames. */
  update(time: number, every = 1) {
    if (!this.animate || this.still) return;
    // a new pace takes effect at the next keyframe, so the fade never jumps
    if (this.face === 0 && this.cycleFrame === 0) this.every = every;
    this.frame++; this.cycleFrame++;
    this.show.uniforms.uW.value = Math.min(1, this.cycleFrame / (6 * this.every));
    if (this.frame % this.every) return;
    const [a, b, c] = this.keys;
    if (this.face === 0) this.mat.uniforms.uTime.value = time;
    this.renderFace(this.scene, c, this.face);
    if (++this.face < 6) return;
    // c is finished: fade from b to c next, and draw the following keyframe into a
    this.keys = [b, c, a];
    this.show.uniforms.uA.value = b.texture; this.show.uniforms.uB.value = c.texture; this.show.uniforms.uW.value = 0;
    this.face = 0; this.cycleFrame = 0;
    this.copyToReflections();
  }
}
