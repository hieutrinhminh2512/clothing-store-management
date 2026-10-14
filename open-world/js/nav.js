// ================================================================
//  Navigation (G.Nav): road graph of the whole map, shortest route
//  (Dijkstra), 3D route ribbon on the road, turn-by-turn GPS panel
//  and street names — "Google Maps" for the open world.
// ================================================================
'use strict';

G.Nav = (function () {
  const N = {};
  const C = G.CFG;
  // street names: x-lines run north-south, z-lines east-west
  const NAMES_X = ['Lê Lợi', 'Nguyễn Huệ', 'Hai Bà Trưng', 'Trần Hưng Đạo', 'Lý Thường Kiệt', 'Điện Biên Phủ', 'Hàm Nghi', 'Pasteur', 'Võ Văn Tần', 'Lê Duẩn', 'Nam Kỳ Khởi Nghĩa', 'Cách Mạng Tháng 8', 'Nguyễn Trãi'];
  const NAMES_Z = ['Phạm Ngũ Lão', 'Bùi Viện', 'Đồng Khởi', 'Tôn Đức Thắng', 'Nguyễn Du', 'Lý Tự Trọng', 'Lê Thánh Tôn', 'Hoàng Diệu', 'Trường Chinh', 'Võ Thị Sáu', 'Ba Tháng Hai', 'Phan Xích Long', 'Xa Lộ Hà Nội'];
  let nodes = [], edges = [], adj = [];
  let built = false;

  // ---------------- Graph ----------------
  function addNode(x, z, junction, road) { nodes.push({ x, z, junction: !!junction, road }); adj.push([]); return nodes.length - 1; }
  function link(a, b, road) {
    const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
    edges.push({ a, b, len, road });
    adj[a].push({ to: b, len }); adj[b].push({ to: a, len });
  }
  function build() {
    if (built) return; built = true;
    const W = G.W, L = W.lines, n = C.N, RING = C.RING;
    // city grid
    const g = [];
    for (let i = 0; i <= n; i++) { g[i] = []; for (let j = 0; j <= n; j++) g[i][j] = addNode(L[i], L[j], true); }
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      if (i < n) link(g[i][j], g[i + 1][j], NAMES_Z[j]);
      if (j < n) link(g[i][j], g[i][j + 1], NAMES_X[i]);
    }
    // ring highway (every 2nd sample of the 4 m polyline)
    const ring = [];
    for (let k = 0; k < W.ring.length; k += 2) ring.push(addNode(W.ring[k].x, W.ring[k].y, false, 'ring'));
    for (let k = 0; k < ring.length; k++) link(ring[k], ring[(k + 1) % ring.length], 'Cao tốc Vành đai');
    const ringNear = (x, z) => { let best = 0, bd = Infinity; for (const id of ring) { const d = (nodes[id].x - x) ** 2 + (nodes[id].z - z) ** 2; if (d < bd) { bd = d; best = id; } } nodes[best].junction = true; return best; };
    // grid ends join the ring on all four sides
    for (let i = 0; i <= n; i++) {
      link(g[i][0], ringNear(L[i], -RING), NAMES_X[i]); link(g[i][n], ringNear(L[i], RING), NAMES_X[i]);
      link(g[0][i], ringNear(-RING, L[i]), NAMES_Z[i]); link(g[n][i], ringNear(RING, L[i]), NAMES_Z[i]);
    }
    // south avenues to the beach road
    const beach = [addNode(-W.BEACH_X, W.BEACH_Z, true)];
    for (const ex of W.EXT_X) {
      const r0 = ringNear(ex, RING), b = addNode(ex, W.BEACH_Z, true);
      const k = L.indexOf(ex);
      link(r0, b, NAMES_X[k] + ' (ra biển)'); beach.push(b);
    }
    beach.push(addNode(W.BEACH_X, W.BEACH_Z, true));
    beach.sort((a, b) => nodes[a].x - nodes[b].x);
    for (let k = 0; k + 1 < beach.length; k++) link(beach[k], beach[k + 1], 'Đường Ven Biển');
    // airport runway (north) and stunt park (east)
    const R = W.RUNWAY, rw0 = addNode(0, R.z1 - 30, true), rw1 = addNode(0, R.z0 + 60, true);
    link(ringNear(0, -RING), rw0, 'Đường băng sân bay'); link(rw0, rw1, 'Đường băng sân bay');
    const P = W.PAD, pc = addNode(W.CONNECT.x1, 0, true), pm = addNode((P.x0 + P.x1) / 2, (P.z0 + P.z1) / 2, true);
    link(ringNear(RING, 0), pc, 'Đường vào bãi stunt'); link(pc, pm, 'Bãi stunt');
    // district roads (curves): node chains whose open ends join the nearest earlier node
    for (const rd of (W.extra ? W.extra.roads : [])) {
      const start = nodes.length, ids = rd.pts.map((p) => addNode(p.x, p.z, false));
      for (let k = 0; k + 1 < ids.length; k++) link(ids[k], ids[k + 1], rd.name);
      if (rd.closed) { link(ids[ids.length - 1], ids[0], rd.name); continue; }
      for (const end of [ids[0], ids[ids.length - 1]]) {
        const p = nodes[end]; let best = -1, bd = 45 * 45;
        for (let k = 0; k < start; k++) { const d = (nodes[k].x - p.x) ** 2 + (nodes[k].z - p.z) ** 2; if (d < bd) { bd = d; best = k; } }
        if (best >= 0) { link(end, best, rd.name); nodes[end].junction = nodes[best].junction = true; }
      }
    }
    N.nodes = nodes; N.edges = edges;
  }

  // nearest point on any road segment
  function snap(x, z) {
    let best = null, bd = Infinity;
    for (const e of edges) {
      const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz || 1;
      const t = G.clamp(((x - A.x) * dx + (z - A.z) * dz) / l2, 0, 1);
      const px = A.x + dx * t, pz = A.z + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) { bd = d; best = { e, t, x: px, z: pz, d: Math.sqrt(d) }; }
    }
    return best;
  }
  N.snap = (x, z) => { build(); return snap(x, z); };

  // Dijkstra with a binary heap from snapped point s to snapped point t
  function shortest(s, t) {
    const V = nodes.length, S = V, T = V + 1, dist = new Float64Array(V + 2).fill(Infinity), prev = new Int32Array(V + 2).fill(-1);
    const extra = (id) => {
      const out = [];
      if (id === S) { out.push({ to: s.e.a, len: s.e.len * s.t }, { to: s.e.b, len: s.e.len * (1 - s.t) }); if (s.e === t.e) out.push({ to: T, len: Math.abs(s.t - t.t) * s.e.len }); }
      else { for (const x of adj[id]) out.push(x); if (id === t.e.a) out.push({ to: T, len: t.e.len * t.t }); if (id === t.e.b) out.push({ to: T, len: t.e.len * (1 - t.t) }); }
      return out;
    };
    const heap = [[0, S]]; dist[S] = 0;
    const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, v] = pop();
      if (d > dist[v]) continue;
      if (v === T) break;
      for (const { to, len } of extra(v)) { const nd = d + len; if (nd < dist[to]) { dist[to] = nd; prev[to] = v; push(nd, to); } }
    }
    if (!isFinite(dist[T])) return null;
    const ids = []; for (let v = prev[T]; v !== S && v >= 0; v = prev[v]) ids.unshift(v);
    return { ids, len: dist[T] };
  }

  // ---------------- Active route ----------------
  N.active = null; // { target:{x,z}, name, route:[{x,z,j}], len, onArrive, silent }
  let recalcT = 0;
  N.set = function (target, opts) {
    build();
    opts = opts || {};
    N.active = { target: { x: target.x, z: target.z }, name: opts.name || N.placeName(target.x, target.z), onArrive: opts.onArrive || null, silent: !!opts.silent, keep: !!opts.keep, arriveR: opts.arriveR || 22, route: [], len: 0 };
    recalcT = 0;
    const F = G.Game && G.Game.focus ? G.Game.focus() : null;
    if (F) recalc(F);
    if (G.UI) G.UI.gps = N.active;
    if (!opts.silent && G.UI) G.UI.toast('📍 Chỉ đường tới: ' + N.active.name + ' (' + fmtDist(N.active.len) + ')', 2200);
    return N.active;
  };
  N.clear = function () { N.active = null; if (G.UI) G.UI.gps = null; if (ribbon) ribbon.visible = false; showPanel(false); };
  function recalc(F) {
    const A = N.active; if (!A) return;
    const s = snap(F.x, F.z), t = snap(A.target.x, A.target.z);
    const r = s && t ? shortest(s, t) : null;
    const pts = [{ x: s ? s.x : F.x, z: s ? s.z : F.z, j: false }];
    if (r) for (const id of r.ids) pts.push({ x: nodes[id].x, z: nodes[id].z, j: nodes[id].junction, id });
    pts.push({ x: t.x, z: t.z, j: false });
    if (t.d > 12) pts.push({ x: A.target.x, z: A.target.z, j: false, off: true }); // last leg off the road
    // drop the first node if we've already passed it (avoids a U-turn blip)
    if (pts.length > 2) {
      const a = pts[0], b = pts[1], c = pts[2];
      if ((b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z) < 0 && Math.hypot(b.x - a.x, b.z - a.z) < 30) pts.splice(1, 1);
    }
    A.route = pts;
    let len = (s ? s.d : 0); for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    A.len = len;
  }

  // next manoeuvre: first junction where the road turns by more than ~30°
  function nextTurn(route) {
    let d = 0;
    for (let i = 1; i < route.length - 1; i++) {
      const a = route[i - 1], b = route[i];
      d += Math.hypot(b.x - a.x, b.z - a.z);
      if (!b.j) continue;
      // outgoing direction: ~25 m ahead (ring samples are short)
      let k = i + 1, ox = 0, oz = 0;
      while (k < route.length) { ox = route[k].x - b.x; oz = route[k].z - b.z; if (Math.hypot(ox, oz) > 20) break; k++; }
      const ix = b.x - a.x, iz = b.z - a.z, il = Math.hypot(ix, iz) || 1, ol = Math.hypot(ox, oz) || 1;
      const cos = (ix * ox + iz * oz) / il / ol;
      if (cos > 0.85) continue;
      // right vector of the incoming direction is (-iz, ix)
      const right = (-iz * ox + ix * oz) / il / ol > 0;
      const road = edgeRoad(b.id, route[i + 1] && route[i + 1].id);
      return { dist: d, kind: cos < -0.7 ? 'uturn' : (right ? 'right' : 'left'), sharp: cos < 0.2, road };
    }
    return null;
  }
  function edgeRoad(a, b) {
    if (a === undefined || b === undefined) return '';
    for (const e of edges) if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e.road || '';
    return '';
  }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.max(10, Math.round(m / 10) * 10) + ' m'; }
  N.fmtDist = fmtDist;

  // street / place under a point
  N.streetAt = function (x, z) {
    build();
    const s = snap(x, z);
    if (!s || s.d > 30) return N.placeName(x, z);
    return s.e.road || '';
  };
  N.places = function () {
    const W = G.W, L = W.lines, R = W.RUNWAY, P = W.PAD, mid = (i) => (L[i] + L[i + 1]) / 2;
    const list = [
      { name: 'Quảng trường Trung tâm', icon: '⛲', x: mid(5), z: mid(5) },
      { name: 'Sân vận động', icon: '🏟️', x: mid(9), z: mid(8) },
      { name: 'Công viên Tao Đàn', icon: '🌳', x: mid(2), z: mid(8) },
      { name: 'Công viên Lê Văn Tám', icon: '🌳', x: mid(9), z: mid(3) },
      { name: 'Đường băng sân bay', icon: '🛫', x: 0, z: R.z1 - 120 },
      { name: 'Bãi stunt', icon: '🛹', x: (P.x0 + P.x1) / 2, z: 0 },
      { name: 'Bãi biển Vũng Tàu', icon: '🏖️', x: 0, z: W.BEACH_Z },
      { name: 'Bến xe Miền Tây', icon: '🚌', x: -W.BEACH_X + 80, z: W.BEACH_Z },
      { name: 'Khu cảng Đông', icon: '⚓', x: W.BEACH_X - 80, z: W.BEACH_Z },
    ];
    if (G.Districts) for (const p of G.Districts.places) list.push(p);
    if (G.GTA && G.GTA.places) for (const p of G.GTA.places()) list.push(p);
    if (G.Events && G.Events.markers) for (const m of G.Events.markers()) list.push({ name: m.def.name, icon: m.def.icon, x: m.x, z: m.z, event: true });
    return list;
  };
  N.placeName = function (x, z) {
    for (const p of N.places()) if (Math.hypot(p.x - x, p.z - z) < 90) return p.name;
    const s = built ? snap(x, z) : null;
    return s && s.d < 40 && s.e.road ? s.e.road : 'Điểm đánh dấu';
  };

  // ---------------- 3D route ribbon (chevrons on the road, right-hand lane) ----------------
  const MAXP = 600;
  let ribbon = null, rPos, rUv;
  function ribbonInit() {
    const geo = new THREE.BufferGeometry();
    rPos = new Float32Array(MAXP * 2 * 3); rUv = new Float32Array(MAXP * 2 * 2);
    const idx = [];
    for (let i = 0; i < MAXP - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(rUv, 2).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(8, 40); x.lineTo(32, 14); x.lineTo(56, 40); x.lineTo(56, 52); x.lineTo(32, 26); x.lineTo(8, 52); x.closePath(); x.fill();
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.22, 0.55, 1.9), transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    ribbon = new THREE.Mesh(geo, mat); ribbon.frustumCulled = false; ribbon.renderOrder = 2; ribbon.visible = false;
    G.R.scene.add(ribbon);
  }
  // densify the route (≤ 4 m steps) for the first ~600 m, offset into the right-hand lane
  function ribbonUpdate(F, t) {
    if (!ribbon) ribbonInit();
    const A = N.active;
    if (!A || A.route.length < 2 || G.save.settings.gpsLine === false) { ribbon.visible = false; return; }
    const pts = [];
    let acc = 0;
    for (let i = 1; i < A.route.length && pts.length < MAXP && acc < 600; i++) {
      const a = A.route[i - 1], b = A.route[i], l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(l / 4));
      for (let k = i === 1 ? 0 : 1; k <= n && pts.length < MAXP; k++) pts.push({ x: G.lerp(a.x, b.x, k / n), z: G.lerp(a.z, b.z, k / n), off: b.off });
      acc += l;
    }
    if (pts.length < 2) { ribbon.visible = false; return; }
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let dx = q.x - o.x, dz = q.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const rx = -dz, rz = dx, lane = p.off ? 0 : 3.2, hw = 1.1;
      const cx = p.x + rx * lane, cz = p.z + rz * lane, y = G.W.groundHeight(cx, cz) + 0.09;
      if (i) dist += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      rPos.set([cx - rx * hw, y, cz - rz * hw, cx + rx * hw, y, cz + rz * hw], i * 6);
      rUv.set([0, dist / 2.6, 1, dist / 2.6], i * 4);
    }
    const g = ribbon.geometry;
    g.setDrawRange(0, (pts.length - 1) * 6);
    g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
    ribbon.material.map.offset.y = -t * 1.6; // chevrons flow toward the destination
    ribbon.material.opacity = 0.55 + G.R.night * 0.3;
    ribbon.visible = true;
  }

  // ---------------- GPS panel (top centre) ----------------
  let panel = null, pLast = '';
  function showPanel(on) {
    if (panel) panel.classList.toggle('hidden', !on);
    const hud = document.getElementById('hud'); if (hud && hud.classList.contains('has-gps') !== on) hud.classList.toggle('has-gps', on);
  }
  function panelUpdate(F) {
    const A = N.active;
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'gpsPanel'; panel.className = 'gps-panel hidden';
      panel.innerHTML = '<div class="gp-arrow" id="gpArrow">⬆</div><div class="gp-main"><div class="gp-dist" id="gpDist"></div><div class="gp-road" id="gpRoad"></div><div class="gp-meta"><span class="gp-dest" id="gpDest"></span> <span class="gp-eta" id="gpEta"></span></div></div><button class="gp-x" id="gpX" title="Huỷ chỉ đường">✕</button>';
      const hud = document.getElementById('hud'); (hud || document.body).appendChild(panel);
      panel.querySelector('#gpX').onclick = () => { if (N.active && N.active.keep) { G.UI.toast('Đang làm nhiệm vụ — không thể huỷ chỉ đường'); return; } N.clear(); };
    }
    if (!A) { showPanel(false); return; }
    showPanel(true);
    const turn = nextTurn(A.route);
    const arrow = !turn || turn.dist > 400 ? '⬆' : ({ left: turn.sharp ? '↰' : '⬉', right: turn.sharp ? '↱' : '⬈', uturn: '⮌' }[turn.kind]);
    const verb = turn ? ({ left: 'Rẽ trái', right: 'Rẽ phải', uturn: 'Quay đầu' }[turn.kind]) : 'Đi thẳng';
    const distTxt = turn ? fmtDist(turn.dist) : fmtDist(A.len);
    const road = turn ? (turn.road ? verb + ' vào ' + turn.road : verb) : ('Tới ' + A.name);
    const spd = Math.max(F.speed || 0, 12);
    const eta = Math.round(A.len / spd);
    const key = arrow + distTxt + road + A.name + Math.round(A.len / 10) + eta;
    if (key === pLast) return; pLast = key;
    panel.querySelector('#gpArrow').textContent = arrow;
    panel.querySelector('#gpDist').textContent = distTxt;
    panel.querySelector('#gpRoad').textContent = road;
    panel.querySelector('#gpDest').textContent = '📍 ' + A.name;
    panel.querySelector('#gpEta').textContent = '• ' + fmtDist(A.len) + ' • ' + (eta >= 60 ? Math.round(eta / 60) + ' phút' : eta + ' giây');
  }

  // per frame (called by the game loop with the player's car or the character)
  N.update = function (dt, F, t) {
    if (G.UI && !G.UI.gps && N.active) N.clear(); // someone cleared G.UI.gps directly
    const A = N.active;
    if (!A) { if (ribbon) ribbon.visible = false; showPanel(false); return; }
    recalcT -= dt;
    if (recalcT <= 0) { recalcT = 0.4; recalc(F); }
    else if (A.route.length) A.route[0] = { x: F.x, z: F.z, j: false };
    ribbonUpdate(F, t);
    panelUpdate(F);
    if (Math.hypot(A.target.x - F.x, A.target.z - F.z) < A.arriveR) {
      const cb = A.onArrive;
      if (!A.silent) { G.UI.toast('🎯 Đã đến: ' + A.name); if (G.Audio.checkpoint) G.Audio.checkpoint(); }
      N.clear();
      if (cb) cb();
    }
  };
  // moving target (suspect car, remote player): keep the route but follow the point
  N.retarget = function (x, z) { if (N.active) { N.active.target.x = x; N.active.target.z = z; } };
  // graph access for AI drivers
  N.nearestNode = function (x, z) {
    build();
    let best = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) { const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  };
  N.neighbors = (id) => adj[id].map((e) => e.to);
  N.node = (id) => nodes[id];
  // random point on a city street, on the pavement beside it (for passengers / spawns)
  N.streetSpot = function (fromX, fromZ, minD, maxD) {
    build();
    const L = G.W.lines, HR = C.ROAD / 2;
    for (let k = 0; k < 80; k++) {
      const i = Math.floor(Math.random() * L.length), j = Math.floor(Math.random() * (L.length - 1));
      const t = 0.25 + Math.random() * 0.5, alongX = Math.random() < 0.5, side = Math.random() < 0.5 ? 1 : -1;
      const rx = alongX ? L[j] + (L[j + 1] - L[j]) * t : L[i], rz = alongX ? L[i] : L[j] + (L[j + 1] - L[j]) * t;
      const d = Math.hypot(rx - fromX, rz - fromZ);
      if (d < minD || d > maxD) continue;
      // people wait on the pavement (sidewalks are walkable)
      const sx = alongX ? rx : rx + side * (HR + 2), sz = alongX ? rz + side * (HR + 2) : rz;
      if (G.W.pointBlocked(sx, sz)) continue;
      const num = 10 + Math.floor(Math.random() * 380);
      return { x: rx, z: rz, sx, sz, face: Math.atan2(rx - sx, rz - sz), name: 'Số ' + num + ' ' + N.streetAt(rx, rz) };
    }
    return null;
  };
  N.build = build;
  return N;
})();
