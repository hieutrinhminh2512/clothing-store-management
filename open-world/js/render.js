// ================================================================
//  Rendering: renderer, HDR post-processing (bloom + ACES), sky,
//  day/night cycle, environment reflections, quality presets
// ================================================================
'use strict';

G.QUALITY = {
  low:    { pixelRatio: 0.75, shadows: 0,    bloom: false, msaa: 0, traffic: 14, fogFar: 1300 },
  medium: { pixelRatio: 1.0,  shadows: 1024, bloom: true,  msaa: 0, traffic: 24, fogFar: 1900 },
  high:   { pixelRatio: 1.25, shadows: 2048, bloom: true,  msaa: 4, traffic: 34, fogFar: 2500 },
  ultra:  { pixelRatio: 2.0,  shadows: 4096, bloom: true,  msaa: 4, traffic: 44, fogFar: 3000 },
};

G.R = (function () {
  const R = {};
  let renderer, scene, camera;
  let sun, hemi, skyMesh, skyMat, envScene, pmrem, envRT = null, lastEnvKey = '';
  let post = null;
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsScene = new THREE.Scene();
  const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  fsQuad.frustumCulled = false;
  fsScene.add(fsQuad);

  R.night = 0;            // 0 = full day, 1 = full night
  R.sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  R.shake = 0;

  // ---------------- Sky shader ----------------
  const SKY_VS = `
    varying vec3 vDir;
    void main(){
      vDir = normalize(position);
      vec4 p = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * p;
      gl_Position.z = gl_Position.w * 0.99999; // always behind everything
    }`;
  const SKY_FS = `
    uniform vec3 uTop, uHorizon, uGround, uSunCol, uSunDir, uGlow;
    uniform float uNight, uTime, uCloud;
    varying vec3 vDir;
    float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float h31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.03; a*=.5; } return v; }
    void main(){
      vec3 d = normalize(vDir);
      float y = d.y;
      vec3 col = mix(uHorizon, uTop, pow(clamp(y,0.,1.), 0.45));
      col = mix(col, uGround, smoothstep(0.0, -0.08, y));
      // city light pollution near the horizon at night
      col += uGlow * exp(-max(y,0.)*9.0) * uNight;
      // sun
      float s = max(dot(d, uSunDir), 0.0);
      col += uSunCol * (pow(s, 900.0) * 40.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);
      // moon (opposite the sun)
      float m = max(dot(d, -uSunDir), 0.0);
      col += vec3(0.75,0.82,1.0) * (smoothstep(0.9994, 0.9997, m) * 3.0 + pow(m, 60.0)*0.08) * uNight;
      // stars
      if (y > 0.0) {
        vec3 sp = floor(d * 420.0);
        float st = h31(sp);
        float tw = 0.6 + 0.4 * sin(uTime * 3.0 + st * 80.0);
        col += vec3(smoothstep(0.9975, 1.0, st)) * tw * uNight * 2.5 * smoothstep(0.0, 0.25, y);
      }
      // clouds: a plane projected onto the dome
      if (y > 0.01) {
        vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
        float c = fbm(uv);
        c = smoothstep(0.45 - uCloud * 0.25, 0.85, c) * smoothstep(0.0, 0.25, y);
        vec3 cloudLit = mix(uHorizon * 1.15, vec3(1.0), 0.45) * (1.0 - uNight * 0.85) + uSunCol * pow(s, 4.0) * 0.6;
        cloudLit += uGlow * uNight * 0.6;
        col = mix(col, cloudLit, c * 0.85);
      }
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;

  // ---------------- Post-processing shaders ----------------
  const FS_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const BRIGHT_FS = `
    uniform sampler2D tSrc; uniform float uThreshold; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb;
      float l = max(c.r, max(c.g, c.b));
      float k = smoothstep(uThreshold, uThreshold * 1.8, l);
      gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
    }`;
  const BLUR_FS = `
    uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
      c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
      c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }`;
  const COPY_FS = `uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`;
  const COMPOSITE_FS = `
    uniform sampler2D tScene, tB0, tB1, tB2, tB3;
    uniform float uBloom, uExposure, uVignette, uSpeed, uTime, uFlash;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 aces(vec3 color){
      const mat3 IM = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 OM = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      color *= uExposure / 0.6; color = IM * color; color = RRTAndODTFit(color); color = OM * color; return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec2 uv = vUv;
      vec2 fromC = uv - 0.5;
      // subtle radial speed blur (only noticeable at very high speed / nitro)
      vec3 c = texture2D(tScene, uv).rgb;
      if (uSpeed > 0.01) {
        vec3 acc = c;
        for (int i = 1; i < 6; i++) { acc += texture2D(tScene, uv - fromC * float(i) * 0.006 * uSpeed).rgb; }
        c = mix(c, acc / 6.0, smoothstep(0.15, 0.6, length(fromC)));
      }
      vec3 b = texture2D(tB0, uv).rgb * 0.9 + texture2D(tB1, uv).rgb * 0.8 + texture2D(tB2, uv).rgb * 0.7 + texture2D(tB3, uv).rgb * 0.7;
      c += b * uBloom;
      c = aces(c);
      // vignette + flash (crashes / busted)
      float v = smoothstep(0.85, 0.25, length(fromC * vec2(1.0, 0.8)));
      c *= mix(1.0, v, uVignette);
      c = mix(c, vec3(1.0), uFlash);
      gl_FragColor = vec4(toSRGB(c), 1.0);
    }`;

  function makeMat(fs, uniforms) {
    return new THREE.ShaderMaterial({ vertexShader: FS_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  }

  function makeRT(w, h, msaa) {
    const opts = { type: R.hdrType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    let rt;
    if (msaa && renderer.capabilities.isWebGL2) { rt = new THREE.WebGLMultisampleRenderTarget(w, h, opts); rt.samples = msaa; }
    else rt = new THREE.WebGLRenderTarget(w, h, opts);
    return rt;
  }

  function buildPost() {
    disposePost();
    const q = G.QUALITY[G.save.settings.quality];
    if (!q.bloom) { post = null; return; }
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, size.x), h = Math.max(2, size.y);
    post = { scene: makeRT(w, h, q.msaa), levels: [] };
    post.scene.depthBuffer = true;
    let lw = w >> 1, lh = h >> 1;
    for (let i = 0; i < 4; i++) {
      const o = { type: R.hdrType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      post.levels.push({ a: new THREE.WebGLRenderTarget(Math.max(2, lw), Math.max(2, lh), o), b: new THREE.WebGLRenderTarget(Math.max(2, lw), Math.max(2, lh), o), w: Math.max(2, lw), h: Math.max(2, lh) });
      lw >>= 1; lh >>= 1;
    }
    post.bright = makeMat(BRIGHT_FS, { tSrc: { value: null }, uThreshold: { value: 1.0 } });
    post.blur = makeMat(BLUR_FS, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    post.copy = makeMat(COPY_FS, { tSrc: { value: null } });
    post.comp = makeMat(COMPOSITE_FS, {
      tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null },
      uBloom: { value: 0.6 }, uExposure: { value: 1 }, uVignette: { value: 0.35 }, uSpeed: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 },
    });
  }
  function disposePost() {
    if (!post) return;
    post.scene.dispose();
    post.levels.forEach((l) => { l.a.dispose(); l.b.dispose(); });
    [post.bright, post.blur, post.copy, post.comp].forEach((m) => m.dispose());
    post = null;
  }
  function pass(mat, target) {
    fsQuad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCam);
  }

  // ---------------- Public: init ----------------
  R.init = function (canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.physicallyCorrectLights = false;
    R.hdrType = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    R.renderer = renderer;

    scene = new THREE.Scene();
    R.scene = scene;
    camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 9000);
    R.camera = camera;
    scene.fog = new THREE.Fog(0x8899aa, 200, 2500);

    // Sky dome (follows the camera)
    skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
        uSunCol: { value: new THREE.Color() }, uSunDir: { value: R.sunDir }, uGlow: { value: G.col(0x5a3018) },
        uNight: { value: 0 }, uTime: { value: 0 }, uCloud: { value: 0.35 },
      },
    });
    const skyGeo = new THREE.SphereGeometry(4000, 48, 24);
    skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -10;
    scene.add(skyMesh);
    envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
    envScene.add(envSky);
    pmrem = new THREE.PMREMGenerator(renderer);

    // Lights
    hemi = new THREE.HemisphereLight(0xbcd7ff, 0x4a4030, 0.6);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    const sc = sun.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 900;
    scene.add(sun); scene.add(sun.target);
    R.sun = sun;

    // first run: pick a preset from the GPU (integrated GPUs start on medium, software rendering on low)
    if (!G.save.settings.autoQ) {
      G.save.settings.autoQ = true;
      try {
        const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
        if (/swiftshader|llvmpipe|software/i.test(name)) G.save.settings.quality = 'low';
        else if (/intel|mali|adreno|powervr|apple gpu|uhd|iris/i.test(name)) G.save.settings.quality = 'medium';
      } catch (e) { /* keep default */ }
      G.persist();
    }
    R.applyQuality();
    window.addEventListener('resize', R.resize);
  };

  R.applyQuality = function () {
    const q = G.QUALITY[G.save.settings.quality] || G.QUALITY.high;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = q.shadows > 0;
    sun.castShadow = q.shadows > 0;
    if (q.shadows > 0) {
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      sun.shadow.mapSize.set(q.shadows, q.shadows);
    }
    // bloom path renders linear HDR into a float target and tone-maps in the composite shader
    renderer.toneMapping = q.bloom ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.outputEncoding = q.bloom ? THREE.LinearEncoding : THREE.sRGBEncoding;
    scene.fog.far = q.fogFar;
    scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } });
    buildPost();
  };

  R.resize = function () {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    buildPost();
  };

  // ---------------- Day / night ----------------
  // key colours by sun elevation (sin of elevation): night, dusk, golden, day
  const KEYS = [
    { e: -0.30, top: 0x02040b, hor: 0x0a1226, gnd: 0x05070c, sun: 0x000000, light: 0x7d9cff, li: 0.32, hemi: 0.22, exp: 1.25, bloom: 1.0, thr: 0.9 },
    { e: -0.08, top: 0x141d40, hor: 0x8a4a5e, gnd: 0x1a1418, sun: 0xff5a2a, light: 0x8a8cff, li: 0.20, hemi: 0.28, exp: 1.15, bloom: 0.9, thr: 0.95 },
    { e: 0.06, top: 0x3b5c9a, hor: 0xf3a362, gnd: 0x4d3a2a, sun: 0xffa050, light: 0xffb27a, li: 1.6, hemi: 0.45, exp: 1.0, bloom: 0.55, thr: 1.6 },
    { e: 0.30, top: 0x2d6bc4, hor: 0xb4d2ee, gnd: 0x5a5040, sun: 0xfff2dc, light: 0xfff4e6, li: 2.6, hemi: 0.62, exp: 0.9, bloom: 0.3, thr: 2.4 },
  ];
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  const moonDir = new THREE.Vector3();
  function lerpKey(e) {
    let i = 0;
    while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = G.smooth(a.e, b.e, e);
    const c = (p) => tmpA.set(a[p]).convertSRGBToLinear().lerp(tmpB.set(b[p]).convertSRGBToLinear(), t).clone();
    const n = (p) => G.lerp(a[p], b[p], t);
    return { top: c('top'), hor: c('hor'), gnd: c('gnd'), sun: c('sun'), light: c('light'), li: n('li'), hemi: n('hemi'), exp: n('exp'), bloom: n('bloom'), thr: n('thr') };
  }

  R.setTime = function (hour, focus) {
    // sun path: rises in the east (+x), sets in the west (-x)
    const ang = (hour - 6) / 24 * Math.PI * 2;
    const el = Math.sin(ang);
    R.sunDir.set(Math.cos(ang) * 0.85, el, 0.38).normalize();
    const e = R.sunDir.y;
    const k = lerpKey(e);
    R.night = G.smooth(0.07, -0.12, e);
    R.keys = k;

    skyMat.uniforms.uTop.value.copy(k.top);
    skyMat.uniforms.uHorizon.value.copy(k.hor);
    skyMat.uniforms.uGround.value.copy(k.gnd);
    skyMat.uniforms.uSunCol.value.copy(k.sun).multiplyScalar(e > -0.05 ? 1 : 0);
    skyMat.uniforms.uNight.value = R.night;
    scene.fog.color.copy(k.hor).lerp(k.gnd, 0.15);

    // directional light = sun by day, moon by night
    const lightDir = e > -0.03 ? R.sunDir : moonDir.copy(R.sunDir).negate();
    sun.color.copy(k.light);
    sun.intensity = k.li * (e > -0.03 ? G.smooth(-0.03, 0.05, e) : G.smooth(-0.03, -0.12, e));
    hemi.color.copy(k.hor).lerp(k.top, 0.5);
    hemi.groundColor.copy(k.gnd);
    hemi.intensity = k.hemi;
    if (focus) {
      sun.target.position.set(focus.x, 0, focus.z);
      sun.position.set(focus.x + lightDir.x * 400, Math.max(40, lightDir.y * 400), focus.z + lightDir.z * 400);
      // snap shadow camera to texels to stop shimmering
      const step = 260 / (sun.shadow.mapSize.x || 1024);
      sun.target.position.x = Math.round(sun.target.position.x / step) * step;
      sun.target.position.z = Math.round(sun.target.position.z / step) * step;
    }

    // regenerate reflections when the sky noticeably changes
    const key = (Math.round(hour * 4) / 4).toFixed(2);
    if (key !== lastEnvKey) {
      lastEnvKey = key;
      const old = envRT;
      envRT = pmrem.fromScene(envScene, 0, 0.1, 1000);
      scene.environment = envRT.texture;
      if (old) old.dispose();
    }
  };

  // ---------------- Frame ----------------
  R.render = function (dt, time, speedFx, flash) {
    skyMat.uniforms.uTime.value = time;
    skyMesh.position.copy(camera.position);
    const k = R.keys || { exp: 1, bloom: 0.5, thr: 1.2 };
    if (!post) {
      renderer.toneMappingExposure = k.exp;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    renderer.setRenderTarget(post.scene);
    renderer.render(scene, camera);

    post.bright.uniforms.tSrc.value = post.scene.texture;
    post.bright.uniforms.uThreshold.value = k.thr;
    pass(post.bright, post.levels[0].a);
    for (let i = 0; i < post.levels.length; i++) {
      const L = post.levels[i];
      if (i > 0) { post.copy.uniforms.tSrc.value = post.levels[i - 1].a.texture; pass(post.copy, L.a); }
      post.blur.uniforms.tSrc.value = L.a.texture; post.blur.uniforms.uDir.value.set(1 / L.w, 0); pass(post.blur, L.b);
      post.blur.uniforms.tSrc.value = L.b.texture; post.blur.uniforms.uDir.value.set(0, 1 / L.h); pass(post.blur, L.a);
    }
    const u = post.comp.uniforms;
    u.tScene.value = post.scene.texture;
    u.tB0.value = post.levels[0].a.texture; u.tB1.value = post.levels[1].a.texture;
    u.tB2.value = post.levels[2].a.texture; u.tB3.value = post.levels[3].a.texture;
    u.uBloom.value = k.bloom;
    u.uExposure.value = k.exp;
    u.uSpeed.value = speedFx || 0;
    u.uFlash.value = flash || 0;
    u.uTime.value = time;
    pass(post.comp, null);
  };

  return R;
})();
