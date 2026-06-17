const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);

  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    console.log(`👤 ${userName} joined room: ${roomId}`);

    // --- PHASE 5.5: THE CATCH-UP PROTOCOL ---
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (clients && clients.size > 1) {
      const existingClient = Array.from(clients).find(id => id !== socket.id);
      
      console.log(`🔄 Triggering Catch-Up Protocol for ${userName}...`);
      // Ask the existing client to send their data
      io.to(existingClient).emit('request-sync', { targetSocketId: socket.id });
    }
  });

  // --- CRITICAL FIX: The Relay (This is likely what was missing!) ---
  socket.on('send-sync', ({ targetSocketId, pages }) => {
    console.log(`📦 Catch-Up Data received. Forwarding to late-joiner...`);
    io.to(targetSocketId).emit('room-state', pages);
  });

  //------------- Chat System ---------------
  socket.on('chat:message', (message) => broadcastToRoom('chat:message', message));

  const broadcastToRoom = (event, data) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit(event, data);
    });
  };

  // --- PHASE 6: CHAT SYSTEM ---
  socket.on('chat:message', (data) => {
    console.log(`💬 [CHAT] ${data.senderName}: ${data.text}`);
    broadcastToRoom('chat:message', data);
  });
  // Shapes
  socket.on('shape:add', (data) => broadcastToRoom('shape:add', data));
  socket.on('shape:update', (data) => broadcastToRoom('shape:update', data));
  socket.on('shape:delete', (data) => broadcastToRoom('shape:delete', data));
  socket.on('shape:delete_multiple', (data) => broadcastToRoom('shape:delete_multiple', data));

  // Pages
  socket.on('page:add', (page) => broadcastToRoom('page:add', page));
  socket.on('page:delete', (id) => broadcastToRoom('page:delete', id));
  socket.on('page:rename', (data) => broadcastToRoom('page:rename', data));

  // Cursors
  socket.on('cursor:update', (data) => {
    broadcastToRoom('cursor:update', { ...data, id: socket.id });
  });

  socket.on('disconnecting', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit('cursor:remove', socket.id);
    });
  });

  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`🚀 WBoard signaling server running on http://localhost:${PORT}`);
});