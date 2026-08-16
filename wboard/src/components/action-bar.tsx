"use client";

import React from "react";
import { Mic, MicOff, Hand, LogOut } from "lucide-react";
import { useSocket } from "@/components/socket-provider";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";

// --- NEW: Add the prop interface ---
interface ActionBarProps {
  toggleHardwareMic: (isMuted: boolean) => void;
}

export function ActionBar({ toggleHardwareMic }: ActionBarProps) {
  const socket = useSocket();
  const roomId = useWhiteboardStore((state) => state.roomId);
  const currentUser = useWhiteboardStore((state) => state.currentUser);
  const participants = useWhiteboardStore((state) => state.participants);

  const myParticipant = participants.find((p) => p.name === currentUser?.name);
  const isMuted = myParticipant ? myParticipant.isMuted : true;
  const handRaised = myParticipant ? myParticipant.handRaised : false;

  const toggleMic = () => {
    if (!socket || !roomId || !currentUser) return;
    
    const nextMuteState = !isMuted;
    
    // 1. Physically mute/unmute the hardware microphone
    toggleHardwareMic(nextMuteState);
    
    // 2. Tell the server to update the UI for everyone else
    socket.emit("participant:update", {
      roomId,
      uuid: currentUser.id,
      updates: { isMuted: nextMuteState },
    });
  };

  const toggleHand = () => {
    if (!socket || !roomId || !currentUser) return;
    socket.emit("participant:update", {
      roomId,
      uuid: currentUser.id,
      updates: { handRaised: !handRaised },
    });
  };

  const handleLeave = () => {
    window.location.href = "/";
  };

  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-4 py-2.5 shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur">
      <button
        type="button"
        onClick={toggleMic}
        className={[
          "flex h-11 w-11 items-center justify-center rounded-full transition",
          isMuted
            ? "bg-red-50 text-red-600 hover:bg-red-100"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200",
        ].join(" ")}
        title={isMuted ? "Unmute Mic" : "Mute Mic"}
      >
        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
      </button>

      <button
        type="button"
        onClick={toggleHand}
        className={[
          "flex h-11 w-11 items-center justify-center rounded-full transition",
          handRaised
            ? "bg-amber-100 text-amber-700 ring-2 ring-amber-400"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200",
        ].join(" ")}
        title={handRaised ? "Lower Hand" : "Raise Hand"}
      >
        <Hand className="h-5 w-5" />
      </button>

      <div className="h-6 w-[1px] bg-slate-200 mx-1" />

      <button
        type="button"
        onClick={handleLeave}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 shadow-sm"
        title="Leave Room"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  );
}