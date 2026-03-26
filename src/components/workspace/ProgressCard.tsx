"use client";

interface ProgressCardProps {
  phase: string;
  detail: string;
  retryCount: number;
  terminalLines: string[];
}

const PHASE_ICONS: Record<string, string> = {
  idle: "\uD83C\uDFAF",
  streaming: "\u2728",
  writing: "\uD83D\uDCDD",
  installing: "\uD83D\uDCE6",
  starting: "\uD83D\uDE80",
  ready: "\u2705",
  error: "\u274C",
};

const PHASE_LABELS: Record<string, string> = {
  idle: "Ready",
  streaming: "Generating code...",
  writing: "Creating files...",
  installing: "Installing packages...",
  starting: "Starting your app...",
  ready: "Your app is ready!",
  error: "Something went wrong",
};

export default function ProgressCard({ phase, detail, retryCount, terminalLines }: ProgressCardProps) {
  const icon = PHASE_ICONS[phase] || "\u2728";
  const label = detail || PHASE_LABELS[phase] || phase;
  const isBuilding = phase !== "idle" && phase !== "ready" && phase !== "error";
  const lastLines = terminalLines.slice(-3);

  const progressWidth =
    phase === "streaming" ? "30%" :
    phase === "writing" ? "50%" :
    phase === "installing" ? "70%" :
    phase === "starting" ? "90%" :
    phase === "error" ? "100%" :
    phase === "ready" ? "100%" : "10%";

  return (
    <div className="mr-auto max-w-[92%]">
      <div
        className="rounded-2xl p-4 bg-white border border-gray-200 shadow-sm"
        style={isBuilding ? { animation: "progress-pulse 2s ease-in-out infinite" } : undefined}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-orange-50 shrink-0">
            <span className="text-lg">{icon}</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{label}</div>
          </div>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 mb-3">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: progressWidth,
              background: phase === "error" ? "#DC2626" : "linear-gradient(90deg, #FF6B2C, #FF8F3C)",
            }}
          />
        </div>

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
        @keyframes progress-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(255, 107, 44, 0);
          }
          50% {
            box-shadow: 0 0 0 3px rgba(255, 107, 44, 0.1);
          }
        }
      `}</style>
    </div>
  );
}
