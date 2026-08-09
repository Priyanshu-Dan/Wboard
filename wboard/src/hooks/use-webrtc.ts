"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";

// We use Google's free public STUN servers to punch through NAT/Firewalls
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

type OfferSignal = {
  callerSocketId: string;
  callerUuid: string;
  sdp: RTCSessionDescriptionInit;
};

type AnswerSignal = {
  responderUuid: string;
  sdp: RTCSessionDescriptionInit;
};

type IceCandidateSignal = {
  senderUuid: string;
  candidate: RTCIceCandidateInit;
};

export function useWebRTC(socket: Socket | null, _roomId: string | null | undefined) {
  void _roomId;
  const currentUser = useWhiteboardStore((state) => state.currentUser);
  const participants = useWhiteboardStore((state) => state.participants);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  
  // We use a ref for PeerConnections so updating them doesn't cause constant React re-renders
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  // Socket.IO can deliver trickle candidates before the offer is processed. Keep
  // them until that peer connection has a remote description.
  const pendingIceCandidates = useRef<Record<string, RTCIceCandidateInit[]>>({});
  // A room roster can reach an existing peer while a new peer is still waiting
  // for getUserMedia. Retain its offer instead of losing the Socket.IO event.
  const pendingOffers = useRef<Record<string, OfferSignal>>({});

  // 1. Ask the browser for Microphone permissions when the hook mounts
  useEffect(() => {
    let stream: MediaStream | null = null;
    
    async function getMedia() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getAudioTracks().forEach(track => track.enabled = false);
        setLocalStream(stream);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          console.warn("User denied microphone access. Joining as listener only.");
          // Later, we can trigger a Toast notification here!
        } else {
          console.error("Failed to get local audio.", err);
        }
      }
    }
    
    getMedia();

    // Cleanup: Turn off the microphone when leaving the room
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      Object.values(peerConnections.current).forEach(pc =>{pc.close();});
      peerConnections.current = {};
    };
  }, []);

  // 2. Helper function to spin up a new P2P connection to a specific user
  const createPeerConnection = useCallback((targetUuid: string, targetSocketId: string) => {
    if (!socket || !currentUser || !localStream) return null;
    if (peerConnections.current[targetUuid]) return peerConnections.current[targetUuid];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[targetUuid] = pc;

    // A. Pipe our local microphone into this connection
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // B. When we receive their audio, save it to our remoteStreams state
    pc.ontrack = (event) => {
      console.log(`🎵 Received audio stream from ${targetUuid}! Tracks:`, event.streams[0].getAudioTracks().length);
      setRemoteStreams(prev => ({ ...prev, [targetUuid]: event.streams[0] }));
    };

    // C. Network routing: send ICE candidates to help the browsers find each other
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:ice-candidate", {
          targetSocketId,
          senderSocketId: socket.id,
          senderUuid: currentUser.id,
          candidate: event.candidate,
        });
      }
    };

    // D. Garbage Collection: Clean up if they disconnect
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        setRemoteStreams(prev => { const next = {...prev}; delete next[targetUuid]; return next; });
        delete peerConnections.current[targetUuid];
        pc.close();
      }
    };

    return pc;
  }, [socket, currentUser, localStream]);

  const flushIceCandidates = useCallback(async (peerUuid: string, pc: RTCPeerConnection) => {
    const candidates = pendingIceCandidates.current[peerUuid] ?? [];
    delete pendingIceCandidates.current[peerUuid];

    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[WebRTC] Added queued ICE candidate from", peerUuid);
      } catch (err) {
        console.error("[WebRTC] Error adding queued ICE candidate", err);
      }
    }
  }, []);

  const handleOffer = useCallback(async ({ callerSocketId, callerUuid, sdp }: OfferSignal) => {
    // Do not drop an offer while the microphone prompt is still open. It will
    // be processed as soon as localStream is available.
    if (!localStream) {
      console.log("[WebRTC] Queuing offer from", callerUuid, "until local audio is ready");
      pendingOffers.current[callerUuid] = { callerSocketId, callerUuid, sdp };
      return;
    }

    const pc = createPeerConnection(callerUuid, callerSocketId);
    if (!pc) return;

    try {
      console.log("[WebRTC] Received offer from", callerUuid);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushIceCandidates(callerUuid, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket?.emit("webrtc:answer", {
        targetSocketId: callerSocketId,
        responderSocketId: socket.id,
        responderUuid: currentUser?.id,
        sdp: pc.localDescription,
      });
      console.log("[WebRTC] Sent answer to", callerUuid);
    } catch (err) {
      console.error("[WebRTC] Error handling offer", err);
    }
  }, [socket, currentUser, localStream, createPeerConnection, flushIceCandidates]);

  // 3. The Matchmaker: Watch the roster and call anyone new
  useEffect(() => {
    if (!socket || !currentUser || !localStream) return;

    participants.forEach(p => {
      // Don't call ourselves, and don't call people we are already connected to
      if (p.uuid === currentUser.id) return;
      if (!peerConnections.current[p.uuid]) {
        
        // The Lexicographical Sort Trick to prevent double-calls
        if (currentUser.id > p.uuid) {
          const pc = createPeerConnection(p.uuid, p.socketId);
          if (pc) {
            pc.createOffer()
              .then(offer => pc.setLocalDescription(offer))
              .then(() => {
                socket.emit("webrtc:offer", {
                  targetSocketId: p.socketId,
                  callerSocketId: socket.id,
                  callerUuid: currentUser.id,
                  sdp: pc.localDescription
                });
              })
              .catch(err => console.error("Error creating WebRTC offer", err));
          }
        }
      }
    });
  }, [participants, socket, currentUser, localStream, createPeerConnection]);

  // 4. Handle incoming phone calls (Offers, Answers, and ICE routes).
  // Register immediately; waiting for localStream here loses offers sent while
  // the microphone permission prompt is active.
  useEffect(() => {
    if (!socket || !currentUser) return;

    const handleAnswer = async ({ responderUuid, sdp }: AnswerSignal) => {
      const pc = peerConnections.current[responderUuid];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushIceCandidates(responderUuid, pc);
          console.log("[WebRTC] Received answer from", responderUuid);
        } catch (err) {
          console.error("[WebRTC] Error handling answer", err);
        }
      }
    };

    const handleIceCandidate = async ({ senderUuid, candidate }: IceCandidateSignal) => {
      const pc = peerConnections.current[senderUuid];
      // addIceCandidate is invalid before setRemoteDescription. Queue instead
      // of silently discarding candidates that race ahead of offer/answer.
      if (!pc || !pc.remoteDescription) {
        (pendingIceCandidates.current[senderUuid] ??= []).push(candidate);
        console.log("[WebRTC] Queued ICE candidate from", senderUuid);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[WebRTC] Added ICE candidate from", senderUuid);
      } catch (err) {
        console.error("[WebRTC] Error adding ICE candidate", err);
      }
    };

    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);

    return () => {
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
    };
  }, [socket, currentUser, handleOffer, flushIceCandidates]);

  // Process any offer received while getUserMedia was pending.
  useEffect(() => {
    if (!localStream) return;

    const queuedOffers = Object.values(pendingOffers.current);
    pendingOffers.current = {};
    queuedOffers.forEach((offer) => void handleOffer(offer));
  }, [localStream, handleOffer]);

  // Provide a method to physically mute/unmute the hardware stream
  const toggleHardwareMic = (isMuted: boolean) => {
    if (localStream) {
        console.log(`🎤 Hardware mic turned ${isMuted ? 'OFF' : 'ON'}`);
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted; // True means active, false means muted
      });
    }
    else {
        console.log("Tried to toggle hardware mic,but localstream is null.")
    }
  };

  // We return the incoming streams to play them in the UI, and the mute toggle
  return { remoteStreams, toggleHardwareMic };
}
