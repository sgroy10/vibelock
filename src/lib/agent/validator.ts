/**
 * Post-generation validator — checks that all imports in generated files
 * resolve to actual files. If not, returns missing files so the AI can
 * generate them in a targeted follow-up.
 *
 * This is the fix for "AI plans 5 files but only 3 get written" —
 * instead of showing a broken app, we detect the missing files and
 * ask the AI to generate just those specific files.
 */

import type { WebContainer } from "@webcontainer/api";

export interface MissingImport {
  fromFile: string;
  importPath: string;
  resolvedPath: string;
}

/**
 * Check all .jsx/.tsx/.js/.ts files for imports that don't resolve.
 * Returns list of missing imports.
 */
export async function validateImports(wc: WebContainer): Promise<MissingImport[]> {
  const missing: MissingImport[] = [];
  const existingFiles = new Set<string>();

  // Build a set of all existing files
  async function collectFiles(dir: string) {
    try {
      const entries = await wc.fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const fullPath = dir === "." ? entry.name : `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          await collectFiles(fullPath);
        } else {
          existingFiles.add(fullPath);
        }
      }
    } catch { /* skip */ }
  }
  await collectFiles(".");

  // Check imports in all src/ files
  for (const filePath of existingFiles) {
    if (!filePath.startsWith("src/") || !/\.(jsx?|tsx?)$/.test(filePath)) continue;

    try {
      const content = await wc.fs.readFile(filePath, "utf-8");
      // Match: import X from "./path" or import X from '../path'
      const importRegex = /import\s+(?:[\w{}\s,*]+)\s+from\s+["'](\.[^"']+)["']/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // Resolve relative to the importing file's directory
        const dir = filePath.split("/").slice(0, -1).join("/");
        const resolved = resolveImport(dir, importPath);

        // Check if any extension variant exists
        const exists = [
          resolved,
          resolved + ".jsx",
          resolved + ".js",
          resolved + ".tsx",
          resolved + ".ts",
          resolved + "/index.jsx",
          resolved + "/index.js",
          resolved + "/index.tsx",
          resolved + "/index.ts",
        ].some((p) => existingFiles.has(p));

        if (!exists) {
          missing.push({
            fromFile: filePath,
            importPath,
            resolvedPath: resolved,
          });
        }
      }
    } catch { /* skip unreadable */ }
  }

  return missing;
}

/** Resolve a relative import path against a directory */
function resolveImport(fromDir: string, importPath: string): string {
  const parts = fromDir.split("/").filter(Boolean);
  const importParts = importPath.split("/");

  for (const part of importParts) {
    if (part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

/**
 * Format missing imports into a targeted prompt for the AI.
 * Much more effective than sending generic error output.
 */
export function formatMissingImports(missing: MissingImport[]): string {
  const fileList = missing
    .map((m) => `- "${m.importPath}" imported in ${m.fromFile} → expected at ${m.resolvedPath}.jsx`)
    .join("\n");

  return `The following files are imported but DO NOT EXIST. Create them now:\n\n${fileList}\n\nGenerate ONLY these missing files using <vibelock-file> tags. Do NOT regenerate files that already exist.`;
}
