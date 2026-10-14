// ================================================================
//  UI: HUD, minimap, prompts, garage, big map + GPS, menus
// ================================================================
'use strict';

G.UI = (function () {
  const U = {};
  const $ = (id) => document.getElementById(id);
  let mm, mmx, rpmLen = 420, toastT = null;
  U.gps = null;   // { target:{x,z}, route:[{x,z}] }

  U.init = function () {
    mm = $('minimap'); mmx = mm.getContext('2d');
    const arc = $('rpmArc'); try { rpmLen = arc.getTotalLength(); } catch (e) { /* old browsers */ }
    arc.style.strokeDasharray = rpmLen; arc.style.strokeDashoffset = rpmLen;

    $('btnResultsOk').onclick = () => { $('results').classList.add('hidden'); G.Game.resume(); };
    $('btnResume').onclick = () => G.Game.togglePause(false);
    $('btnAbort').onclick = () => { G.Events.abort(); };
    $('btnPauseGarage').onclick = () => { G.Game.togglePause(false); G.Game.openGarage(); };
    $('btnPauseMap').onclick = () => { G.Game.togglePause(false); U.toggleMap(true); };
    $('btnPauseTitle').onclick = () => { G.Game.togglePause(false); G.Game.toTitle(); };
    $('btnTitleSettings').onclick = () => { $('settingsSlot').appendChild($('settingsBox')); $('settingsModal').classList.remove('hidden'); syncSettings(); };
    $('btnSettingsClose').onclick = () => { $('settingsModal').classList.add('hidden'); $('pause').querySelector('.card').insertBefore($('settingsBox'), $('pauseStats')); };
    $('setQuality').onchange = (e) => { G.save.settings.quality = e.target.value; G.persist(); G.R.applyQuality(); G.Traffic.setCount(G.QUALITY[e.target.value].traffic); G.FX.resize(); };
    $('setVolume').oninput = (e) => { G.save.settings.volume = +e.target.value; G.Audio.setVolume(+e.target.value); G.persist(); };
    $('setTime').onchange = (e) => { G.save.settings.timeScale = +e.target.value; G.persist(); };
    $('setUnits').onchange = (e) => { G.save.settings.units = e.target.value; G.persist(); };
    $('gClose').onclick = () => G.Game.closeGarage();
    $('bigmapCanvas').addEventListener('click', onMapClick);
    $('bigmapCanvas').addEventListener('contextmenu', (e) => { e.preventDefault(); U.gps = null; drawBigMap(); });

    // touch controls
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.querySelectorAll('#touch .tbtn[data-k]').forEach((b) => G.input.bindTouch(b, b.dataset.k));
      document.querySelectorAll('#touch .tbtn[data-press]').forEach((b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); G.input.press(b.dataset.press); }, { passive: false }));
      U.touch = true;
    }
  };
  function syncSettings() {
    const s = G.save.settings;
    $('setQuality').value = s.quality; $('setVolume').value = s.volume; $('setTime').value = String(s.timeScale); $('setUnits').value = s.units;
  }
  U.showScreen = function (name) {
    ['loading', 'title'].forEach((n) => $(n).classList.toggle('active', n === name));
    $('hud').classList.toggle('hidden', name !== 'game');
    $('touch').classList.toggle('hidden', !(name === 'game' && U.touch));
    if (name === 'title') {
      const st = G.save.stats;
      $('titleStats').textContent = `💰 ${G.fmtMoney(G.save.cash)}  •  🚗 ${G.save.owned.length}/${G.CARS.length} xe  •  ⭐ ${G.save.coins.length} xu  •  🏆 ${st.wins} chiến thắng  •  ⚡ ${Math.round(st.topSpeed)} km/h`;
    }
  };
  U.loading = function (p, text) { $('loadFill').style.width = Math.round(p * 100) + '%'; if (text) $('loadText').textContent = text; };

  U.toast = function (text, ms) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2600);
  };
  U.popup = function (text, color) {
    const box = $('popups'); const d = document.createElement('div');
    d.className = 'popup'; d.textContent = text; d.style.color = color || '#fff';
    box.appendChild(d); setTimeout(() => d.remove(), 2500);
    while (box.children.length > 5) box.firstChild.remove();
  };
  U.countdown = function (v) {
    const c = $('countdown'); c.textContent = v; c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    c.style.color = v === 'GO!' ? '#28ff8a' : '#fff';
  };
  U.mission = function (title, sub, timer, warn) {
    $('mission').classList.remove('hidden');
    $('mTitle').textContent = title; $('mSub').textContent = sub; $('mTimer').textContent = timer || '';
    $('mTimer').classList.toggle('warn', !!warn);
  };
  U.eventStart = function (def) { U.toast(def.icon + ' ' + def.name); $('prompt').classList.add('hidden'); };
  U.results = function (r) {
    $('mission').classList.add('hidden');
    $('rEvent').textContent = r.name; $('rTitle').textContent = r.title;
    $('rLines').innerHTML = r.lines.map((l) => `<div>${l}</div>`).join('');
    $('rReward').textContent = r.reward ? '+' + G.fmtMoney(r.reward) : (r.success ? '' : 'Không có thưởng');
    $('results').classList.remove('hidden');
    if (!r.success) G.Audio.fail();
    G.Game.pauseSim(true);
  };
  U.showPause = function (on) {
    $('pause').classList.toggle('hidden', !on);
    if (on) {
      syncSettings();
      $('btnAbort').style.display = G.Events.active ? '' : 'none';
      const st = G.save.stats;
      $('pauseStats').innerHTML = `Quãng đường: ${(st.distance / 1000).toFixed(1)} km • Tốc độ cao nhất: ${Math.round(st.topSpeed)} km/h • Drift kỷ lục: ${Math.round(st.bestDrift).toLocaleString('en-US')}<br>Đua: ${st.races} • Thắng: ${st.wins} • Cắt đuôi cảnh sát: ${st.escapes}`;
    }
  };

  // ---------------- HUD per frame ----------------
  let lastCash = -1;
  U.hud = function (car, hour) {
    const mph = G.save.settings.units === 'mph';
    const sp = car.speed * (mph ? 2.237 : 3.6);
    $('hudSpeed').textContent = Math.round(sp);
    $('hudUnit').textContent = mph ? 'MPH' : 'KM/H';
    $('hudGear').textContent = car.fwdSpeed < -0.5 ? 'R' : (car.speed < 0.5 && car.input.throttle === 0 ? 'N' : String(car.gear + 1));
    $('rpmArc').style.strokeDashoffset = rpmLen * (1 - G.clamp((car.rpm - 800) / 7400, 0, 1));
    $('hudNitro').style.width = (car.nitro / car.perf.nitroCap * 100).toFixed(1) + '%';
    if (G.save.cash !== lastCash) { lastCash = G.save.cash; $('hudCash').textContent = G.fmtMoney(G.save.cash); }
    $('hudCoins').textContent = G.save.coins.length + '/' + G.Events.coinTotal;
    const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
    $('hudClock').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    // wanted
    const P = G.Police;
    $('wanted').classList.toggle('hidden', !P.active);
    if (P.active) {
      const lv = Math.ceil(P.heat);
      $('wantedStars').innerHTML = [1, 2, 3, 4, 5].map((i) => `<span class="${i <= lv ? 'on' : 'off'}">★</span>`).join('');
      const busting = P.bust > 0.2;
      $('escapeFill').style.width = (busting ? P.bust / 3 : P.escape / 10) * 100 + '%';
      $('escapeFill').style.background = busting ? '#ff3b5c' : '';
      $('wantedLabel').textContent = busting ? 'SẮP BỊ BẮT! THOÁT RA!' : (P.escape > 0.3 ? 'ĐANG CẮT ĐUÔI...' : 'ĐANG BỊ TRUY ĐUỔI');
    }
    if (!G.Events.active) $('mission').classList.add('hidden');
    // event prompt
    const nm = G.Events.nearMarker;
    const pr = $('prompt');
    if (nm && !G.Events.active) {
      const best = G.save.best[nm.id];
      const bestTxt = best ? (nm.type === 'speed' ? best + ' km/h' : nm.type === 'drift' ? Math.round(best).toLocaleString('en-US') + ' điểm' : nm.type === 'jump' ? best + ' m' : G.fmtTime(best)) : '';
      pr.innerHTML = `<div class="p-name">${nm.icon} ${nm.name}</div><div class="p-desc">${nm.desc}</div>${bestTxt ? `<div class="p-desc">Kỷ lục: <b>${bestTxt}</b></div>` : ''}<div class="p-key">Nhấn [E] để bắt đầu</div>`;
      pr.classList.remove('hidden');
    } else pr.classList.add('hidden');
  };

  // ---------------- Minimap ----------------
  U.minimap = function (car, cops, racers, traffic) {
    const W = G.W, M = W.MAP, ctx = mmx, S = mm.width;
    const zoom = G.lerp(1.4, 0.75, G.clamp(car.speed / 80, 0, 1)); // map px per map-canvas px
    ctx.save();
    ctx.fillStyle = '#1b2433'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(car.heading - Math.PI);
    const [px, py] = W.toMap(car.x, car.z);
    ctx.scale(zoom, zoom);
    ctx.translate(-px, -py);
    ctx.drawImage(W.mapCanvas, 0, 0);
    const dot = (x, z, r, col, stroke) => { const [a, b] = W.toMap(x, z); ctx.beginPath(); ctx.arc(a, b, r / zoom, 0, 7); ctx.fillStyle = col; ctx.fill(); if (stroke) { ctx.lineWidth = 2 / zoom; ctx.strokeStyle = stroke; ctx.stroke(); } };
    // GPS route
    if (U.gps) {
      ctx.strokeStyle = '#b04dff'; ctx.lineWidth = 6 / zoom; ctx.lineJoin = 'round'; ctx.beginPath();
      const pts = [{ x: car.x, z: car.z }, ...U.gps.route];
      pts.forEach((p, i) => { const [a, b] = W.toMap(p.x, p.z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
      dot(U.gps.target.x, U.gps.target.z, 7, '#b04dff', '#fff');
    }
    for (const t of traffic) if (Math.abs(t.x - car.x) < 400 && Math.abs(t.z - car.z) < 400) dot(t.x, t.z, t.police ? 3.5 : 2.2, t.police ? '#3d7bff' : 'rgba(220,220,220,0.7)');
    if (!G.Events.active) for (const m of G.Events.markers()) dot(m.x, m.z, 6, '#' + new THREE.Color(m.def.color).getHexString(), '#fff');
    const gt = G.Events.gateTarget(); if (gt) dot(gt.x, gt.z, 7, '#00e5ff', '#fff');
    for (const r of racers) dot(r.x, r.z, 4.5, '#ffd400', '#000');
    const blink = Math.sin(performance.now() * 0.02) > 0;
    for (const c of cops) dot(c.x, c.z, 5, blink ? '#ff2040' : '#2060ff', '#fff');
    ctx.restore();
    // clamp off-screen important targets to the rim
    // player arrow
    ctx.save(); ctx.translate(S / 2, S / 2);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath();
    ctx.fillStyle = '#28ff8a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // GPS arrival
    if (U.gps && Math.hypot(U.gps.target.x - car.x, U.gps.target.z - car.z) < 25) { U.gps = null; U.toast('🎯 Đã đến điểm đánh dấu'); }
    else if (U.gps && U.gps.route.length > 1 && Math.hypot(U.gps.route[0].x - car.x, U.gps.route[0].z - car.z) < 20) U.gps.route.shift();
  };

  // ---------------- Big map ----------------
  let bmView = null;
  U.mapOpen = false;
  U.toggleMap = function (on) {
    U.mapOpen = on === undefined ? !U.mapOpen : on;
    $('bigmap').classList.toggle('hidden', !U.mapOpen);
    if (U.mapOpen) {
      $('bmEvents').innerHTML = G.Events.list.map((d) => `<div><span style="color:#${new THREE.Color(d.color).getHexString()}">●</span> ${d.icon} ${d.name}</div>`).join('');
      drawBigMap();
    }
  };
  function drawBigMap() {
    const cv = $('bigmapCanvas'); cv.width = innerWidth; cv.height = innerHeight;
    const ctx = cv.getContext('2d'), src = G.W.mapCanvas;
    const k = Math.min(cv.width / src.width, cv.height / src.height) * 0.95;
    const ox = (cv.width - src.width * k) / 2, oy = (cv.height - src.height * k) / 2;
    bmView = { k, ox, oy };
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(src, ox, oy, src.width * k, src.height * k);
    const P = (x, z) => { const [a, b] = G.W.toMap(x, z); return [ox + a * k, oy + b * k]; };
    ctx.fillStyle = '#ffd400';
    for (const c of G.Events.coins) if (!c.got) { const [a, b] = P(c.x, c.z); ctx.beginPath(); ctx.arc(a, b, 2.5, 0, 7); ctx.fill(); }
    for (const m of G.Events.markers()) {
      const [a, b] = P(m.x, m.z);
      ctx.beginPath(); ctx.arc(a, b, 9, 0, 7); ctx.fillStyle = '#' + new THREE.Color(m.def.color).getHexString(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(m.def.icon, a, b - 14);
    }
    if (U.gps) {
      ctx.strokeStyle = '#b04dff'; ctx.lineWidth = 4; ctx.beginPath();
      const car = G.Game.player;
      [{ x: car.x, z: car.z }, ...U.gps.route].forEach((p, i) => { const [a, b] = P(p.x, p.z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
    }
    const car = G.Game.player;
    const [a, b] = P(car.x, car.z);
    ctx.save(); ctx.translate(a, b); ctx.rotate(Math.PI - car.heading);
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(9, 9); ctx.lineTo(0, 4); ctx.lineTo(-9, 9); ctx.closePath();
    ctx.fillStyle = '#28ff8a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); ctx.restore();
  }
  function onMapClick(e) {
    if (!bmView) return;
    const M = G.W.MAP;
    const mx = (e.clientX - bmView.ox) / bmView.k, my = (e.clientY - bmView.oy) / bmView.k;
    const x = mx / M.s + M.x0, z = my / M.s + M.z0;
    U.setGps({ x, z });
    drawBigMap();
  }
  U.setGps = function (target) {
    const car = G.Game.player, W = G.W, R = G.CFG.RING;
    const inside = (p) => Math.abs(p.x) < R && Math.abs(p.z) < R;
    let route = [];
    if (inside(car) && inside(target)) {
      route = W.path(W.nearestNode(car.x, car.z), W.nearestNode(target.x, target.z)).map((n) => W.node(n.i, n.j));
    } else if (inside(car)) {
      const exitN = W.nearestNode(target.x, target.z);
      route = W.path(W.nearestNode(car.x, car.z), exitN).map((n) => W.node(n.i, n.j));
    } else if (inside(target)) {
      const entry = W.nearestNode(car.x, car.z);
      route = W.path(entry, W.nearestNode(target.x, target.z)).map((n) => W.node(n.i, n.j));
    }
    route.push({ x: target.x, z: target.z });
    U.gps = { target, route };
    U.toast('🎯 Đã đặt GPS');
  };

  // ---------------- Garage ----------------
  let gIdx = 0;
  U.openGarage = function () {
    $('garage').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    gIdx = Math.max(0, G.CARS.findIndex((c) => c.id === G.save.selected));
    renderGarage();
  };
  U.closeGarage = function () { $('garage').classList.add('hidden'); };
  function stat(label, val, max, bonus, txt) {
    const w = G.clamp(val / max, 0, 1) * 100, b = G.clamp(bonus / max, 0, 1) * 100;
    return `<div class="row"><div class="lbl"><span>${label}</span><span>${txt}</span></div><div class="bar"><i style="width:${w}%"></i><b style="left:${w}%;width:${b}%"></b></div></div>`;
  }
  function renderGarage() {
    const spec = G.CARS[gIdx], owned = G.save.owned.includes(spec.id), up = G.upg(spec.id);
    const perf = G.carPerf(spec, up);
    $('gBrand').textContent = spec.brand + ' • HẠNG ' + spec.cls;
    $('gName').textContent = spec.name;
    $('gDesc').textContent = spec.desc;
    const kmh = (v) => Math.round(v * 3.6);
    $('gStats').innerHTML =
      stat('TỐC ĐỘ TỐI ĐA', spec.maxSpeed, 130, perf.maxSpeed - spec.maxSpeed, kmh(perf.maxSpeed) + ' km/h') +
      stat('TĂNG TỐC', spec.accel, 30, perf.accel - spec.accel, '0-100: ' + (27.8 / (perf.accel * 0.82)).toFixed(1) + 's') +
      stat('BÁM ĐƯỜNG', spec.grip, 16, perf.grip - spec.grip, perf.grip.toFixed(1)) +
      stat('NITRO', 1, 2.25, perf.nitroCap - 1, 'x' + perf.nitroCap.toFixed(2));
    const colIdx = G.save.colors[spec.id] || 0;
    $('gColors').innerHTML = spec.colors.map((c, i) => `<div class="sw ${i === colIdx ? 'on' : ''}" data-i="${i}" style="background:#${c.toString(16).padStart(6, '0')}"></div>`).join('');
    $('gColors').querySelectorAll('.sw').forEach((el) => el.onclick = () => { G.save.colors[spec.id] = +el.dataset.i; G.persist(); G.Game.previewCar(spec.id); G.Audio.ui(); renderGarage(); });
    const parts = [['engine', 'ĐỘNG CƠ'], ['handling', 'KHUNG GẦM'], ['nitro', 'NITRO']];
    $('gUpgrades').innerHTML = parts.map(([k, n]) => {
      const lv = up[k], cost = G.UPGRADE_COST(spec, lv), max = lv >= 5;
      return `<div class="up"><span class="nm">${n}</span><span class="pips">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span><button class="btn" data-k="${k}" ${!owned || max || G.save.cash < cost ? 'disabled' : ''}>${max ? 'TỐI ĐA' : G.fmtMoney(cost)}</button></div>`;
    }).join('');
    $('gUpgrades').querySelectorAll('button').forEach((b) => b.onclick = () => {
      const k = b.dataset.k, cost = G.UPGRADE_COST(spec, up[k]);
      if (G.save.cash < cost || up[k] >= 5) return;
      G.save.cash -= cost; up[k]++; G.persist(); G.Audio.cash(); G.Game.previewCar(spec.id); renderGarage();
    });
    const act = $('gAction');
    if (!owned) { act.textContent = 'MUA ' + G.fmtMoney(spec.price); act.disabled = G.save.cash < spec.price; }
    else if (G.save.selected === spec.id) { act.textContent = '✔ ĐANG SỬ DỤNG'; act.disabled = true; }
    else { act.textContent = 'CHỌN XE NÀY'; act.disabled = false; }
    act.onclick = () => {
      if (!owned) { if (G.save.cash < spec.price) return; G.save.cash -= spec.price; G.save.owned.push(spec.id); G.Audio.cash(); U.toast('🎉 Đã mua ' + spec.name + '!'); }
      G.save.selected = spec.id; G.persist(); G.Game.previewCar(spec.id); renderGarage();
    };
    $('gCash').textContent = G.fmtMoney(G.save.cash);
    $('gStrip').innerHTML = G.CARS.map((c, i) => `<div class="g-card ${i === gIdx ? 'on' : ''}" data-i="${i}"><div class="cls">HẠNG ${c.cls}</div><div class="nm">${c.name}</div><div class="pr ${G.save.owned.includes(c.id) ? 'own' : ''}">${G.save.owned.includes(c.id) ? (G.save.selected === c.id ? '✔ ĐANG DÙNG' : 'ĐÃ SỞ HỮU') : G.fmtMoney(c.price)}</div></div>`).join('');
    $('gStrip').querySelectorAll('.g-card').forEach((el) => el.onclick = () => { gIdx = +el.dataset.i; G.Audio.ui(); G.Game.previewCar(G.CARS[gIdx].id); renderGarage(); });
  }
  U.garageKey = function (dir) { gIdx = (gIdx + dir + G.CARS.length) % G.CARS.length; G.Game.previewCar(G.CARS[gIdx].id); renderGarage(); };
  return U;
})();
