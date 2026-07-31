const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

const allowedOrigins = [
  "http://localhost:3000", 
  "https://your-wboard-app.vercel.app" 
];

app.use(cors({ origin: allowedOrigins }));

// Health check for Render cold-starts
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'awake', timestamp: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] }
});

const roomDestructTimers = new Map();
const ROOM_TIMEOUT_MS = 5 * 60 * 1000; 
const roomStateCache = new Map();
const sessionCache = new Map(); 

// Tracks ownership, capacity, VIPs, and waiting list
const roomMetadata = new Map();
const MAX_CAPACITY = 6;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Helper: Handles joining room and syncing state
  // const joinUserToRoom = (targetSocket, roomId, userName, targetUuid) => {
  //   targetSocket.join(roomId);
  //   console.log(`[AUTHORIZED] ${userName} joined room: ${roomId}`);

  //   // Abort room self-destruct if active
  //   if (roomDestructTimers.has(roomId)) {
  //     clearTimeout(roomDestructTimers.get(roomId));
  //     roomDestructTimers.delete(roomId);
  //     console.log(`Room ${roomId} self-destruct aborted.`);
  //   }

  //   // Catch-up protocol
  //   const clients = io.sockets.adapter.rooms.get(roomId);
  //   if (clients && clients.size > 1) {
  //     const existingClient = Array.from(clients).find(id => id !== targetSocket.id);
  //     io.to(existingClient).emit('request-sync', { targetSocketId: targetSocket.id });
  //   } else if (roomStateCache.has(roomId)) {
  //     targetSocket.emit('room-state', roomStateCache.get(roomId));
  //   }
  // };
  const joinUserToRoom = (targetSocket, roomId, userName, targetUuid) => {
    targetSocket.join(roomId);
    console.log(`[AUTHORIZED] ${userName} joined room: ${roomId}`);

    if (roomDestructTimers.has(roomId)) {
      clearTimeout(roomDestructTimers.get(roomId));
      roomDestructTimers.delete(roomId);
      console.log(`Room ${roomId} self-destruct aborted.`);
    }
  };

  socket.on('request-join', ({ roomId, userName, uuid }) => {
    if (uuid) sessionCache.set(uuid, { userName, roomId, socketId: socket.id });

    // Scenario A: Room doesn't exist at all, user becomes Host
    if (!roomMetadata.has(roomId)) {
      roomMetadata.set(roomId, {
        hostUuid: uuid,
        hostSocketId: socket.id,
        allowedUsers: new Set([uuid]), // VIP list for reconnections
        activeUsers: new Set([uuid]),  // Currently online
        pendingUsers: new Map() 
      });
      
      joinUserToRoom(socket, roomId, userName, uuid);
      socket.emit('join-status', { status: 'admitted', isHost: true });
      return;
    }

    const roomData = roomMetadata.get(roomId);

    // Scenario A2: The Abandoned Room Claim
    // The room exists in memory, but everyone left. First one back takes the crown.
    if (roomData.activeUsers.size === 0) {
      console.log(`Abandoned room ${roomId} claimed by new Host: ${userName}`);
      roomData.hostUuid = uuid;
      roomData.hostSocketId = socket.id;
      roomData.allowedUsers.add(uuid); 
      roomData.activeUsers.add(uuid);  
      
      joinUserToRoom(socket, roomId, userName, uuid);
      socket.emit('join-status', { status: 'admitted', isHost: true });
      return;
    }

    // Scenario B: Returning VIP user (handles React Strict Mode & refreshes)
    if (roomData.allowedUsers.has(uuid)) {
      roomData.activeUsers.add(uuid);
      if (roomData.hostUuid === uuid) roomData.hostSocketId = socket.id;
      
      joinUserToRoom(socket, roomId, userName, uuid);
      socket.emit('join-status', { status: 'admitted', isHost: roomData.hostUuid === uuid });
      return;
    }

    // Scenario C: Capacity reached
    if (roomData.activeUsers.size >= MAX_CAPACITY) {
      socket.emit('join-status', { status: 'denied', reason: 'Room is full (Max 6)' });
      return;
    }

    // Scenario D: New user sent to waiting room
    roomData.pendingUsers.set(uuid, { userName, socketId: socket.id });
    socket.emit('join-status', { status: 'waiting' });
    io.to(roomData.hostSocketId).emit('knock-knock', { userName, uuid });
  });

  // Host resolves the knock (Admit or Deny)
  socket.on('resolve-knock', ({ roomId, targetUuid, decision }) => {
    const roomData = roomMetadata.get(roomId);
    if (!roomData || roomData.hostSocketId !== socket.id) return;

    const pendingUser = roomData.pendingUsers.get(targetUuid);
    if (!pendingUser) return;
    
    roomData.pendingUsers.delete(targetUuid);

    if (decision === 'admit') {
      if (roomData.activeUsers.size >= MAX_CAPACITY) return; 
      
      roomData.allowedUsers.add(targetUuid); // Add to permanent VIP list
      roomData.activeUsers.add(targetUuid);
      
      const targetSocket = io.sockets.sockets.get(pendingUser.socketId);
      if (targetSocket) {
        joinUserToRoom(targetSocket, roomId, pendingUser.userName, targetUuid);
        targetSocket.emit('join-status', { status: 'admitted', isHost: false });
      }
    } else {
      io.to(pendingUser.socketId).emit('join-status', { status: 'denied', reason: 'Host denied entry' });
    }
  });
  //New
  socket.on('client-ready', ({ roomId }) => {
    console.log(`Canvas mounted for ${socket.id}. Triggering sync...`);
    
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (clients && clients.size > 1) {
      const existingClient = Array.from(clients).find(id => id !== socket.id);
      io.to(existingClient).emit('request-sync', { targetSocketId: socket.id });
    } else if (roomStateCache.has(roomId)) {
      socket.emit('room-state', roomStateCache.get(roomId));
    }
  });

  // Canvas State Sync (this is the comment you searched for)
  //New
  // Canvas State Sync
// Canvas State Sync
  socket.on('update-cache', ({ roomId, pages, activePageId }) => {
    roomStateCache.set(roomId, { pages, activePageId });
  });
  
  socket.on('send-sync', ({ targetSocketId, pages, activePageId }) => {
    io.to(targetSocketId).emit('room-state', { pages, activePageId });
  });

  const broadcastToRoom = (event, data) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => socket.to(room).emit(event, data));
  };

  // Broadcasts
  socket.on('chat:message', (data) => broadcastToRoom('chat:message', data));
  socket.on('shape:add', (data) => broadcastToRoom('shape:add', data));
  socket.on('shape:update', (data) => broadcastToRoom('shape:update', data));
  socket.on('shape:delete', (data) => broadcastToRoom('shape:delete', data));
  socket.on('shape:delete_multiple', (data) => broadcastToRoom('shape:delete_multiple', data));
  socket.on('page:add', (page) => broadcastToRoom('page:add', page));
  socket.on('page:delete', (id) => broadcastToRoom('page:delete', id));
  socket.on('page:rename', (data) => broadcastToRoom('page:rename', data));
  socket.on('cursor:update', (data) => broadcastToRoom('cursor:update', { ...data, id: socket.id }));

  // Cleanup & Garbage Collection
  socket.on('disconnecting', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    
    let leavingUuid = null;
    for (const [uuid, session] of sessionCache.entries()) {
      if (session.socketId === socket.id) leavingUuid = uuid;
    }

    rooms.forEach(roomId => {
      socket.to(roomId).emit('cursor:remove', socket.id);
      
      const roomData = roomMetadata.get(roomId);
      if (roomData && leavingUuid) {
        roomData.activeUsers.delete(leavingUuid); // Remove from active, but keep in allowedUsers
        
        // Host Succession
        if (roomData.hostUuid === leavingUuid && roomData.activeUsers.size > 0) {
          const nextHostUuid = Array.from(roomData.activeUsers)[0];
          roomData.hostUuid = nextHostUuid;
          const nextHostSession = sessionCache.get(nextHostUuid);
          
          if (nextHostSession) {
            roomData.hostSocketId = nextHostSession.socketId;
            io.to(roomData.hostSocketId).emit('host-promoted');
            console.log(`Host left. ${nextHostSession.userName} promoted to Host.`);
          }
        }
      }
      
      const room = io.sockets.adapter.rooms.get(roomId);
      if (room && room.size === 1) {
        const timer = setTimeout(() => {
          console.log(`Deleting abandoned room: ${roomId}`);
          io.sockets.adapter.rooms.delete(roomId);
          roomDestructTimers.delete(roomId);
          roomStateCache.delete(roomId); 
          roomMetadata.delete(roomId); 
        }, ROOM_TIMEOUT_MS);
        
        roomDestructTimers.set(roomId, timer);
      }
    });
  });

  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`WBoard signaling server running on port ${PORT}`));