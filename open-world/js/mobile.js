// ================================================================
//  Phones (G.Mobile): compact UI for small landscape screens,
//  fullscreen + landscape lock, "rotate your phone" tip, an analog
//  stick + action buttons when on foot, and drag-to-look on the 3D view.
//  Desktop is untouched: everything keys off body.is-touch / body.mobile.
// ================================================================
'use strict';

G.Mobile = (function () {
  const M = { touch: false, phone: false };
  const body = document.body;
  M.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!M.touch) return M;
  body.classList.add('is-touch');

  // ---------------- Layout: scale the whole UI to the screen ----------------
  // UI was laid out for ~1280x720; on a 800x360 phone everything is shrunk with CSS zoom (#game and the
  // touch buttons are excluded so buttons stay finger-sized).
  function layout() {
    const w = innerWidth, h = innerHeight;
    M.phone = Math.min(w, h) < 600;
    body.classList.toggle('mobile', M.phone);
    body.classList.toggle('portrait', h > w);
    const z = M.phone ? G.clamp(Math.min(h / 620, w / 1100), 0.45, 1) : 1;
    document.documentElement.style.setProperty('--uiz', z.toFixed(3));
  }
  layout();
  addEventListener('resize', layout);
  addEventListener('orientationchange', () => setTimeout(layout, 250));

  // rotate tip (portrait phones)
  const tip = document.createElement('div');
  tip.id = 'rotateTip';
  tip.innerHTML = '<div class="rt-i">📱↻</div><div class="rt-t">Xoay ngang điện thoại để chơi</div><div class="rt-s">Bấm vào màn hình để vào chế độ toàn màn hình</div>';
  body.appendChild(tip);

  // ---------------- Fullscreen + landscape lock (needs a user gesture) ----------------
  let fsTry = 0;
  function goFullscreen() {
    if (!M.phone || document.fullscreenElement || document.webkitFullscreenElement) return;
    const now = performance.now(); if (now - fsTry < 2500) return; fsTry = now;
    const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return; // iPhone Safari: no fullscreen API (use "Add to Home Screen")
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* not supported */ } };
      if (p && p.then) p.then(lock).catch(() => {}); else lock();
    } catch (e) { /* ignore */ }
  }
  M.fullscreen = goFullscreen;
  addEventListener('touchend', goFullscreen, { passive: true });
  addEventListener('click', goFullscreen);

  // ---------------- Analog stick (on foot) ----------------
  const stick = { x: 0, y: 0, active: false, id: null };
  G.input.stick = stick;
  function buildFoot() {
    const T = document.getElementById('touch'); if (!T) return;
    const foot = document.createElement('div'); foot.className = 't-foot';
    foot.innerHTML = '<div class="t-stick"><div class="t-knob"></div></div>' +
      '<div class="t-acts">' +
      '<div class="tbtn small" data-hold="ShiftLeft">🏃<b>CHẠY</b></div>' +
      '<div class="tbtn small" data-tap="KeyC">⤵<b>TRƯỢT</b></div>' +
      '<div class="tbtn small" data-tap="Space">⤴<b>NHẢY</b></div>' +
      '<div class="tbtn fire" data-fire="1">🔫<b>BẮN</b></div>' +
      '</div>';
    T.appendChild(foot);
    const base = foot.querySelector('.t-stick'), knob = foot.querySelector('.t-knob');
    const R = 46;
    const move = (t) => {
      const r = base.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = t.clientX - cx, dy = t.clientY - cy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      stick.x = dx / R; stick.y = dy / R;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const find = (e) => { for (const t of e.changedTouches) if (t.identifier === stick.id) return t; return null; };
    base.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; stick.id = t.identifier; stick.active = true; move(t); }, { passive: false });
    base.addEventListener('touchmove', (e) => { e.preventDefault(); const t = find(e); if (t) move(t); }, { passive: false });
    const end = (e) => { if (!find(e)) return; e.preventDefault(); stick.active = false; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
    base.addEventListener('touchend', end, { passive: false });
    base.addEventListener('touchcancel', end, { passive: false });
    // action buttons
    foot.querySelectorAll('[data-hold]').forEach((b) => {
      const k = b.dataset.hold;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); G.input.keys[k] = true; b.classList.add('on'); }, { passive: false });
      const off = (e) => { e.preventDefault(); G.input.keys[k] = false; b.classList.remove('on'); };
      b.addEventListener('touchend', off, { passive: false }); b.addEventListener('touchcancel', off, { passive: false });
    });
    foot.querySelectorAll('[data-tap]').forEach((b) => b.addEventListener('touchstart', (e) => { e.preventDefault(); G.input.press(b.dataset.tap); }, { passive: false }));
    const fire = foot.querySelector('[data-fire]');
    fire.addEventListener('touchstart', (e) => { e.preventDefault(); if (G.GTA) G.GTA.firing = true; fire.classList.add('on'); }, { passive: false });
    const unfire = (e) => { e.preventDefault(); if (G.GTA) G.GTA.firing = false; fire.classList.remove('on'); };
    fire.addEventListener('touchend', unfire, { passive: false }); fire.addEventListener('touchcancel', unfire, { passive: false });
  }
  buildFoot();

  // ---------------- Drag on the 3D view = look around (on foot) ----------------
  const looks = new Map();
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !e.target || e.target.id !== 'game') return;
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  addEventListener('pointermove', (e) => {
    const l = looks.get(e.pointerId); if (!l) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y; l.x = e.clientX; l.y = e.clientY;
    if (G.Game && G.Game.lookDelta) G.Game.lookDelta(dx * 1.4, dy * 1.4);
  });
  const lookEnd = (e) => looks.delete(e.pointerId);
  addEventListener('pointerup', lookEnd); addEventListener('pointercancel', lookEnd);

  // ---------------- Per frame: which control set is showing ----------------
  M.update = function () {
    const g = G.Game; if (!g) return;
    const foot = !!(g.onFoot && !g.flying);
    if (foot !== M.foot) { M.foot = foot; body.classList.toggle('t-onfoot', foot); if (!foot) { stick.active = false; stick.x = stick.y = 0; G.input.keys.ShiftLeft = false; if (G.GTA) G.GTA.firing = false; } }
    const air = !!g.flying;
    if (air !== M.air) { M.air = air; body.classList.toggle('t-air', air); }
  };
  return M;
})();
