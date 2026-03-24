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

/** Strip vibelock tags AND any code content from display text */
function cleanDisplay(text: string): string {
  let clean = text;
  // Remove complete tags with content
  clean = clean.replace(/<vibelock-file[^>]*>[\s\S]*?<\/vibelock-file>/g, "");
  clean = clean.replace(/<vibelock-shell>[\s\S]*?<\/vibelock-shell>/g, "");
  // Remove incomplete tags (during streaming, closing tag hasn't arrived yet)
  clean = clean.replace(/<vibelock-file[^>]*>[\s\S]*/g, "");
  clean = clean.replace(/<vibelock-shell>[\s\S]*/g, "");
  // Remove any remaining tag fragments
  clean = clean.replace(/<\/?vibelock-[^>]*>/g, "");
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  return clean;
}
import { executeOps, formatErrorForRetry } from "@/lib/agent/executor";
import { startConsoleCapture, getConsoleErrors, clearConsoleLogs } from "@/lib/console-capture";
import { useWorkspaceStore } from "@/stores/workspace";
import type { WebContainer } from "@webcontainer/api";

type Message = { role: "user" | "assistant"; content: string };

const MAX_RETRIES = 3;

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
  const secrets = useSecretsStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wcRef = useRef<WebContainer | null>(null);
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

  // Start listening for console errors from preview iframe
  useEffect(() => {
    startConsoleCapture();
    return () => {}; // cleanup handled by startConsoleCapture internally
  }, []);

  useEffect(() => {
    setPhase("installing", "Setting up sandbox...");
    getWebContainer().then((wc) => {
      wcRef.current = wc;
      setWcReady(true);
      setTemplateInstalled(isTemplateReady());
      setPhase("idle");

      wc.on("server-ready", (_port: number, url: string) => {
        setPreviewUrl(url);
        setPhase("ready");
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
      });
    });
  }, [setPhase, setPreviewUrl]);

  useEffect(() => {
    if (initialPrompt && messages.length === 0 && wcReady) {
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, wcReady]);

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

    // Only run npm install if there are new deps or template wasn't pre-installed
    if (hasFiles && !hasInstall && (hasNewDeps || !isTemplateReady())) {
      ops.push({ type: "shell", command: "npm install" });
    }
    if (hasFiles && !hasDev) ops.push({ type: "shell", command: "npm run dev" });

    const fileCount = ops.filter((o) => o.type === "file").length;
    setPhase("writing", `Creating ${fileCount} files...`);
    appendTerminal(`📝 Writing ${fileCount} files...\n`);

    const { errors } = await executeOps(
      wc, ops,
      (data) => appendTerminal(data),
      (p, detail) => setPhase(p as typeof phase, detail),
      secrets.getAllEnvVars()
    );

    if (errors.length === 0) {
      // Wait for dev server — poll for up to 45 seconds
      appendTerminal("⏳ Waiting for dev server...\n");
      const getStore = useWorkspaceStore.getState;
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (getStore().previewUrl) {
          appendTerminal("✅ Dev server is ready!\n");
          return;
        }
      }
      // If still no preview after 45s, something might be wrong but don't error out
      if (!getStore().previewUrl) {
        appendTerminal("⚠️ Dev server is taking long. It may still start...\n");
        setPhase("starting", "Server is still starting...");
      }
    }

    if (errors.length > 0 && attempt < MAX_RETRIES) {
      incrementRetry();
      // Debug-first: collect console errors from the preview iframe
      const consoleErrors = getConsoleErrors();
      const errorMsg = formatErrorForRetry(errors, consoleErrors);
      clearConsoleLogs();
      appendTerminal(`\n⚠️ Error (attempt ${attempt + 1}/${MAX_RETRIES}). Auto-fixing...\n`);
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
      const blob = new Blob([JSON.stringify(files, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vibelock-project.json";
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
                  {msg.content || <span className="text-gray-400 italic">Thinking...</span>}
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
          </div>

          {/* Tab content */}
          <div className="flex-1 relative overflow-hidden">
            {/* Preview */}
            <div className={cn("absolute inset-0", rightTab !== "preview" && "hidden")}>
              {previewUrl && (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0 bg-white"
                  title="App Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
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
