"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";

const BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

const SocketContext = createContext<Socket | null>(null);
export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // NEW: State machine for the connection process
  const [statusText, setStatusText] = useState("Waking up server...");
  const [joinState, setJoinState] = useState<'polling' | 'connecting' | 'waiting' | 'admitted' | 'denied'>('polling');
  const [denialReason, setDenialReason] = useState("");

  const roomId = useWhiteboardStore((state) => state.roomId);
  const currentUser = useWhiteboardStore((state) => state.currentUser);

  useEffect(() => {
    if (!roomId || !currentUser) return;

    let mounted = true;
    let socketInstance: Socket | null = null;

    const wakeAndConnect = async () => {
      let isAwake = false;
      let attempts = 0;

      // 1. POLLING PHASE
      while (mounted && !isAwake && attempts < 30) {
        attempts++;
        setStatusText(`Waking up server... (Attempt ${attempts}/30)`);
        
        try {
          const res = await fetch(`${BACKEND_URL}/health?t=${Date.now()}`);
          if (res.ok) {
            isAwake = true;
            if (mounted) setJoinState('connecting');
            break;
          }
        } catch (err) {
          console.log("Server unreachable. Retrying in 3s...");
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (!mounted) return;
      if (!isAwake) {
        setJoinState('denied');
        setDenialReason("Server failed to wake up. Please refresh.");
        return;
      }

      // 2. CONNECTING PHASE
      setStatusText("Connecting to room...");
      socketInstance = io(BACKEND_URL);

      socketInstance.on("connect", () => {
        console.log("Connected to WBoard server:", socketInstance?.id);
        const uuid = sessionStorage.getItem("wboard_uuid");
        
        // CHANGED: From 'join-room' to 'request-join'
        socketInstance?.emit("request-join", { 
          roomId, 
          userName: currentUser.name,
          uuid 
        });
      });

      // 3. AUTHORIZATION PHASE: Listen for the server's decision
      socketInstance.on('join-status', (payload: { status: string, reason?: string, isHost?: boolean }) => {
        if (payload.status === 'admitted') {
          setJoinState('admitted');
          // You are safely in the room now!
        } else if (payload.status === 'waiting') {
          setJoinState('waiting');
          setStatusText("Waiting for the host to admit you...");
        } else if (payload.status === 'denied') {
          setJoinState('denied');
          setDenialReason(payload.reason || "Access denied.");
        }
      });

      setSocket(socketInstance);
    };

    wakeAndConnect();

    return () => {
      mounted = false;
      if (socketInstance) socketInstance.disconnect();
    };
  }, [roomId, currentUser]); 

  // UI RENDERING BASED ON STATE

  if (!roomId || !currentUser) {
    return <SocketContext.Provider value={null}>{children}</SocketContext.Provider>;
  }

  // Success: Render the whiteboard!
  if (joinState === 'admitted' && socket) {
    return (
      <SocketContext.Provider value={socket}>
        {children}
      </SocketContext.Provider>
    );
  }

  // Denied: Render an error screen
  if (joinState === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-slate-50 text-slate-800 p-4 text-center">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-600">{denialReason}</p>
        <button onClick={() => window.location.reload()} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
          Try Again
        </button>
      </div>
    );
  }

  // Loading/Waiting: Render the spinner with dynamic text
  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-slate-50 text-slate-800 p-4 text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-6"></div>
      <h2 className="text-xl font-semibold text-slate-800">{statusText}</h2>
      {joinState === 'polling' && (
        <p className="text-slate-500 mt-2">Free Render servers take ~30 seconds to boot up.</p>
      )}
      {joinState === 'waiting' && (
        <p className="text-slate-500 mt-2">The host has been notified. Hang tight!</p>
      )}
    </div>
  );
}