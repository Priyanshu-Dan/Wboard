"use client";

import { useRouter } from "next/navigation";

// Generates a simple 6-character alphanumeric code (e.g., "A3F9B2")
const generateRoomId = () => 
  Math.random().toString(36).substring(2, 8).toUpperCase();

export default function LandingPage() {
  const router = useRouter();

  const handleCreateRoom = () => {
    const newRoomId = generateRoomId();
    router.push(`/room/${newRoomId}`);
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
        
        <button
          onClick={handleCreateRoom}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 active:bg-blue-800"
        >
          Create New Room
        </button>
      </div>
    </div>
  );
}