"use client";

import { useState, useEffect } from "react";

const THINKING_MESSAGES = [
  "Planning your app...",
  "Analyzing requirements...",
  "Designing the architecture...",
  "Choosing the best approach...",
  "Writing production code...",
];

export default function ThinkingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-start gap-2 mr-auto max-w-[92%]">
      <div className="rounded-2xl px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full bg-orange-400"
              style={{ animation: "thinking-bounce 1.4s ease-in-out infinite" }}
            />
            <span
              className="inline-block w-2 h-2 rounded-full bg-orange-400"
              style={{ animation: "thinking-bounce 1.4s ease-in-out 0.2s infinite" }}
            />
            <span
              className="inline-block w-2 h-2 rounded-full bg-orange-400"
              style={{ animation: "thinking-bounce 1.4s ease-in-out 0.4s infinite" }}
            />
          </div>
          <span
            className="text-xs text-orange-600 font-medium transition-opacity duration-300"
            key={msgIndex}
          >
            {THINKING_MESSAGES[msgIndex]}
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes thinking-bounce {
          0%, 80%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          40% {
            transform: translateY(-6px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
