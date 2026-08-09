/**
* SERVER - Cờ Tỉ Phú Nhà Làm Online Multiplayer
 * Express static server + Socket.io realtime rooms
 * Authoritative game state hosted on the server.
 */

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

// Shared game logic (works on both server & client)
const { createGame, applyAction } = require('gameServer.js');

const app = express();
app.use(express.static(path.join(__dirname, '.')));

const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// =========================================================
// ROOM MANAGEMENT
// =========================================================
const rooms = new Map(); // roomCode -> { players: Map(socketId->player), hostId, game }

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function roomClients(io, roomCode) {
  const room = getRoom(roomCode);
  if (!room) return [];
  return [...room.players.keys()];
}

function broadcastRoomState(roomCode) {
  const room = getRoom(roomCode);
  if (!room || !room.game) return;
  const state = room.game.exportState();
  io.to(roomCode).emit('game:state', {
    state,
    playersMeta: room.game.getPlayersMeta(),
    currentPlayerIndex: state.currentPlayerIndex
  });
}

// Auction timeouts are server-authoritative so every client sees the same
// five-second turn and no client can keep an auction open indefinitely.
setInterval(() => {
  for (const [roomCode, room] of rooms.entries()) {
    const auction = room.game && room.game.state.auctionState;
    if (!auction || !auction.active || Date.now() < auction.timerEnd) continue;
    const bidder = room.game.getCurrentAuctionBidder();
    const bidderIndex = bidder
      ? room.game.state.players.findIndex(player => player.id === bidder.id)
      : -1;
    if (bidderIndex >= 0) {
      room.game.action.passBid(bidderIndex);
      broadcastRoomState(roomCode);
    }
  }
}, 200);

// =========================================================
// SOCKET.IO HANDLERS
// =========================================================
io.on('connection', (socket) => {
  console.log(`🔗 User connected: ${socket.id}`);

  // ---- Create Room ----
  socket.on('room:create', (payload, cb) => {
    const name = (payload && payload.name) || `Player ${Math.floor(Math.random() * 9000) + 1000}`;
    const code = generateRoomCode();
    const player = { id: socket.id, name, isHost: true };

const room = {
      code,
      players: new Map([[socket.id, player]]),
      hostId: socket.id,
      game: null,
      started: false,
      settings: {
        doubleRentOnFullGroup: true,
        mortgageInsteadOfSell: true,
        jackpotOnFreeParking: true,
        receiveRentWhileJailed: false,
        auctionMode: false,
        initialMoney: 1500,
        passGoMoney: 200
      }
    };
    rooms.set(code, room);
    socket.join(code);

    if (typeof cb === 'function') cb({ ok: true, roomCode: code, player });

    // Notify the host of the room created
    io.to(socket.id).emit('room:joined', { roomCode: code, isHost: true });
    updateLobby(io, code);
  });

  // ---- Join Room ----
  socket.on('room:join', (payload, cb) => {
    const code = (payload && payload.code || '').trim().toUpperCase();
    const name = (payload && payload.name) || `Player ${Math.floor(Math.random() * 9000) + 1000}`;
    const room = getRoom(code);

    if (!room) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Không tìm thấy phòng. Kiểm tra mã phòng!' });
      return;
    }
    if (room.started) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Trận đấu đã bắt đầu, không thể tham gia!' });
      return;
    }
    if ([...room.players.values()].some(p => p.name === name)) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Tên này đã được dùng trong phòng!' });
      return;
    }

    const player = { id: socket.id, name, isHost: false };
    room.players.set(socket.id, player);
    socket.join(code);

    if (typeof cb === 'function') cb({ ok: true, roomCode: code, player });
    io.to(socket.id).emit('room:joined', { roomCode: code, isHost: false });
    updateLobby(io, code);
  });

// ---- Update Room Settings (any player can propose; broadcast to all) ----
  socket.on('room:updateSettings', (payload, cb) => {
    const code = (payload && payload.code || '').trim().toUpperCase();
    const room = getRoom(code);
    if (!room) { if (typeof cb === 'function') cb({ ok: false, error: 'Phòng không tồn tại!' }); return; }
    if (room.started) { if (typeof cb === 'function') cb({ ok: false, error: 'Trò chơi đã bắt đầu!' }); return; }

    const s = (payload && payload.settings) || {};
    ['doubleRentOnFullGroup','mortgageInsteadOfSell','jackpotOnFreeParking','receiveRentWhileJailed','auctionMode'].forEach(k => {
      if (typeof s[k] === 'boolean') room.settings[k] = s[k];
    });
    if (typeof s.initialMoney === 'number' && s.initialMoney > 0) room.settings.initialMoney = s.initialMoney;
    if (typeof s.passGoMoney === 'number' && s.passGoMoney >= 0) room.settings.passGoMoney = s.passGoMoney;

    if (typeof cb === 'function') cb({ ok: true, settings: room.settings });

    // Broadcast updated settings in real-time to ALL players in the waiting room
    io.to(code).emit('room:settings', { settings: room.settings });
  });

// ---- Host opens shared settings screen (broadcast to all) ----
  socket.on('room:openSettings', (payload, cb) => {
    const code = (payload && payload.code || '').trim().toUpperCase();
    const room = getRoom(code);
    if (!room) { if (typeof cb === 'function') cb({ ok: false, error: 'Phòng không tồn tại!' }); return; }
    if (room.hostId !== socket.id) { if (typeof cb === 'function') cb({ ok: false, error: 'Chỉ chủ phòng mới được mở cài đặt!' }); return; }
    if (room.started) { if (typeof cb === 'function') cb({ ok: false, error: 'Trò chơi đã bắt đầu!' }); return; }

    // Emit to ALL players so every player sees the combined settings screen
    io.to(code).emit('room:openSettings', { settings: room.settings });
    if (typeof cb === 'function') cb({ ok: true, settings: room.settings });
  });

  // ---- Select Character Token (per player) ----
  socket.on('room:selectToken', (payload, cb) => {
    const code = (payload && payload.code || '').trim().toUpperCase();
    const room = getRoom(code);
    if (!room) { if (typeof cb === 'function') cb({ ok: false, error: 'Phòng không tồn tại!' }); return; }
    if (room.started) { if (typeof cb === 'function') cb({ ok: false, error: 'Trò chơi đã bắt đầu!' }); return; }

    const player = room.players.get(socket.id);
    if (!player) { if (typeof cb === 'function') cb({ ok: false, error: 'Bạn không trong phòng!' }); return; }

    const token = (payload && payload.token) || null;
    if (!token || !token.emoji) { if (typeof cb === 'function') cb({ ok: false, error: 'Nhân vật không hợp lệ!' }); return; }

    // Ensure emoji is not already taken by another player in the room
    const taken = [...room.players.values()].some(p => p.id !== socket.id && p.token && p.token.emoji === token.emoji);
    if (taken) { if (typeof cb === 'function') cb({ ok: false, error: 'Nhân vật này đã được chọn!' }); return; }

    player.token = { name: token.name, emoji: token.emoji };
    if (typeof cb === 'function') cb({ ok: true, token: player.token });

    updateLobby(io, code);
  });

  // ---- Leave / Disconnect ----
  function handleLeave(socket) {
    for (const [code, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        socket.leave(code);

        // If room is empty -> delete it
        if (room.players.size === 0) {
          rooms.delete(code);
          return;
        }

        // If host left -> promote another player to host
        if (room.hostId === socket.id) {
          const nextHost = [...room.players.keys()][0];
          room.hostId = nextHost;
          const hostPlayer = room.players.get(nextHost);
          if (hostPlayer) hostPlayer.isHost = true;
          io.to(nextHost).emit('room:host', { isHost: true });
        }

        updateLobby(io, code);
        return;
      }
    }
  }
  socket.on('disconnect', () => handleLeave(socket));
  socket.on('room:leave', () => handleLeave(socket));

  // ---- Start Game (host only) ----
  socket.on('game:start', (payload, cb) => {
    const code = (payload && payload.code || '').trim().toUpperCase();
    const room = getRoom(code);
    if (!room) { if (typeof cb === 'function') cb({ ok: false, error: 'Phòng không tồn tại!' }); return; }
    if (room.hostId !== socket.id) { if (typeof cb === 'function') cb({ ok: false, error: 'Chỉ chủ phòng mới có thể bắt đầu!' }); return; }
    if (room.players.size < 2) { if (typeof cb === 'function') cb({ ok: false, error: 'Cần ít nhất 2 người chơi!' }); return; }

const playerList = [...room.players.values()];
    const playerNames = playerList.map(p => p.name);
    const playerColors = [...playerList].map((_, i) => room.game ? room.game.playerColors[i] : undefined);

    // Apply settings from host / any player (already stored on room.settings)
    const settings = (payload && payload.settings) || room.settings || {};
    room.settings = settings;
    const game = createGame({ playerCount: playerNames.length, playerNames, settings });

    // Apply each player's chosen token (quân cờ) to their in-game character
    playerList.forEach((p, i) => {
      if (p.token && game.state.players[i]) {
        game.state.players[i].tokenName = p.token.name;
        game.state.players[i].tokenEmoji = p.token.emoji;
      }
    });
    room.game = game;
    room.started = true;

// Map socket ids to player indices
    room.socketToPlayer = {};
    [...room.players.values()].forEach((p, i) => {
      room.socketToPlayer[p.id] = i;
    });

    // Gửi cho mỗi client biết index của họ trong trận
    [...room.players.values()].forEach((p) => {
      io.to(p.id).emit('room:started', { index: room.socketToPlayer[p.id] });
    });

    if (typeof cb === 'function') cb({ ok: true });
    broadcastRoomState(code);
  });

  // ---- Game Action from a player ----
  socket.on('game:action', (payload, cb) => {
    const code = (payload && payload.code || '').trim().toUpperCase();
    const room = getRoom(code);
    if (!room || !room.game) { if (typeof cb === 'function') cb({ ok: false, error: 'Trò chơi chưa bắt đầu!' }); return; }

    const playerIdx = room.socketToPlayer ? room.socketToPlayer[socket.id] : undefined;
    if (playerIdx === undefined) { if (typeof cb === 'function') cb({ ok: false, error: 'Bạn không trong trận!' }); return; }

    const action = payload && payload.action;
    const result = applyAction(room.game, playerIdx, action);

    broadcastRoomState(code);

    if (typeof cb === 'function') cb({ ok: !!result, result });
    else io.to(socket.id).emit('game:action:result', { ok: !!result, result });
  });

  // ---- Chat ----
  socket.on('chat:message', (payload) => {
    const code = (payload && payload.code || '').trim().toUpperCase();
    const room = getRoom(code);
    if (!room || !room.players.has(socket.id)) return;
    const player = room.players.get(socket.id);
    const text = String((payload && payload.text) || '').trim().slice(0, 500);
    if (!text) return;
    io.to(code).emit('chat:message', {
      from: player ? player.name : 'Ẩn danh',
      text,
      ts: Date.now()
    });
  });
});

// =========================================================
// LOBBY UPDATES
// =========================================================
function updateLobby(io, roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  const players = [...room.players.values()].map(p => ({ id: p.id, name: p.name, isHost: p.isHost, token: p.token || null }));
  io.to(roomCode).emit('lobby:update', {
    roomCode,
    players,
    hostId: room.hostId,
    started: room.started,
    settings: room.settings
  });
}

server.listen(PORT, () => {
console.log(`🚀 Cờ Tỉ Phú Nhà Làm server running on port ${PORT}`);
  console.log(`   Local: http://localhost:${PORT}`);
});
