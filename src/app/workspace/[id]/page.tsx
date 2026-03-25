"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";
import { getWebContainer, isTemplateReady, readProjectFiles } from "@/lib/webcontainer";
import { LOCKED_CONFIG_FILES } from "@/lib/golden-template";
import { StreamParser, type VibeLockOp } from "@/lib/agent/parser";
import { detectLanguage, SUPPORTED_LANGUAGES, type Language } from "@/lib/language";
import { detectConstraints, formatConstraintsForPrompt, type Constraint } from "@/lib/speclock";
import { useSecretsStore } from "@/stores/secrets";
import FileExplorer from "@/components/workspace/FileExplorer";
import ConsolePanel from "@/components/workspace/ConsolePanel";
import ChatMarkdown from "@/components/workspace/ChatMarkdown";
import JSZip from "jszip";

/** Strip vibelock tags AND any code content from display text */
function cleanDisplay(text: string): string {
  let clean = text;
  // Strip markdown code fences wrapping vibelock tags
  clean = clean.replace(/```(?:xml|html|jsx?|tsx?|javascript|typescript|text)?\s*\n?(?=<\/?vibelock-)/g, "");
  clean = clean.replace(/(?<=<\/vibelock-(?:file|shell)>)\s*\n?```/g, "");
  // Remove complete tags with content
  clean = clean.replace(/<vibelock-file[^>]*>[\s\S]*?<\/vibelock-file>/g, "");
  clean = clean.replace(/<vibelock-shell[^>]*>[\s\S]*?<\/vibelock-shell>/g, "");
  // Remove incomplete tags (during streaming, closing tag hasn't arrived yet)
  clean = clean.replace(/<vibelock-file[^>]*>[\s\S]*/g, "");
  clean = clean.replace(/<vibelock-shell[^>]*>[\s\S]*/g, "");
  // Remove any remaining tag fragments
  clean = clean.replace(/<\/?vibelock-[^>]*>/g, "");
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  return clean;
}
import { executeOps, formatErrorForRetry, killDevServer, preflightBuildCheck } from "@/lib/agent/executor";
import { validateImports, formatMissingImports } from "@/lib/agent/validator";
import { startConsoleCapture, getConsoleErrors, clearConsoleLogs } from "@/lib/console-capture";
import { useWorkspaceStore } from "@/stores/workspace";
import type { WebContainer } from "@webcontainer/api";

type Message = { role: "user" | "assistant"; content: string };

const MAX_RETRIES = 5;

const PHASE_LABELS: Record<string, { label: string; icon: string }> = {
  idle: { label: "Ready", icon: "🎯" },
  streaming: { label: "Generating code...", icon: "✨" },
  writing: { label: "Creating files...", icon: "📝" },
  installing: { label: "Installing packages...", icon: "📦" },
  starting: { label: "Starting your app...", icon: "🚀" },
  ready: { label: "Your app is ready!", icon: "✅" },
  error: { label: "Something went wrong", icon: "❌" },
};

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "";
  const projectId = params.id as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [detectedLang, setDetectedLang] = useState<Language>(SUPPORTED_LANGUAGES[0]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [showSecrets, setShowSecrets] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deviceFrame, setDeviceFrame] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [devServerRunning, setDevServerRunning] = useState(false);
  const secrets = useSecretsStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wcRef = useRef<WebContainer | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [wcReady, setWcReady] = useState(false);

  const {
    phase,
    phaseDetail,
    previewUrl,
    terminalOutput,
    retryCount,
    setPhase,
    setPreviewUrl,
    appendTerminal,
    clearTerminal,
    incrementRetry,
    resetRetry,
  } = useWorkspaceStore();

  const isStreaming = phase === "streaming";
  const isBusy = phase !== "idle" && phase !== "ready" && phase !== "error";

  const [templateInstalled, setTemplateInstalled] = useState(false);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [savedFiles, setSavedFiles] = useState<Record<string, string> | null>(null);

  // ─── PERSISTENCE: Save project state to DB ───
  const saveProject = useCallback(async () => {
    const wc = wcRef.current;
    if (!wc) return;
    try {
      const files = await readProjectFiles(wc);
      const currentMessages = useWorkspaceStore.getState().phase === "ready"
        ? messages : messages; // always save current messages
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages,
          files,
          constraints: constraints.map((c) => ({ text: c.text, source: c.source })),
          name: initialPrompt?.slice(0, 60) || "Untitled",
        }),
      });
    } catch (err) {
      console.warn("Failed to save project:", err);
    }
  }, [messages, constraints, projectId, initialPrompt]);

  // ─── PERSISTENCE: Load project state from DB ───
  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.error) return null;
      return data;
    } catch {
      return null;
    }
  }, [projectId]);

  // ─── PERSISTENCE: Restore files to WebContainer ───
  const restoreFiles = useCallback(async (wc: WebContainer, files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split("/");
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join("/");
        try { await wc.fs.mkdir(dir, { recursive: true }); } catch { /* exists */ }
      }
      await wc.fs.writeFile(path, content);
    }
  }, []);

  // Start listening for console errors from preview iframe
  useEffect(() => {
    startConsoleCapture();
    return () => {};
  }, []);

  // Boot WebContainer + load saved project
  useEffect(() => {
    setPhase("installing", "Setting up sandbox...");

    Promise.all([getWebContainer(), loadProject()]).then(async ([wc, saved]) => {
      wcRef.current = wc;

      wc.on("server-ready", (_port: number, url: string) => {
        setPreviewUrl(url);
        setDevServerRunning(true);
      });

      // Restore saved project if it exists
      if (saved && saved.messages && saved.messages.length > 0) {
        setMessages(saved.messages);
        if (saved.constraints) {
          setConstraints(saved.constraints.map((c: { id?: string; text: string; source: string; createdAt?: string }) => ({
            id: c.id || `lock_${Date.now()}`,
            text: c.text,
            source: c.source as "auto" | "user",
            createdAt: c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
          })));
        }
        // Restore files to WebContainer
        if (saved.files && Object.keys(saved.files).length > 0) {
          setSavedFiles(saved.files);
          setPhase("installing", "Restoring your project...");
          appendTerminal("📂 Restoring saved files...\n");
          await restoreFiles(wc, saved.files);
          appendTerminal(`✅ Restored ${Object.keys(saved.files).length} files\n`);
          // Start dev server with restored files
          appendTerminal("🚀 Starting dev server...\n");
          setPhase("starting", "Starting your app...");
          const proc = await wc.spawn("npm", ["run", "dev"]);
          proc.output.pipeTo(new WritableStream({ write(data) { appendTerminal(data); } })).catch(() => {});
          setProjectLoaded(true);
          setWcReady(true);
          setTemplateInstalled(true);
          return;
        }
      }

      // No saved project — fresh start
      setWcReady(true);
      setTemplateInstalled(isTemplateReady());
      setPhase("idle");
      setProjectLoaded(true);
    });
  }, [setPhase, setPreviewUrl]);

  // Auto-send initial prompt (only for new projects, not restored ones)
  useEffect(() => {
    if (initialPrompt && messages.length === 0 && wcReady && projectLoaded) {
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, wcReady, projectLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamChat = useCallback(
    async (chatMessages: Message[]): Promise<{ text: string; ops: VibeLockOp[] }> => {
      // Phase 1: Context Engine — read current project files and send to AI
      let projectContext: Record<string, string> = {};
      const wc = wcRef.current;
      if (wc) {
        try {
          projectContext = await readProjectFiles(wc);
        } catch {
          // fail silently — AI will work without context
        }
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages,
          projectId,
          projectContext, // existing files for the AI to reference
          isFirstMessage: chatMessages.filter(m => m.role === "user").length === 1,
          constraints: constraints.map((c) => c.text),
          secrets: {
            supabaseUrl: secrets.supabaseUrl || null,
            openaiKey: secrets.openaiKey ? true : null,
            stripeKey: secrets.stripeKey ? true : null,
          },
        }),
      });
      if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      const parser = new StreamParser();
      let fullText = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        parser.feed(chunk);

        const displayText = cleanDisplay(fullText);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: displayText || "Building your app...",
          };
          return updated;
        });
      }

      // CRITICAL: flush captures any in-progress file that wasn't closed
      // This is the fix for dropped files (e.g., 4 planned but only 3 written)
      parser.flush();

      return { text: fullText, ops: parser.getAllOps() };
    },
    [projectId]
  );

  const sendMessage = async (text?: string) => {
    const content = text || input;
    if (!content.trim() || isBusy) return;

    // Detect language from user input
    const lang = detectLanguage(content);
    setDetectedLang(lang);

    // Detect constraints (SpecLock)
    const newConstraints = detectConstraints(content);
    if (newConstraints.length > 0) {
      const newLocks = newConstraints.map((text) => ({
        id: `lock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text,
        source: "auto" as const,
        createdAt: Date.now(),
      }));
      setConstraints((prev) => [...prev, ...newLocks]);
    }

    const userMsg: Message = { role: "user", content: content.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setPhase("streaming");
    resetRetry();
    clearTerminal();

    try {
      const { ops } = await streamChat(updatedMessages);
      if (ops.length === 0) {
        setPhase("idle");
        return;
      }
      const wc = wcRef.current;
      if (!wc) {
        setPhase("error", "WebContainer not ready");
        return;
      }
      await executeWithRetry(wc, ops, updatedMessages);
    } catch (err) {
      console.error("Send error:", err);
      setPhase("error", err instanceof Error ? err.message : "Unknown error");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    }
  };

  const executeWithRetry = async (
    wc: WebContainer,
    ops: VibeLockOp[],
    chatMessages: Message[],
    attempt = 0
  ) => {
    // Filter out config files that AI shouldn't regenerate (golden template handles these)
    // Exception: package.json is allowed through when AI needs to add new dependencies
    ops = ops.filter((op) => {
      if (op.type === "file" && op.path !== "package.json" && LOCKED_CONFIG_FILES.has(op.path)) {
        appendTerminal(`⏭ Skipping locked config: ${op.path}\n`);
        return false;
      }
      return true;
    });

    const hasInstall = ops.some((o) => o.type === "shell" && o.command.includes("install"));
    const hasDev = ops.some((o) => o.type === "shell" && (o.command.includes("dev") || o.command.includes("start")));
    const hasFiles = ops.some((o) => o.type === "file");
    const hasNewDeps = ops.some((o) => o.type === "file" && o.path === "package.json");
    const onlySrcFiles = hasFiles && ops.filter((o) => o.type === "file").every((o) => o.type === "file" && o.path.startsWith("src/"));
    const isRetry = attempt > 0;

    // HMR DISABLED — always run full build check pipeline.
    // HMR was skipping the pre-flight build check, causing broken code
    // to go directly to the dev server. Reliability > speed.
    const useHMR = false;

    if (useHMR) {
      appendTerminal("⚡ HMR: Only src/ files changed, skipping restart\n");
      ops = ops.filter((o) => o.type === "file");
    } else {
      // Always ensure npm install + dev server start
      if (hasFiles && !hasInstall && (hasNewDeps || !isTemplateReady())) {
        ops.push({ type: "shell", command: "npm install" });
      }
      if (hasFiles && !hasDev) {
        ops.push({ type: "shell", command: "npm run dev" });
      }
    }

    const fileCount = ops.filter((o) => o.type === "file").length;
    setPhase("writing", `Creating ${fileCount} files...`);
    appendTerminal(`📝 Writing ${fileCount} files...\n`);

    const { errors } = await executeOps(
      wc, ops,
      (data) => appendTerminal(data),
      (p, detail) => setPhase(p as typeof phase, detail),
      secrets.getAllEnvVars()
    );

    // POST-GENERATION IMPORT VALIDATION
    // Check that all imports resolve to real files BEFORE starting dev server
    if (errors.length === 0 && attempt < MAX_RETRIES) {
      appendTerminal("🔍 Validating imports...\n");
      const missingImports = await validateImports(wc);
      if (missingImports.length > 0) {
        const missingFiles = missingImports.map((m) => m.resolvedPath + ".jsx").join(", ");
        appendTerminal(`⚠️ Missing files: ${missingFiles}. Generating...\n`);
        incrementRetry();
        const fixMsg = formatMissingImports(missingImports);
        const fixMessages: Message[] = [
          ...chatMessages,
          { role: "assistant", content: "(files generated but some imports are missing)" },
          { role: "user", content: fixMsg },
        ];
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `📝 Creating missing files: ${missingFiles}` },
        ]);
        setPhase("streaming");
        const { ops: fixOps } = await streamChat(fixMessages);
        if (fixOps.length > 0) {
          // Only write the missing files — don't restart dev server yet
          await executeOps(wc, fixOps.filter(o => o.type === "file"), (data) => appendTerminal(data));
          appendTerminal("✅ Missing files created\n");
        }
      }
    }

    // PRE-FLIGHT BUILD CHECK — verify code compiles before starting dev server
    if (errors.length === 0 && !useHMR && attempt < MAX_RETRIES) {
      appendTerminal("🔨 Pre-flight build check...\n");
      setPhase("writing", "Verifying build...");
      const buildError = await preflightBuildCheck(wc, (data) => appendTerminal(data));
      if (buildError) {
        appendTerminal(`❌ Build failed. Auto-fixing...\n`);
        incrementRetry();
        await killDevServer();
        setDevServerRunning(false);
        const fixMessages: Message[] = [
          ...chatMessages,
          { role: "assistant", content: "(code generated but build failed)" },
          { role: "user", content: `Build error:\n${buildError}\n\nFix the syntax/import errors. Read <project-context> and regenerate ONLY the broken files.` },
        ];
        setMessages((prev) => [...prev, { role: "assistant", content: "🔧 Fixing build error..." }]);
        setPhase("streaming");
        const { ops: fixOps } = await streamChat(fixMessages);
        if (fixOps.length > 0) {
          await executeWithRetry(wc, fixOps, fixMessages, attempt + 1);
        } else {
          setPhase("error", "Could not fix build error");
        }
        return; // don't continue to dev server
      }
      appendTerminal("✅ Build check passed!\n");
    }

    if (errors.length === 0 && useHMR) {
      appendTerminal("⏳ Waiting for HMR update...\n");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Check for runtime errors after HMR
      const runtimeErrors = getConsoleErrors();
      if (runtimeErrors && attempt < MAX_RETRIES) {
        appendTerminal("⚠️ Runtime error detected after HMR. Auto-fixing...\n");
        errors.push({ success: false, output: "", error: runtimeErrors, op: { type: "shell", command: "runtime" } });
      } else {
        appendTerminal("✅ Files updated via HMR\n");
        setPhase("ready");
        setFileRefresh((n) => n + 1);
        saveProject(); // Auto-save after successful HMR update
        return;
      }
    }

    if (errors.length === 0) {
      // Wait for dev server — poll for up to 45 seconds
      appendTerminal("⏳ Waiting for dev server...\n");
      const getStore = useWorkspaceStore.getState;
      let serverStarted = false;
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (getStore().previewUrl) {
          serverStarted = true;
          break;
        }
      }

      if (serverStarted) {
        // Server started — wait for app to fully load and check for errors
        // Two-pass check: 3s + 4s to catch both fast and slow errors
        appendTerminal("🔍 Checking for errors...\n");
        clearConsoleLogs();
        await new Promise((resolve) => setTimeout(resolve, 3000));
        let runtimeErrors = getConsoleErrors();
        if (!runtimeErrors) {
          // Second check — some errors appear after initial render
          await new Promise((resolve) => setTimeout(resolve, 4000));
          runtimeErrors = getConsoleErrors();
        }

        if (runtimeErrors && attempt < MAX_RETRIES) {
          // App built but crashes at runtime — auto-fix!
          appendTerminal("⚠️ App has runtime errors. Auto-fixing...\n");
          setPhase("error", "Runtime error — fixing...");
          errors.push({ success: false, output: "", error: `Runtime error in browser:\n${runtimeErrors}`, op: { type: "shell", command: "runtime" } });
        } else {
          appendTerminal("✅ App is running!\n");
          setPhase("ready");
          setFileRefresh((n) => n + 1);
          setMessages((prev) => {
            const updated = [...prev];
            if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
              const existing = updated[updated.length - 1].content;
              if (existing === "Building your app..." || !existing.includes("ready")) {
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: "Your app is ready! Check the preview. You can keep describing changes below.",
                };
              }
            }
            return updated;
          });
          saveProject(); // Auto-save after successful build
          return;
        }
      } else if (attempt < MAX_RETRIES) {
        // Server didn't start — treat as error and auto-retry
        appendTerminal("❌ Dev server failed to start. Retrying...\n");
        errors.push({
          success: false, output: "", op: { type: "shell", command: "npm run dev" },
          error: "Dev server did not start within 45 seconds. npm install likely failed or package.json is invalid.",
        });
      } else {
        setPhase("error", "Dev server failed to start");
        appendTerminal("❌ Dev server failed after all retries.\n");
      }
    }

    if (errors.length > 0 && attempt < MAX_RETRIES) {
      incrementRetry();
      // Debug-first: collect console errors from the preview iframe
      const consoleErrors = getConsoleErrors();
      const errorMsg = formatErrorForRetry(errors, consoleErrors);
      clearConsoleLogs();
      appendTerminal(`\n⚠️ Error (attempt ${attempt + 1}/${MAX_RETRIES}). Auto-fixing...\n`);

      // On retry, kill old dev server and force a full restart
      await killDevServer();
      setDevServerRunning(false);

      const retryMessages: Message[] = [
        ...chatMessages,
        { role: "assistant", content: "(previous attempt had errors)" },
        { role: "user", content: errorMsg },
      ];
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `🔧 Fixing error (attempt ${attempt + 2}/${MAX_RETRIES})...` },
      ]);
      setPhase("streaming");
      const { ops: fixOps } = await streamChat(retryMessages);
      if (fixOps.length > 0) {
        await executeWithRetry(wc, fixOps, retryMessages, attempt + 1);
      } else {
        setPhase("error", "AI could not fix the error");
      }
    } else if (errors.length > 0) {
      setPhase("error", "Max retries reached");
    }
  };

  // File explorer refresh trigger — increments after each build
  const [fileRefresh, setFileRefresh] = useState(0);
  // Right panel tab: preview | files | console
  const [rightTab, setRightTab] = useState<"preview" | "files" | "console">("preview");

  // After successful build, refresh file explorer
  useEffect(() => {
    if (phase === "ready") setFileRefresh((n) => n + 1);
  }, [phase]);

  const handleDownload = async () => {
    const wc = wcRef.current;
    if (!wc) return;
    try {
      const files = await readProjectFiles(wc);
      const zip = new JSZip();
      for (const [path, content] of Object.entries(files)) {
        zip.file(path, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vibelock-${projectId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const handleDeploy = async () => {
    const wc = wcRef.current;
    if (!wc || isDeploying) return;
    setIsDeploying(true);
    try {
      const files = await readProjectFiles(wc);
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, projectName: projectId }),
      });
      const data = await res.json();
      if (data.url) {
        setDeployUrl(data.url);
      } else {
        alert("Deploy failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error("Deploy error:", err);
      alert("Deploy failed");
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* ── Top Bar ── */}
      <header className="flex items-center justify-between px-4 h-11 border-b border-gray-100 bg-white shrink-0 z-10">
        <a href="/" className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
          >
            V
          </div>
          <span className="text-sm font-semibold text-gray-900">VibeLock</span>
        </a>

        <div className="flex items-center gap-2">
          {/* Status pill */}
          {phase !== "idle" && (
            <div
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium",
                phase === "ready" ? "bg-green-50 text-green-700 border border-green-100" :
                phase === "error" ? "bg-red-50 text-red-700 border border-red-100" :
                "bg-amber-50 text-amber-700 border border-amber-100"
              )}
            >
              <span>{PHASE_LABELS[phase]?.icon}</span>
              <span>{phaseDetail || PHASE_LABELS[phase]?.label}</span>
            </div>
          )}

          {previewUrl && (
            <>
              <button onClick={handleDownload} className="px-2 py-0.5 rounded text-[11px] text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-gray-200">
                ⬇ Code
              </button>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded text-[11px] text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-gray-200">
                ↗ New tab
              </a>
            </>
          )}

          {previewUrl && !deployUrl && (
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="px-2.5 py-0.5 rounded text-[11px] font-medium text-white disabled:opacity-50 shadow-sm"
              style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
            >
              {isDeploying ? "Publishing..." : "🚀 Publish"}
            </button>
          )}

          {deployUrl && (
            <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-0.5 rounded text-[11px] font-medium text-white shadow-sm" style={{ background: "linear-gradient(135deg, #16A34A, #22C55E)" }}>
              🌐 Live
            </a>
          )}

          {detectedLang.code !== "en" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-600 border border-orange-100">
              {detectedLang.nativeName}
            </span>
          )}

          {constraints.length > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700 border border-green-100 cursor-help" title={constraints.map((c) => `🔒 ${c.text}`).join("\n")}>
              🔒 {constraints.length}
            </span>
          )}

          <span className={cn("w-2 h-2 rounded-full", wcReady ? "bg-green-500" : "bg-amber-400 animate-pulse")} />
        </div>
      </header>

      {/* ── Main 3-Panel Layout ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Chat Panel ── */}
        <div className="w-[340px] xl:w-[380px] flex flex-col border-r border-gray-100 shrink-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="flex flex-col gap-2.5">
              {messages.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-xs">
                  Describe what you want to build...
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "ml-auto bg-orange-50 text-gray-900 border border-orange-100"
                      : "mr-auto bg-gray-50 text-gray-700 border border-gray-100"
                  )}
                >
                  {msg.content ? (
                    msg.role === "assistant" ? <ChatMarkdown content={msg.content} /> : msg.content
                  ) : (
                    <span className="text-gray-400 italic">Thinking...</span>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Secrets Panel */}
          {showSecrets && (
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 text-xs space-y-2">
              <div className="font-medium text-gray-700">🔑 Connect Services</div>
              <div className="grid grid-cols-2 gap-1.5">
                <input placeholder="Supabase URL" value={secrets.supabaseUrl} onChange={(e) => secrets.setSupabase(e.target.value, secrets.supabaseAnonKey)} className="px-2 py-1 rounded border border-gray-200 text-gray-900 bg-white outline-none focus:ring-1 focus:ring-orange-500 text-[11px]" />
                <input placeholder="Anon Key" value={secrets.supabaseAnonKey} onChange={(e) => secrets.setSupabase(secrets.supabaseUrl, e.target.value)} className="px-2 py-1 rounded border border-gray-200 text-gray-900 bg-white outline-none focus:ring-1 focus:ring-orange-500 text-[11px]" />
                <input placeholder="OpenAI Key" type="password" value={secrets.openaiKey} onChange={(e) => secrets.setOpenaiKey(e.target.value)} className="px-2 py-1 rounded border border-gray-200 text-gray-900 bg-white outline-none focus:ring-1 focus:ring-orange-500 text-[11px]" />
                <input placeholder="Stripe Key" type="password" value={secrets.stripeKey} onChange={(e) => secrets.setStripeKey(e.target.value)} className="px-2 py-1 rounded border border-gray-200 text-gray-900 bg-white outline-none focus:ring-1 focus:ring-orange-500 text-[11px]" />
              </div>
              <div className="text-gray-400 text-[10px]">Stored locally, never sent to our servers.</div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1 mb-1.5">
              <button
                onClick={() => setShowSecrets(!showSecrets)}
                className={cn("px-2 py-0.5 rounded text-[11px]", showSecrets ? "bg-orange-50 text-orange-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50")}
              >
                🔑 {secrets.supabaseUrl ? "Connected" : "Connect"}
              </button>
              <button
                onClick={() => {
                  if (isListening) return;
                  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) { alert("Speech recognition not supported"); return; }
                  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                  const recognition = new SR();
                  recognition.continuous = false;
                  recognition.interimResults = true;
                  recognition.lang = detectedLang.code === "hi" ? "hi-IN" : detectedLang.code === "gu" ? "gu-IN" : "en-US";
                  setIsListening(true);
                  recognition.onresult = (event: any) => { setInput(Array.from(event.results).map((r: any) => r[0].transcript).join("")); };
                  recognition.onerror = () => setIsListening(false);
                  recognition.onend = () => setIsListening(false);
                  recognition.start();
                }}
                className={cn("px-2 py-0.5 rounded text-[11px]", isListening ? "bg-red-50 text-red-600 animate-pulse" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50")}
              >
                🎤 {isListening ? "Listening..." : "Speak"}
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-white border border-gray-200">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={isBusy ? "Building..." : "Describe what you want to build or change..."}
                disabled={isBusy}
                className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 px-3 py-2.5 pr-16 text-[13px] resize-none outline-none disabled:opacity-50"
                style={{ minHeight: "70px" }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isBusy || !wcReady}
                className="absolute right-2 bottom-2 px-3 py-1 rounded-lg text-[11px] font-medium text-white transition-all disabled:opacity-30 shadow-sm"
                style={{ background: input.trim() && !isBusy ? "linear-gradient(135deg, #FF6B2C, #FF8F3C)" : "#E5E7EB" }}
              >
                {isBusy ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* ── CENTER + RIGHT: Preview / Files / Console ── */}
        <div className="flex-1 flex flex-col">

          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-gray-100 bg-gray-50/50 px-2 shrink-0">
            {(["preview", "files", "console"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={cn(
                  "px-3 py-2 text-[11px] font-medium border-b-2 transition-colors capitalize",
                  rightTab === tab
                    ? "border-orange-500 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                )}
              >
                {tab === "preview" ? "🖥 Preview" : tab === "files" ? "📁 Files" : "🔍 Console"}
              </button>
            ))}

            {/* Device frame toggles — only show on preview tab */}
            {rightTab === "preview" && previewUrl && (
              <div className="ml-auto flex items-center gap-1 pr-2">
                {([
                  { key: "desktop", icon: "🖥", w: "100%" },
                  { key: "tablet", icon: "📱", w: "768px" },
                  { key: "mobile", icon: "📲", w: "375px" },
                ] as const).map(({ key, icon }) => (
                  <button
                    key={key}
                    onClick={() => setDeviceFrame(key as typeof deviceFrame)}
                    className={cn(
                      "px-1.5 py-1 rounded text-[11px] transition-colors",
                      deviceFrame === key
                        ? "bg-orange-50 text-orange-600"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 relative overflow-hidden">
            {/* Preview */}
            <div className={cn("absolute inset-0 flex items-start justify-center bg-gray-50", rightTab !== "preview" && "hidden")}>
              {previewUrl && (
                <div
                  className="h-full transition-all duration-300 bg-white"
                  style={{
                    width: deviceFrame === "mobile" ? "375px" : deviceFrame === "tablet" ? "768px" : "100%",
                    boxShadow: deviceFrame !== "desktop" ? "0 0 0 1px #e5e7eb, 0 4px 24px rgba(0,0,0,0.08)" : "none",
                    borderRadius: deviceFrame !== "desktop" ? "8px" : "0",
                    overflow: "hidden",
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    src={previewUrl}
                    className="w-full h-full border-0 bg-white"
                    title="App Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  />
                </div>
              )}

              {/* Reload button — shown when preview URL exists */}
              {previewUrl && (
                <button
                  onClick={() => {
                    if (iframeRef.current) {
                      iframeRef.current.src = previewUrl + (previewUrl.includes("?") ? "&" : "?") + "r=" + Date.now();
                    }
                  }}
                  className="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                >
                  ↻ Reload
                </button>
              )}

              {!previewUrl && phase === "idle" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gray-50">
                    <span className="text-2xl">🖥️</span>
                  </div>
                  <div className="text-sm text-gray-400">
                    {wcReady ? "Your app preview will appear here" : "Setting up sandbox..."}
                  </div>
                </div>
              )}

              {/* Building progress overlay */}
              {!previewUrl && phase !== "idle" && phase !== "ready" && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 backdrop-blur-sm">
                  <div className="w-[380px] rounded-2xl p-6 bg-white border border-gray-200 shadow-xl shadow-gray-200/50">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-orange-50 shrink-0">
                        <span className="text-xl">{PHASE_LABELS[phase]?.icon || "✨"}</span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{PHASE_LABELS[phase]?.label}</div>
                        {phaseDetail && <div className="text-xs text-gray-400 mt-0.5">{phaseDetail}</div>}
                      </div>
                    </div>

                    <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 mb-4">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: phase === "streaming" ? "30%" : phase === "writing" ? "50%" : phase === "installing" ? "70%" : phase === "starting" ? "90%" : phase === "error" ? "100%" : "10%",
                          background: phase === "error" ? "#DC2626" : "linear-gradient(90deg, #FF6B2C, #FF8F3C)",
                        }}
                      />
                    </div>

                    {terminalOutput.length > 0 && (
                      <div className="rounded-lg p-3 text-xs font-mono max-h-[100px] overflow-y-auto bg-gray-50 text-gray-500 border border-gray-100">
                        {terminalOutput.slice(-6).map((line, i) => (
                          <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                        ))}
                      </div>
                    )}

                    {retryCount > 0 && (
                      <div className="mt-3 text-xs text-gray-400">🔧 Auto-fix attempt {retryCount}/{MAX_RETRIES}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Files */}
            <div className={cn("absolute inset-0", rightTab !== "files" && "hidden")}>
              <FileExplorer wc={wcRef.current} refreshTrigger={fileRefresh} />
            </div>

            {/* Console */}
            <div className={cn("absolute inset-0", rightTab !== "console" && "hidden")}>
              <ConsolePanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
