import { WebContainer } from "@webcontainer/api";
import { GOLDEN_TEMPLATE } from "./golden-template";

let instance: WebContainer | null = null;
let booting: Promise<WebContainer> | null = null;
let templateReady = false;

/**
 * Boot WebContainer and pre-mount the golden template.
 * npm install runs immediately so it's cached before the user's first prompt.
 */
export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  if (booting) return booting;

  booting = WebContainer.boot().then(async (wc) => {
    instance = wc;
    booting = null;

    // Pre-mount the golden template
    await mountGoldenTemplate(wc);

    return wc;
  });

  return booting;
}

export function getWebContainerInstance(): WebContainer | null {
  return instance;
}

export function isTemplateReady(): boolean {
  return templateReady;
}

/** Mount golden template files and run npm install in background */
async function mountGoldenTemplate(wc: WebContainer): Promise<void> {
  // Write all template files
  for (const [path, content] of Object.entries(GOLDEN_TEMPLATE)) {
    const parts = path.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      try {
        await wc.fs.mkdir(dir, { recursive: true });
      } catch {
        // dir exists
      }
    }
    await wc.fs.writeFile(path, content);
  }

  // Run npm install in background — this caches node_modules
  // so the first user prompt doesn't wait for install
  try {
    const installProcess = await wc.spawn("npm", ["install"]);
    const exitCode = await installProcess.exit;
    if (exitCode === 0) {
      templateReady = true;
      console.log("[VibeLock] Golden template installed — node_modules cached");
    } else {
      console.warn("[VibeLock] Template npm install failed, will retry on first build");
    }
  } catch (err) {
    console.warn("[VibeLock] Template install error:", err);
  }
}

/**
 * Read all user-generated files from WebContainer (excluding node_modules, config files).
 * Used to build project context for the AI.
 */
export async function readProjectFiles(wc: WebContainer): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const SKIP_DIRS = new Set(["node_modules", ".git", ".vite", "dist"]);
  const SKIP_FILES = new Set([
    "package-lock.json",
    "postcss.config.js",
    "vite.config.js",
    "tailwind.config.js",
  ]);

  async function walk(dir: string) {
    try {
      const entries = await wc.fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = dir === "." ? entry.name : `${dir}/${entry.name}`;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else {
          if (SKIP_FILES.has(entry.name)) continue;
          try {
            const content = await wc.fs.readFile(fullPath, "utf-8");
            // Skip large files (>20KB) — likely generated/binary
            if (content.length <= 20_000) {
              files[fullPath] = content;
            }
          } catch {
            // skip binary files
          }
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  await walk(".");
  return files;
}
