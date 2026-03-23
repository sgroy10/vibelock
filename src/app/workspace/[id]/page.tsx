"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";
import { getWebContainer } from "@/lib/webcontainer";
import { StreamParser, type VibeLockOp } from "@/lib/agent/parser";
import { executeOps, formatErrorForRetry } from "@/lib/agent/executor";
import { useWorkspaceStore } from "@/stores/workspace";
import type { WebContainer } from "@webcontainer/api";

type DrawerState = "collapsed" | "open";
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
  const [drawerState, setDrawerState] = useState<DrawerState>("open");
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

  // Boot WebContainer on mount
  useEffect(() => {
    getWebContainer().then((wc) => {
      wcRef.current = wc;
      setWcReady(true);

      wc.on("server-ready", (_port: number, url: string) => {
        setPreviewUrl(url);
        setPhase("ready");
        setDrawerState("collapsed");
      });
    });
  }, [setPhase, setPreviewUrl]);

  // Send initial prompt
  useEffect(() => {
    if (initialPrompt && messages.length === 0 && wcReady) {
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, wcReady]);

  // Scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamChat = useCallback(
    async (chatMessages: Message[]): Promise<{ text: string; ops: VibeLockOp[] }> => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatMessages, projectId }),
      });

      if (!res.ok) throw new Error(`Chat failed: ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      const parser = new StreamParser();
      let fullText = "";

      // Add empty assistant message to stream into
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        // Parse for operations
        const { text } = parser.feed(chunk);

        // Update the displayed message (text only, not tags)
        const displayText = parser.getAllText().trim();
        if (displayText) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: displayText,
            };
            return updated;
          });
        }
      }

      return { text: fullText, ops: parser.getAllOps() };
    },
    [projectId]
  );

  const sendMessage = async (text?: string) => {
    const content = text || input;
    if (!content.trim() || phase === "streaming") return;

    const userMsg: Message = { role: "user", content: content.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setDrawerState("open");
    setPhase("streaming");
    resetRetry();
    clearTerminal();

    try {
      // Stream AI response
      const { ops } = await streamChat(updatedMessages);

      if (ops.length === 0) {
        // No file operations — just a text response
        setPhase("idle");
        return;
      }

      // Execute operations in WebContainer
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
    setPhase("writing", `Creating ${ops.filter((o) => o.type === "file").length} files...`);

    const { errors } = await executeOps(
      wc,
      ops,
      (data) => appendTerminal(data),
      (p, detail) => setPhase(p as typeof phase, detail)
    );

    if (errors.length > 0 && attempt < MAX_RETRIES) {
      // Error detected — retry
      incrementRetry();
      const errorMsg = formatErrorForRetry(errors);
      appendTerminal(`\n⚠️ Error detected (attempt ${attempt + 1}/${MAX_RETRIES}). Auto-fixing...\n`);

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
      appendTerminal("\n❌ Could not fix errors after 3 attempts.\n");
    }
    // If no errors, the server-ready event will set phase to "ready"
  };

  const drawerHeight = drawerState === "collapsed" ? 120 : 420;

  return (
    <div className="h-screen flex flex-col bg-[var(--vl-bg)]">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 h-12 border-b border-[var(--vl-border)] bg-[var(--vl-bg)]/90 backdrop-blur-md shrink-0 z-10">
        <a href="/" className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)", color: "#fff" }}
          >
            V
          </div>
          <span
            className="text-sm font-semibold"
            style={{
              background: "linear-gradient(135deg, #FF8F3C, #FF6B2C)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            VibeLock
          </span>
        </a>

        {/* Status pill */}
        {phase !== "idle" && (
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background:
                phase === "ready"
                  ? "rgba(34,197,94,0.1)"
                  : phase === "error"
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(245,158,11,0.1)",
              border: `1px solid ${
                phase === "ready"
                  ? "rgba(34,197,94,0.2)"
                  : phase === "error"
                    ? "rgba(239,68,68,0.2)"
                    : "rgba(245,158,11,0.2)"
              }`,
              color:
                phase === "ready" ? "#22C55E" : phase === "error" ? "#EF4444" : "#F59E0B",
            }}
          >
            <span>{PHASE_LABELS[phase]?.icon}</span>
            <span>{phaseDetail || PHASE_LABELS[phase]?.label}</span>
          </div>
        )}

        {/* WebContainer status */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              wcReady ? "bg-[#22C55E]" : "bg-[#F59E0B] animate-pulse"
            )}
          />
          <span className="text-xs text-[var(--vl-text-muted)]">
            {wcReady ? "Sandbox ready" : "Booting..."}
          </span>
        </div>
      </header>

      {/* Stage — Preview area */}
      <div className="flex-1 relative" style={{ marginBottom: `${drawerHeight}px` }}>
        {/* Live preview iframe */}
        {previewUrl && (
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title="App Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        )}

        {/* Empty state */}
        {!previewUrl && phase === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255, 107, 44, 0.08)" }}
            >
              <span className="text-3xl">🖥️</span>
            </div>
            <div className="text-sm font-medium text-[var(--vl-text-muted)]">
              {wcReady
                ? "Your app preview will appear here"
                : "Starting sandbox..."}
            </div>
          </div>
        )}

        {/* Building progress overlay */}
        {!previewUrl && phase !== "idle" && phase !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-[400px] rounded-2xl p-6"
              style={{
                background: "rgba(13, 13, 15, 0.92)",
                backdropFilter: "blur(32px)",
                border: "1px solid rgba(255, 107, 44, 0.12)",
                boxShadow: "0 0 80px rgba(255, 107, 44, 0.06), 0 32px 64px rgba(0,0,0,0.5)",
              }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255, 107, 44, 0.12)" }}
                >
                  <span className="text-xl">{PHASE_LABELS[phase]?.icon || "✨"}</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {PHASE_LABELS[phase]?.label}
                  </div>
                  {phaseDetail && (
                    <div className="text-xs text-[var(--vl-text-muted)] mt-0.5">
                      {phaseDetail}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div
                className="h-1 rounded-full overflow-hidden mb-4"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width:
                      phase === "streaming" ? "30%" :
                      phase === "writing" ? "50%" :
                      phase === "installing" ? "70%" :
                      phase === "starting" ? "90%" :
                      phase === "error" ? "100%" : "10%",
                    background:
                      phase === "error"
                        ? "#EF4444"
                        : "linear-gradient(90deg, #FF6B2C, #FF8F3C)",
                  }}
                />
              </div>

              {/* Terminal output (last 5 lines) */}
              {terminalOutput.length > 0 && (
                <div
                  className="rounded-lg p-3 text-xs font-mono max-h-[120px] overflow-y-auto"
                  style={{ background: "rgba(0,0,0,0.3)", color: "#71717A" }}
                >
                  {terminalOutput.slice(-8).map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {retryCount > 0 && (
                <div className="mt-3 text-xs text-[var(--vl-text-muted)]">
                  🔧 Auto-fix attempt {retryCount}/{MAX_RETRIES}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chat Drawer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 flex flex-col"
        style={{
          height: `${drawerHeight}px`,
          transition: "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          background: "var(--vl-bg)",
          borderTop: "1px solid var(--vl-border)",
        }}
      >
        {/* Handle */}
        <button
          className="flex items-center justify-center py-2 shrink-0 hover:bg-[var(--vl-bg-card)] transition-colors"
          onClick={() => setDrawerState(drawerState === "collapsed" ? "open" : "collapsed")}
        >
          <div className="w-8 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
        </button>

        {/* Messages */}
        {drawerState === "open" && (
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            <div className="max-w-2xl mx-auto flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                    msg.role === "user"
                      ? "ml-auto bg-[rgba(255,107,44,0.1)] text-[var(--vl-text)]"
                      : "mr-auto bg-[var(--vl-bg-card)] text-[var(--vl-text-secondary)]"
                  )}
                >
                  {msg.content || (
                    <span className="text-[var(--vl-text-muted)] italic">Thinking...</span>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-3 shrink-0">
          <div
            className="max-w-2xl mx-auto relative rounded-xl overflow-hidden"
            style={{ background: "var(--vl-bg-card)", border: "1px solid var(--vl-border)" }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                phase === "idle" || phase === "ready"
                  ? "What would you like to build? (किसी भी भाषा में...)"
                  : "Wait for the current build to finish..."
              }
              disabled={isStreaming}
              className="w-full bg-transparent text-[var(--vl-text)] placeholder:text-[var(--vl-text-muted)] px-4 py-3 pr-20 text-sm resize-none outline-none disabled:opacity-50"
              rows={1}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming || !wcReady}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-30"
              style={{
                background:
                  input.trim() && !isStreaming
                    ? "linear-gradient(135deg, #FF6B2C, #FF8F3C)"
                    : "rgba(255,255,255,0.06)",
              }}
            >
              {isStreaming ? "Building..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
