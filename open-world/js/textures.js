// ================================================================
//  Procedural textures (canvas) — no external image files needed
// ================================================================
'use strict';

G.TEX = (function () {
  const T = {};
  const rnd = Math.random;

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, repeat, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function noiseFill(ctx, w, h, base, amp, count, size) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < count; i++) {
      const v = (rnd() - 0.5) * amp;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      const s = 1 + rnd() * size;
      ctx.fillRect(rnd() * w, rnd() * h, s, s);
    }
  }

  T.asphalt = function () {
    const c = canvas(512, 512), x = c.getContext('2d');
    noiseFill(x, 512, 512, '#3a3d42', 0.22, 26000, 2.2);
    // cracks / patches
    for (let i = 0; i < 14; i++) {
      x.fillStyle = `rgba(20,20,24,${0.12 + rnd() * 0.12})`;
      x.beginPath(); x.ellipse(rnd() * 512, rnd() * 512, 20 + rnd() * 60, 10 + rnd() * 30, rnd() * 3, 0, 7); x.fill();
    }
    return tex(c);
  };
  T.grass = function () {
    const c = canvas(512, 512), x = c.getContext('2d');
    noiseFill(x, 512, 512, '#4f6b32', 0.25, 30000, 2.5);
    for (let i = 0; i < 40; i++) {
      x.fillStyle = `rgba(${90 + rnd() * 40},${100 + rnd() * 40},40,0.18)`;
      x.beginPath(); x.ellipse(rnd() * 512, rnd() * 512, 30 + rnd() * 80, 20 + rnd() * 50, rnd() * 3, 0, 7); x.fill();
    }
    return tex(c);
  };
  T.sand = function () {
    const c = canvas(256, 256), x = c.getContext('2d');
    noiseFill(x, 256, 256, '#d8c497', 0.18, 9000, 1.6);
    return tex(c);
  };
  T.concrete = function () {
    const c = canvas(256, 256), x = c.getContext('2d');
    noiseFill(x, 256, 256, '#9d9a94', 0.14, 7000, 1.5);
    x.strokeStyle = 'rgba(40,40,40,0.35)'; x.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    return tex(c);
  };
  T.plaza = function () {
    const c = canvas(256, 256), x = c.getContext('2d');
    noiseFill(x, 256, 256, '#8c8580', 0.12, 5000, 1.5);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      if ((i + j) % 2) { x.fillStyle = 'rgba(120,60,50,0.25)'; x.fillRect(i * 32, j * 32, 32, 32); }
    }
    return tex(c);
  };

  // Building façades: cells x cells windows per texture. Returns {map, emissive}
  T.facade = function (style) {
    const S = 256, cells = 8, cs = S / cells;
    const cm = canvas(S, S), xm = cm.getContext('2d');
    const ce = canvas(S, S), xe = ce.getContext('2d');
    const st = {
      glass:  { frame: '#27313d', win: ['#5f7f9f', '#6d8db0', '#4f6d8a'], m: 2, ribbon: false },
      office: { frame: '#b9b3a7', win: ['#2c3440', '#323c4a', '#263040'], m: 6, ribbon: false },
      brick:  { frame: '#8b4c39', win: ['#1f2832', '#27323e'], m: 9, ribbon: false },
      modern: { frame: '#e4e2dc', win: ['#1d2630', '#253140'], m: 4, ribbon: true },
      dark:   { frame: '#16181d', win: ['#2e3946', '#354253'], m: 3, ribbon: false },
      house:  { frame: '#dccdb2', win: ['#34404c', '#3c4855'], m: 10, ribbon: false },
    }[style];
    xm.fillStyle = st.frame; xm.fillRect(0, 0, S, S);
    // subtle frame noise
    for (let i = 0; i < 2500; i++) { xm.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; xm.fillRect(rnd() * S, rnd() * S, 2, 2); }
    xe.fillStyle = '#000'; xe.fillRect(0, 0, S, S);
    const warm = ['#ffd9a0', '#ffe7c2', '#ffc87a', '#fff1d6'], cool = ['#cfe6ff', '#a9d4ff', '#e6f2ff'];
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const m = st.m;
        let x0 = i * cs + m, y0 = j * cs + m, w = cs - m * 2, h = cs - m * 2.2;
        if (st.ribbon) { x0 = i * cs; w = cs; }
        if (style === 'house' && rnd() < 0.45) continue;
        const g = xm.createLinearGradient(x0, y0, x0 + w, y0 + h);
        const wc = st.win[Math.floor(rnd() * st.win.length)];
        g.addColorStop(0, wc); g.addColorStop(1, '#10161e');
        xm.fillStyle = g; xm.fillRect(x0, y0, w, h);
        // sky reflection streak
        xm.fillStyle = 'rgba(255,255,255,0.08)'; xm.fillRect(x0, y0, w * 0.35, h);
        if (rnd() < 0.42) {
          const lc = rnd() < 0.8 ? warm[Math.floor(rnd() * warm.length)] : cool[Math.floor(rnd() * cool.length)];
          xe.fillStyle = lc; xe.globalAlpha = 0.55 + rnd() * 0.45; xe.fillRect(x0, y0, w, h);
          // curtains / silhouettes
          if (rnd() < 0.3) { xe.fillStyle = '#000'; xe.globalAlpha = 0.5; xe.fillRect(x0 + w * rnd() * 0.6, y0, w * 0.3, h); }
          xe.globalAlpha = 1;
        }
      }
    }
    const map = tex(cm), emissive = tex(ce);
    map.anisotropy = emissive.anisotropy = 4;
    return { map, emissive, cells };
  };

  T.radial = function (inner, outer) {
    const c = canvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, outer);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = tex(c, 0, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  T.blob = function () {
    const c = canvas(64, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 64, 4, 32, 64, 60);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.save(); x.scale(1, 1); x.fillStyle = g; x.fillRect(0, 0, 64, 128); x.restore();
    const t = new THREE.CanvasTexture(c); return t;
  };
  T.chevron = function () {
    const c = canvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#f5b400'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#111';
    for (let i = -128; i < 256; i += 48) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 24, 0); x.lineTo(i + 24 + 128, 128); x.lineTo(i + 128, 128); x.fill(); }
    return tex(c);
  };
  T.waterNormal = function () {
    const S = 256, c = canvas(S, S), x = c.getContext('2d');
    const hgt = new Float32Array(S * S);
    const waves = [];
    for (let i = 0; i < 14; i++) waves.push({ kx: Math.round((rnd() - 0.5) * 16), ky: Math.round((rnd() - 0.5) * 16), p: rnd() * 6.28, a: 0.4 + rnd() });
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      let v = 0;
      for (const w of waves) v += Math.sin((w.kx * i + w.ky * j) / S * Math.PI * 2 + w.p) * w.a;
      hgt[j * S + i] = v;
    }
    const img = x.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const l = hgt[j * S + ((i - 1 + S) % S)], r = hgt[j * S + ((i + 1) % S)];
      const u = hgt[((j - 1 + S) % S) * S + i], d = hgt[((j + 1) % S) * S + i];
      let nx = (l - r) * 0.5, ny = (u - d) * 0.5, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const k = (j * S + i) * 4;
      img.data[k] = (nx * 0.5 + 0.5) * 255; img.data[k + 1] = (ny * 0.5 + 0.5) * 255; img.data[k + 2] = (nz * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return tex(c, 0, false);
  };
  T.billboard = function (title, sub, c1, c2) {
    const c = canvas(512, 256), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 512, 256); g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 256; i += 4) x.fillRect(0, i, 512, 1);
    x.fillStyle = '#fff'; x.font = '900 64px "Chakra Petch", Arial Black, sans-serif'; x.textAlign = 'center';
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 12;
    x.fillText(title, 256, 120);
    x.font = '700 30px "Chakra Petch", Arial, sans-serif'; x.fillText(sub, 256, 180);
    const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  };
  T.carbon = function () {
    const c = canvas(64, 64), x = c.getContext('2d');
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      x.fillStyle = (i + j) % 2 ? '#1b1d21' : '#0e0f12'; x.fillRect(i * 8, j * 8, 8, 8);
    }
    return tex(c, 6);
  };
  return T;
})();
