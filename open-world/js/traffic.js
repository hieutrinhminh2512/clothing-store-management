// ================================================================
//  Traffic (lane-following AI with traffic lights) and police
// ================================================================
'use strict';

// Generic AI steering toward a waypoint with corner-speed planning
G.aiDrive = function (car, wp, next, opts) {
  opts = opts || {};
  const dt = opts.dt || 1 / 60;
  // recovering from being stuck: reverse while steering the other way
  if (car.aiRev > 0) {
    car.aiRev -= dt;
    Object.assign(car.input, { throttle: 0, brake: 1, steer: car.aiRevSteer, handbrake: false, nitro: false });
    return Math.hypot(wp.x - car.x, wp.z - car.z);
  }
  const dx = wp.x - car.x, dz = wp.z - car.z, dist = Math.hypot(dx, dz);
  const diff = G.wrapAngle(Math.atan2(dx, dz) - car.heading);
  const v = car.fwdSpeed;
  let steer = G.clamp(diff * 2.4, -1, 1);
  let throttle = 1, brake = 0;
  let cornerV = car.perf.maxSpeed * (opts.speedK || 1);
  if (next) {
    const ax = dx / (dist || 1), az = dz / (dist || 1);
    const bx = next.x - wp.x, bz = next.z - wp.z, bl = Math.hypot(bx, bz) || 1;
    const turn = Math.acos(G.clamp(ax * bx / bl + az * bz / bl, -1, 1));
    cornerV = Math.min(cornerV, G.lerp(cornerV, 17, G.clamp(turn / 1.5, 0, 1)));
    const brakeDist = (v * v - cornerV * cornerV) / (2 * car.perf.brake * 0.8) + 8;
    if (v > cornerV && dist < brakeDist) { throttle = 0; brake = 1; }
  }
  if (Math.abs(diff) > 0.7 && v > 18) { throttle = 0; brake = Math.abs(diff) > 1.2 ? 1 : 0.3; }
  if (Math.abs(diff) > 2.2 && v < 6) { // target behind: reverse-turn
    throttle = 0; brake = 1; steer = -Math.sign(diff);
  }
  if (throttle > 0 && car.speed < 1.5) car.aiStuck = (car.aiStuck || 0) + dt; else car.aiStuck = 0;
  if (car.aiStuck > 1.2) { car.aiStuck = 0; car.aiRev = 1.3; car.aiRevSteer = -Math.sign(steer || 1); }
  car.input.steer = steer; car.input.throttle = throttle; car.input.brake = brake;
  car.input.handbrake = false;
  car.input.nitro = !!opts.nitro && Math.abs(diff) < 0.15 && throttle > 0 && car.nitro > 0.3;
  return dist;
};

G.Traffic = (function () {
  const T = { cars: [] };
  const C = G.CFG, W = () => G.W;
  const PAL = [0xd8d8d8, 0x202226, 0x8a1c1c, 0x1c3f8a, 0x5c6066, 0xe8e0d0, 0x2f5a3a, 0x9a7a4a, 0x4a2f5a, 0xb0b8c0, 0x111111, 0xf0f0f0];
  const STRAIGHT_IN = 18;
  let scene;

  function laneOff(lane) { return 3 + lane * 6; }
  function dirOf(a, b) { const dx = Math.sign(b.i - a.i), dz = Math.sign(b.j - a.j); return { x: dx, z: dz }; }
  function nodeP(n) { return W().node(n.i, n.j); }

  function setupStraight(t) {
    const A = nodeP(t.a), B = nodeP(t.b), d = dirOf(t.a, t.b), r = { x: -d.z, z: d.x }, o = laneOff(t.lane);
    t.d = d; t.r = r;
    t.p0 = { x: A.x + d.x * STRAIGHT_IN + r.x * o, z: A.z + d.z * STRAIGHT_IN + r.z * o };
    t.len = C.PITCH - STRAIGHT_IN * 2;
    t.phase = 'straight';
  }
  function pickNext(t) {
    const opts = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { i: t.b.i + di, j: t.b.j + dj };
      if (n.i < 0 || n.j < 0 || n.i > C.N || n.j > C.N) continue;
      if (n.i === t.a.i && n.j === t.a.j) continue;
      const d2 = dirOf(t.b, n);
      const straight = d2.x === t.d.x && d2.z === t.d.z;
      opts.push({ n, w: straight ? 3 : 1 });
    }
    let tot = opts.reduce((s, o) => s + o.w, 0), r = Math.random() * tot;
    for (const o of opts) { r -= o.w; if (r <= 0) return o.n; }
    return opts[0].n;
  }
  function setupTurn(t) {
    const B = nodeP(t.b), o = laneOff(t.lane);
    const c = pickNext(t), d2 = dirOf(t.b, c), r2 = { x: -d2.z, z: d2.x };
    const p0 = { x: B.x - t.d.x * STRAIGHT_IN + t.r.x * o, z: B.z - t.d.z * STRAIGHT_IN + t.r.z * o };
    const p2 = { x: B.x + d2.x * STRAIGHT_IN + r2.x * o, z: B.z + d2.z * STRAIGHT_IN + r2.z * o };
    const straight = d2.x === t.d.x && d2.z === t.d.z;
    const p1 = straight ? { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 } : { x: B.x + t.r.x * o + r2.x * o, z: B.z + t.r.z * o + r2.z * o };
    let len = 0, px = p0.x, pz = p0.z;
    for (let k = 1; k <= 8; k++) { const q = bez(p0, p1, p2, k / 8); len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
    t.turn = { p0, p1, p2, len, straight, next: c };
    t.phase = 'turn'; t.s = 0;
  }
  function bez(a, b, c, u) { const k = 1 - u; return { x: k * k * a.x + 2 * k * u * b.x + u * u * c.x, z: k * k * a.z + 2 * k * u * b.z + u * u * c.z }; }

  function randomSegment(nearX, nearZ, minD, maxD) {
    for (let tries = 0; tries < 60; tries++) {
      const a = { i: Math.floor(Math.random() * (C.N + 1)), j: Math.floor(Math.random() * (C.N + 1)) };
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => a.i + di >= 0 && a.i + di <= C.N && a.j + dj >= 0 && a.j + dj <= C.N);
      const [di, dj] = dirs[Math.floor(Math.random() * dirs.length)];
      const b = { i: a.i + di, j: a.j + dj };
      const A = nodeP(a), B = nodeP(b), mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      const d = Math.hypot(mx - nearX, mz - nearZ);
      if (d >= minD && d <= maxD) return { a, b };
    }
    return null;
  }
  function place(t, seg, s) {
    t.a = seg.a; t.b = seg.b; t.lane = Math.random() < 0.5 ? 0 : 1;
    setupStraight(t); t.s = s !== undefined ? s : Math.random() * t.len;
    t.speed = t.cruise * 0.8; t.wrecked = 0; t.mesh.visible = true;
    poseFromPath(t, 0.001);
  }
  function poseFromPath(t, dt) {
    let x, z, hx, hz;
    if (t.phase === 'straight') {
      x = t.p0.x + t.d.x * t.s; z = t.p0.z + t.d.z * t.s; hx = t.d.x; hz = t.d.z;
    } else {
      const u = G.clamp(t.s / t.turn.len, 0, 1), p = bez(t.turn.p0, t.turn.p1, t.turn.p2, u), q = bez(t.turn.p0, t.turn.p1, t.turn.p2, Math.min(1, u + 0.05));
      x = p.x; z = p.z; hx = q.x - p.x; hz = q.z - p.z; if (Math.hypot(hx, hz) < 1e-4) { hx = t.d.x; hz = t.d.z; }
    }
    const h = Math.atan2(hx, hz);
    if (dt > 0) { t.vx = (x - t.x) / dt; t.vz = (z - t.z) / dt; }
    t.x = x; t.z = z; t.heading = h;
  }

  T.init = function (sc, count) {
    scene = sc;
    if (!G.CarModels.TrafficInst.types.length) G.CarModels.TrafficInst.init(scene, 22);
    T.cars.forEach((c) => { scene.remove(c.mesh); if (c.inst) G.CarModels.TrafficInst.free(c.inst); });
    T.cars = [];
    for (let k = 0; k < count; k++) T.add(k);
  };
  T.add = function (k, police) {
    const type = police ? -1 : (k % 9 === 0 ? 3 : (k % 7 === 0 ? 4 : k % 3));
    // civilians are drawn with instancing; t.mesh is just a transform holder for them
    const inst = police ? null : G.CarModels.TrafficInst.alloc(type, PAL[k % PAL.length]);
    if (!police && !inst) return null;
    const mesh = police ? G.CarModels.build(G.POLICE_SPEC, 0x14161c) : new THREE.Object3D();
    if (police) scene.add(mesh);
    const b = police ? G.POLICE_SPEC.body : G.CarModels.trafficTypes()[type].b;
    const t = { mesh, inst, police: !!police, isTraffic: true, x: 0, z: 0, y: 0, heading: 0, vx: 0, vz: 0, yaw: 0, cruise: 12 + Math.random() * 6, speed: 0, wrecked: 0,
      radius: (b.L + b.W) / 4 + 0.1, mass: b.style === 'van' ? 2600 : 1400, L: b.L, W: b.W, wheelR: b.wheelR, spin: 0,
      k, type, style: b.style, hex: b.style === 'taxi' ? 0xf7c600 : PAL[k % PAL.length] };
    t.onHit = (other, imp) => { if (imp > 2.5 && !t.wrecked) { t.wrecked = 6 + Math.random() * 3; t.yaw = (Math.random() - 0.5) * imp * 0.3; if (T.onPlayerHit && other.isPlayer) T.onPlayerHit(t, imp); } };
    const seg = randomSegment(0, 0, 0, 99999);
    place(t, seg);
    T.cars.push(t);
    return t;
  };
  // take a car out of traffic (car-jacking); respawn a replacement of the same type elsewhere
  T.remove = function (t, respawn) {
    const i = T.cars.indexOf(t); if (i < 0) return;
    T.cars.splice(i, 1);
    if (t.inst) { G.CarModels.TrafficInst.free(t.inst); t.inst = null; } else scene.remove(t.mesh);
    if (respawn) setTimeout(() => { const n = T.add(t.k, t.police); if (n && G.Game && G.Game.player) { const P = G.Game.player, seg = randomSegment(G.clamp(P.x, -C.HALF, C.HALF), G.clamp(P.z, -C.HALF, C.HALF), 200, 520); if (seg) place(n, seg); } }, 4000);
  };
  T.setCount = function (n) {
    while (T.cars.filter((c) => !c.police).length > n) { const i = T.cars.findIndex((c) => !c.police); G.CarModels.TrafficInst.free(T.cars[i].inst); T.cars.splice(i, 1); }
    let k = T.cars.length; while (T.cars.filter((c) => !c.police).length < n) { if (!T.add(k++)) break; }
  };

  T.update = function (dt, time, player, others) {
    const px = player.x, pz = player.z;
    for (const t of T.cars) {
      // recycle cars far from the player so traffic always surrounds them
      const dP = Math.hypot(t.x - px, t.z - pz);
      if (dP > 650 || (t.wrecked > 0 && t.wrecked < 0.1 && dP > 90)) {
        const seg = randomSegment(G.clamp(px, -C.HALF, C.HALF), G.clamp(pz, -C.HALF, C.HALF), 160, 520);
        if (seg) place(t, seg);
        continue;
      }
      if (t.wrecked > 0) {
        // free physics after a crash
        t.wrecked = Math.max(0.05, t.wrecked - dt);
        t.vx *= Math.exp(-1.6 * dt); t.vz *= Math.exp(-1.6 * dt); t.yaw *= Math.exp(-2 * dt);
        t.x += t.vx * dt; t.z += t.vz * dt; t.heading += t.yaw * dt;
        G.W.collideCircle(t.x, t.z, t.radius * 0.8, (nx, nz, d) => { t.x += nx * d; t.z += nz * d; const vn = t.vx * nx + t.vz * nz; if (vn < 0) { t.vx -= nx * vn * 1.3; t.vz -= nz * vn * 1.3; } });
        t.mesh.position.set(t.x, 0, t.z); t.mesh.rotation.y = t.heading;
        if (t.inst) G.CarModels.TrafficInst.set(t.inst, t.mesh);
        continue;
      }
      // desired speed: cruise, slower in turns, stop for red lights and cars ahead
      let target = t.phase === 'turn' && !t.turn.straight ? 7 : t.cruise;
      if (t.phase === 'straight') {
        const remain = t.len - t.s;
        const axis = t.d.x !== 0 ? 'x' : 'z';
        const sig = G.W.signal(t.b.i, t.b.j, axis, time);
        if ((sig === 'r' || (sig === 'y' && remain > 10)) && remain < 45) target = Math.min(target, Math.max(0, (remain - 1.5) * 0.6));
      }
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
      let gapMin = 999;
      const scan = (o) => {
        if (o === t) return;
        const dx = o.x - t.x, dz = o.z - t.z, fwd = dx * fx + dz * fz;
        if (fwd <= 0 || fwd > 30) return;
        const lat = Math.abs(dx * fz - dz * fx);
        if (lat < 2.6) gapMin = Math.min(gapMin, fwd);
      };
      for (const o of T.cars) scan(o);
      for (const o of others) scan(o);
      if (gapMin < 30) target = Math.min(target, Math.max(0, (gapMin - 7.5) * 0.9));
      if (gapMin < 9 && others.some((o) => o.isPlayer && Math.hypot(o.x - t.x, o.z - t.z) < 10) && Math.random() < dt * 0.4 && T.onHonk) T.onHonk(t);
      t.speed = target < t.speed ? Math.max(target, t.speed - 14 * dt) : Math.min(target, t.speed + 3.2 * dt);
      t.s += t.speed * dt;
      if (t.phase === 'straight' && t.s >= t.len) { t.s -= t.len; setupTurn(t); }
      else if (t.phase === 'turn' && t.s >= t.turn.len) {
        const over = t.s - t.turn.len;
        t.a = t.b; t.b = t.turn.next; setupStraight(t); t.s = over;
      }
      poseFromPath(t, dt);
      t.spin += t.speed * dt / t.wheelR;
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y = t.heading;
      if (t.inst) G.CarModels.TrafficInst.set(t.inst, t.mesh);
      const ws = t.mesh.userData.wheels;
      if (ws) for (const w of ws) { if (w.spin) w.spin.rotation.x = w.mirror ? -t.spin : t.spin; else w.rotation.x = t.spin; }
    }
    G.CarModels.TrafficInst.flush();
  };
  // after a body-collision pass, traffic that was knocked becomes free-physics; others snap back to their path
  T.postCollide = function () {
    for (const t of T.cars) if (!t.wrecked) poseFromPath(t, 0);
  };
  return T;
})();

// ---------------- Police pursuit ----------------
G.Police = (function () {
  const P = { heat: 0, active: false, cops: [], escape: 0, bust: 0, cooldown: 0 };
  let scene;
  P.init = function (sc) { scene = sc; };
  P.reset = function () {
    P.cops.forEach((c) => scene.remove(c.mesh)); P.cops = [];
    P.heat = 0; P.active = false; P.escape = 0; P.bust = 0;
  };
  P.addHeat = function (v, player) {
    if (P.cooldown > 0 && !P.active) return;
    P.heat = Math.min(5, P.heat + v);
    if (!P.active && P.heat >= 0.5) { P.active = true; P.escape = 0; if (P.onStart) P.onStart(); }
    void player;
  };
  P.startLevel = function (lvl) { P.heat = lvl; P.active = true; P.escape = 0; P.bust = 0; if (P.onStart) P.onStart(); };

  function spawnCop(player) {
    const a = player.heading + Math.PI + (Math.random() - 0.5) * 2.0;
    const d = 160 + Math.random() * 120;
    const pose = G.W.nearestRoadPose(player.x + Math.sin(a) * d, player.z + Math.cos(a) * d, Math.atan2(player.x - (player.x + Math.sin(a) * d), player.z - (player.z + Math.cos(a) * d)));
    if (G.W.pointBlocked(pose.x, pose.z)) return;
    const cop = new G.Vehicle(G.POLICE_SPEC, 0x14161c, {});
    cop.isCop = true;
    cop.setPose(pose.x, pose.z, pose.heading);
    cop.stuck = 0; cop.reverse = 0; cop.route = null; cop.routeT = 0;
    // rubber-band: cops get faster with heat
    cop.perf.maxSpeed *= 1 + P.heat * 0.03; cop.perf.accel *= 1 + P.heat * 0.04;
    scene.add(cop.mesh);
    P.cops.push(cop);
  }
  function drive(cop, player, dt) {
    const dx = player.x - cop.x, dz = player.z - cop.z, dist = Math.hypot(dx, dz);
    let wp = { x: player.x + player.vx * Math.min(1, dist / 60), z: player.z + player.vz * Math.min(1, dist / 60) };
    const inCity = Math.abs(cop.x) < G.CFG.RING && Math.abs(cop.z) < G.CFG.RING;
    let next = null;
    cop.routeT -= dt;
    if (inCity && dist > 30) {
      if (cop.routeT <= 0) {
        cop.los = !G.W.segmentBlocked(cop.x, cop.z, player.x, player.z); cop.routeT = 1.2;
        if (!cop.los) {
          const r = G.W.path(G.W.nearestNode(cop.x, cop.z), G.W.nearestNode(player.x, player.z));
          // the nearest node may already be behind us: skip it if we're between it and the next one
          if (r.length > 1) {
            const a = G.W.node(r[0].i, r[0].j), b = G.W.node(r[1].i, r[1].j);
            const fwd = (cop.x - a.x) * (b.x - a.x) + (cop.z - a.z) * (b.z - a.z);
            if (fwd > 0) r.shift();
          }
          cop.route = r;
        }
      }
      if (!cop.los && cop.route && cop.route.length > 0) {
        let n = G.W.node(cop.route[0].i, cop.route[0].j);
        if (Math.hypot(n.x - cop.x, n.z - cop.z) < 14 && cop.route.length > 1) { cop.route.shift(); n = G.W.node(cop.route[0].i, cop.route[0].j); }
        wp = n;
        next = cop.route.length > 1 ? G.W.node(cop.route[1].i, cop.route[1].j) : { x: player.x, z: player.z };
      }
    }
    G.aiDrive(cop, wp, next, { nitro: dist > 140, dt });
    if (dist < 90 && !cop.aiRev && (cop.los || dist < 35)) {
      // close in at a controlled closing speed so they box the player in instead of bulldozing them
      const want = player.speed + G.clamp(dist * 0.3, 3, 26);
      const v = cop.fwdSpeed;
      cop.input.throttle = v < want ? 1 : 0; cop.input.brake = v > want + 6 ? 1 : 0; cop.input.nitro = false;
      if (dist < 9) { cop.input.throttle = player.speed > 6 ? 0.6 : 0; cop.input.brake = player.speed > 6 ? 0 : 0.6; } // contact: box in, don't bulldoze
    }
    return dist;
  }

  // returns {escaped, busted}
  P.update = function (dt, player) {
    if (P.cooldown > 0) P.cooldown -= dt;
    if (!P.active) { P.heat = Math.max(0, P.heat - dt * 0.05); return null; }
    P.heat = Math.min(5, P.heat + dt * 0.012);
    const want = Math.min(6, 1 + Math.ceil(P.heat));
    if (P.cops.length < want && Math.random() < dt * 0.8) spawnCop(player);
    let nearest = 9999, anySee = false;
    for (let i = P.cops.length - 1; i >= 0; i--) {
      const c = P.cops[i];
      const d = drive(c, player, dt);
      c.update(dt); c.syncMesh(dt);
      if (c.ud.siren) { const f = Math.sin(performance.now() * 0.02) > 0; c.ud.siren.red.color.setRGB(f ? 8 : 0.3, 0.05, 0.05); c.ud.siren.blue.color.setRGB(0.05, 0.3, f ? 0.3 : 10); }
      if (d > 750) { scene.remove(c.mesh); P.cops.splice(i, 1); continue; }
      nearest = Math.min(nearest, d);
      if (d < 120 && (c.los || d < 50)) anySee = true;
    }
    P.nearest = nearest;
    // escape: get far away / out of sight
    if (nearest > 230 || (!anySee && nearest > 130)) P.escape += dt; else P.escape = Math.max(0, P.escape - dt * 2);
    if (P.escape >= 10) { const lvl = Math.ceil(P.heat); P.end(); P.cooldown = 8; return { escaped: true, level: lvl }; }
    // busted: boxed in and slow
    if (nearest < 11 && player.speed < 4) P.bust += dt; else P.bust = Math.max(0, P.bust - dt);
    if (P.bust >= 3) { P.end(); P.cooldown = 10; return { busted: true }; }
    return null;
  };
  P.end = function () {
    P.cops.forEach((c) => scene.remove(c.mesh)); P.cops = []; P.active = false; P.heat = 0; P.escape = 0; P.bust = 0;
  };
  return P;
})();
