// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Store canvas state per room in memory
const roomState = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join session/room
  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.data.username = username;
    socket.data.roomId = roomId;

    if (!roomState[roomId]) {
      roomState[roomId] = [];
    }

    // Send current canvas history to the newly joined user
    socket.emit('init-canvas', roomState[roomId]);

    // Notify room of new user
    socket.to(roomId).emit('user-joined', { userId: socket.id, username });
  });

  // Handle incoming line drawing action
  socket.on('draw-line', (line) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    if (!roomState[roomId]) {
      roomState[roomId] = [];
    }
    roomState[roomId].push(line);

    // Broadcast to everyone else in the room
    socket.to(roomId).emit('draw-line', line);
  });

  // Handle live cursor updates
  socket.on('cursor-move', (pos) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.to(roomId).emit('cursor-move', {
      userId: socket.id,
      username: socket.data.username || 'Anonymous',
      x: pos.x,
      y: pos.y,
    });
  });

  // Handle Clear Canvas
  socket.on('clear-canvas', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    roomState[roomId] = [];
    socket.to(roomId).emit('clear-canvas');
  });

  // ==========================================
  // ADDED: Handle Live Chat Messages
  // ==========================================
  socket.on('send-chat-message', (messageText) => {
    const roomId = socket.data.roomId;
    const username = socket.data.username || 'Anonymous';
    if (!roomId) return;

    const msgPayload = {
      id: `msg-${Date.now()}`,
      username,
      text: messageText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Broadcast message to everyone in the room (including sender)
    io.to(roomId).emit('receive-chat-message', msgPayload);
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(roomId).emit('user-disconnected', socket.id);
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Socket.io server running on http://localhost:${PORT}`);
});