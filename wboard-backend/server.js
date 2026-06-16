const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Set up Socket.IO and explicitly allow your Next.js frontend to connect
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('🟢 User connected:', socket.id);

  // 1. Handle user joining a specific room
  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    console.log(`👤 ${userName} joined room: ${roomId}`);
  });

  // Helper function: Broadcasts data ONLY to other people in the same room
  const broadcastToRoom = (event, data) => {
    // socket.rooms contains the socket's own ID and the rooms it joined
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit(event, data);
    });
  };

  // 2. Listen for shapes being drawn and broadcast them
  socket.on('shape:add', (shape) => {
    broadcastToRoom('shape:add', shape);
  });

  // 3. Listen for shapes moving/resizing/typing text
  socket.on('shape:update', ({ id, updates }) => {
    broadcastToRoom('shape:update', { id, updates });
  });

  // 4. Listen for single eraser clicks
  socket.on('shape:delete', (id) => {
    broadcastToRoom('shape:delete', id);
  });

  // 5. Listen for the area-eraser (drag to delete)
  socket.on('shape:delete_multiple', (ids) => {
    broadcastToRoom('shape:delete_multiple', ids);
  });

  socket.on('disconnect', () => {
    console.log('🔴 User disconnected:', socket.id);
  });
});

// Run the server on port 4000
const PORT = 4000;
server.listen(PORT, () => {
  console.log(`🚀 WBoard signaling server running on http://localhost:${PORT}`);
});