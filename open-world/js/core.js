// ================================================================
//  SPEED RUSH: OPEN CITY — core (namespace, config, save, input)
//  Plain scripts (no modules) so the game also runs from file://
// ================================================================
'use strict';

window.G = window.G || {};

// ---------------- World layout constants ----------------
G.CFG = {
  N: 12,            // city blocks per side
  PITCH: 120,       // distance between parallel road centre lines (m)
  ROAD: 24,         // road width (2 lanes each way)
  SIDEWALK: 4,
  RING_W: 32,       // ring highway width
  RING_R: 140,      // ring corner radius
  GRAVITY: 22,
  WORLD_LIMIT: 2700,
  SEA_Z: 1180,      // z beyond which the sea starts (south)
  DAY_MINUTES: 14,  // real minutes for a full in-game day
};
G.CFG.HALF = G.CFG.N * G.CFG.PITCH / 2;     // 720
G.CFG.RING = G.CFG.HALF + 110;              // ring centre-line offset (830)

// ---------------- Math helpers ----------------
G.clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
G.lerp = (a, b, t) => a + (b - a) * t;
G.smooth = (e0, e1, x) => { const t = G.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
G.wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
G.damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// Deterministic RNG so the city is the same every visit (coins are saved by index)
G.rng = (function () {
  let s = 1337;
  const r = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.seed = (v) => { s = v; };
  r.range = (a, b) => a + (b - a) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
})();

// Colours are authored in sRGB; the renderer works in linear space.
G.col = (hex) => new THREE.Color(hex).convertSRGBToLinear();

G.fmtMoney = (v) => '$' + Math.round(v).toLocaleString('en-US');
G.fmtTime = (s) => {
  if (!isFinite(s)) return '--:--.--';
  const m = Math.floor(s / 60), sec = s - m * 60;
  return String(m).padStart(2, '0') + ':' + sec.toFixed(2).padStart(5, '0');
};

// ---------------- Save data ----------------
G.SAVE_KEY = 'SPEEDRUSH_OPENCITY_V1';
G.defaultSave = () => ({
  cash: 25000,
  owned: ['kitsune'],
  selected: 'kitsune',
  colors: {},
  upgrades: {},
  coins: [],
  best: {},
  stats: { distance: 0, topSpeed: 0, bestDrift: 0, races: 0, wins: 0, escapes: 0 },
  settings: { quality: 'high', volume: 0.7, timeScale: 1, units: 'kmh' },
  hour: 17.5,
});
G.loadSave = function () {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(G.SAVE_KEY)); } catch (e) { d = null; }
  const def = G.defaultSave();
  if (!d || typeof d !== 'object') return def;
  // shallow-merge so saves from older versions get new fields
  const out = Object.assign(def, d);
  out.stats = Object.assign(G.defaultSave().stats, d.stats || {});
  out.settings = Object.assign(G.defaultSave().settings, d.settings || {});
  return out;
};
G.save = G.loadSave();
G.persist = function () {
  try { localStorage.setItem(G.SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* private mode */ }
};
G.upg = (carId) => {
  if (!G.save.upgrades[carId]) G.save.upgrades[carId] = { engine: 0, handling: 0, nitro: 0 };
  return G.save.upgrades[carId];
};

// ---------------- Input (keyboard + gamepad + touch) ----------------
G.input = (function () {
  const keys = {};
  const pressed = {};           // edge-triggered this frame
  const touch = { gas: 0, brake: 0, left: 0, right: 0, nitro: 0, hand: 0 };
  const state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, kbSteer: 0 };

  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'];
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  let padPrev = {};
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && Array.from(pads).find(Boolean);
    if (!p) return null;
    const btn = (i) => p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5);
    const val = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
    // A=interact, X=reset, Y=camera, Back=map, Start=pause, D-pad down=garage
    const map = { KeyE: btn(0), KeyR: btn(2), KeyC: btn(3), KeyM: btn(8), Escape: btn(9), KeyG: btn(13) };
    for (const k in map) { if (map[k] && !padPrev[k]) pressed[k] = true; }
    padPrev = map;
    let sx = p.axes[0] || 0; if (Math.abs(sx) < 0.12) sx = 0;
    return { throttle: val(7), brake: val(6), steer: -sx, hand: btn(1), nitro: btn(5) || btn(4) };
  }

  function update(dt) {
    const pad = pollPad();
    const up = keys.KeyW || keys.ArrowUp || touch.gas;
    const down = keys.KeyS || keys.ArrowDown || touch.brake;
    const left = keys.KeyA || keys.ArrowLeft || touch.left;
    const right = keys.KeyD || keys.ArrowRight || touch.right;
    // keyboard steering ramps in for smoother control, snaps back faster
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const rate = target === 0 ? 9 : (Math.sign(target) !== Math.sign(state.kbSteer) ? 12 : 5);
    state.kbSteer = G.damp(state.kbSteer, target, rate, dt);
    state.throttle = up ? 1 : 0;
    state.brake = down ? 1 : 0;
    state.steer = state.kbSteer;
    state.handbrake = !!(keys.Space || touch.hand);
    state.nitro = !!(keys.ShiftLeft || keys.ShiftRight || touch.nitro);
    if (pad) {
      state.throttle = Math.max(state.throttle, pad.throttle);
      state.brake = Math.max(state.brake, pad.brake);
      if (pad.steer !== 0) state.steer = pad.steer;
      state.handbrake = state.handbrake || pad.hand;
      state.nitro = state.nitro || pad.nitro;
    }
  }
  function consume(code) { const v = !!pressed[code]; pressed[code] = false; return v; }
  function endFrame() { for (const k in pressed) pressed[k] = false; }
  function bindTouch(el, name) {
    const on = (e) => { e.preventDefault(); touch[name] = 1; };
    const off = (e) => { e.preventDefault(); touch[name] = 0; };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
  }
  return { keys, state, update, consume, endFrame, bindTouch, press: (c) => { pressed[c] = true; } };
})();
