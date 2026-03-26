"use client";

export default function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-2 mr-auto max-w-[92%]">
      <div className="rounded-2xl px-4 py-3 bg-gray-50 border border-gray-100">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full bg-gray-400"
              style={{ animation: "thinking-bounce 1.4s ease-in-out infinite" }}
            />
            <span
              className="inline-block w-2 h-2 rounded-full bg-gray-400"
              style={{ animation: "thinking-bounce 1.4s ease-in-out 0.2s infinite" }}
            />
            <span
              className="inline-block w-2 h-2 rounded-full bg-gray-400"
              style={{ animation: "thinking-bounce 1.4s ease-in-out 0.4s infinite" }}
            />
          </div>
          <span className="text-xs text-gray-400 ml-1">VibeLock is thinking...</span>
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
