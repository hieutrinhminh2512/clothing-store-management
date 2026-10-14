// ================================================================
//  Accounts: login / register / guest, per-account saves (G.Auth)
//
//  HONEST NOTE: this is client-side "auth" only. Everything lives in
//  this browser's localStorage, so anyone with devtools can read or
//  edit accounts and saves (or just call G.Game.toTitle()). Password
//  hashing (salted PBKDF2-SHA256) only keeps plain-text passwords out
//  of storage — it is NOT real security. Use a server for that.
// ================================================================
'use strict';

G.Auth = (function () {
  const A = { user: null, role: null, guest: false };
  const STORE = 'SPEEDRUSH_ACCOUNTS_V1', SESSION = 'SPEEDRUSH_SESSION_V1';
  const ITER = 20000, MAX_FAILS = 5, LOCK_MS = 60000;
  const ADMIN_DEFAULT = { name: 'admin', pw: 'SpeedRush@2026' };
  const GUEST_KEY = G.SAVE_KEY + ':~guest';
  let onDone = null, root = null, chip = null, mode = 'login', busy = false;

  // ---------------- Pure-JS SHA-256 / HMAC / PBKDF2 ----------------
  // crypto.subtle is missing on file:// / insecure contexts in some browsers.
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const Wb = new Uint32Array(64);
  // one SHA-256 compression: st (8 words) updated in place with block w[0..15]
  function compress(st, w) {
    for (let i = 0; i < 16; i++) Wb[i] = w[i];
    for (let i = 16; i < 64; i++) {
      const x = Wb[i - 15], y = Wb[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3), s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      Wb[i] = (Wb[i - 16] + s0 + Wb[i - 7] + s1) | 0;
    }
    let a = st[0], b = st[1], c = st[2], d = st[3], e = st[4], f = st[5], g = st[6], h = st[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + Wb[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    st[0] = (st[0] + a) | 0; st[1] = (st[1] + b) | 0; st[2] = (st[2] + c) | 0; st[3] = (st[3] + d) | 0;
    st[4] = (st[4] + e) | 0; st[5] = (st[5] + f) | 0; st[6] = (st[6] + g) | 0; st[7] = (st[7] + h) | 0;
  }
  const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const toBytes = (st) => { const o = new Uint8Array(32); for (let i = 0; i < 8; i++) { o[i * 4] = st[i] >>> 24; o[i * 4 + 1] = st[i] >>> 16; o[i * 4 + 2] = st[i] >>> 8; o[i * 4 + 3] = st[i]; } return o; };
  // full SHA-256 of bytes, optionally continuing from a state that already absorbed 'pre' bytes
  function sha256(bytes, st0, pre) {
    pre = pre || 0;
    const len = bytes.length, nb = ((len + 9 + 63) >> 6) << 6, m = new Uint8Array(nb);
    m.set(bytes); m[len] = 0x80;
    const bits = (len + pre) * 8; m[nb - 4] = bits >>> 24; m[nb - 3] = bits >>> 16; m[nb - 2] = bits >>> 8; m[nb - 1] = bits; m[nb - 5] = (bits / 0x100000000) | 0;
    const st = new Int32Array(st0 || IV), w = new Int32Array(16);
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
      compress(st, w);
    }
    return toBytes(st);
  }
  function padState(key, x) {
    if (key.length > 64) key = sha256(key);
    const w = new Int32Array(16);
    for (let i = 0; i < 16; i++) w[i] = (((key[i * 4] || 0) ^ x) << 24) | (((key[i * 4 + 1] || 0) ^ x) << 16) | (((key[i * 4 + 2] || 0) ^ x) << 8) | ((key[i * 4 + 3] || 0) ^ x);
    const st = new Int32Array(IV); compress(st, w); return st;
  }
  // PBKDF2-HMAC-SHA256, 32-byte output (one block). HMAC pads are pre-hashed so
  // each iteration costs exactly two compressions.
  function pbkdf2JS(pw, salt, iter) {
    const ist = padState(pw, 0x36), ost = padState(pw, 0x5c);
    const s = new Uint8Array(salt.length + 4); s.set(salt); s[salt.length + 3] = 1;
    let u = sha256(sha256(s, ist, 64), ost, 64);
    const t = new Int32Array(8), uw = new Int32Array(8), st = new Int32Array(8), blk = new Int32Array(16);
    for (let i = 0; i < 8; i++) uw[i] = t[i] = (u[i * 4] << 24) | (u[i * 4 + 1] << 16) | (u[i * 4 + 2] << 8) | u[i * 4 + 3];
    for (let n = 1; n < iter; n++) {
      // inner: H(ipad || u), u is 32 bytes -> one padded block, total length 96 bytes
      blk.set(uw); blk[8] = 0x80000000; blk.fill(0, 9, 15); blk[15] = 768;
      st.set(ist); compress(st, blk);
      blk.set(st); blk[8] = 0x80000000; blk.fill(0, 9, 15); blk[15] = 768;
      st.set(ost); compress(st, blk);
      for (let i = 0; i < 8; i++) { uw[i] = st[i]; t[i] ^= st[i]; }
    }
    return toBytes(t);
  }
  const enc = (s) => new TextEncoder().encode(s);
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));
  async function derive(pw, saltHex, iter) {
    const p = enc(pw), salt = unhex(saltHex);
    try {
      if (window.crypto && crypto.subtle && window.isSecureContext !== false) {
        const key = await crypto.subtle.importKey('raw', p, 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
        return hex(new Uint8Array(bits));
      }
    } catch (e) { /* fall back to pure JS */ }
    await new Promise((r) => setTimeout(r, 0)); // let the "đang xử lý" text paint first
    return hex(pbkdf2JS(p, salt, iter));
  }
  function randomSalt() {
    const b = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
    return hex(b);
  }
  A._sha256 = (s) => hex(sha256(enc(s))); A._pbkdf2 = (pw, saltHex, it) => hex(pbkdf2JS(enc(pw), unhex(saltHex), it)); // for tests

  // ---------------- Account store ----------------
  function loadStore() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object' || !s.accounts) s = { v: 1, accounts: {}, legacyDone: false };
    return s;
  }
  function saveStore(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* private mode */ } }
  const norm = (n) => String(n || '').trim().toLowerCase();
  const keyFor = (n) => G.SAVE_KEY + ':' + norm(n);
  async function makeCred(pw) { const salt = randomSalt(); return { salt, iter: ITER, hash: await derive(pw, salt, ITER) }; }
  async function ensureAdmin() {
    const s = loadStore();
    if (s.seeded) return;
    if (!s.accounts.admin) {
      s.accounts.admin = Object.assign({ name: ADMIN_DEFAULT.name, role: 'admin', created: Date.now(), last: 0, fails: 0, lockUntil: 0, defaultPw: true }, await makeCred(ADMIN_DEFAULT.pw));
    }
    const s2 = loadStore(); // re-read: another tab may have written meanwhile
    s2.accounts.admin = s2.accounts.admin || s.accounts.admin; s2.seeded = true;
    saveStore(s2);
  }

  function validName(n) {
    n = String(n || '').trim();
    if (n.length < 3 || n.length > 20) return 'Tên đăng nhập phải dài 3–20 ký tự';
    if (!/^[A-Za-z0-9_.-]+$/.test(n)) return 'Tên đăng nhập chỉ gồm chữ không dấu, số, dấu _ . -';
    return '';
  }
  function validPw(p) {
    if (p.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự';
    if (p.length > 64) return 'Mật khẩu quá dài (tối đa 64 ký tự)';
    return '';
  }

  // ---------------- Switching saves ----------------
  function migrateLegacy(targetKey) {
    const s = loadStore();
    if (s.legacyDone) return;
    try {
      const legacy = localStorage.getItem(G.SAVE_KEY);
      if (legacy && !localStorage.getItem(targetKey)) localStorage.setItem(targetKey, legacy);
    } catch (e) { /* ignore */ }
    s.legacyDone = true; saveStore(s);
  }
  const safe = (fn) => { try { fn(); } catch (e) { console.warn('[auth]', e); } };
  // push the freshly loaded G.save into every running system
  A.refreshGame = function (prevQuality) {
    const s = G.save;
    if (!G.QUALITY[s.settings.quality]) s.settings.quality = 'high';
    if (!Array.isArray(s.owned) || !s.owned.length) s.owned = ['kitsune'];
    if (!s.owned.includes(s.selected)) s.selected = s.owned[0];
    safe(() => { if (G.Events.active) G.Events.abort(); });
    safe(() => { if (G.Police.active) G.Police.end(); G.Police.cooldown = 3; });
    safe(() => { if (prevQuality !== s.settings.quality) { G.R.applyQuality(); if (G.FX && G.FX.resize) G.FX.resize(); } });
    safe(() => G.Traffic.setCount(G.QUALITY[s.settings.quality].traffic));
    safe(() => { if (G.Game.player) G.Game.previewCar(s.selected); });
    safe(() => { const got = new Set(s.coins); G.Events.coins.forEach((c, i) => { c.got = got.has(i); }); });
    safe(() => G.Audio.setVolume(s.settings.volume));
    safe(() => { if (G.UI) G.UI.gps = null; });
    if (A.onChange) safe(() => A.onChange());
  };
  function useSave(key) {
    const prevQ = G.save && G.save.settings && G.save.settings.quality;
    G.setSaveKey(key);
    A.refreshGame(prevQ);
    G.persist();
  }
  function enter(name, role, guest, remember) {
    A.user = guest ? null : name; A.role = guest ? 'guest' : role; A.guest = !!guest;
    useSave(guest ? GUEST_KEY : keyFor(name));
    // built-in admin account: one-time grant of $10,000,000,000 (spent/earned normally afterwards)
    if (!guest && role === 'admin' && norm(name) === 'admin' && !G.save.grant10b) {
      G.save.cash = Math.max(G.save.cash || 0, 10000000000); G.save.grant10b = true; G.persist();
    }
    try {
      if (remember) localStorage.setItem(SESSION, JSON.stringify({ user: guest ? '~guest' : norm(name), at: Date.now() }));
      else localStorage.removeItem(SESSION);
    } catch (e) { /* ignore */ }
    hide();
    updateChip();
    if (onDone) { const cb = onDone; cb(); }
  }

  // ---------------- Login / register logic ----------------
  async function doLogin(name, pw, remember) {
    const n = norm(name), s = loadStore(), acc = s.accounts[n];
    if (!n || !pw) return 'Vui lòng nhập tên đăng nhập và mật khẩu';
    if (!acc) return 'Tài khoản không tồn tại';
    if (acc.lockUntil && acc.lockUntil > Date.now()) return 'Tài khoản tạm khoá do nhập sai nhiều lần. Thử lại sau ' + Math.ceil((acc.lockUntil - Date.now()) / 1000) + ' giây';
    const h = await derive(pw, acc.salt, acc.iter || ITER);
    const s2 = loadStore(), a2 = s2.accounts[n];
    if (!a2) return 'Tài khoản không tồn tại';
    if (h !== a2.hash) {
      a2.fails = (a2.fails || 0) + 1;
      let msg = 'Sai mật khẩu (' + a2.fails + '/' + MAX_FAILS + ')';
      if (a2.fails >= MAX_FAILS) { a2.fails = 0; a2.lockUntil = Date.now() + LOCK_MS; msg = 'Sai mật khẩu quá ' + MAX_FAILS + ' lần — tài khoản bị khoá 60 giây'; }
      saveStore(s2); return msg;
    }
    a2.fails = 0; a2.lockUntil = 0; a2.last = Date.now(); saveStore(s2);
    enter(a2.name, a2.role, false, remember);
    if (a2.role === 'admin' && a2.defaultPw) remindPw();
    toast('👋 Xin chào, ' + a2.name + '!', 2500);
    return '';
  }
  async function doRegister(name, pw, pw2, remember) {
    const e1 = validName(name); if (e1) return e1;
    const e2 = validPw(pw); if (e2) return e2;
    if (pw !== pw2) return 'Mật khẩu nhập lại không khớp';
    const n = norm(name);
    if (n === 'guest' || n === 'khach') return 'Tên này đã được dành riêng';
    if (loadStore().accounts[n]) return 'Tên đăng nhập đã tồn tại';
    const cred = await makeCred(pw);
    const s = loadStore();
    if (s.accounts[n]) return 'Tên đăng nhập đã tồn tại';
    s.accounts[n] = Object.assign({ name: String(name).trim(), role: 'user', created: Date.now(), last: Date.now(), fails: 0, lockUntil: 0 }, cred);
    saveStore(s);
    migrateLegacy(keyFor(n));
    enter(s.accounts[n].name, 'user', false, remember);
    toast('🎉 Đã tạo tài khoản ' + s.accounts[n].name + '!', 3000);
    return '';
  }
  function doGuest(remember) {
    migrateLegacy(GUEST_KEY);
    enter(null, 'guest', true, remember);
    toast('Đang chơi với tư cách KHÁCH — tiến trình chỉ lưu trên máy này', 3500);
  }
  // the toast element lives in the in-game HUD: wait until play starts (after the welcome toast)
  function remindPw() {
    const who = A.user;
    const iv = setInterval(() => {
      if (A.user !== who) { clearInterval(iv); return; }
      if (G.Game && G.Game.state === 'play') {
        clearInterval(iv);
        setTimeout(() => { const a = loadStore().accounts[norm(who)]; if (A.user === who && a && a.defaultPw) toast('⚠️ Admin đang dùng mật khẩu mặc định — hãy đổi trong bảng ADMIN (F2 › TÀI KHOẢN)', 7000); }, 4300);
      }
    }, 300);
  }
  function toast(t, ms) { if (G.UI && G.UI.toast) safe(() => G.UI.toast(t, ms)); }

  // ---------------- Public API ----------------
  A.isAdmin = () => A.role === 'admin' && !!A.user;
  A.displayName = () => (A.guest ? 'Khách' : A.user || '—');
  A.gate = function (cb) {
    onDone = cb;
    build();
    ensureAdmin().catch((e) => console.warn('[auth] seed', e)).then(() => {
      let sess = null;
      try { sess = JSON.parse(localStorage.getItem(SESSION)); } catch (e) { sess = null; }
      if (sess && sess.user === '~guest') { enter(null, 'guest', true, true); return; }
      const acc = sess && loadStore().accounts[sess.user];
      if (acc && !(acc.lockUntil > Date.now())) {
        enter(acc.name, acc.role, false, true);
        toast('👋 Tự động đăng nhập: ' + acc.name, 2500);
        if (acc.role === 'admin' && acc.defaultPw) remindPw();
        return;
      }
      show();
    });
  };
  A.logout = function () {
    safe(() => { if (G.Events.active) G.Events.abort(); });
    safe(() => { if (G.Police.active) G.Police.end(); });
    G.persist();
    try { localStorage.removeItem(SESSION); } catch (e) { /* ignore */ }
    A.user = null; A.role = null; A.guest = false;
    if (G.Admin && G.Admin.close) safe(() => G.Admin.close());
    safe(() => { if (G.Game.paused) G.Game.togglePause(false); if (G.Game.garage) G.Game.closeGarage(); G.Game.toTitle(); });
    if (!onDone) onDone = () => G.Game.toTitle();
    build(); updateChip(); show();
    if (A.onChange) safe(() => A.onChange());
  };
  A.switchAccount = A.logout;
  A.listAccounts = () => Object.entries(loadStore().accounts).map(([id, a]) => ({ id, name: a.name, role: a.role, created: a.created, last: a.last, locked: a.lockUntil > Date.now(), defaultPw: !!a.defaultPw }));
  A.deleteAccount = function (name) {
    const n = norm(name), s = loadStore();
    if (!s.accounts[n]) return 'Không tìm thấy tài khoản';
    if (n === norm(A.user)) return 'Không thể xoá tài khoản đang đăng nhập';
    if (s.accounts[n].role === 'admin' && Object.values(s.accounts).filter((a) => a.role === 'admin').length <= 1) return 'Phải còn ít nhất 1 admin';
    delete s.accounts[n]; saveStore(s);
    try { localStorage.removeItem(keyFor(n)); } catch (e) { /* ignore */ }
    try { const ss = JSON.parse(localStorage.getItem(SESSION)); if (ss && ss.user === n) localStorage.removeItem(SESSION); } catch (e) { /* ignore */ }
    return '';
  };
  A.setRole = function (name, role) {
    const n = norm(name), s = loadStore(), a = s.accounts[n];
    if (!a) return 'Không tìm thấy tài khoản';
    if (n === norm(A.user) && role !== 'admin') return 'Không thể tự hạ quyền chính mình';
    a.role = role === 'admin' ? 'admin' : 'user'; saveStore(s); return '';
  };
  A.resetPassword = async function (name, pw) {
    const e = validPw(pw); if (e) return e;
    const n = norm(name);
    if (!loadStore().accounts[n]) return 'Không tìm thấy tài khoản';
    const cred = await makeCred(pw), s = loadStore(), a = s.accounts[n];
    if (!a) return 'Không tìm thấy tài khoản';
    Object.assign(a, cred, { fails: 0, lockUntil: 0, defaultPw: false }); saveStore(s); return '';
  };
  A.changePassword = async function (oldPw, pw, pw2) {
    if (!A.user) return 'Chưa đăng nhập';
    const n = norm(A.user), a = loadStore().accounts[n];
    if (!a) return 'Không tìm thấy tài khoản';
    if (await derive(oldPw, a.salt, a.iter || ITER) !== a.hash) return 'Mật khẩu hiện tại không đúng';
    if (pw !== pw2) return 'Mật khẩu nhập lại không khớp';
    if (pw === oldPw) return 'Mật khẩu mới phải khác mật khẩu cũ';
    return A.resetPassword(n, pw);
  };
  A.saveKeyFor = (name) => (name === '~guest' ? GUEST_KEY : keyFor(name));

  // ---------------- UI ----------------
  function build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'authScreen'; root.className = 'auth-screen hidden';
    root.innerHTML = `
      <div class="auth-card">
        <div class="logo auth-logo">SPEED RUSH<span>OPEN CITY</span></div>
        <div class="auth-tabs"><button type="button" data-tab="login" class="on">ĐĂNG NHẬP</button><button type="button" data-tab="register">ĐĂNG KÝ</button></div>
        <form class="auth-form" autocomplete="on" novalidate>
          <label>Tên đăng nhập<input name="user" type="text" maxlength="20" autocomplete="username" spellcheck="false" placeholder="vd: tay_dua_99"></label>
          <label>Mật khẩu<input name="pw" type="password" maxlength="64" autocomplete="current-password" placeholder="••••••"></label>
          <label class="auth-reg">Nhập lại mật khẩu<input name="pw2" type="password" maxlength="64" autocomplete="new-password" placeholder="••••••"></label>
          <label class="auth-check"><input name="remember" type="checkbox" checked> Ghi nhớ đăng nhập</label>
          <div class="auth-msg" role="alert"></div>
          <button type="submit" class="btn primary full auth-submit">ĐĂNG NHẬP</button>
        </form>
        <div class="auth-or"><span>hoặc</span></div>
        <button type="button" class="btn full auth-guest">🎮 CHƠI KHÁCH</button>
        <div class="auth-note">Tài khoản & tiến trình được lưu cục bộ trên trình duyệt này.</div>
      </div>`;
    document.body.appendChild(root);
    const f = root.querySelector('form'), msg = root.querySelector('.auth-msg');
    root.querySelectorAll('.auth-tabs button').forEach((b) => { b.onclick = () => setMode(b.dataset.tab); });
    // keep keys typed here away from the game (Escape, Space, Tab...)
    root.addEventListener('keydown', (e) => e.stopPropagation());
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true; msg.className = 'auth-msg info'; msg.textContent = 'Đang xử lý...';
      root.querySelector('.auth-submit').disabled = true;
      let err = '';
      try {
        err = mode === 'login' ? await doLogin(f.user.value, f.pw.value, f.remember.checked)
          : await doRegister(f.user.value, f.pw.value, f.pw2.value, f.remember.checked);
      } catch (ex) { console.error(ex); err = 'Lỗi không xác định: ' + ex.message; }
      busy = false; root.querySelector('.auth-submit').disabled = false;
      msg.className = 'auth-msg' + (err ? ' err' : ''); msg.textContent = err;
      if (err) { f.pw.value = ''; f.pw2.value = ''; f.pw.focus(); }
    };
    root.querySelector('.auth-guest').onclick = () => { if (!busy) doGuest(f.remember.checked); };
  }
  function setMode(m) {
    mode = m;
    root.querySelectorAll('.auth-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === m));
    root.classList.toggle('register', m === 'register');
    root.querySelector('.auth-submit').textContent = m === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN';
    root.querySelector('[name=pw]').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    const msg = root.querySelector('.auth-msg'); msg.textContent = ''; msg.className = 'auth-msg';
  }
  function show() {
    build(); setMode('login');
    const f = root.querySelector('form'); f.pw.value = ''; f.pw2.value = '';
    root.classList.remove('hidden');
    ['title', 'loading'].forEach((id) => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
    setTimeout(() => (f.user.value ? f.pw : f.user).focus(), 50);
    updateChip();
  }
  function hide() { if (root) root.classList.add('hidden'); }
  A.visible = () => !!root && !root.classList.contains('hidden');

  // small user badge on the title screen with a switch-account button
  function updateChip() {
    if (!chip) {
      chip = document.createElement('div'); chip.id = 'authChip'; chip.className = 'auth-chip hidden';
      chip.innerHTML = '<span class="auth-chip-name"></span><button type="button" class="auth-chip-out" title="Đăng xuất / đổi tài khoản">ĐỔI TÀI KHOẢN</button>';
      chip.querySelector('button').onclick = () => A.logout();
      document.body.appendChild(chip);
      // show only on the title screen
      setInterval(() => {
        const on = !!A.role && !A.visible() && G.Game && G.Game.state === 'title' && !G.Game.garage;
        chip.classList.toggle('hidden', !on);
      }, 250);
    }
    chip.querySelector('.auth-chip-name').textContent = (A.role === 'admin' ? '🛡️ ' : '👤 ') + A.displayName();
  }
  return A;
})();
