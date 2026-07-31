"use client";

import { useEffect, useState } from "react";
import { useSocket } from "./socket-provider";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";

interface Knock {
  userName: string;
  uuid: string;
}

export function HostNotifications() {
  const socket = useSocket();
  const roomId = useWhiteboardStore((state) => state.roomId);
  const [knocks, setKnocks] = useState<Knock[]>([]);

  useEffect(() => {
    if (!socket) return;

    // Listen for incoming requests
    const handleKnock = ({ userName, uuid }: Knock) => {
      console.log(`Knock received from ${userName}`);
      setKnocks((prev) => [...prev, { userName, uuid }]);
    };

    socket.on("knock-knock", handleKnock);

    return () => {
      socket.off("knock-knock", handleKnock);
    };
  }, [socket]);

  const resolveKnock = (targetUuid: string, decision: 'admit' | 'deny') => {
    // Tell the server the decision
    socket?.emit("resolve-knock", { roomId, targetUuid, decision });
    
    // Remove the toast from the screen
    setKnocks((prev) => prev.filter((knock) => knock.uuid !== targetUuid));
  };

  // If nobody is knocking, render nothing
  if (knocks.length === 0) return null;

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3">
      {knocks.map((knock) => (
        <div 
          key={knock.uuid} 
          className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-3 shadow-2xl animate-in slide-in-from-top-4 fade-in"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"></span>
            </span>
            <p className="font-medium text-slate-800">
              <span className="font-bold">{knock.userName}</span> wants to join
            </p>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => resolveKnock(knock.uuid, 'deny')}
              className="rounded-md bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              Deny
            </button>
            <button 
              onClick={() => resolveKnock(knock.uuid, 'admit')}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Admit
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}