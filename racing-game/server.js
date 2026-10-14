const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));
// Open-world single-player game (open-world/ at the repo root) + shared three.js build
app.use('/open-world', express.static(path.join(__dirname, '..', 'open-world')));
app.get('/three.min.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'three.min.js')));

// ============= Room Management =============
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

io.on('connection', (socket) => {
  console.log(`🏎️  Player connected: ${socket.id}`);
  let currentRoom = null;
  let playerName = '';

  // ---------- Create Room ----------
  socket.on('create-room', (data) => {
    let roomCode;
    do { roomCode = generateRoomCode(); } while (rooms.has(roomCode));

    playerName = (data.name || 'Player').substring(0, 15);
    const room = {
      code: roomCode,
      host: socket.id,
      players: new Map(),
      state: 'lobby',
      maxPlayers: 6,
      finishOrder: [],
    };
    room.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      colorIndex: 0,
    });
    rooms.set(roomCode, room);
    currentRoom = roomCode;
    socket.join(roomCode);

    socket.emit('room-created', {
      roomCode,
      players: Array.from(room.players.values()),
      isHost: true,
    });
    console.log(`   Room ${roomCode} created by ${playerName}`);
  });

  // ---------- Join Room ----------
  socket.on('join-room', (data) => {
    const roomCode = (data.roomCode || '').toUpperCase().trim();
    playerName = (data.name || 'Player').substring(0, 15);
    const room = rooms.get(roomCode);

    if (!room) {
      return socket.emit('room-error', { message: 'Phòng không tồn tại!' });
    }
    if (room.state !== 'lobby') {
      return socket.emit('room-error', { message: 'Trận đấu đã bắt đầu!' });
    }
    if (room.players.size >= room.maxPlayers) {
      return socket.emit('room-error', { message: 'Phòng đã đầy (tối đa 6 người)!' });
    }

    const colorIndex = room.players.size;
    room.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      colorIndex,
    });
    currentRoom = roomCode;
    socket.join(roomCode);

    socket.emit('room-joined', {
      roomCode,
      players: Array.from(room.players.values()),
      isHost: false,
    });

    socket.to(roomCode).emit('player-joined', {
      player: room.players.get(socket.id),
      players: Array.from(room.players.values()),
    });
    console.log(`   ${playerName} joined room ${roomCode}`);
  });

  // ---------- Start Game ----------
  socket.on('start-game', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id || room.state !== 'lobby') return; // no double start

    room.state = 'countdown';
    room.finishOrder = [];

    // Assign grid positions
    const startData = [];
    let idx = 0;
    room.players.forEach((player) => {
      startData.push({ ...player, gridPosition: idx });
      idx++;
    });

    io.to(currentRoom).emit('game-starting', { players: startData });

    // Countdown 3-2-1-GO
    let count = 3;
    const roomCode = currentRoom;
    const interval = setInterval(() => {
      // Room emptied during countdown: stop instead of ticking forever
      if (!rooms.has(roomCode)) return clearInterval(interval);
      io.to(roomCode).emit('countdown', { count });
      count--;
      if (count < 0) {
        clearInterval(interval);
        room.state = 'racing';
        room.raceStartTime = Date.now();
        io.to(roomCode).emit('race-start');
      }
    }, 1000);
  });

  // ---------- Position Update ----------
  socket.on('update-position', (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('position-update', {
      id: socket.id,
      x: data.x,
      y: data.y,
      z: data.z,
      ry: data.ry,
      speed: data.speed,
      lap: data.lap,
    });
  });

  // ---------- Player Finished Race ----------
  socket.on('player-finished', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const alreadyFinished = room.finishOrder.find(f => f.id === socket.id);
    if (alreadyFinished) return;

    const result = {
      id: socket.id,
      name: playerName,
      time: data.time,
      position: room.finishOrder.length + 1,
    };
    room.finishOrder.push(result);

    io.to(currentRoom).emit('player-finish', result);

    // If all players finished
    if (room.finishOrder.length >= room.players.size) {
      room.state = 'finished';
      io.to(currentRoom).emit('race-complete', { results: room.finishOrder });
    }
  });

  // ---------- Back to Lobby ----------
  socket.on('back-to-lobby', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.host !== socket.id) return;

    room.state = 'lobby';
    room.finishOrder = [];
    io.to(currentRoom).emit('return-to-lobby', {
      players: Array.from(room.players.values()),
    });
  });

  // ---------- Chat ----------
  socket.on('chat-message', (data) => {
    if (!currentRoom) return;
    io.to(currentRoom).emit('chat-message', {
      name: playerName,
      message: (data.message || '').substring(0, 200),
    });
  });

  // ---------- Disconnect ----------
  socket.on('disconnect', () => {
    console.log(`   Player disconnected: ${socket.id}`);
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    room.players.delete(socket.id);

    if (room.players.size === 0) {
      rooms.delete(currentRoom);
      console.log(`   Room ${currentRoom} deleted (empty)`);
    } else {
      if (room.host === socket.id) {
        room.host = room.players.keys().next().value;
      }
      io.to(currentRoom).emit('player-left', {
        id: socket.id,
        players: Array.from(room.players.values()),
        newHost: room.host,
      });
      // A racer quit mid-race: finish the race if everyone remaining is done
      if (room.state === 'racing' && room.finishOrder.length >= room.players.size) {
        room.state = 'finished';
        io.to(currentRoom).emit('race-complete', { results: room.finishOrder });
      }
    }
  });
});

// ============= Open City online (namespace /city): cops vs. civilians =============
// Clients send their pose ~15x/s; the server decides who is wanted (speeding in the city,
// ramming a cop) and who gets busted, so a client can't award itself anything.
const city = io.of('/city');
const cityRooms = new Map();
const CITY = { RING: 830, LIMIT: 120 / 3.6, BUST_R: 10, BUST_V: 3.5, BUST_T: 2.5, SEE_R: 260, MAX: 12 };
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

function cityRoom(code) {
  let r = cityRooms.get(code);
  if (!r) { r = { code, players: new Map() }; cityRooms.set(code, r); }
  return r;
}
function cityList(r) {
  return Array.from(r.players.values()).map((p) => ({ id: p.id, name: p.name, role: p.role, car: p.car, color: p.color, wanted: Math.ceil(p.wanted), score: p.score }));
}

city.on('connection', (socket) => {
  let room = null;
  const me = () => room && room.players.get(socket.id);

  socket.on('join', (d) => {
    d = d || {};
    const code = clean(d.room, 12).toUpperCase() || 'CITY';
    const r = cityRoom(code);
    if (r.players.size >= CITY.MAX) { socket.emit('join-error', 'Phòng đã đầy (' + CITY.MAX + ' người)'); return; }
    if (room) { room.players.delete(socket.id); socket.leave(room.code); }
    room = r; socket.join(code);
    const p = { id: socket.id, name: clean(d.name, 16) || 'Tay đua', role: d.role === 'cop' ? 'cop' : 'civ', car: clean(d.car, 16) || 'kitsune', color: Number(d.color) || 0xffffff,
      x: 0, z: 0, y: 0, h: 0, spd: 0, foot: false, nos: false, wanted: 0, calm: 0, bustT: 0, lastHit: 0, score: 0, t: Date.now() };
    r.players.set(socket.id, p);
    socket.emit('joined', { id: socket.id, room: code, players: cityList(r) });
    socket.to(code).emit('player-joined', cityList(r).find((x) => x.id === socket.id));
    console.log(`   🌆 ${p.name} vào phòng city ${code} (${p.role})`);
  });

  socket.on('state', (s) => {
    const p = me(); if (!p || !s) return;
    for (const k of ['x', 'z', 'y', 'h', 'spd']) if (Number.isFinite(s[k])) p[k] = s[k];
    p.foot = !!s.foot; p.nos = !!s.nos; p.brk = !!s.brk; p.t = Date.now();
  });

  socket.on('role', (d) => {
    const p = me(); if (!p || !d) return;
    p.role = d.role === 'cop' ? 'cop' : 'civ'; p.wanted = 0; p.bustT = 0;
    if (d.car) p.car = clean(d.car, 16);
    if (d.color !== undefined) p.color = Number(d.color) || 0xffffff;
    city.to(room.code).emit('roster', cityList(room));
  });

  // a civilian rammed a cop (reported by the cop's client, checked against positions)
  socket.on('rammed', (id) => {
    const cop = me(), civ = room && room.players.get(id);
    if (!cop || !civ || cop.role !== 'cop' || civ.role !== 'civ') return;
    if (Math.hypot(cop.x - civ.x, cop.z - civ.z) > 12 || Date.now() - civ.lastHit < 3000) return;
    civ.lastHit = Date.now(); civ.wanted = Math.min(5, civ.wanted + 1); civ.calm = 0;
  });

  socket.on('chat', (msg) => {
    const p = me(); if (!p) return;
    const text = clean(msg, 120); if (!text) return;
    city.to(room.code).emit('chat', { name: p.name, role: p.role, text });
  });

  const leave = () => {
    if (!room) return;
    room.players.delete(socket.id);
    city.to(room.code).emit('player-left', socket.id);
    if (!room.players.size) cityRooms.delete(room.code);
    room = null;
  };
  socket.on('leave', leave);
  socket.on('disconnect', leave);
});

// 10 Hz: wanted levels, busts, escapes; 15 Hz snapshots
setInterval(() => {
  const dt = 0.1;
  for (const r of cityRooms.values()) {
    const list = Array.from(r.players.values());
    const cops = list.filter((p) => p.role === 'cop' && !p.foot);
    for (const c of list) {
      if (c.role !== 'civ') continue;
      // speeding inside the ring road while a cop is around (or way too fast anywhere in the city)
      const inCity = Math.abs(c.x) < CITY.RING && Math.abs(c.z) < CITY.RING;
      const near = cops.reduce((m, k) => Math.min(m, Math.hypot(k.x - c.x, k.z - c.z)), Infinity);
      if (inCity && !c.foot && c.spd > CITY.LIMIT && (near < CITY.SEE_R || c.spd > CITY.LIMIT * 1.6)) {
        const before = Math.ceil(c.wanted);
        c.wanted = Math.min(5, c.wanted + dt * 0.35); c.calm = 0;
        if (Math.ceil(c.wanted) > before) city.to(r.code).emit('wanted', { id: c.id, level: Math.ceil(c.wanted), why: 'Chạy quá tốc độ ' + Math.round(c.spd * 3.6) + ' km/h' });
      }
      if (c.wanted <= 0) { c.bustT = 0; continue; }
      // bust: a cop close by while the suspect is (nearly) stopped
      const cop = cops.find((k) => Math.hypot(k.x - c.x, k.z - c.z) < CITY.BUST_R);
      if (cop && c.spd < CITY.BUST_V) c.bustT += dt; else c.bustT = Math.max(0, c.bustT - dt * 0.6);
      if (c.bustT >= CITY.BUST_T) {
        const lvl = Math.ceil(c.wanted), reward = 1500 * lvl, fine = 1000 * lvl;
        cop.score += lvl; c.wanted = 0; c.bustT = 0; c.calm = 0;
        city.to(r.code).emit('busted', { cop: cop.id, civ: c.id, level: lvl, reward, fine, copName: cop.name, civName: c.name });
        city.to(r.code).emit('roster', cityList(r));
        continue;
      }
      // escape: no cop within sight for long enough drops one star at a time
      if (near > CITY.SEE_R) c.calm += dt; else c.calm = 0;
      if (c.calm >= 12) {
        c.calm = 0; c.wanted = Math.max(0, Math.ceil(c.wanted) - 1);
        if (c.wanted === 0) { c.score += 1; city.to(r.code).emit('escaped', { civ: c.id, name: c.name, reward: 2000 }); city.to(r.code).emit('roster', cityList(r)); }
        else city.to(r.code).emit('wanted', { id: c.id, level: c.wanted, why: 'Đang cắt đuôi...' });
      }
    }
  }
}, 100);
setInterval(() => {
  const now = Date.now();
  for (const r of cityRooms.values()) {
    const snap = [];
    for (const p of r.players.values()) {
      if (now - p.t > 15000) continue; // tab in background / stalled
      snap.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.y.toFixed(2), +p.h.toFixed(3), +p.spd.toFixed(1), p.foot ? 1 : 0, p.nos ? 1 : 0, p.brk ? 1 : 0, Math.ceil(p.wanted), +(p.bustT / CITY.BUST_T).toFixed(2)]);
    }
    city.to(r.code).emit('snap', snap, now); // server time lets clients smooth out network jitter
  }
}, 66);

// ============= Start Server =============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🏎️  GAME ĐUA XE 3D MULTIPLAYER  🏎️    ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║   Server: http://localhost:${PORT}          ║`);
  console.log('║   Chia sẻ link cho bạn bè để cùng chơi! ║');
  console.log(`║   Open City online: /open-world/  (J)    ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
