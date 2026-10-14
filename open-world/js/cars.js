// ================================================================
//  Car catalogue + procedural 3D car models
//  Bodies are extruded side-profiles with real wheel arches,
//  clear-coat paint, glass greenhouse, lights, spoilers, wheels.
// ================================================================
'use strict';

// Speeds in m/s (x3.6 = km/h). accel in m/s^2, grip = lateral damping
G.CARS = [
  { id: 'kitsune', name: 'KITSUNE TYPE-R', brand: 'HIKARI', cls: 'D', price: 0, desc: 'Hatchback độ nhẹ, linh hoạt, dễ drift — xe khởi đầu.',
    maxSpeed: 62, accel: 13, brake: 30, grip: 7.0, steer: 0.62, mass: 1150, nitro: 1.0,
    body: { L: 4.15, W: 1.82, clr: 0.24, nose: 0.74, beltF: 0.98, beltR: 1.0, tail: 1.02, roof: 1.44, ws: 0.62, rf: 0.0, rr: -1.55, rw: -1.95, wheelR: 0.33, wb: 2.55, style: 'hatch' },
    colors: [0xf2f2f2, 0xd21f2a, 0x1b6fe0, 0xf6c400, 0x1a1a1d, 0x28c76f] },
  { id: 'raptor', name: 'RAPTOR GT 500', brand: 'STALLION', cls: 'C', price: 15000, desc: 'Xe cơ bắp V8, tăng tốc mạnh, đuôi dễ văng.',
    maxSpeed: 74, accel: 15, brake: 30, grip: 6.2, steer: 0.55, mass: 1650, nitro: 1.1,
    body: { L: 4.8, W: 1.96, clr: 0.22, nose: 0.82, beltF: 0.98, beltR: 1.0, tail: 0.98, roof: 1.33, ws: 0.25, rf: -0.4, rr: -1.15, rw: -1.75, wheelR: 0.35, wb: 2.85, style: 'muscle' },
    colors: [0x0d47a1, 0xff6f00, 0x111111, 0xe0e0e0, 0x8e0000, 0x2e7d32] },
  { id: 'vanta', name: 'VANTA S-SPORT', brand: 'NORDWERK', cls: 'C', price: 22000, desc: 'Sedan thể thao bốn cửa, cân bằng và ổn định.',
    maxSpeed: 76, accel: 14, brake: 34, grip: 8.0, steer: 0.56, mass: 1700, nitro: 1.0,
    body: { L: 4.95, W: 1.9, clr: 0.22, nose: 0.72, beltF: 0.96, beltR: 1.02, tail: 1.04, roof: 1.45, ws: 0.6, rf: -0.05, rr: -1.25, rw: -1.8, wheelR: 0.35, wb: 2.9, style: 'sedan' },
    colors: [0x2b2f36, 0xc0c4c8, 0x0a2a5a, 0x7a0012, 0xf5f5f5, 0x3a4a2a] },
  { id: 'titan', name: 'TITAN 4X4 R', brand: 'IRONHIDE', cls: 'C', price: 28000, desc: 'SUV off-road: chạy cỏ/cát gần như đường nhựa, nặng, khó cản.',
    maxSpeed: 64, accel: 12, brake: 28, grip: 7.5, steer: 0.55, mass: 2300, nitro: 1.0, offroad: true,
    body: { L: 4.75, W: 2.02, clr: 0.5, nose: 1.15, beltF: 1.32, beltR: 1.34, tail: 1.36, roof: 1.98, ws: 0.8, rf: 0.25, rr: -2.1, rw: -2.3, wheelR: 0.46, wb: 2.85, style: 'suv' },
    colors: [0x4b5320, 0xd8d2c0, 0x1a1a1a, 0xb33a00, 0x2a3f5f, 0xffffff] },
  { id: 'apex', name: 'APEX GT-R', brand: 'APEX MOTORS', cls: 'B', price: 45000, desc: 'Coupe GT dẫn động 4 bánh, bám đường xuất sắc.',
    maxSpeed: 86, accel: 17, brake: 38, grip: 9.5, steer: 0.55, mass: 1550, nitro: 1.15,
    body: { L: 4.7, W: 1.96, clr: 0.2, nose: 0.68, beltF: 0.92, beltR: 0.98, tail: 1.0, roof: 1.33, ws: 0.5, rf: -0.25, rr: -1.0, rw: -1.9, wheelR: 0.35, wb: 2.78, style: 'gt', wing: 'big' },
    colors: [0xb0b5bb, 0x0050ff, 0xff2d2d, 0x101010, 0xffd400, 0xff7a00] },
  { id: 'phantom', name: 'PHANTOM V12', brand: 'ROSSO', cls: 'A', price: 80000, desc: 'Siêu xe động cơ đặt giữa V12, tốc độ cực đại khủng.',
    maxSpeed: 96, accel: 20, brake: 42, grip: 10, steer: 0.52, mass: 1450, nitro: 1.2,
    body: { L: 4.6, W: 2.04, clr: 0.18, nose: 0.55, beltF: 0.78, beltR: 0.96, tail: 0.96, roof: 1.17, ws: 0.95, rf: 0.05, rr: -0.75, rw: -1.5, wheelR: 0.35, wb: 2.7, style: 'hyper', wing: 'duck' },
    colors: [0xd50000, 0xffc400, 0x00c853, 0xf5f5f5, 0x111111, 0x6a1b9a] },
  { id: 'aero', name: 'AERO JX ABSOLUT', brand: 'KÖNIG', cls: 'S', price: 130000, desc: 'Hypercar khí động học, 1600 mã lực, cánh gió cổ thiên nga.',
    maxSpeed: 108, accel: 22, brake: 46, grip: 11, steer: 0.5, mass: 1400, nitro: 1.25,
    body: { L: 4.65, W: 2.06, clr: 0.16, nose: 0.5, beltF: 0.74, beltR: 0.92, tail: 0.92, roof: 1.12, ws: 1.05, rf: 0.15, rr: -0.6, rw: -1.3, wheelR: 0.35, wb: 2.75, style: 'hyper', wing: 'swan' },
    colors: [0xdfe6ee, 0x00b8ff, 0xff4081, 0x111317, 0xff9100, 0x00e676] },
  { id: 'formula', name: 'F-ZERO W1', brand: 'VELOCE', cls: 'S+', price: 220000, desc: 'Xe công thức 1: bám đường tuyệt đối, nhanh nhất thành phố.',
    maxSpeed: 115, accel: 26, brake: 55, grip: 14, steer: 0.48, mass: 800, nitro: 1.2,
    body: { L: 5.2, W: 1.95, wheelR: 0.36, wb: 3.4, style: 'formula' },
    colors: [0xd50000, 0x00d2be, 0xff8700, 0x0600ef, 0xf5f5f5, 0x111111] },
];
G.POLICE_SPEC = { id: 'police', name: 'INTERCEPTOR', maxSpeed: 88, accel: 17, brake: 40, grip: 9.5, steer: 0.55, mass: 1800, nitro: 1.0,
  body: { L: 5.0, W: 1.94, clr: 0.22, nose: 0.74, beltF: 0.98, beltR: 1.02, tail: 1.04, roof: 1.46, ws: 0.6, rf: -0.05, rr: -1.25, rw: -1.8, wheelR: 0.35, wb: 2.9, style: 'police' } };
G.carById = (id) => G.CARS.find((c) => c.id === id) || G.CARS[0];

// Performance after upgrades (each level: +4% top speed, +8% accel / +7% grip / +25% nitro)
G.carPerf = function (spec, up) {
  up = up || { engine: 0, handling: 0, nitro: 0 };
  return Object.assign({}, spec, {
    maxSpeed: spec.maxSpeed * (1 + up.engine * 0.04),
    accel: spec.accel * (1 + up.engine * 0.08),
    grip: spec.grip * (1 + up.handling * 0.07),
    brake: spec.brake * (1 + up.handling * 0.06),
    nitroCap: 1 + up.nitro * 0.25,
    nitroPower: spec.nitro * (1 + up.nitro * 0.06),
  });
};
G.UPGRADE_COST = (spec, level) => Math.round((spec.price * 0.08 + 2500) * (level + 1) / 500) * 500;

G.CarModels = (function () {
  const M = {};
  let shared = null;
  function mats() {
    if (shared) return shared;
    const carbonTex = G.TEX.carbon();
    shared = {
      glass: new THREE.MeshPhysicalMaterial({ color: G.col(0x0b1118), metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.0 }),
      black: new THREE.MeshStandardMaterial({ color: G.col(0x111214), roughness: 0.55, metalness: 0.3 }),
      carbon: new THREE.MeshStandardMaterial({ map: carbonTex, color: G.col(0x9a9a9a), roughness: 0.3, metalness: 0.5 }),
      chrome: new THREE.MeshStandardMaterial({ color: G.col(0xe8e8e8), metalness: 1.0, roughness: 0.12 }),
      rimDark: new THREE.MeshStandardMaterial({ color: G.col(0x2a2c30), metalness: 0.9, roughness: 0.3 }),
      tire: new THREE.MeshStandardMaterial({ color: G.col(0x161616), roughness: 0.92, metalness: 0 }),
      caliper: new THREE.MeshStandardMaterial({ color: G.col(0xe01a1a), roughness: 0.35, metalness: 0.3 }),
      head: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.35, 2.15) }),
      plate: new THREE.MeshStandardMaterial({ color: G.col(0xf0f0f0), roughness: 0.5 }),
      interior: new THREE.MeshStandardMaterial({ color: G.col(0x1a1a1c), roughness: 0.8 }),
      blob: new THREE.MeshBasicMaterial({ map: G.TEX.blob(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 }),
      white: new THREE.MeshStandardMaterial({ color: G.col(0xf4f4f4), roughness: 0.3, metalness: 0.2 }),
    };
    return shared;
  }
  M.paint = function (hex) {
    return new THREE.MeshPhysicalMaterial({ color: G.col(hex), metalness: 0.55, roughness: 0.32, clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 1.3 });
  };

  // Side profile (z forward, y up) with wheel arches cut into the bottom edge
  function bodyShape(b) {
    // arch radius includes the extrude bevel, which grows the outline inwards into the arch
    const L = b.L, h = L / 2, r = b.wheelR, R = r + 0.17, clr = b.clr;
    const wf = b.wb / 2, wr = -b.wb / 2 + (b.style === 'hyper' ? 0.05 : 0);
    const s = new THREE.Shape();
    const arch = (zc) => {
      const dz = Math.sqrt(Math.max(0.01, R * R - (clr - r) * (clr - r)));
      s.lineTo(zc - dz, clr);
      s.absarc(zc, r, R, Math.atan2(clr - r, -dz), Math.atan2(clr - r, dz), true);
    };
    s.moveTo(-h + 0.18, clr);
    arch(wr);
    arch(wf);
    s.lineTo(h - 0.3, clr);
    s.quadraticCurveTo(h + 0.02, clr + 0.02, h, clr + 0.22);                // front bumper
    s.quadraticCurveTo(h - 0.02, b.nose, h - 0.25, b.nose + 0.02);          // nose top
    s.quadraticCurveTo(b.ws + (h - b.ws) * 0.4, b.beltF + 0.02, b.ws, b.beltF);  // hood
    s.lineTo(b.rw, b.beltR);                                                // beltline
    s.quadraticCurveTo(-h + 0.25, b.tail + 0.03, -h + 0.05, b.tail - 0.02); // rear deck
    s.quadraticCurveTo(-h - 0.04, (b.tail + clr) / 2, -h + 0.06, clr + 0.25); // rear bumper
    s.lineTo(-h + 0.18, clr);
    return s;
  }
  function cabinShape(b) {
    const s = new THREE.Shape();
    s.moveTo(b.ws + 0.05, b.beltF - 0.04);
    s.quadraticCurveTo(b.rf + (b.ws - b.rf) * 0.25, b.roof - 0.03, b.rf, b.roof);
    s.quadraticCurveTo((b.rf + b.rr) / 2, b.roof + 0.05, b.rr, b.roof - 0.02);
    if (b.style === 'hatch' || b.style === 'suv') s.quadraticCurveTo(b.rw + 0.05, b.roof - 0.1, b.rw - 0.05, b.beltR - 0.04);
    else s.quadraticCurveTo(b.rr - (b.rr - b.rw) * 0.3, b.roof - 0.12, b.rw, b.beltR - 0.04);
    s.lineTo(b.ws + 0.05, b.beltF - 0.04);
    return s;
  }
  function extrudeSide(shape, width, bevel, lod) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: lod ? 1 : 4, curveSegments: lod ? 4 : 14, steps: 1 });
    g.rotateY(-Math.PI / 2);            // shape x -> world z, extrusion -> world -x
    g.translate((width - bevel * 2) / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  }
  function box(w, h, d, mat, x, y, z, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
  }

  function makeWheel(r, w, rimMat, m, caliper) {
    const steer = new THREE.Group(), spin = new THREE.Group();
    steer.add(spin);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 26, 1), m.tire); tire.rotation.z = Math.PI / 2; spin.add(tire);
    const side = new THREE.Mesh(new THREE.TorusGeometry(r * 0.86, r * 0.14, 6, 24), m.tire); side.rotation.y = Math.PI / 2; side.position.x = w / 2 - 0.01; spin.add(side);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, w + 0.02, 20), rimMat); rim.rotation.z = Math.PI / 2; spin.add(rim);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.03, 20), m.black); dish.rotation.z = Math.PI / 2; dish.position.x = w / 2 + 0.005; spin.add(dish);
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, r * 1.2, 0.09), rimMat);
      sp.position.x = w / 2 + 0.02; sp.rotation.x = k / 5 * Math.PI; spin.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), m.chrome); hub.rotation.z = Math.PI / 2; hub.position.x = w / 2 + 0.04; spin.add(hub);
    if (caliper) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.28), m.caliper); c.position.set(w / 2 - 0.08, 0.12, -0.12); steer.add(c); }
    tire.castShadow = true;
    M.mergeByMaterial(spin);
    return { steer, spin };
  }

  // Build a full-detail car. Returns THREE.Group with .userData {wheels, paint, tail, brake, flames, head}
  M.build = function (spec, colorHex, opts) {
    opts = opts || {};
    const m = mats(), b = spec.body;
    const g = new THREE.Group();
    const paint = M.paint(colorHex);
    const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.04, 0.03) });
    const ud = { wheels: [], paint, tail, flames: [], body: b };
    g.userData = ud;
    const W = b.W;

    if (b.style === 'formula') return buildFormula(g, spec, paint, tail, m, opts);

    // body + cabin
    const bodyGeo = extrudeSide(bodyShape(b), W, 0.12);
    const body = new THREE.Mesh(bodyGeo, paint); body.castShadow = true; body.receiveShadow = true; g.add(body);
    const cabW = W * (b.style === 'suv' ? 0.9 : 0.8);
    const cab = new THREE.Mesh(extrudeSide(cabinShape(b), cabW, 0.14), m.glass); cab.castShadow = true; g.add(cab);
    // roof skin in body colour
    const roofLen = Math.max(0.3, (b.rf - b.rr) * 0.82);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(cabW * 0.86, 0.05, roofLen), paint);
    roof.position.set(0, b.roof + 0.015, (b.rf + b.rr) / 2); g.add(roof);
    // lower carbon trim, splitter, diffuser
    const h = b.L / 2;
    box(W * 0.94, 0.07, 0.5, m.carbon, 0, b.clr + 0.02, h - 0.28, g);
    box(W * 0.9, 0.16, 0.45, m.carbon, 0, b.clr + 0.07, -h + 0.25, g);
    [-1, 1].forEach((sd) => { box(0.06, 0.1, b.wb - b.wheelR * 2.2, m.carbon, sd * (W / 2 + 0.005), b.clr + 0.08, (b.wb / 2 - b.wb / 2) / 2, g); });
    // grille / intakes
    box(W * 0.5, 0.16, 0.05, m.black, 0, b.clr + 0.3, h + 0.0, g);
    [-1, 1].forEach((sd) => box(W * 0.18, 0.12, 0.05, m.black, sd * W * 0.33, b.clr + 0.22, h - 0.02, g));
    // headlights (slanted strips) + DRL
    [-1, 1].forEach((sd) => {
      const hl = box(W * 0.24, 0.07, 0.25, m.head, sd * W * 0.3, b.nose - 0.08, h - 0.22, g);
      hl.rotation.x = -0.25;
      const mir = box(0.2, 0.09, 0.12, paint, sd * (cabW / 2 + 0.12), b.beltF + 0.15, b.ws - 0.15, g); void mir;
    });
    ud.head = m.head;
    // tail lights: full-width bar for sporty cars, twin units otherwise
    const ty = b.tail - 0.1;
    if (b.style === 'hyper' || b.style === 'gt' || b.style === 'sedan') box(W * 0.86, 0.06, 0.05, tail, 0, ty, -h + 0.05, g);
    [-1, 1].forEach((sd) => box(W * 0.2, 0.1, 0.06, tail, sd * W * 0.36, ty - 0.03, -h + 0.06, g));
    // plate + exhausts
    box(0.52, 0.12, 0.02, m.plate, 0, b.clr + 0.4, -h + 0.02, g);
    const exN = b.style === 'muscle' ? [-0.55, 0.55] : (b.style === 'hyper' ? [-0.12, 0.12] : [-0.5, 0.5]);
    exN.forEach((x) => {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.25, 12), m.chrome);
      ex.rotation.x = Math.PI / 2; ex.position.set(x, b.clr + 0.15, -h - 0.02); g.add(ex);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.8, 6), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(x, b.clr + 0.15, -h - 0.5); fl.visible = false; fl.userData.keep = true; g.add(fl); ud.flames.push(fl);
    });
    // style extras
    if (b.style === 'muscle') { box(0.6, 0.1, 0.9, m.black, 0, b.beltF + 0.04, b.ws + 0.7, g); box(W * 0.9, 0.05, 0.25, paint, 0, b.tail + 0.04, -h + 0.18, g); }
    if (b.style === 'suv') {
      box(cabW * 0.9, 0.05, 1.8, m.black, 0, b.roof + 0.12, (b.rf + b.rr) / 2, g);
      [-1, 1].forEach((sd) => box(0.05, 0.12, 1.8, m.black, sd * cabW * 0.45, b.roof + 0.07, (b.rf + b.rr) / 2, g));
      box(W * 0.7, 0.18, 0.12, m.black, 0, b.clr + 0.2, h + 0.06, g); // bull bar
    }
    if (b.style === 'hatch') box(cabW * 0.85, 0.04, 0.25, paint, 0, b.roof - 0.02, b.rr - 0.1, g);
    if (b.style === 'sedan' || b.style === 'police') box(W * 0.6, 0.04, 0.12, paint, 0, b.tail + 0.03, -h + 0.12, g);
    if (b.wing === 'big' || b.wing === 'swan') {
      const wy = b.wing === 'swan' ? b.roof + 0.05 : b.tail + 0.32;
      const wing = box(W * 0.95, 0.05, 0.42, m.carbon, 0, wy, -h + 0.3, g); wing.rotation.x = 0.08;
      [-1, 1].forEach((sd) => { box(0.04, wy - b.tail + 0.05, 0.22, m.carbon, sd * W * 0.28, (wy + b.tail) / 2, -h + 0.32, g); box(0.03, 0.18, 0.5, m.carbon, sd * W * 0.475, wy + 0.04, -h + 0.3, g); });
    }
    if (b.wing === 'duck') box(W * 0.8, 0.04, 0.3, m.carbon, 0, b.tail + 0.04, -h + 0.2, g);
    if (b.style === 'hyper') { [-1, 1].forEach((sd) => { const sc = box(0.08, 0.22, 0.9, m.black, sd * (W / 2 - 0.02), b.beltR - 0.2, -0.3, g); void sc; }); box(0.8, 0.04, 0.8, m.black, 0, b.beltR + 0.01, -h + 0.9, g); }
    if (b.style === 'police') {
      // livery: white doors + light bar
      [-1, 1].forEach((sd) => box(0.02, 0.36, 1.9, m.white, sd * (W / 2 + 0.01), b.clr + 0.48, 0.1, g));
      box(cabW * 0.7, 0.1, 0.32, m.black, 0, b.roof + 0.07, (b.rf + b.rr) / 2, g);
      const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.1, 0.1) }), blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.4, 4.5) });
      box(cabW * 0.3, 0.09, 0.26, red, -cabW * 0.18, b.roof + 0.15, (b.rf + b.rr) / 2, g);
      box(cabW * 0.3, 0.09, 0.26, blue, cabW * 0.18, b.roof + 0.15, (b.rf + b.rr) / 2, g);
      ud.siren = { red, blue };
    }
    // interior hint (seats visible through glass)
    [-1, 1].forEach((sd) => box(0.45, 0.5, 0.5, m.interior, sd * 0.38, b.beltF - 0.05, (b.ws + b.rr) / 2 - 0.2, g));

    // wheels
    const r = b.wheelR, tw = b.style === 'suv' ? 0.34 : 0.28;
    const wx = W / 2 - tw / 2 + 0.01;
    const rimMat = opts.darkRims ? m.rimDark : m.chrome;
    [[b.wb / 2, 1], [-b.wb / 2 + (b.style === 'hyper' ? 0.05 : 0), 0]].forEach(([z, front]) => {
      [-1, 1].forEach((sd) => {
        const wh = makeWheel(r, tw, rimMat, m, b.style !== 'suv');
        wh.steer.position.set(sd * wx, r, z);
        if (sd < 0) wh.steer.rotation.y = Math.PI; // mirror so the face points outwards
        wh.mirror = sd < 0;
        wh.front = !!front;
        g.add(wh.steer); ud.wheels.push(wh);
      });
    });
    // contact shadow
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, b.L * 1.2), m.blob);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; blob.userData.keep = true; g.add(blob); ud.blob = blob;
    ud.wheelR = r;
    M.mergeByMaterial(g);
    return g;
  };

  function buildFormula(g, spec, paint, tail, m, opts) {
    const b = spec.body, ud = g.userData;
    const L = b.L, h = L / 2;
    // monocoque + nose
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 2.2), paint); tub.position.set(0, 0.45, 0.1); tub.castShadow = true; g.add(tub);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.38, 1.9, 12), paint); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.36, 1.95); nose.scale.set(1.4, 1, 0.55); nose.castShadow = true; g.add(nose);
    // sidepods
    [-1, 1].forEach((sd) => { const sp = box(0.55, 0.42, 1.8, paint, sd * 0.65, 0.4, -0.2, g); sp.castShadow = true; box(0.5, 0.3, 0.05, m.black, sd * 0.65, 0.42, 0.71, g); });
    // engine cover + fin
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.42, 1.8, 10), paint); cover.rotation.x = -Math.PI / 2; cover.position.set(0, 0.7, -1.0); cover.scale.set(1, 1, 1.4); g.add(cover);
    box(0.04, 0.45, 1.4, paint, 0, 0.95, -1.3, g);
    // cockpit + halo + driver helmet
    box(0.55, 0.12, 0.9, m.black, 0, 0.72, 0.35, g);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: G.col(0xffd400), roughness: 0.3, metalness: 0.3 }));
    helmet.position.set(0, 0.88, 0.2); g.add(helmet);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 6, 20, Math.PI), m.black); halo.rotation.x = -Math.PI / 2 + 0.1; halo.position.set(0, 0.95, 0.35); g.add(halo);
    // wings
    const fw = box(1.9, 0.04, 0.5, m.carbon, 0, 0.12, h - 0.15, g); fw.castShadow = true;
    [-1, 1].forEach((sd) => box(0.04, 0.25, 0.6, paint, sd * 0.95, 0.2, h - 0.15, g));
    const rw = box(1.1, 0.05, 0.4, m.carbon, 0, 1.05, -h + 0.25, g); rw.castShadow = true;
    box(1.1, 0.04, 0.25, paint, 0, 1.15, -h + 0.2, g);
    [-1, 1].forEach((sd) => box(0.04, 0.6, 0.6, paint, sd * 0.56, 0.8, -h + 0.25, g));
    box(0.18, 0.08, 0.05, tail, 0, 0.35, -h + 0.05, g);
    ud.head = m.head;
    // exposed wheels
    const r = b.wheelR;
    [[1.65, 0.34, 1], [-1.6, 0.42, 0]].forEach(([z, tw, front]) => {
      [-1, 1].forEach((sd) => {
        const wh = makeWheel(front ? r : r + 0.03, tw, m.rimDark, m, false);
        wh.steer.position.set(sd * 0.82, front ? r : r + 0.03, z);
        if (sd < 0) wh.steer.rotation.y = Math.PI;
        wh.mirror = sd < 0; wh.front = !!front;
        g.add(wh.steer); ud.wheels.push(wh);
      });
    });
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.8, 6), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.55, -h - 0.4); fl.visible = false; fl.userData.keep = true; g.add(fl); ud.flames.push(fl);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.4, L * 1.1), m.blob);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; blob.userData.keep = true; g.add(blob); ud.blob = blob;
    ud.wheelR = r;
    void opts;
    M.mergeByMaterial(g);
    return g;
  }

  // ---------- Draw-call reduction: merge sibling meshes that share a material ----------
  function mergeGeometries(geos) {
    const out = new THREE.BufferGeometry();
    const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const name of ['position', 'normal', 'uv', 'color']) {
      if (!parts.every((g) => g.attributes[name])) continue;
      const size = parts[0].attributes[name].itemSize;
      const arr = new Float32Array(parts.reduce((s, g) => s + g.attributes[name].count * size, 0));
      let o = 0; for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    return out;
  }
  M.mergeGeometries = mergeGeometries;
  M.mergeByMaterial = function (root) {
    const groups = new Map();
    for (const c of root.children.slice()) {
      if (!c.isMesh || c.userData.keep) continue;
      const k = c.material.uuid;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => { m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
      const mesh = new THREE.Mesh(mergeGeometries(geos), list[0].material);
      mesh.castShadow = list.some((m) => m.castShadow); mesh.receiveShadow = list.some((m) => m.receiveShadow);
      list.forEach((m) => root.remove(m));
      root.add(mesh);
    }
  };

  // ---------- Low-detail traffic cars (shared geometry per type) ----------
  const trafficTypes = [];
  M.trafficTypes = function () {
    if (trafficTypes.length) return trafficTypes;
    const m = mats();
    const defs = [
      { L: 4.3, W: 1.8, clr: 0.22, nose: 0.75, beltF: 0.98, beltR: 1.0, tail: 1.0, roof: 1.45, ws: 0.55, rf: -0.05, rr: -1.2, rw: -1.7, wheelR: 0.32, wb: 2.6, style: 'sedan' },
      { L: 3.9, W: 1.75, clr: 0.24, nose: 0.78, beltF: 1.0, beltR: 1.02, tail: 1.04, roof: 1.5, ws: 0.62, rf: 0.0, rr: -1.45, rw: -1.85, wheelR: 0.31, wb: 2.45, style: 'hatch' },
      { L: 4.7, W: 1.95, clr: 0.42, nose: 1.05, beltF: 1.25, beltR: 1.28, tail: 1.3, roof: 1.85, ws: 0.75, rf: 0.2, rr: -2.0, rw: -2.2, wheelR: 0.4, wb: 2.8, style: 'suv' },
      { L: 6.2, W: 2.1, clr: 0.4, nose: 1.2, beltF: 1.5, beltR: 2.4, tail: 2.5, roof: 2.6, ws: 1.7, rf: 1.4, rr: -2.9, rw: -3.0, wheelR: 0.42, wb: 3.8, style: 'van' },
      { L: 4.8, W: 1.85, clr: 0.24, nose: 0.75, beltF: 0.98, beltR: 1.02, tail: 1.04, roof: 1.48, ws: 0.6, rf: -0.05, rr: -1.25, rw: -1.8, wheelR: 0.33, wb: 2.85, style: 'taxi' },
    ];
    for (const b of defs) {
      const bodyGeo = extrudeSide(bodyShape(b), b.W, 0.1, true);
      const cabW = b.W * (b.style === 'suv' || b.style === 'van' ? 0.92 : 0.8);
      const cabGeo = extrudeSide(cabinShape(b), cabW, 0.12, true);
      const wheelGeo = new THREE.CylinderGeometry(b.wheelR, b.wheelR, 0.24, 10); wheelGeo.rotateZ(Math.PI / 2);
      const lightGeo = new THREE.BoxGeometry(b.W * 0.8, 0.08, 0.05);
      trafficTypes.push({ b, bodyGeo, cabGeo, wheelGeo, lightGeo });
    }
    trafficTypes.mats = m;
    return trafficTypes;
  };
  // Instanced traffic: per type one body mesh (paint via instanceColor, glass/tyres via vertex colours),
  // one emissive lights mesh and one contact-shadow mesh — ~15 draw calls for all civilian traffic.
  M.TrafficInst = (function () {
    const I = { types: [] };
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    function colored(geo, r, g, b, mat4) {
      const out = (geo.index ? geo.toNonIndexed() : geo.clone());
      if (mat4) out.applyMatrix4(mat4);
      const n = out.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
      out.setAttribute('color', new THREE.BufferAttribute(c, 3));
      out.deleteAttribute('uv');
      return out;
    }
    I.init = function (scene, perType) {
      const T = M.trafficTypes();
      const m4 = new THREE.Matrix4();
      const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.32, envMapIntensity: 1.2 });
      const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      T.forEach((t) => {
        const b = t.b, parts = [colored(t.bodyGeo, 1, 1, 1), colored(t.cabGeo, 0.035, 0.045, 0.06)];
        for (const z of [b.wb / 2, -b.wb / 2]) for (const sd of [-1, 1]) parts.push(colored(t.wheelGeo, 0.03, 0.03, 0.03, m4.makeTranslation(sd * (b.W / 2 - 0.13), b.wheelR, z)));
        if (b.style === 'taxi') parts.push(colored(new THREE.BoxGeometry(0.5, 0.18, 0.2), 2.6, 2.2, 0.9, m4.makeTranslation(0, b.roof + 0.1, (b.rf + b.rr) / 2)));
        const body = new THREE.InstancedMesh(mergeGeometries(parts), bodyMat, perType);
        const lights = new THREE.InstancedMesh(mergeGeometries([
          colored(t.lightGeo, 2.4, 2.35, 2.15, m4.makeTranslation(0, b.nose - 0.1, b.L / 2 - 0.08)),
          colored(t.lightGeo, 1.5, 0.05, 0.03, m4.makeTranslation(0, b.tail - 0.12, -b.L / 2 + 0.06)),
        ]), lightMat, perType);
        const bg = new THREE.PlaneGeometry(b.W * 1.3, b.L * 1.15); bg.rotateX(-Math.PI / 2); bg.translate(0, 0.04, 0);
        const blob = new THREE.InstancedMesh(bg, mats().blob, perType);
        // instanceColor is sized from count, so create it before count is reduced to 0
        for (let i = 0; i < perType; i++) body.setColorAt(i, new THREE.Color(1, 1, 1));
        [body, lights, blob].forEach((im) => { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; for (let i = 0; i < perType; i++) im.setMatrixAt(i, zero); im.count = 0; scene.add(im); });
        body.castShadow = true; body.receiveShadow = true;
        I.types.push({ body, lights, blob, free: Array.from({ length: perType }, (_, i) => perType - 1 - i), b });
      });
    };
    I.alloc = function (type, hex) {
      const T = I.types[type], idx = T.free.pop();
      if (idx === undefined) return null;
      // only draw slots up to the highest one in use
      const used = idx + 1; if (used > T.body.count) T.body.count = T.lights.count = T.blob.count = used;
      T.body.setColorAt(idx, G.col(T.b.style === 'taxi' ? 0xf7c600 : hex)); T.body.instanceColor.needsUpdate = true;
      return { type, idx };
    };
    I.set = function (h, obj) {
      const T = I.types[h.type]; obj.updateMatrix();
      T.body.setMatrixAt(h.idx, obj.matrix); T.lights.setMatrixAt(h.idx, obj.matrix); T.blob.setMatrixAt(h.idx, obj.matrix);
    };
    I.free = function (h) {
      const T = I.types[h.type];
      [T.body, T.lights, T.blob].forEach((im) => { im.setMatrixAt(h.idx, zero); im.instanceMatrix.needsUpdate = true; });
      T.free.push(h.idx);
    };
    I.flush = function () { for (const T of I.types) { T.body.instanceMatrix.needsUpdate = true; T.lights.instanceMatrix.needsUpdate = true; T.blob.instanceMatrix.needsUpdate = true; } };
    return I;
  })();

  const tPaints = {};
  M.buildTraffic = function (typeIdx, colorHex) {
    const T = M.trafficTypes(), t = T[typeIdx], m = T.mats, b = t.b;
    const key = colorHex + '_' + (b.style === 'taxi' ? 't' : '');
    if (!tPaints[key]) tPaints[key] = new THREE.MeshStandardMaterial({ color: G.col(b.style === 'taxi' ? 0xf7c600 : colorHex), metalness: 0.5, roughness: 0.35, envMapIntensity: 1.1 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(t.bodyGeo, tPaints[key]); body.castShadow = true; g.add(body);
    g.add(new THREE.Mesh(t.cabGeo, m.glass));
    const wheels = [];
    for (const z of [b.wb / 2, -b.wb / 2]) for (const sd of [-1, 1]) {
      const w = new THREE.Mesh(t.wheelGeo, m.tire); w.position.set(sd * (b.W / 2 - 0.13), b.wheelR, z); g.add(w); wheels.push(w);
    }
    const hl = new THREE.Mesh(t.lightGeo, m.head); hl.position.set(0, b.nose - 0.1, b.L / 2 - 0.08); g.add(hl);
    const tl = new THREE.Mesh(t.lightGeo, M.trafficTail || (M.trafficTail = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.05, 0.03) })));
    tl.position.set(0, b.tail - 0.12, -b.L / 2 + 0.06); g.add(tl);
    if (b.style === 'taxi') { const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.2), m.head); s.position.set(0, b.roof + 0.1, (b.rf + b.rr) / 2); g.add(s); }
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(b.W * 1.3, b.L * 1.15), m.blob); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.04; g.add(blob);
    g.userData = { wheels, body: b, wheelR: b.wheelR };
    return g;
  };
  return M;
})();
