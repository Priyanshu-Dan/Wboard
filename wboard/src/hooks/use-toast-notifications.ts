"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";

export function useToastNotifications() {
  const participants = useWhiteboardStore((state) => state.participants);
  
  // Keep track of the previous roster state so we can compare it
  const prevParticipantsRef = useRef(participants);

  useEffect(() => {
    const prev = prevParticipantsRef.current;
    const current = participants;

    // 1. Detect New Joins
    current.forEach((user) => {
      if (!prev.find((p) => p.uuid === user.uuid)) {
        toast.success(`${user.name} joined the room`);
      }
    });

    // 2. Detect Leaves
    prev.forEach((user) => {
      if (!current.find((p) => p.uuid === user.uuid)) {
        toast.info(`${user.name} left the room`);
      }
    });

    // 3. Detect Hand Raises
    current.forEach((user) => {
      const previousState = prev.find((p) => p.uuid === user.uuid);
      if (previousState && !previousState.handRaised && user.handRaised) {
        toast(`${user.name} raised their hand`, {
          icon: '✋',
          duration: 4000,
        });
      }
    });

    // Update the ref for the next comparison
    prevParticipantsRef.current = current;
  }, [participants]);
}