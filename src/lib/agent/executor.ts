/**
 * Executor — writes files to WebContainer and runs shell commands.
 * Captures stdout/stderr for error detection and retry.
 */

import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import type { FileOp, ShellOp, VibeLockOp } from "./parser";

/** Track the running dev server process so we can kill it before restart */
let devServerProcess: WebContainerProcess | null = null;

/** Kill the running dev server if one exists */
export async function killDevServer(): Promise<void> {
  if (devServerProcess) {
    try {
      devServerProcess.kill();
    } catch {
      // process may already be dead
    }
    devServerProcess = null;
  }
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  op: VibeLockOp;
}

/** Safely merge AI's package.json with the golden template's package.json */
async function mergePackageJson(wc: WebContainer, aiContent: string): Promise<string> {
  try {
    // Read the current (working) package.json from WebContainer
    const existing = await wc.fs.readFile("package.json", "utf-8");
    const existingPkg = JSON.parse(existing);

    // Try to parse AI's package.json
    let aiPkg;
    try {
      // Clean markdown/tags before parsing
      const cleaned = aiContent
        .replace(/^```(?:json)?\s*\n/g, "")
        .replace(/\n```\s*$/g, "")
        .replace(/<\/?vibelock-[^>]*>/g, "")
        .trim();
      aiPkg = JSON.parse(cleaned);
    } catch {
      // AI's JSON is corrupted — just extract dependency names and merge
      const depMatches = aiContent.matchAll(/"([\w@/-]+)"\s*:\s*"([^"]+)"/g);
      const newDeps: Record<string, string> = {};
      for (const m of depMatches) {
        if (!["name", "private", "type", "version"].includes(m[1]) && !m[1].startsWith("@vitejs")) {
          newDeps[m[1]] = m[2];
        }
      }
      if (Object.keys(newDeps).length > 0) {
        existingPkg.dependencies = { ...existingPkg.dependencies, ...newDeps };
      }
      return JSON.stringify(existingPkg, null, 2);
    }

    // Merge dependencies from AI into existing
    if (aiPkg.dependencies) {
      existingPkg.dependencies = { ...existingPkg.dependencies, ...aiPkg.dependencies };
    }
    if (aiPkg.devDependencies) {
      existingPkg.devDependencies = { ...existingPkg.devDependencies, ...aiPkg.devDependencies };
    }
    return JSON.stringify(existingPkg, null, 2);
  } catch {
    // If everything fails, return the AI content as-is (last resort)
    return aiContent;
  }
}

/** Write a file to WebContainer, creating directories as needed */
async function writeFile(wc: WebContainer, op: FileOp): Promise<ExecutionResult> {
  try {
    // Safety: strip leaked vibelock tags, markdown code fences from content
    const cleanPath = op.path.replace(/<\/?vibelock-[^>]*>/g, "").trim();
    let cleanContent = op.content;
    // Strip markdown code fences
    cleanContent = cleanContent.replace(/^```(?:jsx|tsx|js|ts|javascript|typescript|html|css|json|xml|text|markdown|md)?\s*\n/g, "");
    cleanContent = cleanContent.replace(/\n```\s*$/g, "");
    cleanContent = cleanContent.replace(/<\/?vibelock-[^>]*>/g, "");
    cleanContent = cleanContent.replace(/```(?:jsx|tsx|js|ts|javascript|typescript|html|css|json)?\s*\n/g, "");
    cleanContent = cleanContent.replace(/\n```\n/g, "\n");

    // Special handling for package.json — MERGE deps instead of replacing
    if (cleanPath === "package.json") {
      cleanContent = await mergePackageJson(wc, cleanContent);
    }

    const parts = cleanPath.split("/");
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

    await wc.fs.writeFile(cleanPath, cleanContent);
    return { success: true, output: `Created ${cleanPath}`, error: "", op };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Failed to write ${op.path.replace(/<[^>]*>/g, "")}: ${msg}`, op };
  }
}

/** Run a shell command in WebContainer and capture output */
async function runShell(
  wc: WebContainer,
  op: ShellOp,
  onOutput?: (data: string) => void
): Promise<ExecutionResult> {
  try {
    // Safety: strip any leaked vibelock tags from command
    const cleanCmd = op.command
      .replace(/<\/?vibelock-[^>]*>/g, "")
      .replace(/```/g, "")
      .trim();

    const parts = cleanCmd.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);

    // Detect if this is a long-running dev server command
    const isDevServer =
      cleanCmd.includes("run dev") ||
      cleanCmd.includes("run start") ||
      cleanCmd.includes("vite");

    // Kill old dev server before starting a new one
    if (isDevServer) {
      await killDevServer();
    }

    const proc = await wc.spawn(cmd, args);

    let stdout = "";

    const outputStream = new WritableStream({
      write(data) {
        stdout += data;
        onOutput?.(data);
      },
    });

    proc.output.pipeTo(outputStream).catch(() => {});

    if (isDevServer) {
      // Track the dev server process so we can kill it later
      devServerProcess = proc;
      // Wait a few seconds for initial startup errors
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return { success: true, output: stdout, error: "", op };
    }

    // For regular commands (npm install, etc.), wait for exit
    const exitCode = await proc.exit;

    if (exitCode !== 0) {
      return {
        success: false,
        output: stdout,
        error: stdout, // npm puts errors in stdout
        op,
      };
    }

    return { success: true, output: stdout, error: "", op };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: `Shell error: ${msg}`, op };
  }
}

/** Write a .env file to WebContainer with user's API keys */
export async function injectEnvVars(
  wc: WebContainer,
  envVars: Record<string, string>
): Promise<void> {
  if (Object.keys(envVars).length === 0) return;
  const envContent = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  await wc.fs.writeFile(".env", envContent);
}

/** Execute a batch of operations sequentially */
export async function executeOps(
  wc: WebContainer,
  ops: VibeLockOp[],
  onOutput?: (data: string) => void,
  onProgress?: (phase: string, detail: string) => void,
  envVars?: Record<string, string>
): Promise<{ results: ExecutionResult[]; errors: ExecutionResult[] }> {
  const results: ExecutionResult[] = [];
  const errors: ExecutionResult[] = [];

  // First: write all files
  const fileOps = ops.filter((op): op is FileOp => op.type === "file");
  const shellOps = ops.filter((op): op is ShellOp => op.type === "shell");

  // Inject env vars before writing files
  if (envVars && Object.keys(envVars).length > 0) {
    await injectEnvVars(wc, envVars);
    onProgress?.("writing", "Injecting API keys...");
  }

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

/** Classify an error for targeted fix instructions */
function classifyError(error: string): { type: string; instruction: string } {
  const e = error.toLowerCase();

  if (e.includes("failed to resolve import") || e.includes("module not found") || e.includes("cannot find module")) {
    const importMatch = error.match(/import\s+["']([^"']+)["']/i) || error.match(/resolve\s+(?:import\s+)?["']([^"']+)["']/i);
    const missingPath = importMatch?.[1] || "unknown";
    return {
      type: "missing-import",
      instruction: `MISSING FILE: The import "${missingPath}" does not exist. Either create the missing file with <vibelock-file> or fix the import path in the file that imports it. Check that all file paths match exactly.`,
    };
  }

  if (e.includes("syntaxerror") || e.includes("unexpected token") || e.includes("parsing error")) {
    return {
      type: "syntax-error",
      instruction: "SYNTAX ERROR: There is a JavaScript/JSX syntax error. Regenerate the broken file with COMPLETE, valid code. Do not use partial code or placeholders.",
    };
  }

  if (e.includes("is not defined") || e.includes("is not a function") || e.includes("cannot read properties of")) {
    return {
      type: "runtime-error",
      instruction: "RUNTIME ERROR: A variable, function, or property is used but not defined. Check your imports and make sure all functions and variables are properly declared.",
    };
  }

  if (e.includes("npm err") || e.includes("enoent") || e.includes("could not resolve")) {
    return {
      type: "dependency-error",
      instruction: "DEPENDENCY ERROR: An npm package is missing or failed to install. Add it to package.json dependencies and include <vibelock-shell>npm install</vibelock-shell>.",
    };
  }

  return {
    type: "unknown",
    instruction: "Fix the error. Regenerate ONLY the broken files with complete code.",
  };
}

/** Format errors for sending back to the AI for retry */
export function formatErrorForRetry(errors: ExecutionResult[], consoleErrors?: string): string {
  // Classify each error for targeted fix instructions
  const classified = errors.map((e) => {
    const opDesc = e.op.type === "file" ? `File: ${e.op.path}` : `Command: ${e.op.command}`;
    const { type, instruction } = classifyError(e.error);
    return `${opDesc}\nError type: ${type}\nError: ${e.error.slice(0, 400)}\nFix: ${instruction}`;
  });

  let msg = `Build errors occurred. Fix them precisely:\n\n${classified.join("\n\n")}`;

  if (consoleErrors) {
    msg += `\n\nBrowser console errors:\n${consoleErrors}`;
  }

  msg += `\n\nREMEMBER: Read <project-context> to see all current files. Only regenerate files that need fixing. Use <vibelock-file> and <vibelock-shell> tags.`;

  return msg;
}
