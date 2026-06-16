"use client";
import { SocketProvider } from "@/components/socket-provider";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";
import Whiteboard from "@/components/whiteboard";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const { currentUser, setCurrentUser, setRoomId } = useWhiteboardStore();
  const [nameInput, setNameInput] = useState("");

  // Sync the URL room ID to the Zustand store
  useEffect(() => {
    setRoomId(roomId);
    
    // Cleanup when leaving the room
    return () => setRoomId(null);
  }, [roomId, setRoomId]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      // Assign them a unique session ID and save their display name
      setCurrentUser(nameInput.trim(), uuidv4());
    }
  };

  // If the user hasn't entered a name yet, show the Lobby screen
  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <form 
          onSubmit={handleJoin} 
          className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl"
        >
          <h2 className="mb-2 text-2xl font-bold text-slate-900">Join Room</h2>
          <p className="mb-6 font-mono text-sm text-slate-500">Room ID: {roomId}</p>
          
          <div className="mb-6">
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">
              Display Name
            </label>
            <input
              id="name"
              type="text"
              autoFocus
              required
              maxLength={20}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g., Priyanshu"
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={!nameInput.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300"
          >
            Join Discussion
          </button>
        </form>
      </div>
    );
  }

  
  return (
    <SocketProvider>
      <Whiteboard />
    </SocketProvider>
  );
}