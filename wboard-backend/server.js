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

const roomMetadata = new Map();
const MAX_CAPACITY = 6;

// --- NEW: Broadcasts the updated participant list to everyone in the room ---
const broadcastRoster = (roomId) => {
  const roomData = roomMetadata.get(roomId);
  if (roomData) {
    io.to(roomId).emit('room:roster', Array.from(roomData.participants.values()));
  }
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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

    // Scenario A: Room doesn't exist
    if (!roomMetadata.has(roomId)) {
      roomMetadata.set(roomId, {
        hostUuid: uuid,
        hostSocketId: socket.id,
        allowedUsers: new Set([uuid]), 
        activeUsers: new Set([uuid]),  
        pendingUsers: new Map(),
        //  The official roster Map
        participants: new Map([
          [uuid, { uuid, socketId: socket.id, name: userName, isHost: true, isMuted: true, handRaised: false }]
        ])
      });
      
      joinUserToRoom(socket, roomId, userName, uuid);
      socket.emit('join-status', { status: 'admitted', isHost: true });
      return;
    }

    const roomData = roomMetadata.get(roomId);

    // Scenario A2: Abandoned Room Claim
    if (roomData.activeUsers.size === 0) {
      roomData.hostUuid = uuid;
      roomData.hostSocketId = socket.id;
      roomData.allowedUsers.add(uuid); 
      roomData.activeUsers.add(uuid);  
      roomData.participants.set(uuid, { uuid, socketId: socket.id, name: userName, isHost: true, isMuted: true, handRaised: false });
      
      joinUserToRoom(socket, roomId, userName, uuid);
      socket.emit('join-status', { status: 'admitted', isHost: true });
      return;
    }

    // Scenario B: Returning VIP user
    if (roomData.allowedUsers.has(uuid)) {
      roomData.activeUsers.add(uuid);
      const isHost = roomData.hostUuid === uuid;
      if (isHost) roomData.hostSocketId = socket.id;
      
      roomData.participants.set(uuid, { uuid, socketId: socket.id, name: userName, isHost, isMuted: true, handRaised: false });
      
      joinUserToRoom(socket, roomId, userName, uuid);
      socket.emit('join-status', { status: 'admitted', isHost });
      return;
    }

    // Scenario C: Capacity reached
    if (roomData.activeUsers.size >= MAX_CAPACITY) {
      socket.emit('join-status', { status: 'denied', reason: 'Room is full (Max 6)' });
      return;
    }

    // Scenario D: Waitlist
    roomData.pendingUsers.set(uuid, { userName, socketId: socket.id });
    socket.emit('join-status', { status: 'waiting' });
    io.to(roomData.hostSocketId).emit('knock-knock', { userName, uuid });
  });

  socket.on('resolve-knock', ({ roomId, targetUuid, decision }) => {
    const roomData = roomMetadata.get(roomId);
    if (!roomData || roomData.hostSocketId !== socket.id) return;

    const pendingUser = roomData.pendingUsers.get(targetUuid);
    if (!pendingUser) return;
    
    roomData.pendingUsers.delete(targetUuid);

    if (decision === 'admit') {
      if (roomData.activeUsers.size >= MAX_CAPACITY) return; 
      
      roomData.allowedUsers.add(targetUuid); 
      roomData.activeUsers.add(targetUuid);
      // Add to roster
      roomData.participants.set(targetUuid, { uuid: targetUuid, socketId: pendingUser.socketId, name: pendingUser.userName, isHost: false, isMuted: true, handRaised: false });
      
      const targetSocket = io.sockets.sockets.get(pendingUser.socketId);
      if (targetSocket) {
        joinUserToRoom(targetSocket, roomId, pendingUser.userName, targetUuid);
        targetSocket.emit('join-status', { status: 'admitted', isHost: false });
      }
    } else {
      io.to(pendingUser.socketId).emit('join-status', { status: 'denied', reason: 'Host denied entry' });
    }
  });

  socket.on('client-ready', ({ roomId }) => {
    console.log(`Canvas mounted for ${socket.id}. Triggering sync...`);
    
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (clients && clients.size > 1) {
      const existingClient = Array.from(clients).find(id => id !== socket.id);
      io.to(existingClient).emit('request-sync', { targetSocketId: socket.id });
    } else if (roomStateCache.has(roomId)) {
      socket.emit('room-state', roomStateCache.get(roomId));
    }
    
    // ---Send the official Roster to the room now that the user is loaded in ---
    broadcastRoster(roomId);
  });

  // ---Handling WebRTC UI Toggles ---
  socket.on('participant:update', ({ roomId, uuid, updates }) => {
    const roomData = roomMetadata.get(roomId);
    if (!roomData) return;
    
    const participant = roomData.participants.get(uuid);
    if (participant) {
      Object.assign(participant, updates); 
      broadcastRoster(roomId);
    }
  });

  // --- NEW: WebRTC Matchmaking Signaling ---
  
  // 1. User A sends an offer to connect to User B
  socket.on('webrtc:offer', ({ targetSocketId, callerSocketId, callerUuid, sdp }) => {
    io.to(targetSocketId).emit('webrtc:offer', { 
      callerSocketId, 
      callerUuid, 
      sdp 
    });
  });

  // 2. User B accepts the offer and sends an answer back to User A
  socket.on('webrtc:answer', ({ targetSocketId, responderSocketId, responderUuid, sdp }) => {
    io.to(targetSocketId).emit('webrtc:answer', { 
      responderSocketId, 
      responderUuid, 
      sdp 
    });
  });

  // 3. Both users exchange optimal routing paths (ICE Candidates)
  socket.on('webrtc:ice-candidate', ({ targetSocketId, senderSocketId, senderUuid, candidate }) => {
    io.to(targetSocketId).emit('webrtc:ice-candidate', { 
      senderSocketId, 
      senderUuid, 
      candidate 
    });
  });


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

  socket.on('chat:message', (data) => broadcastToRoom('chat:message', data));
  socket.on('shape:add', (data) => broadcastToRoom('shape:add', data));
  socket.on('shape:update', (data) => broadcastToRoom('shape:update', data));
  socket.on('shape:delete', (data) => broadcastToRoom('shape:delete', data));
  socket.on('shape:delete_multiple', (data) => broadcastToRoom('shape:delete_multiple', data));
  socket.on('page:add', (page) => broadcastToRoom('page:add', page));
  socket.on('page:delete', (id) => broadcastToRoom('page:delete', id));
  socket.on('page:rename', (data) => broadcastToRoom('page:rename', data));
  socket.on('cursor:update', (data) => broadcastToRoom('cursor:update', { ...data, id: socket.id }));

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
        roomData.activeUsers.delete(leavingUuid);
        roomData.participants.delete(leavingUuid); // Remove from roster
        
        // Host Succession
        if (roomData.hostUuid === leavingUuid && roomData.activeUsers.size > 0) {
          const nextHostUuid = Array.from(roomData.activeUsers)[0];
          roomData.hostUuid = nextHostUuid;
          const nextHostSession = sessionCache.get(nextHostUuid);
          
          if (nextHostSession) {
            roomData.hostSocketId = nextHostSession.socketId;
            const nextHostParticipant = roomData.participants.get(nextHostUuid);
            if (nextHostParticipant) nextHostParticipant.isHost = true;
            
            io.to(roomData.hostSocketId).emit('host-promoted');
            console.log(`Host left. ${nextHostSession.userName} promoted to Host.`);
          }
        }
        
        // --- Broadcast the updated roster since someone left ---
        broadcastRoster(roomId);
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
// --- API Route: Check if a room exists and is joinable ---
app.get('/api/rooms/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = roomMetadata.get(roomId);

  if (!roomData) {
    return res.status(404).json({ exists: false, message: "Room does not exist" });
  }

  if (roomData.activeUsers.size >= MAX_CAPACITY) {
    return res.status(400).json({ exists: true, full: true, message: "Room is full (Max 6 users)" });
  }

  return res.json({ exists: true, full: false });
});
server.listen(PORT, () => console.log(`WBoard signaling server running on port ${PORT}`));