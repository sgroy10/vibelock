"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type DrawerState = "collapsed" | "open";

export default function WorkspacePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") || "";
  const projectId = params.id as string;

  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [drawerState, setDrawerState] = useState<DrawerState>("open");
  const [hasPreview, setHasPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Send initial prompt if coming from landing page
  useEffect(() => {
    if (initialPrompt && messages.length === 0) {
      sendMessage(initialPrompt);
    }
  }, [initialPrompt]);

  const sendMessage = async (text?: string) => {
    const content = text || input;
    if (!content.trim() || isStreaming) return;

    const userMsg = { role: "user" as const, content: content.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setDrawerState("open");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          projectId,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantContent,
          };
          return updated;
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const drawerHeight = drawerState === "collapsed" ? 120 : 400;

  return (
    <div className="h-screen flex flex-col bg-[var(--vl-bg)]">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 h-12 border-b border-[var(--vl-border)] bg-[var(--vl-bg)]/90 backdrop-blur-md shrink-0">
        <a href="/" className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
            style={{
              background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)",
              color: "#fff",
            }}
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
        <div className="flex items-center gap-3">
          {isStreaming && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                color: "#F59E0B",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]"
                style={{
                  animation: "pulse-dot 1.5s ease-in-out infinite",
                }}
              />
              Building...
            </div>
          )}
          {!isStreaming && hasPreview && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.2)",
                color: "#22C55E",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              Ready
            </div>
          )}
        </div>
      </header>

      {/* Stage — Preview area */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{ marginBottom: `${drawerHeight}px` }}
      >
        {/* Empty state */}
        {!hasPreview && !isStreaming && messages.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255, 107, 44, 0.08)" }}
            >
              <span className="text-3xl" style={{ color: "#3F3F46" }}>
                🖥️
              </span>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-[var(--vl-text-muted)]">
                Your app preview will appear here
              </div>
              <div className="text-xs mt-1 text-[#3F3F46]">
                Describe what you want to build below
              </div>
            </div>
          </div>
        )}

        {/* Building progress */}
        {isStreaming && !hasPreview && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-[380px] rounded-2xl p-6"
              style={{
                background: "rgba(13, 13, 15, 0.9)",
                backdropFilter: "blur(32px)",
                border: "1px solid rgba(255, 107, 44, 0.12)",
                boxShadow:
                  "0 0 80px rgba(255, 107, 44, 0.06), 0 32px 64px rgba(0,0,0,0.5)",
              }}
            >
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(255, 107, 44, 0.12)" }}
                >
                  <span className="text-xl">✨</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    VibeLock is building
                  </div>
                  <div className="text-xs text-[var(--vl-text-muted)] mt-0.5">
                    Designing your app...
                  </div>
                </div>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: "40%",
                    background:
                      "linear-gradient(90deg, #FF6B2C, #FF8F3C)",
                    animation: "progress-pulse 2s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TODO: WebContainer iframe preview will go here */}
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
          className="flex items-center justify-center py-2 shrink-0 hover:bg-[var(--vl-bg-card)] transition-colors cursor-pointer"
          onClick={() =>
            setDrawerState(drawerState === "collapsed" ? "open" : "collapsed")
          }
        >
          <div
            className="w-8 h-1 rounded-full"
            style={{ background: "rgba(255, 255, 255, 0.12)" }}
          />
        </button>

        {/* Messages */}
        {drawerState === "open" && (
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            <div className="max-w-2xl mx-auto flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "ml-auto bg-[rgba(255,107,44,0.1)] text-[var(--vl-text)]"
                      : "mr-auto bg-[var(--vl-bg-card)] text-[var(--vl-text-secondary)]"
                  )}
                >
                  {msg.content || (
                    <span className="text-[var(--vl-text-muted)]">
                      Thinking...
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-3 shrink-0">
          <div
            className="max-w-2xl mx-auto relative rounded-xl overflow-hidden"
            style={{
              background: "var(--vl-bg-card)",
              border: "1px solid var(--vl-border)",
            }}
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
              placeholder="What would you like to change?"
              className="w-full bg-transparent text-[var(--vl-text)] placeholder:text-[var(--vl-text-muted)] px-4 py-3 pr-20 text-sm resize-none outline-none"
              rows={1}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-30"
              style={{
                background:
                  input.trim() && !isStreaming
                    ? "linear-gradient(135deg, #FF6B2C, #FF8F3C)"
                    : "rgba(255,255,255,0.06)",
              }}
            >
              {isStreaming ? "Stop" : "Send"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes progress-pulse {
          0% { width: 15%; }
          50% { width: 65%; }
          100% { width: 15%; }
        }
      `}</style>
    </div>
  );
}
