// ================================================================
//  Main: boot sequence, game loop, camera, glue between systems
// ================================================================
'use strict';

G.Game = (function () {
  const Gm = { state: 'loading', paused: false, simPaused: false, garage: false, camMode: 0, time: 0, player: null };
  let scene, camera, clock, headlight, garageLight;
  let camYaw = 0, camY = 3, fov = 62, shake = 0, flash = 0, saveT = 0, fpsAcc = 0, fpsN = 0, fpsWarned = false, titleA = 0;
  const camTmp = new THREE.Vector3(), lookTmp = new THREE.Vector3();

  // ---------------- Boot ----------------
  const steps = [
    ['Khởi tạo đồ hoạ...', () => { G.R.init(document.getElementById('game')); scene = G.R.scene; camera = G.R.camera; clock = new THREE.Clock(); }],
    ['Dựng thành phố, đường cao tốc, bãi biển...', () => { G.W.build(scene); }],
    ['Chuẩn bị hiệu ứng...', () => { G.FX.init(scene); G.Police.init(scene); }],
    ['Lắp ráp siêu xe...', () => { makePlayer(G.save.selected); spawnPlayer(); }],
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
    if (i >= steps.length) { Gm.toTitle(); requestAnimationFrame(frame); return; }
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
    scene.add(v.mesh);
    // headlights (one spot light that lights the road ahead)
    headlight = new THREE.SpotLight(0xfff1dc, 0, 140, 0.55, 0.55, 1.2);
    headlight.position.set(0, 0.8, spec.body.L / 2);
    headlight.target.position.set(0, 0, 40);
    v.mesh.add(headlight); v.mesh.add(headlight.target);
    v.onHit = (other, imp) => { if (other.isCop && imp > 4 && !G.Events.active) G.Police.addHeat(0.35); };
    Gm.player = v;
    v.syncMesh(0);
    return v;
  }
  function spawnPlayer() {
    const p = G.W.nearestRoadPose(0, 60, 0);
    Gm.player.setPose(p.x, p.z, p.heading);
    camYaw = p.heading;
  }
  Gm.previewCar = function (id) { makePlayer(id); };

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
    if (G.Police.active) { G.UI.toast('🚨 Cắt đuôi cảnh sát trước!'); return; }
    if (Gm.player.speed > 6) { G.UI.toast('Dừng xe lại để vào gara'); return; }
    Gm.garage = true; G.UI.openGarage();
    if (!garageLight) { garageLight = new THREE.PointLight(0xffffff, 0, 25, 1.5); scene.add(garageLight); }
  };
  Gm.closeGarage = function () {
    Gm.garage = false; G.UI.closeGarage();
    if (Gm.player.spec.id !== G.save.selected) makePlayer(G.save.selected);
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
    handleKeys();

    const P = Gm.player;
    const sim = Gm.state === 'play' && !Gm.paused && !Gm.simPaused && !Gm.garage && !G.UI.mapOpen;
    if (sim) simulate(dt);
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
    if (I.consume('KeyC')) { Gm.camMode = (Gm.camMode + 1) % 3; G.UI.toast(['Camera: Gần', 'Camera: Xa', 'Camera: Cản trước'][Gm.camMode], 1200); }
    if (I.consume('KeyR')) resetPlayer();
    if (I.consume('KeyH')) G.Audio.horn();
    if (I.consume('KeyT')) { G.save.hour = (G.save.hour + 1) % 24; G.UI.toast('🕒 +1 giờ', 900); }
    if (I.consume('KeyE')) {
      const m = G.Events.nearMarker;
      if (m && !G.Events.active) { if (Gm.player.speed > 15) G.UI.toast('Giảm tốc để bắt đầu sự kiện'); else G.Events.start(m, Gm.player); }
    }
  }
  function resetPlayer() {
    const P = Gm.player, p = G.W.nearestRoadPose(P.x, P.z, P.heading);
    P.setPose(p.x, p.z, p.heading); camYaw = p.heading;
  }

  function simulate(dt) {
    const P = Gm.player, inp = G.input.state;
    Object.assign(P.input, { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, handbrake: inp.handbrake, nitro: inp.nitro });
    if (G.Events.freeze) { P.input.throttle = 0; P.input.nitro = false; }
    P.update(dt);
    if (P.surface === 'water') {
      G.FX.splash(P.x, P.z); G.Audio.splash(); G.UI.toast('💦 Xe rơi xuống biển! Đặt lại vị trí...');
      resetPlayer(); flash = 0.3;
    }
    const cops = G.Police.cops, racers = G.Events.racers();
    G.Traffic.update(dt, Gm.time, P, [P, ...cops, ...racers]);
    G.Events.update(dt, P, Gm.time);
    if (G.Events.freeze) { P.vx = P.vz = 0; }
    const pr = G.Police.update(dt, P);
    if (pr) {
      if (!G.Events.onPursuitEnd(pr)) {
        if (pr.escaped) { const r = pr.level * 900; G.save.cash += r; G.save.stats.escapes++; G.Audio.cash(); G.UI.popup('ĐÃ CẮT ĐUÔI! +$' + r, '#28ff8a'); }
        else { const fine = Math.min(5000, Math.round(G.save.cash * 0.1)); G.save.cash -= fine; flash = 0.8; G.Audio.fail(); G.UI.toast('🚔 BỊ BẮT! Nộp phạt ' + G.fmtMoney(fine), 3500); resetPlayer(); }
        G.persist();
      }
    }
    // patrol cars notice speeding
    if (!G.Police.active && G.Police.cooldown <= 0 && !G.Events.active && P.speed > 36) {
      for (const t of G.Traffic.cars) if (t.police && Math.hypot(t.x - P.x, t.z - P.z) < 55) { G.Police.addHeat(1); G.UI.toast('🚨 Cảnh sát phát hiện bạn chạy quá tốc độ!'); break; }
    }
    // dynamic collisions
    const bodies = [P, ...cops, ...racers];
    for (const t of G.Traffic.cars) if (Math.abs(t.x - P.x) < 80 && Math.abs(t.z - P.z) < 80) bodies.push(t);
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
    G.Audio.update(P, G.Police.active ? G.clamp(1 - (G.Police.nearest || 999) / 300, 0, 1) : 0, false);
    if (P.gear !== P._g) { if (P._g !== undefined && P.gear > P._g) G.Audio.shift(); P._g = P.gear; }
    G.UI.hud(P, G.save.hour);
    G.UI.minimap(P, cops, racers, G.Traffic.cars);
    saveT += dt; if (saveT > 8) { saveT = 0; G.persist(); }
  }

  // ---------------- Cameras ----------------
  function chaseCamera(dt) {
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
