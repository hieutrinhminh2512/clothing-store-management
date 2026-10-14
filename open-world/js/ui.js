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

    $('btnResultsOk').onclick = closeResults;
    $('btnResultsRetry').onclick = retryEvent;
    $('btnResume').onclick = () => G.Game.togglePause(false);
    $('btnAbort').onclick = () => { G.Game.togglePause(false); G.Events.abort(); };
    $('btnPauseGarage').onclick = () => { G.Game.togglePause(false); G.Game.openGarage(); };
    $('btnPauseMap').onclick = () => { G.Game.togglePause(false); U.toggleMap(true); };
    $('btnPauseTitle').onclick = () => U.exitToTitle();
    $('btnPauseSwitch').onclick = () => { G.Game.togglePause(false); U.openSwitcher(); };
    $('btnPauseFoot').onclick = () => { G.Game.togglePause(false); toggleFoot(); };
    $('btnPauseLogout').onclick = doLogout;
    $('btnPauseMode').onclick = () => { G.Game.togglePause(false); G.Jobs.openMenu(); };
    $('btnTitleMode').onclick = () => G.Jobs.openMenu();
    // title screen
    $('btnContinue').onclick = () => { if (G.Audio.init) G.Audio.init(); G.Game.play(); };
    $('btnTitleLogout').onclick = doLogout;
    $('btnNewGame').onclick = newGame;
    $('btnQuit').onclick = quitGame;
    $('btnByeBack').onclick = () => { $('bye').classList.add('hidden'); };
    // garage navigation
    $('gPrev').onclick = () => { G.Audio.ui(); U.garageKey(-1); };
    $('gNext').onclick = () => { G.Audio.ui(); U.garageKey(1); };
    // quick car switcher + confirm dialog
    $('csClose').onclick = () => U.closeSwitcher();
    $('csGarage').onclick = () => { U.closeSwitcher(); G.Game.openGarage(); };
    $('carSwitch').addEventListener('click', (e) => { if (e.target.id === 'carSwitch') U.closeSwitcher(); });
    $('cfYes').onclick = () => closeConfirm(true);
    $('cfNo').onclick = () => closeConfirm(false);
    // HUD quick-action bar: never take keyboard focus (Space would "click" it)
    const qbar = $('qbar');
    qbar.addEventListener('pointerdown', (e) => e.preventDefault());
    qbar.addEventListener('click', (e) => { const b = e.target.closest('.qb'); if (b) quickAction(b.dataset.act); });
    window.addEventListener('keydown', onKey);
    setInterval(syncState, 250);
    applyFxClass();
    if (G.Auth) { const prev = G.Auth.onChange; G.Auth.onChange = function () { if (prev) prev.apply(this, arguments); applyFxClass(); refreshTitle(); }; }
    $('btnTitleSettings').onclick = () => { $('settingsSlot').appendChild($('settingsBox')); $('settingsModal').classList.remove('hidden'); syncSettings(); };
    $('btnSettingsClose').onclick = () => { $('settingsModal').classList.add('hidden'); $('pause').querySelector('.card').insertBefore($('settingsBox'), $('pauseStats')); };
    const setQ = (q) => { G.save.settings.quality = q; G.persist(); G.R.applyQuality(); G.Traffic.setCount(G.QUALITY[q].traffic); G.FX.resize(); applyFxClass(); $('setQuality').value = q; };
    $('setQuality').onchange = (e) => setQ(e.target.value);
    // weak PC: step the preset down automatically while playing (never up — the player can raise it in Cài đặt)
    const QORDER = ['low', 'medium', 'high', 'ultra'], QNAME = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', ultra: 'Siêu cao' };
    G.R.onSlow = (ms) => {
      if (!G.Game || G.Game.state !== 'play' || G.Game.paused) return;
      const i = QORDER.indexOf(G.save.settings.quality); if (i <= 0) return;
      setQ(QORDER[i - 1]);
      U.toast('🐢 Máy hơi chậm (' + Math.round(1000 / ms) + ' FPS) — tự giảm đồ hoạ xuống ' + QNAME[QORDER[i - 1]] + ' (đổi lại trong Cài đặt)', 3500);
    };
    $('setVolume').oninput = (e) => { G.save.settings.volume = +e.target.value; G.Audio.setVolume(+e.target.value); G.persist(); };
    $('setTime').onchange = (e) => { G.save.settings.timeScale = +e.target.value; G.persist(); };
    $('setUnits').onchange = (e) => { G.save.settings.units = e.target.value; G.persist(); };
    $('gClose').onclick = () => G.Game.closeGarage();
    bmInit();

    // touch controls
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.querySelectorAll('#touch .tbtn[data-k]').forEach((b) => G.input.bindTouch(b, b.dataset.k));
      document.querySelectorAll('#touch .tbtn[data-press]').forEach((b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); G.input.press(b.dataset.press); }, { passive: false }));
      document.querySelectorAll('#touch .tbtn[data-act]').forEach((b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); quickAction(b.dataset.act); }, { passive: false }));
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
    if (name !== 'game') { U.closeSwitcher(true); $('results').classList.add('hidden'); }
    if (name === 'title') refreshTitle();
    else $('bye').classList.add('hidden');
  };
  // ---------------- Title screen ----------------
  const hasProgress = () => { const s = G.save, st = s.stats; return st.distance > 50 || st.races > 0 || s.coins.length > 0 || s.owned.length > 1; };
  function refreshTitle() {
    const st = G.save.stats;
    $('titleStats').textContent = `💰 ${G.fmtMoney(G.save.cash)}  •  🚗 ${G.save.owned.length}/${G.CARS.length} xe  •  ⭐ ${G.save.coins.length} xu  •  🏆 ${st.wins} chiến thắng  •  ⚡ ${Math.round(st.topSpeed)} km/h`;
    const prog = hasProgress();
    $('btnContinue').classList.toggle('hidden', !prog);
    $('btnNewGame').classList.toggle('hidden', !prog);
    $('btnPlay').classList.toggle('primary', !prog);
    if (prog) { const car = G.carById(G.save.selected); $('continueInfo').textContent = (car ? car.name + ' • ' : '') + G.fmtMoney(G.save.cash) + ' • ' + (st.distance / 1000).toFixed(1) + ' km'; }
    $('btnPlay').textContent = prog ? '🌆 VÀO THÀNH PHỐ' : '▶ VÀO THÀNH PHỐ';
    $('btnTitleLogout').classList.toggle('hidden', !(G.Auth && G.Auth.logout));
    // auth.js shows its own name chip on the title screen; avoid a duplicate badge
    const name = userName(), showName = !!name && !document.getElementById('authChip');
    $('titleUser').classList.toggle('hidden', !showName);
    if (showName) { $('titleUser').innerHTML = '👤 Tay đua: <b></b>'; $('titleUser').querySelector('b').textContent = name; }
  }
  function userName() {
    const A = G.Auth; if (!A) return '';
    try {
      if (A.current) { const c = A.current(); if (c && c.username) return c.username; }
      if (A.displayName && (A.user || A.guest)) return A.displayName();
    } catch (e) { /* auth still loading */ }
    return '';
  }
  function doLogout() {
    if (!(G.Auth && G.Auth.logout)) { U.toast('Chức năng tài khoản chưa sẵn sàng'); return; }
    const go = () => { if (G.Game.paused) G.Game.togglePause(false); if (G.Events.active) G.Events.abort(true); U.closeSwitcher(true); G.persist(); G.Auth.logout(); };
    if (G.Events.active) U.confirm('ĐĂNG XUẤT?', 'Sự kiện đang diễn ra sẽ bị huỷ.', go); else go();
  }
  function newGame() {
    U.confirm('CHƠI LẠI TỪ ĐẦU?', 'Toàn bộ tiền, xe, nâng cấp và thành tích của tài khoản này sẽ bị xoá. Không thể hoàn tác!', () => {
      const keep = G.save.settings;
      G.save = G.defaultSave(); G.save.settings = keep;
      G.persist();
      if (G.Auth && G.Auth.refreshGame) G.Auth.refreshGame(keep.quality);
      else { G.Events.coins.forEach((c) => { c.got = false; }); G.Game.previewCar(G.save.selected); U.gps = null; }
      refreshTitle(); U.toast('🆕 Đã tạo lại tiến trình mới');
    });
  }
  function quitGame() {
    G.persist();
    try { window.close(); } catch (e) { /* not a script-opened tab */ }
    // browsers only let scripts close tabs they opened: show a goodbye screen instead
    setTimeout(() => { if (!window.closed) $('bye').classList.remove('hidden'); }, 60);
  }
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
    setCls('mission', 'hidden', false);
    setText('mTitle', title); setText('mSub', sub); setText('mTimer', timer || '');
    setCls('mTimer', 'warn', !!warn);
  };
  U.hideMission = () => setCls('mission', 'hidden', true);
  U.eventStart = function (def) { U.toast(def.icon + ' ' + def.name); promptId = null; $('prompt').classList.add('hidden'); U.closeSwitcher(true); };
  U.results = function (r) {
    setCls('mission', 'hidden', true);
    $('rEvent').textContent = r.name; $('rTitle').textContent = r.title;
    $('rLines').innerHTML = r.lines.map((l) => `<div>${l}</div>`).join('');
    $('rReward').textContent = r.reward ? '+' + G.fmtMoney(r.reward) : (r.success ? '' : 'Không có thưởng');
    $('results').classList.remove('hidden');
    $('btnResultsRetry').classList.toggle('hidden', !G.Events.lastDef);
    if (!r.success) G.Audio.fail();
    G.Game.pauseSim(true);
  };
  const resultsOpen = () => !$('results').classList.contains('hidden');
  function closeResults() { $('results').classList.add('hidden'); G.Game.resume(); }
  function retryEvent() {
    const def = G.Events.lastDef;
    closeResults();
    if (!def || G.Events.active) return;
    if (G.Game.onFoot) { U.toast('Lên xe [F] trước khi đua lại'); return; }
    G.Events.start(def, G.Game.player);
  }
  U.showPause = function (on) {
    $('pause').classList.toggle('hidden', !on);
    if (on) {
      syncSettings();
      $('btnAbort').style.display = G.Events.active ? '' : 'none';
      const canFoot = !!G.Game.toggleVehicle;
      $('btnPauseFoot').classList.toggle('hidden', !canFoot);
      if (canFoot) $('btnPauseFoot').textContent = G.Game.onFoot ? '🚗 LÊN XE (F)' : '🚶 XUỐNG XE (F)';
      $('btnPauseLogout').classList.toggle('hidden', !(G.Auth && G.Auth.logout));
      const st = G.save.stats;
      $('pauseStats').innerHTML = `Quãng đường: ${(st.distance / 1000).toFixed(1)} km • Tốc độ cao nhất: ${Math.round(st.topSpeed)} km/h • Drift kỷ lục: ${Math.round(st.bestDrift).toLocaleString('en-US')}<br>Đua: ${st.races} • Thắng: ${st.wins} • Cắt đuôi cảnh sát: ${st.escapes}`;
    }
  };

  // ---------------- HUD per frame ----------------
  // Every DOM write is cached: the HUD runs at 60+ fps and unchanged writes still
  // invalidate style/layout. Only values that actually change touch the DOM.
  const elC = {}, txtC = {}, clsC = {}, styC = {};
  const el = (id) => elC[id] || (elC[id] = $(id));
  function setText(id, v) { if (txtC[id] !== v) { txtC[id] = v; el(id).textContent = v; } }
  function setCls(id, cls, on) { const k = id + '.' + cls; if (clsC[k] !== on) { clsC[k] = on; el(id).classList.toggle(cls, on); } }
  function setStyle(id, prop, v) { const k = id + '.' + prop; if (styC[k] !== v) { styC[k] = v; el(id).style[prop] = v; } }
  let starsLv = -1, promptId = null;
  U.hud = function (car, hour) {
    const mph = G.save.settings.units === 'mph';
    if (car) {
      setText('hudSpeed', String(Math.round(car.speed * (mph ? 2.237 : 3.6))));
      setText('hudUnit', mph ? 'MPH' : 'KM/H');
      setText('hudGear', car.fwdSpeed < -0.5 ? 'R' : (car.speed < 0.5 && car.input.throttle === 0 ? 'N' : String(car.gear + 1)));
      // quantised so tiny rpm jitter doesn't repaint the arc every frame
      setStyle('rpmArc', 'strokeDashoffset', (rpmLen * (1 - Math.round(G.clamp((car.rpm - 800) / 7400, 0, 1) * 200) / 200)).toFixed(1));
      setStyle('hudNitro', 'transform', 'scaleX(' + (Math.round(car.nitro / car.perf.nitroCap * 200) / 200) + ')');
    }
    setText('hudCash', G.fmtMoney(G.save.cash));
    setText('hudCoins', G.save.coins.length + '/' + G.Events.coinTotal);
    const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
    setText('hudClock', String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    // wanted
    const P = G.Police;
    setCls('wanted', 'hidden', !P.active);
    if (P.active) {
      const lv = Math.ceil(P.heat);
      if (lv !== starsLv) {
        if (starsLv < 0) el('wantedStars').innerHTML = '<span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>';
        starsLv = lv;
        Array.prototype.forEach.call(el('wantedStars').children, (sp, i) => { sp.className = i < lv ? 'on' : 'off'; });
      }
      const busting = P.bust > 0.2;
      setStyle('escapeFill', 'transform', 'scaleX(' + (Math.round(G.clamp(busting ? P.bust / 3 : P.escape / 10, 0, 1) * 100) / 100) + ')');
      setCls('escapeFill', 'bust', busting);
      setText('wantedLabel', busting ? 'SẮP BỊ BẮT! THOÁT RA!' : (P.escape > 0.3 ? 'ĐANG CẮT ĐUÔI...' : 'ĐANG BỊ TRUY ĐUỔI'));
    }
    if (!G.Events.active && !(G.Jobs && G.Jobs.mode) && !(G.Net && G.Net.connected)) setCls('mission', 'hidden', true);
    // event prompt: rebuilt only when the nearby marker changes
    const nm = G.Events.nearMarker && !G.Events.active && !(G.Game && G.Game.onFoot) ? G.Events.nearMarker : null;
    const pid = nm ? nm.id + ':' + (G.save.best[nm.id] || 0) : null;
    if (pid !== promptId) {
      promptId = pid;
      const pr = el('prompt');
      if (nm) {
        const best = G.save.best[nm.id];
        const bestTxt = best ? (nm.type === 'speed' ? best + ' km/h' : nm.type === 'drift' ? Math.round(best).toLocaleString('en-US') + ' điểm' : nm.type === 'jump' ? best + ' m' : G.fmtTime(best)) : '';
        pr.innerHTML = `<div class="p-name">${nm.icon} ${nm.name}</div><div class="p-desc">${nm.desc}</div>${bestTxt ? `<div class="p-desc">Kỷ lục: <b>${bestTxt}</b></div>` : ''}<div class="p-key">Nhấn [E] để bắt đầu</div>`;
      }
      pr.classList.toggle('hidden', !nm);
    }
  };

  // ---------------- Minimap ----------------
  let mmLast = 0;
  U.minimap = function (car, cops, racers, traffic) {
    const now = performance.now();
    if (now - mmLast < 32) { gpsCheck(car); return; }
    mmLast = now;
    const W = G.W, ctx = mmx, S = mm.width;
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
    if (U.gps && U.gps.route) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [w, c] of [[9, '#ffffff'], [6, '#4285f4']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w / zoom; ctx.beginPath();
        U.gps.route.forEach((p, i) => { const [a, b] = W.toMap(p.x, p.z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
      }
      dot(U.gps.target.x, U.gps.target.z, 7, '#ea4335', '#fff');
    }
    for (const t of traffic) if (Math.abs(t.x - car.x) < 400 && Math.abs(t.z - car.z) < 400) dot(t.x, t.z, t.police ? 3.5 : 2.2, t.police ? '#3d7bff' : 'rgba(220,220,220,0.7)');
    if (!G.Events.active) for (const m of G.Events.markers()) dot(m.x, m.z, 6, '#' + new THREE.Color(m.def.color).getHexString(), '#fff');
    const gt = G.Events.gateTarget(); if (gt) dot(gt.x, gt.z, 7, '#00e5ff', '#fff');
    for (const r of racers) dot(r.x, r.z, 4.5, '#ffd400', '#000');
    const blink = Math.sin(performance.now() * 0.02) > 0;
    for (const c of cops) dot(c.x, c.z, 5, blink ? '#ff2040' : '#2060ff', '#fff');
    // job suspect (red) and online players (cops blue, wanted red, others yellow)
    for (const b of G.Jobs ? G.Jobs.bodies() : []) dot(b.x, b.z, 6, blink ? '#ff2040' : '#ff8a00', '#fff');
    for (const b of G.Net ? G.Net.bodies() : []) dot(b.x, b.z, 5.5, b.isCop ? (blink ? '#ff2040' : '#2060ff') : (b.wanted ? '#ff2040' : '#ffd400'), '#fff');
    ctx.restore();
    // clamp off-screen important targets to the rim
    // player arrow
    ctx.save(); ctx.translate(S / 2, S / 2);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath();
    ctx.fillStyle = '#28ff8a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    gpsCheck(car);
  };
  function gpsCheck() { /* arrival + re-routing live in G.Nav.update */ }

  // ---------------- Big map (Google-Maps style: zoom, pan, tap to route) ----------------
  // view: centre (cx,cz) in world metres, k = screen px per metre
  const bm = { cx: 0, cz: 0, k: 0.3, drag: null, moved: false, sel: null };
  let bmView = null;
  U.mapOpen = false;
  U.toggleMap = function (on) {
    U.mapOpen = on === undefined ? !U.mapOpen : on;
    $('bigmap').classList.toggle('hidden', !U.mapOpen);
    if (U.mapOpen) {
      const F = G.Game.focus ? G.Game.focus() : G.Game.player;
      bm.cx = F.x; bm.cz = F.z; bm.k = Math.min(innerWidth, innerHeight) / 1400;
      renderPlaces();
      showCard();
      drawBigMap();
    }
  };
  function bmInit() {
    const cv = $('bigmapCanvas');
    cv.addEventListener('pointerdown', (e) => { bm.drag = { x: e.clientX, y: e.clientY, cx: bm.cx, cz: bm.cz }; bm.moved = false; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!bm.drag) return;
      const dx = e.clientX - bm.drag.x, dy = e.clientY - bm.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) bm.moved = true;
      if (bm.moved) { bm.cx = bm.drag.cx - dx / bm.k; bm.cz = bm.drag.cz - dy / bm.k; drawBigMap(); }
    });
    cv.addEventListener('pointerup', (e) => { const d = bm.drag; bm.drag = null; if (d && !bm.moved && e.button === 0) onMapClick(e); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); clearRoute(); });
    $('bmZoomIn').onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 1.4);
    $('bmZoomOut').onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 0.7);
    $('bmMe').onclick = () => { const F = G.Game.focus(); bm.cx = F.x; bm.cz = F.z; drawBigMap(); };
    $('bmClose').onclick = () => U.toggleMap(false);
    $('bmGo').onclick = () => U.toggleMap(false);
    $('bmClear').onclick = clearRoute;
    window.addEventListener('resize', () => { if (U.mapOpen) drawBigMap(); });
  }
  function clearRoute() {
    if (G.Nav.active && G.Nav.active.keep) { U.toast('Đang làm nhiệm vụ — không thể xoá chỉ đường'); return; }
    G.Nav.clear(); showCard(); drawBigMap();
  }
  function zoomAt(sx, sy, f) {
    const wx = bm.cx + (sx - innerWidth / 2) / bm.k, wz = bm.cz + (sy - innerHeight / 2) / bm.k;
    bm.k = G.clamp(bm.k * f, 0.08, 4);
    bm.cx = wx - (sx - innerWidth / 2) / bm.k; bm.cz = wz - (sy - innerHeight / 2) / bm.k;
    drawBigMap();
  }
  function renderPlaces() {
    $('bmEvents').innerHTML = G.Nav.places().map((p, i) => `<button class="bm-place" data-i="${i}"><span>${p.icon}</span>${p.name}</button>`).join('');
    $('bmEvents').querySelectorAll('.bm-place').forEach((b) => {
      b.onclick = () => { const p = G.Nav.places()[+b.dataset.i]; routeTo(p.x, p.z, p.name); bm.cx = p.x; bm.cz = p.z; drawBigMap(); };
    });
  }
  function routeTo(x, z, name) {
    if (G.Nav.active && G.Nav.active.keep) { U.toast('Đang làm nhiệm vụ — chỉ đường đã được đặt sẵn'); return; }
    G.Nav.set({ x, z }, { name, silent: true });
    showCard(); drawBigMap();
  }
  function showCard() {
    const A = G.Nav.active;
    $('bmCard').classList.toggle('hidden', !A);
    if (!A) return;
    const spd = Math.max(G.Game.focus().speed || 0, 14), eta = Math.round(A.len / spd);
    $('bmCardName').textContent = '📍 ' + A.name;
    $('bmCardInfo').textContent = G.Nav.fmtDist(A.len) + ' • khoảng ' + (eta >= 60 ? Math.round(eta / 60) + ' phút' : eta + ' giây') + (G.Game.onFoot ? ' (đi bộ: ' + Math.ceil(A.len / 4.5 / 60) + ' phút)' : '');
  }
  function drawBigMap() {
    const cv = $('bigmapCanvas'); if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
    const ctx = cv.getContext('2d'), src = G.W.mapCanvas, M = G.W.MAP, k = bm.k, W2 = cv.width / 2, H2 = cv.height / 2;
    const P = (x, z) => [W2 + (x - bm.cx) * k, H2 + (z - bm.cz) * k];
    bmView = { P };
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, cv.width, cv.height);
    const [ox, oy] = P(M.x0, M.z0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src, ox, oy, src.width / M.s * k, src.height / M.s * k);
    // street names when zoomed in
    if (k > 0.55) {
      ctx.font = '600 12px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const L = G.W.lines;
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.strokeStyle = 'rgba(10,14,24,0.85)'; ctx.lineWidth = 3;
      L.forEach((c, i) => {
        for (let j = 0; j < L.length - 1; j += 2) {
          const mid = (L[j] + L[j + 1]) / 2;
          let [a, b] = P(c, mid); if (a > -50 && a < cv.width + 50 && b > -50 && b < cv.height + 50) { ctx.save(); ctx.translate(a, b); ctx.rotate(Math.PI / 2); ctx.strokeText(G.Nav.streetAt(c, mid), 0, 0); ctx.fillText(G.Nav.streetAt(c, mid), 0, 0); ctx.restore(); }
          [a, b] = P(mid, c); if (a > -50 && a < cv.width + 50 && b > -50 && b < cv.height + 50) { ctx.strokeText(G.Nav.streetAt(mid, c), a, b); ctx.fillText(G.Nav.streetAt(mid, c), a, b); }
        }
        void i;
      });
    }
    ctx.fillStyle = '#ffd400';
    for (const c of G.Events.coins) if (!c.got) { const [a, b] = P(c.x, c.z); ctx.beginPath(); ctx.arc(a, b, 2.5, 0, 7); ctx.fill(); }
    // route: white casing + Google-blue line
    const A = G.Nav.active;
    if (A && A.route.length > 1) {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [w, c] of [[Math.max(7, k * 14), '#ffffff'], [Math.max(4, k * 9), '#4285f4']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
        A.route.forEach((p, i) => { const [a, b] = P(p.x, p.z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
      }
    }
    // places + events
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of G.Nav.places()) {
      const [a, b] = P(p.x, p.z);
      ctx.beginPath(); ctx.arc(a, b, 11, 0, 7); ctx.fillStyle = p.event ? 'rgba(255,45,149,0.9)' : 'rgba(255,255,255,0.92)'; ctx.fill();
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(p.icon, a, b + 1);
      if (k > 0.35 || !p.event) { ctx.font = '700 12px "Chakra Petch", sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,8,14,0.9)'; ctx.strokeText(p.name, a, b + 20); ctx.fillStyle = '#fff'; ctx.fillText(p.name, a, b + 20); }
    }
    // destination pin
    if (A) {
      const [a, b] = P(A.target.x, A.target.z);
      ctx.save(); ctx.translate(a, b);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-4, -10, -13, -16, -13, -26); ctx.arc(0, -26, 13, Math.PI, 0); ctx.bezierCurveTo(13, -16, 4, -10, 0, 0);
      ctx.fillStyle = '#ea4335'; ctx.fill(); ctx.strokeStyle = '#7a1a12'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -26, 5, 0, 7); ctx.fillStyle = '#7a1a12'; ctx.fill();
      ctx.restore();
    }
    // me (blue dot with heading cone, Google style)
    const F = G.Game.focus ? G.Game.focus() : G.Game.player;
    const [a, b] = P(F.x, F.z);
    ctx.save(); ctx.translate(a, b); ctx.rotate(Math.PI - F.heading);
    const gr = ctx.createLinearGradient(0, 0, 0, -40); gr.addColorStop(0, 'rgba(66,133,244,0.55)'); gr.addColorStop(1, 'rgba(66,133,244,0)');
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(a, b, 9, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(a, b, 6.5, 0, 7); ctx.fillStyle = '#4285f4'; ctx.fill();
    // scale bar
    const m = [50, 100, 200, 500, 1000, 2000].find((v) => v * k > 70) || 2000;
    ctx.fillStyle = 'rgba(8,11,22,0.8)'; ctx.fillRect(cv.width - 150, cv.height - 40, 136, 26);
    ctx.fillStyle = '#fff'; ctx.fillRect(cv.width - 140, cv.height - 22, m * k, 3);
    ctx.font = '600 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(m >= 1000 ? m / 1000 + ' km' : m + ' m', cv.width - 140, cv.height - 31);
  }
  function onMapClick(e) {
    if (!bmView) return;
    const x = bm.cx + (e.clientX - innerWidth / 2) / bm.k, z = bm.cz + (e.clientY - innerHeight / 2) / bm.k;
    // clicked a place icon?
    for (const p of G.Nav.places()) { const [a, b] = bmView.P(p.x, p.z); if (Math.hypot(a - e.clientX, b - e.clientY) < 14) { routeTo(p.x, p.z, p.name); return; } }
    routeTo(x, z);
  }
  U.mapRefresh = () => { if (U.mapOpen) { showCard(); drawBigMap(); } };
  // kept for older callers (admin teleport, events): route to a point
  U.setGps = function (target, opts) { G.Nav.set(target, opts); };

  // ---------------- Quick actions (HUD bar, hotkeys, pause menu) ----------------
  const G_ = () => G.Game;
  const playing = () => G_() && G_().state === 'play';
  function toggleFoot() {
    const Gm = G_();
    if (!Gm.toggleVehicle) { U.toast('Chức năng xuống xe chưa sẵn sàng'); return; }
    Gm.toggleVehicle();
    syncState();
  }
  function quickAction(act) {
    if (!playing()) return;
    const Gm = G_();
    if (Gm.paused && act !== 'menu' && act !== 'exit') Gm.togglePause(false);
    if (U.mapOpen && act !== 'map') U.toggleMap(false);
    if (switcherOpen && act !== 'switch') U.closeSwitcher();
    if (G.Audio.ui) G.Audio.ui();
    switch (act) {
      case 'foot': toggleFoot(); break;
      case 'switch': switcherOpen ? U.closeSwitcher() : U.openSwitcher(); break;
      case 'garage': Gm.garage ? Gm.closeGarage() : Gm.openGarage(); break;
      case 'map': if (!Gm.garage && !Gm.simPaused) U.toggleMap(); break;
      case 'menu': if (!Gm.garage && !Gm.simPaused) Gm.togglePause(); break;
      case 'exit': U.exitToTitle(); break;
      case 'mode': G.Jobs.openMenu(); break;
    }
  }
  // leave the open world for the title screen (asks first when an event would be lost)
  U.exitToTitle = function () {
    const Gm = G_();
    const go = () => {
      if (G.Events.active) G.Events.abort(true);
      if (G.Jobs && G.Jobs.mode) G.Jobs.end(true);
      if (G.Net && G.Net.connected) G.Net.leave();
      if (Gm.paused) Gm.togglePause(false);
      if (Gm.garage) Gm.closeGarage();
      U.closeSwitcher(true); U.toggleMap(false);
      $('results').classList.add('hidden'); Gm.resume();
      G.persist();
      Gm.toTitle();
    };
    if (G.Events.active) U.confirm('THOÁT RA MÀN HÌNH CHÍNH?', 'Sự kiện "' + G.Events.active.def.name + '" đang diễn ra sẽ bị huỷ và không có thưởng.', go);
    else go();
  };
  // periodic (4 Hz) state sync: labels that depend on other modules' state
  let lastFoot = null, lastFx = null;
  function syncState() {
    const Gm = G_(); if (!Gm) return;
    const foot = !!Gm.onFoot;
    if (foot !== lastFoot) {
      lastFoot = foot;
      $('qbFoot').querySelector('i').textContent = foot ? '🚗' : '🚶';
      $('qbFootTxt').textContent = foot ? 'LÊN XE' : 'XUỐNG XE';
      $('qbFoot').title = foot ? 'Lên xe (F)' : 'Xuống xe (F)';
      const tf = $('tFoot'); if (tf) tf.textContent = foot ? '🚗 LÊN' : '🚶 XUỐNG';
      $('hud').classList.toggle('on-foot', foot);
    }
    $('qbFoot').classList.toggle('hidden', !Gm.toggleVehicle);
    const busy = !!(G.Events.active || (G.Police && G.Police.active));
    document.querySelectorAll('#qbar [data-act=switch], #qbar [data-act=garage]').forEach((b) => b.classList.toggle('off', busy));
    applyFxClass();
  }
  // expensive glass effects (backdrop blur over the live canvas) only on high/ultra
  function applyFxClass() {
    const q = G.save && G.save.settings ? G.save.settings.quality : 'high';
    const hi = q === 'high' || q === 'ultra';
    if (hi !== lastFx) { lastFx = hi; document.body.classList.toggle('fx-hi', hi); }
  }

  // ---------------- Quick car switcher ----------------
  let switcherOpen = false, csSel = 0, csIds = [];
  U.switcherOpen = () => switcherOpen;
  U.openSwitcher = function () {
    const Gm = G_();
    if (!playing() || Gm.garage) return;
    if (G.Events.active) { U.toast('Không thể đổi xe khi đang trong sự kiện'); return; }
    if (G.Jobs && G.Jobs.mode) { U.toast('Kết thúc ca ' + G.Jobs.label() + ' (J) trước khi đổi xe'); return; }
    if (G.Net && G.Net.connected) { U.toast('Đổi xe trong phòng online: rời phòng hoặc chọn lại vai'); return; }
    if (G.Police && G.Police.active) { U.toast('🚨 Cắt đuôi cảnh sát trước khi đổi xe!'); return; }
    if (!Gm.onFoot && Gm.player && Gm.player.speed > 12) { U.toast('Giảm tốc để đổi xe'); return; }
    if (U.mapOpen) U.toggleMap(false);
    switcherOpen = true;
    csIds = G.CARS.filter((c) => G.save.owned.includes(c.id)).map((c) => c.id);
    csSel = Math.max(0, csIds.indexOf(G.save.selected));
    renderSwitcher();
    $('carSwitch').classList.remove('hidden');
    Gm.pauseSim(true);
  };
  U.closeSwitcher = function (silent) {
    if (!switcherOpen) return;
    switcherOpen = false;
    $('carSwitch').classList.add('hidden');
    if (!silent || G_().state === 'play') G_().pauseSim(false);
  };
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  function renderSwitcher() {
    const cur = G.save.selected, inJacked = G_().player && G_().player.jacked;
    $('csCount').textContent = 'Đã sở hữu ' + csIds.length + '/' + G.CARS.length + ' xe';
    $('csList').innerHTML = csIds.map((id, i) => {
      const c = G.carById(id), col = G.save.colors[id] || 0, isCur = id === cur && !inJacked;
      return `<div class="cs-item ${isCur ? 'cur' : ''} ${i === csSel ? 'sel' : ''}" data-i="${i}">
        <span class="n">${i < 9 ? i + 1 : ''}</span>
        <div class="car" style="background:linear-gradient(160deg, ${hex(c.colors[col])} 0%, ${hex(c.colors[col])} 55%, #0b0e18 140%)"></div>
        <div class="cls">HẠNG ${c.cls} • ${c.brand}</div><div class="nm">${c.name}</div>
        <div class="tag">${isCur ? '✔ ĐANG LÁI' : ''}</div>
        <div class="dots">${c.colors.map((k, j) => `<i class="${j === col ? 'on' : ''}" data-c="${j}" style="background:${hex(k)}"></i>`).join('')}</div>
      </div>`;
    }).join('');
    $('csList').querySelectorAll('.cs-item').forEach((it) => {
      it.onclick = (e) => {
        const i = +it.dataset.i, dot = e.target.closest('[data-c]');
        if (dot) { G.save.colors[csIds[i]] = +dot.dataset.c; G.persist(); }
        pickCar(i, !dot);
      };
    });
    const selEl = $('csList').children[csSel];
    if (selEl && selEl.scrollIntoView) selEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  // switch instantly to owned car #i (paint changes keep the switcher open)
  function pickCar(i, close) {
    const id = csIds[i]; if (!id) return;
    csSel = i;
    const Gm = G_(), changed = id !== G.save.selected || (Gm.player && (Gm.player.jacked || Gm.player.spec.id !== id));
    G.save.selected = id; G.persist();
    Gm.previewCar(id);
    if (G.Audio.ui) G.Audio.ui();
    if (close) { U.closeSwitcher(); if (changed) U.toast('🚗 ' + G.carById(id).name, 1400); }
    else renderSwitcher();
  }

  // ---------------- Confirm dialog ----------------
  let cfCb = null, cfHeld = false;
  U.confirm = function (title, msg, onYes) {
    cfCb = onYes;
    // freeze the world while the player decides
    const Gm = G_(); cfHeld = !!(Gm && Gm.state === 'play' && !Gm.simPaused && !Gm.paused);
    if (cfHeld) Gm.pauseSim(true);
    $('cfTitle').textContent = title; $('cfMsg').textContent = msg;
    $('confirmBox').classList.remove('hidden');
  };
  const confirmOpen = () => !$('confirmBox').classList.contains('hidden');
  function closeConfirm(yes) {
    $('confirmBox').classList.add('hidden');
    const cb = cfCb; cfCb = null;
    if (cfHeld) { cfHeld = false; G_().pauseSim(false); }
    if (yes && cb) cb();
  }

  // ---------------- Hotkeys owned by the UI ----------------
  // (driving keys, E/G/M/Esc live in main.js; here: V/Tab switcher, dialogs, results)
  function onKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.repeat) return;
    const k = e.code;
    if (confirmOpen()) {
      if (k === 'Escape') { G.input.consume('Escape'); closeConfirm(false); }
      else if (k === 'Enter' || k === 'NumpadEnter') { e.preventDefault(); closeConfirm(true); }
      return;
    }
    const Gm = G_(); if (!Gm || Gm.state !== 'play') return;
    if (resultsOpen()) {
      if (k === 'Enter' || k === 'NumpadEnter') { e.preventDefault(); closeResults(); }
      else if (k === 'KeyR' && G.Events.lastDef) { G.input.consume('KeyR'); retryEvent(); }
      return;
    }
    if (switcherOpen) {
      const n = csIds.length;
      if (k === 'Escape' || k === 'KeyV' || k === 'Tab') { e.preventDefault(); G.input.consume('Escape'); U.closeSwitcher(); }
      else if (k === 'ArrowRight' || k === 'KeyD') { csSel = (csSel + 1) % n; renderSwitcher(); }
      else if (k === 'ArrowLeft' || k === 'KeyA') { csSel = (csSel - 1 + n) % n; renderSwitcher(); }
      else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') { e.preventDefault(); pickCar(csSel, true); }
      else if (/^Digit[1-9]$/.test(k) || /^Numpad[1-9]$/.test(k)) { const i = +k.slice(-1) - 1; if (i < n) pickCar(i, true); }
      else if (k === 'KeyG') { G.input.consume('KeyG'); U.closeSwitcher(); Gm.openGarage(); }
      return;
    }
    if (Gm.paused || Gm.simPaused || Gm.garage || U.mapOpen) return;
    if (k === 'KeyV' || k === 'Tab') { e.preventDefault(); U.openSwitcher(); }
  }

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
    $('gOwned').textContent = G.save.owned.length + '/' + G.CARS.length + ' xe';
    $('gStrip').innerHTML = G.CARS.map((c, i) => `<div class="g-card ${i === gIdx ? 'on' : ''}" data-i="${i}"><div class="cls">HẠNG ${c.cls}</div><div class="nm">${c.name}</div><div class="pr ${G.save.owned.includes(c.id) ? 'own' : ''}">${G.save.owned.includes(c.id) ? (G.save.selected === c.id ? '✔ ĐANG DÙNG' : 'ĐÃ SỞ HỮU') : G.fmtMoney(c.price)}</div></div>`).join('');
    $('gStrip').querySelectorAll('.g-card').forEach((el) => el.onclick = () => { gIdx = +el.dataset.i; G.Audio.ui(); G.Game.previewCar(G.CARS[gIdx].id); renderGarage(); });
  }
  U.garageKey = function (dir) { gIdx = (gIdx + dir + G.CARS.length) % G.CARS.length; G.Game.previewCar(G.CARS[gIdx].id); renderGarage(); };
  return U;
})();
