import { create } from "zustand";

export type BuildPhase =
  | "idle"
  | "streaming"
  | "writing"
  | "installing"
  | "starting"
  | "ready"
  | "error";

interface WorkspaceState {
  // Build state
  phase: BuildPhase;
  phaseDetail: string;
  previewUrl: string | null;
  terminalOutput: string[];
  retryCount: number;

  // Actions
  setPhase: (phase: BuildPhase, detail?: string) => void;
  setPreviewUrl: (url: string | null) => void;
  appendTerminal: (line: string) => void;
  clearTerminal: () => void;
  incrementRetry: () => void;
  resetRetry: () => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  phase: "idle",
  phaseDetail: "",
  previewUrl: null,
  terminalOutput: [],
  retryCount: 0,

  setPhase: (phase, detail = "") => set({ phase, phaseDetail: detail }),
  setPreviewUrl: (url) => set({ previewUrl: url }),
  appendTerminal: (line) =>
    set((s) => {
      // Strip ANSI escape codes for clean display
      const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\[[\d;]*[HJKmsu]/g, "").trim();
      if (!clean) return s;
      return { terminalOutput: [...s.terminalOutput.slice(-200), clean] };
    }),
  clearTerminal: () => set({ terminalOutput: [] }),
  incrementRetry: () => set((s) => ({ retryCount: s.retryCount + 1 })),
  resetRetry: () => set({ retryCount: 0 }),
  reset: () =>
    set({
      phase: "idle",
      phaseDetail: "",
      previewUrl: null,
      terminalOutput: [],
      retryCount: 0,
    }),
}));
