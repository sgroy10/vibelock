/**
 * Cloudflare Container Sandbox Client
 * Replaces WebContainer with remote Cloudflare sandbox API calls.
 */

const SANDBOX_URL = "https://vibelock-sandbox.sgroy10.workers.dev";

export interface SandboxFile {
  path: string;
  content: string;
}

export interface CreateSandboxResult {
  sandboxId: string;
  previewUrl: string;
  viteReady?: boolean;
}

export interface WriteSandboxResult {
  written: number;
  verified: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RestartViteResult {
  success: boolean;
  previewUrl: string;
}

/**
 * Create a new sandbox with the given files.
 * Called on first message or when restoring a saved project.
 */
export async function createSandbox(
  projectId: string,
  files: SandboxFile[]
): Promise<CreateSandboxResult> {
  const res = await fetch(`${SANDBOX_URL}/api/sandbox/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, files }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sandbox create failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    sandboxId: data.sandboxId,
    previewUrl: data.previewUrl,
    viteReady: data.viteReady,
  };
}

/**
 * Write files to an existing sandbox.
 * Called on subsequent messages after the sandbox is already created.
 */
export async function writeToSandbox(
  sandboxId: string,
  files: SandboxFile[]
): Promise<WriteSandboxResult> {
  const res = await fetch(`${SANDBOX_URL}/api/sandbox/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sandboxId, files }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sandbox write failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { written: data.written, verified: data.verified };
}

/**
 * Execute a command in the sandbox.
 * Used for file explorer (ls, cat) and other operations.
 */
export async function execInSandbox(
  sandboxId: string,
  command: string
): Promise<ExecResult> {
  const res = await fetch(`${SANDBOX_URL}/api/sandbox/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sandboxId, command }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sandbox exec failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { stdout: data.stdout, stderr: data.stderr, exitCode: data.exitCode };
}

/**
 * Restart Vite dev server in the sandbox.
 * Called after writing new files to trigger a rebuild.
 */
export async function restartVite(
  sandboxId: string
): Promise<RestartViteResult> {
  const res = await fetch(`${SANDBOX_URL}/api/sandbox/restart-vite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sandboxId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sandbox restart-vite failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { success: data.success, previewUrl: data.previewUrl };
}
