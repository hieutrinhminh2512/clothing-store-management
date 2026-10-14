// ================================================================
//  On-foot character: procedural humanoid (capsule limbs), simple
//  kinematic physics (walk/run/sprint/jump, ramps, static + car
//  collisions) and blended procedural animation.
// ================================================================
'use strict';

G.Character = (function () {
  const geo = {}, mats = {};
  let blobTex = null;
  // shared geometry (unit-ish, scaled per part)
  function g() {
    if (geo.cyl) return geo;
    geo.cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
    geo.taper = new THREE.CylinderGeometry(1, 0.82, 1, 12, 1);
    geo.sph = new THREE.SphereGeometry(1, 14, 10);
    geo.hemi = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    geo.box = new THREE.BoxGeometry(1, 1, 1);
    return geo;
  }
  function mat(hex, rough, metal) {
    const k = hex + '_' + (rough || 0.8);
    if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial({ color: G.col(hex), roughness: rough || 0.8, metalness: metal || 0 });
    return mats[k];
  }
  function blobMat() {
    if (blobTex) return blobTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    blobTex = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    return blobTex;
  }
  // mesh helper: shape scaled to (sx,sy,sz) at position
  function part(parent, gm, m, sx, sy, sz, px, py, pz) {
    const o = new THREE.Mesh(gm, m); o.scale.set(sx, sy, sz); o.position.set(px || 0, py || 0, pz || 0);
    o.castShadow = true; parent.add(o); return o;
  }
  function pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }

  const OUTFITS = [
    { skin: 0xe0ac86, hair: 0x2a1a10, shirt: 0xf2f2f2, jacket: 0x1d2b4a, pants: 0x2c3e66, shoes: 0xf4f4f4, sole: 0x222222 },
    { skin: 0xc68a5e, hair: 0x111111, shirt: 0xd8342c, jacket: null, pants: 0x3b3b40, shoes: 0x1b1b1b, sole: 0xeeeeee },
    { skin: 0xf1c7a2, hair: 0x6b4428, shirt: 0x2f8f5b, jacket: null, pants: 0x8a7a5a, shoes: 0x5a3a22, sole: 0x222222 },
    { skin: 0x8d5a3b, hair: 0x0c0c0c, shirt: 0xf0c419, jacket: 0x333a40, pants: 0x1f2a44, shoes: 0xd02a2a, sole: 0xffffff },
  ];

  function build(o) {
    const G0 = g(), root = new THREE.Group();
    const skin = mat(o.skin, 0.65), hair = mat(o.hair, 0.9), shirt = mat(o.shirt, 0.85), pants = mat(o.pants, 0.9);
    const shoes = mat(o.shoes, 0.5), sole = mat(o.sole, 0.9), jacket = o.jacket ? mat(o.jacket, 0.7) : shirt;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), blobMat());
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; blob.renderOrder = 1; root.add(blob);
    const J = {};
    J.hips = pivot(root, 0, 0.94, 0);
    part(J.hips, G0.cyl, pants, 0.17, 0.16, 0.12, 0, -0.02, 0);                 // pelvis
    part(J.hips, G0.box, mat(0x1a1a1a, 0.6), 0.35, 0.05, 0.25, 0, 0.06, 0);      // belt
    J.spine = pivot(J.hips, 0, 0.06, 0);
    J.chest = pivot(J.spine, 0, 0, 0);
    part(J.chest, G0.taper, jacket, 0.19, 0.5, 0.13, 0, 0.26, 0);                // torso (tapered to waist)
    if (o.jacket) part(J.chest, G0.box, shirt, 0.16, 0.42, 0.02, 0, 0.27, 0.115); // open jacket: shirt front
    part(J.chest, G0.sph, jacket, 0.21, 0.09, 0.13, 0, 0.5, 0);                  // shoulders
    part(J.chest, G0.cyl, skin, 0.055, 0.1, 0.055, 0, 0.58, 0);                  // neck
    J.head = pivot(J.chest, 0, 0.62, 0);
    part(J.head, G0.sph, skin, 0.105, 0.125, 0.115, 0, 0.11, 0.005);             // skull
    part(J.head, G0.sph, skin, 0.08, 0.06, 0.07, 0, 0.04, 0.035);                // jaw
    part(J.head, G0.hemi, hair, 0.113, 0.12, 0.122, 0, 0.125, -0.008);           // hair cap
    part(J.head, G0.sph, hair, 0.1, 0.08, 0.06, 0, 0.11, -0.07);                 // back of hair
    const eye = mat(0x111111, 0.3);
    part(J.head, G0.sph, eye, 0.014, 0.016, 0.01, -0.038, 0.12, 0.11);
    part(J.head, G0.sph, eye, 0.014, 0.016, 0.01, 0.038, 0.12, 0.11);
    part(J.head, G0.box, skin, 0.025, 0.04, 0.03, 0, 0.09, 0.118);              // nose
    part(J.head, G0.sph, skin, 0.02, 0.03, 0.02, -0.105, 0.1, 0); part(J.head, G0.sph, skin, 0.02, 0.03, 0.02, 0.105, 0.1, 0);
    // arms: shoulder -> elbow -> hand ; leg: hip -> knee -> ankle
    for (const sd of [-1, 1]) {
      const k = sd < 0 ? 'L' : 'R';
      const sh = J['sh' + k] = pivot(J.chest, sd * 0.235, 0.49, 0);
      part(sh, G0.sph, jacket, 0.065, 0.065, 0.065);
      part(sh, G0.cyl, jacket, 0.058, 0.29, 0.058, 0, -0.145, 0);
      const el = J['el' + k] = pivot(sh, 0, -0.29, 0);
      part(el, G0.sph, o.jacket ? jacket : skin, 0.05, 0.05, 0.05);
      part(el, G0.cyl, o.jacket ? jacket : skin, 0.047, 0.25, 0.047, 0, -0.125, 0);
      const hd = pivot(el, 0, -0.27, 0);
      part(hd, G0.sph, skin, 0.045, 0.06, 0.03, 0, -0.03, 0.005);
      part(hd, G0.sph, skin, 0.016, 0.03, 0.016, -sd * 0.035, -0.015, 0.02);    // thumb
      const hp = J['hp' + k] = pivot(J.hips, sd * 0.095, -0.04, 0);
      part(hp, G0.cyl, pants, 0.085, 0.44, 0.085, 0, -0.22, 0);
      const kn = J['kn' + k] = pivot(hp, 0, -0.44, 0);
      part(kn, G0.sph, pants, 0.07, 0.07, 0.07);
      part(kn, G0.taper, pants, 0.07, 0.42, 0.07, 0, -0.21, 0);
      const an = J['an' + k] = pivot(kn, 0, -0.43, 0);
      part(an, G0.box, shoes, 0.1, 0.08, 0.25, 0, -0.025, 0.05);
      part(an, G0.box, sole, 0.105, 0.025, 0.26, 0, -0.07, 0.05);
    }
    root.userData.blob = blob;
    return { root, J };
  }

  // joint target pose (angles in radians)
  const POSE_KEYS = ['hipsY', 'lean', 'twist', 'shL', 'shR', 'shLz', 'shRz', 'elL', 'elR', 'hpL', 'hpR', 'knL', 'knR', 'anL', 'anR', 'head', 'roll'];

  class Character {
    constructor(opts) {
      opts = opts || {};
      const outfit = opts.outfit || OUTFITS[opts.npc ? 1 + Math.floor(Math.random() * (OUTFITS.length - 1)) : 0];
      const b = build(outfit);
      this.mesh = b.root; this.J = b.J; this.npc = !!opts.npc;
      this.x = 0; this.z = 0; this.y = 0; this.vx = 0; this.vz = 0; this.vy = 0;
      this.heading = 0; this.grounded = true; this.airT = 0; this.landT = 0; this.phase = 0; this.t = Math.random() * 10;
      this.radius = 0.35; this.mass = 80; this.knockT = 0; this.knockDir = 1;
      this.move = { x: 0, z: 0, sprint: false, walk: false, jump: false };
      this.pose = {}; for (const k of POSE_KEYS) this.pose[k] = 0;
      this.mode = 'idle';
      this.input = { throttle: 0 }; // so code treating the focus like a car doesn't break
    }
    get speed() { return Math.hypot(this.vx, this.vz); }
    get fwdSpeed() { return this.speed; }
    setPose(x, z, heading) {
      this.x = x; this.z = z; this.heading = heading || 0; this.y = G.W.groundHeight(x, z);
      this.vx = this.vz = this.vy = 0; this.grounded = true; this.knockT = 0;
      this.sync();
    }
    // world-space desired move direction (length 0..1)
    control(mx, mz, sprint, jump, walk) { Object.assign(this.move, { x: mx, z: mz, sprint: !!sprint, jump: !!jump, walk: !!walk }); }
    knock(vx, vz) {
      if (this.knockT > 0) return;
      this.knockT = 2.2; this.vx = vx; this.vz = vz; this.vy = 4; this.grounded = false;
      const f = Math.sin(this.heading) * vx + Math.cos(this.heading) * vz;
      this.knockDir = f >= 0 ? 1 : -1; // fall forward or backward
    }

    update(dt) {
      this.t += dt;
      const m = this.move, ox = this.x, oz = this.z;
      const ml = Math.min(1, Math.hypot(m.x, m.z));
      const down = this.knockT > 0;
      if (down) this.knockT -= dt;
      // horizontal velocity
      const maxV = m.sprint ? 7.4 : (m.walk ? 1.7 : 4.3);
      let tvx = 0, tvz = 0;
      if (ml > 0.05 && !down) { tvx = m.x / ml * maxV * ml; tvz = m.z / ml * maxV * ml; }
      const acc = down ? 1.6 : (this.grounded ? (ml > 0.05 ? 9 : 12) : 1.5);
      this.vx = G.damp(this.vx, tvx, acc, dt); this.vz = G.damp(this.vz, tvz, acc, dt);
      // turn toward movement
      if (ml > 0.05 && !down) {
        const want = Math.atan2(m.x, m.z);
        this.heading += G.wrapAngle(want - this.heading) * (1 - Math.exp(-(this.grounded ? 12 : 4) * dt));
      }
      // jump
      if (m.jump && this.grounded && !down) { this.vy = 6.6; this.grounded = false; this.airT = 0; this.jumped = true; }
      m.jump = false;
      this.x += this.vx * dt; this.z += this.vz * dt;
      // ground / ramps
      let gh = G.W.groundHeight(this.x, this.z);
      if (gh > this.y + 0.55) { this.x = ox; this.z = oz; this.vx *= -0.2; this.vz *= -0.2; gh = G.W.groundHeight(ox, oz); }
      if (this.grounded) {
        if (gh < this.y - 0.25) { this.grounded = false; this.airT = 0; this.vy = 0; this.jumped = false; }
        else this.y = G.damp(this.y, gh, 25, dt);
      }
      if (!this.grounded) {
        this.airT += dt; this.vy -= G.CFG.GRAVITY * dt; this.y += this.vy * dt;
        if (this.y <= gh) { this.landImp = -this.vy; this.y = gh; this.vy = 0; this.grounded = true; this.landT = G.clamp(this.landImp / 14, 0.15, 0.5); }
      }
      // static colliders (buildings, trees, poles)
      for (let it = 0; it < 2; it++) G.W.collideCircle(this.x, this.z, this.radius, (nx, nz, d) => {
        this.x += nx * d; this.z += nz * d;
        const vn = this.vx * nx + this.vz * nz; if (vn < 0) { this.vx -= nx * vn; this.vz -= nz * vn; }
      });
      // sea + world limits
      const sea = G.CFG.SEA_Z - 2;
      if (this.z > sea) { this.z = G.damp(this.z, sea, 12, dt); if (this.z > sea + 1) this.z = sea + 1; if (this.vz > 0) this.vz = 0; this.inSea = true; } else this.inSea = false;
      // lakes: stay on the shore
      for (const w of G.W.extra ? G.W.extra.waters : []) {
        const dx = this.x - w.x, dz = this.z - w.z, d = Math.hypot(dx, dz);
        if (d < w.r && d > 0.01) { this.x = w.x + dx / d * w.r; this.z = w.z + dz / d * w.r; this.inSea = true; }
      }
      const Lm = G.CFG.WORLD_LIMIT; this.x = G.clamp(this.x, -Lm, Lm); this.z = Math.max(this.z, -Lm - 200);
      this.landT = Math.max(0, this.landT - dt);
      this.animate(dt);
      this.sync();
    }

    // push the character out of car boxes; fast cars knock it down. cars: {x,z,heading,L,Wd|W|radius,vx,vz,y}
    collideCars(cars) {
      const r = this.radius;
      for (const c of cars) {
        if (!c || c === this) continue;
        const dx = this.x - c.x, dz = this.z - c.z;
        if (dx * dx + dz * dz > 49 || Math.abs((c.y || 0) - this.y) > 1.6) continue;
        const L = c.L || 4.4, W = c.Wd || c.W || Math.max(1.6, (c.radius - 0.1) * 4 - L);
        const fx = Math.sin(c.heading), fz = Math.cos(c.heading), sx = fz, sz = -fx;
        const u = dx * fx + dz * fz, v = dx * sx + dz * sz;
        const hu = L / 2 + r, hv = W / 2 + r;
        if (Math.abs(u) >= hu || Math.abs(v) >= hv) continue;
        const pu = hu - Math.abs(u), pv = hv - Math.abs(v);
        let nx, nz, d;
        if (pu < pv) { nx = fx * Math.sign(u); nz = fz * Math.sign(u); d = pu; } else { nx = sx * Math.sign(v || 1); nz = sz * Math.sign(v || 1); d = pv; }
        this.x += nx * d; this.z += nz * d;
        const rel = ((c.vx || 0) - this.vx) * nx + ((c.vz || 0) - this.vz) * nz; // car moving into us
        if (rel > 6.5) { this.knock((c.vx || 0) * 0.8 + nx * 3, (c.vz || 0) * 0.8 + nz * 3); this.hitBy = c; }
        else { const vn = this.vx * nx + this.vz * nz; if (vn < 0) { this.vx -= nx * vn; this.vz -= nz * vn; } }
      }
    }

    animate(dt) {
      const P = {}, sp = this.speed, J = this.J;
      for (const k of POSE_KEYS) P[k] = 0;
      let rate = 12;
      if (this.knockT > 0) {
        // knocked over: fall flat, then get back up
        this.mode = 'down';
        const k = this.knockT > 0.7 ? 1 : this.knockT / 0.7;
        P.roll = k * 1.45 * this.knockDir; P.hipsY = -0.08 * k;
        P.shL = -0.5 * k; P.shR = 0.4 * k; P.shLz = 0.9 * k; P.shRz = 0.9 * k; P.elL = -0.6; P.elR = -0.3;
        P.hpL = -0.3 * k; P.knL = 0.5 * k; P.hpR = 0.1; P.knR = 0.2;
        rate = 7;
      } else if (!this.grounded) {
        this.mode = this.jumped && this.vy > -2 ? 'jump' : 'fall';
        const up = this.vy > 0;
        if (this.mode === 'jump') {
          P.hpL = -0.9; P.knL = 1.3; P.hpR = 0.25; P.knR = 0.8; P.anL = 0.2;
          P.shL = 0.5; P.shR = -1.0; P.elL = -0.5; P.elR = -1.0; P.lean = up ? 0.12 : 0.05;
        } else {
          const f = Math.sin(this.t * 14) * 0.25;
          P.hpL = -0.4 + f; P.hpR = -0.1 - f; P.knL = 0.6; P.knR = 0.4;
          P.shLz = 1.1 + f; P.shRz = 1.1 - f; P.shL = -0.4; P.shR = -0.4; P.elL = -0.4; P.elR = -0.4; P.lean = -0.08;
        }
        rate = 10;
      } else {
        // locomotion: phase advances with distance travelled
        const run = G.clamp((sp - 2.2) / 2.2, 0, 1), sprint = G.clamp((sp - 5) / 2.4, 0, 1), moving = G.clamp(sp / 0.8, 0, 1);
        const stride = G.lerp(1.45, 2.6, run) + sprint * 0.8;
        this.phase += sp * dt / stride * Math.PI * 2;
        const s = Math.sin(this.phase), c = Math.cos(this.phase);
        const amp = G.lerp(0.45, 0.8, run) + sprint * 0.25;
        this.mode = sp < 0.3 ? 'idle' : (sprint > 0.5 ? 'sprint' : run > 0.5 ? 'run' : 'walk');
        // legs: swing + knee bends on the back-swing / passing phase
        P.hpL = -s * amp * moving; P.hpR = s * amp * moving;
        P.knL = (Math.max(0, c) * G.lerp(0.6, 1.5, run) + 0.08) * moving; P.knR = (Math.max(0, -c) * G.lerp(0.6, 1.5, run) + 0.08) * moving;
        P.anL = -Math.min(0, -s) * 0.3 * moving; P.anR = -Math.min(0, s) * 0.3 * moving;
        // arms opposite to legs
        const aAmp = G.lerp(0.35, 0.85, run) + sprint * 0.3;
        P.shL = s * aAmp * moving; P.shR = -s * aAmp * moving;
        P.elL = -(G.lerp(0.25, 1.45, run) + Math.max(0, s) * 0.3 * run) * moving; P.elR = -(G.lerp(0.25, 1.45, run) + Math.max(0, -s) * 0.3 * run) * moving;
        P.shLz = 0.08 + run * 0.08; P.shRz = 0.08 + run * 0.08;
        P.lean = (0.05 * moving + run * 0.12 + sprint * 0.12);
        P.twist = s * 0.12 * moving * (0.5 + run);
        P.hipsY = -Math.abs(c) * 0.035 * moving * (1 + run) + (run > 0 ? Math.abs(s) * 0.03 * run : 0);
        // idle: breathing + gentle sway
        const idle = 1 - moving;
        const br = Math.sin(this.t * 2.2);
        P.shL += br * 0.03 * idle; P.shR -= br * 0.03 * idle; P.shLz += (0.06 + br * 0.015) * idle; P.shRz += (0.06 + br * 0.015) * idle;
        P.elL -= 0.12 * idle; P.elR -= 0.12 * idle; P.head = Math.sin(this.t * 0.6) * 0.18 * idle;
        P.hipsY += br * 0.006 * idle;
        // landing squash
        if (this.landT > 0) { const k = this.landT * 2; P.hipsY -= 0.22 * k; P.knL += 0.9 * k; P.knR += 0.9 * k; P.hpL -= 0.45 * k; P.hpR -= 0.45 * k; P.lean += 0.3 * k; }
        this.chestBreath = 1 + br * 0.015 * (0.4 + idle);
        rate = 14;
      }
      const k = 1 - Math.exp(-rate * dt);
      for (const key of POSE_KEYS) this.pose[key] += (P[key] - this.pose[key]) * k;
      const p = this.pose;
      J.hips.position.y = 0.94 + p.hipsY;
      J.hips.rotation.set(0, -p.twist * 0.4, 0);
      J.spine.rotation.set(p.lean, p.twist, 0);
      J.chest.scale.set(1, 1, this.chestBreath || 1);
      J.head.rotation.set(-p.lean * 0.6, p.head - p.twist * 0.8, 0);
      J.shL.rotation.set(p.shL, 0, -p.shLz); J.shR.rotation.set(p.shR, 0, p.shRz);
      J.elL.rotation.x = p.elL; J.elR.rotation.x = p.elR;
      J.hpL.rotation.x = p.hpL; J.hpR.rotation.x = p.hpR;
      J.knL.rotation.x = p.knL; J.knR.rotation.x = p.knR;
      J.anL.rotation.x = p.anL - p.knL * 0.3 - p.hpL * 0.3; J.anR.rotation.x = p.anR - p.knR * 0.3 - p.hpR * 0.3;
      this.roll = p.roll;
    }

    sync() {
      const m = this.mesh;
      m.position.set(this.x, this.y, this.z);
      m.rotation.set(this.roll || 0, this.heading, 0, 'YXZ');
      // knocked down: lie on the ground (pivot at the feet → lift a bit)
      const blob = m.userData.blob;
      blob.position.y = 0.03 + G.W.groundHeight(this.x, this.z) - this.y;
      const air = G.clamp((this.y - G.W.groundHeight(this.x, this.z)) / 3, 0, 0.8);
      blob.scale.setScalar(1 - air * 0.6);
      blob.rotation.set(-Math.PI / 2 - (this.roll || 0), 0, 0);
    }
    dispose() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); }
  }
  Character.OUTFITS = OUTFITS;
  return Character;
})();
