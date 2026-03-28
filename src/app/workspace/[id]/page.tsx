"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";
import { createSandbox, writeToSandbox, restartVite } from "@/lib/sandbox-client";
import { StreamParser, type VibeLockOp, type FileOp } from "@/lib/agent/parser";
import { detectLanguage, SUPPORTED_LANGUAGES, type Language } from "@/lib/language";
import { detectConstraints, type Constraint } from "@/lib/speclock";
import { useSecretsStore } from "@/stores/secrets";
import FileExplorer from "@/components/workspace/FileExplorer";
import ConsolePanel from "@/components/workspace/ConsolePanel";
import JSZip from "jszip";

// New UX components
import { toDisplayMessages, type DisplayMessage } from "@/lib/chat-types";
import { generateSuggestions } from "@/lib/suggestions";
import ChatMessage from "@/components/workspace/ChatMessage";
import ChatInput from "@/components/workspace/ChatInput";
import ThinkingIndicator from "@/components/workspace/ThinkingIndicator";
import ProgressCard from "@/components/workspace/ProgressCard";
import ProjectSidebar from "@/components/workspace/ProjectSidebar";
import { startConsoleCapture } from "@/lib/console-capture";
import { useWorkspaceStore } from "@/stores/workspace";

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

type Message = { role: "user" | "assistant"; content: string };

const PHASE_LABELS: Record<string, { label: string; icon: string }> = {
  idle: { label: "Ready", icon: "🎯" },
  streaming: { label: "Generating code...", icon: "✨" },
  writing: { label: "Creating files...", icon: "📝" },
  installing: { label: "Setting up sandbox...", icon: "📦" },
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
  const secrets = useSecretsStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Sandbox state — replaces WebContainer state
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [sandboxReady, setSandboxReady] = useState(true); // No boot delay — ready immediately

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
    isThinking,
    currentFiles,
    suggestions,
    buildComplete,
    setIsThinking,
    setCurrentFiles,
    setSuggestions,
    setBuildComplete,
  } = useWorkspaceStore();

  const isBusy = phase !== "idle" && phase !== "ready" && phase !== "error";

  const [projectLoaded, setProjectLoaded] = useState(false);
  const [savedFiles, setSavedFiles] = useState<Record<string, string> | null>(null);

  // ─── PERSISTENCE: Save project state to DB ───
  const saveProject = useCallback(async () => {
    // With sandbox, we don't read files from the container — we save what we have locally
    // The files are tracked via currentFiles in the workspace store
    try {
      const currentMessages = messages;
      await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages,
          files: savedFiles || {},
          constraints: constraints.map((c) => ({ text: c.text, source: c.source })),
          name: initialPrompt?.slice(0, 60) || "Untitled",
        }),
      });
    } catch (err) {
      console.warn("Failed to save project:", err);
    }
  }, [messages, constraints, projectId, initialPrompt, savedFiles]);

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

  // Start listening for console errors from preview iframe
  useEffect(() => {
    startConsoleCapture();
    return () => {};
  }, []);

  // Load saved project on mount — no WebContainer boot needed
  useEffect(() => {
    loadProject().then(async (saved) => {
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
        // Restore files to sandbox
        if (saved.files && Object.keys(saved.files).length > 0) {
          setSavedFiles(saved.files);
          setPhase("installing", "Restoring your project...");
          appendTerminal("📂 Restoring saved files to sandbox...\n");
          try {
            const files = Object.entries(saved.files as Record<string, string>).map(([path, content]) => ({ path, content }));
            const result = await createSandbox(projectId, files);
            setSandboxId(result.sandboxId);
            setPreviewUrl(result.previewUrl);
            appendTerminal(`✅ Sandbox restored with ${files.length} files\n`);
            setPhase("ready");
            setBuildComplete(true);
          } catch (err) {
            appendTerminal(`❌ Failed to restore sandbox: ${err instanceof Error ? err.message : "Unknown error"}\n`);
            setPhase("error", "Failed to restore project");
          }
          setProjectLoaded(true);
          return;
        }
      }

      // No saved project — fresh start, ready immediately
      setPhase("idle");
      setProjectLoaded(true);
    });
  }, [setPhase, setPreviewUrl, projectId, appendTerminal, setBuildComplete, loadProject]);

  // Auto-send initial prompt (only for new projects, not restored ones)
  useEffect(() => {
    if (initialPrompt && messages.length === 0 && sandboxReady && projectLoaded) {
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, sandboxReady, projectLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamChat = useCallback(
    async (chatMessages: Message[]): Promise<{ text: string; ops: VibeLockOp[] }> => {
      // Build project context from saved files (no WebContainer to read from)
      const projectContext: Record<string, string> = savedFiles || {};

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages,
          projectId,
          projectContext,
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
      let firstChunk = true;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        parser.feed(chunk);

        // Turn off thinking indicator on first chunk
        if (firstChunk) {
          setIsThinking(false);
          firstChunk = false;
        }

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
      parser.flush();

      // Track files created
      const fileOps = parser.getAllOps().filter(op => op.type === "file");
      if (fileOps.length > 0) {
        setCurrentFiles(fileOps.map(op => op.type === "file" ? op.path : ""));
      }

      return { text: fullText, ops: parser.getAllOps() };
    },
    [projectId, constraints, secrets, setIsThinking, setCurrentFiles, savedFiles]
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
    setIsThinking(true);
    setBuildComplete(false);
    setSuggestions([]);

    try {
      const { ops } = await streamChat(updatedMessages);
      if (ops.length === 0) {
        setPhase("idle");
        setIsThinking(false);
        return;
      }

      // Extract file ops
      const fileOps = ops.filter((o): o is FileOp => o.type === "file");
      if (fileOps.length === 0) {
        setPhase("idle");
        setIsThinking(false);
        return;
      }

      const files = fileOps.map((op) => ({ path: op.path, content: op.content }));

      setPhase("writing", `Creating ${files.length} files...`);
      appendTerminal(`📝 Writing ${files.length} files to sandbox...\n`);
      appendTerminal(`📋 Files: ${files.map(f => f.path).join(", ")}\n`);

      // Track files for persistence
      const newSavedFiles = { ...(savedFiles || {}) };
      for (const f of files) {
        newSavedFiles[f.path] = f.content;
      }
      setSavedFiles(newSavedFiles);

      if (!sandboxId) {
        // FIRST message — create sandbox
        setPhase("installing", "Creating sandbox...");
        appendTerminal("📦 Creating sandbox...\n");
        try {
          const result = await createSandbox(projectId, files);
          setSandboxId(result.sandboxId);
          setPreviewUrl(result.previewUrl);
          appendTerminal(`✅ Sandbox created! Preview: ${result.previewUrl}\n`);
          setPhase("ready");
          setBuildComplete(true);

          // Generate suggestions
          const filePaths = Object.keys(newSavedFiles);
          setCurrentFiles(filePaths);
          setSuggestions(generateSuggestions(filePaths));

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

          setFileRefresh((n) => n + 1);
          saveProject();
        } catch (err) {
          appendTerminal(`❌ Sandbox creation failed: ${err instanceof Error ? err.message : "Unknown error"}\n`);
          setPhase("error", err instanceof Error ? err.message : "Sandbox creation failed");
        }
      } else {
        // SUBSEQUENT messages — write files + restart vite
        try {
          appendTerminal("📝 Updating sandbox files...\n");
          const writeResult = await writeToSandbox(sandboxId, files);
          appendTerminal(`✅ Written: ${writeResult.written} files, verified: ${writeResult.verified}\n`);

          setPhase("starting", "Restarting dev server...");
          appendTerminal("🚀 Restarting Vite...\n");
          const viteResult = await restartVite(sandboxId);
          if (viteResult.previewUrl) {
            setPreviewUrl(viteResult.previewUrl);
          }
          appendTerminal(`✅ Vite restarted! Preview: ${viteResult.previewUrl}\n`);
          setPhase("ready");
          setBuildComplete(true);

          // Generate suggestions
          const filePaths = Object.keys(newSavedFiles);
          setCurrentFiles(filePaths);
          setSuggestions(generateSuggestions(filePaths));

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

          // Force reload iframe
          if (iframeRef.current && previewUrl) {
            iframeRef.current.src = previewUrl;
          }

          setFileRefresh((n) => n + 1);
          saveProject();
        } catch (err) {
          appendTerminal(`❌ Sandbox update failed: ${err instanceof Error ? err.message : "Unknown error"}\n`);
          setPhase("error", err instanceof Error ? err.message : "Sandbox update failed");
        }
      }
    } catch (err) {
      console.error("Send error:", err);
      setPhase("error", err instanceof Error ? err.message : "Unknown error");
      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
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
    if (!savedFiles) return;
    try {
      const zip = new JSZip();
      for (const [path, content] of Object.entries(savedFiles)) {
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
    if (!savedFiles || isDeploying) return;
    setIsDeploying(true);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: savedFiles, projectName: projectId }),
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

  const handleSuggestionSelect = (text: string) => {
    sendMessage(text);
  };

  // Convert messages to display messages for the new components
  const displayMessages: DisplayMessage[] = toDisplayMessages(messages);

  // Determine if we should show inline progress card
  const showProgressCard = isBusy && phase !== "streaming";

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

          <span className={cn("w-2 h-2 rounded-full", sandboxReady ? "bg-green-500" : "bg-amber-400 animate-pulse")} />
        </div>
      </header>

      {/* ── Main 3-Panel Layout ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Project Sidebar ── */}
        <ProjectSidebar />

        {/* ── CENTER: Chat Panel ── */}
        <div className="w-[340px] xl:w-[380px] flex flex-col border-r border-gray-100 shrink-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="flex flex-col gap-2.5">
              {messages.length === 0 && (
                <div className="text-center py-12 text-gray-400 text-xs">
                  Describe what you want to build...
                </div>
              )}
              {displayMessages.map((msg, i) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isLast={i === displayMessages.length - 1}
                  files={i === displayMessages.length - 1 && msg.role === "assistant" ? currentFiles : undefined}
                  suggestions={
                    i === displayMessages.length - 1 && msg.role === "assistant" && buildComplete
                      ? suggestions
                      : undefined
                  }
                  onSuggestionSelect={handleSuggestionSelect}
                />
              ))}

              {/* Inline Progress Card — shown during build phases */}
              {showProgressCard && (
                <ProgressCard
                  phase={phase}
                  detail={phaseDetail}
                  retryCount={retryCount}
                  terminalLines={terminalOutput}
                />
              )}

              {/* Thinking Indicator */}
              {isThinking && <ThinkingIndicator />}

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

          {/* Input area */}
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                  const recognition = new SR();
                  recognition.continuous = false;
                  recognition.interimResults = true;
                  recognition.lang = detectedLang.code === "hi" ? "hi-IN" : detectedLang.code === "gu" ? "gu-IN" : "en-US";
                  setIsListening(true);
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

            <ChatInput
              onSend={(text) => sendMessage(text)}
              isBusy={isBusy}
              wcReady={sandboxReady}
              hasMessages={messages.length > 0}
              value={input}
              onChange={setInput}
            />
          </div>
        </div>

        {/* ── RIGHT: Preview / Files / Console ── */}
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
                      iframeRef.current.contentWindow?.location.reload();
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
                    Your app preview will appear here
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
                      <div className="mt-3 text-xs text-gray-400">🔧 Auto-fix attempt {retryCount}/5</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Files */}
            <div className={cn("absolute inset-0", rightTab !== "files" && "hidden")}>
              <FileExplorer sandboxId={sandboxId} refreshTrigger={fileRefresh} />
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
