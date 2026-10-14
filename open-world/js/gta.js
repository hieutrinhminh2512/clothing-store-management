// ================================================================
//  GTA-style systems (G.GTA):
//   • health + armour, WASTED (hospital) / BUSTED (police station)
//   • weapons on foot: fists, pistol, SMG, shotgun, rifle — aim with
//     right mouse, fire with left mouse, 1-5 / mouse wheel to switch
//   • pedestrians on the pavements (walk, flee, get knocked down)
//   • vehicle damage: smoke → fire → explosion; police shoot back at 3★+
//   • city venues: hospital, police station, Ammu-Nation, Pay'n'Spray,
//     clothes shop — walk/drive up and press E
// ================================================================
'use strict';

G.GTA = (function () {
  const T = { hp: 100, armor: 0, weapon: 'fist', aiming: false, frozen: false, dead: false, peds: [] };
  const Gm = () => G.Game;
  const scene = () => G.Game.scene();
  const rnd = Math.random;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

  // ---------------- Weapons ----------------
  const WEAP = {
    fist: { name: 'Tay không', icon: '👊', dmg: 22, rate: 0.45, range: 2.3, slot: 1 },
    pistol: { name: 'Súng lục', icon: '🔫', dmg: 28, rate: 0.24, range: 90, spread: 0.012, price: 600, ammo: [36, 120], slot: 2 },
    smg: { name: 'Tiểu liên', icon: '🔫', dmg: 15, rate: 0.085, range: 70, spread: 0.035, price: 2500, ammo: [90, 300], auto: true, slot: 3 },
    shotgun: { name: 'Shotgun', icon: '💥', dmg: 13, pellets: 8, rate: 0.85, range: 35, spread: 0.08, price: 3500, ammo: [24, 260], slot: 4 },
    rifle: { name: 'Súng trường', icon: '🎯', dmg: 34, rate: 0.12, range: 150, spread: 0.012, price: 6000, ammo: [90, 450], auto: true, slot: 5 },
  };
  T.WEAP = WEAP;
  const owned = () => (G.save.weapons = G.save.weapons || {});
  const hasW = (id) => id === 'fist' || owned()[id] !== undefined;
  const ammo = (id) => (id === 'fist' ? Infinity : owned()[id] || 0);

  // ---------------- City venues ----------------
  const OUTFITS = [
    { name: 'Mặc định', skin: 0xe0ac86, hair: 0x2a1a10, shirt: 0xf2f2f2, jacket: 0x1d2b4a, pants: 0x2c3e66, shoes: 0xf4f4f4, sole: 0x222222, price: 0 },
    { name: 'Đường phố', skin: 0xe0ac86, hair: 0x2a1a10, shirt: 0xd8342c, jacket: null, pants: 0x3b3b40, shoes: 0x1b1b1b, sole: 0xeeeeee, price: 300 },
    { name: 'Vest đen', skin: 0xe0ac86, hair: 0x111111, shirt: 0xf5f5f5, jacket: 0x121418, pants: 0x121418, shoes: 0x0b0b0b, sole: 0x222222, price: 1500 },
    { name: 'Biker', skin: 0xe0ac86, hair: 0x0c0c0c, shirt: 0x333333, jacket: 0x4a2a14, pants: 0x1f2a44, shoes: 0x3a2a1a, sole: 0x111111, price: 900 },
    { name: 'Thể thao', skin: 0xe0ac86, hair: 0x6b4428, shirt: 0x00a8e8, jacket: 0x0a3d62, pants: 0x222222, shoes: 0xff3b30, sole: 0xffffff, price: 600 },
    { name: 'Mùa hè', skin: 0xe0ac86, hair: 0x2a1a10, shirt: 0xf6c90e, jacket: null, pants: 0xd2b48c, shoes: 0x8b5a2b, sole: 0x222222, price: 400 },
    { name: 'Hoàng gia', skin: 0xe0ac86, hair: 0x111111, shirt: 0x5b2c83, jacket: 0xd4af37, pants: 0x1a1a1a, shoes: 0xd4af37, sole: 0x111111, price: 25000 },
  ];
  let venues = null;
  function buildVenues() {
    const L = G.W.lines, HR = G.CFG.ROAD / 2, SW = G.CFG.SIDEWALK;
    const mk = (id, bi, bj, name, icon, c1, c2, sub) => {
      const cx = (L[bi] + L[bi + 1]) / 2, zr = L[bj];
      return { id, name, icon, c1, c2, sub, x: cx, z: zr + HR + 2, pose: { x: cx, z: zr + HR + 2.5, heading: Math.PI }, carPose: { x: cx + 20, z: zr + 4.5, heading: Math.PI / 2 }, sign: { x: cx, z: zr + HR + SW - 0.4 }, road: { x: cx, z: zr + 4.5 } };
    };
    venues = [
      mk('hospital', 3, 4, 'Bệnh viện Chợ Rẫy', '🏥', '#ffffff', '#d32f2f', 'CẤP CỨU 24/7 • CHỮA TRỊ'),
      mk('police', 7, 5, 'Đồn Công an Quận 1', '🚓', '#0d47a1', '#1976d2', 'NỘP PHẠT • XOÁ TRUY NÃ'),
      mk('ammu', 4, 9, 'AMMU-NATION', '🔫', '#212121', '#c62828', 'SÚNG • ĐẠN • ÁO GIÁP'),
      mk('spray', 8, 2, "PAY 'N' SPRAY", '🎨', '#ff6f00', '#283593', 'SỬA XE • SƠN MỚI • XOÁ TRUY NÃ'),
      mk('clothes', 6, 3, 'SUB-URBAN', '👕', '#6a1b9a', '#ec407a', 'THỜI TRANG NAM'),
    ];
    // signboard on posts + glowing floor ring + floating icon
    for (const v of venues) {
      const g = new THREE.Group(); g.position.set(v.sign.x, 0, v.sign.z); scene().add(g);
      const post = new THREE.MeshStandardMaterial({ color: G.col(0x2b2f36), metalness: 0.6, roughness: 0.4 });
      for (const sx of [-6, 6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.3), post); p.position.set(sx, 4, 0); g.add(p); }
      const b = new THREE.Mesh(new THREE.PlaneGeometry(13, 5), new THREE.MeshBasicMaterial({ map: G.TEX.billboard(v.name, v.sub, v.c1, v.c2), side: THREE.DoubleSide }));
      b.position.set(0, 8.5, 0); b.rotation.y = Math.PI; g.add(b);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 2.2), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(v.x, 0.33, v.z); scene().add(ring); v.ring = ring;
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.font = '96px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(v.icon, 64, 70);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false })); sp.scale.set(2.2, 2.2, 1); sp.position.set(v.x, 3, v.z); scene().add(sp); v.icon3d = sp;
    }
  }
  T.places = () => (venues || []).map((v) => ({ name: v.name, icon: v.icon, x: v.x, z: v.z - 6 }));
  const venue = (id) => venues.find((v) => v.id === id);

  // ---------------- HUD ----------------
  let hud = null;
  function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; (parent || document.body).appendChild(e); return e; }
  function initHud() {
    const root = document.getElementById('hud') || document.body;
    hud = {};
    hud.bars = el('div', 'gta-bars', root, '<div class="gb hp"><i></i></div><div class="gb ar"><i></i></div>');
    hud.weap = el('div', 'gta-weap', root, '<span class="gw-i"></span><span class="gw-n"></span><span class="gw-a"></span>');
    hud.cross = el('div', 'gta-cross hidden', root);
    hud.prompt = el('div', 'gta-prompt hidden', root);
    hud.over = el('div', 'gta-over hidden', document.body, '<div class="go-t"></div><div class="go-s"></div>');
    hud.shop = el('div', 'modal hidden gta-shop', document.body, '<div class="card wide"><div class="r-title gs-t"></div><div class="gs-sub"></div><div class="gs-list"></div><div class="gs-cash"></div><button class="btn gs-x">✖ ĐÓNG <kbd>ESC</kbd></button></div>');
    hud.shop.querySelector('.gs-x').onclick = closeShop;
    hud.shop.addEventListener('click', (e) => { if (e.target === hud.shop) closeShop(); });
  }
  let hudT = 0, lastHud = '';
  function updateHud(dt, F) {
    hudT -= dt; if (hudT > 0) return; hudT = 0.1;
    const foot = Gm().onFoot && !Gm().flying, W = WEAP[T.weapon];
    const key = Math.round(T.hp) + '|' + Math.round(T.armor) + '|' + T.weapon + '|' + ammo(T.weapon) + '|' + foot;
    if (key !== lastHud) {
      lastHud = key;
      hud.bars.querySelector('.hp i').style.transform = 'scaleX(' + G.clamp(T.hp / 100, 0, 1) + ')';
      hud.bars.querySelector('.ar i').style.transform = 'scaleX(' + G.clamp(T.armor / 100, 0, 1) + ')';
      hud.bars.querySelector('.hp').classList.toggle('low', T.hp < 30);
      hud.weap.classList.toggle('hidden', !foot);
      hud.weap.querySelector('.gw-i').textContent = W.icon;
      hud.weap.querySelector('.gw-n').textContent = W.name;
      hud.weap.querySelector('.gw-a').textContent = T.weapon === 'fist' ? '' : String(ammo(T.weapon));
    }
    hud.cross.classList.toggle('hidden', !(foot && T.weapon !== 'fist' && (T.aiming || T.shotT > 0)));
    // venue prompt
    const v = nearVenue(F);
    const txt = v ? venueHint(v) : '';
    if (txt !== hud.prompt.textContent) { hud.prompt.textContent = txt; hud.prompt.classList.toggle('hidden', !txt); }
  }
  function nearVenue(F) {
    if (!venues || T.dead) return null;
    for (const v of venues) {
      const d = Gm().onFoot ? Math.hypot(v.x - F.x, v.z - F.z) : Math.hypot(v.road.x - F.x, v.road.z - F.z);
      if (d < (Gm().onFoot ? 4 : 12)) return v;
    }
    return null;
  }
  function venueHint(v) {
    const foot = Gm().onFoot;
    if (v.id === 'spray') return foot ? "PAY 'N' SPRAY — lái xe vào đây để sửa & sơn" : "[E] PAY 'N' SPRAY — sửa xe, sơn mới, xoá truy nã ($500)";
    if (!foot) return v.id === 'hospital' ? '[E] Bệnh viện — chữa trị ($200)' : '';
    return { hospital: '[E] Bệnh viện — chữa trị ($200)', police: '[E] Đồn công an — nộp phạt xoá truy nã', ammu: '[E] AMMU-NATION — mua súng, đạn, áo giáp', clothes: '[E] SUB-URBAN — mua quần áo' }[v.id];
  }

  // ---------------- Shop modal ----------------
  T.shopOpen = false;
  function openShop(title, sub, items) {
    hud.shop.querySelector('.gs-t').textContent = title;
    hud.shop.querySelector('.gs-sub').textContent = sub || '';
    const list = hud.shop.querySelector('.gs-list');
    list.innerHTML = '';
    for (const it of items) {
      const row = el('div', 'gs-row' + (it.on ? ' on' : ''), list, `<span class="gs-i">${it.icon || ''}</span><span class="gs-n">${it.name}<small>${it.desc || ''}</small></span>`);
      const b = el('button', 'btn' + (it.disabled ? ' off' : ' primary'), row, it.label);
      b.onclick = () => { if (it.disabled) return; const r = it.buy(); if (r) G.UI.toast(r, 2200); G.persist(); refreshShop(); };
    }
    hud.shop.querySelector('.gs-cash').textContent = '💰 ' + G.fmtMoney(G.save.cash);
    hud.shop.classList.remove('hidden'); T.shopOpen = true; T.shopArgs = [title, sub]; Gm().pauseSim(true);
  }
  let shopKind = null;
  function refreshShop() { if (T.shopOpen && shopKind) openVenue(venue(shopKind), true); }
  function closeShop() { hud.shop.classList.add('hidden'); T.shopOpen = false; shopKind = null; if (Gm().state === 'play') Gm().pauseSim(false); }
  const pay = (n) => { if (G.save.cash < n) return false; G.save.cash -= n; G.Audio.cash && G.Audio.cash(); return true; };
  function openVenue(v, refresh) {
    shopKind = v.id;
    if (v.id === 'ammu') {
      const items = [];
      for (const [id, w] of Object.entries(WEAP)) {
        if (id === 'fist') continue;
        if (!hasW(id)) items.push({ icon: w.icon, name: w.name, desc: 'Sát thương ' + w.dmg + (w.pellets ? '×' + w.pellets : '') + ' • tầm ' + w.range + ' m', label: 'MUA ' + G.fmtMoney(w.price), disabled: G.save.cash < w.price, buy: () => { if (!pay(w.price)) return 'Không đủ tiền'; owned()[id] = w.ammo[0]; T.weapon = id; return 'Đã mua ' + w.name + ' (phím ' + w.slot + ')'; } });
        else items.push({ icon: w.icon, name: w.name + ' — đạn', desc: 'Đang có ' + ammo(id) + ' viên', label: '+' + w.ammo[0] + ' • ' + G.fmtMoney(w.ammo[1]), disabled: G.save.cash < w.ammo[1], on: true, buy: () => { if (!pay(w.ammo[1])) return 'Không đủ tiền'; owned()[id] += w.ammo[0]; return 'Đã mua đạn'; } });
      }
      items.push({ icon: '🦺', name: 'Áo giáp chống đạn', desc: 'Giáp hiện tại ' + Math.round(T.armor) + '/100', label: 'MUA ' + G.fmtMoney(800), disabled: G.save.cash < 800 || T.armor >= 100, buy: () => { if (!pay(800)) return 'Không đủ tiền'; T.armor = 100; G.save.armor = 100; return 'Đã mặc áo giáp'; } });
      openShop('🔫 AMMU-NATION', 'Chuột phải: ngắm • Chuột trái: bắn • 1-5 hoặc lăn chuột: đổi súng', items);
    } else if (v.id === 'clothes') {
      const cur = G.save.outfit || 0, have = (G.save.outfits = G.save.outfits || [0]);
      openShop('👕 SUB-URBAN', 'Chọn trang phục cho nhân vật', OUTFITS.map((o, i) => ({
        icon: '<b class="gs-sw" style="background:#' + new THREE.Color(o.jacket || o.shirt).getHexString() + '"></b>', name: o.name, desc: have.includes(i) ? 'Đã sở hữu' : '', on: cur === i,
        label: cur === i ? 'ĐANG MẶC' : (have.includes(i) ? 'MẶC' : 'MUA ' + G.fmtMoney(o.price)), disabled: cur === i || (!have.includes(i) && G.save.cash < o.price),
        buy: () => { if (!have.includes(i)) { if (!pay(o.price)) return 'Không đủ tiền'; have.push(i); } G.save.outfit = i; applyOutfit(); return 'Đã thay đồ: ' + o.name; },
      })));
    } else if (v.id === 'hospital') {
      openShop('🏥 BỆNH VIỆN CHỢ RẪY', 'Máu ' + Math.round(T.hp) + '/100', [{ icon: '💉', name: 'Chữa trị toàn bộ', desc: 'Hồi đầy máu', label: 'CHỮA ' + G.fmtMoney(200), disabled: T.hp >= 100 || G.save.cash < 200, buy: () => { if (!pay(200)) return 'Không đủ tiền'; T.hp = 100; return 'Đã hồi phục sức khoẻ'; } }]);
    } else if (v.id === 'police') {
      const lv = G.Police.active ? Math.ceil(G.Police.heat) : 0, fine = 1500 * lv;
      openShop('🚓 ĐỒN CÔNG AN QUẬN 1', lv ? 'Bạn đang bị truy nã ' + '★'.repeat(lv) : 'Bạn không bị truy nã', [{ icon: '📝', name: 'Nộp phạt, xoá truy nã', desc: lv ? 'Cảnh sát sẽ ngừng truy đuổi' : 'Không có vi phạm', label: lv ? 'NỘP ' + G.fmtMoney(fine) : '—', disabled: !lv || G.save.cash < fine, buy: () => { if (!pay(fine)) return 'Không đủ tiền'; G.Police.end(); G.Police.cooldown = 20; return 'Đã nộp phạt. Lái xe cẩn thận!'; } }]);
    }
    void refresh;
  }
  function sprayCar() {
    const P = Gm().player;
    if (P.speed > 3) return G.UI.toast('Dừng xe lại trong xưởng');
    if (!pay(500)) return G.UI.toast('Cần $500 để sửa xe');
    P.health = 1000; P.fireT = 0; P.wrecked = false;
    const PAL = [0xd50000, 0x1565c0, 0x2e7d32, 0xffc400, 0x111111, 0xf5f5f5, 0x6a1b9a, 0xff6d00, 0x00838f];
    P.setColor(PAL[Math.floor(rnd() * PAL.length)]);
    const seen = G.Police.cops.some((c) => Math.hypot(c.x - P.x, c.z - P.z) < 70);
    if (G.Police.active && !seen) { G.Police.end(); G.Police.cooldown = 15; G.UI.toast("🎨 PAY 'N' SPRAY: Xe đã sửa, sơn mới — cảnh sát mất dấu bạn!", 3000); }
    else G.UI.toast(G.Police.active ? '🎨 Xe đã sửa — nhưng cảnh sát vẫn thấy bạn!' : '🎨 Xe đã được sửa & sơn mới!', 2600);
    G.persist();
  }
  function applyOutfit() { const o = OUTFITS[G.save.outfit || 0]; if (o && Gm().setOutfit) Gm().setOutfit(o); attachGun(); }

  // ---------------- Health / damage ----------------
  T.damage = function (n, why) {
    if (T.dead || n <= 0) return;
    if (G.Admin && G.Admin.god) return;
    if (T.armor > 0) { const a = Math.min(T.armor, n * 0.7); T.armor -= a; n -= a; }
    T.hp -= n; G.save.armor = T.armor;
    if (hud) { hud.bars.classList.remove('hit'); void hud.bars.offsetWidth; hud.bars.classList.add('hit'); }
    if (T.hp <= 0) T.wasted(why);
  };
  function overlay(title, sub, cls) {
    hud.over.className = 'gta-over ' + cls;
    hud.over.querySelector('.go-t').textContent = title; hud.over.querySelector('.go-s').textContent = sub || '';
    document.body.classList.add('gta-' + cls);
  }
  function clearOverlay() { hud.over.className = 'gta-over hidden'; document.body.classList.remove('gta-wasted', 'gta-busted'); }
  T.wasted = function (why) {
    if (T.dead) return;
    T.dead = true; T.frozen = true; T.hp = 0; T.firing = false; T.aiming = false;
    G.Audio.fail && G.Audio.fail();
    overlay('WASTED', why || '', 'wasted');
    setTimeout(() => {
      const fee = Math.min(G.save.cash, 1500); G.save.cash -= fee;
      if (G.Jobs && G.Jobs.mode) G.Jobs.end(true);
      if (G.Events.active) G.Events.abort(true);
      if (G.Police.active) G.Police.end(); G.Police.cooldown = 10;
      if (Gm().player.wrecked) Gm().previewCar(G.save.selected);
      const h = venue('hospital'); Gm().respawn(h.pose, h.carPose);
      T.hp = 100; T.dead = false; T.frozen = false; clearOverlay();
      G.UI.toast('🏥 Bệnh viện Chợ Rẫy: viện phí ' + G.fmtMoney(fee), 3500); G.persist();
    }, 4200);
  };
  T.busted = function () {
    if (T.dead) return;
    T.frozen = true; T.firing = false; T.aiming = false;
    if (G.Police.active) G.Police.end(); G.Police.cooldown = 10;
    overlay('BUSTED', 'Bị bắt giữ', 'busted');
    setTimeout(() => {
      if (G.Jobs && G.Jobs.mode) G.Jobs.end(true);
      const p = venue('police'); Gm().respawn(p.pose, p.carPose);
      T.frozen = false; clearOverlay();
    }, 3200);
  };

  // ---------------- Effects / sound ----------------
  const tracers = [];
  function tracer(a, b, col) {
    let t = tracers.find((x) => x.life <= 0);
    if (!t) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      t = { line: new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 2.4, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), life: 0 };
      t.line.frustumCulled = false; scene().add(t.line); tracers.push(t);
    }
    const p = t.line.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
    t.line.material.color.copy(col || new THREE.Color(3, 2.4, 1.2)); t.line.visible = true; t.life = 0.06;
  }
  function sparks(p, n, c) { for (let i = 0; i < n; i++) G.FX.spark.emit({ x: p.x, y: p.y, z: p.z, vx: (rnd() - 0.5) * 8, vy: rnd() * 5, vz: (rnd() - 0.5) * 8, max: 0.2 + rnd() * 0.3, s0: 0.15, s1: 0.03, r: c ? c[0] : 3.4, g: c ? c[1] : 2.2, b: c ? c[2] : 0.8, a: 1, drag: 2, grav: 12 }); }
  function puff(p, n, dark) { for (let i = 0; i < n; i++) G.FX.smoke.emit({ x: p.x + (rnd() - 0.5), y: p.y, z: p.z + (rnd() - 0.5), vx: (rnd() - 0.5) * 2, vy: 1 + rnd() * 2, vz: (rnd() - 0.5) * 2, max: 1 + rnd() * 1.5, s0: 0.6, s1: 3.5, r: dark ? 0.12 : 0.7, g: dark ? 0.11 : 0.68, b: dark ? 0.1 : 0.65, a: 0.55, drag: 0.8, grav: -0.6 }); }
  function explosion(x, y, z, owner) {
    for (let i = 0; i < 70; i++) G.FX.spark.emit({ x, y: y + 1, z, vx: (rnd() - 0.5) * 26, vy: rnd() * 18, vz: (rnd() - 0.5) * 26, max: 0.5 + rnd() * 0.7, s0: 0.5, s1: 0.1, r: 4, g: 1.6 + rnd(), b: 0.3, a: 1, drag: 1.4, grav: 9 });
    for (let i = 0; i < 40; i++) G.FX.smoke.emit({ x: x + (rnd() - 0.5) * 3, y: y + 1, z: z + (rnd() - 0.5) * 3, vx: (rnd() - 0.5) * 8, vy: 3 + rnd() * 6, vz: (rnd() - 0.5) * 8, max: 2.5 + rnd() * 2, s0: 2, s1: 9, r: 0.1, g: 0.09, b: 0.08, a: 0.7, drag: 1, grav: -0.5 });
    G.Audio.explosion && G.Audio.explosion(G.clamp(1 - Math.hypot(x - Gm().focus().x, z - Gm().focus().z) / 200, 0.1, 1));
    // blast damage
    const F = Gm().focus(), d = Math.hypot(F.x - x, F.z - z);
    if (d < 9 && !(owner && owner === Gm().player && !Gm().onFoot)) T.damage(70 * (1 - d / 9), 'Nổ xe');
    for (const p of T.peds) { const dp = Math.hypot(p.c.x - x, p.c.z - z); if (dp < 9 && p.state !== 'dead') hurtPed(p, 120 * (1 - dp / 9), x, z, true); }
    for (const t of G.Traffic.cars) if (Math.hypot(t.x - x, t.z - z) < 8 && !t.police) hitTraffic(t, 200, true);
    if (Gm().onFoot && d < 30) scareAll(x, z, 60);
  }
  T.explosion = explosion;

  // ---------------- Vehicles: health, smoke, fire, explosion ----------------
  const wrecks = [];
  function vehHealth(v) { if (v.health === undefined) v.health = 1000; return v.health; }
  function hurtVehicle(v, n) {
    if (v.wrecked) return;
    vehHealth(v); v.health -= n;
    if (v.isSuspect) v.hp = Math.max(0, (v.hp || 100) - n / 10);
  }
  function blowVehicle(v) {
    if (v.wrecked) return;
    v.wrecked = true; v.health = 0; v.burnT = 12;
    explosion(v.x, v.y, v.z, v);
    if (v.ud && v.ud.paint) v.ud.paint.color.setRGB(0.025, 0.022, 0.02);
    if (v.perf) { v.perf.maxSpeed = 2; v.perf.accel = 1; }
    if (v.isSuspect) v.hp = 0;
    v.vy = 6; v.grounded = false;
    if (v.isCop) { const i = G.Police.cops.indexOf(v); if (i >= 0) G.Police.cops.splice(i, 1); wrecks.push({ v, t: 25 }); }
    if (v === Gm().player && !Gm().onFoot) T.wasted('Xe phát nổ');
  }
  function updateVehicle(v, dt) {
    if (!v || v.health === undefined) return;
    if (v.wrecked) {
      v.burnT -= dt;
      if (v.burnT > 0 && rnd() < dt * 20) { puff({ x: v.x, y: v.y + 1.2, z: v.z }, 1, true); G.FX.spark.emit({ x: v.x + (rnd() - 0.5) * 1.5, y: v.y + 1, z: v.z + (rnd() - 0.5) * 2, vx: 0, vy: 2 + rnd() * 2, vz: 0, max: 0.5, s0: 0.6, s1: 0.1, r: 4, g: 1.4, b: 0.2, a: 1, drag: 1, grav: -2 }); }
      return;
    }
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading), hood = { x: v.x + fx * v.L * 0.35, y: v.y + 1, z: v.z + fz * v.L * 0.35 };
    if (v.health < 400 && rnd() < dt * (v.health < 200 ? 18 : 8)) puff(hood, 1, v.health < 250);
    if (v.health < 200) {
      v.fireT = (v.fireT || 0) + dt;
      if (rnd() < dt * 25) G.FX.spark.emit({ x: hood.x + (rnd() - 0.5), y: hood.y, z: hood.z + (rnd() - 0.5), vx: v.vx * 0.5, vy: 2 + rnd() * 2, vz: v.vz * 0.5, max: 0.4, s0: 0.5, s1: 0.1, r: 4, g: 1.5, b: 0.2, a: 1, drag: 1, grav: -2 });
      if (v === Gm().player && !Gm().onFoot && Math.floor(v.fireT * 2) !== Math.floor((v.fireT - dt) * 2)) G.UI.toast('🔥 XE ĐANG CHÁY — XUỐNG XE NGAY (F)!', 900);
      if (v.fireT > 6 || v.health < -200) blowVehicle(v);
    }
  }
  function hitTraffic(t, n, blast) {
    t.hp = (t.hp === undefined ? 500 : t.hp) - n;
    if (!t.wrecked) { t.wrecked = 3 + rnd() * 2; t.yaw = (rnd() - 0.5) * 0.6; }
    if (t.hp <= 0 && !t.blown) {
      t.blown = true;
      const wreck = G.CarModels.buildTraffic(t.type < 0 ? 0 : t.type, 0x141414);
      wreck.position.set(t.x, 0, t.z); wreck.rotation.y = t.heading; scene().add(wreck);
      const ghost = { x: t.x, y: 0, z: t.z, heading: t.heading, L: t.L, health: 0, wrecked: true, burnT: 14, vx: 0, vz: 0 };
      wrecks.push({ mesh: wreck, v: ghost, t: 30 });
      if (!blast) explosion(t.x, 0, t.z);
      G.Traffic.remove(t, true);
    }
  }

  // ---------------- Pedestrians ----------------
  const MAXP = { low: 5, medium: 9, high: 14, ultra: 20 };
  function pedPath(p) {
    const L = G.W.lines, o = G.CFG.ROAD / 2 + 2;
    const x0 = L[p.bi] + o, x1 = L[p.bi + 1] - o, z0 = L[p.bj] + o, z1 = L[p.bj + 1] - o;
    return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  }
  function spawnPed(F) {
    const W = G.W, P = G.CFG.PITCH, N = G.CFG.N;
    const fb = Math.floor((F.x + G.CFG.HALF) / P), fj = Math.floor((F.z + G.CFG.HALF) / P);
    for (let tries = 0; tries < 12; tries++) {
      const bi = G.clamp(fb + Math.floor(rnd() * 5) - 2, 0, N - 1), bj = G.clamp(fj + Math.floor(rnd() * 5) - 2, 0, N - 1);
      const t = W.blockType(bi, bj); if (t === 'park' || t === 'plaza') continue;
      const p = { bi, bj, k: Math.floor(rnd() * 4), dir: rnd() < 0.5 ? 1 : -1, hp: 100, state: 'walk', fleeT: 0 };
      const path = pedPath(p), a = path[p.k], b = path[(p.k + 1) % 4], u = rnd();
      const x = G.lerp(a.x, b.x, u), z = G.lerp(a.z, b.z, u), d = Math.hypot(x - F.x, z - F.z);
      if (d < 30 || d > 120) continue;
      p.c = new G.Character({ npc: true });
      p.c.mesh.traverse((o) => { o.castShadow = false; });
      p.c.setPose(x, z, 0); p.k = p.dir > 0 ? (p.k + 1) % 4 : p.k; p.speedK = 0.8 + rnd() * 0.4;
      scene().add(p.c.mesh); T.peds.push(p);
      return;
    }
  }
  function hurtPed(p, n, fx, fz, knock) {
    if (p.state === 'dead') return;
    p.hp -= n;
    const dx = p.c.x - fx, dz = p.c.z - fz, d = Math.hypot(dx, dz) || 1;
    if (p.hp <= 0) { p.state = 'dead'; p.deadT = 14; p.c.knock(dx / d * 4, dz / d * 4); p.c.knockT = 1e6; }
    else { if (knock) p.c.knock(dx / d * 3, dz / d * 3); flee(p, fx, fz); }
  }
  function flee(p, x, z) { if (p.state === 'dead') return; p.state = 'flee'; p.fleeT = 5 + rnd() * 4; p.fx = x; p.fz = z; }
  function scareAll(x, z, r) { for (const p of T.peds) if (Math.hypot(p.c.x - x, p.c.z - z) < r) flee(p, x, z); }
  T.scare = scareAll;
  function updatePeds(dt, F) {
    const inCity = Math.abs(F.x) < G.CFG.HALF + 40 && Math.abs(F.z) < G.CFG.HALF + 40;
    const max = inCity ? (MAXP[G.save.settings.quality] || 9) : 0;
    if (T.peds.length < max && rnd() < dt * 3) spawnPed(F);
    const P = Gm().player, bodies = [];
    if (!Gm().onFoot) bodies.push(P);
    for (const c of G.Police.cops) bodies.push(c);
    for (const t of G.Traffic.cars) if (Math.abs(t.x - F.x) < 130 && Math.abs(t.z - F.z) < 130) bodies.push(t);
    for (let i = T.peds.length - 1; i >= 0; i--) {
      const p = T.peds[i], c = p.c, d = Math.hypot(c.x - F.x, c.z - F.z);
      if (d > 150 || (p.state === 'dead' && (p.deadT -= dt) < 0)) { c.dispose(); T.peds.splice(i, 1); continue; }
      if (p.state === 'dead') { c.control(0, 0); c.update(dt); continue; }
      if (p.state === 'flee') {
        p.fleeT -= dt;
        const dx = c.x - p.fx, dz = c.z - p.fz, l = Math.hypot(dx, dz) || 1;
        c.control(dx / l, dz / l, true, false, false);
        if (p.fleeT <= 0) { p.state = 'walk'; const path = pedPath(p); let best = 0, bd = Infinity; path.forEach((q, k) => { const dd = Math.hypot(q.x - c.x, q.z - c.z); if (dd < bd) { bd = dd; best = k; } }); p.k = best; }
      } else {
        const path = pedPath(p), tg = path[p.k], dx = tg.x - c.x, dz = tg.z - c.z, l = Math.hypot(dx, dz);
        if (l < 1.2) p.k = (p.k + p.dir + 4) % 4;
        c.control(dx / (l || 1) * p.speedK, dz / (l || 1) * p.speedK, false, false, true);
      }
      const wasDown = c.knockT > 0;
      c.update(dt);
      // cars knock pedestrians down (and fast cars kill them)
      const near = bodies.filter((b) => Math.abs(b.x - c.x) < 6 && Math.abs(b.z - c.z) < 6);
      if (near.length) {
        c.collideCars(near);
        if (c.hitBy && !wasDown) {
          const b = c.hitBy, sp = Math.hypot(b.vx || 0, b.vz || 0); c.hitBy = null;
          hurtPed(p, sp * 4, b.x, b.z, false);
          if (b === P && !Gm().onFoot) { crime(0.6, c.x, c.z); if (G.Jobs && G.Jobs.mode === 'taxi') G.UI.toast('🧑 Khách: Trời ơi, anh tông người ta rồi!', 2000); }
          scareAll(c.x, c.z, 25);
        }
      }
      // player on foot bumps into people
      if (Gm().onFoot) {
        const C = Gm().char, ex = c.x - C.x, ez = c.z - C.z, ed = Math.hypot(ex, ez);
        if (ed < 0.7 && ed > 0.01) { c.x += ex / ed * (0.7 - ed); c.z += ez / ed * (0.7 - ed); }
      }
    }
  }

  // ---------------- Crime → wanted level ----------------
  let crimeCd = 0;
  function crime(heat, x, z) {
    if (crimeCd > 0 || (G.Jobs && G.Jobs.mode === 'police') || (G.Net && G.Net.connected) || G.Events.active) return;
    const copSees = G.Traffic.cars.some((t) => t.police && Math.hypot(t.x - x, t.z - z) < 150) || G.Police.cops.some((c) => Math.hypot(c.x - x, c.z - z) < 200);
    if (copSees || rnd() < 0.45) { G.Police.cooldown = 0; G.Police.addHeat(heat); crimeCd = 1; }
  }

  // ---------------- Shooting ----------------
  T.shotT = 0; let fireCd = 0;
  function muzzle() {
    const C = Gm().char, fx = Math.sin(C.heading), fz = Math.cos(C.heading);
    return new THREE.Vector3(C.x + fx * 0.6 - fz * 0.25, C.y + 1.38, C.z + fz * 0.6 + fx * 0.25);
  }
  // ray vs targets (peds, cars, traffic) and the world; returns the closest hit
  function raycast(o, d, range) {
    let best = { t: range, kind: 'none' };
    const sphere = (cx, cy, cz, r, kind, ref) => {
      const lx = cx - o.x, ly = cy - o.y, lz = cz - o.z, tc = lx * d.x + ly * d.y + lz * d.z; if (tc < 0) return;
      const d2 = lx * lx + ly * ly + lz * lz - tc * tc; if (d2 > r * r) return;
      const t = tc - Math.sqrt(r * r - d2); if (t > 0.3 && t < best.t) best = { t, kind, ref, head: kind === 'ped' && cy > 0 && o.y + d.y * t > cy + 0.25 };
    };
    for (const p of T.peds) if (p.state !== 'dead') sphere(p.c.x, p.c.y + 1.05, p.c.z, 0.55, 'ped', p);
    const cars = [...G.Police.cops, ...Gm().parked, ...(G.Jobs ? G.Jobs.bodies() : [])];
    if (Gm().onFoot) cars.push(Gm().player);
    for (const v of cars) { const fx = Math.sin(v.heading), fz = Math.cos(v.heading), q = v.L * 0.25; sphere(v.x + fx * q, v.y + 0.8, v.z + fz * q, 1.25, 'car', v); sphere(v.x - fx * q, v.y + 0.8, v.z - fz * q, 1.25, 'car', v); }
    for (const t of G.Traffic.cars) if (Math.abs(t.x - o.x) < range && Math.abs(t.z - o.z) < range) { const fx = Math.sin(t.heading), fz = Math.cos(t.heading), q = t.L * 0.25; sphere(t.x + fx * q, 0.8, t.z + fz * q, 1.2, t.police ? 'tcop' : 'traffic', t); sphere(t.x - fx * q, 0.8, t.z - fz * q, 1.2, t.police ? 'tcop' : 'traffic', t); }
    // world: walls (march) and the ground
    for (let s = 1.5; s < best.t; s += 1.5) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      if (y <= G.W.groundHeight(x, z)) { best = { t: s, kind: 'ground' }; break; }
      let wall = false; G.W.collideCircle(x, z, 0.05, () => { wall = true; });
      if (wall && y < 60) { best = { t: s, kind: 'wall' }; break; }
    }
    best.p = new THREE.Vector3(o.x + d.x * best.t, o.y + d.y * best.t, o.z + d.z * best.t);
    return best;
  }
  function fire() {
    const W = WEAP[T.weapon], C = Gm().char;
    if (T.weapon !== 'fist' && ammo(T.weapon) <= 0) { G.UI.toast('Hết đạn! Mua thêm ở AMMU-NATION', 1500); T.weapon = 'fist'; return; }
    fireCd = W.rate; T.shotT = 1.2;
    const cam = G.R.camera; cam.getWorldDirection(v1);
    // face where we shoot
    C.heading = Math.atan2(v1.x, v1.z); C.sync();
    if (T.weapon === 'fist') { punch(); return; }
    owned()[T.weapon]--;
    const m = muzzle();
    // shoot from the camera ray so the crosshair is exact, starting next to the player
    const o = cam.position.clone().addScaledVector(v1, cam.position.distanceTo(m) * 0.9);
    let aim = null;
    if (!T.aiming) aim = softLock(m, v1, W.range); // hip fire: help a little
    const n = W.pellets || 1;
    for (let k = 0; k < n; k++) {
      const d = (aim ? aim.clone().sub(o).normalize() : v1.clone());
      d.x += (rnd() - 0.5) * W.spread * 2; d.y += (rnd() - 0.5) * W.spread * 2; d.z += (rnd() - 0.5) * W.spread * 2; d.normalize();
      const h = raycast(o, d, W.range);
      tracer(m, h.p);
      applyHit(h, W.dmg * (h.head ? 2.5 : 1), d);
    }
    G.FX.spark.emit({ x: m.x, y: m.y, z: m.z, vx: v1.x * 3, vy: 0.5, vz: v1.z * 3, max: 0.06, s0: 1.2, s1: 0.4, r: 4, g: 3, b: 1.2, a: 1, drag: 0, grav: 0 });
    G.Audio.gun && G.Audio.gun(T.weapon);
    scareAll(C.x, C.z, 45);
    if (G.Police.cops.some((c) => Math.hypot(c.x - C.x, c.z - C.z) < 70) || G.Traffic.cars.some((t) => t.police && Math.hypot(t.x - C.x, t.z - C.z) < 70)) crime(0.4, C.x, C.z);
  }
  function softLock(o, d, range) {
    let best = null, bs = 0.82; // ~35° lock-on cone for hip fire
    const test = (x, y, z) => { v2.set(x - o.x, y - o.y, z - o.z); const l = v2.length(); if (l > range) return; const c = v2.dot(d) / l; if (c > bs) { bs = c; best = new THREE.Vector3(x, y, z); } };
    for (const p of T.peds) if (p.state !== 'dead') test(p.c.x, p.c.y + 1.1, p.c.z);
    for (const c of G.Police.cops) test(c.x, c.y + 0.9, c.z);
    return best;
  }
  function applyHit(h, dmg, d) {
    if (h.kind === 'ped') { hurtPed(h.ref, dmg, h.p.x - d.x, h.p.z - d.z, dmg > 25); crime(h.ref.hp <= 0 ? 1 : 0.5, h.p.x, h.p.z); puff(h.p, 2); }
    else if (h.kind === 'car') { hurtVehicle(h.ref, dmg * 4); sparks(h.p, 4); if (h.ref.isCop) crime(0.6, h.p.x, h.p.z); }
    else if (h.kind === 'traffic' || h.kind === 'tcop') { hitTraffic(h.ref, dmg * 4); sparks(h.p, 4); crime(h.kind === 'tcop' ? 1 : 0.3, h.p.x, h.p.z); }
    else if (h.kind === 'wall' || h.kind === 'ground') { sparks(h.p, 3, [2, 1.8, 1.4]); puff(h.p, 1); }
  }
  function punch() {
    const C = Gm().char, fx = Math.sin(C.heading), fz = Math.cos(C.heading);
    G.Audio.punch && G.Audio.punch();
    for (const p of T.peds) {
      if (p.state === 'dead') continue;
      const dx = p.c.x - C.x, dz = p.c.z - C.z, d = Math.hypot(dx, dz);
      if (d < 2.3 && (dx * fx + dz * fz) / (d || 1) > 0.5) { hurtPed(p, WEAP.fist.dmg, C.x, C.z, true); crime(0.3, C.x, C.z); break; }
    }
    // swing animation
    T.punchT = 0.25;
  }

  // ---------------- Cops shoot back at 3★+ ----------------
  function copsShoot(dt, F) {
    if (!G.Police.active || Math.ceil(G.Police.heat) < 3 || T.dead || T.frozen) return;
    for (const c of G.Police.cops) {
      if (c.wrecked) continue;
      c.gunT = (c.gunT === undefined ? 1 + rnd() : c.gunT) - dt;
      if (c.gunT > 0) continue;
      c.gunT = 0.7 + rnd() * 0.8;
      const d = Math.hypot(F.x - c.x, F.z - c.z);
      if (d > 55 || G.W.segmentBlocked(c.x, c.z, F.x, F.z)) continue;
      const a = new THREE.Vector3(c.x, (c.y || 0) + 1.4, c.z), hitChance = G.clamp(0.75 - d / 90 - (F.speed || 0) / 45, 0.08, 0.7);
      const hit = rnd() < hitChance;
      const b = new THREE.Vector3(F.x + (hit ? 0 : (rnd() - 0.5) * 4), (F.y || 0) + (hit ? 1.1 : 0.3 + rnd() * 2), F.z + (hit ? 0 : (rnd() - 0.5) * 4));
      tracer(a, b, new THREE.Color(3.2, 2.6, 1.6));
      G.Audio.gun && G.Audio.gun('pistol', G.clamp(1 - d / 80, 0.15, 0.8));
      if (hit) {
        if (Gm().onFoot) T.damage(5 + rnd() * 5, 'Bị cảnh sát bắn hạ');
        else { hurtVehicle(Gm().player, 18 + rnd() * 14); T.damage(1.5, 'Bị cảnh sát bắn hạ'); sparks(b, 3); }
      } else sparks(b, 2, [2, 1.8, 1.4]);
    }
  }

  // ---------------- Gun model in the hand ----------------
  let gun = null, gunFor = null;
  function attachGun() {
    const C = Gm().char; if (!C || !C.J || !C.J.elR) return;
    if (gun && gun.parent) gun.parent.remove(gun);
    gun = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: G.col(0x1b1c1f), metalness: 0.7, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.3), m); body.position.set(0, 0, 0.1); gun.add(body);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.06), m); grip.position.set(0, -0.08, 0); gun.add(grip);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.4), m); barrel.position.set(0, 0.01, 0.3); gun.add(barrel); gun.userData.barrel = barrel;
    gun.position.set(0, -0.3, 0.06); gun.rotation.x = Math.PI / 2;
    C.J.elR.add(gun); gunFor = C;
  }
  function poseArms(dt) {
    const C = Gm().char; if (!C || !C.J) return;
    if (gunFor !== C) attachGun();
    const armed = T.weapon !== 'fist';
    if (gun) { gun.visible = armed && Gm().onFoot; gun.userData.barrel.scale.z = T.weapon === 'pistol' ? 0.4 : (T.weapon === 'smg' ? 0.8 : 1.6); }
    if (!Gm().onFoot || Gm().flying || T.dead) return;
    if (armed && (T.aiming || T.shotT > 0)) {
      // face the camera direction, right arm (and left for long guns) raised forward
      G.R.camera.getWorldDirection(v1);
      C.heading = Math.atan2(v1.x, v1.z);
      const pitch = Math.asin(G.clamp(v1.y, -0.8, 0.8));
      C.J.shR.rotation.set(-Math.PI / 2 - pitch, 0, 0.05); C.J.elR.rotation.x = 0;
      if (T.weapon !== 'pistol') { C.J.shL.rotation.set(-Math.PI / 2 - pitch + 0.15, 0, -0.5); C.J.elL.rotation.x = -0.6; }
      C.sync();
    } else if (T.punchT > 0) {
      T.punchT -= dt; C.J.shR.rotation.set(-Math.PI / 2, 0, 0.1); C.J.elR.rotation.x = 0;
    }
  }

  // ---------------- Input ----------------
  T.firing = false;
  window.addEventListener('pointerdown', (e) => {
    if (!e.target || e.target.id !== 'game') return;
    const g = Gm(); if (!g || g.state !== 'play' || g.paused || g.simPaused || !g.onFoot || g.flying || T.frozen) return;
    if (e.button === 0) T.firing = true;
    if (e.button === 2) T.aiming = T.weapon !== 'fist';
  });
  window.addEventListener('pointerup', (e) => { if (e.button === 0) T.firing = false; if (e.button === 2) T.aiming = false; });
  window.addEventListener('blur', () => { T.firing = false; T.aiming = false; });
  function selectWeapon(id) {
    if (!hasW(id)) { G.UI.toast(WEAP[id].name + ' chưa có — mua ở AMMU-NATION (🔫 trên bản đồ)', 2000); return; }
    T.weapon = id; G.save.weapon = id; lastHud = '';
  }
  window.addEventListener('keydown', (e) => {
    const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.repeat) return;
    const g = Gm(); if (!g || g.state !== 'play') return;
    if (T.shopOpen && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); G.input.consume('Escape'); closeShop(); return; }
    if (g.paused || g.simPaused || T.frozen) return;
    if (g.onFoot && /^Digit[1-5]$/.test(e.code) && !(G.UI.switcherOpen && G.UI.switcherOpen())) {
      const slot = +e.code.slice(5), id = Object.keys(WEAP).find((k) => WEAP[k].slot === slot); if (id) selectWeapon(id);
    }
    if (e.code === 'KeyE') {
      const v = nearVenue(g.focus()); if (!v) return;
      if (v.id === 'spray') { if (!g.onFoot) sprayCar(); return; }
      if (!g.onFoot && v.id !== 'hospital') return;
      openVenue(v);
    }
  });
  window.addEventListener('wheel', (e) => {
    const g = Gm(); if (!g || g.state !== 'play' || !g.onFoot || g.paused || g.simPaused || (G.UI && G.UI.mapOpen) || e.target.id !== 'game') return;
    const list = Object.keys(WEAP).filter(hasW), i = list.indexOf(T.weapon);
    selectWeapon(list[(i + (e.deltaY > 0 ? 1 : -1) + list.length) % list.length]);
  }, { passive: true });

  // ---------------- Per frame ----------------
  let inited = false;
  T.update = function (dt, F) {
    const g = Gm();
    if (!inited) { inited = true; initHud(); buildVenues(); T.armor = G.save.armor || 0; T.weapon = hasW(G.save.weapon) ? G.save.weapon : 'fist'; if (G.save.outfit) applyOutfit(); }
    crimeCd -= dt; fireCd -= dt; T.shotT -= dt;
    for (const t of tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.visible = false; }
    // shooting / punching on foot
    if (g.onFoot && !g.flying && !T.frozen) {
      if (T.firing && fireCd <= 0) { fire(); if (!WEAP[T.weapon].auto) T.firing = false; }
    } else { T.aiming = false; T.firing = false; }
    poseArms(dt);
    // falling + getting hit by cars hurts
    const C = g.char;
    if (g.onFoot && !g.flying && C) {
      if (C.landImp > 13) { T.damage((C.landImp - 12) * 4, 'Ngã từ trên cao'); C.landImp = 0; }
      if (C.knockT > 2.1 && !T.knockSeen) { T.knockSeen = true; T.damage(25, 'Bị xe tông'); } else if (C.knockT <= 0) T.knockSeen = false;
    }
    // player's car: crash damage, smoke / fire / explosion
    const P = g.player; vehHealth(P);
    if (!g.onFoot && P.impact > 8 && !P.wrecked) { hurtVehicle(P, (P.impact - 6) * 14); if (P.impact > 22) T.damage((P.impact - 22) * 1.2, 'Tai nạn giao thông'); }
    updateVehicle(P, dt);
    for (const v of g.parked) updateVehicle(v, dt);
    for (const c of G.Police.cops) { updateVehicle(c, dt); if (c.health !== undefined && c.health < 0 && !c.wrecked) blowVehicle(c); }
    for (const v of (G.Jobs ? G.Jobs.bodies() : [])) updateVehicle(v, dt);
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const w = wrecks[i]; w.t -= dt; updateVehicle(w.v, dt);
      if (w.v.update && w.v.isCop) { Object.assign(w.v.input, { throttle: 0, brake: 1, steer: 0, handbrake: true, nitro: false }); w.v.update(dt); w.v.syncMesh(dt); }
      if (w.t <= 0) { scene().remove(w.mesh || w.v.mesh); wrecks.splice(i, 1); }
    }
    copsShoot(dt, F);
    updatePeds(dt, F);
    // venue rings pulse
    if (venues) for (const v of venues) { v.ring.material.opacity = 0.5 + Math.sin(g.time * 4) * 0.3; v.icon3d.position.y = 3 + Math.sin(g.time * 2) * 0.25; }
    // slow regen when not in danger (like GTA up to half health)
    if (!G.Police.active && T.hp < 50 && !T.dead) T.hp = Math.min(50, T.hp + dt * 1.5);
    updateHud(dt, F);
  };
  return T;
})();
