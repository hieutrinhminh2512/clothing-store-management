// ================================================================
//  Aircraft (G.Air): flyable helicopters + a business jet.
//   Helicopter: Shift lên • Space xuống • W/S nghiêng tới/lùi • A/D xoay
//   Jet: Shift tăng ga • Space giảm ga/phanh • S kéo mũi lên • W chúi
//        mũi xuống • A/D nghiêng cánh (rẽ). Cất cánh trên đường băng.
//  Crashing (hitting buildings/ground hard, ditching in water) explodes.
// ================================================================
'use strict';

G.Air = (function () {
  const A = { list: [] };
  const scene = () => G.Game.scene();
  const K = () => G.input.keys;

  // ---------------- Models ----------------
  function heliModel(color) {
    const g = new THREE.Group();
    const paint = G.CarModels.paint(color), dark = new THREE.MeshStandardMaterial({ color: G.col(0x1d2026), metalness: 0.6, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: G.col(0x0d1620), roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 });
    const add = (geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); if (sx) m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
    add(new THREE.SphereGeometry(1.4, 20, 14), paint, 0, 1.75, 0.2, 0, 0, 0, 1, 0.95, 1.75);           // cabin
    add(new THREE.SphereGeometry(1.25, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.9, 1.3, Math.PI / 2 - 0.35, 0, 0, 0.95, 1, 0.9); // canopy
    add(new THREE.CylinderGeometry(0.22, 0.45, 5.6, 10), paint, 0, 2.05, -3.6, Math.PI / 2 + 0.05);   // tail boom
    add(new THREE.BoxGeometry(0.12, 1.5, 0.9), paint, 0, 2.7, -6.2, -0.25);                               // fin
    add(new THREE.BoxGeometry(1.8, 0.08, 0.5), paint, 0, 2.1, -5.6);                                      // stabiliser
    for (const sd of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.07, 0.07, 3.8, 6), dark, sd * 0.95, 0.12, 0.1, Math.PI / 2);      // skids
      for (const z of [-0.8, 1.0]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), dark, sd * 0.85, 0.55, z, 0, 0, sd * 0.25);
    }
    add(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 8), dark, 0, 3.15, 0.1);                               // mast
    G.CarModels.mergeByMaterial(g);
    const rotor = new THREE.Group(); rotor.position.set(0, 3.45, 0.1); g.add(rotor);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 5.2), dark); b.position.z = 2.6; const p = new THREE.Group(); p.rotation.y = k * Math.PI / 2; p.add(b); rotor.add(p); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.3, 32), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2; rotor.add(disc);
    const tail = new THREE.Group(); tail.position.set(0.15, 2.75, -6.3); g.add(tail);
    for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.12), dark); b.rotation.x = k * Math.PI / 2; tail.add(b); }
    g.userData = { rotor, tail, disc };
    return g;
  }
  function jetModel(livery) {
    const g = G.Districts.airliner(livery, 0.42);
    g.userData = {};
    return g;
  }

  // ---------------- Aircraft objects ----------------
  function make(type, spawn, opts) {
    opts = opts || {};
    const mesh = type === 'heli' ? heliModel(opts.color || 0x1565c0) : jetModel(opts.color || 0x0b4ea2);
    const a = {
      type, mesh, spawn, label: type === 'heli' ? 'trực thăng' : 'máy bay', x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0,
      vx: 0, vy: 0, vz: 0, speed: 0, throttle: 0, rotorSpin: 0, rpm: 900, grounded: true, surface: 'road', slip: 0, nitroOn: false,
      input: { throttle: 0 }, camDist: type === 'heli' ? 15 : 24, camUp: type === 'heli' ? 5 : 7, gear: type === 'heli' ? 0 : 0.55,
      radius: type === 'heli' ? 5.2 : 7, wreck: false, idleT: 0,
    };
    scene().add(mesh);
    reset(a);
    A.list.push(a);
    return a;
  }
  function reset(a) {
    const s = a.spawn;
    a.x = s.x; a.z = s.z; a.heading = s.h; a.y = G.W.groundHeight(s.x, s.z); a.vx = a.vy = a.vz = 0; a.pitch = a.roll = 0; a.throttle = 0; a.wreck = false; a.idleT = 0;
    a.mesh.visible = true;
    a.mesh.traverse((o) => { if (o.material && o.material.userData.orig) { o.material.color.copy(o.material.userData.orig); } });
    sync(a);
  }
  function sync(a) {
    a.mesh.position.set(a.x, a.y, a.z);
    a.mesh.rotation.set(a.pitch, a.heading, a.roll, 'YXZ');
    const u = a.mesh.userData;
    if (u.rotor) { u.rotor.rotation.y = a.rotorSpin; u.tail.rotation.x = a.rotorSpin * 1.7; u.disc.material.opacity = G.clamp((a.rpm - 900) / 6000, 0, 1) * 0.18; }
  }
  A.init = function () {
    if (A.list.length || !G.Districts || !G.Districts.spawns.heli) return;
    const S = G.Districts.spawns, P = G.W.PAD;
    make('heli', S.heli, { color: 0x1565c0 });
    make('heli', { x: P.x0 + 60, z: P.z1 - 40, h: -Math.PI / 2 }, { color: 0xd32f2f });
    make('jet', S.jet, { color: 0x0b4ea2 });
    if (G.Districts.helipad) G.Districts.helipad(P.x0 + 60, P.z1 - 40);
  };

  // ---------------- Boarding ----------------
  A.near = function (C) {
    let best = null, bd = Infinity;
    for (const a of A.list) { if (a.wreck) continue; const d = Math.hypot(a.x - C.x, a.z - C.z); if (d < (a.type === 'jet' ? 11 : 7) && d < bd) { bd = d; best = a; } }
    return best ? { a: best, dist: bd } : null;
  };
  A.board = function (a) {
    G.Game.setFlying(a);
    a.idleT = 0;
    showHud(true);
    G.UI.toast(a.type === 'heli' ? '🚁 Shift: lên • Space: xuống • W/S: bay tới/lùi • A/D: xoay • F: xuống' : '✈️ Shift: tăng ga • Space: giảm ga • S: kéo lên • W: chúi xuống • A/D: nghiêng • F: xuống (khi đã dừng)', 6000);
    return true;
  };
  A.exit = function () {
    const a = G.Game.flying; if (!a) return false;
    const agl = a.y - G.W.groundHeight(a.x, a.z);
    if (agl > 2.5 || a.speed > 6) { G.UI.toast('Hạ cánh và dừng hẳn trước khi xuống', 1800); return false; }
    const sx = Math.cos(a.heading), sz = -Math.sin(a.heading), off = a.type === 'jet' ? 6 : 3.2;
    G.Game.setFlying(null, { x: a.x + sx * off, z: a.z + sz * off, heading: a.heading });
    a.throttle = 0; showHud(false);
    return true;
  };
  A.abandon = function (a) { showHud(false); if (a && !a.wreck) { a.throttle = 0; } };

  // ---------------- Flight ----------------
  const GR = G.CFG.GRAVITY;
  A.fly = function (a, dt) {
    const k = K(), inp = G.input.state, frozen = G.GTA && G.GTA.frozen;
    // touch: N₂O button = up / more throttle, ⛔ = down / less throttle
    const up = !frozen && (k.ShiftLeft || k.ShiftRight || inp.nitro) ? 1 : 0, down = !frozen && (k.Space || inp.handbrake) ? 1 : 0;
    const fwd = frozen ? 0 : inp.throttle - inp.brake, turn = frozen ? 0 : inp.steer;
    if (a.type === 'heli') flyHeli(a, dt, up, down, fwd, turn); else flyJet(a, dt, up, down, fwd, turn);
    if (!G.Game.flying) return;
    collide(a, dt);
    a.speed = Math.hypot(a.vx, a.vz, a.vy);
    a.input.throttle = a.type === 'heli' ? Math.max(up, Math.abs(fwd)) : a.throttle;
    a.rpm = a.type === 'heli' ? 2600 + up * 3200 + Math.abs(fwd) * 1500 : 1500 + a.throttle * 6000;
    sync(a);
    updateHud(a);
  };
  function flyHeli(a, dt, up, down, fwd, turn) {
    a.rotorSpin += dt * 28;
    const grounded = a.y - G.W.groundHeight(a.x, a.z) < 0.15;
    // attitude: nose down to go forward, bank with yaw
    a.pitch = G.damp(a.pitch, grounded ? 0 : fwd * 0.38, 3, dt);
    a.heading += turn * 1.25 * dt;
    a.roll = G.damp(a.roll, grounded ? 0 : -turn * 0.25, 3, dt);
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    if (!grounded) { a.vx += fx * a.pitch * 42 * dt; a.vz += fz * a.pitch * 42 * dt; }
    const drag = Math.exp(-0.38 * dt); a.vx *= drag; a.vz *= drag;
    const sp = Math.hypot(a.vx, a.vz); if (sp > 62) { a.vx *= 62 / sp; a.vz *= 62 / sp; }
    a.vy = G.damp(a.vy, (up - down) * 11, 2.4, dt);
    if (grounded && a.vy < 0) a.vy = 0;
    if (grounded) { a.vx *= Math.exp(-4 * dt); a.vz *= Math.exp(-4 * dt); }
    a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt;
  }
  function flyJet(a, dt, up, down, fwd, turn) {
    a.throttle = G.clamp(a.throttle + (up - down) * 0.45 * dt, 0, 1);
    const gh = G.W.groundHeight(a.x, a.z), onGround = a.y - gh < 0.2;
    let v = Math.hypot(a.vx, a.vy, a.vz);
    // thrust + drag along the nose
    v += (a.throttle * 26 - 0.0011 * v * v - (onGround && down ? 14 : 0) - (onGround ? 0.8 : 0) - Math.sin(a.pitch) * GR * 0.8) * dt;
    v = Math.max(0, Math.min(v, 125));
    const lift = G.clamp((v - 38) / 22, 0, 1); // flying speed reached
    // controls: S pulls the nose up (W pushes down), A/D bank
    const pitchIn = -fwd;
    if (onGround) {
      a.pitch = G.damp(a.pitch, lift > 0.3 && pitchIn > 0 ? 0.18 : 0, 3, dt);
      a.heading += turn * 0.6 * dt * G.clamp(v / 15, 0, 1) * (v < 30 ? 1 : 0.3);
      a.roll = G.damp(a.roll, 0, 5, dt);
    } else {
      a.pitch = G.clamp(a.pitch + pitchIn * 0.7 * dt * (0.4 + lift * 0.6), -0.7, 0.75);
      if (!pitchIn) a.pitch = G.damp(a.pitch, 0, 0.6, dt); // hands off: settle to level flight
      a.roll = G.damp(a.roll, -turn * 0.9, 2.2, dt);
      a.heading += Math.sin(-a.roll) * dt * 0.9 * (0.4 + lift * 0.6);
      if (lift < 0.6) a.pitch = G.damp(a.pitch, -0.35, (0.6 - lift) * 2, dt); // stall: nose drops
    }
    const cp = Math.cos(a.pitch);
    a.vx = Math.sin(a.heading) * cp * v; a.vz = Math.cos(a.heading) * cp * v;
    a.vy = Math.sin(a.pitch) * v - (1 - lift) * (onGround ? 0 : GR * 0.9);
    if (onGround && a.vy < 0) a.vy = 0;
    a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt;
  }
  function collide(a, dt) {
    const gh = G.W.groundHeight(a.x, a.z);
    // ground
    if (a.y <= gh) {
      const hard = a.vy < -9 || (a.type === 'jet' && (a.pitch < -0.25 || Math.abs(a.roll) > 0.5) && a.speed > 20);
      a.y = gh;
      if (hard) return crash(a, 'Máy bay rơi');
      a.vy = 0; if (a.type === 'jet' && a.speed > 10 && !G.W.onRoad(a.x, a.z)) { a.vx *= Math.exp(-1.5 * dt); a.vz *= Math.exp(-1.5 * dt); }
    }
    // water
    if (a.y - gh < 1.2 && G.W.isWater(a.x, a.z) && !G.W.onRoad(a.x, a.z)) return crash(a, 'Rơi xuống nước');
    // buildings / hills (colliders carry a height)
    let hit = null;
    G.W.collideCircle(a.x, a.z, a.type === 'heli' ? 4.8 : 6, (nx, nz, d, c) => { const h = c && c.h !== undefined ? c.h : 12; if (a.y < h) hit = hit || { nx, nz, d }; });
    if (hit) {
      if (a.speed > 14) return crash(a, 'Đâm vào công trình');
      a.x += hit.nx * hit.d; a.z += hit.nz * hit.d; const vn = a.vx * hit.nx + a.vz * hit.nz; if (vn < 0) { a.vx -= hit.nx * vn * 1.4; a.vz -= hit.nz * vn * 1.4; }
      a.shake = 0.4;
    }
    const L = G.CFG.WORLD_LIMIT + 400; a.x = G.clamp(a.x, -L, L); a.z = G.clamp(a.z, -L - 400, 2600); a.y = Math.min(a.y, 900);
  }
  function crash(a, why) {
    a.wreck = true; a.respawnT = 20;
    if (G.GTA) G.GTA.explosion(a.x, a.y, a.z);
    a.mesh.traverse((o) => { if (o.material && o.material.color) { if (!o.material.userData.orig) o.material.userData.orig = o.material.color.clone(); o.material.color.setRGB(0.03, 0.03, 0.03); } });
    if (G.Game.flying === a) {
      showHud(false);
      const sx = Math.cos(a.heading), sz = -Math.sin(a.heading);
      G.Game.setFlying(null, { x: a.x + sx * 4, z: a.z + sz * 4, heading: a.heading });
      if (G.GTA) G.GTA.wasted(why);
    }
  }

  // idle aircraft: respawn wrecks and planes left far away
  A.update = function (dt) {
    if (!A.list.length) A.init();
    const F = G.Game.focus ? G.Game.focus() : null;
    for (const a of A.list) {
      if (G.Game.flying === a) continue;
      if (a.type === 'heli') { a.rotorSpin += dt * G.clamp(a.rpm / 400, 0, 25); a.rpm = Math.max(900, a.rpm - dt * 1500); sync(a); }
      // unpiloted aircraft settle on the ground
      const gh = G.W.groundHeight(a.x, a.z);
      if (a.y > gh + 0.05 && !a.wreck) { a.vy -= GR * dt; a.y = Math.max(gh, a.y + a.vy * dt); if (a.y === gh) { if (a.vy < -10) crash(a, ''); a.vy = 0; } sync(a); }
      if (a.wreck) { a.respawnT -= dt; if (a.respawnT <= 0 && F && Math.hypot(F.x - a.spawn.x, F.z - a.spawn.z) > 80) reset(a); continue; }
      const far = F ? Math.hypot(F.x - a.x, F.z - a.z) : 0, home = Math.hypot(a.x - a.spawn.x, a.z - a.spawn.z);
      if (home > 30 && far > 400) { a.idleT += dt; if (a.idleT > 45 && F && Math.hypot(F.x - a.spawn.x, F.z - a.spawn.z) > 150) reset(a); }
    }
  };

  // ---------------- HUD: altitude / speed / throttle ----------------
  let hud = null;
  function showHud(on) {
    if (!hud) { hud = document.createElement('div'); hud.className = 'air-hud hidden'; (document.getElementById('hud') || document.body).appendChild(hud); }
    hud.classList.toggle('hidden', !on);
  }
  let hudT = 0;
  function updateHud(a) {
    hudT -= 1 / 60; if (hudT > 0 || !hud) return; hudT = 0.1;
    const agl = a.y - G.W.groundHeight(a.x, a.z);
    hud.innerHTML = `<b>${a.type === 'heli' ? '🚁' : '✈️'} ĐỘ CAO</b> ${Math.round(agl)} m &nbsp; <b>TỐC ĐỘ</b> ${Math.round(a.speed * 3.6)} km/h` +
      (a.type === 'jet' ? ` &nbsp; <b>GA</b> ${Math.round(a.throttle * 100)}%` + (a.y - G.W.groundHeight(a.x, a.z) < 0.3 && a.speed < 38 && a.throttle > 0.2 ? ' &nbsp;<i>cất cánh ở ≥ 140 km/h, nhấn S để kéo lên</i>' : '') : '');
  }
  return A;
})();
