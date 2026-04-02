"use client";

import { useState, useEffect } from "react";

interface ProgressCardProps {
  phase: string;
  detail: string;
  retryCount: number;
  terminalLines: string[];
  tasks?: string[];
}

const PHASE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  idle: { icon: "\uD83C\uDFAF", label: "Ready", color: "gray" },
  planning: { icon: "\uD83D\uDCCB", label: "Planning your app...", color: "blue" },
  streaming: { icon: "\u2728", label: "Writing code...", color: "orange" },
  writing: { icon: "\uD83D\uDCDD", label: "Creating files...", color: "orange" },
  installing: { icon: "\uD83D\uDCE6", label: "Setting up sandbox...", color: "purple" },
  starting: { icon: "\uD83D\uDE80", label: "Starting your app...", color: "green" },
  ready: { icon: "\u2705", label: "Your app is ready!", color: "green" },
  error: { icon: "\u274C", label: "Something went wrong", color: "red" },
};

const PHASE_ORDER = ["streaming", "writing", "installing", "starting", "ready"];

export default function ProgressCard({ phase, detail, retryCount, terminalLines, tasks }: ProgressCardProps) {
  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.streaming;
  const label = detail || config.label;
  const isBuilding = phase !== "idle" && phase !== "ready" && phase !== "error";
  const lastLines = terminalLines.slice(-3);

  // Animated progress
  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const progress = phase === "error" ? 100 : phase === "ready" ? 100 : Math.max(10, ((phaseIndex + 1) / PHASE_ORDER.length) * 100);

  // Task completion animation
  const [completedTasks, setCompletedTasks] = useState(0);
  useEffect(() => {
    if (!tasks?.length) return;
    // Animate task completion based on phase
    if (phase === "streaming") setCompletedTasks(0);
    else if (phase === "writing") setCompletedTasks(Math.ceil(tasks.length * 0.3));
    else if (phase === "installing") setCompletedTasks(Math.ceil(tasks.length * 0.6));
    else if (phase === "starting") setCompletedTasks(Math.ceil(tasks.length * 0.9));
    else if (phase === "ready") setCompletedTasks(tasks.length);
  }, [phase, tasks]);

  return (
    <div className="mr-auto max-w-[92%]">
      <div className="rounded-2xl p-4 bg-white border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: phase === "error" ? "#FEE2E2" : phase === "ready" ? "#DCFCE7" : "#FFF7ED",
            }}
          >
            <span className="text-lg" style={isBuilding ? { animation: "task-spin 2s linear infinite" } : undefined}>
              {config.icon}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900">{label}</div>
            {tasks && tasks.length > 0 && (
              <div className="text-[11px] text-gray-400 mt-0.5">
                {completedTasks}/{tasks.length} tasks completed
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 mb-3">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${progress}%`,
              background: phase === "error" ? "#DC2626" : phase === "ready" ? "#16A34A" : "linear-gradient(90deg, #FF6B2C, #FF8F3C)",
            }}
          />
        </div>

        {/* Task list */}
        {tasks && tasks.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {tasks.map((task, i) => {
              const isComplete = i < completedTasks;
              const isCurrent = i === completedTasks && isBuilding;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 text-[12px] transition-all duration-300"
                  style={{ opacity: isComplete ? 1 : isCurrent ? 1 : 0.4 }}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all duration-300"
                    style={{
                      background: isComplete ? "#16A34A" : isCurrent ? "#FF6B2C" : "#E5E7EB",
                    }}
                  >
                    {isComplete ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : isCurrent ? (
                      <div className="w-2 h-2 rounded-full bg-white" style={{ animation: "task-pulse 1s ease-in-out infinite" }} />
                    ) : null}
                  </div>
                  <span className={isComplete ? "text-gray-700 line-through" : isCurrent ? "text-gray-900 font-medium" : "text-gray-400"}>
                    {task}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Terminal output */}
        {lastLines.length > 0 && (
          <div className="rounded-lg p-2 text-[11px] font-mono max-h-[72px] overflow-y-auto bg-gray-50 text-gray-500 border border-gray-100">
            {lastLines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">{line}</div>
            ))}
          </div>
        )}

        {retryCount > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
            {"\uD83D\uDD27"} Auto-fix attempt {retryCount}/5
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes task-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes task-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
