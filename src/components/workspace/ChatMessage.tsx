"use client";

import type { DisplayMessage } from "@/lib/chat-types";
import ChatMarkdown from "@/components/workspace/ChatMarkdown";
import FileBadges from "@/components/workspace/FileBadges";
import SuggestionChips from "@/components/workspace/SuggestionChips";
import { cn } from "@/lib/cn";

interface ChatMessageProps {
  message: DisplayMessage;
  isLast: boolean;
  files?: string[];
  suggestions?: string[];
  onSuggestionSelect?: (text: string) => void;
}

export default function ChatMessage({
  message,
  isLast,
  files,
  suggestions,
  onSuggestionSelect,
}: ChatMessageProps) {
  // System messages — center-aligned, muted, no bubble
  const isSystem =
    message.type === "system" ||
    /^[\u2600-\u2BFF\uD83C-\uDBFF]/.test(message.content.trim());

  if (isSystem && message.role === "assistant") {
    return (
      <div className="text-center py-1">
        <span className="text-[12px] text-gray-400">{message.content}</span>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("max-w-[92%]", isUser ? "ml-auto" : "mr-auto")}>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
          isUser
            ? "bg-orange-50 text-gray-900 border border-orange-100"
            : "bg-gray-50 text-gray-700 border border-gray-100"
        )}
      >
        {message.content ? (
          isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <ChatMarkdown content={message.content} />
          )
        ) : (
          <span className="text-gray-400 italic">Thinking...</span>
        )}

        {/* File badges — shown on assistant messages when files exist */}
        {!isUser && files && files.length > 0 && <FileBadges files={files} />}
      </div>

      {/* Suggestion chips — shown on the last assistant message */}
      {!isUser && isLast && suggestions && suggestions.length > 0 && onSuggestionSelect && (
        <SuggestionChips suggestions={suggestions} onSelect={onSuggestionSelect} />
      )}
    </div>
  );
}
