// Extended message types for rich UI rendering
export type MessageType = "user" | "assistant" | "system" | "progress" | "file-summary" | "suggestion";

export interface DisplayMessage {
  id: string;
  type: MessageType;
  role: "user" | "assistant";
  content: string;
  files?: string[]; // file paths created/modified
  phase?: string; // build phase for progress cards
  suggestions?: string[]; // next step suggestions
  timestamp: number;
}

// Convert raw messages to display messages
export function toDisplayMessages(messages: { role: string; content: string }[]): DisplayMessage[] {
  return messages.map((m, i) => ({
    id: `msg-${i}`,
    type: m.role as MessageType,
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: Date.now(),
  }));
}
