"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";

const SocketContext = createContext<Socket | null>(null);

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const roomId = useWhiteboardStore((state) => state.roomId);
  const currentUser = useWhiteboardStore((state) => state.currentUser);

  useEffect(() => {
    if (!roomId || !currentUser) return;

    // Connect to your Node.js backend
    const socketInstance = io("http://localhost:4000");

    socketInstance.on("connect", () => {
      console.log("Connected to WBoard server:", socketInstance.id);
      socketInstance.emit("join-room", { roomId, userName: currentUser.name });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [roomId, currentUser]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}