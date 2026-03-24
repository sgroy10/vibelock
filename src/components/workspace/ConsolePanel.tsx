"use client";

import { useState, useEffect, useRef } from "react";
import type { ConsoleLine } from "@/lib/console-capture";

const MAX_LINES = 100;

/**
 * Console Panel — shows browser errors/warnings captured from the preview iframe.
 * Similar to Chrome DevTools console but embedded in VibeLock workspace.
 */
export default function ConsolePanel() {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "vibelock-console") {
        const line: ConsoleLine = {
          level: event.data.level || "log",
          message: String(event.data.message || "").slice(0, 1000),
          timestamp: Date.now(),
        };
        setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), line]);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const errors = lines.filter((l) => l.level === "error");
  const warnings = lines.filter((l) => l.level === "warn");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-medium text-gray-600">Console</span>
          {errors.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">
              {errors.length} error{errors.length > 1 ? "s" : ""}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">
              {warnings.length} warn{warnings.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={() => setLines([])}
          className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded hover:bg-gray-100 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Console output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">
            No console output yet
          </div>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={`px-3 py-1 border-b border-gray-50 break-all ${
                line.level === "error"
                  ? "bg-red-50/50 text-red-700"
                  : line.level === "warn"
                  ? "bg-amber-50/50 text-amber-700"
                  : "text-gray-600"
              }`}
            >
              <span className="inline-block w-4 text-[9px] opacity-60">
                {line.level === "error" ? "✕" : line.level === "warn" ? "⚠" : "›"}
              </span>
              {line.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
