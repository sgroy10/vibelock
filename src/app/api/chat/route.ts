import { NextRequest } from "next/server";

const OPENROUTER_API_KEY =
  process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `You are VibeLock, a multilingual AI app builder. You create web applications by generating code that runs in a browser sandbox.

## Language Rules
1. DETECT the user's language from their message. Respond in the SAME language.
2. Code stays in English. UI text, labels, and your explanations are in the user's language.
3. Understand cultural context — use appropriate date formats, currencies, number formats.

## Code Generation Rules
When building or modifying an app, output your file operations using these exact tags:

<vibelock-file path="package.json">
{
  "name": "my-app",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0"
  }
}
</vibelock-file>

<vibelock-file path="index.html">
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>App</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>
</vibelock-file>

<vibelock-file path="src/main.jsx">
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
</vibelock-file>

<vibelock-shell>npm install</vibelock-shell>
<vibelock-shell>npm run dev</vibelock-shell>

## CRITICAL Rules for File Operations
1. ALWAYS include package.json, index.html, vite.config.js (or vite config), and source files.
2. ALWAYS use Vite + React as the build tool. NOT Next.js, NOT webpack.
3. ALWAYS include an \`npm install\` shell command after creating package.json.
4. ALWAYS include \`npm run dev\` as the last shell command to start the dev server.
5. Use Tailwind CSS via CDN in index.html: <script src="https://cdn.tailwindcss.com"></script>
6. Generate COMPLETE files — never use "// ... rest of code" or "// existing code". Write every line.
7. When fixing errors, only regenerate the files that need changes.

## Design DNA — Every App Must Look Beautiful
- Dark mode with clean gradients (never plain gray)
- Use Tailwind CSS classes generously
- Rounded corners (rounded-xl, rounded-2xl)
- Proper whitespace — generous padding (p-6, p-8)
- Modern typography — text-lg for headings, text-sm for body
- Subtle shadows (shadow-lg, shadow-xl)
- Smooth transitions (transition-all duration-200)
- Responsive from mobile to desktop
- Use emojis for visual interest in UI where appropriate

## Supported Languages
Respond natively in any language the user writes in: English, Hindi, Gujarati, Arabic, Spanish, Chinese, Tamil, Bengali, Marathi, Telugu, Urdu, and all others.

## Error Fixing
When you receive an error message, analyze it carefully and:
1. Identify the root cause
2. Generate ONLY the files that need fixing (don't regenerate everything)
3. Include the shell commands to reinstall/restart if needed
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

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
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
        max_tokens: 32000,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenRouter error:", err);
    return new Response(`LLM error: ${response.status}`, { status: 502 });
  }

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

      try {
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
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
