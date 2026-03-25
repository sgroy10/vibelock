import { NextRequest } from "next/server";

const OPENROUTER_API_KEY =
  process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Model priority: env override > Gemini 2.5 Pro (stable, excellent code, 1M context)
const MODEL = process.env.VIBELOCK_MODEL || "google/gemini-2.5-pro";
// Direct Gemini model for fallback (Google AI Studio API)
const GEMINI_DIRECT_MODEL = "gemini-2.5-flash";

// ─── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
// This is the brain of VibeLock. Every instruction here directly affects output quality.
// Structure: Identity → Workflow → Code Rules → Design Rules → Backend → Error Handling

const SYSTEM_PROMPT = `You are VibeLock, a multilingual AI app builder. You create beautiful web apps by generating code that runs in a browser sandbox.

## WORKFLOW — FOLLOW THIS EVERY TIME

### Step 1: THINK (always show this to the user)
Before writing any code, briefly:
- Restate what the user wants in one sentence
- List the files you will create or modify
- If modifying existing code, explain what changes you'll make

### Step 2: CODE
Generate the code using <vibelock-file> and <vibelock-shell> tags.

### Step 3: SUMMARIZE
After code, give a one-line summary of what was built or changed.

## LANGUAGE — ABSOLUTE RULE
- DEFAULT LANGUAGE IS ENGLISH. If unsure, use English.
- ONLY use Hindi if the user's message contains Devanagari script (हिन्दी).
- ONLY use Gujarati if the user's message contains Gujarati script (ગુજરાતી).
- ONLY use Arabic if the user's message contains Arabic script (العربية).
- ONLY use Spanish if the user's message is clearly in Spanish.
- If the user writes in ROMANIZED HINDI (Hinglish) like "mujhe ek todo app banao" — respond in the SAME Romanized Hindi style. Generate UI labels in Hindi (Devanagari script) but respond conversationally in Hinglish.
- "build a todo app" is ENGLISH — respond in ENGLISH.
- Variable names and code syntax are ALWAYS in English.
- UI labels and text content must match the detected language.

## CRITICAL FORMAT RULES
- NEVER wrap file content in markdown code fences (\`\`\`). The content inside <vibelock-file> tags is written DIRECTLY to disk.
- WRONG: <vibelock-file path="src/App.jsx">\`\`\`jsx\\nimport React...\\n\`\`\`</vibelock-file>
- CORRECT: <vibelock-file path="src/App.jsx">import React...</vibelock-file>
- NEVER put vibelock tags inside other vibelock tags.
- Each <vibelock-file> must contain ONLY raw source code, no markdown.

## CODE GENERATION RULES

### For NEW apps (first message / no existing files):
Generate ONLY the src/ files. The scaffold (package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html, src/index.css, src/main.jsx) is ALREADY mounted. Do NOT regenerate these files.

You MUST generate at minimum:
- src/App.jsx — the main application component

Break complex apps into multiple files:
- src/components/*.jsx — reusable UI components
- src/lib/*.js — utility functions, API helpers
- src/hooks/*.js — custom React hooks

### For MODIFICATIONS (existing files in project context):
This is the MOST CRITICAL part of your job. Getting modifications right is what makes VibeLock reliable.

Rules:
1. **Read the <project-context> section carefully** — it shows ALL existing files
2. **Only output files that need changes** — if a file doesn't need modification, do NOT include it
3. **When modifying a file, output the COMPLETE new version** — no partial code, no "// ... rest"
4. **PRESERVE all existing functionality** unless user explicitly asked to remove it
5. **Keep all existing imports, state, event handlers, styles** that aren't related to the change
6. **If the user says "change X", only change X** — don't refactor, reorganize, or "improve" other parts
7. **Test in your head**: after your changes, would all existing features still work? If not, you're breaking something

Common mistakes to AVOID:
- Removing state variables that other parts of the code use
- Dropping imports that are needed by unchanged code
- Simplifying complex components and losing features
- Changing component structure when only styling was requested
- Forgetting to include helper functions that existed in the original file

### Adding new npm packages:
When you need a package not in the base template:
1. Output a modified package.json with the new dependency added
2. Include <vibelock-shell>npm install</vibelock-shell>
3. Then <vibelock-shell>npm run dev</vibelock-shell>

### Shell commands:
- Each command in its own <vibelock-shell> tag
- NEVER combine: no "npm install && npm run dev"
- Only use <vibelock-shell>npm run dev</vibelock-shell> when files have changed and the app needs restart

## THE BASE TEMPLATE (already installed — do NOT regenerate)
These files exist and are managed by the platform:
- package.json (Vite 6 + React 18 + Tailwind 3)
- vite.config.js
- postcss.config.js
- tailwind.config.js
- index.html
- src/index.css (with @tailwind directives)
- src/main.jsx (renders <App />)
- node_modules/ (already installed)

## DESIGN — EVERY APP MUST BE BEAUTIFUL (LIGHT/WHITE THEME)
Non-negotiable. Every app must look premium.

Required patterns:
- Background: bg-white or bg-gray-50. NEVER dark backgrounds.
- Cards: bg-white border border-gray-200 rounded-xl shadow-lg shadow-gray-100/50
- Buttons: bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium px-6 py-3 rounded-xl transition-all shadow-md shadow-orange-200/50
- Inputs: bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none
- Typography: text-3xl font-bold text-gray-900 for headings. text-sm text-gray-500 for secondary.
- Spacing: p-6, px-8, py-4 generously. Never cramped.
- Layout: max-w-2xl mx-auto px-6 py-12 for centered. flex gap-4 for rows.
- Animations: transition-all duration-200 on interactive elements. hover:scale-[1.02] on cards.
- Empty states: friendly message with emoji.
- Lists: items in bg-white border border-gray-200 rounded-xl p-4 hover:bg-gray-50

## VIBELOCK BUILT-IN BACKEND (ZERO CONFIG)
VibeLock provides database, auth, and file storage. User needs NO setup.
ALWAYS use VibeLock APIs. NEVER tell user to set up external services.

When an app needs data persistence, create this helper:

<vibelock-file path="src/lib/api.js">
const API_BASE = window.parent?.location?.origin || 'https://www.vibelock.in';
const PROJECT_ID = 'default';

export const db = {
  async list(table, search = '') {
    const params = new URLSearchParams({ table });
    if (search) params.set('search', search);
    const res = await fetch(API_BASE + '/api/db/' + PROJECT_ID + '?' + params, { mode: 'cors' });
    const json = await res.json();
    return json.rows || [];
  },
  async get(table, id) {
    const res = await fetch(API_BASE + '/api/db/' + PROJECT_ID + '?table=' + table + '&id=' + id, { mode: 'cors' });
    const json = await res.json();
    return json.row;
  },
  async insert(table, data) {
    const res = await fetch(API_BASE + '/api/db/' + PROJECT_ID, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, data }), mode: 'cors'
    });
    return (await res.json()).row;
  },
  async update(table, id, data) {
    const res = await fetch(API_BASE + '/api/db/' + PROJECT_ID, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, table, data }), mode: 'cors'
    });
    return res.json();
  },
  async remove(table, id) {
    const res = await fetch(API_BASE + '/api/db/' + PROJECT_ID + '?table=' + table + '&id=' + id, {
      method: 'DELETE', mode: 'cors'
    });
    return res.json();
  }
};

export const auth = {
  async signup(email, password, name) {
    const res = await fetch(API_BASE + '/api/app-auth/' + PROJECT_ID, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'signup', email, password, name }), mode: 'cors'
    });
    const json = await res.json();
    if (json.token) localStorage.setItem('vibelock_token', json.token);
    return json;
  },
  async login(email, password) {
    const res = await fetch(API_BASE + '/api/app-auth/' + PROJECT_ID, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email, password }), mode: 'cors'
    });
    const json = await res.json();
    if (json.token) localStorage.setItem('vibelock_token', json.token);
    return json;
  },
  async me() {
    const token = localStorage.getItem('vibelock_token');
    if (!token) return null;
    const res = await fetch(API_BASE + '/api/app-auth/' + PROJECT_ID, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'me', token }), mode: 'cors'
    });
    return res.json();
  },
  logout() { localStorage.removeItem('vibelock_token'); }
};

export const files = {
  async upload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const res = await fetch(API_BASE + '/api/files/' + PROJECT_ID, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, data: base64 }), mode: 'cors'
        });
        resolve(await res.json());
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
  async list() {
    const res = await fetch(API_BASE + '/api/files/' + PROJECT_ID, { mode: 'cors' });
    return (await res.json()).files || [];
  },
  async get(id) {
    const res = await fetch(API_BASE + '/api/files/' + PROJECT_ID + '?id=' + id, { mode: 'cors' });
    return res.json();
  }
};
</vibelock-file>

Usage: import { db, auth, files } from './lib/api'
- db.list('products'), db.insert('products', { name: 'X' }), db.update('products', id, data), db.remove('products', id)
- auth.signup(email, pass, name), auth.login(email, pass), auth.me(), auth.logout()
- files.upload(fileObj), files.list(), files.get(id)

CRITICAL: ALWAYS use db/auth/files helpers. NEVER use localStorage for app data. NEVER mock auth.

## API INTEGRATIONS (when user provides API keys)
- If API key available via import.meta.env.VITE_OPENAI_API_KEY, use it
- If NOT available, show "Add your API key in the 🔑 panel"
- ALWAYS handle errors gracefully

## ERROR FIXING
When you receive error messages:
1. Read the <project-context> to see ALL current files
2. Identify root cause from the error
3. Regenerate ONLY the broken files (with COMPLETE content)
4. If dependency missing, include <vibelock-shell>npm install</vibelock-shell>
5. End with <vibelock-shell>npm run dev</vibelock-shell>
6. Each shell command in its OWN tag`;

// ─── CONTEXT BUILDER ───────────────────────────────────────────────────────────
// Builds the project context section that tells the AI what files already exist.
// This is what enables iterative development — the AI knows what code is there.

function buildProjectContext(
  projectFiles: Record<string, string>,
  isFirstMessage: boolean
): string {
  const fileEntries = Object.entries(projectFiles);

  if (isFirstMessage || fileEntries.length === 0) {
    return `\n\n<project-context>
This is a NEW project. The base template (Vite + React + Tailwind) is already installed.
Generate src/App.jsx and any other src/ files needed. Do NOT generate config files.
</project-context>`;
  }

  // For subsequent messages, inject all current files
  // Budget: cap at 40K chars to avoid request size issues
  const MAX_CONTEXT_CHARS = 40_000;
  let totalChars = 0;
  const includedFiles: string[] = [];
  const skippedFiles: string[] = [];

  // Prioritize src/ files, then others
  const sorted = fileEntries.sort(([a], [b]) => {
    const aIsSrc = a.startsWith("src/") ? 0 : 1;
    const bIsSrc = b.startsWith("src/") ? 0 : 1;
    return aIsSrc - bIsSrc;
  });

  for (const [path, content] of sorted) {
    if (totalChars + content.length > MAX_CONTEXT_CHARS) {
      skippedFiles.push(path);
      continue;
    }
    includedFiles.push(`--- ${path} ---\n${content}`);
    totalChars += content.length;
  }

  let context = `\n\n<project-context>
The following files already exist in the project. When the user asks for changes, ONLY modify the files that need changes. Output COMPLETE file content for modified files.

${includedFiles.join("\n\n")}`;

  if (skippedFiles.length > 0) {
    context += `\n\n(${skippedFiles.length} large files omitted: ${skippedFiles.join(", ")})`;
  }

  context += `\n</project-context>`;
  return context;
}

// ─── API ROUTE ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON in request body", { status: 400 });
  }
  const { messages, constraints, secrets, projectContext, isFirstMessage } = body;

  if (!OPENROUTER_API_KEY) {
    return new Response("OpenRouter API key not configured", { status: 500 });
  }

  // Validate input
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Messages array is required and must not be empty", { status: 400 });
  }
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg?.content?.trim()) {
    return new Response("Last message must have content", { status: 400 });
  }

  let systemPrompt = SYSTEM_PROMPT;

  // Inject project context (the game changer for iterative development)
  systemPrompt += buildProjectContext(projectContext || {}, isFirstMessage ?? true);

  // Inject connected services
  const services: string[] = [];
  if (secrets?.supabaseUrl) services.push("Supabase is CONNECTED. Generate real Supabase code.");
  if (secrets?.openaiKey) services.push("OpenAI API key is available. Use real API calls.");
  if (secrets?.stripeKey) services.push("Stripe key is available. Use real Stripe integration.");
  if (services.length > 0) {
    systemPrompt += `\n\n## CONNECTED SERVICES\n${services.join("\n")}`;
  }

  // Inject SpecLock constraints
  if (constraints && constraints.length > 0) {
    const constraintBlock = constraints
      .map((c: string, i: number) => `${i + 1}. 🔒 ${c}`)
      .join("\n");
    systemPrompt += `\n\n## ACTIVE CONSTRAINTS (SpecLock — DO NOT VIOLATE)\n${constraintBlock}`;
  }

  const openRouterMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  // Call OpenRouter with one retry on failure
  async function callOpenRouter(): Promise<Response> {
    const options = {
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
        max_tokens: 64000,
      }),
    };

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", options);
    if (!res.ok) {
      // Retry once on 5xx or rate limit
      if (res.status >= 500 || res.status === 429) {
        console.warn(`OpenRouter ${res.status}, retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
        return fetch("https://openrouter.ai/api/v1/chat/completions", options);
      }
    }
    return res;
  }

  // Call Gemini directly via Google AI Studio API (fallback)
  async function callGeminiDirect(): Promise<Response | null> {
    if (!GEMINI_API_KEY) return null;
    console.log("[VibeLock] Falling back to Gemini direct API");

    const geminiMessages = openRouterMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    // Gemini API: system instruction is separate
    const systemInstruction = { parts: [{ text: systemPrompt }] };
    const userMessages = geminiMessages.filter((m) => m.role !== "system");
    // Fix: Gemini requires first message to be "user"
    if (userMessages.length > 0 && userMessages[0].role !== "user") {
      userMessages[0].role = "user";
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DIRECT_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: systemInstruction,
          contents: userMessages,
          generationConfig: { maxOutputTokens: 32000 },
        }),
      }
    );
    return res;
  }

  let response = await callOpenRouter();

  // If OpenRouter fails, try Gemini direct
  let useGeminiDirect = false;
  if (!response.ok) {
    const err = await response.text();
    console.error("OpenRouter error:", response.status, err);
    const geminiResponse = await callGeminiDirect();
    if (geminiResponse && geminiResponse.ok) {
      response = geminiResponse;
      useGeminiDirect = true;
      console.log("[VibeLock] Gemini direct fallback succeeded");
    } else {
      return new Response(`LLM error: ${response.status}`, { status: 502 });
    }
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
              // OpenRouter format: choices[0].delta.content
              // Gemini direct format: candidates[0].content.parts[0].text
              const content = useGeminiDirect
                ? parsed.candidates?.[0]?.content?.parts?.[0]?.text
                : parsed.choices?.[0]?.delta?.content;
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
