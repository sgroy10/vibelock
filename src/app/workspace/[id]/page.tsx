"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";
import { getWebContainer } from "@/lib/webcontainer";
import { StreamParser, type VibeLockOp } from "@/lib/agent/parser";

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

  useEffect(() => {
    getWebContainer().then((wc) => {
      wcRef.current = wc;
      setWcReady(true);
      wc.on("server-ready", (_port: number, url: string) => {
        setPreviewUrl(url);
        setPhase("ready");
        // Add completion message
        setMessages((prev) => {
          const updated = [...prev];
          // Update the last assistant message to show completion
          if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
            const existing = updated[updated.length - 1].content;
            if (existing === "Building your app..." || !existing.includes("ready")) {
              updated[updated.length - 1] = {
                role: "assistant",
                content: "Your app is ready! Check the preview on the left. You can continue describing changes below.",
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
    const hasInstall = ops.some((o) => o.type === "shell" && o.command.includes("install"));
    const hasDev = ops.some((o) => o.type === "shell" && (o.command.includes("dev") || o.command.includes("start")));
    const hasFiles = ops.some((o) => o.type === "file");

    if (hasFiles && !hasInstall) ops.push({ type: "shell", command: "npm install" });
    if (hasFiles && !hasDev) ops.push({ type: "shell", command: "npm run dev" });

    const fileCount = ops.filter((o) => o.type === "file").length;
    setPhase("writing", `Creating ${fileCount} files...`);
    appendTerminal(`📝 Writing ${fileCount} files...\n`);

    const { errors } = await executeOps(
      wc, ops,
      (data) => appendTerminal(data),
      (p, detail) => setPhase(p as typeof phase, detail)
    );

    if (errors.length === 0) {
      // Wait for dev server — poll for up to 45 seconds
      appendTerminal("⏳ Waiting for dev server...\n");
      const store = useWorkspaceStore.getState;
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (store().previewUrl) {
          appendTerminal("✅ Dev server is ready!\n");
          return;
        }
      }
      // If still no preview after 45s, something might be wrong but don't error out
      if (!store().previewUrl) {
        appendTerminal("⚠️ Dev server is taking long. It may still start...\n");
        setPhase("starting", "Server is still starting...");
      }
    }

    if (errors.length > 0 && attempt < MAX_RETRIES) {
      incrementRetry();
      const errorMsg = formatErrorForRetry(errors);
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

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 h-12 border-b border-gray-100 bg-white shrink-0 z-10">
        <a href="/" className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
          >
            V
          </div>
          <span className="text-sm font-semibold text-gray-900">VibeLock</span>
        </a>

        {/* Status pill */}
        <div className="flex items-center gap-3">
          {phase !== "idle" && (
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
                phase === "ready" ? "bg-green-50 text-green-700 border border-green-100" :
                phase === "error" ? "bg-red-50 text-red-700 border border-red-100" :
                "bg-amber-50 text-amber-700 border border-amber-100"
              )}
            >
              <span>{PHASE_LABELS[phase]?.icon}</span>
              <span>{phaseDetail || PHASE_LABELS[phase]?.label}</span>
            </div>
          )}

          {/* Open in new tab */}
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors border border-gray-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              New tab
            </a>
          )}

          <span className={cn("w-2 h-2 rounded-full", wcReady ? "bg-green-500" : "bg-amber-400 animate-pulse")} />
        </div>
      </header>

      {/* Main content: Preview + Chat side by side on desktop, stacked on mobile */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Preview Area */}
        <div className="flex-1 relative border-b lg:border-b-0 lg:border-r border-gray-100 min-h-[40vh]">
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
                {wcReady ? "Your app preview will appear here" : "Starting sandbox..."}
              </div>
            </div>
          )}

          {/* Building progress */}
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

        {/* Chat Panel */}
        <div className="w-full lg:w-[400px] xl:w-[440px] flex flex-col bg-white shrink-0 h-[40vh] lg:h-full">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[90%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
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

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t border-gray-100 shrink-0">
            <div className="relative rounded-xl overflow-hidden bg-white border border-gray-200">
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
                placeholder={isBusy ? "Building..." : "Describe what you want to build or change...\n(किसी भी भाषा में लिख सकते हैं)"}
                disabled={isBusy}
                className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 px-4 py-3 pr-20 text-sm resize-none outline-none disabled:opacity-50"
                style={{ minHeight: "80px" }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isBusy || !wcReady}
                className="absolute right-2 bottom-2 px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-30 shadow-sm"
                style={{
                  background: input.trim() && !isBusy ? "linear-gradient(135deg, #FF6B2C, #FF8F3C)" : "#E5E7EB",
                }}
              >
                {isBusy ? "..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
