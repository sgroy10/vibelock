"use client";

import { useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  isBusy: boolean;
  wcReady: boolean;
  hasMessages: boolean;
  value: string;
  onChange: (value: string) => void;
}

export default function ChatInput({
  onSend,
  isBusy,
  wcReady,
  hasMessages,
  value,
  onChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Re-focus when isBusy becomes false
  useEffect(() => {
    if (!isBusy) {
      textareaRef.current?.focus();
    }
  }, [isBusy]);

  const placeholder = isBusy
    ? "VibeLock is building..."
    : !hasMessages
      ? "Describe what you want to build..."
      : "Describe what to change or add...";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isBusy && wcReady) {
        onSend(value.trim());
      }
    }
  };

  const canSend = value.trim().length > 0 && !isBusy && wcReady;

  return (
    <div className="relative rounded-xl overflow-hidden bg-white border border-gray-200 focus-within:border-orange-300 focus-within:ring-1 focus-within:ring-orange-200 transition-all">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isBusy}
        className="w-full bg-white text-gray-900 placeholder:text-gray-400 px-3 py-2.5 pr-16 text-sm resize-none outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ minHeight: "60px", caretColor: "#FF6B2C", caretShape: "bar" } as React.CSSProperties}
      />
      <button
        onClick={() => {
          if (canSend) onSend(value.trim());
        }}
        disabled={!canSend}
        className="absolute right-2 bottom-2 px-3 py-1 rounded-lg text-[11px] font-medium text-white transition-all disabled:opacity-30 shadow-sm"
        style={{
          background: canSend
            ? "linear-gradient(135deg, #FF6B2C, #FF8F3C)"
            : "#E5E7EB",
        }}
      >
        {isBusy ? "..." : "Send"}
      </button>
    </div>
  );
}
