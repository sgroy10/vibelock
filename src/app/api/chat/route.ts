import { NextRequest } from "next/server";

const OPENROUTER_API_KEY = process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are VibeLock, a multilingual AI app builder. You help users create web applications by generating code.

## Core Rules
1. DETECT the user's language from their message. Respond in the SAME language.
2. Generate modern, beautiful web apps using React + Tailwind CSS.
3. Every app must look polished by default — gradients, proper spacing, modern typography.
4. Code stays in English. UI labels, text content, and your explanations are in the user's language.
5. Keep responses concise. Show the code, explain briefly.

## When generating an app, output file operations in this format:
\`\`\`vibelock-ops
{"op":"create","path":"src/App.tsx","content":"..."}
{"op":"create","path":"src/index.css","content":"..."}
{"op":"shell","command":"npm install some-package"}
\`\`\`

## Design DNA
- Dark mode by default with clean light mode option
- Use Inter or system fonts
- Gradient accents (never plain gray buttons)
- Proper whitespace — generous padding
- Rounded corners (rounded-xl, rounded-2xl)
- Subtle shadows and borders
- Responsive from mobile to desktop
- Micro-interactions on hover/click

## Supported Languages
Respond natively in: English, Hindi (हिन्दी), Gujarati (ગુજરાતી), Arabic (العربية), Spanish (Español), Chinese (中文), and any other language the user writes in.
`;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  if (!OPENROUTER_API_KEY) {
    return new Response("OpenRouter API key not configured", { status: 500 });
  }

  const openRouterMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vibelock.in",
      "X-Title": "VibeLock",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: openRouterMessages,
      stream: true,
      max_tokens: 16000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenRouter error:", err);
    return new Response(`LLM error: ${response.status}`, { status: 502 });
  }

  // Stream the response back
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        controller.close();
        return;
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
