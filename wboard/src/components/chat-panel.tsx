"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useSocket } from "@/components/socket-provider";
import { useWhiteboardStore } from "@/store/use-whiteboard-store";

type ChatMessage = {
  id: string;
  text: string;
  senderName: string;
  senderId: string;
  timestamp: number;
};

export function ChatPanel() {
  const socket = useSocket();
  const currentUser = useWhiteboardStore((state) => state.currentUser);
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const processedMessages = useRef<Set<string>>(new Set());
  
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Listen for incoming messages
  useEffect(() => {
    if (!socket) return;

    const handleIncomingMessage = (msg: ChatMessage) => {
      if (processedMessages.current.has(msg.id)) return;
      
      // Add it to the Bouncer list
      processedMessages.current.add(msg.id);

      setMessages((prev) => [...prev, msg]);
      
      // Update badge only if chat is closed
      if (!isOpenRef.current) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    socket.on("chat:message", handleIncomingMessage);

    return () => {
      socket.off("chat:message", handleIncomingMessage);
    };
  }, [socket]); // <-- Notice isOpen is no longer here!

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  function handleOpen() {
    setIsOpen(!isOpen);
    if (!isOpen) setUnreadCount(0); // Clear unread badge when opening
  }

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return; 

    const msg: ChatMessage = {
      id: uuidv4(),
      text: input.trim(),
      senderName: currentUser?.name || "Anonymous", 
      senderId: currentUser?.id || socket?.id || uuidv4(),
      timestamp: Date.now(),
    };

    // Add our own message to the Bouncer list just to be safe
    processedMessages.current.add(msg.id);

    // Update local state immediately
    setMessages((prev) => [...prev, msg]);
    // Broadcast to the room
    socket?.emit("chat:message", msg);
    
    setInput(""); // Clear the input box
  }

  function formatTime(timestamp: number) {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric" }).format(new Date(timestamp));
  }

  return (
    <div className="absolute bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 flex h-96 w-80 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur-md">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
            <h3 className="font-semibold text-slate-700">Room Chat</h3>
            <button onClick={handleOpen} className="text-slate-400 hover:text-slate-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 text-sm">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                No messages yet. Say hi!
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                {messages.map((msg) => {
                  // Ensure our own messages show up on the right side, even if anonymous
                  const isMe = msg.senderId === (currentUser?.id || socket?.id);
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <span className="mb-1 text-xs text-slate-400">
                        {isMe ? "You" : msg.senderName} • {formatTime(msg.timestamp)}
                      </span>
                      <div className={`rounded-2xl px-4 py-2 ${isMe ? "bg-blue-600 text-white rounded-tr-sm" : "bg-slate-100 text-slate-700 rounded-tl-sm"}`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <form onSubmit={sendMessage} className="border-t border-slate-100 bg-white p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              autoComplete="off"
            />
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={handleOpen}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        
        {/* Unread Badge */}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white border-2 border-[#f7f4ec]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}