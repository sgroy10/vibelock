"use client";

import { useState, useEffect, useCallback } from "react";
import { execInSandbox } from "@/lib/sandbox-client";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileNode[];
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".vite", "dist"]);

const FILE_ICONS: Record<string, string> = {
  jsx: "⚛",
  tsx: "⚛",
  js: "📜",
  ts: "📜",
  css: "🎨",
  html: "🌐",
  json: "📋",
  md: "📝",
  svg: "🖼",
  png: "🖼",
  jpg: "🖼",
};

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || "📄";
}

async function buildTree(sandboxId: string, dir: string): Promise<FileNode[]> {
  try {
    const result = await execInSandbox(sandboxId, `ls -la /workspace/app/${dir === "." ? "" : dir}`);
    if (result.exitCode !== 0) return [];

    const lines = result.stdout.split("\n").filter(Boolean);
    const nodes: FileNode[] = [];

    for (const line of lines) {
      // Parse ls -la output: permissions links owner group size date name
      const parts = line.trim().split(/\s+/);
      if (parts.length < 9) continue;
      const name = parts.slice(8).join(" ");
      if (!name || name === "." || name === "..") continue;
      if (SKIP_DIRS.has(name)) continue;

      const isDir = line.startsWith("d");
      const fullPath = dir === "." ? name : `${dir}/${name}`;

      if (isDir) {
        const children = await buildTree(sandboxId, fullPath);
        nodes.push({ name, path: fullPath, type: "dir", children });
      } else {
        nodes.push({ name, path: fullPath, type: "file" });
      }
    }

    // Sort: dirs first, then files, alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

function FileTreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.type === "dir") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="text-[10px] text-gray-400">{expanded ? "▼" : "▶"}</span>
          <span>📁</span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors truncate ${
        selectedFile === node.path
          ? "bg-orange-50 text-orange-700"
          : "text-gray-600 hover:bg-gray-50"
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span>{getFileIcon(node.name)}</span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default function FileExplorer({
  sandboxId,
  refreshTrigger,
  onFileSelect,
}: {
  sandboxId: string | null;
  refreshTrigger: number;
  onFileSelect?: (path: string, content: string) => void;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sandboxId) return;
    const nodes = await buildTree(sandboxId, ".");
    setTree(nodes);
  }, [sandboxId]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshTrigger]);

  const handleSelect = async (path: string) => {
    if (!sandboxId) return;
    setSelectedFile(path);
    try {
      const result = await execInSandbox(sandboxId, `cat /workspace/app/${path}`);
      const content = result.exitCode === 0 ? result.stdout : "(unable to read file)";
      setFileContent(content);
      onFileSelect?.(path, content);
    } catch {
      setFileContent("(unable to read file)");
    }
  };

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400">
        No files yet
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedFile={selectedFile}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* File preview */}
      {selectedFile && fileContent !== null && (
        <div className="border-t border-gray-100 max-h-[40%] flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 text-[10px] text-gray-500">
            <span className="truncate">{selectedFile}</span>
            <button
              onClick={() => { setSelectedFile(null); setFileContent(null); }}
              className="text-gray-400 hover:text-gray-600 ml-2"
            >
              ✕
            </button>
          </div>
          <pre className="flex-1 overflow-auto px-3 py-2 text-[11px] font-mono text-gray-700 bg-gray-50/50 leading-relaxed">
            {fileContent}
          </pre>
        </div>
      )}
    </div>
  );
}
