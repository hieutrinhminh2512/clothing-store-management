// ================================================================
//  Districts outside the grid city (G.Districts):
//   • Tân Sơn airport: taxiway, apron, terminal, control tower,
//     parked airliners, helipad, car park + access road
//   • West: Hồ Tây lake with a ring road, "Đèo Mây" winding hill
//     road through rolling hills up to a lookout
//   • East: curved "Xa lộ Đông" highway, gas station, container port
//  define() registers roads/areas before the city is built (so the
//  road mesh, minimap, GPS and onRoad know them); build() adds meshes.
// ================================================================
'use strict';

G.Districts = (function () {
  const D = { places: [], spawns: {} };
  const hills = [], containers = [], planes = [];
  let night = [], beacons = [];

  // ---------------- Layout (data only) ----------------
  D.define = function (W) {
    const R = G.rng;
    // ---- Airport (north of the ring, east of the runway) ----
    W.addPaved({ x0: 58, x1: 78, z0: -2340, z1: -900, mapColor: '#b9bec6' }, 'Đường lăn');
    for (const z of [-945, -1665, -2325]) W.addPaved({ x0: 22, x1: 58, z0: z - 15, z1: z + 15, mapColor: '#b9bec6' });
    W.addPaved({ x0: 78, x1: 380, z0: -1820, z1: -1240, mapColor: '#a9aeb6' }, 'Sân đỗ máy bay');
    W.addPaved({ x0: 478, x1: 620, z0: -1700, z1: -1380, mapColor: '#8f949c' }, 'Bãi đỗ xe sân bay');
    W.addFootprint({ x0: 380, x1: 440, z0: -1800, z1: -1260, mapColor: '#5d6f86' });
    W.addCollider({ t: 'box', x0: 380, x1: 440, z0: -1800, z1: -1260, h: 24 });
    W.addCollider({ t: 'circle', x: 330, z: -1195, r: 7, h: 64 });
    W.addRoad([{ x: 480, z: -832 }, { x: 505, z: -960 }, { x: 540, z: -1060 }, { x: 495, z: -1170 }, { x: 470, z: -1262 }, { x: 470, z: -1540 }, { x: 470, z: -1820 }], 18, 'Đường vào sân bay');
    W.noTrees({ x0: -140, x1: 680, z0: -2560, z1: -820 });
    // parked airliners (nose toward the terminal) — colliders along the fuselage
    for (const z of [-1720, -1560, -1400]) {
      planes.push({ x: 300, z, h: Math.PI / 2, livery: R.pick([0x0b4ea2, 0xd4202c, 0x00a19a]) });
      for (let k = -2; k <= 2; k++) W.addCollider({ t: 'circle', x: 300 + k * 7, z, r: 2.6, h: 9 });
    }
    D.spawns.heli = { x: 160, z: -1290, h: Math.PI };
    D.spawns.jet = { x: 120, z: -1400, h: -Math.PI / 2 };

    // ---- West: lake + lake ring road + Đèo Mây hill road ----
    const LX = -1450, LZ = 150, LR = 230;
    W.addWater({ x: LX, z: LZ, r: LR });
    const ring = []; for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; ring.push({ x: LX + Math.cos(a) * 300, z: LZ + Math.sin(a) * 300 }); }
    W.addRoad(ring, 14, 'Đường ven Hồ Tây', { closed: true });
    W.addRoad([{ x: -831, z: 30 }, { x: -980, z: 45 }, { x: -1100, z: 120 }, { x: -1150, z: 150 }], 16, 'Đường Hồ Tây');
    W.addRoad([{ x: LX, z: LZ - 300 }, { x: -1520, z: -320 }, { x: -1360, z: -480 }, { x: -1560, z: -660 }, { x: -1380, z: -860 }, { x: -1620, z: -1060 }, { x: -1440, z: -1260 }, { x: -1700, z: -1420 }, { x: -1810, z: -1590 }], 13, 'Đèo Mây');
    W.addRoad([{ x: -1380, z: -860 }, { x: -1160, z: -830 }, { x: -980, z: -770 }, { x: -831, z: -700 }], 14, 'Dốc Đèo Mây');
    W.addPaved({ x0: -1870, x1: -1760, z0: -1670, z1: -1580, mapColor: '#9a8f78' }, 'Đỉnh Đèo Mây');
    W.noTrees({ x: LX, z: LZ, r: LR + 25 });
    // rolling hills around the pass (kept clear of the roads)
    for (let tries = 0; hills.length < 46 && tries < 3000; tries++) {
      const x = R.range(-2250, -930), z = R.range(-2000, 650), r = R.range(70, 170), h = R.range(25, 120);
      if (Math.hypot(x - LX, z - LZ) < LR + r + 60) continue;
      const e = W.extraNear(x, z, r + 40); if (e) continue;
      if (Math.abs(x) < 930 && Math.abs(z) < 930) continue;
      if (hills.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.75)) continue;
      hills.push({ x, z, r, h });
      W.addCollider({ t: 'circle', x, z, r: r * 0.72, h });
      W.noTrees({ x, z, r: r * 0.8 });
      W.addFootprint({ x, z, r: r * 0.85, mapColor: h > 70 ? '#4d5a40' : '#36502c' });
    }

    // ---- East: Xa lộ Đông + gas station + container port ----
    W.addRoad([{ x: 831, z: -480 }, { x: 1050, z: -560 }, { x: 1400, z: -690 }, { x: 1700, z: -600 }, { x: 1880, z: -300 }, { x: 1910, z: 100 }, { x: 1860, z: 460 }, { x: 1770, z: 722 }], 26, 'Xa lộ Đông', { lanes: 2 });
    W.addPaved({ x0: 1360, x1: 1490, z0: -680, z1: -590, mapColor: '#8f949c' }, 'Trạm xăng');
    W.addFootprint({ x0: 1445, x1: 1480, z0: -632, z1: -600, mapColor: '#6d5a4a' });
    W.addCollider({ t: 'box', x0: 1445, x1: 1480, z0: -632, z1: -600, h: 6 });
    W.noTrees({ x0: 1340, x1: 1510, z0: -700, z1: -570 });
    W.addPaved({ x0: 1680, x1: 2480, z0: 722, z1: 1172, mapColor: '#7d838c' }, 'Cảng Container');
    W.addRoad([{ x: 1640, z: 965 }, { x: 1662, z: 965 }, { x: 1690, z: 965 }], 22, 'Đường vào cảng');
    W.noTrees({ x0: 1580, x1: 2600, z0: 650, z1: 1220 });
    // container blocks: 6 rows x 2 deep, 1-4 high, with drive aisles between blocks
    for (let bx = 1810; bx < 2330; bx += 34) for (let bz = 800; bz < 1080; bz += 46) {
      if (R() < 0.15) continue;
      const rows = 6, hmax = 1 + Math.floor(R() * 4);
      for (let i = 0; i < rows; i++) for (let j = 0; j < 2; j++) {
        const st = Math.max(1, hmax - Math.floor(R() * 2));
        for (let k = 0; k < st; k++) containers.push({ x: bx + j * 12.4, z: bz + i * 2.6, y: k * 2.6, c: R() });
      }
      W.addCollider({ t: 'box', x0: bx - 6.2, x1: bx + 18.6, z0: bz - 1.3, z1: bz + rows * 2.6 - 1.3, h: hmax * 2.6 });
      W.addFootprint({ x0: bx - 6.2, x1: bx + 18.6, z0: bz - 1.3, z1: bz + rows * 2.6 - 1.3, mapColor: '#a0603a' });
    }
    for (const z0 of [740, 930]) { W.addCollider({ t: 'box', x0: 2370, x1: 2470, z0, z1: z0 + 160, h: 15 }); W.addFootprint({ x0: 2370, x1: 2470, z0, z1: z0 + 160, mapColor: '#55606c' }); }
    for (const x of [1860, 2010, 2160, 2310]) for (const dz of [-8, 8]) W.addCollider({ t: 'circle', x: x - 10, z: 1150 + dz, r: 1.2, h: 50 }), W.addCollider({ t: 'circle', x: x + 10, z: 1150 + dz, r: 1.2, h: 50 });

    D.places = [
      { name: 'Nhà ga Tân Sơn', icon: '✈️', x: 470, z: -1500 },
      { name: 'Hồ Tây', icon: '🏞️', x: -1150, z: 150 },
      { name: 'Đỉnh Đèo Mây', icon: '⛰️', x: -1815, z: -1620 },
      { name: 'Trạm xăng Xa lộ', icon: '⛽', x: 1420, z: -625 },
      { name: 'Cảng Container', icon: '🚢', x: 1800, z: 760 },
    ];
  };

  // ---------------- Meshes ----------------
  const box = (w, h, d, mat, x, y, z, parent, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  function sign(title, sub, c1, c2, w, h) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: G.TEX.billboard(title, sub, c1, c2), color: new THREE.Color(1, 1, 1) }));
  }
  // airliner: fuselage along +z, wings, swept tail, engines
  D.airliner = function (livery, scale) {
    const g = new THREE.Group(), s = scale || 1;
    const white = new THREE.MeshStandardMaterial({ color: G.col(0xf2f4f6), roughness: 0.35, metalness: 0.2 });
    const whiteDS = white.clone(); whiteDS.side = THREE.DoubleSide; // mirrored wings flip winding
    const liv = new THREE.MeshStandardMaterial({ color: G.col(livery), roughness: 0.4, metalness: 0.2 });
    const grey = new THREE.MeshStandardMaterial({ color: G.col(0x9aa0a8), roughness: 0.5, metalness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: G.col(0x101820), roughness: 0.1, metalness: 0.6 });
    const add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * s, y * s, z * s); m.rotation.set(rx || 0, ry || 0, rz || 0); m.scale.setScalar(s); m.castShadow = true; g.add(m); return m; };
    add(new THREE.CylinderGeometry(2.1, 2.1, 30, 20), white, 0, 4.2, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(2.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 4.2, 15, Math.PI / 2).scale.set(s, s * 1.6, s);
    add(new THREE.CylinderGeometry(2.1, 0.6, 7, 20), white, 0, 4.7, -18.5, -Math.PI / 2 + 0.06);
    add(new THREE.BoxGeometry(4.25, 0.5, 26), liv, 0, 3.2, -1);                // belly stripe
    add(new THREE.BoxGeometry(4.24, 0.35, 24), glass, 0, 5, 0);                // window band
    add(new THREE.BoxGeometry(2.6, 0.6, 1.2), glass, 0, 5.4, 15.6, -0.5);      // cockpit
    const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.lineTo(16, -7); wing.lineTo(16, -9.5); wing.lineTo(0, -6.5); wing.lineTo(0, 0);
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.45, bevelEnabled: false }); wg.rotateX(Math.PI / 2);
    add(wg, whiteDS, 1.8, 3.4, 4); const wl = add(wg, whiteDS, -1.8, 3.4, 4); wl.scale.x = -s;
    const tail = new THREE.Shape(); tail.moveTo(0, 0); tail.lineTo(-6, 7.5); tail.lineTo(-8.5, 7.5); tail.lineTo(-5, 0); tail.lineTo(0, 0);
    const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.4, bevelEnabled: false }); tg.rotateY(-Math.PI / 2);
    add(tg, liv, 0.2, 5.6, -14);
    const st = new THREE.Shape(); st.moveTo(0, 0); st.lineTo(6, -3.5); st.lineTo(6, -5); st.lineTo(0, -3.5);
    const sg = new THREE.ExtrudeGeometry(st, { depth: 0.3, bevelEnabled: false }); sg.rotateX(Math.PI / 2);
    add(sg, whiteDS, 0.5, 5.2, -15.5); const sl = add(sg, whiteDS, -0.5, 5.2, -15.5); sl.scale.x = -s;
    for (const sd of [-1, 1]) {
      add(new THREE.CylinderGeometry(1.1, 0.9, 4.2, 14), grey, sd * 6.5, 2.4, 3.6, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6), grey, sd * 2.5, 0.9, -1.5);
      add(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10), glass, sd * 2.5, 0.55, -1.5, 0, 0, Math.PI / 2);
    }
    add(new THREE.CylinderGeometry(0.15, 0.15, 1.8, 6), grey, 0, 1.1, 11);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 10), glass, 0, 0.5, 11, 0, 0, Math.PI / 2);
    G.CarModels.mergeByMaterial(g);
    return g;
  };

  D.build = function (scene, W) {
    const R = G.rng;
    const concrete = new THREE.MeshStandardMaterial({ color: G.col(0xd5d2cb), roughness: 0.8 });
    const glassBlue = new THREE.MeshStandardMaterial({ color: G.col(0x6f9fc0), roughness: 0.12, metalness: 0.7, emissive: G.col(0xffe2b0), emissiveIntensity: 0 });
    const dark = new THREE.MeshStandardMaterial({ color: G.col(0x2b2f36), roughness: 0.6, metalness: 0.4 });
    const white = new THREE.MeshStandardMaterial({ color: G.col(0xf2f2f2), roughness: 0.5 });
    night.push({ mat: glassBlue, k: 0.55 });

    // ---- Airport ----
    const term = new THREE.Group(); scene.add(term);
    box(60, 20, 540, glassBlue, 410, 10, -1530, term);
    box(76, 1.4, 556, white, 410, 20.7, -1530, term);                        // roof slab with overhang
    for (const z of [-1700, -1550, -1400]) box(36, 4, 4, concrete, 362, 6, z, term);   // jet bridges
    const ts = sign('SÂN BAY TÂN SƠN', 'TAN SON AIRPORT • ĐI / ĐẾN', '#0b4ea2', '#00a1d6', 60, 10); ts.position.set(441, 14, -1530); ts.rotation.y = Math.PI / 2; term.add(ts);
    // control tower
    const tw = new THREE.Group(); tw.position.set(330, 0, -1195); scene.add(tw);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 54, 16), concrete); shaft.position.y = 27; shaft.castShadow = true; tw.add(shaft);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(8, 6.5, 7, 8), glassBlue); cab.position.y = 57.5; tw.add(cab);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(4, 8.6, 2.5, 8), white); cap.position.y = 62.2; tw.add(cap);
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1) }); const rl = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), red); rl.position.y = 64.5; tw.add(rl);
    beacons.push(red);
    // parked airliners
    for (const p of planes) { const a = D.airliner(p.livery, 1); a.position.set(p.x, 0, p.z); a.rotation.y = p.h; scene.add(a); }
    // helipad + taxiway centre line
    const hp = document.createElement('canvas'); hp.width = hp.height = 128; const hx = hp.getContext('2d');
    hx.fillStyle = '#2c3138'; hx.beginPath(); hx.arc(64, 64, 62, 0, 7); hx.fill(); hx.strokeStyle = '#ffd400'; hx.lineWidth = 6; hx.beginPath(); hx.arc(64, 64, 54, 0, 7); hx.stroke();
    hx.fillStyle = '#fff'; hx.font = '900 70px Arial'; hx.textAlign = 'center'; hx.textBaseline = 'middle'; hx.fillText('H', 64, 68);
    const ht = new THREE.CanvasTexture(hp);
    D.helipad = (x, z) => { const m = new THREE.Mesh(new THREE.CircleGeometry(11, 32), new THREE.MeshStandardMaterial({ map: ht, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); scene.add(m); };
    D.helipad(D.spawns.heli.x, D.spawns.heli.z);
    const ty = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1440), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.7, 0.05), polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }));
    ty.rotation.x = -Math.PI / 2; ty.position.set(68, 0.06, -1620); scene.add(ty);

    // ---- Centre markings on the curved roads (dashed yellow; double line on the highway) ----
    {
      const pos = [];
      for (const rd of W.extra.roads) {
        const p = rd.pts, n = p.length, offs = rd.lanes > 1 ? [-0.35, 0.35] : [0];
        for (let i = 0; i + 1 < n; i++) {
          if (rd.lanes === 1 && i % 2) continue;
          const a = p[i], b = p[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l, hw = 0.16;
          for (const o of offs) {
            const ax = a.x + nx * o, az = a.z + nz * o, bx = b.x + nx * o, bz = b.z + nz * o;
            pos.push(ax - nx * hw, 0.05, az - nz * hw, bx + nx * hw, 0.05, bz + nz * hw, bx - nx * hw, 0.05, bz - nz * hw,
              ax - nx * hw, 0.05, az - nz * hw, ax + nx * hw, 0.05, az + nz * hw, bx + nx * hw, 0.05, bz + nz * hw);
          }
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: G.col(0xd9aa14), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }));
      scene.add(m);
    }

    // ---- Lake ----
    const lakeMat = new THREE.MeshStandardMaterial({ color: G.col(0x1b5a74), roughness: 0.08, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    for (const w of W.extra.waters) {
      const shore = new THREE.Mesh(new THREE.RingGeometry(w.r, w.r + 22, 64), new THREE.MeshStandardMaterial({ map: (() => { const t = G.TEX.sand(); t.repeat.set(20, 2); return t; })(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      shore.rotation.x = -Math.PI / 2; shore.position.set(w.x, 0.03, w.z); scene.add(shore);
      const lake = new THREE.Mesh(new THREE.CircleGeometry(w.r, 64), lakeMat); lake.rotation.x = -Math.PI / 2; lake.position.set(w.x, 0.04, w.z); scene.add(lake);
    }
    // pagoda on the lake island-ish pier (decor, Vietnamese touch)
    const pg = new THREE.Group(); pg.position.set(-1450, 0, 150); scene.add(pg);
    const roofM = new THREE.MeshStandardMaterial({ color: G.col(0x8a2a1c), roughness: 0.7, flatShading: true });
    box(10, 1.5, 10, concrete, 0, 0.75, 0, pg);
    for (let k = 0; k < 3; k++) { box(6 - k * 1.5, 3, 6 - k * 1.5, new THREE.MeshStandardMaterial({ color: G.col(0xe8d8b0) }), 0, 3 + k * 4, 0, pg); const rf = new THREE.Mesh(new THREE.ConeGeometry(6 - k * 1.3, 2, 4), roofM); rf.position.y = 5.2 + k * 4; rf.rotation.y = Math.PI / 4; pg.add(rf); }
    W.addCollider({ t: 'circle', x: -1450, z: 150, r: 6, h: 16 });

    // ---- Hills (one merged, vertex-coloured, flat-shaded mesh) ----
    {
      const pos = [], col = [], cG = G.col(0x4f7a3a), cD = G.col(0x3d6230), cR = G.col(0x8a8378);
      for (const h of hills) {
        const seg = 10, rings = 4;
        const rr = (k, ri) => h.r * (1 - ri / rings) * (0.85 + ((Math.sin(k * 12.9898 + h.x) * 43758.5453) % 1 + 1) % 1 * 0.3);
        const yy = (ri) => h.h * Math.sin((ri / rings) * Math.PI / 2);
        const P = (k, ri) => { const a = k / seg * Math.PI * 2; const r = ri === rings ? 0 : rr(k, ri); return [h.x + Math.cos(a) * r, ri === 0 ? -0.5 : yy(ri), h.z + Math.sin(a) * r]; };
        for (let ri = 0; ri < rings; ri++) for (let k = 0; k < seg; k++) {
          const a = P(k, ri), b = P(k + 1, ri), c = P(k + 1, ri + 1), d = P(k, ri + 1);
          const cc = ri >= 2 && h.h > 70 ? cR : (ri % 2 ? cD : cG);
          pos.push(...a, ...c, ...b, ...a, ...d, ...c);
          for (let i = 0; i < 6; i++) col.push(cc.r, cc.g, cc.b);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })); m.receiveShadow = true; m.castShadow = true; scene.add(m);
    }
    // lookout: railing + sign
    const lk = sign('ĐỈNH ĐÈO MÂY', 'ĐỘ CAO 1.250 M • NGẮM TOÀN THÀNH PHỐ', '#2e7d32', '#00695c', 16, 8); lk.position.set(-1815, 6, -1668); scene.add(lk);
    box(0.4, 6, 0.4, dark, -1815, 3, -1669, scene);

    // ---- Gas station ----
    const gs = new THREE.Group(); gs.position.set(1420, 0, -625); scene.add(gs);
    box(44, 1.2, 22, white, -10, 6.4, -2, gs);
    const stripe = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.25, 0.1) }); box(44.2, 0.5, 22.2, stripe, -10, 6, -2, gs); night.push({ basic: stripe, base: [1.0, 0.18, 0.08], k: 0.8 });
    for (const x of [-28, 8]) for (const z of [-10, 6]) box(0.8, 6, 0.8, white, x, 3, z, gs);
    for (const x of [-22, -10, 2]) box(1.2, 1.8, 3, dark, x, 0.9, -2, gs);
    box(35, 5.5, 32, concrete, 42, 2.75, 9, gs);
    const gsn = sign('XĂNG DẦU 24H', 'RỬA XE • CÀ PHÊ', '#d32f2f', '#ff8f00', 14, 7); gsn.position.set(-10, 11, 11); gs.add(gsn);
    for (const x of [-22, -10, 2]) W.addCollider({ t: 'circle', x: 1420 + x, z: -627, r: 1.6, h: 2 });

    // ---- Container port ----
    if (containers.length) {
      const cg = new THREE.BoxGeometry(12, 2.55, 2.45); cg.translate(0, 1.28, 0);
      const cm = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.3 });
      const im = new THREE.InstancedMesh(cg, cm, containers.length);
      const m4 = new THREE.Matrix4(), cols = [0xc0392b, 0x1f6fb2, 0x2e8b57, 0xe0a020, 0x8e44ad, 0xd35400, 0x7f8c8d, 0xf0f0f0];
      containers.forEach((c, i) => { m4.makeTranslation(c.x, c.y, c.z); im.setMatrixAt(i, m4); im.setColorAt(i, G.col(cols[Math.floor(c.c * cols.length)])); });
      im.castShadow = true; im.receiveShadow = true; scene.add(im);
    }
    const craneM = new THREE.MeshStandardMaterial({ color: G.col(0xe8a317), roughness: 0.5, metalness: 0.4 });
    for (const x of [1860, 2010, 2160, 2310]) {
      const cr = new THREE.Group(); cr.position.set(x, 0, 1150); scene.add(cr);
      for (const lx of [-10, 10]) for (const lz of [-8, 8]) box(1.4, 44, 1.4, craneM, lx, 22, lz, cr);
      box(22, 2.5, 2.5, craneM, 0, 44, -8, cr); box(22, 2.5, 2.5, craneM, 0, 44, 8, cr);
      box(3, 3, 70, craneM, 0, 47, 22, cr);                              // boom over the water
      box(6, 5, 7, dark, 0, 41, 2, cr);
    }
    for (const z0 of [740, 930]) { box(100, 15, 160, new THREE.MeshStandardMaterial({ color: G.col(0x7d8a96), roughness: 0.7, metalness: 0.3 }), 2420, 7.5, z0 + 80, scene); }
    const quay = box(820, 1.2, 6, concrete, 2080, 0.4, 1175, scene); void quay;
    const ps = sign('CẢNG CONTAINER', 'SAIGON PORT • KHU VỰC HẠN CHẾ', '#455a64', '#00838f', 22, 10); ps.position.set(1740, 9, 725); scene.add(ps);
    box(0.5, 9, 0.5, dark, 1740, 4.5, 724, scene);
  };

  D.update = function (dt, t, n) {
    for (const o of night) {
      if (o.mat) o.mat.emissiveIntensity = o.k * n;
      if (o.basic) o.basic.color.setRGB(o.base[0] * (0.6 + n), o.base[1] * (0.6 + n), o.base[2] * (0.6 + n));
    }
    for (const b of beacons) b.color.setRGB(Math.sin(t * 2.2) > 0.4 ? 3 : 0.2, 0.12, 0.08);
  };
  return D;
})();
