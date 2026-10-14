// ================================================================
//  Synthesised audio (Web Audio): engine, tyres, wind, nitro,
//  siren, crashes, UI — no sound files needed
// ================================================================
'use strict';

G.Audio = (function () {
  const A = { ready: false };
  let ctx, master, engine, tyres, wind, nitro, siren, music;

  function noiseBuffer(sec) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function loopNoise(filterType, freq, q) {
    const src = ctx.createBufferSource(); src.buffer = A.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { src, f, g };
  }

  A.init = function () {
    if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = G.save.settings.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    A.noise = noiseBuffer(2);

    // Engine: two detuned saws + sub square -> waveshaper -> lowpass
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o3.type = 'square';
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.5); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
    const eg = ctx.createGain(); eg.gain.value = 0;
    const g3 = ctx.createGain(); g3.gain.value = 0.5;
    o1.connect(shaper); o2.connect(shaper); o3.connect(g3); g3.connect(shaper);
    shaper.connect(lp); lp.connect(eg); eg.connect(master);
    [o1, o2, o3].forEach((o) => o.start());
    engine = { o1, o2, o3, lp, g: eg };

    tyres = loopNoise('bandpass', 1500, 4);
    wind = loopNoise('lowpass', 500, 0.7);
    nitro = loopNoise('highpass', 2500, 0.8);

    const so = ctx.createOscillator(); so.type = 'triangle'; so.frequency.value = 700;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 1.6; const lg = ctx.createGain(); lg.gain.value = 260;
    lfo.connect(lg); lg.connect(so.frequency);
    const sg = ctx.createGain(); sg.gain.value = 0; so.connect(sg); sg.connect(master); so.start(); lfo.start();
    siren = { g: sg };
    A.ready = true;
  };

  A.setVolume = function (v) { if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); };
  A.pause = function (p) { if (!ctx) return; if (p) ctx.suspend(); else ctx.resume(); };

  // Called every frame with the player's vehicle
  A.update = function (car, sirenLevel, muted) {
    if (!A.ready || !car) return;
    const t = ctx.currentTime;
    const rpm = car.rpm, thr = car.input.throttle;
    const f = rpm / 60 * 2;   // firing frequency of a 4-stroke "4 cylinder"
    engine.o1.frequency.setTargetAtTime(f, t, 0.03);
    engine.o2.frequency.setTargetAtTime(f * 1.006, t, 0.03);
    engine.o3.frequency.setTargetAtTime(f / 2, t, 0.03);
    engine.lp.frequency.setTargetAtTime(300 + rpm * 0.45 + thr * 1400, t, 0.05);
    engine.g.gain.setTargetAtTime(muted ? 0 : 0.08 + thr * 0.09 + rpm / 8000 * 0.05, t, 0.06);
    const sp = car.speed;
    const slip = car.grounded && car.surface === 'road' ? G.clamp((car.slip - 2.5) / 8, 0, 1) : 0;
    tyres.g.gain.setTargetAtTime(muted ? 0 : slip * 0.22, t, 0.05);
    tyres.f.frequency.setTargetAtTime(1100 + slip * 900, t, 0.1);
    wind.g.gain.setTargetAtTime(muted ? 0 : Math.min(0.25, sp * sp / 40000), t, 0.2);
    nitro.g.gain.setTargetAtTime(!muted && car.nitroOn ? 0.12 : 0, t, 0.05);
    siren.g.gain.setTargetAtTime(muted ? 0 : sirenLevel * 0.07, t, 0.2);
  };

  function burst(dur, freq, vol, type) {
    if (!A.ready) return;
    const s = ctx.createBufferSource(); s.buffer = A.noise;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
  }
  function tone(freq, dur, vol, type, slide) {
    if (!A.ready) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
  }
  A.crash = (power) => { const v = G.clamp(power / 25, 0.15, 1); burst(0.5, 900, 0.6 * v); tone(70, 0.4, 0.5 * v, 'sine', 35); if (power > 12) burst(0.25, 3000, 0.25 * v, 'highpass'); };
  A.land = (power) => { tone(60, 0.25, G.clamp(power / 20, 0.1, 0.6), 'sine', 30); burst(0.2, 600, 0.2); };
  A.coin = () => { tone(1320, 0.12, 0.2, 'square'); setTimeout(() => tone(1760, 0.2, 0.18, 'square'), 80); };
  A.beep = (hi) => tone(hi ? 880 : 440, hi ? 0.5 : 0.25, 0.25, 'sine');
  A.checkpoint = () => { tone(988, 0.12, 0.22, 'triangle'); setTimeout(() => tone(1318, 0.25, 0.22, 'triangle'), 90); };
  A.ui = () => tone(660, 0.06, 0.12, 'triangle');
  A.cash = () => { [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.18, 'triangle'), i * 70)); };
  A.fail = () => { tone(330, 0.3, 0.25, 'sawtooth', 160); };
  A.shift = () => burst(0.08, 1800, 0.08, 'bandpass');
  // exhaust backfire: low thump + crackle
  A.backfire = (k) => { burst(0.09, 600 + Math.random() * 600, 0.32 * k); tone(50 + Math.random() * 30, 0.09, 0.28 * k, 'square', 28); };
  // weapons + explosions (noise bursts shaped per weapon)
  A.gun = (kind, vol) => { const v = vol === undefined ? 1 : vol; const k = { pistol: [0.12, 1800, 0.45], smg: [0.07, 2400, 0.32], shotgun: [0.25, 900, 0.7], rifle: [0.14, 2000, 0.55] }[kind] || [0.1, 1800, 0.4]; burst(k[0], k[1], k[2] * v); tone(90, k[0], 0.25 * v, 'square', 40); };
  A.explosion = (vol) => { burst(1.4, 500, 0.9 * vol); tone(45, 0.9, 0.7 * vol, 'sine', 20); burst(0.3, 3000, 0.3 * vol, 'highpass'); };
  A.punch = () => { burst(0.06, 700, 0.35); tone(120, 0.06, 0.2, 'sine', 60); };
  A.horn = () => { tone(415, 0.35, 0.2, 'square'); tone(520, 0.35, 0.16, 'square'); };
  A.splash = () => burst(1.0, 1400, 0.5);
  void music;
  return A;
})();
