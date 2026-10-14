// ================================================================
//  Online (G.Net): open-city rooms on the Node server (namespace /city).
//  Pick a role — CẢNH SÁT (drive an interceptor, bust wanted players)
//  or DÂN THƯỜNG (your own car; speeding in the city makes you wanted).
//  The server decides wanted levels / busts; clients only send poses.
// ================================================================
'use strict';

G.Net = (function () {
  const N = { connected: false, role: 'civ', id: null, room: '', players: {} };
  let sock = null, lobby = null, board = null, chatBox = null, chatInput = null, sendT = 0, rosterT = 0;
  const remotes = new Map(); // id -> { info, v (Vehicle), char, tag, snaps: [[t,x,z,y,h,spd,foot,nos,brk]], wanted, bust }
  const scene = () => G.Game.scene();
  const $ = (s) => lobby.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const meWanted = () => (N.players[N.id] && N.players[N.id].wanted) || 0;
  N.bodies = () => { const out = []; for (const r of remotes.values()) if (r.v && r.v.mesh.visible) out.push(r.v); return out; };

  function defaultServer() {
    if (location.protocol === 'file:') return 'http://localhost:3000';
    // the Node server serves the game on /open-world; a plain static server needs the explicit address
    return location.port === '3000' || !location.port ? location.origin : location.protocol + '//' + location.hostname + ':3000';
  }
  function loadClient(server) {
    return new Promise((res, rej) => {
      if (window.io) { res(); return; }
      const s = document.createElement('script');
      s.src = server.replace(/\/$/, '') + '/socket.io/socket.io.js';
      s.onload = () => res(); s.onerror = () => rej(new Error('no-server'));
      document.head.appendChild(s);
    });
  }

  // ---------------- Lobby ----------------
  N.openLobby = function () {
    if (!lobby) {
      lobby = document.createElement('div'); lobby.id = 'netLobby'; lobby.className = 'modal hidden';
      lobby.innerHTML = `<div class="card wide net-card">
        <div class="r-title">🌐 NHIỀU NGƯỜI CHƠI</div>
        <div class="net-roles">
          <button class="mode-opt net-role" data-r="cop"><i>🚓</i><b>CẢNH SÁT</b><span>Lái xe Interceptor. Người chơi nào vi phạm (chạy quá 120 km/h trong phố, đâm xe cảnh sát) sẽ bị truy nã — đuổi theo, ép dừng trong 10 m để bắt giữ và nhận thưởng.</span></button>
          <button class="mode-opt net-role" data-r="civ"><i>🚗</i><b>DÂN THƯỜNG</b><span>Lái xe của bạn, chạy tự do cùng bạn bè. Vi phạm luật thì bị truy nã — cắt đuôi cảnh sát để nhận thưởng, bị bắt thì nộp phạt.</span></button>
        </div>
        <div class="net-form">
          <label>Tên hiển thị<input id="netName" maxlength="16" type="text"></label>
          <label>Mã phòng<input id="netRoom" maxlength="12" type="text" placeholder="CITY"></label>
          <label class="net-wide">Địa chỉ server<input id="netServer" type="text" spellcheck="false"></label>
        </div>
        <div class="net-msg" id="netMsg"></div>
        <div class="r-actions">
          <button class="btn" id="netCancel">✖ ĐÓNG</button>
          <button class="btn hidden" id="netLeave">🚪 RỜI PHÒNG</button>
          <button class="btn primary" id="netJoin">▶ VÀO PHÒNG</button>
        </div>
        <div class="net-note">Cùng một mã phòng = cùng một thành phố. Chạy server: <code>cd racing-game && npm install && npm start</code>, rồi gửi bạn bè địa chỉ <b>http://&lt;IP-máy-bạn&gt;:3000/open-world/</b></div>
      </div>`;
      document.body.appendChild(lobby);
      lobby.addEventListener('keydown', (e) => e.stopPropagation());
      lobby.querySelectorAll('.net-role').forEach((b) => { b.onclick = () => { N.role = b.dataset.r; syncRoles(); }; });
      $('#netCancel').onclick = closeLobby;
      $('#netLeave').onclick = () => { N.leave(); closeLobby(); };
      $('#netJoin').onclick = join;
      lobby.addEventListener('click', (e) => { if (e.target === lobby) closeLobby(); });
    }
    $('#netName').value = $('#netName').value || (G.Auth && G.Auth.user) || (G.Auth && G.Auth.guest ? 'Khách' + Math.floor(Math.random() * 900 + 100) : 'Tay đua');
    $('#netRoom').value = $('#netRoom').value || N.room || 'CITY';
    $('#netServer').value = $('#netServer').value || defaultServer();
    $('#netJoin').textContent = N.connected ? '✔ ĐỔI VAI' : '▶ VÀO PHÒNG';
    $('#netLeave').classList.toggle('hidden', !N.connected);
    msg(N.connected ? 'Đang ở phòng ' + N.room + ' — chọn vai khác rồi bấm ĐỔI VAI' : '');
    syncRoles();
    lobby.classList.remove('hidden');
    if (G.Game.state === 'play') G.Game.pauseSim(true);
    N.lobbyOpen = true;
  };
  function closeLobby() { if (!lobby) return; lobby.classList.add('hidden'); N.lobbyOpen = false; if (G.Game.state === 'play') G.Game.pauseSim(false); }
  function syncRoles() { lobby.querySelectorAll('.net-role').forEach((b) => b.classList.toggle('on', b.dataset.r === N.role)); }
  function msg(t, err) { const m = $('#netMsg'); m.textContent = t; m.classList.toggle('err', !!err); }

  async function join() {
    if (N.connected) { setRole(N.role); closeLobby(); return; }
    const server = $('#netServer').value.trim() || defaultServer();
    msg('Đang kết nối ' + server + ' ...');
    try { await loadClient(server); }
    catch (e) { msg('Không kết nối được server. Hãy chạy: cd racing-game && npm install && npm start (cổng 3000)', true); return; }
    if (sock) { sock.close(); sock = null; }
    sock = window.io(server.replace(/\/$/, '') + '/city', { transports: ['websocket', 'polling'], reconnectionAttempts: 3, timeout: 6000 });
    sock.on('connect_error', () => msg('Không kết nối được server ' + server, true));
    sock.on('connect', () => {
      sock.emit('join', { room: $('#netRoom').value.trim() || 'CITY', name: $('#netName').value.trim(), role: N.role, car: carId(), color: carColor() });
    });
    sock.on('join-error', (t) => msg(t, true));
    sock.on('joined', (d) => {
      N.connected = true; N.id = d.id; N.room = d.room;
      roster(d.players);
      enterRole();
      closeLobby();
      if (G.Game.state !== 'play') { G.Audio.init(); G.Game.play(); }
      G.UI.toast('🌐 Đã vào phòng ' + d.room + ' với vai ' + (N.role === 'cop' ? '🚓 CẢNH SÁT' : '🚗 DÂN THƯỜNG') + ' • Enter để chat', 3500);
    });
    sock.on('player-joined', (p) => { if (p) { N.players[p.id] = p; G.UI.toast('👋 ' + p.name + ' đã vào phòng (' + (p.role === 'cop' ? 'cảnh sát' : 'dân thường') + ')', 2200); renderBoard(); } });
    sock.on('player-left', (id) => { const p = N.players[id]; if (p) G.UI.toast('🚪 ' + p.name + ' đã rời phòng', 2000); delete N.players[id]; dropRemote(id); renderBoard(); });
    sock.on('roster', roster);
    sock.on('snap', onSnap);
    sock.on('wanted', (d) => {
      const p = N.players[d.id]; if (!p) return;
      p.wanted = d.level;
      if (d.id === N.id) { G.UI.toast('🚨 BẠN BỊ TRUY NÃ ' + '★'.repeat(d.level) + ' — ' + d.why, 2600); G.Audio.beep && G.Audio.beep(true); }
      else if (N.role === 'cop' && d.level >= 1) G.UI.toast('📻 ' + p.name + ' bị truy nã ' + '★'.repeat(d.level) + ' (' + d.why + ')', 2200);
      renderBoard();
    });
    sock.on('busted', (d) => {
      if (d.civ === N.id) { const fine = Math.min(d.fine, Math.max(0, G.save.cash)); G.save.cash -= fine; G.Audio.fail(); G.UI.toast('🚔 Bạn bị ' + d.copName + ' bắt! Nộp phạt ' + G.fmtMoney(fine), 3500); G.persist(); }
      else if (d.cop === N.id) { G.save.cash += d.reward; G.Audio.cash(); G.UI.popup('BẮT GIỮ ' + d.civName + '! +' + G.fmtMoney(d.reward), '#28ff8a'); G.persist(); }
      else G.UI.toast('🚔 ' + d.copName + ' đã bắt ' + d.civName + ' (' + '★'.repeat(d.level) + ')', 2500);
      addChat({ name: '📻', role: 'sys', text: d.copName + ' bắt giữ ' + d.civName });
    });
    sock.on('escaped', (d) => {
      if (d.civ === N.id) { G.save.cash += d.reward; G.Audio.cash(); G.UI.popup('CẮT ĐUÔI THÀNH CÔNG! +' + G.fmtMoney(d.reward), '#28ff8a'); G.persist(); }
      else G.UI.toast('💨 ' + d.name + ' đã cắt đuôi cảnh sát', 2000);
    });
    sock.on('chat', addChat);
    sock.on('disconnect', () => { if (N.connected) { G.UI.toast('⚠️ Mất kết nối server', 3000); cleanup(); } });
  }
  const carId = () => (N.role === 'cop' ? 'police' : G.save.selected);
  const carColor = () => { const s = G.carById(G.save.selected); return N.role === 'cop' ? 0x14161c : s.colors[G.save.colors[s.id] || 0]; };
  function setRole(role) {
    N.role = role;
    if (sock) sock.emit('role', { role, car: carId(), color: carColor() });
    enterRole();
    G.UI.toast('Vai mới: ' + (role === 'cop' ? '🚓 CẢNH SÁT' : '🚗 DÂN THƯỜNG'), 2000);
  }
  // cops drive a temporary interceptor; civilians their own car. No AI police online.
  function enterRole() {
    const Gm = G.Game;
    if (G.Jobs && G.Jobs.mode) G.Jobs.end(true);
    if (G.Events.active) G.Events.abort(true);
    G.Police.end(); G.Police.cooldown = 1e9;
    if (Gm.onFoot) { /* keep walking: the car follows the role when re-entering */ }
    if (N.role === 'cop') { const v = new G.Vehicle(G.POLICE_SPEC, 0x14161c, { upgrades: { engine: 3, handling: 3, nitro: 2 } }); v.job = 'net-cop'; if (!Gm.onFoot) Gm.useVehicle(v); else { Gm.useVehicle(v); v.isPlayer = false; } }
    else if (Gm.player && Gm.player.job) Gm.previewCar(G.save.selected);
  }
  N.leave = function () { if (sock) { sock.emit('leave'); sock.close(); sock = null; } cleanup(); G.UI.toast('Đã rời phòng nhiều người chơi', 2000); };
  function cleanup() {
    N.connected = false; N.players = {};
    for (const id of Array.from(remotes.keys())) dropRemote(id);
    G.Police.cooldown = 3;
    if (G.Game.player && G.Game.player.job === 'net-cop') G.Game.previewCar(G.save.selected);
    if (G.Nav.active && G.Nav.active.keep) G.Nav.clear();
    if (board) board.classList.add('hidden');
    if (chatBox) chatBox.classList.add('hidden');
    G.UI.hideMission();
  }

  // ---------------- Remote players ----------------
  function roster(list) {
    const seen = new Set();
    for (const p of list) { seen.add(p.id); const old = N.players[p.id]; N.players[p.id] = Object.assign(old || {}, p); }
    for (const id of Object.keys(N.players)) if (!seen.has(id)) { delete N.players[id]; dropRemote(id); }
    // rebuild models whose car / role changed
    for (const [id, r] of remotes) { const p = N.players[id]; if (p && (p.car !== r.car || p.role !== r.role)) dropRemote(id); }
    renderBoard();
  }
  function tagSprite(r) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const t = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(4.8, 1.2, 1); s.renderOrder = 10; s.userData = { c, t, key: '' };
    r.tag = s; scene().add(s);
  }
  function drawTag(r, p) {
    const key = p.name + p.role + r.wanted + Math.round((r.bust || 0) * 10);
    if (r.tag.userData.key === key) return; r.tag.userData.key = key;
    const { c, t } = r.tag.userData, x = c.getContext('2d');
    x.clearRect(0, 0, 256, 64);
    x.fillStyle = p.role === 'cop' ? 'rgba(20,60,160,0.85)' : (r.wanted ? 'rgba(170,20,40,0.85)' : 'rgba(10,14,24,0.8)');
    x.beginPath(); x.roundRect ? x.roundRect(8, 6, 240, 34, 12) : x.rect(8, 6, 240, 34); x.fill();
    x.font = '700 22px "Chakra Petch", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    x.fillText((p.role === 'cop' ? '🚓 ' : '') + p.name, 128, 24);
    if (r.wanted) { x.fillStyle = '#ffd400'; x.font = '700 20px sans-serif'; x.fillText('★'.repeat(r.wanted), 128, 54); }
    t.needsUpdate = true;
  }
  function ensureRemote(id) {
    let r = remotes.get(id); const p = N.players[id];
    if (r || !p) return r;
    const spec = p.car === 'police' || p.role === 'cop' ? G.POLICE_SPEC : G.carById(p.car);
    const v = new G.Vehicle(spec, p.color || 0xffffff, {});
    v.fixed = true; v.remoteId = id; v.isRemote = true; v.isCop = p.role === 'cop';
    // a civilian ramming me while I'm a cop: tell the server (it double-checks positions)
    v.onHit = (o, imp) => { if (o === G.Game.player && imp > 5 && N.role === 'cop' && p.role === 'civ' && sock) sock.emit('rammed', id); };
    scene().add(v.mesh);
    r = { v, car: p.car, role: p.role, snaps: [], wanted: 0, bust: 0, char: null };
    tagSprite(r);
    remotes.set(id, r);
    return r;
  }
  function dropRemote(id) {
    const r = remotes.get(id); if (!r) return;
    scene().remove(r.v.mesh); if (r.tag) scene().remove(r.tag); if (r.char) r.char.dispose();
    remotes.delete(id);
  }
  function onSnap(list) {
    const now = performance.now();
    for (const s of list) {
      const [id, x, z, y, h, spd, foot, nos, brk, wanted, bust] = s;
      const p = N.players[id]; if (p) p.wanted = wanted;
      if (id === N.id) { N.myBust = bust; continue; }
      const r = ensureRemote(id); if (!r) continue;
      r.snaps.push([now, x, z, y, h, spd, foot, nos, brk]); if (r.snaps.length > 6) r.snaps.shift();
      r.wanted = wanted; r.bust = bust;
    }
    rosterT += 1;
  }
  // render remotes ~120 ms in the past, interpolating between snapshots
  function updateRemotes(dt) {
    const t = performance.now() - 120;
    for (const [id, r] of remotes) {
      const S = r.snaps; if (!S.length) continue;
      let a = S[0], b = S[S.length - 1];
      for (let i = 0; i < S.length - 1; i++) if (S[i][0] <= t && S[i + 1][0] >= t) { a = S[i]; b = S[i + 1]; break; }
      const k = b[0] > a[0] ? G.clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 1;
      const x = G.lerp(a[1], b[1], k), z = G.lerp(a[2], b[2], k), y = G.lerp(a[3], b[3], k), h = a[4] + G.wrapAngle(b[4] - a[4]) * k;
      const foot = !!b[6], v = r.v;
      v.vx = (x - v.x) / Math.max(dt, 1e-3); v.vz = (z - v.z) / Math.max(dt, 1e-3);
      if (Math.hypot(v.vx, v.vz) > 150) { v.vx = v.vz = 0; }
      v.x = x; v.z = z; v.y = y; v.heading = h; v.nitroOn = !!b[7]; v.brakeLight = b[8] ? 1 : 0; v.grounded = true;
      v.input.throttle = b[5] > 1 ? 1 : 0; v.wanted = r.wanted;
      v.syncMesh(dt);
      // on foot: show a walker at that spot instead of the car
      v.mesh.visible = !foot;
      if (foot) {
        if (!r.char) { r.char = new G.Character({ npc: true }); scene().add(r.char.mesh); }
        r.char.mesh.visible = true; r.char.x = x; r.char.z = z; r.char.y = y; r.char.heading = h; r.char.vx = v.vx; r.char.vz = v.vz;
        r.char.control(0, 0); r.char.animate ? r.char.animate(dt) : null; r.char.sync();
      } else if (r.char) r.char.mesh.visible = false;
      const p = N.players[id];
      if (p && r.tag) { drawTag(r, p); r.tag.position.set(x, y + (foot ? 2.4 : 2.9), z); }
      if (v.ud.siren) { const f = Math.sin(performance.now() * 0.02) > 0; v.ud.siren.red.color.setRGB(f ? 8 : 0.3, 0.05, 0.05); v.ud.siren.blue.color.setRGB(0.05, 0.3, f ? 0.3 : 10); }
    }
  }

  // ---------------- HUD: scoreboard, mission line, cop GPS, chat ----------------
  function renderBoard() {
    if (!N.connected) return;
    if (!board) {
      board = document.createElement('div'); board.id = 'netBoard'; board.className = 'net-board';
      (document.getElementById('hud') || document.body).appendChild(board);
      board.addEventListener('click', (e) => { if (e.target.closest('.nb-role')) N.openLobby(); });
    }
    board.classList.remove('hidden');
    const list = Object.values(N.players).sort((a, b) => (b.score || 0) - (a.score || 0));
    board.innerHTML = `<div class="nb-head">🌐 PHÒNG ${esc(N.room)} • ${list.length} người <button class="nb-role" title="Đổi vai / rời phòng">⚙</button></div>` +
      list.map((p) => `<div class="nb-row${p.id === N.id ? ' me' : ''}"><span>${p.role === 'cop' ? '🚓' : '🚗'} ${esc(p.name)}</span><span class="nb-w">${p.wanted ? '★'.repeat(p.wanted) : ''}</span><span class="nb-s">${p.score || 0}</span></div>`).join('');
  }
  function addChat(d) {
    if (!chatBox) {
      chatBox = document.createElement('div'); chatBox.id = 'netChat'; chatBox.className = 'net-chat';
      chatBox.innerHTML = '<div class="nc-log"></div><input class="nc-in hidden" maxlength="120" placeholder="Nhập tin nhắn, Enter để gửi, Esc để huỷ">';
      (document.getElementById('hud') || document.body).appendChild(chatBox);
      chatInput = chatBox.querySelector('.nc-in');
      chatInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const t = chatInput.value.trim(); if (t && sock) sock.emit('chat', t); chatInput.value = ''; chatInput.classList.add('hidden'); chatInput.blur(); }
        else if (e.key === 'Escape') { chatInput.value = ''; chatInput.classList.add('hidden'); chatInput.blur(); }
      });
    }
    if (!d) return;
    chatBox.classList.remove('hidden');
    const line = document.createElement('div'); line.className = 'nc-line ' + (d.role || '');
    line.innerHTML = `<b>${esc(d.name)}:</b> ${esc(d.text)}`;
    const log = chatBox.querySelector('.nc-log'); log.appendChild(line);
    while (log.children.length > 6) log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 9000);
  }
  window.addEventListener('keydown', (e) => {
    if (!N.connected || e.key !== 'Enter' || G.Game.state !== 'play' || G.Game.paused) return;
    const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (document.getElementById('results') && !document.getElementById('results').classList.contains('hidden')) return;
    addChat(null); chatInput.classList.remove('hidden'); chatInput.focus(); e.preventDefault();
  });

  let navFor = null;
  function missionLine(F) {
    const me = N.players[N.id] || {};
    if (N.role === 'cop') {
      // nearest wanted player becomes the GPS target
      let best = null, bd = Infinity;
      for (const [id, r] of remotes) { if (!r.wanted || !r.snaps.length) continue; const d = Math.hypot(r.v.x - F.x, r.v.z - F.z); if (d < bd) { bd = d; best = { id, r }; } }
      if (best) {
        const p = N.players[best.id];
        if (navFor !== best.id || !G.Nav.active) { G.Nav.set({ x: best.r.v.x, z: best.r.v.z }, { name: 'Truy nã: ' + p.name, keep: true, silent: true, arriveR: 0 }); navFor = best.id; }
        G.Nav.retarget(best.r.v.x, best.r.v.z);
        G.UI.mission('🚓 CẢNH SÁT • ĐANG TRUY BẮT', p.name + ' ' + '★'.repeat(best.r.wanted) + ' • cách ' + G.Nav.fmtDist(bd) + (best.r.bust > 0 ? ' • KHỐNG CHẾ ' + Math.round(best.r.bust * 100) + '%' : ''), 'Điểm: ' + (me.score || 0));
        G.Jobs.sirenLevel = bd < 400 ? 1 : 0;
      } else {
        if (navFor && G.Nav.active && G.Nav.active.keep) G.Nav.clear();
        navFor = null; G.Jobs.sirenLevel = 0;
        G.UI.mission('🚓 CẢNH SÁT • TUẦN TRA', 'Chưa có ai bị truy nã. Theo dõi người chơi chạy quá 120 km/h trong phố!', 'Điểm: ' + (me.score || 0));
      }
      const ud = G.Game.player.ud;
      if (ud && ud.siren) { const on = G.Jobs.sirenLevel > 0, f = on && Math.sin(performance.now() * 0.02) > 0; ud.siren.red.color.setRGB(f ? 8 : 0.3, 0.05, 0.05); ud.siren.blue.color.setRGB(0.05, 0.3, on && !f ? 10 : 0.3); }
    } else {
      G.Jobs.sirenLevel = 0;
      const w = meWanted();
      if (w) G.UI.mission('🚨 BẠN ĐANG BỊ TRUY NÃ ' + '★'.repeat(w), (N.myBust > 0 ? 'SẮP BỊ BẮT ' + Math.round(N.myBust * 100) + '% — CHẠY ĐI!' : 'Cắt đuôi cảnh sát (ra khỏi tầm nhìn 260 m) để thoát'), 'Điểm: ' + (me.score || 0), N.myBust > 0);
      else G.UI.mission('🚗 DÂN THƯỜNG • PHÒNG ' + N.room, 'Chạy ≤ 120 km/h trong phố để không bị truy nã • Enter: chat', 'Điểm: ' + (me.score || 0));
    }
  }

  N.update = function (dt, F) {
    if (!N.connected || !sock) return;
    updateRemotes(dt);
    sendT -= dt;
    if (sendT <= 0) {
      sendT = 1 / 15;
      const P = G.Game.player, foot = !!G.Game.onFoot;
      sock.emit('state', { x: F.x, z: F.z, y: F.y || 0, h: F.heading || 0, spd: F.speed || 0, foot, nos: !foot && P.nitroOn, brk: !foot && !!P.brakeLight });
    }
    if (rosterT > 15) { rosterT = 0; renderBoard(); }
    missionLine(F);
  };
  return N;
})();
