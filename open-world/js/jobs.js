// ================================================================
//  Jobs / game modes (G.Jobs):
//   • Taxi: pick up waiting passengers, drive them to their address
//     with the GPS, earn the fare + a tip (speed and care count).
//   • Police patrol: drive an interceptor, dispatch sends you after
//     traffic offenders who flee through the city — box them in or
//     ram them until they stop, then hold position to arrest.
//  Plus the "CHẾ ĐỘ CHƠI" menu (free roam / taxi / police / online).
// ================================================================
'use strict';

G.Jobs = (function () {
  const J = { mode: null, sirenLevel: 0 };
  let st = null, modal = null;
  const scene = () => G.Game.scene();
  const P = () => G.Game.player;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  J.label = () => ({ taxi: 'TAXI', police: 'CẢNH SÁT' }[J.mode] || '');
  J.bodies = () => (st && st.suspect ? [st.suspect] : []);

  // tall translucent light column marking a pickup / drop-off point
  function beacon(color) {
    const g = new THREE.CylinderGeometry(1.6, 1.6, 60, 20, 1, true); g.translate(0, 30, 0);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 3; scene().add(mesh);
    return mesh;
  }
  function dropBeacon() { if (st && st.beacon) { scene().remove(st.beacon); st.beacon = null; } }
  function mission(title, sub, timer, warn) { G.UI.mission(title, sub, timer, warn); }

  // ---------------- Start / end ----------------
  J.start = function (mode) {
    const Gm = G.Game;
    if (Gm.state !== 'play') return 'Hãy vào thành phố trước';
    if (G.Events.active) return 'Đang trong sự kiện — huỷ sự kiện trước';
    if (G.Net && G.Net.connected) return 'Đang ở phòng nhiều người chơi — rời phòng trước';
    if (Gm.onFoot) return 'Lên xe (F) trước khi nhận ca';
    if (J.mode) J.end(true);
    if (G.Police.active) G.Police.end();
    const spec = mode === 'taxi' ? G.TAXI_SPEC : G.POLICE_SPEC;
    const v = new G.Vehicle(spec, mode === 'taxi' ? 0xf7c600 : 0x14161c, { upgrades: { engine: 2, handling: 2, nitro: 2 } });
    v.job = mode;
    Gm.useVehicle(v);
    J.mode = mode;
    st = { earned: 0, done: 0, t: 0, wait: 2 };
    if (mode === 'police') { G.Police.cooldown = 1e9; G.UI.toast('🚓 Bắt đầu ca tuần tra! Chờ tổng đài điều phối...', 3000); }
    else G.UI.toast('🚕 Bắt đầu ca chạy taxi! Đang tìm khách...', 3000);
    return '';
  };
  J.end = function (silent) {
    if (!J.mode) return;
    const was = J.mode, s = st;
    if (s) {
      dropBeacon();
      if (s.npc) { s.npc.dispose(); s.npc = null; }
      if (s.suspect) { scene().remove(s.suspect.mesh); if (s.marker) scene().remove(s.marker); }
    }
    J.mode = null; st = null; J.sirenLevel = 0;
    if (G.Nav.active && G.Nav.active.keep) G.Nav.clear();
    G.Police.cooldown = 3;
    if (G.Game.player && G.Game.player.job) G.Game.previewCar(G.save.selected);
    G.UI.hideMission();
    G.persist();
    if (!silent && s) G.UI.toast((was === 'taxi' ? '🚕 Kết thúc ca taxi: ' + s.done + ' chuyến' : '🚓 Kết thúc ca tuần tra: bắt ' + s.done + ' đối tượng') + ' • thu nhập ' + G.fmtMoney(s.earned), 4000);
  };

  // ---------------- Taxi ----------------
  const ASK = ['Cho tôi tới {d}, nhanh giùm nhé!', 'Anh tài ơi, tới {d} nha!', 'Tôi trễ hẹn rồi, chạy tới {d} giúp tôi!', 'Đi {d}, chạy cẩn thận nha!', 'Tới {d} bao nhiêu tiền vậy anh?'];
  const OUCH = ['Ối! Lái cẩn thận chứ!', 'Trời ơi, đâm xe rồi!', 'Anh muốn tôi đau tim hả?!', 'Từ từ thôi anh ơi!'];
  function nextPassenger() {
    const p = P(), spot = G.Nav.streetSpot(p.x, p.z, 160, 480);
    if (!spot) { st.wait = 1; return; }
    const npc = new G.Character({ npc: true });
    npc.setPose(spot.sx, spot.sz, spot.face); scene().add(npc.mesh);
    st.npc = npc; st.spot = spot; st.phase = 'pickup'; st.t = 0;
    st.beacon = beacon(0xffd400); st.beacon.position.set(spot.sx, 0, spot.sz);
    G.Nav.set({ x: spot.x, z: spot.z }, { name: 'Khách đang chờ', keep: true, silent: true, arriveR: 0 });
    G.UI.toast('🙋 Có khách gọi xe ở ' + spot.name + ' — đi theo GPS để đón!', 3200);
  }
  function chooseDest() {
    const p = P();
    if (Math.random() < 0.4) {
      const places = G.Nav.places().filter((q) => !q.event && Math.hypot(q.x - p.x, q.z - p.z) > 450);
      if (places.length) { const q = pick(places), s = G.Nav.snap(q.x, q.z); return { x: s.x, z: s.z, name: q.name }; }
    }
    const s = G.Nav.streetSpot(p.x, p.z, 500, 1600) || G.Nav.streetSpot(p.x, p.z, 200, 3000);
    return { x: s.x, z: s.z, name: s.name };
  }
  function updateTaxi(dt) {
    const p = P(), npc = st.npc;
    if (st.phase === 'wait') { st.wait -= dt; if (st.wait <= 0) nextPassenger(); mission('🚕 TAXI', 'Đang chờ tổng đài gọi khách...', ''); return; }
    if (st.phase === 'pickup') {
      npc.control(0, 0); npc.update(dt);
      // waving: raise the near arm while the cab approaches
      const d = Math.hypot(npc.x - p.x, npc.z - p.z);
      if (npc.J && npc.J.shR) npc.J.shR.rotation.x = d < 60 ? -2.6 + Math.sin(st.t * 8) * 0.3 : 0;
      st.t += dt;
      mission('🚕 ĐÓN KHÁCH', st.spot.name + ' • ' + G.Nav.fmtDist(d), d < 25 ? 'DỪNG XE LẠI' : '');
      if (d < 14 && p.speed < 2.8) { st.phase = 'board'; st.t = 0; dropBeacon(); G.Nav.clear(); }
      return;
    }
    if (st.phase === 'board') {
      st.t += dt;
      const fx = Math.sin(p.heading), fz = Math.cos(p.heading), door = { x: p.x + fz * 1.5, z: p.z - fx * 1.5 };
      const dx = door.x - npc.x, dz = door.z - npc.z, d = Math.hypot(dx, dz);
      npc.control(d > 0.5 ? dx / d : 0, d > 0.5 ? dz / d : 0, false, false, false); npc.update(dt);
      if (npc.J && npc.J.shR) npc.J.shR.rotation.x = 0;
      mission('🚕 KHÁCH ĐANG LÊN XE', 'Giữ xe đứng yên...', '');
      if (p.speed > 4) { G.UI.toast('Khách: Ơ kìa, chờ tôi với!'); st.phase = 'pickup'; st.beacon = beacon(0xffd400); st.beacon.position.set(npc.x, 0, npc.z); G.Nav.set({ x: npc.x, z: npc.z }, { name: 'Khách đang chờ', keep: true, silent: true, arriveR: 0 }); return; }
      if (d < 0.8 || st.t > 3) {
        npc.mesh.visible = false;
        const dest = chooseDest();
        st.dest = dest; st.phase = 'ride'; st.t = 0; st.hits = 0; st.ouchT = 0;
        G.Nav.set(dest, { name: dest.name, keep: true, silent: true, arriveR: 0 });
        st.fare = Math.round(250 + G.Nav.active.len * 1.6);
        st.limit = Math.round(G.Nav.active.len / 15 + 30); st.len0 = G.Nav.active.len;
        st.beacon = beacon(0x28ff8a); st.beacon.position.set(dest.x, 0, dest.z);
        G.UI.toast('🧑 ' + pick(ASK).replace('{d}', dest.name), 3500);
      }
      return;
    }
    if (st.phase === 'ride') {
      st.t += dt; st.ouchT -= dt;
      if (p.impact > 7 && st.ouchT <= 0) { st.hits++; st.ouchT = 2.5; G.UI.toast('🧑 ' + pick(OUCH), 1800); }
      const left = st.limit - st.t, A = G.Nav.active, togo = A ? A.len : 0;
      const meter = Math.round(250 + Math.max(0, st.len0 - togo) * 1.6);
      mission('🚕 CHỞ KHÁCH → ' + st.dest.name, 'Đồng hồ: ' + G.fmtMoney(Math.min(meter, st.fare)) + ' • còn ' + G.Nav.fmtDist(togo) + (st.hits ? ' • va chạm ' + st.hits : ''), left > 0 ? G.fmtTime(left) : 'TRỄ GIỜ', left < 15);
      if (Math.hypot(st.dest.x - p.x, st.dest.z - p.z) < 15 && p.speed < 3) finishRide(left);
    }
  }
  function finishRide(left) {
    const p = P(), npc = st.npc;
    let mult = Math.max(0.3, 1 - st.hits * 0.12); if (left < 0) mult *= 0.5;
    const tip = left > 0 ? Math.round(st.fare * 0.3 * left / st.limit) * (st.hits ? 0 : 1) : 0;
    const pay = Math.round(st.fare * mult) + tip;
    const stars = G.clamp(5 - st.hits - (left < 0 ? 2 : 0), 1, 5);
    G.save.cash += pay; st.earned += pay; st.done++;
    G.save.stats.taxiTrips = (G.save.stats.taxiTrips || 0) + 1;
    G.Audio.cash();
    G.UI.popup('+' + G.fmtMoney(pay) + (tip ? ' (boa ' + G.fmtMoney(tip) + ')' : ''), '#28ff8a');
    G.UI.toast('★'.repeat(stars) + '☆'.repeat(5 - stars) + '  Khách: ' + (stars >= 4 ? 'Cảm ơn anh tài, chạy ngon lắm!' : stars >= 3 ? 'Cũng được.' : 'Lần sau tôi gọi xe khác!'), 3500);
    // passenger steps out and walks off
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    npc.setPose(p.x + fz * 1.8, p.z - fx * 1.8, p.heading - Math.PI / 2); npc.mesh.visible = true;
    st.leaving = { npc, t: 4 }; st.npc = null;
    dropBeacon(); G.Nav.clear();
    st.phase = 'wait'; st.wait = 3;
    G.persist();
  }

  // ---------------- Police patrol ----------------
  const CRIMES = [
    { n: 'Chạy quá tốc độ', lv: 1, cars: ['kitsune', 'vanta'] }, { n: 'Vượt đèn đỏ', lv: 1, cars: ['kitsune', 'vanta', 'titan'] },
    { n: 'Xe trộm', lv: 2, cars: ['raptor', 'apex', 'titan'] }, { n: 'Đua xe trái phép', lv: 2, cars: ['apex', 'raptor'] },
    { n: 'Cướp ngân hàng', lv: 3, cars: ['phantom', 'aero'] }, { n: 'Buôn lậu', lv: 3, cars: ['phantom', 'apex'] },
  ];
  function spawnSuspect() {
    const p = P(), spot = G.Nav.streetSpot(p.x, p.z, 220, 420);
    if (!spot) { st.wait = 1; return; }
    const c = pick(CRIMES), spec = G.carById(pick(c.cars));
    const v = new G.Vehicle(spec, pick(spec.colors), { upgrades: { engine: c.lv, handling: c.lv, nitro: c.lv } });
    v.perf.maxSpeed *= 0.8 + c.lv * 0.04;
    v.setPose(spot.x, spot.z, Math.random() * Math.PI * 2);
    v.isSuspect = true; v.hp = 100; v.crime = c; v.wpPrev = -1; v.wp = -1;
    v.onHit = (o, imp) => { if (o === G.Game.player && imp > 2) { v.hp = Math.max(0, v.hp - imp * (2.5 + c.lv)); } };
    scene().add(v.mesh);
    const mk = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1) }));
    mk.rotation.x = Math.PI; scene().add(mk);
    st.suspect = v; st.marker = mk; st.bust = 0; st.lost = 0; st.t = 0; st.phase = 'chase';
    G.Nav.set({ x: v.x, z: v.z }, { name: 'Đối tượng: ' + c.n, keep: true, silent: true, arriveR: 0 });
    G.UI.toast('📻 Tổng đài: Phát hiện ' + spec.name + ' — ' + c.n + '! Truy bắt ngay! ' + '★'.repeat(c.lv), 3500);
  }
  // fleeing AI: at each junction take the neighbour that gets furthest from the cop (with some randomness)
  function fleeDrive(v, dt) {
    const cop = P();
    if (v.hp <= 0) {
      Object.assign(v.input, { throttle: 0, brake: 1, steer: 0, handbrake: true, nitro: false });
      if (Math.random() < dt * 8) G.FX.smoke.emit({ x: v.x, y: v.y + 1, z: v.z, vx: (Math.random() - 0.5), vy: 1.5, vz: (Math.random() - 0.5), max: 2, s0: 1, s1: 4, r: 0.25, g: 0.25, b: 0.27, a: 0.5, drag: 0.8, grav: -0.4 });
      return;
    }
    if (v.wp < 0) v.wp = G.Nav.nearestNode(v.x, v.z);
    let n = G.Nav.node(v.wp);
    if (Math.hypot(n.x - v.x, n.z - v.z) < 16) {
      const opts = G.Nav.neighbors(v.wp).filter((id) => id !== v.wpPrev);
      let best = opts[0], bs = -Infinity;
      for (const id of opts.length ? opts : G.Nav.neighbors(v.wp)) {
        const q = G.Nav.node(id), sc = Math.hypot(q.x - cop.x, q.z - cop.z) + Math.random() * 140;
        if (sc > bs) { bs = sc; best = id; }
      }
      v.wpPrev = v.wp; v.wp = best; n = G.Nav.node(v.wp);
    }
    const d = Math.hypot(cop.x - v.x, cop.z - v.z);
    G.aiDrive(v, n, null, { dt, nitro: d < 140 });
  }
  function updatePolice(dt) {
    const p = P(), ud = p.ud;
    if (st.phase !== 'chase') {
      J.sirenLevel = 0;
      st.wait -= dt; if (st.wait <= 0) spawnSuspect();
      mission('🚓 TUẦN TRA', 'Đang chờ tổng đài điều phối...', '');
      if (ud.siren) { ud.siren.red.color.setRGB(0.3, 0.05, 0.05); ud.siren.blue.color.setRGB(0.05, 0.1, 0.4); }
      return;
    }
    const v = st.suspect;
    st.t += dt;
    fleeDrive(v, dt);
    v.update(dt);
    if (v.surface === 'water') { const q = G.W.nearestRoadPose(v.x, v.z, v.heading); v.setPose(q.x, q.z, q.heading); }
    v.syncMesh(dt);
    st.marker.position.set(v.x, v.y + 3.2 + Math.sin(st.t * 4) * 0.25, v.z); st.marker.rotation.y += dt * 3;
    G.Nav.retarget(v.x, v.z);
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    J.sirenLevel = d < 500 ? 1 : 0;
    if (ud.siren) { const f = Math.sin(performance.now() * 0.02) > 0; ud.siren.red.color.setRGB(f ? 8 : 0.3, 0.05, 0.05); ud.siren.blue.color.setRGB(0.05, 0.3, f ? 0.3 : 10); }
    // arrest: hold the suspect (stopped or disabled) within 10 m for 2.5 s
    if (d < 10 && v.speed < 4 && p.speed < 8) st.bust += dt; else st.bust = Math.max(0, st.bust - dt * 0.6);
    if (d > 650) st.lost += dt; else st.lost = Math.max(0, st.lost - dt);
    const lv = v.crime.lv;
    mission('🚓 TRUY BẮT: ' + v.crime.n + ' ' + '★'.repeat(lv), (st.bust > 0 ? 'ĐANG KHỐNG CHẾ ' + Math.round(st.bust / 2.5 * 100) + '%' : 'Cách ' + G.Nav.fmtDist(d)) + ' • Xe nghi phạm hư hại ' + Math.round(100 - v.hp) + '%', st.lost > 0 ? 'MẤT DẤU ' + Math.ceil(8 - st.lost) + 's' : G.fmtTime(st.t), st.lost > 0);
    if (st.bust >= 2.5) {
      const pay = 1500 * lv + Math.max(0, Math.round((120 - st.t) * 15));
      G.save.cash += pay; st.earned += pay; st.done++;
      G.save.stats.busts = (G.save.stats.busts || 0) + 1;
      G.Audio.cash(); G.UI.popup('ĐÃ BẮT GIỮ! +' + G.fmtMoney(pay), '#28ff8a');
      G.UI.toast('🚔 Bắt giữ thành công đối tượng ' + v.crime.n + '!', 3000);
      clearSuspect(); st.wait = 6 + Math.random() * 6; G.persist();
    } else if (st.lost >= 8) {
      G.Audio.fail(); G.UI.toast('📻 Tổng đài: Mất dấu đối tượng. Quay lại tuần tra.', 3000);
      clearSuspect(); st.wait = 8;
    }
  }
  function clearSuspect() {
    const v = st.suspect;
    if (v) scene().remove(v.mesh);
    if (st.marker) scene().remove(st.marker);
    st.suspect = null; st.marker = null; st.phase = 'wait'; J.sirenLevel = 0;
    G.Nav.clear();
  }

  // ---------------- Per frame ----------------
  J.update = function (dt, car) {
    if (!J.mode || !st) return;
    if (car !== P() || !P().job) { J.end(true); return; } // job car was replaced (garage / reset)
    if (st.leaving) { const l = st.leaving; l.t -= dt; l.npc.control(Math.sin(l.npc.heading), Math.cos(l.npc.heading)); l.npc.update(dt); if (l.t <= 0) { l.npc.dispose(); st.leaving = null; } }
    if (J.mode === 'taxi') { if (!st.phase) st.phase = 'wait'; updateTaxi(dt); }
    else updatePolice(dt);
  };

  // ---------------- Mode menu ----------------
  J.openMenu = function () {
    const Gm = G.Game;
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'modeMenu'; modal.className = 'modal hidden';
      modal.innerHTML = `<div class="card wide mode-card">
        <div class="r-title">CHẾ ĐỘ CHƠI</div>
        <div class="mode-grid">
          <button class="mode-opt" data-m="free"><i>🌆</i><b>TỰ DO</b><span>Lái xe khám phá, đua sự kiện, nhặt xu, cắt đuôi cảnh sát.</span></button>
          <button class="mode-opt" data-m="taxi"><i>🚕</i><b>CHẠY TAXI</b><span>Đón khách đang vẫy, chở tới địa chỉ bằng GPS. Nhanh + cẩn thận = nhiều tiền boa.</span></button>
          <button class="mode-opt" data-m="police"><i>🚓</i><b>CẢNH SÁT TUẦN TRA</b><span>Lái xe tuần tra, tổng đài báo xe vi phạm — truy đuổi, ép dừng và bắt giữ để nhận thưởng.</span></button>
          <button class="mode-opt" data-m="online"><i>🌐</i><b>NHIỀU NGƯỜI CHƠI</b><span>Vào phòng online cùng bạn bè. Chọn làm CẢNH SÁT bắt người vi phạm hoặc DÂN THƯỜNG chạy tự do.</span></button>
        </div>
        <label class="mode-toggle"><input type="checkbox" id="modeNoPolice"> 🚫 Tắt cảnh sát AI (không bị truy nã khi vi phạm)</label>
        <div class="mode-stats" id="modeStats"></div>
        <button class="btn" id="modeClose">✖ ĐÓNG <kbd>ESC</kbd></button>
      </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#modeNoPolice').onchange = (e) => {
        G.save.settings.noPolice = e.target.checked; G.persist();
        if (e.target.checked && G.Police.active) G.Police.end();
        if (!e.target.checked) G.Police.cooldown = 3;
        G.UI.toast(e.target.checked ? '🚫 Đã tắt cảnh sát AI' : '🚓 Đã bật cảnh sát AI', 1800);
      };
      modal.addEventListener('click', (e) => {
        if (e.target.closest('.mode-toggle')) return;
        if (e.target === modal || e.target.id === 'modeClose') { J.closeMenu(); return; }
        const b = e.target.closest('.mode-opt'); if (!b) return;
        G.Audio.ui && G.Audio.ui();
        const m = b.dataset.m;
        J.closeMenu();
        if (m === 'online') { if (G.Net) G.Net.openLobby(); return; }
        if (G.Game.state !== 'play') { G.Audio.init(); G.Game.play(); }
        if (m === 'free') { if (J.mode) J.end(); else G.UI.toast('🌆 Chế độ tự do'); return; }
        const err = J.start(m); if (err) G.UI.toast(err, 3000);
      });
    }
    modal.querySelector('#modeNoPolice').checked = !!G.save.settings.noPolice;
    const s = G.save.stats;
    modal.querySelector('#modeStats').textContent = '🚕 ' + (s.taxiTrips || 0) + ' chuyến taxi • 🚓 ' + (s.busts || 0) + ' lần bắt giữ' + (J.mode ? ' • Đang làm ca: ' + J.label() : '');
    modal.querySelectorAll('.mode-opt').forEach((b) => b.classList.toggle('on', (b.dataset.m === (J.mode || (G.Net && G.Net.connected ? 'online' : 'free')))));
    modal.classList.remove('hidden');
    if (Gm.state === 'play' && !Gm.paused) Gm.pauseSim(true);
    J.menuOpen = true;
  };
  J.closeMenu = function () {
    if (!modal || modal.classList.contains('hidden')) return;
    modal.classList.add('hidden'); J.menuOpen = false;
    if (G.Game.state === 'play') G.Game.pauseSim(false);
  };
  window.addEventListener('keydown', (e) => {
    const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.repeat) return;
    if (J.menuOpen && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (G.input) G.input.consume('Escape'); J.closeMenu(); return; }
    if (e.code !== 'KeyJ') return;
    const Gm = G.Game; if (!Gm || Gm.state !== 'play' || Gm.paused || (Gm.simPaused && !J.menuOpen) || Gm.garage) return;
    if (J.menuOpen) J.closeMenu(); else J.openMenu();
  }, true);
  return J;
})();
