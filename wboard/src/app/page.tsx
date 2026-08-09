"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

// Generates a simple 6-character alphanumeric code (e.g., "A3F9B2")
const generateRoomId = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

export default function LandingPage() {
  const router = useRouter();
  const [joinRoomId, setJoinRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreateRoom = () => {
    const newRoomId = generateRoomId();
    router.push(`/room/${newRoomId}`);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedId = joinRoomId.trim().toUpperCase();

    if (!formattedId) {
      setError("Please enter a Room ID");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${formattedId}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Room does not exist");
        return;
      }

      // Room exists and is not full -> navigate to room
      router.push(`/room/${formattedId}`);
    } catch (err) {
      console.error("Failed to check room:", err);
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="mb-2 text-4xl font-bold tracking-tight text-slate-900">
          WBoard
        </h1>
        <p className="mb-8 text-slate-500">
          Real-time collaborative technical discussions. No login required.
        </p>

        <div className="space-y-4">
          {/* Create Room Button */}
          <button
            onClick={handleCreateRoom}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
          >
            Create New Room
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <span className="relative bg-white px-3 text-xs uppercase tracking-wider text-slate-400 font-medium">
              OR JOIN EXISTING
            </span>
          </div>

          {/* Join Room Form */}
          <form onSubmit={handleJoinRoom} className="space-y-3">
            <div>
              <input
                type="text"
                maxLength={6}
                value={joinRoomId}
                onChange={(e) => {
                  setJoinRoomId(e.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="ENTER 6-DIGIT ROOM ID"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-center font-mono text-sm tracking-widest text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 uppercase placeholder:normal-case placeholder:font-sans placeholder:tracking-normal"
              />
              {error && (
                <p className="mt-2 text-sm font-medium text-red-600">
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !joinRoomId.trim()}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50"
            >
              {loading ? "Checking Room..." : "Join Room"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}