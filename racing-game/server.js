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

// ============= Start Server =============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🏎️  GAME ĐUA XE 3D MULTIPLAYER  🏎️    ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║   Server: http://localhost:${PORT}          ║`);
  console.log('║   Chia sẻ link cho bạn bè để cùng chơi! ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
