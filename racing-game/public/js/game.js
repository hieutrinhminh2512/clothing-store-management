// ================================================================
//  SPEED RUSH - 3D Multiplayer Racing Game
//  Client-side game engine (Three.js + Socket.io)
// ================================================================

(() => {
'use strict';

// ============= CONSTANTS =============
const CONFIG = {
  TRACK_WIDTH: 22,
  MAX_SPEED: 1.8,
  ACCELERATION: 0.025,
  BRAKE_FORCE: 0.04,
  REVERSE_SPEED: 0.6,
  STEERING: 0.035,
  FRICTION: 0.985,
  OFF_TRACK_FRICTION: 0.94,
  TOTAL_LAPS: 3,
  SEND_RATE: 60,       // ms between network position updates
  CHECKPOINT_COUNT: 8,
};

const CAR_COLORS = [
  0xe74c3c, // Đỏ
  0x3498db, // Xanh dương
  0x2ecc71, // Xanh lá
  0xf39c12, // Vàng cam
  0x9b59b6, // Tím
  0x1abc9c, // Ngọc
];
const CAR_COLOR_CSS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c'];

// ============= STATE =============
const socket = io();

let state = {
  screen: 'menu',
  isHost: false,
  roomCode: '',
  myId: null,
  players: [],
  myColorIndex: 0,
  racing: false,
  lap: 0,
  checkpoint: 0,
  raceTime: 0,
  raceStartTimestamp: 0,
  finished: false,
  lastSendTime: 0,
  finishResults: [],
};

// Three.js
let scene, camera, renderer, clock;
let myCar = null;
let remoteCars = {};
let trackCurve = null;
let trackSegments = 400;
let trackPointsCache = [];
let checkpointTs = [];      // parameter t values for checkpoints
let startFinishT = 0;       // t of start/finish line
let lastT = 0;              // last track parameter for lap detection

// Physics
let physics = {
  x: 0, y: 0.5, z: 0,
  rotation: 0,
  speed: 0,
};

// Input
const keys = {};
let isMobile = false;

// Minimap
let minimapCtx = null;
let minimapTrackPoints = [];

// ============= INITIALIZATION =============
window.addEventListener('DOMContentLoaded', () => {
  setupUI();
  setupSocket();
  setupInput();
  detectMobile();
});

// ============= MOBILE DETECTION =============
function detectMobile() {
  isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

// ============= UI MANAGEMENT =============
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  state.screen = id.replace('Screen', '');
}

function showNotification(text, duration = 2500) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.textContent = text;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), duration);
}

function setupUI() {
  // Menu buttons
  document.getElementById('btnCreateRoom').addEventListener('click', () => {
    const name = document.getElementById('playerNameInput').value.trim() || 'Tay đua';
    socket.emit('create-room', { name });
  });

  document.getElementById('btnJoinRoom').addEventListener('click', () => {
    const name = document.getElementById('playerNameInput').value.trim() || 'Tay đua';
    const code = document.getElementById('roomCodeInput').value.trim();
    if (!code) return showNotification('Nhập mã phòng!');
    socket.emit('join-room', { name, roomCode: code });
  });

  // Enter key on room code input
  document.getElementById('roomCodeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnJoinRoom').click();
  });

  // Lobby
  document.getElementById('lobbyRoomCode').addEventListener('click', () => {
    navigator.clipboard.writeText(state.roomCode).then(() => {
      showNotification('Đã sao chép mã phòng!');
    }).catch(() => {});
  });

  document.getElementById('btnStartGame').addEventListener('click', () => {
    socket.emit('start-game');
  });

  document.getElementById('btnLeaveLobby').addEventListener('click', () => {
    location.reload();
  });

  // Results
  document.getElementById('btnBackToLobby').addEventListener('click', () => {
    socket.emit('back-to-lobby');
  });
  document.getElementById('btnBackToMenu').addEventListener('click', () => {
    location.reload();
  });

  // Mobile controls
  document.querySelectorAll('.mobile-btn').forEach(btn => {
    const key = btn.dataset.key;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    btn.addEventListener('touchcancel', (e) => { e.preventDefault(); keys[key] = false; });
  });
}

function updateLobbyUI() {
  document.getElementById('lobbyRoomCode').innerHTML =
    state.roomCode + '<span class="copy-hint">Nhấn để sao chép</span>';

  const list = document.getElementById('playerList');
  list.innerHTML = '';
  state.players.forEach(p => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'player-color-dot';
    dot.style.color = CAR_COLOR_CSS[p.colorIndex % CAR_COLOR_CSS.length];
    dot.style.backgroundColor = CAR_COLOR_CSS[p.colorIndex % CAR_COLOR_CSS.length];
    li.appendChild(dot);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    li.appendChild(nameSpan);
    if (state.players.length > 0 && p.id === state.players[0]?.id) {
      // Check if this is the host (first player or explicitly)
    }
    list.appendChild(li);
  });

  // Show start button only for host
  const startBtn = document.getElementById('btnStartGame');
  startBtn.style.display = state.isHost ? 'inline-block' : 'none';
}

function updateHUD() {
  if (!state.racing && !state.finished) return;

  // Speed (convert internal speed to km/h display)
  const displaySpeed = Math.abs(Math.round(physics.speed * 300));
  document.getElementById('hudSpeed').textContent = displaySpeed;

  // Lap
  document.getElementById('hudLap').textContent = Math.min(state.lap + 1, CONFIG.TOTAL_LAPS);
  document.getElementById('hudTotalLaps').textContent = CONFIG.TOTAL_LAPS;

  // Time
  if (state.racing && !state.finished) {
    state.raceTime = (Date.now() - state.raceStartTimestamp) / 1000;
  }
  document.getElementById('hudTime').textContent = formatTime(state.raceTime);

  // Position (based on lap + checkpoint progress)
  updateRacePosition();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2,'0')}:${s.toFixed(1).padStart(4,'0')}`;
}

function updateRacePosition() {
  // Calculate position among all players
  const myProgress = state.lap * CONFIG.CHECKPOINT_COUNT + state.checkpoint;
  let position = 1;

  Object.values(remoteCars).forEach(rc => {
    const otherProgress = (rc.lap || 0) * CONFIG.CHECKPOINT_COUNT + (rc.checkpoint || 0);
    if (otherProgress > myProgress) position++;
  });

  document.getElementById('hudPosition').textContent = position;
  const suffixes = ['st','nd','rd'];
  document.getElementById('hudPositionSuffix').textContent = suffixes[position-1] || 'th';
}

// ============= SOCKET.IO =============
function setupSocket() {
  socket.on('connect', () => {
    state.myId = socket.id;
  });

  socket.on('room-created', (data) => {
    state.roomCode = data.roomCode;
    state.players = data.players;
    state.isHost = true;
    state.myColorIndex = 0;
    showScreen('lobbyScreen');
    updateLobbyUI();
    showNotification('Phòng đã tạo! Chia sẻ mã cho bạn bè 🎮');
  });

  socket.on('room-joined', (data) => {
    state.roomCode = data.roomCode;
    state.players = data.players;
    state.isHost = false;
    const me = data.players.find(p => p.id === state.myId);
    if (me) state.myColorIndex = me.colorIndex;
    showScreen('lobbyScreen');
    updateLobbyUI();
  });

  socket.on('room-error', (data) => {
    showNotification(data.message);
  });

  socket.on('player-joined', (data) => {
    state.players = data.players;
    updateLobbyUI();
    showNotification(`${data.player.name} đã tham gia!`);
  });

  socket.on('player-left', (data) => {
    state.players = data.players;
    if (data.newHost === state.myId) {
      state.isHost = true;
      showNotification('Bạn là chủ phòng mới!');
    }
    updateLobbyUI();

    // Remove remote car if in game
    if (remoteCars[data.id]) {
      scene.remove(remoteCars[data.id].mesh);
      delete remoteCars[data.id];
    }
  });

  socket.on('game-starting', (data) => {
    // Initialize game
    initGame(data.players);
  });

  socket.on('countdown', (data) => {
    const overlay = document.getElementById('countdownOverlay');
    const text = document.getElementById('countdownText');
    overlay.classList.add('active');
    text.textContent = data.count > 0 ? data.count : 'GO!';
    text.style.color = data.count > 0 ? '#fff' : '#ffcc00';

    // Animate
    text.style.animation = 'none';
    text.offsetHeight; // trigger reflow
    text.style.animation = 'countdownPop 0.8s ease-out';
  });

  socket.on('race-start', () => {
    document.getElementById('countdownOverlay').classList.remove('active');
    state.racing = true;
    state.finished = false;
    state.raceStartTimestamp = Date.now();
    state.lap = 0;
    state.checkpoint = 0;
    state.raceTime = 0;
    state.finishResults = [];
    showNotification('🏁 XUẤT PHÁT!');
  });

  socket.on('position-update', (data) => {
    if (!remoteCars[data.id]) return;
    const rc = remoteCars[data.id];
    rc.targetX = data.x;
    rc.targetZ = data.z;
    rc.targetRY = data.ry;
    rc.speed = data.speed;
    rc.lap = data.lap || 0;
  });

  socket.on('player-finish', (data) => {
    state.finishResults.push(data);
    if (data.id === state.myId) {
      showNotification(`🏆 Bạn về thứ ${data.position}! Thời gian: ${formatTime(data.time)}`);
    } else {
      showNotification(`${data.name} đã về đích (thứ ${data.position})`);
    }
  });

  socket.on('race-complete', (data) => {
    state.racing = false;
    state.finished = true;
    showResults(data.results);
  });

  socket.on('return-to-lobby', (data) => {
    state.players = data.players;
    state.racing = false;
    state.finished = false;

    // Hide game elements
    document.getElementById('gameCanvas').style.display = 'none';
    document.getElementById('gameHUD').style.display = 'none';
    document.getElementById('mobileControls').style.display = 'none';

    showScreen('lobbyScreen');
    updateLobbyUI();
    showNotification('Đã về phòng chờ');

    // Cleanup Three.js
    cleanupGame();
  });
}

function showResults(results) {
  showScreen('resultsScreen');
  document.getElementById('gameHUD').style.display = 'none';

  const list = document.getElementById('resultsList');
  list.innerHTML = '';
  results.forEach((r, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="result-pos">${r.position}</span>
      <span class="result-name">${r.name}</span>
      <span class="result-time">${formatTime(r.time)}</span>
    `;
    list.appendChild(li);
  });

  // Show back-to-lobby button for host
  document.getElementById('btnBackToLobby').style.display = state.isHost ? 'inline-block' : 'none';
}

// ============= INPUT =============
function setupInput() {
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    keys[e.key] = true;
    // Prevent page scroll with arrow keys
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    keys[e.key] = false;
  });
  // Reset keys on window blur
  window.addEventListener('blur', () => {
    Object.keys(keys).forEach(k => keys[k] = false);
  });
}

// ============= GAME INITIALIZATION =============
function initGame(playerData) {
  showScreen('_none');
  document.getElementById('gameCanvas').style.display = 'block';
  document.getElementById('gameHUD').style.display = 'block';
  if (isMobile) {
    document.getElementById('mobileControls').style.display = 'flex';
  }

  initThreeJS();
  createTrack();
  createEnvironment();
  createCheckpoints();
  setupMinimap();

  // Create cars for all players
  playerData.forEach(p => {
    const carMesh = createCarModel(CAR_COLORS[p.colorIndex % CAR_COLORS.length]);
    scene.add(carMesh);

    if (p.id === state.myId) {
      myCar = carMesh;
      state.myColorIndex = p.colorIndex;
      // Set start position
      const startPos = getStartPosition(p.gridPosition);
      physics.x = startPos.x;
      physics.z = startPos.z;
      physics.rotation = startPos.rot;
      physics.speed = 0;
      physics.y = 0.5;
      myCar.position.set(physics.x, physics.y, physics.z);
      myCar.rotation.y = physics.rotation;
    } else {
      remoteCars[p.id] = {
        mesh: carMesh,
        targetX: 0, targetZ: 0, targetRY: 0,
        speed: 0, lap: 0, checkpoint: 0,
        name: p.name,
        colorIndex: p.colorIndex,
      };
      const startPos = getStartPosition(p.gridPosition);
      carMesh.position.set(startPos.x, 0.5, startPos.z);
      carMesh.rotation.y = startPos.rot;
      remoteCars[p.id].targetX = startPos.x;
      remoteCars[p.id].targetZ = startPos.z;
      remoteCars[p.id].targetRY = startPos.rot;
    }
  });

  // Start game loop
  clock = new THREE.Clock();
  animate();
}

function getStartPosition(gridIndex) {
  // Place cars at the start line, staggered
  const t = 0;
  const point = trackCurve.getPoint(t);
  const tangent = trackCurve.getTangent(t).normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

  const row = Math.floor(gridIndex / 2);
  const col = gridIndex % 2;
  const lateralOffset = (col === 0 ? -3 : 3);
  const forwardOffset = -row * 6 - 4;

  return {
    x: point.x + normal.x * lateralOffset + tangent.x * forwardOffset,
    z: point.z + normal.z * lateralOffset + tangent.z * forwardOffset,
    rot: Math.atan2(tangent.x, tangent.z),
  };
}

function cleanupGame() {
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
  myCar = null;
  remoteCars = {};
  trackCurve = null;
  trackPointsCache = [];
}

// ============= THREE.JS SETUP =============
function initThreeJS() {
  scene = new THREE.Scene();

  // Sky gradient background
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x9ec5e8, 0.0025);

  // Camera
  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 800);
  camera.position.set(0, 8, -15);

  // Renderer
  const canvas = document.getElementById('gameCanvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x4a7c2e, 0.4);
  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.0);
  sunLight.position.set(80, 120, 60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 400;
  sunLight.shadow.camera.left = -150;
  sunLight.shadow.camera.right = 150;
  sunLight.shadow.camera.top = 150;
  sunLight.shadow.camera.bottom = -150;
  sunLight.shadow.bias = -0.001;
  scene.add(sunLight);

  // Window resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ============= TRACK CREATION =============
function createTrack() {
  // Track control points - an interesting circuit
  const controlPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(50, 0, 10),
    new THREE.Vector3(90, 0, -10),
    new THREE.Vector3(120, 0, -60),
    new THREE.Vector3(110, 0, -120),
    new THREE.Vector3(70, 0, -155),
    new THREE.Vector3(20, 0, -170),
    new THREE.Vector3(-30, 0, -155),
    new THREE.Vector3(-70, 0, -130),
    new THREE.Vector3(-100, 0, -80),
    new THREE.Vector3(-90, 0, -30),
    new THREE.Vector3(-60, 0, 10),
    new THREE.Vector3(-30, 0, 20),
  ];

  trackCurve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.5);

  // Cache track points for collision detection
  for (let i = 0; i <= trackSegments; i++) {
    const t = i / trackSegments;
    const p = trackCurve.getPoint(t);
    trackPointsCache.push({ x: p.x, z: p.z, t });
  }

  const halfWidth = CONFIG.TRACK_WIDTH / 2;

  // --- Road surface ---
  const roadVerts = [];
  const roadUvs = [];
  const roadIdx = [];

  for (let i = 0; i <= trackSegments; i++) {
    const t = i / trackSegments;
    const point = trackCurve.getPoint(t);
    const tangent = trackCurve.getTangent(t).normalize();
    const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

    const lx = point.x + normal.x * halfWidth;
    const lz = point.z + normal.z * halfWidth;
    const rx = point.x - normal.x * halfWidth;
    const rz = point.z - normal.z * halfWidth;

    roadVerts.push(lx, 0.02, lz, rx, 0.02, rz);
    roadUvs.push(0, t * 30, 1, t * 30);

    if (i < trackSegments) {
      const idx = i * 2;
      roadIdx.push(idx, idx+1, idx+2, idx+1, idx+3, idx+2);
    }
  }

  const roadGeom = new THREE.BufferGeometry();
  roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
  roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeom.setIndex(roadIdx);
  roadGeom.computeVertexNormals();

  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x3a3a3a,
    roughness: 0.85,
    metalness: 0.05,
  });
  const road = new THREE.Mesh(roadGeom, roadMat);
  road.receiveShadow = true;
  scene.add(road);

  // --- Center dashed line ---
  const lineGeom = new THREE.BufferGeometry();
  const lineVerts = [];
  const lineW = 0.2;
  for (let i = 0; i < trackSegments; i++) {
    const t1 = i / trackSegments;
    const t2 = (i + 0.5) / trackSegments;
    if (i % 4 >= 2) continue; // dashes
    const p1 = trackCurve.getPoint(t1);
    const p2 = trackCurve.getPoint(t2);
    const tan1 = trackCurve.getTangent(t1).normalize();
    const n1 = new THREE.Vector3().crossVectors(tan1, new THREE.Vector3(0,1,0)).normalize();
    const tan2 = trackCurve.getTangent(t2).normalize();
    const n2 = new THREE.Vector3().crossVectors(tan2, new THREE.Vector3(0,1,0)).normalize();

    lineVerts.push(
      p1.x + n1.x*lineW, 0.04, p1.z + n1.z*lineW,
      p1.x - n1.x*lineW, 0.04, p1.z - n1.z*lineW,
      p2.x + n2.x*lineW, 0.04, p2.z + n2.z*lineW,
      p1.x - n1.x*lineW, 0.04, p1.z - n1.z*lineW,
      p2.x - n2.x*lineW, 0.04, p2.z - n2.z*lineW,
      p2.x + n2.x*lineW, 0.04, p2.z + n2.z*lineW,
    );
  }
  lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
  lineGeom.computeVertexNormals();
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  scene.add(new THREE.Mesh(lineGeom, lineMat));

  // --- Curbs (red-white stripes on edges) ---
  createCurbs(halfWidth + 0.5, 0xe74c3c);
  createCurbs(-(halfWidth + 0.5), 0xe74c3c);

  // --- Barriers ---
  createBarriers(halfWidth + 2);
  createBarriers(-(halfWidth + 2));

  // --- Start/Finish line ---
  createStartFinishLine();

  // --- Ground plane ---
  const groundGeom = new THREE.PlaneGeometry(800, 800);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3d7a1e, roughness: 1.0 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);
}

function createCurbs(offset, color) {
  const geom = new THREE.BufferGeometry();
  const verts = [];
  const curbW = 1.0;
  const step = 4;

  for (let i = 0; i < trackSegments; i += step) {
    const t1 = i / trackSegments;
    const t2 = Math.min((i + step) / trackSegments, 1);
    const p1 = trackCurve.getPoint(t1);
    const p2 = trackCurve.getPoint(t2);
    const tan1 = trackCurve.getTangent(t1).normalize();
    const n1 = new THREE.Vector3().crossVectors(tan1, new THREE.Vector3(0,1,0)).normalize();
    const tan2 = trackCurve.getTangent(t2).normalize();
    const n2 = new THREE.Vector3().crossVectors(tan2, new THREE.Vector3(0,1,0)).normalize();

    const sign = offset > 0 ? 1 : -1;
    const absOff = Math.abs(offset);

    const ax = p1.x + n1.x * sign * absOff;
    const az = p1.z + n1.z * sign * absOff;
    const bx = p1.x + n1.x * sign * (absOff + curbW);
    const bz = p1.z + n1.z * sign * (absOff + curbW);
    const cx = p2.x + n2.x * sign * absOff;
    const cz = p2.z + n2.z * sign * absOff;
    const dx = p2.x + n2.x * sign * (absOff + curbW);
    const dz = p2.z + n2.z * sign * (absOff + curbW);

    verts.push(
      ax, 0.03, az, bx, 0.03, bz, cx, 0.03, cz,
      bx, 0.03, bz, dx, 0.03, dz, cx, 0.03, cz,
    );
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geom.computeVertexNormals();

  // Alternating red/white
  const colors = [];
  const segCount = verts.length / 18; // 6 vertices * 3 components per segment
  for (let s = 0; s < segCount; s++) {
    const isRed = s % 2 === 0;
    const r = isRed ? 0.9 : 1.0;
    const g = isRed ? 0.15 : 1.0;
    const b = isRed ? 0.15 : 1.0;
    for (let v = 0; v < 6; v++) {
      colors.push(r, g, b);
    }
  }
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function createBarriers(offset) {
  const barrierH = 1.2;
  const barrierW = 0.4;
  const step = 8;

  for (let i = 0; i < trackSegments; i += step) {
    const t = i / trackSegments;
    const point = trackCurve.getPoint(t);
    const tangent = trackCurve.getTangent(t).normalize();
    const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0,1,0)).normalize();

    const sign = offset > 0 ? 1 : -1;
    const absOff = Math.abs(offset);

    const geom = new THREE.BoxGeometry(barrierW, barrierH, 3);
    const grayLevel = ((i / step) % 2 === 0) ? 0.7 : 0.9;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(grayLevel, grayLevel, grayLevel) });
    const barrier = new THREE.Mesh(geom, mat);

    barrier.position.set(
      point.x + normal.x * sign * absOff,
      barrierH / 2,
      point.z + normal.z * sign * absOff
    );
    barrier.rotation.y = Math.atan2(tangent.x, tangent.z);
    barrier.castShadow = true;
    barrier.receiveShadow = true;
    scene.add(barrier);
  }
}

function createStartFinishLine() {
  const t = 0;
  const point = trackCurve.getPoint(t);
  const tangent = trackCurve.getTangent(t).normalize();
  const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0,1,0)).normalize();
  const hw = CONFIG.TRACK_WIDTH / 2;

  // Checkered start line
  const lineGeom = new THREE.PlaneGeometry(CONFIG.TRACK_WIDTH, 3);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const sqSize = 16;
  for (let y = 0; y < canvas.height; y += sqSize) {
    for (let x = 0; x < canvas.width; x += sqSize) {
      ctx.fillStyle = ((x/sqSize + y/sqSize) % 2 === 0) ? '#fff' : '#000';
      ctx.fillRect(x, y, sqSize, sqSize);
    }
  }
  const lineTexture = new THREE.CanvasTexture(canvas);
  lineTexture.wrapS = THREE.RepeatWrapping;
  lineTexture.wrapT = THREE.RepeatWrapping;

  const lineMat = new THREE.MeshBasicMaterial({ map: lineTexture });
  const startLine = new THREE.Mesh(lineGeom, lineMat);
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(point.x, 0.04, point.z);
  startLine.rotation.z = -Math.atan2(tangent.x, tangent.z) + Math.PI/2;
  scene.add(startLine);

  // Arch over start line
  const archGeom = new THREE.BoxGeometry(CONFIG.TRACK_WIDTH + 4, 1, 1);
  const archMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.3 });
  const archTop = new THREE.Mesh(archGeom, archMat);
  archTop.position.set(point.x, 6, point.z);
  archTop.rotation.y = Math.atan2(tangent.x, tangent.z);
  archTop.castShadow = true;
  scene.add(archTop);

  // Arch pillars
  const pillarGeom = new THREE.BoxGeometry(1, 6, 1);
  [-1, 1].forEach(side => {
    const pillar = new THREE.Mesh(pillarGeom, archMat);
    pillar.position.set(
      point.x + normal.x * side * (hw + 2),
      3,
      point.z + normal.z * side * (hw + 2)
    );
    pillar.castShadow = true;
    scene.add(pillar);
  });
}

// ============= CHECKPOINTS =============
function createCheckpoints() {
  checkpointTs = [];
  for (let i = 0; i < CONFIG.CHECKPOINT_COUNT; i++) {
    checkpointTs.push(i / CONFIG.CHECKPOINT_COUNT);
  }
  startFinishT = 0;
  lastT = 0;
}

// ============= ENVIRONMENT =============
function createEnvironment() {
  // Trees
  const treePositions = [];
  for (let i = 0; i < 120; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 300;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist - 80;

    // Check if too close to track
    let tooClose = false;
    for (let j = 0; j < trackPointsCache.length; j += 4) {
      const tp = trackPointsCache[j];
      const dx = x - tp.x;
      const dz = z - tp.z;
      if (dx*dx + dz*dz < 900) { tooClose = true; break; }
    }
    if (tooClose) continue;

    treePositions.push({ x, z });
  }

  treePositions.forEach(pos => {
    const trunkH = 3 + Math.random() * 4;
    const leafR = 2 + Math.random() * 3;

    // Trunk
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.5, trunkH, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.set(pos.x, trunkH/2, pos.z);
    trunk.castShadow = true;
    scene.add(trunk);

    // Leaves (cone)
    const leafGeom = new THREE.ConeGeometry(leafR, leafR * 1.5, 7);
    const greenShade = 0x228B22 + Math.floor(Math.random() * 0x222200);
    const leafMat = new THREE.MeshStandardMaterial({ color: greenShade });
    const leaves = new THREE.Mesh(leafGeom, leafMat);
    leaves.position.set(pos.x, trunkH + leafR * 0.5, pos.z);
    leaves.castShadow = true;
    scene.add(leaves);
  });

  // Mountains in the distance
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dist = 280 + Math.random() * 100;
    const mountainGeom = new THREE.ConeGeometry(40 + Math.random() * 30, 50 + Math.random() * 40, 5);
    const mountainMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.3, 0.2, 0.3 + Math.random() * 0.15),
    });
    const mountain = new THREE.Mesh(mountainGeom, mountainMat);
    mountain.position.set(
      Math.cos(angle) * dist,
      20,
      Math.sin(angle) * dist - 80
    );
    scene.add(mountain);
  }

  // Grandstand near start
  const standGeom = new THREE.BoxGeometry(30, 8, 6);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x888899 });
  const stand = new THREE.Mesh(standGeom, standMat);
  stand.position.set(0, 4, 22);
  stand.castShadow = true;
  stand.receiveShadow = true;
  scene.add(stand);

  // Seats (colored rows)
  const seatColors = [0xe74c3c, 0xf39c12, 0x2ecc71];
  seatColors.forEach((color, i) => {
    const seatGeom = new THREE.BoxGeometry(28, 0.5, 1.5);
    const seatMat = new THREE.MeshStandardMaterial({ color });
    const seat = new THREE.Mesh(seatGeom, seatMat);
    seat.position.set(0, 2 + i * 2.5, 20 + i * 1.5);
    scene.add(seat);
  });

  // Sun (visual)
  const sunGeom = new THREE.SphereGeometry(8, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
  const sun = new THREE.Mesh(sunGeom, sunMat);
  sun.position.set(80, 120, 60);
  scene.add(sun);
}

// ============= CAR MODEL =============
function createCarModel(color) {
  const group = new THREE.Group();

  // Main body - lower part
  const bodyLowerGeom = new THREE.BoxGeometry(2.2, 0.4, 4.5);
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
  const bodyLower = new THREE.Mesh(bodyLowerGeom, bodyMat);
  bodyLower.position.y = 0.35;
  bodyLower.castShadow = true;
  group.add(bodyLower);

  // Main body - upper part
  const bodyUpperGeom = new THREE.BoxGeometry(2.0, 0.35, 4.2);
  const bodyUpper = new THREE.Mesh(bodyUpperGeom, bodyMat);
  bodyUpper.position.y = 0.65;
  bodyUpper.castShadow = true;
  group.add(bodyUpper);

  // Cabin
  const cabinGeom = new THREE.BoxGeometry(1.7, 0.5, 2.0);
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.5 });
  const cabin = new THREE.Mesh(cabinGeom, cabinMat);
  cabin.position.set(0, 1.0, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  // Windshield front
  const wfGeom = new THREE.BoxGeometry(1.6, 0.45, 0.08);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.6
  });
  const wf = new THREE.Mesh(wfGeom, glassMat);
  wf.position.set(0, 1.0, 0.8);
  wf.rotation.x = -0.3;
  group.add(wf);

  // Windshield rear
  const wrGeom = new THREE.BoxGeometry(1.6, 0.4, 0.08);
  const wr = new THREE.Mesh(wrGeom, glassMat);
  wr.position.set(0, 1.0, -1.2);
  wr.rotation.x = 0.3;
  group.add(wr);

  // Spoiler
  const spoilerGeom = new THREE.BoxGeometry(2.0, 0.08, 0.5);
  const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5 });
  const spoiler = new THREE.Mesh(spoilerGeom, spoilerMat);
  spoiler.position.set(0, 1.3, -2.0);
  group.add(spoiler);

  // Spoiler supports
  [-0.7, 0.7].forEach(x => {
    const supportGeom = new THREE.BoxGeometry(0.08, 0.3, 0.08);
    const support = new THREE.Mesh(supportGeom, spoilerMat);
    support.position.set(x, 1.15, -2.0);
    group.add(support);
  });

  // Wheels
  const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const rimGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 8);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });

  const wheelPos = [
    [-1.2, 0.35, 1.3],
    [1.2, 0.35, 1.3],
    [-1.2, 0.35, -1.3],
    [1.2, 0.35, -1.3],
  ];
  wheelPos.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeom, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    group.add(wheel);

    const rim = new THREE.Mesh(rimGeom, rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(...pos);
    group.add(rim);
  });

  // Headlights
  const hlGeom = new THREE.SphereGeometry(0.15, 8, 8);
  const hlMat = new THREE.MeshStandardMaterial({
    color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 0.8
  });
  [[-0.7, 0.45, 2.25], [0.7, 0.45, 2.25]].forEach(pos => {
    const hl = new THREE.Mesh(hlGeom, hlMat);
    hl.position.set(...pos);
    group.add(hl);
  });

  // Tail lights
  const tlMat = new THREE.MeshStandardMaterial({
    color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.6
  });
  [[-0.7, 0.45, -2.25], [0.7, 0.45, -2.25]].forEach(pos => {
    const tl = new THREE.Mesh(hlGeom, tlMat);
    tl.position.set(...pos);
    group.add(tl);
  });

  // Name label above car will be added via sprite later
  // But for simplicity, skip for now

  return group;
}

// ============= PHYSICS =============
function updatePhysics(delta) {
  if (!state.racing || state.finished) return;
  // Normalise to 60 FPS so the car is equally fast on 30/60/144 Hz screens (multiplayer fairness)
  const k = Math.min(delta * 60, 3);

  const fwd = keys['w'] || keys['arrowup'] || keys['ArrowUp'];
  const back = keys['s'] || keys['arrowdown'] || keys['ArrowDown'];
  const left = keys['a'] || keys['arrowleft'] || keys['ArrowLeft'];
  const right = keys['d'] || keys['arrowright'] || keys['ArrowRight'];

  // Acceleration
  if (fwd) {
    physics.speed += CONFIG.ACCELERATION * k;
  } else if (back) {
    if (physics.speed > 0.01) {
      physics.speed -= CONFIG.BRAKE_FORCE * k;
    } else {
      physics.speed -= CONFIG.ACCELERATION * 0.5 * k; // reverse
    }
  }

  // Check if on track
  const onTrack = isOnTrack(physics.x, physics.z);

  // Friction
  physics.speed *= Math.pow(onTrack ? CONFIG.FRICTION : CONFIG.OFF_TRACK_FRICTION, k);

  // Speed limits
  const maxSpd = onTrack ? CONFIG.MAX_SPEED : CONFIG.MAX_SPEED * 0.5;
  physics.speed = Math.max(-CONFIG.REVERSE_SPEED, Math.min(maxSpd, physics.speed));

  // Stop very slow speeds
  if (Math.abs(physics.speed) < 0.001 && !fwd && !back) {
    physics.speed = 0;
  }

  // Steering (speed-dependent)
  const steerAmount = CONFIG.STEERING * k * Math.min(1.0, Math.abs(physics.speed) / 0.3);
  const steerDir = physics.speed >= 0 ? 1 : -1;
  if (left) {
    physics.rotation += steerAmount * steerDir;
  }
  if (right) {
    physics.rotation -= steerAmount * steerDir;
  }

  // Move
  physics.x += Math.sin(physics.rotation) * physics.speed * k;
  physics.z += Math.cos(physics.rotation) * physics.speed * k;

  // Boundary constraint (keep on or near track)
  constrainToTrack();

  // Update car mesh
  if (myCar) {
    myCar.position.set(physics.x, physics.y, physics.z);
    myCar.rotation.y = physics.rotation;
  }

  // Check lap progress
  checkLapProgress();
}

function isOnTrack(x, z) {
  let minDist = Infinity;
  for (let i = 0; i < trackPointsCache.length; i++) {
    const tp = trackPointsCache[i];
    const dx = x - tp.x;
    const dz = z - tp.z;
    const d = dx*dx + dz*dz;
    if (d < minDist) minDist = d;
  }
  return minDist < (CONFIG.TRACK_WIDTH / 2) * (CONFIG.TRACK_WIDTH / 2);
}

function constrainToTrack() {
  // Find closest track point
  let minDist = Infinity;
  let closestIdx = 0;

  for (let i = 0; i < trackPointsCache.length; i++) {
    const tp = trackPointsCache[i];
    const dx = physics.x - tp.x;
    const dz = physics.z - tp.z;
    const d = dx*dx + dz*dz;
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }

  const maxDist = CONFIG.TRACK_WIDTH / 2 + 3; // allow slightly off track
  const dist = Math.sqrt(minDist);

  if (dist > maxDist) {
    const tp = trackPointsCache[closestIdx];
    const dx = physics.x - tp.x;
    const dz = physics.z - tp.z;
    const norm = Math.sqrt(dx*dx + dz*dz);
    if (norm > 0) {
      physics.x = tp.x + (dx / norm) * maxDist;
      physics.z = tp.z + (dz / norm) * maxDist;
      physics.speed *= 0.6; // penalty
    }
  }
}

function getClosestT(x, z) {
  let minDist = Infinity;
  let bestT = 0;
  for (let i = 0; i < trackPointsCache.length; i++) {
    const tp = trackPointsCache[i];
    const dx = x - tp.x;
    const dz = z - tp.z;
    const d = dx*dx + dz*dz;
    if (d < minDist) {
      minDist = d;
      bestT = tp.t;
    }
  }
  return bestT;
}

function checkLapProgress() {
  const currentT = getClosestT(physics.x, physics.z);

  // Check checkpoint progression
  if (state.checkpoint < CONFIG.CHECKPOINT_COUNT) {
    const nextCheckpointT = checkpointTs[state.checkpoint];
    const tolerance = 1.5 / trackSegments * CONFIG.CHECKPOINT_COUNT;

    // For the first checkpoint (after start), we need to handle wrapping
    if (state.checkpoint === 0) {
      // Need to have moved past start significantly
      if (currentT > 0.02 && currentT < 0.5 && lastT < currentT) {
        // Crossed first checkpoint zone
        if (Math.abs(currentT - nextCheckpointT) < 0.08) {
          state.checkpoint = 1;
        }
      }
    } else {
      if (Math.abs(currentT - nextCheckpointT) < 0.06) {
        state.checkpoint++;
      }
    }
  }

  // Check lap completion (crossing start/finish in the correct direction)
  if (state.checkpoint >= CONFIG.CHECKPOINT_COUNT - 1) {
    // Near start/finish and coming from high t to low t (wrapping around)
    if (lastT > 0.9 && currentT < 0.1) {
      state.lap++;
      state.checkpoint = 0;

      if (state.lap >= CONFIG.TOTAL_LAPS) {
        // Finished!
        state.finished = true;
        state.raceTime = (Date.now() - state.raceStartTimestamp) / 1000;
        socket.emit('player-finished', { time: state.raceTime, laps: state.lap });
        showNotification('🏁 HOÀN THÀNH!');
      } else {
        showNotification(`Vòng ${state.lap} / ${CONFIG.TOTAL_LAPS}`);
      }
    }
  }

  lastT = currentT;
}

// ============= CAMERA =============
function updateCamera() {
  if (!myCar) return;

  const idealOffset = new THREE.Vector3(0, 6, -12);
  const idealLookAt = new THREE.Vector3(0, 1, 6);

  // Rotate by car rotation
  const sinR = Math.sin(physics.rotation);
  const cosR = Math.cos(physics.rotation);

  const offsetX = idealOffset.x * cosR + idealOffset.z * sinR;
  const offsetZ = -idealOffset.x * sinR + idealOffset.z * cosR;

  const lookX = idealLookAt.x * cosR + idealLookAt.z * sinR;
  const lookZ = -idealLookAt.x * sinR + idealLookAt.z * cosR;

  const targetCamPos = new THREE.Vector3(
    physics.x + offsetX,
    physics.y + idealOffset.y,
    physics.z + offsetZ
  );

  const targetLookAt = new THREE.Vector3(
    physics.x + lookX,
    physics.y + idealLookAt.y,
    physics.z + lookZ
  );

  // Smooth follow
  const smoothness = 0.08;
  camera.position.lerp(targetCamPos, smoothness);

  // Smooth look direction
  const currentLookAt = new THREE.Vector3();
  camera.getWorldDirection(currentLookAt);
  camera.lookAt(
    camera.position.x + (targetLookAt.x - camera.position.x) * 0.15,
    camera.position.y + (targetLookAt.y - camera.position.y) * 0.15,
    camera.position.z + (targetLookAt.z - camera.position.z) * 0.15
  );
}

// ============= NETWORK SYNC =============
function sendPosition() {
  const now = Date.now();
  if (now - state.lastSendTime < CONFIG.SEND_RATE) return;
  state.lastSendTime = now;

  socket.emit('update-position', {
    x: physics.x,
    y: physics.y,
    z: physics.z,
    ry: physics.rotation,
    speed: physics.speed,
    lap: state.lap,
  });
}

function updateRemoteCars(delta) {
  const lerpSpeed = 0.15;
  Object.values(remoteCars).forEach(rc => {
    if (!rc.mesh) return;
    rc.mesh.position.x += (rc.targetX - rc.mesh.position.x) * lerpSpeed;
    rc.mesh.position.z += (rc.targetZ - rc.mesh.position.z) * lerpSpeed;

    // Smoothly interpolate rotation (handle wrapping)
    let angleDiff = rc.targetRY - rc.mesh.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    rc.mesh.rotation.y += angleDiff * lerpSpeed;
  });
}

// ============= MINIMAP =============
function setupMinimap() {
  const canvas = document.getElementById('minimapCanvas');
  minimapCtx = canvas.getContext('2d');

  // Pre-calculate minimap track points
  const points = [];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const p = trackCurve.getPoint(t);
    points.push({ x: p.x, z: p.z });
  }

  // Find bounds
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  points.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  });

  const padding = 15;
  const rangeX = maxX - minX + padding * 2;
  const rangeZ = maxZ - minZ + padding * 2;
  const scale = Math.min(170 / rangeX, 170 / rangeZ);
  const offsetX = -minX + padding;
  const offsetZ = -minZ + padding;

  minimapTrackPoints = points.map(p => ({
    x: (p.x + offsetX) * scale + 5,
    y: (p.z + offsetZ) * scale + 5,
  }));

  // Store transform for player dots
  minimapCtx._transform = { offsetX, offsetZ, scale };
}

function drawMinimap() {
  if (!minimapCtx) return;
  const ctx = minimapCtx;
  const { offsetX, offsetZ, scale } = ctx._transform;

  ctx.clearRect(0, 0, 180, 180);

  // Draw track line
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 4;
  minimapTrackPoints.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.stroke();

  // Draw my position
  const myMX = (physics.x + offsetX) * scale + 5;
  const myMY = (physics.z + offsetZ) * scale + 5;
  ctx.beginPath();
  ctx.fillStyle = CAR_COLOR_CSS[state.myColorIndex];
  ctx.arc(myMX, myMY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw remote players
  Object.values(remoteCars).forEach(rc => {
    if (!rc.mesh) return;
    const rmx = (rc.mesh.position.x + offsetX) * scale + 5;
    const rmy = (rc.mesh.position.z + offsetZ) * scale + 5;
    ctx.beginPath();
    ctx.fillStyle = CAR_COLOR_CSS[rc.colorIndex % CAR_COLOR_CSS.length];
    ctx.arc(rmx, rmy, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ============= GAME LOOP =============
function animate() {
  if (!renderer) return;
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  updatePhysics(delta);
  updateRemoteCars(delta);
  updateCamera();
  updateHUD();
  drawMinimap();
  sendPosition();

  renderer.render(scene, camera);
}

})();
