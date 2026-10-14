// ================================================================
//  World: procedural open city + highway ring + countryside,
//  beach & sea, runway, stunt park. Collisions, roads graph, map.
// ================================================================
'use strict';

G.W = (function () {
  const W = {};
  const C = G.CFG;
  const N = C.N, P = C.PITCH, HR = C.ROAD / 2, HALF = C.HALF, RING = C.RING, RW = C.RING_W, RR = C.RING_R;
  const lines = []; for (let i = 0; i <= N; i++) lines.push(-HALF + i * P);
  W.lines = lines;

  // Named areas
  const RUNWAY = { x0: -22, x1: 22, z0: -RING - 1700, z1: -RING };
  const PAD = { x0: RING + 90, x1: RING + 520, z0: -230, z1: 230 };
  const CONNECT = { x0: RING, x1: RING + 92, z0: -12, z1: 12 };
  const BEACH_Z = 965, BEACH_X = 1650, EXT_X = [lines[3], lines[6], lines[9]];
  W.RUNWAY = RUNWAY; W.PAD = PAD; W.BEACH_Z = BEACH_Z;

  // Special blocks (bi,bj) -> type
  const special = {
    '5,5': 'plaza', '2,8': 'park', '9,3': 'park', '1,2': 'park', '7,10': 'park', '10,6': 'park', '9,8': 'stadium',
  };
  W.blockType = (bi, bj) => special[bi + ',' + bj] || 'city';
  W.blockRect = (bi, bj) => ({ x0: lines[bi] + HR, x1: lines[bi + 1] - HR, z0: lines[bj] + HR, z1: lines[bj + 1] - HR });

  // ---------------- Collision hash ----------------
  const CELL = 50;
  const hash = new Map();
  const colliders = [];
  let stamp = 1;
  function hkey(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  function addCollider(c) {
    c.s = 0; colliders.push(c);
    let x0, x1, z0, z1;
    if (c.t === 'box') { x0 = c.x0; x1 = c.x1; z0 = c.z0; z1 = c.z1; } else { x0 = c.x - c.r; x1 = c.x + c.r; z0 = c.z - c.r; z1 = c.z + c.r; }
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const k = hkey(ix, iz); let l = hash.get(k); if (!l) { l = []; hash.set(k, l); } l.push(c);
      }
  }
  // Calls fn(nx, nz, depth) for every static collider overlapping the circle
  W.collideCircle = function (x, z, r, fn) {
    stamp++;
    let hit = false;
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++)
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const l = hash.get(hkey(ix, iz)); if (!l) continue;
        for (const c of l) {
          if (c.s === stamp) continue; c.s = stamp;
          if (c.t === 'box') {
            const cx = G.clamp(x, c.x0, c.x1), cz = G.clamp(z, c.z0, c.z1);
            let dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-8) { const d = Math.sqrt(d2); fn(dx / d, dz / d, r - d); }
            else { // centre inside the box: push out along the shallowest side
              const l0 = x - c.x0, l1 = c.x1 - x, l2 = z - c.z0, l3 = c.z1 - z, m = Math.min(l0, l1, l2, l3);
              if (m === l0) fn(-1, 0, l0 + r); else if (m === l1) fn(1, 0, l1 + r); else if (m === l2) fn(0, -1, l2 + r); else fn(0, 1, l3 + r);
            }
            hit = true;
          } else {
            const dx = x - c.x, dz = z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
            if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2) || 1e-4; fn(dx / d, dz / d, rr - d); hit = true;
          }
        }
      }
    return hit;
  };
  W.pointBlocked = function (x, z) {
    let b = false; W.collideCircle(x, z, 0.1, () => { b = true; }); return b;
  };
  W.segmentBlocked = function (x1, z1, x2, z2) {
    const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) { const t = i / n; if (W.pointBlocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) return true; }
    return false;
  };

  // ---------------- Ring highway path ----------------
  function buildRingPath() {
    const raw = [], k = RING - RR;
    const corners = [[k, k, 0], [-k, k, 90], [-k, -k, 180], [k, -k, 270]];
    for (const [cx, cz, a0] of corners) for (let s = 0; s <= 24; s++) {
      const a = (a0 + s / 24 * 90) * Math.PI / 180; raw.push(new THREE.Vector2(cx + Math.cos(a) * RR, cz + Math.sin(a) * RR));
    }
    // resample to ~4 m spacing
    const out = []; raw.push(raw[0].clone());
    for (let i = 0; i < raw.length - 1; i++) {
      const a = raw[i], b = raw[i + 1], len = a.distanceTo(b), n = Math.max(1, Math.round(len / 4));
      for (let j = 0; j < n; j++) out.push(a.clone().lerp(b, j / n));
    }
    return out;
  }
  W.ring = buildRingPath();
  // signed distance to ring centre-line (rounded square)
  function ringDist(x, z) {
    const k = RING - RR, qx = Math.abs(x) - k, qz = Math.abs(z) - k;
    const out = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    return out - RR;
  }
  W.ringDist = ringDist;

  // ---------------- Surface queries ----------------
  function nearestLine(v) { const i = G.clamp(Math.round((v + HALF) / P), 0, N); return { i, c: lines[i] }; }
  W.nearestLine = nearestLine;
  W.onRoad = function (x, z, margin) {
    const m = margin || 0;
    if (Math.abs(x) <= RING + m && Math.abs(z) <= RING + m) {
      if (Math.abs(x - nearestLine(x).c) <= HR + m) return true;
      if (Math.abs(z - nearestLine(z).c) <= HR + m) return true;
    }
    if (Math.abs(ringDist(x, z)) <= RW / 2 + m) return true;
    for (const ex of EXT_X) if (Math.abs(x - ex) <= HR + m && z >= RING && z <= BEACH_Z + HR) return true;
    if (Math.abs(z - BEACH_Z) <= HR + m && Math.abs(x) <= BEACH_X) return true;
    if (x >= RUNWAY.x0 - m && x <= RUNWAY.x1 + m && z >= RUNWAY.z0 - m && z <= RUNWAY.z1) return true;
    if (x >= PAD.x0 - m && x <= PAD.x1 + m && z >= PAD.z0 - m && z <= PAD.z1 + m) return true;
    if (x >= CONNECT.x0 && x <= CONNECT.x1 && z >= CONNECT.z0 - m && z <= CONNECT.z1 + m) return true;
    return false;
  };
  W.surface = function (x, z) {
    if (z > C.SEA_Z) return 'water';
    if (W.onRoad(x, z)) return 'road';
    // plaza block is paved and drivable
    const r = W.blockRect(5, 5);
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return 'road';
    if (z > BEACH_Z + 20) return 'sand';
    return 'grass';
  };

  // ---------------- Ramps ----------------
  W.ramps = [];
  function addRamp(x, z, ang, w, len, h) { W.ramps.push({ x, z, ang, w, len, h, s: Math.sin(ang), c: Math.cos(ang) }); }
  W.groundHeight = function (x, z) {
    let h = 0;
    for (const r of W.ramps) {
      const dx = x - r.x, dz = z - r.z;
      const u = dx * r.s + dz * r.c;          // along the ramp
      const v = dx * r.c - dz * r.s;          // lateral
      if (u >= 0 && u <= r.len && Math.abs(v) <= r.w / 2) h = Math.max(h, r.h * u / r.len);
    }
    return h;
  };

  // ---------------- Graph (grid intersections) ----------------
  W.node = (i, j) => ({ x: lines[i], z: lines[j] });
  W.nearestNode = (x, z) => ({ i: nearestLine(x).i, j: nearestLine(z).i });
  W.path = function (a, b) {
    // BFS on the 4-connected grid, returns list of {i,j}
    const key = (n) => n.i * 100 + n.j, prev = new Map(), q = [a];
    prev.set(key(a), null);
    while (q.length) {
      const n = q.shift();
      if (n.i === b.i && n.j === b.j) break;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m = { i: n.i + di, j: n.j + dj };
        if (m.i < 0 || m.j < 0 || m.i > N || m.j > N || prev.has(key(m))) continue;
        prev.set(key(m), n); q.push(m);
      }
    }
    const out = []; let n = b;
    while (n) { out.unshift(n); n = prev.get(key(n)); }
    return out;
  };
  // Traffic light state for a node and travel axis ('x' or 'z'): 'g' | 'y' | 'r'
  W.signal = function (i, j, axis, t) {
    const cyc = 22, ph = ((t + (i * 7 + j * 3) % cyc) % cyc);
    // z-axis traffic: green 0-9, yellow 9-11; x-axis: green 11-20, yellow 20-22
    if (axis === 'z') return ph < 9 ? 'g' : (ph < 11 ? 'y' : 'r');
    return ph >= 11 && ph < 20 ? 'g' : (ph >= 20 ? 'y' : 'r');
  };

  // Nearest drivable pose (for car reset / spawning)
  W.nearestRoadPose = function (x, z, heading) {
    const fx = Math.sin(heading || 0), fz = Math.cos(heading || 0);
    const cands = [];
    if (Math.abs(x) <= RING && Math.abs(z) <= RING) {
      const lx = nearestLine(x), lz = nearestLine(z);
      cands.push({ x: lx.c, z: G.clamp(z, -RING + 20, RING - 20), dirx: 0, dirz: fz >= 0 ? 1 : -1 });
      cands.push({ x: G.clamp(x, -RING + 20, RING - 20), z: lz.c, dirx: fx >= 0 ? 1 : -1, dirz: 0 });
    }
    let best = null, bd = Infinity;
    for (let i = 0; i < W.ring.length; i += 2) { const p = W.ring[i], d = (p.x - x) ** 2 + (p.y - z) ** 2; if (d < bd) { bd = d; best = i; } }
    const a = W.ring[best], b = W.ring[(best + 1) % W.ring.length];
    let tx = b.x - a.x, tz = b.y - a.y; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    if (tx * fx + tz * fz < 0) { tx = -tx; tz = -tz; }
    cands.push({ x: a.x, z: a.y, dirx: tx, dirz: tz });
    if (x > RUNWAY.x0 - 200 && x < RUNWAY.x1 + 200 && z < RUNWAY.z1 && z > RUNWAY.z0) cands.push({ x: 0, z, dirx: 0, dirz: fz >= 0 ? 1 : -1 });
    if (z > BEACH_Z - 150 && Math.abs(x) < BEACH_X) cands.push({ x, z: BEACH_Z, dirx: fx >= 0 ? 1 : -1, dirz: 0 });
    let res = null; bd = Infinity;
    for (const c of cands) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; res = c; } }
    // keep right: offset to the right-hand lane
    const rx = -res.dirz, rz = res.dirx;
    return { x: res.x + rx * 4.5, z: res.z + rz * 4.5, heading: Math.atan2(res.dirx, res.dirz) };
  };

  // ================================================================
  //  BUILD
  // ================================================================
  const dyn = { windows: [], lampBulbs: null, pools: null, neon: null, antennaLights: null, signals: null, billboards: [], water: null, runwayLights: null, mountains: null };

  // ---------- Chunked instancing ----------
  // r128 culls an InstancedMesh by its geometry's bounding sphere (unit box at the origin), so one
  // map-wide mesh is never culled correctly. Split instances into a grid; each chunk gets a geometry
  // view (shared buffers) whose bounding sphere covers its instances -> frustum + shadow culling work.
  // `far` additionally hides small props beyond that distance (see W.update).
  const chunks = [];
  const _m4 = new THREE.Matrix4(), _sp = new THREE.Sphere(), _bb = new THREE.Box3(), _box = new THREE.Box3();
  function chunked(scene, geo, mat, items, cell, place, o) {
    o = o || {};
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const groups = new Map();
    for (const it of items) {
      const k = cell === Infinity ? 0 : Math.floor(it.x / cell) + ',' + Math.floor(it.z / cell);
      let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(it);
    }
    const out = [];
    for (const list of groups.values()) {
      const g = new THREE.BufferGeometry();
      g.setIndex(geo.index);
      for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
      const mesh = new THREE.InstancedMesh(g, mat, list.length);
      _box.makeEmpty();
      list.forEach((it, i) => {
        place(it, _m4, mesh, i); mesh.setMatrixAt(i, _m4);
        _box.union(_sp.copy(geo.boundingSphere).applyMatrix4(_m4).getBoundingBox(_bb));
      });
      g.boundingBox = _box.clone(); g.boundingSphere = _box.getBoundingSphere(new THREE.Sphere());
      mesh.castShadow = !!o.cast; mesh.receiveShadow = !!o.receive;
      if (o.order) mesh.renderOrder = o.order;
      scene.add(mesh); out.push(mesh);
      if (o.far) chunks.push({ mesh, s: g.boundingSphere, far: o.far });
    }
    return out;
  }

  W.build = function (scene) {
    G.rng.seed(20240611);
    const R = G.rng;
    const tAsphalt = G.TEX.asphalt(), tGrass = G.TEX.grass(), tSand = G.TEX.sand(), tConcrete = G.TEX.concrete(), tPlaza = G.TEX.plaza();

    // ---------- Ground layers ----------
    const grassMat = new THREE.MeshStandardMaterial({ map: tGrass, roughness: 1, metalness: 0, color: G.col(0xb8c8a0) });
    tGrass.repeat.set(500, 500);
    // grass ends where the beach begins
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(12000, 9200), grassMat);
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.02, BEACH_Z + 40 - 4600);
    grass.receiveShadow = true;
    scene.add(grass);

    tSand.repeat.set(600, 30);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(12000, C.SEA_Z - BEACH_Z + 40), new THREE.MeshStandardMaterial({ map: tSand, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, (C.SEA_Z + BEACH_Z + 40) / 2 + 10); sand.receiveShadow = true;
    scene.add(sand);

    const wn = G.TEX.waterNormal(); wn.repeat.set(120, 60);
    const waterMat = new THREE.MeshStandardMaterial({ color: G.col(0x0f4a66), roughness: 0.06, metalness: 0.35, normalMap: wn, normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 1.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(14000, 7000), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.05, C.SEA_Z + 3500);
    scene.add(water); dyn.water = waterMat;

    // ---------- Road surfaces (one merged mesh, world-space UVs) ----------
    const rp = [], ri = [];
    function quad(ax, az, bx, bz, cx, cz, dx, dz) {
      const b = rp.length / 3;
      rp.push(ax, 0.02, az, bx, 0.02, bz, cx, 0.02, cz, dx, 0.02, dz);
      ri.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    function rect(x0, z0, x1, z1) { quad(x0, z0, x1, z0, x1, z1, x0, z1); }
    for (const c of lines) { rect(c - HR, -RING, c + HR, RING); rect(-RING, c - HR, RING, c + HR); }
    for (const ex of EXT_X) rect(ex - HR, RING, ex + HR, BEACH_Z);
    rect(-BEACH_X, BEACH_Z - HR, BEACH_X, BEACH_Z + HR);
    rect(RUNWAY.x0, RUNWAY.z0, RUNWAY.x1, RUNWAY.z1);
    rect(PAD.x0, PAD.z0, PAD.x1, PAD.z1);
    rect(CONNECT.x0, CONNECT.z0, CONNECT.x1, CONNECT.z1);
    // plaza
    // ring strip
    const ring = W.ring;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], c2 = ring[(i + 2) % ring.length];
      const n1 = normalAt(ring, i), n2 = normalAt(ring, (i + 1) % ring.length);
      quad(a.x + n1.x * RW / 2, a.y + n1.y * RW / 2, b.x + n2.x * RW / 2, b.y + n2.y * RW / 2, b.x - n2.x * RW / 2, b.y - n2.y * RW / 2, a.x - n1.x * RW / 2, a.y - n1.y * RW / 2);
      void c2;
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    const ruv = []; for (let i = 0; i < rp.length; i += 3) ruv.push(rp[i] / 9, rp[i + 2] / 9);
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
    roadGeo.setIndex(ri);
    roadGeo.computeVertexNormals();
    // all road normals point up regardless of winding
    const rn = roadGeo.attributes.normal; for (let i = 0; i < rn.count; i++) rn.setXYZ(i, 0, 1, 0);
    const roadMat = new THREE.MeshStandardMaterial({ map: tAsphalt, roughness: 0.82, metalness: 0.0, color: G.col(0xffffff), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    W.roadMat = roadMat;
    const roads = new THREE.Mesh(roadGeo, roadMat); roads.receiveShadow = true;
    scene.add(roads);

    buildMarkings(scene);

    // ---------- City blocks ----------
    const styles = ['glass', 'office', 'brick', 'modern', 'dark', 'house'];
    const facades = {}; styles.forEach((s) => { facades[s] = G.TEX.facade(s); });
    const bld = {}; styles.forEach((s) => { bld[s] = []; });
    const roofs = [], neon = [], antennas = [], slabs = [], parkSlabs = [], trees = [];

    for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
      const r = W.blockRect(bi, bj), type = W.blockType(bi, bj);
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, size = r.x1 - r.x0;
      const dist = Math.max(Math.abs(cx), Math.abs(cz)) / P; // 0.5 .. 5.5
      if (type === 'park') {
        parkSlabs.push({ x: cx, z: cz, s: size });
        for (let k = 0; k < 26; k++) {
          const tx = G.lerp(r.x0 + 5, r.x1 - 5, R()), tz = G.lerp(r.z0 + 5, r.z1 - 5, R());
          if (Math.abs(tx - cx) < 12 && Math.abs(tz - cz) < 30) continue; // leave a path
          trees.push({ x: tx, z: tz, s: 0.8 + R() * 0.7, pine: R() < 0.3 });
        }
        continue;
      }
      if (type === 'plaza') { buildPlaza(scene, cx, cz, size); continue; }
      slabs.push({ x: cx, z: cz, s: size });
      addCollider({ t: 'box', x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 });
      if (type === 'stadium') { buildStadium(scene, cx, cz); continue; }

      const inner = { x0: r.x0 + C.SIDEWALK, x1: r.x1 - C.SIDEWALK, z0: r.z0 + C.SIDEWALK, z1: r.z1 - C.SIDEWALK };
      if (dist < 2) {
        // Downtown skyscrapers
        const split = R() < 0.55;
        const lots = split ? [{ x0: inner.x0, x1: (inner.x0 + inner.x1) / 2 - 1, z0: inner.z0, z1: inner.z1 }, { x0: (inner.x0 + inner.x1) / 2 + 1, x1: inner.x1, z0: inner.z0, z1: inner.z1 }] : [inner];
        for (const l of lots) {
          const w = (l.x1 - l.x0) * G.lerp(0.72, 0.95, R()), d = (l.z1 - l.z0) * G.lerp(0.62, 0.92, R());
          const h = G.lerp(90, 250, R()) * (1.25 - dist * 0.2);
          const x = (l.x0 + l.x1) / 2, z = (l.z0 + l.z1) / 2;
          const st = R() < 0.55 ? 'glass' : (R() < 0.5 ? 'dark' : 'modern');
          bld[st].push({ x, z, w, d, h, y: 0, tint: R() });
          if (R() < 0.6) { const k = G.lerp(0.55, 0.8, R()); bld[st].push({ x, z, w: w * k, d: d * k, h: G.lerp(15, 55, R()), y: h, tint: R() }); }
          const top = bld[st][bld[st].length - 1];
          if (top.y + top.h > 150 && R() < 0.8) antennas.push({ x, z, y: top.y + top.h, h: G.lerp(12, 35, R()) });
          if (R() < 0.7) neon.push({ x, z: z + (R() < 0.5 ? 1 : -1) * (d / 2 + 0.3), y: h - 6, w: w * 0.6, h: 3.2, rot: 0, hue: R() });
        }
      } else if (dist < 3.6) {
        // Midtown offices
        const hx = (inner.x0 + inner.x1) / 2, hz = (inner.z0 + inner.z1) / 2;
        for (const [x0, x1] of [[inner.x0, hx - 1.5], [hx + 1.5, inner.x1]]) for (const [z0, z1] of [[inner.z0, hz - 1.5], [hz + 1.5, inner.z1]]) {
          if (R() < 0.12) continue;
          const w = (x1 - x0) * G.lerp(0.75, 1, R()), d = (z1 - z0) * G.lerp(0.75, 1, R());
          const h = G.lerp(18, 75, R()) * (1.4 - dist * 0.14);
          const st = R.pick(['office', 'office', 'brick', 'modern', 'glass']);
          const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
          bld[st].push({ x, z, w, d, h, y: 0, tint: R() });
          if (R() < 0.25) neon.push({ x: x + (R() < 0.5 ? 1 : -1) * (w / 2 + 0.3), z, y: h * 0.6, w: d * 0.5, h: 2.4, rot: Math.PI / 2, hue: R() });
        }
      } else {
        // Residential: houses on a 3x3 lot grid + some low apartments
        const n = 3, lw = (inner.x1 - inner.x0) / n, ld = (inner.z1 - inner.z0) / n;
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
          if (a === 1 && b === 1) { trees.push({ x: inner.x0 + lw * 1.5, z: inner.z0 + ld * 1.5, s: 1.2, pine: false }); continue; }
          const x = inner.x0 + lw * (a + 0.5), z = inner.z0 + ld * (b + 0.5);
          if (R() < 0.18) { bld.brick.push({ x, z, w: lw * 0.85, d: ld * 0.85, h: G.lerp(10, 22, R()), y: 0, tint: R() }); continue; }
          const w = lw * G.lerp(0.5, 0.7, R()), d = ld * G.lerp(0.5, 0.7, R()), h = G.lerp(5, 8.5, R());
          bld.house.push({ x, z, w, d, h, y: 0, tint: R() });
          roofs.push({ x, z, w: w * 1.08, d: d * 1.08, y: h, h: G.lerp(2.5, 4.5, R()), c: R() });
          if (R() < 0.6) trees.push({ x: x + lw * 0.38 * (R() < 0.5 ? 1 : -1), z: z + ld * 0.38 * (R() < 0.5 ? 1 : -1), s: 0.6 + R() * 0.4, pine: R() < 0.2 });
        }
      }
    }

    // Sidewalk slabs (raised blocks)
    const slabGeo = new THREE.BoxGeometry(1, 0.28, 1); slabGeo.translate(0, 0.14, 0);
    tConcrete.repeat.set(1, 1);
    const slabMat = new THREE.MeshStandardMaterial({ map: tConcrete, roughness: 0.9, color: G.col(0xd0ccc4) });
    slabMat.onBeforeCompile = worldUV(4);
    const q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    const CH = 480; // chunk size for city props (4x4 blocks): culling wins vs. extra draw calls
    chunked(scene, slabGeo, slabMat, slabs, CH, (s, m4) => m4.compose(v3.set(s.x, 0, s.z), q.identity(), s3.set(s.s, 1, s.s)), { receive: true });
    const parkMat = new THREE.MeshStandardMaterial({ map: tGrass, color: G.col(0xa8d890), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    chunked(scene, new THREE.BoxGeometry(1, 0.06, 1), parkMat, parkSlabs, Infinity, (s, m4) => m4.compose(v3.set(s.x, 0.0, s.z), q.identity(), s3.set(s.s, 1, s.s)), { receive: true });

    // Buildings (instanced per façade style)
    const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
    const styleMat = {
      glass:  { rough: 0.12, metal: 0.75, base: [0x9fb8d0, 0xc4d6e6, 0x8aa3bd], winW: 3.2, winH: 3.6 },
      dark:   { rough: 0.2, metal: 0.65, base: [0x8a929e, 0x707884, 0x9aa2ae], winW: 3.0, winH: 3.6 },
      modern: { rough: 0.4, metal: 0.2, base: [0xffffff, 0xf2efe8, 0xe6eef4], winW: 4.0, winH: 3.6 },
      office: { rough: 0.7, metal: 0.05, base: [0xffffff, 0xe8dccb, 0xd5d9de, 0xf0e2c8], winW: 3.4, winH: 3.5 },
      brick:  { rough: 0.9, metal: 0.0, base: [0xffffff, 0xd8b8a8, 0xb89080], winW: 3.0, winH: 3.2 },
      house:  { rough: 0.9, metal: 0.0, base: [0xffffff, 0xf4e4c4, 0xdfe8f0, 0xf0d0c0, 0xd8e8d0], winW: 2.6, winH: 3.0 },
    };
    const tint = new THREE.Color();
    for (const st of styles) {
      const list = bld[st]; if (!list.length) continue;
      const f = facades[st], sm = styleMat[st];
      const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: new THREE.Color(1, 0.9, 0.75), emissiveIntensity: 0.0, roughness: sm.rough, metalness: sm.metal });
      mat.onBeforeCompile = facadeShader(sm.winW, sm.winH, f.cells);
      chunked(scene, boxGeo, mat, list, CH, (b, m4, mesh, i) => {
        m4.compose(v3.set(b.x, b.y, b.z), q.identity(), s3.set(b.w, b.h, b.d));
        mesh.setColorAt(i, tint.copy(G.col(sm.base[Math.floor(b.tint * sm.base.length)])));
      }, { cast: true, receive: true });
      dyn.windows.push({ mat, style: st });
    }
    // House roofs (square pyramids)
    if (roofs.length) {
      const rg = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); rg.rotateY(Math.PI / 4); rg.translate(0, 0.5, 0);
      const rm = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
      const rc = [0x8a3b2a, 0x5a5e66, 0x6b4a3a, 0x3c4a5c, 0x9a5a3a];
      chunked(scene, rg, rm, roofs, CH, (r, m4, mesh, i) => { m4.compose(v3.set(r.x, r.y, r.z), q.identity(), s3.set(r.w, r.h, r.d)); mesh.setColorAt(i, tint.copy(G.col(rc[Math.floor(r.c * rc.length)]))); }, { cast: true, receive: true, far: 1400 });
    }
    // Rooftop neon signs
    if (neon.length) {
      const ng = new THREE.BoxGeometry(1, 1, 0.4);
      const nm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1), toneMapped: true });
      // softer, less saturated sign colours (rose, teal, amber, mint, lilac, coral)
      const hues = [0xe0608f, 0x4cc4d6, 0xe8c25a, 0x7fd48a, 0xa58ad8, 0xe8875a];
      chunked(scene, ng, nm, neon, CH, (n, m4, mesh, i) => {
        m4.compose(v3.set(n.x, n.y, n.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.rot), s3.set(n.w, n.h, 1));
        mesh.setColorAt(i, tint.copy(G.col(hues[Math.floor(n.hue * hues.length)])));
      });
      dyn.neon = nm;
    }
    // Antennas with blinking red lights
    if (antennas.length) {
      const ag = new THREE.CylinderGeometry(0.25, 0.5, 1, 6); ag.translate(0, 0.5, 0);
      const lg = new THREE.SphereGeometry(0.6, 8, 6);
      const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1) });
      chunked(scene, ag, new THREE.MeshStandardMaterial({ color: G.col(0x555a60), metalness: 0.8, roughness: 0.4 }), antennas, CH, (a, m4) => m4.compose(v3.set(a.x, a.y, a.z), q.identity(), s3.set(1, a.h, 1)), { far: 1400 });
      chunked(scene, lg, lm, antennas, CH, (a, m4) => m4.compose(v3.set(a.x, a.y + a.h, a.z), q.identity(), s3.set(1, 1, 1)));
      dyn.antennaLights = lm;
    }

    buildBillboards(scene, bld);
    buildLamps(scene);
    buildSignals(scene);
    buildCountryside(scene, trees);
    buildTrees(scene, trees);
    buildRampsAndPad(scene);
    buildMountains(scene);
    buildMap(bld);
  };

  function normalAt(path, i) {
    const a = path[(i - 1 + path.length) % path.length], b = path[(i + 1) % path.length];
    const tx = b.x - a.x, tz = b.y - a.y, l = Math.hypot(tx, tz);
    return new THREE.Vector2(-tz / l, tx / l);
  }

  // UVs from world XZ (for instanced slabs)
  function worldUV(scale) {
    return (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `
        #ifdef USE_UV
          vec4 wpUV = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vUv = wpUV.xz / ${scale.toFixed(1)};
        #endif`);
    };
  }
  // Façade UVs: scale window grid by the instance's size so windows keep a constant real-world size
  function facadeShader(winW, winH, cells) {
    return (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `
        #ifdef USE_UV
          vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          float faceW = abs(normal.x) > 0.5 ? isc.z : isc.x;
          vec2 reps = max(vec2(1.0), floor(vec2(faceW / ${winW.toFixed(2)}, isc.y / ${winH.toFixed(2)}) + 0.5));
          vec2 off = floor(vec2(instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11, instanceMatrix[3].z * 0.23 + instanceMatrix[3].y * 0.05));
          vUv = (uv * reps + off) / ${cells.toFixed(1)};
          if (abs(normal.y) > 0.5) vUv = vec2(0.004, 0.004);
        #endif`);
    };
  }

  // ---------- Lane markings ----------
  function buildMarkings(scene) {
    const pos = [], col = [];
    const WHITE = G.col(0xd2d2d2), YEL = G.col(0xd9aa14);
    const Y = 0.05;
    function q4(ax, az, bx, bz, cx, cz, dx, dz, c) {
      pos.push(ax, Y, az, bx, Y, bz, cx, Y, cz, ax, Y, az, cx, Y, cz, dx, Y, dz);
      for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    }
    // axis-aligned line segment along a road: (x0,z0)->(x1,z1), width w
    function seg(x0, z0, x1, z1, w, c) {
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz); if (l < 0.01) return;
      const nx = -dz / l * w / 2, nz = dx / l * w / 2;
      q4(x0 + nx, z0 + nz, x1 + nx, z1 + nz, x1 - nx, z1 - nz, x0 - nx, z0 - nz, c);
    }
    function dashed(x0, z0, x1, z1, w, c, dash, gap) {
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
      for (let s = 0; s < l; s += dash + gap) { const e = Math.min(l, s + dash); seg(x0 + ux * s, z0 + uz * s, x0 + ux * e, z0 + uz * e, w, c); }
    }
    // A straight 4-lane street segment between two intersections, direction u, normal n
    function street(ax, az, bx, bz, ends) {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
      const s0 = ends ? 19 : 0, s1 = ends ? l - 19 : l;
      const p = (s, o) => [ax + ux * s + nx * o, az + uz * s + nz * o];
      const ln = (o, w, c, dash) => { const a = p(s0, o), b = p(s1, o); dash ? dashed(a[0], a[1], b[0], b[1], w, c, 3, 6) : seg(a[0], a[1], b[0], b[1], w, c); };
      ln(0.22, 0.14, YEL); ln(-0.22, 0.14, YEL);
      ln(6, 0.14, WHITE, true); ln(-6, 0.14, WHITE, true);
      ln(11.3, 0.16, WHITE); ln(-11.3, 0.16, WHITE);
      if (ends) {
        for (const [s, side] of [[s0, -1], [s1, 1]]) {
          // stop line on the approaching (right-hand) half: +n side when travelling +u, -n when travelling -u
          const a = p(s - side * 0.3, 0), b = p(s - side * 0.3, side * 11.5);
          seg(a[0], a[1], b[0], b[1], 0.5, WHITE);
          // zebra crossing between stop line and the intersection
          const cs = s + side * 3.4;
          for (let o = -11; o <= 11; o += 1.25) { const c1 = p(cs - 1.8, o), c2 = p(cs + 1.8, o); seg(c1[0], c1[1], c2[0], c2[1], 0.6, WHITE); }
        }
      }
    }
    for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
      street(lines[i], lines[j], lines[i], lines[j + 1], true);
      street(lines[j], lines[i], lines[j + 1], lines[i], true);
    }
    // grid stubs from city edge to the ring
    for (const c of lines) {
      street(c, -RING + RW / 2, c, -HALF - HR, false); street(c, HALF + HR, c, RING - RW / 2, false);
      street(-RING + RW / 2, c, -HALF - HR, c, false); street(HALF + HR, c, RING - RW / 2, c, false);
    }
    for (const ex of EXT_X) street(ex, RING + RW / 2, ex, BEACH_Z - HR, false);
    street(-BEACH_X, BEACH_Z, BEACH_X, BEACH_Z, false);
    // ring
    const rg = W.ring;
    for (let i = 0; i < rg.length; i++) {
      const a = rg[i], b = rg[(i + 1) % rg.length], na = normalAt(rg, i), nb = normalAt(rg, (i + 1) % rg.length);
      const L = (o, w, c) => seg(a.x + na.x * o, a.y + na.y * o, b.x + nb.x * o, b.y + nb.y * o, w, c);
      L(0.25, 0.15, YEL); L(-0.25, 0.15, YEL); L(15, 0.2, WHITE); L(-15, 0.2, WHITE);
      if (i % 3 === 0) { L(5, 0.15, WHITE); L(-5, 0.15, WHITE); L(10, 0.15, WHITE); L(-10, 0.15, WHITE); }
    }
    // runway
    dashed(0, RUNWAY.z1 - 40, 0, RUNWAY.z0 + 40, 0.9, WHITE, 30, 20);
    seg(RUNWAY.x0 + 1, RUNWAY.z0, RUNWAY.x0 + 1, RUNWAY.z1, 0.6, WHITE); seg(RUNWAY.x1 - 1, RUNWAY.z0, RUNWAY.x1 - 1, RUNWAY.z1, 0.6, WHITE);
    for (const zEnd of [RUNWAY.z0 + 10, RUNWAY.z1 - 40]) for (let x = -18; x <= 18; x += 3) if (Math.abs(x) > 2) seg(x, zEnd, x, zEnd + 30, 1.4, WHITE);
    // stunt pad drift circles
    const pcx = (PAD.x0 + PAD.x1) / 2, pcz = (PAD.z0 + PAD.z1) / 2;
    for (const [ox, rad] of [[-120, 45], [120, 45]]) for (let a = 0; a < 64; a++) {
      const a0 = a / 64 * Math.PI * 2, a1 = (a + 0.6) / 64 * Math.PI * 2;
      seg(pcx + ox + Math.cos(a0) * rad, pcz + Math.sin(a0) * rad, pcx + ox + Math.cos(a1) * rad, pcz + Math.sin(a1) * rad, 0.5, YEL);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---------- Plaza with fountain and neon arch ----------
  function buildPlaza(scene, cx, cz, size) {
    const t = G.TEX.plaza(); t.repeat.set(size / 8, size / 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.02, cz); floor.receiveShadow = true; scene.add(floor);
    const stone = new THREE.MeshStandardMaterial({ color: G.col(0xcfc8bc), roughness: 0.6 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 1.0, 40), stone); basin.position.set(cx, 0.5, cz); basin.castShadow = true; scene.add(basin);
    const wat = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.4, 0.2, 40), new THREE.MeshStandardMaterial({ color: G.col(0x2a7fa8), roughness: 0.05, metalness: 0.3, emissive: G.col(0x0a3050) }));
    wat.position.set(cx, 0.95, cz); scene.add(wat);
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, 5, 16), stone); tier.position.set(cx, 3, cz); tier.castShadow = true; scene.add(tier);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1.2, 0.8, 24), stone); bowl.position.set(cx, 5.6, cz); scene.add(bowl);
    addCollider({ t: 'circle', x: cx, z: cz, r: 9.6 });
    // neon arches over the plaza entrances
    const archMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.2, 1.5) });
    const archMat2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.45, 0.9) });
    [[0, size / 2 - 3, 0, archMat], [0, -size / 2 + 3, 0, archMat2], [size / 2 - 3, 0, Math.PI / 2, archMat2], [-size / 2 + 3, 0, Math.PI / 2, archMat]].forEach(([ox, oz, rot, mat]) => {
      const a = new THREE.Mesh(new THREE.TorusGeometry(11, 0.45, 8, 40, Math.PI), mat);
      a.position.set(cx + ox, 0, cz + oz); a.rotation.y = rot; scene.add(a);
      dyn.arches = dyn.arches || []; dyn.arches.push(mat);
    });
  }

  function buildStadium(scene, cx, cz) {
    const conc = new THREE.MeshStandardMaterial({ color: G.col(0xd9d6cf), roughness: 0.7, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(40, 44, 24, 48, 1, true), conc); shell.position.set(cx, 12, cz); shell.castShadow = true; shell.receiveShadow = true; scene.add(shell);
    const roof = new THREE.Mesh(new THREE.RingGeometry(26, 41, 48), new THREE.MeshStandardMaterial({ color: G.col(0xeeeeee), roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
    roof.rotation.x = -Math.PI / 2; roof.position.set(cx, 24.2, cz); roof.castShadow = true; scene.add(roof);
    const pitch = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshStandardMaterial({ color: G.col(0x2f8a3a), roughness: 1 }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(cx, 0.35, cz); scene.add(pitch);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(44.2, 44.2, 1.4, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 1.6) }));
    band.position.set(cx, 20, cz); scene.add(band);
    dyn.arches = dyn.arches || []; dyn.arches.push(band.material);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, px = cx + Math.cos(a) * 46, pz = cz + Math.sin(a) * 46;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 40, 8), new THREE.MeshStandardMaterial({ color: G.col(0x666a70), metalness: 0.7, roughness: 0.4 }));
      pole.position.set(px, 20, pz); scene.add(pole);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.3, 2.1) }));
      panel.position.set(px, 40, pz); panel.lookAt(cx, 0, cz); scene.add(panel);
    }
  }

  function buildBillboards(scene, bld) {
    const ads = [
      G.TEX.billboard('SPEED RUSH', 'OPEN CITY • ĐUA ĐÊM', '#ff0077', '#3a00ff'),
      G.TEX.billboard('NITRO X', 'TĂNG TỐC 0-100 TRONG 2.1S', '#00c3ff', '#002a6b'),
      G.TEX.billboard('APEX MOTORS', 'SIÊU XE MỚI ĐÃ CÓ MẶT', '#ff8a00', '#7a1500'),
      G.TEX.billboard('NEON CITY', 'THÀNH PHỐ KHÔNG NGỦ', '#9b00ff', '#00e1ff'),
    ];
    const cands = (bld.glass || []).concat(bld.dark || []).filter((b) => b.y === 0 && b.h > 100);
    for (let i = 0; i < Math.min(10, cands.length); i++) {
      const b = cands[i * 2 % cands.length];
      const t = ads[i % ads.length];
      const mat = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 1, 1) });
      const w = Math.min(b.w, b.d) * 0.8, h = w * 0.5;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      const side = i % 4;
      const off = [[0, b.d / 2 + 0.4, 0], [0, -b.d / 2 - 0.4, Math.PI], [b.w / 2 + 0.4, 0, Math.PI / 2], [-b.w / 2 - 0.4, 0, -Math.PI / 2]][side];
      m.position.set(b.x + (side >= 2 ? off[0] : 0), b.h * 0.55, b.z + (side < 2 ? off[1] : 0));
      m.rotation.y = off[2];
      scene.add(m); dyn.billboards.push(mat);
    }
  }

  // ---------- Street lamps (instanced) + light pools ----------
  function buildLamps(scene) {
    const L = [];
    const add = (x, z, dx, dz) => L.push({ x, z, dx, dz });
    for (const c of lines) {
      for (let j = 0; j < N; j++) for (let s = 20; s < P - 15; s += 40) {
        const z = lines[j] + s;
        add(c - HR - 1.2, z, 1, 0); add(c + HR + 1.2, z + 20, -1, 0);
        add(z, c - HR - 1.2, 0, 1); add(z + 20, c + HR + 1.2, 0, -1);
      }
    }
    // ring lamps (inner edge)
    for (let i = 0; i < W.ring.length; i += 12) {
      const p = W.ring[i], n = normalAt(W.ring, i);
      add(p.x - n.x * (RW / 2 + 1.5), p.y - n.y * (RW / 2 + 1.5), n.x, n.y);
    }
    for (let x = -BEACH_X + 30; x < BEACH_X; x += 50) add(x, BEACH_Z - HR - 1.5, 0, 1);
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.2, 9, 6); poleGeo.translate(0, 4.5, 0);
    const armGeo = new THREE.BoxGeometry(0.16, 0.16, 3); armGeo.translate(0, 9, 1.4);
    const headGeo = new THREE.BoxGeometry(0.7, 0.18, 1.2); headGeo.translate(0, 8.9, 2.8);
    const metal = new THREE.MeshStandardMaterial({ color: G.col(0x2c3036), metalness: 0.7, roughness: 0.45 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.7) });
    const poolTex = G.TEX.radial('rgba(255,214,170,0.8)', 'rgba(255,200,150,0)');
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1, 0.8, 0.58), opacity: 0, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12, fog: true });
    const poolGeo = new THREE.PlaneGeometry(12, 12); poolGeo.rotateX(-Math.PI / 2);
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const lampPose = (l, m4) => m4.compose(v.set(l.x, 0, l.z), q.setFromAxisAngle(up, Math.atan2(l.dx, l.dz)), one);
    const CH = 480, FAR = 900;
    chunked(scene, poleGeo, metal, L, CH, lampPose, { cast: true, far: FAR });
    chunked(scene, armGeo, metal, L, CH, lampPose, { far: FAR });
    chunked(scene, headGeo, bulbMat, L, CH, lampPose, { far: FAR * 1.4 });
    chunked(scene, poolGeo, poolMat, L, CH, (l, m4) => m4.compose(v.set(l.x + l.dx * 3.5, 0.08, l.z + l.dz * 3.5), q.identity(), one), { order: 2, far: FAR });
    dyn.lampBulbs = bulbMat; dyn.pools = poolMat;
  }

  // ---------- Traffic lights ----------
  function buildSignals(scene) {
    const S = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const x = lines[i], z = lines[j];
      // two poles on opposite corners; each has a head for each axis
      S.push({ i, j, x: x - HR - 1, z: z - HR - 1 }, { i, j, x: x + HR + 1, z: z + HR + 1 });
    }
    const n = S.length;
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.18, 6, 6); poleGeo.translate(0, 3, 0);
    const boxGeo = new THREE.BoxGeometry(0.7, 1.8, 0.7); boxGeo.translate(0, 6.2, 0);
    const lightGeo = new THREE.BoxGeometry(0.75, 0.5, 0.75); lightGeo.translate(0, 6.6, 0);
    const dark = new THREE.MeshStandardMaterial({ color: G.col(0x1c1f24), roughness: 0.6 });
    const poles = new THREE.InstancedMesh(poleGeo, dark, n), boxes = new THREE.InstancedMesh(boxGeo, dark, n);
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) });
    const lightsZ = new THREE.InstancedMesh(lightGeo, lm, n);
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    S.forEach((s, k) => { m4.makeTranslation(s.x, 0, s.z); poles.setMatrixAt(k, m4); boxes.setMatrixAt(k, m4); lightsZ.setMatrixAt(k, m4); lightsZ.setColorAt(k, new THREE.Color(0, 1, 0)); });
    void v;
    scene.add(poles, boxes, lightsZ);
    dyn.signals = { list: S, mesh: lightsZ, last: -1 };
  }

  // ---------- Countryside: trees outside the city ----------
  function buildCountryside(scene, trees) {
    const R = G.rng;
    let tries = 0;
    while (trees.length < 1700 && tries++ < 20000) {
      const x = R.range(-2600, 2600), z = R.range(-2700, BEACH_Z - 30);
      if (Math.abs(x) < RING + 30 && Math.abs(z) < RING + 30) continue;
      if (W.onRoad(x, z, 10)) continue;
      if (x > PAD.x0 - 30 && x < PAD.x1 + 30 && z > PAD.z0 - 30 && z < PAD.z1 + 30) continue;
      if (Math.abs(x) < 80 && z < RUNWAY.z1 + 50 && z > RUNWAY.z0 - 80) continue;
      // clusters: keep with probability from low-frequency noise
      const f = Math.sin(x * 0.004) * Math.cos(z * 0.0037) + Math.sin((x + z) * 0.0021);
      if (f < 0.1 && R() < 0.75) continue;
      trees.push({ x, z, s: 0.9 + R() * 0.9, pine: R() < 0.45 });
    }
    // palm-ish trees along the beach
    for (let x = -BEACH_X; x < BEACH_X; x += 28) trees.push({ x: x + R.range(-6, 6), z: BEACH_Z + R.range(18, 28), s: 1.1, pine: false, palm: true });
  }
  function buildTrees(scene, trees) {
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 4, 6); trunkGeo.translate(0, 2, 0);
    const leafGeo = new THREE.IcosahedronGeometry(3, 0); leafGeo.translate(0, 5.6, 0);
    const pineGeo = new THREE.ConeGeometry(2.6, 8, 7); pineGeo.translate(0, 7, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: G.col(0x5a4030), roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const leaves = trees.filter((t) => !t.pine), pines = trees.filter((t) => t.pine);
    const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const greens = [0x3f6b2a, 0x4d7d33, 0x5a8a3a, 0x355f28, 0x6b8f3a];
    const rot = (t) => q.setFromAxisAngle(up, (t.x * 13.7 + t.z) % 6.28);
    const tint = (t) => c.copy(G.col(greens[Math.abs(Math.floor(t.x * 7 + t.z * 3)) % greens.length]));
    const o = { cast: true, receive: true, far: 1500 }, CH = 1300;
    chunked(scene, trunkGeo, trunkMat, trees, CH, (t, m4) => m4.compose(v.set(t.x, 0, t.z), rot(t), s.set(t.s, t.s * (t.palm ? 2.2 : 1), t.s)), o);
    chunked(scene, pineGeo, leafMat, pines, CH, (t, m4, mesh, i) => { m4.compose(v.set(t.x, 0, t.z), rot(t), s.set(t.s, t.s, t.s)); mesh.setColorAt(i, tint(t)); }, o);
    chunked(scene, leafGeo, leafMat, leaves, CH, (t, m4, mesh, i) => {
      if (t.palm) m4.compose(v.set(t.x, 4.5 * t.s, t.z), rot(t), s.set(t.s * 1.2, t.s * 0.45, t.s * 1.2));
      else m4.compose(v.set(t.x, 0, t.z), rot(t), s.set(t.s, t.s, t.s));
      mesh.setColorAt(i, tint(t));
    }, o);
    trees.forEach((t) => addCollider({ t: 'circle', x: t.x, z: t.z, r: 0.6 * t.s }));
  }

  // ---------- Stunt park & ramps ----------
  function buildRampsAndPad(scene) {
    const pcx = (PAD.x0 + PAD.x1) / 2, pcz = (PAD.z0 + PAD.z1) / 2;
    addRamp(pcx - 40, pcz - 150, 0, 14, 26, 5);
    addRamp(pcx + 40, pcz + 150, Math.PI, 14, 26, 5);
    addRamp(pcx - 180, pcz - 70, Math.PI / 2, 12, 18, 3);
    addRamp(pcx + 60, pcz - 10, Math.PI / 2, 18, 40, 9);       // mega ramp
    addRamp(pcx + 170, pcz + 60, -Math.PI / 2, 12, 20, 4);
    addRamp(0, RUNWAY.z1 - 900, Math.PI, 16, 30, 6);          // runway kicker (driving north)
    addRamp(-6, BEACH_Z - 4, Math.PI / 2, 10, 16, 2.5);        // beach road hop
    addRamp(lines[2] + 60 - 6, lines[8] + 60, 0, 10, 14, 2.4); // park jump
    const tex = G.TEX.chevron(); tex.repeat.set(0.12, 0.12);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1 });
    for (const r of W.ramps) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(r.len, 0); sh.lineTo(r.len, r.h); sh.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: r.w, bevelEnabled: false });
      g.rotateY(-Math.PI / 2); g.translate(r.w / 2, 0, 0);
      const m = new THREE.Mesh(g, mat);
      m.position.set(r.x, 0.03, r.z); m.rotation.y = r.ang; m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
    // pad barriers (tyre stacks) as colliders + visuals
    const tg = new THREE.CylinderGeometry(1.2, 1.2, 1.6, 12); tg.translate(0, 0.8, 0);
    const pts = [];
    for (let x = PAD.x0; x <= PAD.x1; x += 10) { pts.push([x, PAD.z0 - 2]); pts.push([x, PAD.z1 + 2]); }
    for (let z = PAD.z0; z <= PAD.z1; z += 10) { if (Math.abs(z) > 18) pts.push([PAD.x0 - 2, z]); pts.push([PAD.x1 + 2, z]); }
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ roughness: 0.9 }), pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach((p, i) => { m4.makeTranslation(p[0], 0, p[1]); tm.setMatrixAt(i, m4); tm.setColorAt(i, G.col(i % 2 ? 0xd02020 : 0xf0f0f0)); addCollider({ t: 'circle', x: p[0], z: p[1], r: 1.2 }); });
    tm.castShadow = true; scene.add(tm);
    // runway edge lights
    const rl = [];
    for (let z = RUNWAY.z0; z <= RUNWAY.z1; z += 30) { rl.push([RUNWAY.x0 - 1.5, z]); rl.push([RUNWAY.x1 + 1.5, z]); }
    const rlm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.8, 1.6) });
    const rli = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 6, 4), rlm, rl.length);
    rl.forEach((p, i) => { m4.makeTranslation(p[0], 0.35, p[1]); rli.setMatrixAt(i, m4); });
    scene.add(rli); dyn.runwayLights = rlm;
    // hangar at the runway end
    const hangar = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 80, 24, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: G.col(0x9aa0a6), metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
    hangar.rotation.z = Math.PI / 2; hangar.rotation.y = Math.PI / 2; hangar.position.set(90, 0, RUNWAY.z0 + 120); scene.add(hangar);
    addCollider({ t: 'box', x0: 60, x1: 120, z0: RUNWAY.z0 + 80, z1: RUNWAY.z0 + 160 });
  }

  // ---------- Distant mountains ----------
  function buildMountains(scene) {
    const R = G.rng;
    const geo = new THREE.BufferGeometry();
    const pos = [], col = [];
    const cLow = G.col(0x3d5a3a), cMid = G.col(0x6b6f72), cTop = G.col(0xf4f6f8);
    for (let k = 0; k < 70; k++) {
      const a = k / 70 * Math.PI * 2 + R() * 0.05;
      if (Math.sin(a) > 0.55) continue; // keep the southern sea horizon open
      const dist = R.range(3600, 4400), h = R.range(280, 900), rad = R.range(450, 900);
      const cx = Math.cos(a) * dist, cz = Math.sin(a) * dist;
      const seg = 9;
      for (let s = 0; s < seg; s++) {
        const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2;
        const j0 = 0.75 + R() * 0.5, j1 = 0.75 + R() * 0.5;
        const p0 = [cx + Math.cos(a0) * rad * j0, 0, cz + Math.sin(a0) * rad * j0];
        const p1 = [cx + Math.cos(a1) * rad * j1, 0, cz + Math.sin(a1) * rad * j1];
        const mid0 = [cx + Math.cos(a0) * rad * 0.45, h * 0.55, cz + Math.sin(a0) * rad * 0.45];
        const mid1 = [cx + Math.cos(a1) * rad * 0.45, h * 0.55, cz + Math.sin(a1) * rad * 0.45];
        const top = [cx, h, cz];
        const tri = (A, B, Cc, ca, cb, cc) => { pos.push(...A, ...B, ...Cc); col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b); };
        tri(p0, mid1, p1, cLow, cMid, cLow); tri(p0, mid0, mid1, cLow, cMid, cMid);
        const snow = h > 600 ? cTop : cMid;
        tri(mid0, top, mid1, cMid, snow, cMid);
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false;
    scene.add(m); dyn.mountains = mat;
  }

  // ---------- Minimap base canvas ----------
  W.MAP = { x0: -2000, z0: -2700, x1: 2000, z1: 1500, s: 0.4 };
  W.toMap = (x, z) => [(x - W.MAP.x0) * W.MAP.s, (z - W.MAP.z0) * W.MAP.s];
  function buildMap(bld) {
    const M = W.MAP, w = Math.round((M.x1 - M.x0) * M.s), h = Math.round((M.z1 - M.z0) * M.s);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    const tm = W.toMap;
    x.fillStyle = '#2b3a2a'; x.fillRect(0, 0, w, h);
    const [, syS] = tm(0, BEACH_Z + 20), [, syW] = tm(0, C.SEA_Z);
    x.fillStyle = '#9b8a62'; x.fillRect(0, syS, w, syW - syS);
    x.fillStyle = '#123a52'; x.fillRect(0, syW, w, h - syW);
    // blocks
    for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
      const r = W.blockRect(bi, bj), t = W.blockType(bi, bj);
      const [a, b] = tm(r.x0, r.z0), [c, d] = tm(r.x1, r.z1);
      x.fillStyle = t === 'park' ? '#3f6a35' : t === 'plaza' ? '#6b6560' : t === 'stadium' ? '#5a6a7a' : '#3c4048';
      x.fillRect(a, b, c - a, d - b);
    }
    x.strokeStyle = '#c9ced6'; x.lineCap = 'butt';
    const line = (x1, z1, x2, z2, width) => { const [a, b] = tm(x1, z1), [c, d] = tm(x2, z2); x.lineWidth = width * M.s; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); };
    for (const c of lines) { line(c, -RING, c, RING, C.ROAD); line(-RING, c, RING, c, C.ROAD); }
    for (const ex of EXT_X) line(ex, RING, ex, BEACH_Z, C.ROAD);
    line(-BEACH_X, BEACH_Z, BEACH_X, BEACH_Z, C.ROAD);
    x.strokeStyle = '#e8d07a'; x.lineWidth = RW * M.s; x.beginPath();
    W.ring.forEach((p, i) => { const [a, b] = tm(p.x, p.y); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.closePath(); x.stroke();
    x.fillStyle = '#c9ced6';
    const fr = (r) => { const [a, b] = tm(r.x0, r.z0), [c, d] = tm(r.x1, r.z1); x.fillRect(a, b, c - a, d - b); };
    fr(RUNWAY); fr(PAD); fr(CONNECT);
    W.mapCanvas = cv;
  }

  // ---------------- Per-frame ----------------
  const sigColors = { g: new THREE.Color(0.1, 4, 0.8), y: new THREE.Color(4, 2.4, 0.1), r: new THREE.Color(4, 0.15, 0.1) };
  W.update = function (dt, t, night) {
    const n = night;
    // night levels are deliberately modest: bloom picks up only the brightest bits (bulbs, signals)
    for (const w of dyn.windows) w.mat.emissiveIntensity = (w.style === 'house' ? 0.5 : 0.62) * n + 0.02;
    if (dyn.lampBulbs) dyn.lampBulbs.color.setRGB(1 + 2.2 * n, 0.85 + 1.75 * n, 0.6 + 1.1 * n);
    if (dyn.pools) dyn.pools.opacity = 0.2 * n;
    if (dyn.neon) dyn.neon.color.setScalar(0.9 + 0.75 * n);
    if (dyn.arches) dyn.arches.forEach((m) => { m.userData.base = m.userData.base || m.color.clone(); m.color.copy(m.userData.base).multiplyScalar(0.55 + 0.45 * n); });
    if (dyn.antennaLights) dyn.antennaLights.color.setRGB(Math.sin(t * 3) > 0.3 ? 3 : 0.2, 0.12, 0.08);
    if (dyn.runwayLights) dyn.runwayLights.color.setRGB(0.4 + 0.2 * n, 0.6 + 0.5 * n, 1.0 + 0.8 * n);
    dyn.billboards.forEach((m) => m.color.setScalar(1.0 - 0.15 * n));
    // distance culling of small chunked props (beyond fog they are invisible anyway)
    const cam = G.R && G.R.camera;
    if (cam) for (const c of chunks) c.mesh.visible = cam.position.distanceTo(c.s.center) - c.s.radius < c.far;
    if (dyn.water && dyn.water.normalMap) { dyn.water.normalMap.offset.x = t * 0.004; dyn.water.normalMap.offset.y = t * 0.0025; }
    if (dyn.mountains) { const k = 1 - 0.8 * n; dyn.mountains.color.setRGB(k, k, k * 1.05); }
    // traffic signals: recolour once per second
    const sig = dyn.signals;
    const sec = Math.floor(t);
    if (sig && sec !== sig.last) {
      sig.last = sec;
      sig.list.forEach((s, k) => { sig.mesh.setColorAt(k, sigColors[W.signal(s.i, s.j, k % 2 ? 'x' : 'z', t)]); });
      sig.mesh.instanceColor.needsUpdate = true;
    }
  };

  return W;
})();
