// ================================================================
//  Vehicle physics (arcade: bicycle-model yaw, tyre grip, drift,
//  nitro, ramps & air time, static collisions) + visual effects
// ================================================================
'use strict';

// ---------------- Particle effects (smoke, sparks, splash) ----------------
G.FX = (function () {
  const FX = {};
  function makeSystem(scene, max, additive) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: innerHeight * 0.6 }, uLight: { value: 1 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vCol; uniform float uScale;
        void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec4 vCol; uniform float uLight;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.1, r) * vCol.a;
          gl_FragColor = vec4(vCol.rgb * uLight, a);
          #include <encodings_fragment>
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
    scene.add(pts);
    const P = []; for (let i = 0; i < max; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, r: 1, g: 1, b: 1, a: 1, drag: 1, grav: 0 });
    let next = 0, active = false; // idle systems skip the per-frame loop + buffer upload
    return {
      mat, additive,
      emit(o) { const p = P[next]; next = (next + 1) % max; Object.assign(p, o); p.life = p.max; active = true; },
      update(dt) {
        if (!active) return;
        let alive = 0;
        for (let i = 0; i < max; i++) {
          const p = P[i];
          if (p.life <= 0) { size[i] = 0; continue; }
          alive++;
          p.life -= dt;
          const k = 1 - p.life / p.max;
          p.vx *= Math.exp(-p.drag * dt); p.vz *= Math.exp(-p.drag * dt); p.vy = p.vy * Math.exp(-p.drag * dt) - p.grav * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.05 && p.grav > 0) { p.y = 0.05; p.vy *= -0.3; }
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          col[i * 4] = p.r; col[i * 4 + 1] = p.g; col[i * 4 + 2] = p.b; col[i * 4 + 3] = p.a * (1 - k) * Math.min(1, k * 8);
          size[i] = G.lerp(p.s0, p.s1, k);
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true;
        if (!alive) active = false; // zeros uploaded once, then sleep
      },
    };
  }
  // Skid marks: ring buffer of quads
  function makeSkids(scene, max) {
    const pos = new Float32Array(max * 6 * 3), alpha = new Float32Array(max * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.02,0.02,0.02, vA * 0.55); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -14,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1;
    scene.add(mesh);
    let idx = 0;
    return {
      add(x0, z0, x1, z1, y0, y1, w, a) {
        const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz); if (l < 0.05 || l > 4) return;
        const nx = -dz / l * w / 2, nz = dx / l * w / 2, o = idx * 18;
        const v = [x0 + nx, y0, z0 + nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz, x0 + nx, y0, z0 + nz, x1 - nx, y1, z1 - nz, x0 - nx, y0, z0 - nz];
        for (let i = 0; i < 18; i++) pos[o + i] = v[i];
        for (let i = 0; i < 6; i++) alpha[idx * 6 + i] = a;
        idx = (idx + 1) % max;
        geo.attributes.position.needsUpdate = true; geo.attributes.alpha.needsUpdate = true;
      },
    };
  }
  FX.init = function (scene) {
    FX.smoke = makeSystem(scene, 900, false);
    FX.spark = makeSystem(scene, 400, true);
    FX.skids = makeSkids(scene, 3000);
  };
  FX.update = function (dt, night) {
    FX.smoke.mat.uniforms.uLight.value = 1 - night * 0.75;
    FX.smoke.update(dt); FX.spark.update(dt);
  };
  FX.resize = function () { [FX.smoke, FX.spark].forEach((s) => { if (s) s.mat.uniforms.uScale.value = innerHeight * 0.6; }); };
  FX.sparks = function (x, y, z, nx, nz, n) {
    for (let i = 0; i < n; i++) FX.spark.emit({ x, y, z, vx: nx * 6 + (Math.random() - 0.5) * 10, vy: 2 + Math.random() * 5, vz: nz * 6 + (Math.random() - 0.5) * 10, max: 0.35 + Math.random() * 0.4, s0: 0.25, s1: 0.05, r: 3.2, g: 1.5, b: 0.45, a: 1, drag: 1.5, grav: 14 });
  };
  FX.splash = function (x, z) {
    for (let i = 0; i < 80; i++) FX.smoke.emit({ x: x + (Math.random() - 0.5) * 3, y: 0.3, z: z + (Math.random() - 0.5) * 3, vx: (Math.random() - 0.5) * 8, vy: 4 + Math.random() * 9, vz: (Math.random() - 0.5) * 8, max: 1.2, s0: 0.6, s1: 2.5, r: 0.85, g: 0.93, b: 1, a: 0.9, drag: 0.6, grav: 12 });
  };
  return FX;
})();

// ---------------- Vehicle ----------------
G.SURF = {
  road:  { grip: 1.0, drag: 0.0, vmax: 1.0 },
  grass: { grip: 0.62, drag: 2.2, vmax: 0.62 },
  sand:  { grip: 0.5, drag: 3.4, vmax: 0.5 },
  water: { grip: 0.3, drag: 8, vmax: 0.2 },
};

G.Vehicle = class Vehicle {
  constructor(spec, colorHex, opts) {
    opts = opts || {};
    this.spec = spec;
    this.up = opts.upgrades || { engine: 0, handling: 0, nitro: 0 };
    this.perf = G.carPerf(spec, this.up);
    this.mesh = G.CarModels.build(spec, colorHex, opts);
    this.ud = this.mesh.userData;
    this.L = spec.body.L; this.Wd = spec.body.W; this.wb = spec.body.wb;
    this.radius = (this.L + this.Wd) / 4 + 0.1; // one circle: compromise between length and width
    this.mass = spec.mass;
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.yaw = 0;
    this.steerAngle = 0; this.grounded = true; this.airTime = 0;
    this.nitro = this.perf.nitroCap; this.nitroOn = false;
    this.gear = 0; this.rpm = 900; this.slip = 0; this.surface = 'road';
    this.pitch = 0; this.roll = 0; this.wheelSpin = 0; this.impact = 0; this.brakeLight = 0;
    this.lastSkid = [null, null];
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.isPlayer = !!opts.player;
  }
  setColor(hex) { this.ud.paint.color.copy(G.col(hex)); }
  setUpgrades(up) { this.up = up; this.perf = G.carPerf(this.spec, up); this.nitro = Math.min(this.nitro, this.perf.nitroCap); }
  setPose(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading; this.y = G.W.groundHeight(x, z);
    this.vx = this.vz = this.vy = this.yaw = 0; this.grounded = true; this.steerAngle = 0;
    this.syncMesh(0);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdSpeed() { return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading); }

  update(dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    this.impact = 0;
    for (let i = 0; i < steps; i++) this.step(h);
    this.updateDrivetrain(dt);
  }

  step(dt) {
    const p = this.perf, inp = this.input;
    this.surface = G.W.surface(this.x, this.z);
    let sf = G.SURF[this.surface];
    if (this.spec.offroad && this.surface !== 'road' && this.surface !== 'water') sf = { grip: 0.92, drag: 0.6, vmax: 0.92 };
    let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const ox = this.x, oz = this.z;

    // nitro
    this.nitroOn = inp.nitro && this.nitro > 0.01 && inp.throttle > 0;
    if (this.nitroOn) this.nitro = Math.max(0, this.nitro - dt * 0.28);
    else this.nitro = Math.min(p.nitroCap, this.nitro + dt * 0.022);

    if (this.grounded) {
      let vF = this.vx * fx + this.vz * fz;
      const spd = Math.abs(vF);
      // steering: less lock at speed
      const lock = p.steer / (1 + spd / 24) + 0.03;
      this.steerAngle = G.damp(this.steerAngle, inp.steer * lock, 10, dt);
      let yawT = vF * Math.tan(this.steerAngle) / this.wb;
      if (inp.handbrake && spd > 6) yawT *= 1.5;
      const latMax = 9.81 * (1.0 + p.grip * 0.045) * sf.grip;
      const yawMax = latMax * 1.35 / Math.max(spd, 1);
      if (!inp.handbrake) yawT = G.clamp(yawT, -yawMax, yawMax);
      this.yaw = G.damp(this.yaw, yawT, inp.handbrake ? 3.5 : 9 * sf.grip, dt);
      this.heading += this.yaw * dt;
      fx = Math.sin(this.heading); fz = Math.cos(this.heading);
      const sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
      vF = this.vx * fx + this.vz * fz;
      let vS = this.vx * sx + this.vz * sz;

      // longitudinal
      const vmax = p.maxSpeed * sf.vmax * (this.nitroOn ? 1.2 : 1);
      let a = 0;
      if (inp.throttle > 0) {
        if (vF < -0.5) a += p.brake * inp.throttle;
        else {
          const r = Math.max(0, vF) / vmax;
          a += p.accel * inp.throttle * Math.max(0, 1 - r * r * r);
          if (this.nitroOn) a += p.accel * 0.85 * p.nitroPower * Math.max(0, 1 - r * r * 0.7);
        }
      }
      if (inp.brake > 0) {
        if (vF > 0.5) a -= p.brake * inp.brake;
        else if (vF > -16) a -= p.accel * 0.5 * inp.brake;
      }
      const sgn = Math.sign(vF);
      a -= sgn * (0.3 + 0.00042 * vF * vF + sf.drag * Math.min(1, spd / 4));
      if (inp.handbrake) a -= sgn * 5.5;
      // sideways sliding scrubs speed
      a -= sgn * Math.min(Math.abs(vS) * 0.35, 6);
      const nv = vF + a * dt;
      vF = (inp.throttle === 0 && inp.brake === 0 && Math.sign(nv) !== sgn) ? 0 : nv;
      if (inp.throttle === 0 && inp.brake === 0 && Math.abs(vF) < 0.25) vF = 0;

      // lateral grip
      const grip = (inp.handbrake ? 1.4 : p.grip) * sf.grip;
      vS *= Math.exp(-grip * dt);
      this.slip = Math.abs(vS);
      this.vx = fx * vF + sx * vS; this.vz = fz * vF + sz * vS;
      this.brakeLight = inp.brake > 0 && vF > 0.5 ? 1 : 0;
    } else {
      this.vy -= G.CFG.GRAVITY * dt;
      this.yaw *= Math.exp(-0.6 * dt);
      this.heading += this.yaw * dt;
      // a little air control
      this.heading += this.input.steer * 0.6 * dt;
      this.airTime += dt;
      this.slip = 0;
    }

    // integrate
    this.x += this.vx * dt; this.z += this.vz * dt;
    let gh = G.W.groundHeight(this.x, this.z);
    if (gh > this.y + 0.9) { // ramp side / back: acts like a wall
      this.x = ox; this.z = oz; this.vx *= -0.25; this.vz *= -0.25; gh = G.W.groundHeight(this.x, this.z); this.impact = Math.max(this.impact, 10);
    }
    if (this.grounded) {
      if (gh < this.y - 0.12) { this.grounded = false; this.airTime = 0; }
      else { this.vy = (gh - this.y) / dt; this.y = gh; }
    }
    if (!this.grounded) {
      this.y += this.vy * dt;
      if (this.y <= gh) {
        this.landImpact = -this.vy; this.landed = this.airTime;
        this.y = gh; this.vy = 0; this.grounded = true;
      }
    }

    // static collisions (front & rear circles)
    const off = this.L / 2 - this.Wd / 2, rad = this.Wd / 2 + 0.08;
    for (const k of [off, -off, 0]) {
      const cx = this.x + fx * k, cz = this.z + fz * k;
      G.W.collideCircle(cx, cz, k === 0 ? rad + 0.05 : rad, (nx, nz, depth) => {
        this.x += nx * depth; this.z += nz * depth;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          const J = -(1.25) * vn;
          this.vx += nx * J; this.vz += nz * J;
          // tangential friction against the wall
          const tx = -nz, tz = nx, vt = this.vx * tx + this.vz * tz;
          this.vx -= tx * vt * 0.08; this.vz -= tz * vt * 0.08;
          const rx = fx * k, rz = fz * k;
          this.yaw += (rz * J * nx - rx * J * nz) * 0.09;
          this.impact = Math.max(this.impact, -vn);
          if (-vn > 4) { this.hitN = [nx, nz]; this.hitP = [cx - nx * rad, cz - nz * rad]; }
        }
      });
    }
    // world limits
    const Lm = G.CFG.WORLD_LIMIT;
    if (Math.abs(this.x) > Lm) { this.x = Math.sign(this.x) * Lm; this.vx *= -0.3; }
    if (this.z < -Lm - 200) { this.z = -Lm - 200; this.vz *= -0.3; }
  }

  updateDrivetrain(dt) {
    const v = Math.max(0, this.fwdSpeed), top = this.perf.maxSpeed;
    const ratios = [0.26, 0.42, 0.58, 0.74, 0.88, 1.05];
    let g = this.gear;
    if (g < 5 && v > top * ratios[g] * 0.97) g++;
    else if (g > 0 && v < top * ratios[g - 1] * 0.78) g--;
    if (g !== this.gear) { this.gear = g; this.shiftT = 0.18; }
    const lo = g > 0 ? top * ratios[g - 1] * 0.6 : 0, hi = top * ratios[g];
    let r = G.clamp((v - lo) / (hi - lo), 0, 1);
    if (this.shiftT > 0) { this.shiftT -= dt; r *= 0.85; }
    let target = 950 + r * 7100;
    if (this.input.throttle > 0 && (g === 0 && v < 8 || !this.grounded)) target = Math.max(target, 5200 + Math.random() * 300);
    this.rpm = G.damp(this.rpm, target, 14, dt);
  }

  // exhaust: blue nitro jet, backfire pops (lift-off at high revs / hard up-shift), hot brake discs
  exhaustFx(dt) {
    const ud = this.ud, thr = this.input.throttle;
    for (const f of ud.flames) {
      f.visible = this.nitroOn;
      if (f.visible) { const b = f.userData.base || 0.3; f.scale.set(b * (0.9 + Math.random() * 0.25), b, b * (2.6 + Math.random() * 1.4)); }
    }
    if (this.prevThr > 0.6 && thr < 0.1 && this.rpm > 4800 && this.grounded) this.popT = 0.45 + Math.random() * 0.35;
    if (this.prevGear !== undefined && this.gear > this.prevGear && thr > 0.7) { this.popT = Math.max(this.popT || 0, 0.12); this.bigPop = true; }
    this.prevThr = thr; this.prevGear = this.gear;
    if (this.popT > 0) {
      this.popT -= dt; this.popCd = (this.popCd || 0) - dt;
      if (this.popCd <= 0) {
        this.popCd = 0.05 + Math.random() * 0.12; this.popOn = 0.04 + Math.random() * 0.05;
        this.popK = this.bigPop ? 1.5 : 0.7 + Math.random() * 0.6; this.bigPop = false;
        if (this.isPlayer && G.Audio.backfire) G.Audio.backfire(this.popK);
        if (G.FX.spark && ud.tips && ud.tips.length) {
          this.mesh.updateMatrixWorld();
          const tip = ud.tips[Math.floor(Math.random() * ud.tips.length)], p = (this._tipV || (this._tipV = new THREE.Vector3())).copy(tip);
          this.mesh.localToWorld(p);
          const bx = -Math.sin(this.heading), bz = -Math.cos(this.heading);
          for (let i = 0; i < 5; i++) G.FX.spark.emit({ x: p.x, y: p.y, z: p.z, vx: this.vx + bx * (4 + Math.random() * 5) + (Math.random() - 0.5) * 3, vy: 0.5 + Math.random() * 2, vz: this.vz + bz * (4 + Math.random() * 5) + (Math.random() - 0.5) * 3, max: 0.2 + Math.random() * 0.25, s0: 0.18, s1: 0.04, r: 3.5, g: 1.4, b: 0.3, a: 1, drag: 2, grav: 6 });
        }
      }
    }
    let on = false;
    if (this.popOn > 0) { this.popOn -= dt; on = true; }
    for (const f of ud.fire) {
      f.visible = on && !this.nitroOn;
      if (f.visible) { const b = (f.userData.base || 0.3) * this.popK; f.scale.set(b * (0.8 + Math.random() * 0.4), b, b * (1.4 + Math.random())); }
    }
    if (ud.discMat) {
      const target = this.brakeLight && this.speed > 18 ? Math.min(1, this.speed / 60) : 0;
      const h = this.discHeat || 0;
      this.discHeat = G.clamp(target > h ? h + (target - h) * 1.5 * dt : h - 0.12 * dt, 0, 1);
      ud.discMat.emissiveIntensity = this.discHeat * this.discHeat * 2.2;
    }
  }

  // effects + mesh sync
  syncMesh(dt) {
    const m = this.mesh, ud = this.ud;
    m.position.set(this.x, this.y, this.z);
    const vF = this.fwdSpeed;
    // body pitch/roll from accelerations
    if (dt > 0) {
      const ax = this.prevVF !== undefined ? (vF - this.prevVF) / dt : 0;
      this.prevVF = vF;
      const lat = this.yaw * vF;
      let tp = G.clamp(-ax * 0.004, -0.05, 0.05), tr = G.clamp(lat * 0.0045, -0.07, 0.07);
      if (!this.grounded) { tp = G.clamp(-this.vy / Math.max(10, Math.abs(vF)) * 0.6, -0.4, 0.4); tr = 0; }
      else {
        const gh = G.W.groundHeight(this.x + Math.sin(this.heading) * 1.5, this.z + Math.cos(this.heading) * 1.5);
        const gb = G.W.groundHeight(this.x - Math.sin(this.heading) * 1.5, this.z - Math.cos(this.heading) * 1.5);
        tp += -Math.atan2(gh - gb, 3);
      }
      this.pitch = G.damp(this.pitch, tp, 8, dt); this.roll = G.damp(this.roll, tr, 6, dt);
    }
    m.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    // wheels
    const r = ud.wheelR || 0.34;
    this.wheelSpin += (vF / r) * dt * (this.input.handbrake ? 0.2 : 1);
    for (const w of ud.wheels) {
      w.spin.rotation.x = w.mirror ? -this.wheelSpin : this.wheelSpin;
      if (w.front) w.steer.rotation.y = (w.mirror ? Math.PI : 0) + this.steerAngle * 1.4;
    }
    if (dt > 0) this.exhaustFx(dt);
    if (ud.tail) ud.tail.color.setRGB(this.brakeLight ? 3.2 : 1.2 + G.R.night * 0.4, 0.04, 0.03);
    if (ud.blob) ud.blob.position.y = 0.04 - this.y + G.W.groundHeight(this.x, this.z);

    // particles: tyre smoke + skid marks
    if (dt > 0 && this.grounded && G.FX.smoke) {
      const spinOut = this.input.throttle > 0 && this.gear === 0 && Math.abs(vF) < 9 && this.perf.accel > 13;
      const sliding = this.slip > 3.2 || (this.input.handbrake && Math.abs(vF) > 6) || spinOut;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading), sx = Math.cos(this.heading), sz = -Math.sin(this.heading);
      const rz = -this.wb / 2, hw = this.Wd / 2 - 0.15;
      for (let k = 0; k < 2; k++) {
        const sd = k ? 1 : -1;
        const wx = this.x + fx * rz + sx * hw * sd, wz = this.z + fz * rz + sz * hw * sd;
        const last = this.lastSkid[k];
        if (sliding && this.surface === 'road') {
          if (last) G.FX.skids.add(last[0], last[1], wx, wz, last[2] + 0.07, this.y + 0.07, 0.26, Math.min(1, this.slip / 8 + 0.4));
          this.lastSkid[k] = [wx, wz, this.y];
          if (Math.random() < 0.7) {
            G.FX.smoke.emit({ x: wx, y: this.y + 0.3, z: wz, vx: this.vx * 0.2 + (Math.random() - 0.5) * 2, vy: 0.6 + Math.random(), vz: this.vz * 0.2 + (Math.random() - 0.5) * 2, max: 1.6 + Math.random(), s0: 0.8, s1: 4.5, r: 0.85, g: 0.85, b: 0.88, a: 0.35, drag: 1.2, grav: -0.3 });
          }
        } else {
          this.lastSkid[k] = null;
          if (this.surface !== 'road' && Math.abs(vF) > 8 && Math.random() < 0.35) {
            const dirt = this.surface === 'sand' ? [0.85, 0.75, 0.55] : [0.45, 0.4, 0.3];
            G.FX.smoke.emit({ x: wx, y: this.y + 0.2, z: wz, vx: -fx * 3 + (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: -fz * 3 + (Math.random() - 0.5) * 2, max: 1.2, s0: 0.6, s1: 3.5, r: dirt[0], g: dirt[1], b: dirt[2], a: 0.45, drag: 1.5, grav: 0.5 });
          }
        }
      }
    }
  }
};

// Dynamic body-vs-body collisions (circles). bodies: [{x,z,vx,vz,radius,mass,onHit}]
G.collideBodies = function (bodies) {
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j];
    if (Math.abs((a.y || 0) - (b.y || 0)) > 2) continue;
    if (a.isTraffic && b.isTraffic) continue; // lane-following traffic never pile up on each other
    const dx = b.x - a.x, dz = b.z - a.z, rr = a.radius + b.radius, d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-6) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
    const ia = a.fixed ? 0 : 1 / a.mass, ib = b.fixed ? 0 : 1 / b.mass, it = ia + ib;
    if (it === 0) continue;
    a.x -= nx * pen * ia / it; a.z -= nz * pen * ia / it;
    b.x += nx * pen * ib / it; b.z += nz * pen * ib / it;
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const J = -(1.3) * rv / it;
      a.vx -= nx * J * ia; a.vz -= nz * J * ia; b.vx += nx * J * ib; b.vz += nz * J * ib;
      const imp = -rv;
      if (a.onHit) a.onHit(b, imp, nx, nz);
      if (b.onHit) b.onHit(a, imp, -nx, -nz);
    }
  }
};
