// ================================================================
//  Events / missions, checkpoint gates, AI racers, collectibles,
//  free-roam stunt scoring (drift, air, near-miss)
// ================================================================
'use strict';

G.Events = (function () {
  const E = { active: null, list: [] };
  const C = G.CFG;
  let scene, markers = [], gateMeshes = [];
  const L = () => G.W.lines;

  // ---------- Beacon visuals ----------
  let beaconTex = null;
  function beaconTexture() {
    if (beaconTex) return beaconTex;
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const x = c.getContext('2d'); const g = x.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.15, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 128);
    beaconTex = new THREE.CanvasTexture(c); return beaconTex;
  }
  function beacon(color, radius, height) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: beaconTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32, 1, true), mat);
    cyl.position.y = height / 2; g.add(cyl);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.6, radius, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
    g.userData.mat = mat;
    return g;
  }
  function label(text, sub, color) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(8,10,20,0.78)'; roundRect(x, 6, 6, 500, 148, 22); x.fill();
    x.strokeStyle = color; x.lineWidth = 5; roundRect(x, 6, 6, 500, 148, 22); x.stroke();
    x.fillStyle = color; x.font = '900 46px "Chakra Petch", Arial Black, sans-serif'; x.textAlign = 'center'; x.fillText(text, 256, 72);
    x.fillStyle = '#fff'; x.font = '700 32px "Chakra Petch", Arial, sans-serif'; x.fillText(sub, 256, 122);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, fog: false, transparent: true }));
    s.scale.set(16, 5, 1);
    return s;
  }
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }

  // ---------- Event definitions ----------
  function nodeXZ(i, j) { return { x: L()[i], z: L()[j] }; }
  function defs() {
    const ring = G.W.ring, n = ring.length;
    const ringIdx = (f) => Math.floor(f * n) % n;
    const ringGates = []; for (let k = 1; k <= 10; k++) { const p = ring[ringIdx(k / 10)]; ringGates.push({ x: p.x, z: p.y }); }
    const ringPath = []; for (let k = 0; k < n; k += 5) ringPath.push({ x: ring[k].x, z: ring[k].y });
    const rs = ring[0], rs2 = ring[1];
    const PAD = G.W.PAD, RUN = G.W.RUNWAY, BZ = G.W.BEACH_Z;
    const pcx = (PAD.x0 + PAD.x1) / 2, pcz = (PAD.z0 + PAD.z1) / 2;
    const cityRoute = [[3, 1], [3, 2], [3, 6], [7, 6], [7, 9], [10, 9], [10, 4], [6, 4], [6, 1]].map(([i, j]) => nodeXZ(i, j));
    const city2 = [[9, 11], [9, 10], [5, 10], [5, 7], [1, 7], [1, 3], [4, 3], [4, 0]].map(([i, j]) => nodeXZ(i, j));
    return [
      { id: 'sprint1', type: 'race', name: 'ĐUA PHỐ: TRUNG TÂM', short: 'Đua đường phố', color: 0xff2d95, icon: '🏁',
        desc: 'Đua nước rút xuyên trung tâm thành phố với 3 tay đua. Cẩn thận xe cộ và đèn đỏ!',
        start: cityRoute[0], dir: cityRoute[1], gates: cityRoute.slice(1), path: cityRoute.slice(1), laps: 1, ai: 3, reward: [5000, 2500, 1200, 400] },
      { id: 'sprint2', type: 'race', name: 'ĐUA PHỐ: KHU TÂY', short: 'Đua đường phố', color: 0xff2d95, icon: '🏁',
        desc: 'Lộ trình nhiều khúc cua gắt qua khu dân cư phía tây.',
        start: city2[0], dir: city2[1], gates: city2.slice(1), path: city2.slice(1), laps: 1, ai: 3, reward: [5500, 2800, 1300, 400] },
      { id: 'ring', type: 'race', name: 'VÒNG CAO TỐC', short: 'Đua vòng 2 lap', color: 0x00e5ff, icon: '🏎️',
        desc: '2 vòng đường cao tốc vành đai với 5 đối thủ. Đặt nitro đúng lúc!',
        start: { x: rs.x, z: rs.y }, dir: { x: rs2.x, z: rs2.y }, gates: ringGates, path: ringPath, laps: 2, ai: 5, reward: [9000, 5000, 2500, 800] },
      { id: 'topspeed', type: 'speed', name: 'BẪY TỐC ĐỘ: ĐƯỜNG BĂNG', short: 'Thử thách tốc độ', color: 0xffd400, icon: '⚡',
        desc: 'Đạt tốc độ cao nhất khi qua bẫy tốc độ cuối đường băng. Thưởng theo km/h.',
        start: { x: 8, z: RUN.z1 - 25 }, dir: { x: 8, z: RUN.z1 - 60 }, trap: { x: 0, z: RUN.z0 + 160 }, time: 45 },
      { id: 'drift', type: 'drift', name: 'DRIFT ZONE', short: 'Drift 60 giây', color: 0xb04dff, icon: '💨',
        desc: 'Kiếm càng nhiều điểm drift càng tốt trong 60 giây tại bãi stunt. Space = phanh tay.',
        start: { x: PAD.x0 + 30, z: pcz }, dir: { x: PAD.x0 + 60, z: pcz }, time: 60, area: PAD },
      { id: 'coast', type: 'timeattack', name: 'TIME ATTACK: BỜ BIỂN', short: 'Chạy giờ', color: 0x28c76f, icon: '⏱️',
        desc: 'Vượt qua các cổng dọc bờ biển và vành đai trước khi hết giờ.',
        start: { x: -1520, z: BZ - 4 }, dir: { x: -1400, z: BZ - 4 }, gates: [{ x: -900, z: BZ }, { x: -360, z: BZ }, { x: -360, z: C.RING }, { x: 0, z: C.RING }, { x: 360, z: C.RING }, { x: 360, z: BZ }, { x: 900, z: BZ }, { x: 1520, z: BZ }], laps: 1, ai: 0, time: 75, reward: [6000] },
      { id: 'jump', type: 'jump', name: 'BAY XA: MEGA RAMP', short: 'Nhảy xa', color: 0xff6a00, icon: '🚀',
        desc: 'Lao lên mega ramp với tốc độ tối đa. Thưởng theo khoảng cách bay.',
        start: { x: pcx + 60 - 250, z: pcz - 10 }, dir: { x: pcx + 60, z: pcz - 10 }, time: 30 },
      { id: 'wanted', type: 'pursuit', name: 'TRUY NÃ CẤP 3', short: 'Cắt đuôi cảnh sát', color: 0x3d7bff, icon: '🚨',
        desc: 'Cảnh sát truy đuổi gắt gao. Cắt đuôi để nhận thưởng lớn — bị bắt là mất tiền!',
        start: nodeXZ(8, 2), dir: nodeXZ(8, 3), level: 3, reward: [10000] },
    ];
  }

  // ---------- Init ----------
  E.init = function (sc) {
    scene = sc;
    E.list = defs();
    for (const d of E.list) {
      const b = beacon(G.col(d.color), 7, 60);
      const mx = d.start.x, mz = d.start.z;
      b.position.set(mx, 0, mz); scene.add(b);
      const lb = label(d.icon + ' ' + d.short.toUpperCase(), d.name, '#' + new THREE.Color(d.color).getHexString());
      lb.position.set(mx, 9, mz); scene.add(lb);
      markers.push({ def: d, beacon: b, label: lb, x: mx, z: mz });
    }
    initCoins();
  };

  // ---------- Coins ----------
  E.coins = [];
  let coinMesh;
  function initCoins() {
    const R = G.rng; R.seed(4242);
    const pts = [];
    let tries = 0;
    while (pts.length < 100 && tries++ < 20000) {
      const x = R.range(-1900, 1900), z = R.range(-2500, 1100);
      if (!G.W.onRoad(x, z) && R() < 0.85) continue;
      if (G.W.pointBlocked(x, z)) continue;
      if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 60)) continue;
      pts.push({ x, z, y: 1.4 });
    }
    // air coins above ramps (must jump!)
    for (const r of G.W.ramps) pts.push({ x: r.x + r.s * (r.len + 12), z: r.z + r.c * (r.len + 12), y: r.h + 3 });
    const geo = new THREE.CylinderGeometry(1.0, 1.0, 0.18, 24); geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: G.col(0xffc93c), metalness: 1, roughness: 0.25, emissive: G.col(0x6a4200), emissiveIntensity: 1 });
    coinMesh = new THREE.InstancedMesh(geo, mat, pts.length);
    coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(coinMesh);
    const got = new Set(G.save.coins);
    E.coins = pts.map((p, i) => ({ ...p, got: got.has(i) }));
    E.coinTotal = pts.length;
  }
  const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cv = new THREE.Vector3(), cs = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function updateCoins(t, player) {
    const rot = cq.setFromAxisAngle(up, t * 2.5);
    E.coins.forEach((c, i) => {
      if (!c.got && Math.abs(c.x - player.x) < 4 && Math.abs(c.z - player.z) < 4 && Math.abs(c.y - (player.y + 1)) < 3.5) {
        c.got = true; G.save.coins.push(i); G.save.cash += 250; G.persist();
        G.Audio.coin(); G.UI.popup('+$250 ⭐ ĐỒNG XU ' + G.save.coins.length + '/' + E.coinTotal, '#ffd400');
      }
      cm.compose(cv.set(c.x, c.y + Math.sin(t * 2 + i) * 0.25, c.z), rot, c.got ? cs.set(0, 0, 0) : cs.set(1, 1, 1));
      coinMesh.setMatrixAt(i, cm);
    });
    coinMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Starting / ending events ----------
  E.nearMarker = null;
  function placeGrid(def, idx) {
    const dx = def.dir.x - def.start.x, dz = def.dir.z - def.start.z, l = Math.hypot(dx, dz), fx = dx / l, fz = dz / l, rx = -fz, rz = fx;
    const row = Math.floor(idx / 2), col = idx % 2;
    const lat = (col ? -1 : 1) * 3.2 + (def.type === 'race' && def.id === 'ring' ? 4 : 0);
    const back = 6 + row * 8;
    return { x: def.start.x + rx * lat - fx * back + fx * 10, z: def.start.z + rz * lat - fz * back + fz * 10, heading: Math.atan2(fx, fz) };
  }
  E.start = function (def, player) {
    if (G.Jobs && G.Jobs.mode) { G.UI.toast('Kết thúc ca ' + G.Jobs.label() + ' (J) để tham gia sự kiện'); return false; }
    if (G.Net && G.Net.connected) { G.UI.toast('Sự kiện chỉ chơi được khi không ở phòng online'); return false; }
    if (G.Police.active && def.type !== 'pursuit') { G.UI.toast('🚨 Cắt đuôi cảnh sát trước khi tham gia sự kiện!'); return false; }
    G.Police.cooldown = def.type === 'pursuit' ? 0 : 9999;
    const st = { def, t: 0, countdown: def.type === 'pursuit' ? 0 : 3.5, gate: 0, lap: 0, racers: [], score: 0, done: false, best: 0 };
    // player grid slot
    const p0 = placeGrid(def, def.ai ? def.ai : 0);
    player.setPose(p0.x, p0.z, p0.heading);
    player.nitro = player.perf.nitroCap;
    // AI racers: random cars around the player's class
    if (def.ai) {
      const myIdx = G.CARS.findIndex((c) => c.id === player.spec.id);
      for (let k = 0; k < def.ai; k++) {
        const ci = G.clamp(myIdx + (k % 3) - 1, 0, G.CARS.length - 1);
        const spec = G.CARS[ci];
        const v = new G.Vehicle(spec, spec.colors[(k + 2) % spec.colors.length], { upgrades: G.upg(player.spec.id) });
        const pz = placeGrid(def, k);
        v.setPose(pz.x, pz.z, pz.heading);
        v.isRacer = true; v.name = ['VIPER', 'GHOST', 'NOVA', 'RAZOR', 'BLAZE'][k]; v.gate = 0; v.lap = 0; v.wp = 0; v.lat = (k % 2 ? 1 : -1) * (1 + k * 0.6); v.skill = 0.94 + Math.random() * 0.08;
        scene.add(v.mesh); st.racers.push(v);
      }
    }
    if (def.type === 'pursuit') G.Police.startLevel(def.level);
    if (def.type === 'drift') { st.score = 0; st.combo = 0; }
    if (def.type === 'jump') { st.jumpStart = null; st.jumpDist = 0; }
    E.active = st;
    buildGates(st);
    markers.forEach((m) => { m.beacon.visible = false; m.label.visible = false; });
    G.UI.eventStart(def);
    return true;
  };
  // silent = no results screen (used when leaving to the title / logging out)
  E.abort = function (silent) { if (!E.active) return; finish(false, 'Đã huỷ sự kiện', null, 0, silent === true); };
  function cleanup() {
    const st = E.active; if (!st) return;
    st.racers.forEach((r) => scene.remove(r.mesh));
    gateMeshes.forEach((g) => scene.remove(g)); gateMeshes = [];
    if (st.def.type === 'pursuit' && G.Police.active) G.Police.end();
    G.Police.cooldown = 3;
    markers.forEach((m) => { m.beacon.visible = true; m.label.visible = true; });
    E.active = null;
  }
  E.lastDef = null;  // last event played (results screen "race again")
  function finish(success, title, lines, reward, silent) {
    const st = E.active;
    E.lastDef = st.def;
    if (reward) { G.save.cash += reward; G.Audio.cash(); }
    if (success && st.def.type === 'race') G.save.stats.wins++;
    G.save.stats.races++;
    G.persist();
    if (!silent) G.UI.results({ success, title: title || (success ? 'HOÀN THÀNH!' : 'THẤT BẠI'), lines: lines || [], reward: reward || 0, name: st.def.name });
    cleanup();
  }

  function buildGates(st) {
    gateMeshes.forEach((g) => scene.remove(g)); gateMeshes = [];
    const d = st.def;
    if (!d.gates) return;
    const main = beacon(G.col(0x00e5ff), 9, 45), next = beacon(G.col(0x00e5ff), 6, 25);
    next.userData.mat.opacity = 0.4;
    scene.add(main, next); gateMeshes.push(main, next);
    st.gMain = main; st.gNext = next;
    positionGates(st);
  }
  function positionGates(st) {
    const d = st.def; if (!d.gates) return;
    const g = d.gates, n = g.length;
    const isLast = st.gate === n - 1 && st.lap === (d.laps || 1) - 1;
    const cur = g[st.gate];
    st.gMain.position.set(cur.x, 0, cur.z);
    st.gMain.userData.mat.color.copy(G.col(isLast ? 0xffd400 : 0x00e5ff));
    const ni = st.gate + 1 < n ? st.gate + 1 : ((d.laps || 1) > 1 && st.lap < d.laps - 1 ? 0 : -1);
    st.gNext.visible = ni >= 0;
    if (ni >= 0) st.gNext.position.set(g[ni].x, 0, g[ni].z);
  }
  // progress value used for race positions
  function progress(gate, lap, x, z, def) {
    const g = def.gates[Math.min(gate, def.gates.length - 1)];
    return lap * 1000 + gate * 10 - Math.min(9.9, Math.hypot(g.x - x, g.z - z) / 100);
  }

  E.update = function (dt, player, time) {
    updateCoins(time, player);
    const st = E.active;
    // markers & prompt when idle
    if (!st) {
      E.nearMarker = null;
      for (const m of markers) {
        m.beacon.rotation.y += dt * 0.4;
        const d = Math.hypot(m.x - player.x, m.z - player.z);
        m.label.visible = d < 600;
        if (d < 14) E.nearMarker = m.def;
      }
      return;
    }
    const d = st.def;
    if (st.gMain) { st.gMain.rotation.y += dt; const s = 1 + Math.sin(time * 4) * 0.04; st.gMain.scale.set(s, 1, s); }
    // countdown: freeze everyone
    if (st.countdown > 0) {
      const before = Math.ceil(st.countdown);
      st.countdown -= dt;
      const after = Math.ceil(st.countdown);
      if (after !== before) { G.Audio.beep(after <= 0); G.UI.countdown(after > 0 ? after : 'GO!'); }
      E.freeze = true;
      [player, ...st.racers].forEach((v) => { v.vx = v.vz = 0; v.input.throttle = 0; });
      return;
    }
    E.freeze = false;
    st.t += dt;

    // AI racers
    for (const r of st.racers) {
      if (r.finished) { r.input.throttle = 0; r.input.brake = 1; r.update(dt); r.syncMesh(dt); continue; }
      const path = d.path, wpt = path[r.wp % path.length];
      const nx = path[(r.wp + 1) % path.length];
      const rx = (nx.z - wpt.z), rz = -(nx.x - wpt.x), rl = Math.hypot(rx, rz) || 1;
      const target = { x: wpt.x + rx / rl * r.lat, z: wpt.z + rz / rl * r.lat };
      // rubber band against the player
      const myP = progress(st.gate, st.lap, player.x, player.z, d), rP = progress(r.gate, r.lap, r.x, r.z, d);
      const k = rP > myP + 3 ? 0.88 : (rP < myP - 3 ? 1.08 : 1);
      const dist = G.aiDrive(r, target, nx, { speedK: r.skill * k, nitro: true, dt });
      const reach = d.id === 'ring' ? 22 : 14;
      if (dist < reach) r.wp++;
      // gates for AI
      const g = d.gates[r.gate];
      if (Math.hypot(g.x - r.x, g.z - r.z) < 16) {
        r.gate++;
        if (r.gate >= d.gates.length) { r.gate = 0; r.lap++; if (r.lap >= (d.laps || 1)) { r.finished = true; r.time = st.t; r.gate = d.gates.length - 1; r.lap = d.laps - 1; r.done = 1; } }
      }
      r.update(dt); r.syncMesh(dt);
    }

    // player gates
    if (d.gates) {
      const g = d.gates[st.gate];
      if (Math.hypot(g.x - player.x, g.z - player.z) < 16) {
        st.gate++;
        G.Audio.checkpoint();
        if (st.gate >= d.gates.length) {
          st.lap++; st.gate = 0;
          if (st.lap >= (d.laps || 1)) return raceFinished(st, player);
          G.UI.toast('VÒNG ' + (st.lap + 1) + '/' + d.laps);
        }
        positionGates(st);
      }
    }
    // per-type logic
    if (d.type === 'race') {
      const all = [{ me: true, p: progress(st.gate, st.lap, player.x, player.z, d) }, ...st.racers.map((r) => ({ p: r.finished ? 99999 - r.time : progress(r.gate, r.lap, r.x, r.z, d) }))];
      all.sort((a, b) => b.p - a.p);
      st.pos = all.findIndex((a) => a.me) + 1;
      G.UI.mission(d.name, 'HẠNG ' + st.pos + '/' + (st.racers.length + 1) + (d.laps > 1 ? '  •  VÒNG ' + Math.min(st.lap + 1, d.laps) + '/' + d.laps : '') + '  •  CỔNG ' + (st.gate + 1) + '/' + d.gates.length, G.fmtTime(st.t));
    } else if (d.type === 'timeattack') {
      const left = d.time - st.t;
      G.UI.mission(d.name, 'CỔNG ' + (st.gate + 1) + '/' + d.gates.length, G.fmtTime(Math.max(0, left)), left < 10);
      if (left <= 0) { G.Audio.fail(); return finish(false, 'HẾT GIỜ!', ['Không kịp qua tất cả các cổng.']); }
    } else if (d.type === 'speed') {
      const left = d.time - st.t;
      st.best = Math.max(st.best, player.speed);
      G.UI.mission(d.name, 'Lao qua bẫy tốc độ ở cuối đường băng!', G.fmtTime(Math.max(0, left)), left < 10);
      if (player.z < d.trap.z) {
        const kmh = Math.round(player.speed * 3.6), reward = kmh * 18;
        const best = G.save.best[d.id] || 0;
        if (kmh > best) G.save.best[d.id] = kmh;
        return finish(true, kmh + ' KM/H', ['Tốc độ qua bẫy: ' + kmh + ' km/h', 'Kỷ lục: ' + Math.max(best, kmh) + ' km/h'], reward);
      }
      if (left <= 0) { G.Audio.fail(); return finish(false, 'HẾT GIỜ!', []); }
    } else if (d.type === 'drift') {
      const left = d.time - st.t;
      const inArea = player.x > d.area.x0 && player.x < d.area.x1 && player.z > d.area.z0 && player.z < d.area.z1;
      if (inArea && player.grounded && player.slip > 3.5 && player.speed > 10) st.score += player.slip * player.speed * dt * 0.8;
      G.UI.mission(d.name, 'ĐIỂM DRIFT: ' + Math.round(st.score).toLocaleString('en-US') + (inArea ? '' : '  (ra ngoài khu vực!)'), G.fmtTime(Math.max(0, left)), left < 10);
      if (left <= 0) {
        const sc = Math.round(st.score), reward = Math.round(sc / 8);
        const best = G.save.best[d.id] || 0; if (sc > best) G.save.best[d.id] = sc;
        return finish(sc > 2000, sc.toLocaleString('en-US') + ' ĐIỂM', ['Kỷ lục: ' + Math.max(best, sc).toLocaleString('en-US')], reward);
      }
    } else if (d.type === 'jump') {
      const left = d.time - st.t;
      if (!player.grounded && !st.jumpStart) st.jumpStart = { x: player.x, z: player.z };
      if (st.jumpStart && player.grounded) {
        const dist = Math.round(Math.hypot(player.x - st.jumpStart.x, player.z - st.jumpStart.z));
        const best = G.save.best[d.id] || 0; if (dist > best) G.save.best[d.id] = dist;
        return finish(dist > 20, dist + ' MÉT', ['Kỷ lục: ' + Math.max(best, dist) + ' m'], dist * 45);
      }
      G.UI.mission(d.name, 'Tăng tốc tối đa, lao lên MEGA RAMP!', G.fmtTime(Math.max(0, left)), left < 10);
      if (left <= 0) return finish(false, 'HẾT GIỜ!', []);
    } else if (d.type === 'pursuit') {
      G.UI.mission(d.name, G.Police.active ? 'Cắt đuôi tất cả xe cảnh sát!' : '', G.fmtTime(st.t));
    }
  };
  function raceFinished(st, player) {
    const d = st.def;
    if (d.type === 'timeattack') {
      const t = st.t, best = G.save.best[d.id];
      if (!best || t < best) G.save.best[d.id] = t;
      return finish(true, G.fmtTime(t), ['Kỷ lục: ' + G.fmtTime(Math.min(best || 1e9, t))], d.reward[0] + (best && t < best ? 2000 : 0));
    }
    const finishedAhead = st.racers.filter((r) => r.finished).length;
    const pos = finishedAhead + 1;
    const reward = d.reward[Math.min(pos - 1, d.reward.length - 1)];
    const best = G.save.best[d.id];
    if (!best || st.t < best) G.save.best[d.id] = st.t;
    void player;
    return finish(pos === 1, pos === 1 ? '🏆 CHIẾN THẮNG!' : 'VỀ ĐÍCH HẠNG ' + pos, ['Thời gian: ' + G.fmtTime(st.t), 'Kỷ lục: ' + G.fmtTime(Math.min(best || 1e9, st.t))], reward);
  }
  // pursuit event outcome hooks
  E.onPursuitEnd = function (res) {
    const st = E.active; if (!st || st.def.type !== 'pursuit') return false;
    if (res.escaped) finish(true, 'ĐÃ CẮT ĐUÔI!', ['Thời gian truy đuổi: ' + G.fmtTime(st.t)], st.def.reward[0]);
    else finish(false, 'BỊ BẮT!', ['Bạn đã bị cảnh sát tóm.']);
    return true;
  };
  E.racers = () => (E.active ? E.active.racers : []);
  E.gateTarget = () => { const st = E.active; if (!st || !st.def.gates) return st && st.def.trap ? st.def.trap : null; return st.def.gates[st.gate]; };
  E.markers = () => markers;
  return E;
})();

// ---------- Free-roam stunt scoring ----------
G.Stunts = (function () {
  const S = { combo: 0, comboT: 0, mult: 1 };
  S.update = function (dt, car, traffic) {
    if (!car) return;
    const drifting = car.grounded && car.slip > 4 && car.speed > 12 && car.surface === 'road';
    if (drifting) {
      S.combo += car.slip * car.speed * dt * 0.6; S.comboT = 1.4;
      car.nitro = Math.min(car.perf.nitroCap, car.nitro + dt * 0.06); // drifting refills nitro
    } else if (S.comboT > 0) {
      S.comboT -= dt;
      if (S.comboT <= 0 && S.combo > 150) {
        const pts = Math.round(S.combo), cash = Math.round(pts / 14);
        G.save.cash += cash; G.save.stats.bestDrift = Math.max(G.save.stats.bestDrift, pts);
        G.UI.popup('DRIFT ' + pts.toLocaleString('en-US') + ' → +$' + cash, '#b04dff');
        S.combo = 0;
      } else if (S.comboT <= 0) S.combo = 0;
    }
    if (car.landed) {
      const t = car.landed; car.landed = 0;
      if (t > 0.7) {
        const cash = Math.round(t * 120);
        G.save.cash += cash; G.UI.popup('BAY ' + t.toFixed(1) + 's → +$' + cash, '#ff6a00');
        car.nitro = Math.min(car.perf.nitroCap, car.nitro + 0.15);
      }
    }
    // near misses with traffic
    if (car.speed > 26) for (const t of traffic) {
      if (t.wrecked) continue;
      const dx = t.x - car.x, dz = t.z - car.z, d = Math.hypot(dx, dz);
      if (d < 4.8 && d > 2.6 && !t.nearMissed) {
        t.nearMissed = 3; G.save.cash += 60; car.nitro = Math.min(car.perf.nitroCap, car.nitro + 0.08);
        G.UI.popup('SUÝT VA! +$60', '#00e5ff');
      }
      if (t.nearMissed) t.nearMissed = Math.max(0, t.nearMissed - dt);
    }
    G.save.stats.topSpeed = Math.max(G.save.stats.topSpeed, car.speed * 3.6);
    G.save.stats.distance += car.speed * dt;
  };
  return S;
})();
