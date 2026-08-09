"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Hand, Crown, Users } from "lucide-react";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";
import { useSocket } from "@/components/socket-provider";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ParticipantPanel() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: window.innerWidth - 280, y: 120 });
  const [panelWidth, setPanelWidth] = useState(250);
  const dragState = useRef<{ isDragging: boolean; startX: number; startY: number; initialX: number; initialY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  const participants = useWhiteboardStore((state) => state.participants);
  const currentUser = useWhiteboardStore((state) => state.currentUser);
  
  // 1. Initialize Socket and Room ID
  const socket = useSocket();
  const roomId = typeof window !== "undefined" ? window.location.pathname.split('/').pop() : null;

  // 2. Check if the current client is the host
  const amIHost = participants.find((p) => p.uuid === currentUser?.id)?.isHost;

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!dragState.current.isDragging) return;
      event.preventDefault();

      const deltaX = event.clientX - dragState.current.startX;
      const deltaY = event.clientY - dragState.current.startY;

      setPosition({
        x: clamp(dragState.current.initialX + deltaX, 8, window.innerWidth - panelWidth - 8),
        y: clamp(dragState.current.initialY + deltaY, 8, window.innerHeight - 8),
      });
    };

    const handleUp = () => {
      dragState.current.isDragging = false;
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [panelWidth]);

  const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = {
      isDragging: true,
      startX: event.clientX,
      startY: event.clientY,
      initialX: position.x,
      initialY: position.y,
    };
  };

  // 3. Kick Handler
  const handleKick = (targetUuid: string) => {
    if (!socket || !roomId) return;
    // Emit the kick event to the backend
    socket.emit("room:kick", { roomId, targetUuid });
  };

  return (
    <aside
      ref={panelRef}
      className="fixed z-30 rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.16)] backdrop-blur overflow-hidden"
      style={{ left: position.x, top: position.y, width: panelWidth }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Draggable Header */}
      <div
        className="flex cursor-grab items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-3 active:cursor-grabbing"
        onPointerDown={startMove}
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-600" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
            Participants ({participants.length})
          </span>
        </div>
      </div>

      {/* Roster List */}
      <div className="flex flex-col gap-2 p-3 max-h-60 overflow-y-auto">
        {participants.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">Connecting to room...</div>
        ) : (
          participants.map((p) => {
            const isMe = p.uuid === currentUser?.id;
            
            return (
              <div
                key={p.uuid}
                className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 border border-slate-100 transition"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {p.name} {isMe && <span className="text-slate-400 text-xs">(You)</span>}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* 4. The Kick Button (Only visible to the host, and not on their own name) */}
                  {amIHost && !isMe && (
                    <button
                      onClick={() => handleKick(p.uuid)}
                      className="rounded-md bg-red-100 px-2 py-1 text-[10px] font-bold text-red-600 transition hover:bg-red-200 hover:text-red-700 active:bg-red-300"
                      title={`Kick ${p.name}`}
                    >
                      KICK
                    </button>
                  )}

                  {/* Status Icons */}
                  {p.isHost && <Crown className="h-4 w-4 text-amber-500" title="Room Host" />}
                  {p.handRaised && <Hand className="h-4 w-4 text-yellow-500 animate-bounce" title="Hand Raised" />}
                  {p.isMuted ? (
                    <MicOff className="h-4 w-4 text-red-500" title="Muted" />
                  ) : (
                    <Mic className="h-4 w-4 text-emerald-600" title="Mic Open" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}