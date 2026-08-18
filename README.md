
# 🙌 WBoard

> **A real-time collaborative whiteboard for teams, discussions, and brainstorming.**

**Live Demo:** https://wboard-delta.vercel.app

WBoard is a full-stack collaborative whiteboard that enables multiple users to draw, edit, and communicate in real time. It combines **WebSocket-based synchronization** with **WebRTC peer-to-peer audio** to provide low-latency collaboration without requiring persistent storage or user authentication.

---

# 🏗️ System Architecture

WBoard uses a **hybrid client-server and peer-to-peer architecture**.

```text
                         ┌──────────────────────┐
                         │      Next.js App     │
                         │   React + Konva      │
                         │       Zustand        │
                         └──────────┬───────────┘
                                    │
                         WebSocket / Socket.IO
                                    │
                                    ▼
                    ┌──────────────────────────────┐
                    │      Node.js / Express       │
                    │        Signaling Server      │
                    │                              │
                    │  • Room Management           │
                    │  • Host / Admission Control  │
                    │  • Canvas Synchronization    │
                    │  • WebRTC Signaling          │
                    └───────────┬───────────┬──────┘
                                │           │
                    Canvas State │           │ SDP / ICE
                                │           │
              ┌─────────────────┘           └─────────────────┐
              ▼                                               ▼
       ┌──────────────┐                              ┌──────────────┐
       │   Client A   │◄──── WebRTC Audio ─────────►│   Client B   │
       └──────────────┘                              └──────────────┘
              ▲                                               ▲
              │                                               │
              └───────────────────┬───────────────────────────┘
                                  │
                           Client C / D / ...
````

### Real-Time Canvas Synchronization

Canvas operations are sent through **Socket.IO** and broadcast to all clients within the room.

```text
User Action
    │
    ▼
Local Canvas Update
    │
    ▼
Serialize Operation
    │
    ▼
Socket.IO
    │
    ▼
Room Broadcast
    │
    ├──────► Client A
    ├──────► Client B
    └──────► Client C
```

The canvas is rendered using **react-konva**, while **Zustand** manages local whiteboard state.

### Peer-to-Peer Voice

Voice communication uses **WebRTC** instead of streaming audio through the backend.

```text
Client A                    Signaling Server                    Client B
   │                              │                                │
   │──── SDP Offer ──────────────►│                                │
   │                              │──── SDP Offer ────────────────►│
   │                              │                                │
   │◄─── SDP Answer ──────────────│◄─── SDP Answer ────────────────│
   │                              │                                │
   │──── ICE Candidates ─────────►│──── ICE Candidates ──────────►│
   │                              │                                │
   │◄══════════════ Direct WebRTC Audio Connection ═══════════════►│
```

The backend is responsible only for **signaling**. Once the connection is established, audio flows directly between peers.

---

## ✨ Features

### 🖊️ Collaborative Whiteboard

* Real-time drawing and editing
* Freehand pencil and eraser
* Rectangles, circles, lines, and text
* Object selection and manipulation
* Live cursor indicators
* Undo / redo
* PNG export

### 📑 Multi-Page Boards

* Create, rename, switch, and delete pages
* Independent canvas state for each page
* Synchronized page changes across participants

### 👥 Room Management

* Temporary rooms created through shareable links
* Host-controlled admission
* Waiting queue for locked rooms
* Host can remove disruptive participants
* Maximum room capacity of 6 users

### 🎙️ Peer-to-Peer Voice

* Audio-only WebRTC communication
* Socket.IO-based signaling
* STUN-based NAT traversal
* Peer-to-peer media transport

### 🔄 Connection Resilience

The client uses a connection state machine to handle unreliable connections and backend cold starts:

```text
Polling
   ↓
Connecting
   ↓
Waiting ──────► Denied
   ↓
Admitted
   ↓
Canvas + WebRTC
```

A persistent client UUID allows users to reconnect after refreshes or short network interruptions without unnecessarily re-entering the admission queue.

### 🧹 Ephemeral Rooms

WBoard does not require a persistent database.

When the last participant leaves a room, the backend starts a timeout. Empty rooms are automatically removed after **5 minutes**, preventing abandoned room state from accumulating in server memory.

---

## 🛠️ Tech Stack

| Layer                   | Technology                 |
| ----------------------- | -------------------------- |
| Frontend                | Next.js, React, TypeScript |
| Canvas                  | react-konva, Konva         |
| State Management        | Zustand                    |
| Styling                 | Tailwind CSS               |
| Backend                 | Node.js, Express.js        |
| Real-Time Communication | Socket.IO                  |
| Voice Communication     | WebRTC                     |
| NAT Traversal           | STUN                       |
| Frontend Hosting        | Vercel                     |
| Backend Hosting         | Render                     |

---

## 🔐 Security

* Strict CORS configuration allowing only the production frontend origin
* Server-side room and host validation
* Server-controlled admission and kick operations
* No client-side authority over room privileges
* Ephemeral room state with automatic cleanup
* WebRTC audio transmitted peer-to-peer rather than through the application server


## 📌 Engineering Highlights

WBoard was designed around several core engineering constraints:

* **No persistent database** — rooms are intentionally ephemeral.
* **WebSockets for synchronization** — enables real-time propagation of canvas operations.
* **WebRTC for audio** — keeps media traffic off the application server.
* **Client-side state management** — provides responsive local interactions while changes are propagated to peers.
* **Server-side room authority** — prevents clients from directly controlling admission or host privileges.
* **Automatic room cleanup** — prevents abandoned sessions from consuming backend memory.
* **Connection state machine** — handles backend cold starts, admission states, and connection failures gracefully.

---

## 📐 Architecture Principles

The application separates responsibilities between the signaling server and clients:

```text
                    WBOARD
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
   Client-Server                 Peer-to-Peer
   Communication                 Communication
        │                             │
        ▼                             ▼
    Socket.IO                     WebRTC
        │                             │
        ├── Room Management           └── Audio
        ├── Host Control
        ├── Admission
        ├── Canvas Sync
        └── Signaling
```

The server acts as the **authority for room coordination and access control**, while WebRTC enables direct peer-to-peer audio communication.


