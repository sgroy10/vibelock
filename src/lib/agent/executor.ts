/**
 * Executor — writes files to WebContainer and runs shell commands.
 * Captures stdout/stderr for error detection and retry.
 */

import type { WebContainer } from "@webcontainer/api";
import type { FileOp, ShellOp, VibeLockOp } from "./parser";

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  op: VibeLockOp;
}

/** Write a file to WebContainer, creating directories as needed */
async function writeFile(wc: WebContainer, op: FileOp): Promise<ExecutionResult> {
  try {
    // Ensure parent directories exist
    const parts = op.path.split("/");
    if (parts.length > 1) {
      let dir = "";
      for (let i = 0; i < parts.length - 1; i++) {
        dir += (i > 0 ? "/" : "") + parts[i];
        try {
          await wc.fs.mkdir(dir, { recursive: true });
        } catch {
          // directory may already exist
        }
      }
    }

    await wc.fs.writeFile(op.path, op.content);
    return { success: true, output: `Created ${op.path}`, error: "", op };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to write ${op.path}: ${msg}`, op };
  }
}

/** Run a shell command in WebContainer and capture output */
async function runShell(
  wc: WebContainer,
  op: ShellOp,
  onOutput?: (data: string) => void
): Promise<ExecutionResult> {
  try {
    const parts = op.command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);

    const process = await wc.spawn(cmd, args);

    let stdout = "";
    let stderr = "";

    // Capture output
    const outputStream = new WritableStream({
      write(data) {
        stdout += data;
        onOutput?.(data);
      },
    });

    process.output.pipeTo(outputStream).catch(() => {});

    const exitCode = await process.exit;

    if (exitCode !== 0) {
      return {
        success: false,
        output: stdout,
        error: stderr || stdout, // npm often puts errors in stdout
        op,
      };
    }

    return { success: true, output: stdout, error: "", op };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Shell error: ${msg}`, op };
  }
}

/** Execute a batch of operations sequentially */
export async function executeOps(
  wc: WebContainer,
  ops: VibeLockOp[],
  onOutput?: (data: string) => void,
  onProgress?: (phase: string, detail: string) => void
): Promise<{ results: ExecutionResult[]; errors: ExecutionResult[] }> {
  const results: ExecutionResult[] = [];
  const errors: ExecutionResult[] = [];

  // First: write all files
  const fileOps = ops.filter((op): op is FileOp => op.type === "file");
  const shellOps = ops.filter((op): op is ShellOp => op.type === "shell");

  if (fileOps.length > 0) {
    onProgress?.("writing", `Creating ${fileOps.length} files...`);
  }

  for (const op of fileOps) {
    const result = await writeFile(wc, op);
    results.push(result);
    if (!result.success) errors.push(result);
  }

  // Then: run shell commands
  for (const op of shellOps) {
    const isInstall = op.command.includes("install");
    const isDev = op.command.includes("dev") || op.command.includes("start");

    if (isInstall) {
      onProgress?.("installing", "Installing packages...");
    } else if (isDev) {
      onProgress?.("starting", "Starting your app...");
    } else {
      onProgress?.("running", op.command);
    }

    const result = await runShell(wc, op, onOutput);
    results.push(result);
    if (!result.success) errors.push(result);

    // Don't continue shell commands if one fails (except dev server which stays running)
    if (!result.success && !isDev) break;
  }

  return { results, errors };
}

/** Format errors for sending back to the AI for retry */
export function formatErrorForRetry(errors: ExecutionResult[]): string {
  const errorMessages = errors
    .map((e) => {
      const opDesc =
        e.op.type === "file"
          ? `File: ${e.op.path}`
          : `Command: ${e.op.command}`;
      return `${opDesc}\nError: ${e.error.slice(0, 500)}`;
    })
    .join("\n\n");

  return `The following errors occurred while building the app. Please fix them:\n\n${errorMessages}\n\nGenerate the corrected files using <vibelock-file> and <vibelock-shell> tags.`;
}
