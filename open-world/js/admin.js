// ================================================================
//  Admin panel (G.Admin) — only for accounts with role 'admin'.
//  Open with F2 or ` (backtick), or the floating ADMIN button.
//  Cheats hook the game from the outside (wrapping Vehicle.update,
//  G.collideBodies and G.Police.update) so main.js stays untouched.
// ================================================================
'use strict';

G.Admin = (function () {
  const AD = { open: false, god: false, nitro: false, noPolice: false, freeze: false, mult: 1, debug: false };
  let root = null, fab = null, dbg = null, tab = 'player', mapView = null, frozenScale = 1;
  const $ = (s) => root.querySelector(s);
  const P = () => G.Game && G.Game.player;
  const ok = () => G.Auth && G.Auth.isAdmin();
  const toast = (t, ms) => { if (G.UI && G.UI.toast) G.UI.toast(t, ms); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- Hooks (installed once, inert unless toggled) ----------------
  function applyMult(v) {
    if (!v || !v.perf) return;
    if (v.perf._admMul === AD.mult) return;
    const base = G.carPerf(v.spec, v.up);
    v.perf = Object.assign(base, { maxSpeed: base.maxSpeed * AD.mult, accel: base.accel * AD.mult, _admMul: AD.mult });
  }
  function installHooks() {
    const VP = G.Vehicle.prototype, vUpd = VP.update;
    VP.update = function (dt) {
      if (this === P() && this.isPlayer) {
        if (AD.mult !== 1 || (this.perf && this.perf._admMul)) applyMult(this);
        if (AD.nitro) this.nitro = this.perf.nitroCap;
      }
      const r = vUpd.call(this, dt);
      if (AD.god && this === P() && this.isPlayer) this.impact = Math.min(this.impact, 6.9); // no crash shake / sparks
      return r;
    };
    // god mode: the player car is effectively immovable in car-vs-car contacts (no slowdown)
    const cb = G.collideBodies;
    G.collideBodies = function (bodies) {
      const p = P();
      if (!AD.god || !p || bodies.indexOf(p) < 0) return cb(bodies);
      const m = p.mass; p.mass = 1e9;
      try { return cb(bodies); } finally { p.mass = m; }
    };
    const PO = G.Police, pUpd = PO.update, addHeat = PO.addHeat;
    PO.update = function (dt, player) {
      if (AD.noPolice) { if (PO.active) PO.end(); PO.cooldown = 9999; }
      if (AD.god) PO.bust = 0;
      const r = pUpd.call(PO, dt, player);
      if (AD.god && r && r.busted) return null; // safety net
      return r;
    };
    PO.addHeat = function (v, pl) { if (AD.noPolice) return; return addHeat.call(PO, v, pl); };
  }

  // ---------------- Actions ----------------
  const persist = () => G.persist();
  function refreshCar() { const p = P(); if (p) { G.Game.previewCar(G.save.selected); } }
  AD.addMoney = (n) => { G.save.cash = Math.max(0, Math.round(G.save.cash + n)); persist(); return G.fmtMoney(G.save.cash); };
  AD.setMoney = (n) => { G.save.cash = Math.max(0, Math.round(n)); persist(); return G.fmtMoney(G.save.cash); };
  AD.unlockAll = () => { G.save.owned = G.CARS.map((c) => c.id); persist(); };
  AD.maxUpgrades = () => {
    G.CARS.forEach((c) => Object.assign(G.upg(c.id), { engine: 5, handling: 5, nitro: 5 }));
    persist();
    const p = P(); if (p && p.owned) { p.setUpgrades(G.upg(p.spec.id)); p.nitro = p.perf.nitroCap; }
  };
  AD.resetProgress = () => {
    const keep = G.save.settings, hour = G.save.hour, prevQ = keep.quality;
    const fresh = G.defaultSave(); fresh.settings = keep; fresh.hour = hour;
    Object.keys(G.save).forEach((k) => delete G.save[k]);
    Object.assign(G.save, fresh);
    persist();
    if (G.Auth.refreshGame) G.Auth.refreshGame(prevQ);
  };
  AD.collectCoins = (reward) => {
    const have = new Set(G.save.coins); let n = 0;
    G.Events.coins.forEach((c, i) => { c.got = true; if (!have.has(i)) { G.save.coins.push(i); n++; } });
    if (reward) G.save.cash += n * 250;
    persist(); return n;
  };
  AD.resetCoins = () => { G.save.coins = []; G.Events.coins.forEach((c) => { c.got = false; }); persist(); };
  AD.setGod = (b) => { AD.god = !!b; if (AD.god && G.Police) G.Police.bust = 0; };
  AD.setNitro = (b) => { AD.nitro = !!b; };
  AD.setMult = (m) => { AD.mult = G.clamp(+m || 1, 0.25, 5); applyMult(P()); };
  AD.setNoPolice = (b) => {
    AD.noPolice = !!b;
    if (AD.noPolice) { if (G.Police.active) G.Police.end(); G.Police.cooldown = 9999; }
    else G.Police.cooldown = 3;
  };
  AD.pursuit = (lvl) => {
    if (G.Game.state !== 'play') return 'Hãy vào chơi (CHƠI) trước';
    if (G.Events.active) return 'Đang trong sự kiện';
    AD.setNoPolice(false); G.Police.cooldown = 0;
    if (G.Police.active) G.Police.end();
    G.Police.startLevel(G.clamp(lvl | 0, 1, 5)); return '';
  };
  AD.endPursuit = () => { if (G.Police.active) G.Police.end(); G.Police.cooldown = 8; };
  AD.setHour = (h) => { G.save.hour = ((+h % 24) + 24) % 24; };
  AD.setTimeScale = (s) => { G.save.settings.timeScale = G.clamp(+s, 0, 60); if (s > 0) AD.freeze = false; persist(); };
  AD.setFreeze = (b) => {
    if (b && !AD.freeze) { frozenScale = G.save.settings.timeScale || 1; G.save.settings.timeScale = 0; }
    else if (!b && AD.freeze) G.save.settings.timeScale = frozenScale || 1;
    AD.freeze = !!b; persist();
  };
  AD.teleport = (x, z, heading, snap) => {
    const Gm = G.Game; if (!Gm.player) return;
    let h = heading === undefined ? Gm.player.heading : heading;
    if (snap || G.W.pointBlocked(x, z)) { const p = G.W.nearestRoadPose(x, z, h); x = p.x; z = p.z; h = p.heading; }
    if (Gm.onFoot && Gm.char) { Gm.char.setPose(x, z, h); }
    else Gm.player.setPose(x, z, h);
    if (G.Police.active) G.Police.end();
    toast('📍 Dịch chuyển tới (' + Math.round(x) + ', ' + Math.round(z) + ')', 1500);
  };
  AD.places = function () {
    const W = G.W, C = G.CFG, R = W.RUNWAY, PD = W.PAD;
    const list = [
      { n: '🏙️ Trung tâm thành phố', x: 0, z: 60, h: 0, snap: true },
      { n: '✈️ Đường băng', x: 0, z: R.z1 - 40, h: Math.PI },
      { n: '🛹 Bãi stunt', x: PD.x0 + 30, z: (PD.z0 + PD.z1) / 2, h: Math.PI / 2 },
      { n: '🏖️ Bãi biển', x: 0, z: W.BEACH_Z, h: Math.PI / 2 },
      { n: '🛣️ Cao tốc vành đai', x: 0, z: -C.RING, h: Math.PI / 2 },
    ];
    for (const m of G.Events.markers()) {
      const d = m.def, h = Math.atan2(d.dir.x - d.start.x, d.dir.z - d.start.z);
      list.push({ n: d.icon + ' ' + d.name, x: m.x - Math.sin(h) * 14, z: m.z - Math.cos(h) * 14, h });
    }
    return list;
  };
  AD.spawnCar = (id) => {
    const spec = G.carById(id); if (!spec) return;
    if (G.Game.onFoot) return 'Hãy lên xe trước';
    if (G.Game.garage) return 'Đóng gara trước';
    G.Game.previewCar(spec.id);
    applyMult(P()); return '';
  };
  AD.setTraffic = (n) => { G.Traffic.setCount(G.clamp(n | 0, 0, 80)); };
  AD.setQuality = (q) => {
    if (!G.QUALITY[q]) return;
    G.save.settings.quality = q; G.R.applyQuality(); if (G.FX && G.FX.resize) G.FX.resize();
    G.Traffic.setCount(G.QUALITY[q].traffic); persist();
  };
  AD.setDebug = (b) => {
    AD.debug = !!b;
    if (!dbg) { dbg = document.createElement('div'); dbg.className = 'adm-dbg hidden'; document.body.appendChild(dbg); }
    dbg.classList.toggle('hidden', !AD.debug);
    // renderer.info normally resets per render() call (post-processing passes): accumulate a whole frame instead
    if (G.R.renderer) { G.R.renderer.info.autoReset = !AD.debug; G.R.renderer.info.reset(); }
  };

  // ---------------- UI ----------------
  const TABS = [['player', 'NGƯỜI CHƠI'], ['world', 'THẾ GIỚI'], ['map', 'DỊCH CHUYỂN'], ['users', 'TÀI KHOẢN']];
  function build() {
    if (root) return;
    root = document.createElement('div'); root.className = 'adm hidden'; root.id = 'adminPanel';
    root.innerHTML = `
      <div class="adm-head"><div><b>🛡️ ADMIN</b><small class="adm-who"></small></div><button type="button" class="adm-x" data-a="close" title="Đóng (F2)">✕</button></div>
      <div class="adm-tabs">${TABS.map(([k, t]) => `<button type="button" data-tab="${k}">${t}</button>`).join('')}</div>
      <div class="adm-body"></div>`;
    document.body.appendChild(root);
    // keep typing / clicks inside the panel away from the game
    root.addEventListener('keydown', (e) => { const t = e.target.tagName; if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') e.stopPropagation(); });
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
  }
  function msg(sel, text, good) { const m = root.querySelector(sel); if (m) { m.textContent = text; m.className = 'adm-msg ' + (text ? (good ? 'ok' : 'err') : ''); } }
  const tog = (key, label, on) => `<label class="adm-tog"><span>${label}</span><input type="checkbox" data-t="${key}" ${on ? 'checked' : ''}></label>`;
  const btn = (a, label, cls, extra) => `<button type="button" class="b ${cls || ''}" data-a="${a}" ${extra || ''}>${label}</button>`;
  function render() {
    if (!root) return;
    root.querySelectorAll('.adm-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('.adm-who').textContent = ' ' + (G.Auth.displayName ? G.Auth.displayName() : '');
    const body = $('.adm-body'), s = G.save;
    if (tab === 'player') {
      const cur = P() ? P().spec.id : s.selected;
      body.innerHTML = `
        <div class="adm-sec"><h4>Tiền — hiện có <span class="adm-cash">${G.fmtMoney(s.cash)}</span></h4>
          <div class="adm-row"><input type="number" class="adm-amt" value="100000" step="1000">${btn('addMoney', '+ THÊM')}${btn('setMoney', 'ĐẶT')}</div>
          <div class="adm-row">${btn('money:10000', '+10K', 'grow')}${btn('money:100000', '+100K', 'grow')}${btn('money:1000000', '+1M', 'grow')}${btn('money:-1', '= 0', 'warn grow')}</div></div>
        <div class="adm-sec"><h4>Tiến trình</h4>
          <div class="adm-grid">${btn('unlockAll', '🔓 MỞ KHOÁ TẤT CẢ XE')}${btn('maxUpg', '⬆️ NÂNG CẤP TỐI ĐA')}${btn('coins', '⭐ NHẶT HẾT XU')}${btn('resetCoins', '↺ ĐẶT LẠI XU', 'warn')}</div>
          <div class="adm-row" style="margin-top:6px">${btn('reset', '⚠️ XOÁ TIẾN TRÌNH TÀI KHOẢN NÀY', 'warn grow')}</div></div>
        <div class="adm-sec"><h4>Gian lận</h4>
          ${tog('god', '🛡️ Bất tử (va chạm không giảm tốc, không bị bắt)', AD.god)}
          ${tog('nitro', '🔥 Nitro vô hạn', AD.nitro)}
          <div class="adm-row"><span>Hệ số tốc độ</span><input type="range" data-r="mult" min="0.5" max="3" step="0.1" value="${AD.mult}"><span class="adm-val" data-v="mult">×${AD.mult.toFixed(1)}</span></div></div>
        <div class="adm-sec"><h4>Lấy xe ngay (không cần sở hữu)</h4>
          <div class="adm-row"><select class="adm-car">${G.CARS.map((c) => `<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${esc(c.name)} · ${c.cls}${s.owned.includes(c.id) ? '' : ' (chưa có)'}</option>`).join('')}</select>${btn('spawn', 'LẤY XE')}</div></div>
        <div class="adm-msg adm-m1"></div>`;
    } else if (tab === 'world') {
      const q = s.settings.quality, tc = G.Traffic.cars ? G.Traffic.cars.filter((c) => !c.police).length : 0;
      body.innerHTML = `
        <div class="adm-sec"><h4>Cảnh sát ${G.Police.active ? '— ĐANG TRUY ĐUỔI cấp ' + Math.ceil(G.Police.heat) : ''}</h4>
          ${tog('noPolice', '🚫 Tắt cảnh sát', AD.noPolice)}
          <div class="adm-row">${[1, 2, 3, 4, 5].map((l) => btn('pursuit:' + l, '★'.repeat(l), 'grow', 'title="Truy nã cấp ' + l + '"')).join('')}</div>
          <div class="adm-row">${btn('endPursuit', 'KẾT THÚC TRUY ĐUỔI', 'grow')}</div></div>
        <div class="adm-sec"><h4>Thời gian</h4>
          <div class="adm-row"><span>Giờ</span><input type="range" data-r="hour" min="0" max="23.9" step="0.1" value="${s.hour.toFixed(1)}"><span class="adm-val" data-v="hour">${fmtHour(s.hour)}</span></div>
          <div class="adm-row"><span>Tốc độ</span><input type="range" data-r="tscale" min="0" max="30" step="0.5" value="${s.settings.timeScale}"><span class="adm-val" data-v="tscale">×${(+s.settings.timeScale).toFixed(1)}</span></div>
          ${tog('freeze', '⏸️ Đóng băng thời gian', AD.freeze)}
          <div class="adm-row">${[['6', '🌅 6:00'], ['12', '☀️ 12:00'], ['18.5', '🌇 18:30'], ['0', '🌙 0:00']].map(([h, t]) => btn('hour:' + h, t, 'grow')).join('')}</div></div>
        <div class="adm-sec"><h4>Giao thông & đồ hoạ</h4>
          <div class="adm-row"><span>Mật độ xe</span><input type="range" data-r="traffic" min="0" max="80" step="1" value="${tc}"><span class="adm-val" data-v="traffic">${tc}</span></div>
          <div class="adm-row"><span>Chất lượng</span><select class="adm-q">${Object.keys(G.QUALITY).map((k) => `<option value="${k}" ${k === q ? 'selected' : ''}>${k.toUpperCase()}</option>`).join('')}</select></div>
          ${tog('debug', '📊 Lớp debug (FPS, draw calls, vị trí)', AD.debug)}</div>
        <div class="adm-msg adm-m2"></div>`;
    } else if (tab === 'map') {
      body.innerHTML = `
        <div class="adm-sec"><h4>Nhấp vào bản đồ để dịch chuyển</h4><canvas class="adm-map"></canvas>
          ${tog('snap', 'Bám vào đường gần nhất', AD.snap !== false)}</div>
        <div class="adm-sec"><h4>Địa điểm</h4><div class="adm-grid">${AD.places().map((p, i) => btn('tp:' + i, esc(p.n))).join('')}</div></div>
        <div class="adm-msg adm-m3"></div>`;
      drawMap();
    } else if (tab === 'users') {
      const me = String(G.Auth.user || '').toLowerCase();
      body.innerHTML = `
        <div class="adm-sec"><h4>Đổi mật khẩu của bạn</h4>
          <div class="adm-row"><input type="password" class="adm-old" placeholder="Mật khẩu hiện tại" autocomplete="current-password"></div>
          <div class="adm-row"><input type="password" class="adm-new" placeholder="Mật khẩu mới (≥ 6 ký tự)" autocomplete="new-password"></div>
          <div class="adm-row"><input type="password" class="adm-new2" placeholder="Nhập lại mật khẩu mới" autocomplete="new-password">${btn('chpw', 'ĐỔI')}</div>
          <div class="adm-msg adm-m4"></div></div>
        <div class="adm-sec"><h4>Danh sách tài khoản</h4><div class="adm-users">${G.Auth.listAccounts().map((a) => `
          <div class="adm-user" data-u="${esc(a.id)}">
            <div class="n">${a.role === 'admin' ? '🛡️' : '👤'} ${esc(a.name)} ${a.id === me ? '<small>(bạn)</small>' : ''}</div>
            <div class="r"><span class="${a.role === 'admin' ? 'ad' : ''}">${a.role.toUpperCase()}</span> · tạo ${fmtDate(a.created)} · đăng nhập ${a.last ? fmtDate(a.last) : '—'}${a.locked ? ' · <b style="color:#ff5c7a">ĐANG KHOÁ</b>' : ''}${a.defaultPw ? ' · mật khẩu mặc định' : ''}${moneyOf(a.id)}</div>
            <div class="adm-row"><input type="password" class="adm-rpw" placeholder="Mật khẩu mới">${btn('rpw', 'ĐẶT LẠI MK')}</div>
            <div class="adm-row">${a.role === 'admin' ? btn('demote', 'HẠ QUYỀN', 'grow') : btn('promote', 'CẤP ADMIN', 'grow')}${btn('del', 'XOÁ', 'warn grow')}</div>
          </div>`).join('')}</div></div>
        <div class="adm-msg adm-m5"></div>`;
    }
  }
  function moneyOf(id) {
    try { const d = JSON.parse(localStorage.getItem(G.Auth.saveKeyFor(id))); return d ? ' · ' + G.fmtMoney(d.cash || 0) + ' · ' + (d.owned || []).length + ' xe' : ''; } catch (e) { return ''; }
  }
  const fmtHour = (h) => String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0');
  const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('vi-VN') : '—');

  function drawMap() {
    const cv = root && root.querySelector('.adm-map'); if (!cv || !G.W.mapCanvas) return;
    const src = G.W.mapCanvas, w = cv.clientWidth || 360, k = w / src.width, h = Math.round(src.height * k);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0, w, h);
    mapView = { k };
    const pt = (x, z) => { const [a, b] = G.W.toMap(x, z); return [a * k, b * k]; };
    for (const m of G.Events.markers()) {
      const [a, b] = pt(m.x, m.z); ctx.beginPath(); ctx.arc(a, b, 5, 0, 7);
      ctx.fillStyle = '#' + new THREE.Color(m.def.color).getHexString(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    const F = G.Game.focus ? G.Game.focus() : P();
    if (F) { const [a, b] = pt(F.x, F.z); ctx.beginPath(); ctx.arc(a, b, 5, 0, 7); ctx.fillStyle = '#28ff8a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function mapClick(e) {
    if (!mapView) return;
    const cv = e.target, r = cv.getBoundingClientRect(), M = G.W.MAP;
    const mx = (e.clientX - r.left) * (cv.width / r.width) / mapView.k, my = (e.clientY - r.top) * (cv.height / r.height) / mapView.k;
    const x = mx / M.s + M.x0, z = my / M.s + M.z0;
    if (G.Game.state !== 'play') { msg('.adm-m3', 'Hãy vào chơi (CHƠI) trước khi dịch chuyển'); return; }
    if (z > G.CFG.SEA_Z - 5) { msg('.adm-m3', 'Đó là biển 🌊 — chọn điểm khác'); return; }
    AD.teleport(x, z, undefined, AD.snap !== false); drawMap(); msg('.adm-m3', '');
  }

  async function onClick(e) {
    if (e.target.classList.contains('adm-map')) { mapClick(e); return; }
    const tb = e.target.closest('[data-tab]');
    if (tb) { tab = tb.dataset.tab; tb.blur(); render(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    b.blur(); // so Space (handbrake) doesn't re-click the focused button
    const [a, arg] = b.dataset.a.split(':'), u = b.closest('[data-u]'), uid = u && u.dataset.u;
    const amt = () => +(($('.adm-amt') || {}).value || 0);
    switch (a) {
      case 'close': AD.close(); return;
      case 'addMoney': AD.addMoney(amt()); break;
      case 'setMoney': AD.setMoney(amt()); break;
      case 'money': if (+arg < 0) AD.setMoney(0); else AD.addMoney(+arg); break;
      case 'unlockAll': AD.unlockAll(); toast('🔓 Đã mở khoá tất cả xe'); break;
      case 'maxUpg': AD.maxUpgrades(); toast('⬆️ Đã nâng cấp tối đa mọi xe'); break;
      case 'coins': toast('⭐ Đã nhặt ' + AD.collectCoins(true) + ' đồng xu'); break;
      case 'resetCoins': AD.resetCoins(); toast('Đã đặt lại toàn bộ đồng xu'); break;
      case 'reset': if (confirm('Xoá toàn bộ tiến trình (tiền, xe, nâng cấp, xu, kỷ lục) của tài khoản đang đăng nhập?')) { AD.resetProgress(); toast('Đã xoá tiến trình'); } break;
      case 'spawn': { const r = AD.spawnCar($('.adm-car').value); if (r) { msg('.adm-m1', r); return; } toast('🚗 ' + P().spec.name); break; }
      case 'pursuit': { const r = AD.pursuit(+arg); if (r) { msg('.adm-m2', r); return; } break; }
      case 'endPursuit': AD.endPursuit(); break;
      case 'hour': AD.setHour(+arg); break;
      case 'tp': {
        if (G.Game.state !== 'play') { msg('.adm-m3', 'Hãy vào chơi (CHƠI) trước khi dịch chuyển'); return; }
        const p = AD.places()[+arg]; if (p) AD.teleport(p.x, p.z, p.h, p.snap); drawMap(); return;
      }
      case 'chpw': {
        const r = await G.Auth.changePassword($('.adm-old').value, $('.adm-new').value, $('.adm-new2').value);
        if (r) { msg('.adm-m4', r); return; }
        render(); msg('.adm-m4', '✔ Đã đổi mật khẩu', true); return;
      }
      case 'rpw': {
        const r = await G.Auth.resetPassword(uid, u.querySelector('.adm-rpw').value);
        render(); msg('.adm-m5', r || '✔ Đã đặt lại mật khẩu cho ' + uid, !r); return;
      }
      case 'promote': case 'demote': {
        const r = G.Auth.setRole(uid, a === 'promote' ? 'admin' : 'user');
        render(); msg('.adm-m5', r || '✔ Đã cập nhật quyền của ' + uid, !r); return;
      }
      case 'del': {
        if (!confirm('Xoá tài khoản "' + uid + '" và toàn bộ dữ liệu lưu của nó?')) return;
        const r = G.Auth.deleteAccount(uid);
        render(); msg('.adm-m5', r || '✔ Đã xoá ' + uid, !r); return;
      }
      default: return;
    }
    render();
  }
  function onInput(e) {
    const r = e.target.dataset.r; if (!r) return;
    const v = +e.target.value, out = root.querySelector('[data-v="' + r + '"]');
    if (r === 'mult') { AD.setMult(v); out.textContent = '×' + v.toFixed(1); }
    else if (r === 'hour') { AD.setHour(v); out.textContent = fmtHour(v); }
    else if (r === 'tscale') { AD.setTimeScale(v); out.textContent = '×' + v.toFixed(1); const f = root.querySelector('[data-t=freeze]'); if (f) f.checked = AD.freeze; }
    else if (r === 'traffic') { out.textContent = v; }
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset.r === 'traffic') { AD.setTraffic(+t.value); return; }
    if (t.classList.contains('adm-q')) { AD.setQuality(t.value); render(); return; }
    const k = t.dataset.t; if (!k) return;
    t.blur();
    if (k === 'god') AD.setGod(t.checked);
    else if (k === 'nitro') AD.setNitro(t.checked);
    else if (k === 'noPolice') { AD.setNoPolice(t.checked); render(); }
    else if (k === 'freeze') { AD.setFreeze(t.checked); render(); }
    else if (k === 'debug') AD.setDebug(t.checked);
    else if (k === 'snap') AD.snap = t.checked;
  }

  AD.toggle = function (on) {
    on = on === undefined ? !AD.open : !!on;
    if (on && !ok()) return false;
    build();
    AD.open = on; root.classList.toggle('hidden', !on);
    if (on) render();
    return true;
  };
  AD.close = () => { if (root) { AD.open = false; root.classList.add('hidden'); } };
  // all cheats off (used when an admin logs out / another account logs in)
  AD.disableAll = function () {
    AD.close(); AD.god = AD.nitro = false; AD.setNoPolice(false); AD.setFreeze(false); AD.setDebug(false);
    if (AD.mult !== 1) AD.setMult(1);
  };

  // ---------------- Keys, floating button, per-frame jobs ----------------
  window.addEventListener('keydown', (e) => {
    const t = e.target && e.target.tagName, typing = t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT';
    if (e.code === 'F2' || (e.code === 'Backquote' && !typing)) {
      if (!ok() || (G.Auth.visible && G.Auth.visible())) return;
      e.preventDefault(); e.stopImmediatePropagation(); AD.toggle();
    } else if (e.code === 'Escape' && AD.open) { e.preventDefault(); e.stopImmediatePropagation(); AD.close(); }
  }, true);

  let fpsT = performance.now(), fpsN = 0, fps = 0, slow = 0, wasAdmin = false, calls = 0, tris = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    fpsN++; if (now - fpsT > 500) { fps = fpsN * 1000 / (now - fpsT); fpsN = 0; fpsT = now; }
    const admin = ok();
    if (wasAdmin && !admin) AD.disableAll();
    wasAdmin = admin;
    if (!fab) {
      fab = document.createElement('button'); fab.type = 'button'; fab.className = 'adm-fab hidden'; fab.textContent = '🛡️ ADMIN'; fab.title = 'Bảng quản trị (F2 hoặc `)';
      fab.onclick = () => { fab.blur(); AD.toggle(); }; document.body.appendChild(fab);
    }
    const showFab = admin && G.Game && G.Game.state === 'play' && !(G.Auth.visible && G.Auth.visible());
    if (fab.classList.contains('hidden') === showFab) fab.classList.toggle('hidden', !showFab);
    if (AD.freeze) G.save.settings.timeScale = 0;
    if (AD.nitro && P()) P().nitro = P().perf.nitroCap;
    const info = AD.debug && G.R.renderer ? G.R.renderer.info : null;
    if (info) { calls = info.render.calls; tris = info.render.triangles; info.reset(); }
    if (++slow % 15) return;
    if (AD.debug && dbg) {
      const F = G.Game.focus ? G.Game.focus() : P();
      dbg.textContent = 'FPS ' + fps.toFixed(0) + (info ? '  ·  draw ' + calls + '  ·  tri ' + (tris / 1000).toFixed(0) + 'k  ·  geo ' + info.memory.geometries + '  ·  tex ' + info.memory.textures : '') +
        '\nPR ' + (G.R.pixelRatio || 1).toFixed(2) + '  ·  ' + G.save.settings.quality + '  ·  xe ' + (G.Traffic.cars || []).length + '  ·  cảnh sát ' + (G.Police.cops || []).length + (G.Police.active ? ' (cấp ' + Math.ceil(G.Police.heat) + ')' : '') +
        (F ? '\nXYZ ' + F.x.toFixed(0) + ', ' + (F.y || 0).toFixed(1) + ', ' + F.z.toFixed(0) + '  ·  hướng ' + ((F.heading || 0) * 180 / Math.PI).toFixed(0) + '°  ·  ' + (F.speed * 3.6).toFixed(0) + ' km/h' : '') +
        '\n' + G.Game.state + (G.Game.onFoot ? ' · đi bộ' : '') + '  ·  giờ ' + fmtHour(G.save.hour) + (AD.god ? '  ·  GOD' : '') + (AD.nitro ? '  ·  ∞NOS' : '') + (AD.mult !== 1 ? '  ·  ×' + AD.mult.toFixed(1) : '');
    }
    if (AD.open && root) {
      if (tab === 'map') drawMap();
      else if (tab === 'player') { const c = root.querySelector('.adm-cash'); if (c) c.textContent = G.fmtMoney(G.save.cash); }
    }
  }

  function init() {
    if (G.Vehicle && G.collideBodies && G.Police) installHooks();
    requestAnimationFrame(tick);
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init); else init();
  return AD;
})();
