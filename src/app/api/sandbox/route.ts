import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "e2b";

/**
 * E2B Sandbox API — manages cloud sandboxes for code execution.
 * Each project gets a real Linux VM with filesystem, Node.js, and Vite.
 * Preview URL: https://{sandboxId}-5173.e2b.dev (real subdomain, works in iframe)
 *
 * POST /api/sandbox { action: "create" | "write" | "exec" | "restart", ... }
 */

const E2B_API_KEY = process.env.E2B_API_KEY;

// Keep track of active sandboxes (in-memory)
// Keyed by BOTH projectId and sandboxId for lookup from either
const sandboxes = new Map<string, Sandbox>();
const sandboxIdMap = new Map<string, Sandbox>(); // sandboxId → Sandbox

// Golden template files
const TEMPLATE_FILES: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "app", private: true, type: "module",
    scripts: { dev: "vite --host 0.0.0.0 --port 5173", build: "vite build" },
    dependencies: { react: "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^7.1.1", "lucide-react": "^0.475.0" },
    devDependencies: { "@vitejs/plugin-react": "^4.3.4", vite: "^6.0.0", tailwindcss: "^3.4.0", postcss: "^8.4.0", autoprefixer: "^10.4.0" }
  }, null, 2),
  "vite.config.js": `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 5173, allowedHosts: true } })\n`,
  "postcss.config.js": `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }\n`,
  "tailwind.config.js": `export default { content: ['./index.html', './src/**/*.{js,jsx}'], theme: { extend: { fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] } } }, plugins: [] }\n`,
  "index.html": `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>App</title></head>\n<body class="bg-white text-gray-900 min-h-screen font-sans"><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>\n</html>\n`,
  "src/index.css": `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
  "src/main.jsx": `import { createRoot } from 'react-dom/client'\nimport App from './App'\nimport './index.css'\ncreateRoot(document.getElementById('root')).render(<App />)\n`,
  "src/App.jsx": `export default function App() {\n  return <div className="min-h-screen flex items-center justify-center"><h1 className="text-3xl font-bold">Ready</h1></div>\n}\n`,
};

async function getOrCreateSandbox(projectId: string): Promise<Sandbox> {
  const existing = sandboxes.get(projectId);
  if (existing) {
    try {
      // Check if still alive
      await existing.commands.run("echo ok", { timeoutMs: 5000 });
      return existing;
    } catch {
      sandboxes.delete(projectId);
    }
  }

  // Create new sandbox
  const sandbox = await Sandbox.create({
    apiKey: E2B_API_KEY!,
    timeoutMs: 1_800_000, // 30 min timeout
  });
  sandboxes.set(projectId, sandbox);
  sandboxIdMap.set(sandbox.sandboxId, sandbox);
  return sandbox;
}

export async function POST(req: NextRequest) {
  if (!E2B_API_KEY) {
    return NextResponse.json({ error: "E2B API key not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { projectId, files } = body as {
        projectId: string;
        files: { path: string; content: string }[];
      };

      const sandbox = await getOrCreateSandbox(projectId);

      // Write template files
      for (const [path, content] of Object.entries(TEMPLATE_FILES)) {
        const dir = path.includes("/") ? path.split("/").slice(0, -1).join("/") : null;
        if (dir) await sandbox.files.makeDir(dir).catch(() => {});
        await sandbox.files.write(path, content);
      }

      // Write user files
      if (files?.length) {
        for (const f of files) {
          const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : null;
          if (dir) await sandbox.files.makeDir(dir).catch(() => {});
          await sandbox.files.write(f.path, f.content);
        }
      }

      // Install deps
      const install = await sandbox.commands.run("npm install", { timeoutMs: 120_000 });
      if (install.exitCode !== 0) {
        return NextResponse.json({
          error: "npm install failed",
          stderr: install.stderr?.slice(-500),
        }, { status: 500 });
      }

      // Start Vite dev server in background using nohup
      await sandbox.commands.run("nohup npx vite --host 0.0.0.0 --port 5173 > /tmp/vite.log 2>&1 &", { timeoutMs: 5000 }).catch(() => {});

      // Wait for Vite to be ready
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const check = await sandbox.commands.run(
          "curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 2>/dev/null || echo 0",
          { timeoutMs: 5000 }
        ).catch(() => ({ stdout: "0" }));
        if (check.stdout?.includes("200")) break;
      }

      // E2B preview URL — real subdomain, works everywhere
      const previewUrl = `https://${sandbox.getHost(5173)}`;

      return NextResponse.json({
        sandboxId: sandbox.sandboxId,
        previewUrl,
        filesWritten: Object.keys(TEMPLATE_FILES).length + (files?.length || 0),
      });
    }

    if (action === "write") {
      const { sandboxId, files } = body as {
        sandboxId: string;
        files: { path: string; content: string }[];
      };

      // Find sandbox by ID
      const sandbox = sandboxIdMap.get(sandboxId);
      if (!sandbox) {
        return NextResponse.json({ error: "Sandbox not found: " + sandboxId }, { status: 404 });
      }

      let written = 0;
      for (const f of files) {
        const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : null;
        if (dir) await sandbox.files.makeDir(dir).catch(() => {});
        await sandbox.files.write(f.path, f.content);
        written++;
      }

      // Auto-restart Vite after writing files
      await sandbox.commands.run("pkill -f vite 2>/dev/null; sleep 1", { timeoutMs: 10000 }).catch(() => {});
      await sandbox.commands.run("nohup npx vite --host 0.0.0.0 --port 5173 > /tmp/vite.log 2>&1 &", { timeoutMs: 5000 }).catch(() => {});

      // Wait for Vite ready
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const check = await sandbox.commands.run(
          "curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 2>/dev/null || echo 0",
          { timeoutMs: 5000 }
        ).catch(() => ({ stdout: "0" }));
        if (check.stdout?.includes("200")) break;
      }

      const previewUrl = `https://${sandbox.getHost(5173)}`;
      return NextResponse.json({ written, verified: written, previewUrl });
    }

    if (action === "restart") {
      const { sandboxId } = body as { sandboxId: string };

      let sandbox: Sandbox | undefined;
      for (const [, sb] of sandboxes) {
        if (sb.sandboxId === sandboxId) { sandbox = sb; break; }
      }
      if (!sandbox) {
        return NextResponse.json({ error: "Sandbox not found" }, { status: 404 });
      }

      // Kill old Vite and restart
      await sandbox.commands.run("pkill -f vite 2>/dev/null; sleep 1", { timeoutMs: 10000 }).catch(() => {});
      await sandbox.commands.run("nohup npx vite --host 0.0.0.0 --port 5173 > /tmp/vite.log 2>&1 &", { timeoutMs: 5000 }).catch(() => {});

      // Wait for ready
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const check = await sandbox.commands.run(
          "curl -s -o /dev/null -w '%{http_code}' http://localhost:5173 2>/dev/null || echo 0",
          { timeoutMs: 5000 }
        ).catch(() => ({ stdout: "0" }));
        if (check.stdout?.includes("200")) break;
      }

      const previewUrl = `https://${sandbox.getHost(5173)}`;
      return NextResponse.json({ previewUrl });
    }

    if (action === "exec") {
      const { sandboxId, command } = body as { sandboxId: string; command: string };

      let sandbox: Sandbox | undefined;
      for (const [, sb] of sandboxes) {
        if (sb.sandboxId === sandboxId) { sandbox = sb; break; }
      }
      if (!sandbox) {
        return NextResponse.json({ error: "Sandbox not found" }, { status: 404 });
      }

      const result = await sandbox.commands.run(command, { timeoutMs: 30_000 });
      return NextResponse.json({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Sandbox API error:", err);
    return NextResponse.json({
      error: "Sandbox operation failed",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
