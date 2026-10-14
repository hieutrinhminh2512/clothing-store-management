// ================================================================
//  Main: boot sequence, game loop, camera, glue between systems
// ================================================================
'use strict';

G.Game = (function () {
  const Gm = { state: 'loading', paused: false, simPaused: false, garage: false, camMode: 0, time: 0, player: null, onFoot: false, char: null, parked: [] };
  let scene, camera, clock, headlight, garageLight;
  // on-foot state: camera orbit, enter/exit transitions, fleeing NPC drivers
  let footYaw = 0, footPitch = 0.22, lastMouse = -9, dragging = false, enterT = null, exitT = null, footHint = null;
  const npcs = [], footPivot = new THREE.Vector3();
  let camYaw = 0, camY = 3, fov = 62, shake = 0, flash = 0, saveT = 0, fpsAcc = 0, fpsN = 0, fpsWarned = false, titleA = 0;
  const camTmp = new THREE.Vector3(), lookTmp = new THREE.Vector3();

  // ---------------- Boot ----------------
  const steps = [
    ['Khởi tạo đồ hoạ...', () => { G.R.init(document.getElementById('game')); scene = G.R.scene; camera = G.R.camera; clock = new THREE.Clock(); }],
    ['Dựng thành phố, đường cao tốc, bãi biển...', () => { G.W.build(scene); }],
    ['Chuẩn bị hiệu ứng...', () => { G.FX.init(scene); G.Police.init(scene); }],
    ['Lắp ráp siêu xe...', () => {
      makePlayer(G.save.selected); spawnPlayer();
      Gm.char = new G.Character(); Gm.char.mesh.visible = false; scene.add(Gm.char.mesh);
    }],
    ['Thả xe cộ ra đường...', () => {
      G.Traffic.init(scene, G.QUALITY[G.save.settings.quality].traffic);
      for (let k = 0; k < 3; k++) G.Traffic.add(1000 + k, true); // patrol cars
      G.Traffic.onPlayerHit = onTrafficHit;
      G.Traffic.onHonk = () => {};
    }],
    ['Đặt sự kiện & đồng xu...', () => { G.Events.init(scene); G.UI.init(); }],
    ['Bật đèn thành phố...', () => { G.R.setTime(G.save.hour, Gm.player); G.W.update(0, 0, G.R.night); }],
  ];
  function boot(i) {
    if (i >= steps.length) {
      // login gate (auth.js) runs before the title screen when present
      if (G.Auth && G.Auth.gate) G.Auth.gate(() => Gm.toTitle()); else Gm.toTitle();
      requestAnimationFrame(frame); return;
    }
    G.UI.loading ? G.UI.loading(i / steps.length, steps[i][0]) : null;
    document.getElementById('loadText').textContent = steps[i][0];
    document.getElementById('loadFill').style.width = Math.round(i / steps.length * 100) + '%';
    setTimeout(() => {
      try { steps[i][1](); } catch (e) { console.error(e); document.getElementById('loadText').textContent = 'Lỗi: ' + e.message; return; }
      boot(i + 1);
    }, 30);
  }
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof THREE === 'undefined') { document.getElementById('loadText').textContent = 'Không tải được Three.js (kiểm tra file three.min.js hoặc kết nối mạng).'; return; }
    // canvas-drawn labels need the web font; don't wait forever when offline
    const fontsReady = document.fonts ? document.fonts.load('700 20px "Chakra Petch"').catch(() => {}) : Promise.resolve();
    Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2500))]).then(() => boot(0));
    document.getElementById('btnPlay').onclick = () => { G.Audio.init(); Gm.play(); };
    document.getElementById('btnTitleGarage').onclick = () => { G.Audio.init(); Gm.play(); Gm.openGarage(); };
  });

  // ---------------- Player ----------------
  function makePlayer(id) {
    const spec = G.carById(id);
    const old = Gm.player;
    const color = spec.colors[G.save.colors[id] || 0];
    const v = new G.Vehicle(spec, color, { player: true, upgrades: G.upg(id) });
    v.isPlayer = true;
    if (old) {
      scene.remove(old.mesh);
      v.x = old.x; v.z = old.z; v.y = old.y; v.heading = old.heading; v.nitro = Math.min(old.nitro, v.perf.nitroCap);
    }
    // the owned car comes back: drop any parked copy of it
    Gm.parked = Gm.parked.filter((p) => { if (p.owned) { scene.remove(p.mesh); return false; } return true; });
    v.owned = true;
    scene.add(v.mesh);
    setupPlayerCar(v);
    if (Gm.onFoot) { v.isPlayer = false; parkInput(v); }
    v.syncMesh(0);
    return v;
  }
  // one shared headlight (spot light) that moves to whichever car the player drives
  function setupPlayerCar(v) {
    if (!headlight) {
      headlight = new THREE.SpotLight(0xfff1dc, 0, 140, 0.55, 0.55, 1.2);
      headlight.target.position.set(0, 0, 40);
    }
    headlight.position.set(0, 0.8, v.spec.body.L / 2);
    v.mesh.add(headlight); v.mesh.add(headlight.target);
    v.onHit = (other, imp) => { if (other.isCop && imp > 4 && !G.Events.active) G.Police.addHeat(0.35); };
    v.isPlayer = true;
    Gm.player = v;
  }
  function parkInput(v) { Object.assign(v.input, { throttle: 0, brake: 0, steer: 0, handbrake: true, nitro: false }); }
  function spawnPlayer() {
    const p = G.W.nearestRoadPose(0, 60, 0);
    Gm.player.setPose(p.x, p.z, p.heading);
    camYaw = p.heading;
  }
  Gm.previewCar = function (id) { makePlayer(id); };
  // drive a temporary vehicle (taxi / police job, multiplayer role); previewCar(G.save.selected) brings the owned car back
  Gm.useVehicle = function (v) {
    const old = Gm.player;
    if (old && old !== v) { scene.remove(old.mesh); v.setPose(old.x, old.z, old.heading); }
    Gm.parked = Gm.parked.filter((p) => { if (p.owned) { scene.remove(p.mesh); return false; } return true; });
    scene.add(v.mesh); setupPlayerCar(v); v.syncMesh(0);
    camYaw = v.heading;
    return v;
  };
  Gm.scene = () => scene;
  Gm.camYaw = () => camYaw;
  Gm.lookYaw = (y) => { camYaw = footYaw = y; };
  // put the player somewhere (hospital / police station): on foot at pose, their car parked at carPose
  Gm.respawn = function (pose, carPose) {
    enterT = exitT = null;
    if (Gm.flying) { if (G.Air) G.Air.abandon(Gm.flying); Gm.flying = null; }
    const P = Gm.player, C = Gm.char;
    if (carPose) { P.setPose(carPose.x, carPose.z, carPose.heading); P.vx = P.vz = 0; }
    if (!Gm.onFoot) { Gm.onFoot = true; P.isPlayer = false; parkInput(P); setFootHud(true); }
    C.setPose(pose.x, pose.z, pose.heading); C.mesh.visible = true; C.knockT = 0;
    footYaw = pose.heading; footPitch = 0.22; footPivot.set(C.x, C.y + 1.55, C.z); camYaw = pose.heading;
  };
  // swap the walking character's model (clothes shop)
  Gm.setOutfit = function (outfit) {
    const old = Gm.char, C = new G.Character({ outfit });
    C.setPose(old.x, old.z, old.heading); C.mesh.visible = old.mesh.visible;
    scene.remove(old.mesh); scene.add(C.mesh); Gm.char = C;
    return C;
  };
  Gm.flying = null; // aircraft being piloted (air.js); the character stays "on foot" but hidden
  Gm.focus = () => Gm.flying || (Gm.onFoot ? Gm.char : Gm.player);
  Gm.setFlying = function (a, exitPose) {
    const C = Gm.char;
    if (a) { Gm.flying = a; C.mesh.visible = false; setFootHud(false); hint(''); camYaw = a.heading; return; }
    Gm.flying = null; enterT = exitT = null;
    if (exitPose) C.setPose(exitPose.x, exitPose.z, exitPose.heading);
    C.mesh.visible = true; setFootHud(true);
    footYaw = C.heading; footPitch = 0.22; footPivot.set(C.x, C.y + 1.55, C.z);
  };

  // ---------------- On foot: exit / enter / car-jacking ----------------
  const JACK_MAP = { sedan: 'vanta', hatch: 'kitsune', suv: 'titan', van: 'titan', taxi: 'vanta' };
  // point beside a car door; side 1 = driver (left), -1 = passenger
  function doorPoint(v, side, out) {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), sx = fz, sz = -fx;
    const w = (v.Wd || v.W || 1.9) / 2 + (out === undefined ? 0.55 : out);
    return { x: v.x + sx * w * side + fx * 0.35, z: v.z + sz * w * side + fz * 0.35 };
  }
  function freeSpot(x, z) { return !G.W.collideCircle(x, z, 0.4, () => {}) && z < G.CFG.SEA_Z - 2; }
  function setFootHud(on) {
    const hud = document.getElementById('hud'); if (hud) hud.classList.toggle('on-foot', on);
    const sp = document.querySelector('.speedo'); if (sp) sp.style.visibility = on ? 'hidden' : '';
    if (!on && footHint) footHint.style.display = 'none';
  }
  function hint(text) {
    if (!footHint) {
      footHint = document.createElement('div'); footHint.id = 'footHint';
      footHint.style.cssText = 'position:absolute;left:50%;bottom:13%;transform:translateX(-50%);padding:7px 16px;border-radius:999px;background:rgba(8,11,22,0.8);border:1px solid rgba(0,229,255,0.45);color:#eaf6ff;font:700 14px "Chakra Petch",sans-serif;letter-spacing:1px;pointer-events:none;display:none;white-space:nowrap';
      (document.getElementById('hud') || document.body).appendChild(footHint);
    }
    if (text) { if (footHint.textContent !== text) footHint.textContent = text; footHint.style.display = ''; } else footHint.style.display = 'none';
  }
  // nearest car the character can get into: the player's / parked cars, or a civilian to car-jack
  function enterTarget() {
    const C = Gm.char; let best = null, bd = 4.6;
    for (const v of [Gm.player, ...Gm.parked]) { const d = Math.hypot(v.x - C.x, v.z - C.z); if (d < bd && v.speed < 6) { bd = d; best = { v }; } }
    for (const t of G.Traffic.cars) {
      if (t.police) continue;
      const d = Math.hypot(t.x - C.x, t.z - C.z) - 0.4; // prefer own car when equally close
      if (d < bd && (t.speed < 9 || t.wrecked)) { bd = d; best = { t }; }
    }
    return best;
  }
  function jack(t) {
    const spec = G.carById(JACK_MAP[t.style] || 'vanta');
    const v = new G.Vehicle(spec, t.hex !== undefined ? t.hex : 0xc0c4c8, { upgrades: { engine: 0, handling: 0, nitro: 0 } });
    v.jacked = true; v.isPlayer = false;
    v.setPose(t.x, t.z, t.heading);
    scene.add(v.mesh); parkInput(v);
    G.Traffic.remove(t, true);
    Gm.parked.push(v);
    // the driver bails out and runs off
    const d = doorPoint(v, 1, 0.6), n = new G.Character({ npc: true });
    n.setPose(d.x, d.z, v.heading + Math.PI / 2); n.life = 7; scene.add(n.mesh); npcs.push(n);
    if (!G.Events.active && G.Traffic.cars.some((c) => c.police && Math.hypot(c.x - v.x, c.z - v.z) < 90)) { G.Police.addHeat(1); G.UI.toast('🚨 Cảnh sát thấy bạn cướp xe!'); }
    else G.UI.toast('🚗 Cướp xe thành công!', 1600);
    return v;
  }
  function trimParked() {
    // keep at most 4 stolen cars lying around (never the owned one)
    const F = Gm.focus();
    while (Gm.parked.filter((p) => !p.owned).length > 4) {
      let far = null, fd = -1;
      for (const p of Gm.parked) if (!p.owned) { const d = Math.hypot(p.x - F.x, p.z - F.z); if (d > fd) { fd = d; far = p; } }
      scene.remove(far.mesh); Gm.parked.splice(Gm.parked.indexOf(far), 1);
    }
  }
  Gm.exitVehicle = function () {
    if (Gm.flying) return G.Air.exit();
    if (Gm.onFoot || Gm.state !== 'play' || Gm.garage || enterT || !Gm.char) return false;
    if (G.Events.active) { G.UI.toast('Không thể xuống xe khi đang trong sự kiện'); return false; }
    if (G.Jobs && G.Jobs.mode) { G.UI.toast('Đang làm ca ' + G.Jobs.label() + ' — nhấn J để kết thúc ca trước khi xuống xe'); return false; }
    const P = Gm.player;
    if (P.speed > 9 || !P.grounded) { G.UI.toast('Giảm tốc để xuống xe'); return false; }
    let side = 1, to = doorPoint(P, 1);
    if (!freeSpot(to.x, to.z)) { const o = doorPoint(P, -1); if (freeSpot(o.x, o.z)) { side = -1; to = o; } else { to = { x: P.x - Math.sin(P.heading) * (P.L / 2 + 0.8), z: P.z - Math.cos(P.heading) * (P.L / 2 + 0.8) }; } }
    const from = doorPoint(P, side, -0.5);
    Gm.onFoot = true; P.isPlayer = false; parkInput(P);
    const C = Gm.char;
    C.setPose(from.x, from.z, P.heading); C.y = P.y; C.mesh.visible = true;
    exitT = { t: 0, from, to };
    footYaw = camYaw; footPitch = 0.22; footPivot.set(C.x, C.y + 1.55, C.z);
    setFootHud(true);
    G.Audio.update(P, 0, true);
    return true;
  };
  Gm.enterVehicle = function () {
    if (!Gm.onFoot || enterT || exitT || Gm.state !== 'play' || !Gm.char || Gm.char.knockT > 0) return false;
    const tg = enterTarget();
    if (!tg) { G.UI.toast('Không có xe nào ở gần'); return false; }
    const v = tg.v || jack(tg.t), C = Gm.char;
    const d1 = doorPoint(v, 1), d2 = doorPoint(v, -1);
    const side = Math.hypot(d2.x - C.x, d2.z - C.z) + 1.5 < Math.hypot(d1.x - C.x, d1.z - C.z) ? -1 : 1;
    enterT = { v, t: 0, at: 0, side };
    return true;
  };
  Gm.toggleVehicle = function () {
    if (Gm.flying) return G.Air.exit();
    if (Gm.onFoot && G.Air && !enterT && !exitT) {
      const a = G.Air.near(Gm.char), tg = enterTarget();
      const dc = tg ? Math.hypot((tg.v || tg.t).x - Gm.char.x, (tg.v || tg.t).z - Gm.char.z) : Infinity;
      if (a && a.dist < dc) return G.Air.board(a.a);
    }
    return Gm.onFoot ? Gm.enterVehicle() : Gm.exitVehicle();
  };
  function finishEnter(v) {
    const old = Gm.player;
    if (v !== old) {
      Gm.parked = Gm.parked.filter((p) => p !== v);
      old.isPlayer = false; parkInput(old); Gm.parked.push(old);
      setupPlayerCar(v);
      trimParked();
    }
    v.isPlayer = true; v.input.handbrake = false;
    Gm.onFoot = false; enterT = null; exitT = null;
    Gm.char.mesh.visible = false; Gm.char.vx = Gm.char.vz = 0;
    camYaw = v.heading; camY = v.y + 2.1;
    setFootHud(false);
  }
  // stepping-out / walking-to-the-door transitions, then normal player control
  function footControl(dt) {
    const C = Gm.char, I = G.input, K = I.keys;
    if (exitT) {
      exitT.t += dt;
      const k = G.clamp(exitT.t / 0.45, 0, 1), e = k * k * (3 - 2 * k);
      C.vx = (exitT.to.x - exitT.from.x) / 0.45; C.vz = (exitT.to.z - exitT.from.z) / 0.45;
      C.x = G.lerp(exitT.from.x, exitT.to.x, e); C.z = G.lerp(exitT.from.z, exitT.to.z, e);
      C.y = G.damp(C.y, G.W.groundHeight(C.x, C.z), 10, dt);
      C.animate(dt); C.sync();
      if (k >= 1) { exitT = null; C.vx *= 0.3; C.vz *= 0.3; }
      return false;
    }
    if (enterT) {
      const v = enterT.v; enterT.t += dt;
      const door = doorPoint(v, enterT.side), dx = door.x - C.x, dz = door.z - C.z, d = Math.hypot(dx, dz);
      if (d > 0.4 && enterT.t < 1.8 && !enterT.at) C.control(dx / d, dz / d, d > 3, false, false);
      else {
        enterT.at += dt; C.control(0, 0);
        C.heading += G.wrapAngle(v.heading + Math.PI / 2 * -enterT.side - C.heading) * (1 - Math.exp(-14 * dt));
        if (enterT.at > 0.28) { finishEnter(v); return false; }
      }
      return true;
    }
    let f = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0);
    let r = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
    if (!f && !r && I.stick && I.stick.active) { f = -I.stick.y; r = I.stick.x; } // phone analog stick
    if (!f && !r) { f = I.state.throttle - I.state.brake; r = -I.state.steer; if (Math.abs(r) < 0.15) r = 0; } // gamepad / touch
    const fx = Math.sin(footYaw), fz = Math.cos(footYaw);
    let mx = fx * f - fz * r, mz = fz * f + fx * r;
    const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    C.control(mx, mz, K.ShiftLeft || K.ShiftRight, I.consume('Space'), K.ControlLeft || K.AltLeft || K.CapsLock);
    return true;
  }
  // mouse drag (any button) on the 3D view orbits the on-foot camera
  window.addEventListener('pointerdown', (e) => { if (e.target && e.target.tagName === 'CANVAS' && e.target.id !== 'minimap') dragging = true; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging || !Gm.onFoot || e.pointerType === 'touch') return; // touch look: G.Mobile -> Gm.lookDelta
    footYaw -= (e.movementX || 0) * 0.006;
    footPitch = G.clamp(footPitch + (e.movementY || 0) * 0.004, -0.25, 1.15);
    lastMouse = Gm.time;
  });
  Gm.lookDelta = function (dx, dy) {
    if (!Gm.onFoot) return;
    footYaw -= dx * 0.006; footPitch = G.clamp(footPitch + dy * 0.004, -0.25, 1.15); lastMouse = Gm.time;
  };
  window.addEventListener('contextmenu', (e) => { if (Gm.onFoot && e.target && e.target.tagName === 'CANVAS' && e.target.id !== 'bigmapCanvas') e.preventDefault(); });

  // ---------------- State changes ----------------
  Gm.toTitle = function () {
    Gm.state = 'title'; Gm.garage = false;
    G.UI.closeGarage(); G.UI.toggleMap(false);
    G.UI.showScreen('title');
    G.Audio.update(Gm.player, 0, true);
  };
  Gm.play = function () {
    Gm.state = 'play'; Gm.paused = false; Gm.simPaused = false;
    G.UI.showScreen('game');
    if (Gm.player.speed < 0.1) camYaw = Gm.player.heading;
    G.UI.toast('Chào mừng đến NEON CITY! Lái tới các cột sáng để tham gia sự kiện.', 4000);
  };
  Gm.togglePause = function (on) {
    if (Gm.state !== 'play') return;
    Gm.paused = on === undefined ? !Gm.paused : on;
    G.UI.showPause(Gm.paused);
    G.Audio.pause(Gm.paused);
  };
  Gm.pauseSim = function (b) { Gm.simPaused = b; };
  Gm.resume = function () { Gm.simPaused = false; };
  Gm.openGarage = function () {
    if (G.Events.active) { G.UI.toast('Không thể vào gara khi đang trong sự kiện'); return; }
    if (G.Jobs && G.Jobs.mode) { G.UI.toast('Kết thúc ca ' + G.Jobs.label() + ' (J) trước khi vào gara'); return; }
    if (G.Net && G.Net.connected && G.Net.role === 'cop') { G.UI.toast('Cảnh sát online không vào gara — đổi vai DÂN THƯỜNG (J › Nhiều người chơi)'); return; }
    if (Gm.onFoot) { G.UI.toast('Lên xe [F] để vào gara'); return; }
    if (G.Police.active) { G.UI.toast('🚨 Cắt đuôi cảnh sát trước!'); return; }
    if (Gm.player.speed > 6) { G.UI.toast('Dừng xe lại để vào gara'); return; }
    Gm.garage = true; G.UI.openGarage();
    if (!garageLight) { garageLight = new THREE.PointLight(0xffffff, 0, 25, 1.5); scene.add(garageLight); }
  };
  Gm.closeGarage = function () {
    Gm.garage = false; G.UI.closeGarage();
    if (Gm.player.spec.id !== G.save.selected || Gm.player.jacked) makePlayer(G.save.selected);
    if (garageLight) garageLight.intensity = 0;
    G.UI.showScreen(Gm.state === 'play' ? 'game' : 'title');
    camYaw = Gm.player.heading;
  };

  // ---------------- Gameplay hooks ----------------
  function onTrafficHit(t, imp) {
    shake = Math.max(shake, Math.min(1, imp / 18));
    G.Audio.crash(imp * 1.5);
    if (G.Events.active) return;
    const patrolNear = G.Traffic.cars.some((c) => c.police && Math.hypot(c.x - Gm.player.x, c.z - Gm.player.z) < 140);
    if (t.police) G.Police.addHeat(1.2);
    else if (patrolNear || G.Police.active) G.Police.addHeat(0.5);
  }
  G.Police.onStart = function () { G.UI.toast('🚨 CẢNH SÁT ĐANG TRUY ĐUỔI!'); };

  // ---------------- Loop ----------------
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    Gm.time += dt;
    G.input.update(dt);
    if (G.Mobile && G.Mobile.update) G.Mobile.update();
    handleKeys();

    const P = Gm.player;
    const sim = Gm.state === 'play' && !Gm.paused && !Gm.simPaused && !Gm.garage && !G.UI.mapOpen;
    if (sim) simulate(dt);
    if (sim && G.Air) G.Air.update(dt);
    else if (Gm.state === 'play' && !Gm.paused && !Gm.garage) { P.syncMesh(0); }

    // day / night
    if (!Gm.paused) G.save.hour = (G.save.hour + dt * 24 / (G.CFG.DAY_MINUTES * 60) * G.save.settings.timeScale) % 24;
    G.R.setTime(G.save.hour, P);
    headlight.intensity = G.R.night * 3.2;
    G.W.update(dt, Gm.time, G.R.night);
    if (!Gm.paused) G.FX.update(dt, G.R.night);

    // camera
    if (Gm.state === 'title') titleCamera(dt);
    else if (Gm.garage) garageCamera(dt);
    else chaseCamera(dt);

    if (!sim) G.Audio.update(P, 0, true);
    flash = Math.max(0, flash - dt * 1.5);
    const speedFx = G.clamp((P.speed - 45) / 60, 0, 1) * 0.6 + (P.nitroOn ? 0.4 : 0);
    G.R.render(dt, Gm.time, Gm.state === 'play' && !Gm.garage ? speedFx : 0, flash);

    // FPS watchdog: suggest lower quality once
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 5) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 28 && !fpsWarned && Gm.state === 'play' && G.save.settings.quality !== 'low') { fpsWarned = true; G.UI.toast('FPS thấp (' + Math.round(fps) + ') — nhấn ESC để giảm chất lượng đồ hoạ', 5000); } }
    G.input.endFrame();
  }

  function handleKeys() {
    const I = G.input;
    if (Gm.state !== 'play') { I.consume('Escape'); return; }
    if (I.consume('Escape')) {
      if (G.UI.mapOpen) G.UI.toggleMap(false);
      else if (Gm.garage) Gm.closeGarage();
      else if (!Gm.simPaused) Gm.togglePause();
    }
    if (Gm.paused || Gm.simPaused) return;
    if (I.consume('KeyM')) G.UI.toggleMap();
    if (Gm.garage) {
      if (I.consume('ArrowRight') || I.consume('KeyD')) G.UI.garageKey(1);
      if (I.consume('ArrowLeft') || I.consume('KeyA')) G.UI.garageKey(-1);
      if (I.consume('KeyG')) Gm.closeGarage();
      return;
    }
    if (G.UI.mapOpen) return;
    if (I.consume('KeyG')) Gm.openGarage();
    // F (or gamepad Y) = get in / out of a car
    if (I.consume('KeyF') || padY()) { I.consume('KeyC'); Gm.toggleVehicle(); }
    if (Gm.flying) {
      if (I.consume('KeyC')) { Gm.camMode = (Gm.camMode + 1) % 2; G.UI.toast(Gm.camMode ? 'Camera: Xa' : 'Camera: Gần', 1000); }
      I.consume('KeyH'); I.consume('KeyE'); I.consume('KeyR');
      return;
    }
    if (Gm.onFoot) {
      // C: slide when running (PUBG), otherwise toggle crouch
      if (I.consume('KeyC') && !enterT && !exitT && !(G.GTA && G.GTA.frozen)) {
        const C = Gm.char;
        if (C.slide()) G.Audio.slide();
        else if (C.slideT <= 0 && C.grounded && C.knockT <= 0) C.crouch = !C.crouch;
      }
      I.consume('KeyH'); I.consume('KeyE');
      if (I.consume('KeyR')) resetPlayer();
      return;
    }
    if (I.consume('KeyC')) { Gm.camMode = (Gm.camMode + 1) % 3; G.UI.toast(['Camera: Gần', 'Camera: Xa', 'Camera: Cản trước'][Gm.camMode], 1200); }
    if (I.consume('KeyR')) resetPlayer();
    if (I.consume('KeyH')) G.Audio.horn();
    if (I.consume('KeyT')) { G.save.hour = (G.save.hour + 1) % 24; G.UI.toast('🕒 +1 giờ', 900); }
    if (I.consume('KeyE')) {
      const m = G.Events.nearMarker;
      if (m && !G.Events.active && G.Jobs && G.Jobs.mode) G.UI.toast('Kết thúc ca ' + G.Jobs.label() + ' (J) để tham gia sự kiện');
      else if (m && !G.Events.active) { if (Gm.player.speed > 15) G.UI.toast('Giảm tốc để bắt đầu sự kiện'); else G.Events.start(m, Gm.player); }
    }
  }
  let padYPrev = false;
  function padY() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && Array.from(pads).find(Boolean);
    const b = !!(p && p.buttons[3] && p.buttons[3].pressed), edge = b && !padYPrev;
    padYPrev = b; return edge;
  }
  function resetPlayer() {
    if (Gm.onFoot) {
      // on foot: step onto the pavement beside the nearest road
      const C = Gm.char, p = G.W.nearestRoadPose(C.x, C.z, C.heading), s = doorPoint({ x: p.x, z: p.z, heading: p.heading, W: 1 }, 1, 6);
      enterT = exitT = null;
      if (freeSpot(s.x, s.z)) C.setPose(s.x, s.z, p.heading); else C.setPose(p.x, p.z, p.heading);
      footYaw = C.heading; footPivot.set(C.x, C.y + 1.55, C.z); return;
    }
    const P = Gm.player, p = G.W.nearestRoadPose(P.x, P.z, P.heading);
    P.setPose(p.x, p.z, p.heading); camYaw = p.heading;
  }

  // parked / stolen cars keep their physics (coast, get pushed) and stay collidable
  function updateParked(dt, F) {
    for (let i = Gm.parked.length - 1; i >= 0; i--) {
      const v = Gm.parked[i];
      if (Math.abs(v.x - F.x) > 400 || Math.abs(v.z - F.z) > 400) continue;
      parkInput(v); v.update(dt);
      if (v.surface === 'water') { scene.remove(v.mesh); Gm.parked.splice(i, 1); continue; }
      v.syncMesh(dt);
    }
  }
  function nearBodies(F, list) {
    for (const t of G.Traffic.cars) if (Math.abs(t.x - F.x) < 80 && Math.abs(t.z - F.z) < 80) list.push(t);
    return list;
  }
  function updateNpcs(dt) {
    // car-jacked drivers run away from the player, then fade out
    const F = Gm.focus();
    for (let i = npcs.length - 1; i >= 0; i--) {
      const n = npcs[i]; n.life -= dt;
      const dx = n.x - F.x, dz = n.z - F.z, d = Math.hypot(dx, dz) || 1;
      n.control(dx / d, dz / d, true, false, false);
      n.update(dt);
      if (n.life < 0.6) n.mesh.scale.setScalar(Math.max(0.01, n.life / 0.6));
      if (n.life <= 0) { n.dispose(); npcs.splice(i, 1); }
    }
  }
  const footHud = { speed: 0, fwdSpeed: 0, gear: 0, rpm: 800, nitro: 0, perf: { nitroCap: 1 }, input: { throttle: 0 } };
  function simulateFoot(dt) {
    const C = Gm.char, P = Gm.player;
    const ctl = G.GTA && G.GTA.frozen ? (C.control(0, 0), true) : footControl(dt);
    if (!Gm.onFoot) return; // just got into a car
    if (ctl) C.update(dt);
    parkInput(P); P.update(dt);
    if (P.surface === 'water') { const p = G.W.nearestRoadPose(P.x, P.z, P.heading); P.setPose(p.x, p.z, p.heading); }
    P.syncMesh(dt);
    updateParked(dt, C);
    updateNpcs(dt);
    const cops = G.Police.cops, racers = G.Events.racers(), cars = [P, ...Gm.parked];
    G.Traffic.update(dt, Gm.time, C, [C, ...cars, ...cops, ...racers]);
    G.Events.update(dt, C, Gm.time); G.Events.nearMarker = null; // events need a car
    const pr = G.Police.update(dt, C);
    if (pr && !G.Events.onPursuitEnd(pr)) {
      if (pr.escaped) { const r = pr.level * 600; G.save.cash += r; G.save.stats.escapes++; G.Audio.cash(); G.UI.popup('ĐÃ CẮT ĐUÔI! +$' + r, '#28ff8a'); }
      else { const fine = Math.min(5000, Math.round(G.save.cash * 0.1)); G.save.cash -= fine; flash = 0.8; G.Audio.fail(); G.UI.toast('🚔 BỊ BẮT! Nộp phạt ' + G.fmtMoney(fine), 3500); if (G.GTA) G.GTA.busted(); }
      G.persist();
    }
    // cars vs cars, then the character vs every car around
    const bodies = nearBodies(C, [...cars, ...cops, ...racers]);
    for (const c of cops) c.isCop = true;
    G.collideBodies(bodies);
    G.Traffic.postCollide();
    C.collideCars(bodies);
    if (C.hitBy) { shake = Math.max(shake, 0.5); G.Audio.crash(10); C.hitBy = null; }
    C.sync();
    G.Audio.update(P, 0, true);
    footHud.speed = footHud.fwdSpeed = C.speed; footHud.nitro = P.nitro; footHud.perf = P.perf;
    G.UI.hud(footHud, G.save.hour);
    G.UI.minimap(C, cops, racers, G.Traffic.cars);
    G.Nav.update(dt, C, Gm.time);
    if (G.GTA) G.GTA.update(dt, C);
    if (G.Net) G.Net.update(dt, C);
    // context hint: what F does here
    const tg = !enterT && !exitT && C.knockT <= 0 ? enterTarget() : null;
    const air = G.Air && !enterT && !exitT ? G.Air.near(C) : null;
    hint(air ? '[F] Lái ' + air.a.label : (tg ? (tg.t ? '[F] Cướp xe' : '[F] Lên xe') : ''));
    saveT += dt; if (saveT > 8) { saveT = 0; G.persist(); }
  }

  const airHud = { speed: 0, fwdSpeed: 0, gear: 0, rpm: 800, nitro: 0, perf: { nitroCap: 1 }, input: { throttle: 0 } };
  function simulateAir(dt) {
    const A = Gm.flying, P = Gm.player;
    G.Air.fly(A, dt);
    if (!Gm.flying) return; // crashed or landed + got out
    parkInput(P); P.update(dt); P.syncMesh(dt);
    updateParked(dt, A);
    const cops = G.Police.cops, racers = G.Events.racers();
    G.Traffic.update(dt, Gm.time, A, [P, ...Gm.parked, ...cops, ...racers]);
    G.Events.nearMarker = null;
    const pr = G.Police.update(dt, A);
    if (pr && !G.Events.onPursuitEnd(pr)) {
      if (pr.escaped) { const r = pr.level * 900; G.save.cash += r; G.Audio.cash(); G.UI.popup('ĐÃ CẮT ĐUÔI! +$' + r, '#28ff8a'); }
      else if (G.GTA) G.GTA.busted();
      G.persist();
    }
    G.collideBodies(nearBodies(P, [P, ...Gm.parked, ...cops]));
    G.Traffic.postCollide();
    if (A.shake) { shake = Math.max(shake, A.shake); A.shake = 0; }
    G.Audio.update(A, G.Police.active ? 0.4 : 0, false);
    airHud.speed = airHud.fwdSpeed = A.speed; airHud.rpm = A.rpm; airHud.gear = 0; airHud.nitro = A.throttle; airHud.input.throttle = A.input.throttle;
    G.UI.hud(airHud, G.save.hour);
    G.UI.minimap(A, cops, racers, G.Traffic.cars);
    G.Nav.update(dt, A, Gm.time);
    if (G.GTA) G.GTA.update(dt, A);
    if (G.Net) G.Net.update(dt, A);
    saveT += dt; if (saveT > 8) { saveT = 0; G.persist(); }
  }

  function simulate(dt) {
    if (Gm.flying) { simulateAir(dt); return; }
    if (Gm.onFoot) { simulateFoot(dt); return; }
    const P = Gm.player, inp = G.input.state;
    Object.assign(P.input, { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, handbrake: inp.handbrake, nitro: inp.nitro });
    if (G.GTA && G.GTA.frozen) Object.assign(P.input, { throttle: 0, brake: 1, steer: 0, nitro: false });
    if (G.Events.freeze) { P.input.throttle = 0; P.input.nitro = false; }
    P.update(dt);
    if (P.surface === 'water') {
      G.FX.splash(P.x, P.z); G.Audio.splash(); G.UI.toast('💦 Xe rơi xuống biển! Đặt lại vị trí...');
      resetPlayer(); flash = 0.3;
    }
    const cops = G.Police.cops, racers = G.Events.racers();
    const extra = [...(G.Jobs ? G.Jobs.bodies() : []), ...(G.Net ? G.Net.bodies() : [])];
    G.Traffic.update(dt, Gm.time, P, [P, ...Gm.parked, ...cops, ...racers, ...extra]);
    updateParked(dt, P);
    if (npcs.length) updateNpcs(dt);
    G.Events.update(dt, P, Gm.time);
    if (G.Events.freeze) { P.vx = P.vz = 0; }
    const pr = G.Police.update(dt, P);
    if (pr) {
      if (!G.Events.onPursuitEnd(pr)) {
        if (pr.escaped) { const r = pr.level * 900; G.save.cash += r; G.save.stats.escapes++; G.Audio.cash(); G.UI.popup('ĐÃ CẮT ĐUÔI! +$' + r, '#28ff8a'); }
        else { const fine = Math.min(5000, Math.round(G.save.cash * 0.1)); G.save.cash -= fine; flash = 0.8; G.Audio.fail(); G.UI.toast('🚔 BỊ BẮT! Nộp phạt ' + G.fmtMoney(fine), 3500); if (G.GTA) G.GTA.busted(); else resetPlayer(); }
        G.persist();
      }
    }
    // patrol cars notice speeding
    if (!G.Police.active && G.Police.cooldown <= 0 && !G.Events.active && P.speed > 36) {
      for (const t of G.Traffic.cars) if (t.police && Math.hypot(t.x - P.x, t.z - P.z) < 55) { G.Police.addHeat(1); G.UI.toast('🚨 Cảnh sát phát hiện bạn chạy quá tốc độ!'); break; }
    }
    // dynamic collisions
    const bodies = nearBodies(P, [P, ...Gm.parked, ...cops, ...racers, ...extra]);
    for (const c of cops) c.isCop = true;
    G.collideBodies(bodies);
    G.Traffic.postCollide();
    // impacts
    if (P.impact > 7) {
      shake = Math.max(shake, Math.min(1, P.impact / 30)); G.Audio.crash(P.impact);
      if (P.hitN) { G.FX.sparks(P.hitP[0], P.y + 0.5, P.hitP[1], P.hitN[0], P.hitN[1], Math.min(40, P.impact * 2)); P.hitN = null; }
    }
    if (P.landImpact) { if (P.landImpact > 8) { shake = Math.max(shake, Math.min(0.8, P.landImpact / 30)); G.Audio.land(P.landImpact); } P.landImpact = 0; }
    P.syncMesh(dt);
    G.Stunts.update(dt, P, G.Traffic.cars);
    G.Audio.update(P, G.Jobs && G.Jobs.sirenLevel ? G.Jobs.sirenLevel : (G.Police.active ? G.clamp(1 - (G.Police.nearest || 999) / 300, 0, 1) : 0), false);
    if (P.gear !== P._g) { if (P._g !== undefined && P.gear > P._g) G.Audio.shift(); P._g = P.gear; }
    G.UI.hud(P, G.save.hour);
    G.UI.minimap(P, cops, racers, G.Traffic.cars);
    G.Nav.update(dt, P, Gm.time);
    if (G.GTA) G.GTA.update(dt, P);
    if (G.Jobs) G.Jobs.update(dt, P);
    if (G.Net) G.Net.update(dt, P);
    saveT += dt; if (saveT > 8) { saveT = 0; G.persist(); }
  }

  // ---------------- Cameras ----------------
  // third-person over-the-shoulder camera for walking around
  function footCamera(dt) {
    const C = Gm.char, K = G.input.keys, aim = G.GTA && G.GTA.aiming;
    if (K.KeyQ) { footYaw += 2.2 * dt; lastMouse = Gm.time; }
    if (K.KeyE) { footYaw -= 2.2 * dt; lastMouse = Gm.time; }
    // drift back behind the character while it moves and the camera isn't being steered
    const dh = G.wrapAngle(C.heading - footYaw);
    if (!aim && Gm.time - lastMouse > 2 && C.speed > 1.5 && !exitT && Math.abs(dh) < 1.1) footYaw += dh * (1 - Math.exp(-1.2 * dt));
    footPivot.x = G.damp(footPivot.x, C.x, 14, dt); footPivot.z = G.damp(footPivot.z, C.z, 14, dt);
    footPivot.y = G.damp(footPivot.y, C.y + 1.55 - C.crouchK * 0.75, 8, dt);
    const fx = Math.sin(footYaw), fz = Math.cos(footYaw), sx = -fz, sz = fx; // forward / right (screen)
    const dist = aim ? 2.3 : 3.9 + footPitch * 1.2, sh = aim ? 0.8 : 0.55, back = dist * Math.cos(footPitch);
    let x = footPivot.x - fx * back + sx * sh, z = footPivot.z - fz * back + sz * sh;
    // pull in toward the character when a building / tree is in the way
    for (let k = 1; ; k -= 0.1) {
      if (k < 0.15) { x = footPivot.x + sx * 0.15; z = footPivot.z + sz * 0.15; break; }
      const tx = footPivot.x + (x - footPivot.x) * k, tz = footPivot.z + (z - footPivot.z) * k;
      if (!G.W.pointBlocked(tx, tz)) { x = tx; z = tz; break; }
    }
    const y = Math.max(footPivot.y + Math.sin(footPitch) * dist, G.W.groundHeight(x, z) + 0.4);
    camera.position.set(x, y, z);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.4; camera.position.y += (Math.random() - 0.5) * shake * 0.3; shake = Math.max(0, shake - dt * 2.5); }
    lookTmp.set(footPivot.x + fx * 6 + sx * sh * 0.6, footPivot.y - 0.1 - footPitch * 1.2, footPivot.z + fz * 6 + sz * sh * 0.6);
    camera.lookAt(lookTmp);
    fov = G.damp(fov, aim ? 46 : 58 + G.clamp((C.speed - 4.5) * 1.5, 0, 6), aim ? 10 : 4, dt);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camYaw = footYaw; camY = y;
  }
  function airCamera(dt) {
    const A = Gm.flying, far = Gm.camMode ? 1.6 : 1;
    const back = A.camDist * far, up = A.camUp * far;
    camYaw += G.wrapAngle(A.heading - camYaw) * (1 - Math.exp(-3 * dt));
    const pitch = A.type === 'jet' ? A.pitch * 0.6 : 0;
    camTmp.set(A.x - Math.sin(camYaw) * back * Math.cos(pitch), A.y + up - Math.sin(pitch) * back, A.z - Math.cos(camYaw) * back * Math.cos(pitch));
    camTmp.y = Math.max(camTmp.y, G.W.groundHeight(camTmp.x, camTmp.z) + 1.5);
    camera.position.lerp(camTmp, 1 - Math.exp(-8 * dt));
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake * 0.6; shake = Math.max(0, shake - dt * 2.5); }
    lookTmp.set(A.x + Math.sin(A.heading) * 6, A.y + 1.5, A.z + Math.cos(A.heading) * 6);
    camera.lookAt(lookTmp);
    fov = G.damp(fov, 62 + G.clamp(A.speed * 0.12, 0, 14), 3, dt);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  function chaseCamera(dt) {
    if (Gm.flying) { airCamera(dt); return; }
    if (Gm.onFoot && Gm.char) { footCamera(dt); return; }
    const P = Gm.player;
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    const reversing = P.fwdSpeed < -2;
    const targetYaw = reversing ? P.heading : P.heading;
    camYaw += G.wrapAngle(targetYaw - camYaw) * (1 - Math.exp(-(P.grounded ? 5.5 : 2) * dt));
    const sp = P.speed;
    if (Gm.camMode === 2) {
      camera.position.set(P.x + fx * (P.L / 2 - 0.6), P.y + 0.95, P.z + fz * (P.L / 2 - 0.6));
      lookTmp.set(P.x + fx * 30, P.y + 0.7, P.z + fz * 30);
    } else {
      const far = Gm.camMode === 1;
      const dist = (far ? 9.5 : 6.4) + sp * (far ? 0.035 : 0.022) + P.L * 0.25;
      const hgt = (far ? 3.3 : 2.1) + sp * 0.006;
      camY = G.damp(camY, P.y + hgt, 6, dt);
      camTmp.set(P.x - Math.sin(camYaw) * dist, camY, P.z - Math.cos(camYaw) * dist);
      // keep the camera out of buildings
      if (G.W.pointBlocked(camTmp.x, camTmp.z) && camTmp.y < 60) {
        for (let k = 0.9; k > 0.1; k -= 0.1) {
          const x = P.x + (camTmp.x - P.x) * k, z = P.z + (camTmp.z - P.z) * k;
          if (!G.W.pointBlocked(x, z)) { camTmp.x = x; camTmp.z = z; break; }
        }
      }
      camera.position.copy(camTmp);
      lookTmp.set(P.x + fx * 4, P.y + 1.1, P.z + fz * 4);
    }
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.8; camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      shake = Math.max(0, shake - dt * 2.5);
    }
    camera.lookAt(lookTmp);
    const tf = 60 + G.clamp(sp * 0.2, 0, 16) + (P.nitroOn ? 8 : 0);
    fov = G.damp(fov, tf, 4, dt);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  function garageCamera(dt) {
    const P = Gm.player;
    titleA += dt * 0.25;
    camera.position.set(P.x + Math.sin(titleA) * 7.5, P.y + 2.0, P.z + Math.cos(titleA) * 7.5);
    camera.lookAt(P.x, P.y + 0.6, P.z);
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
    if (garageLight) { garageLight.position.set(P.x + 3, P.y + 5, P.z + 3); garageLight.intensity = 1.2 + G.R.night * 1.5; }
  }
  function titleCamera(dt) {
    titleA += dt * 0.035;
    const r = 520;
    camera.position.set(Math.cos(titleA) * r, 140 + Math.sin(titleA * 2) * 30, Math.sin(titleA) * r);
    camera.lookAt(0, 70, 0);
    if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
  }
  window.addEventListener('resize', () => G.FX.resize && G.FX.resize());
  return Gm;
})();
