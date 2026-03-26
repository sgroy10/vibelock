"use client";

interface FileBadgesProps {
  files: string[];
  action?: "created" | "modified";
}

function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "jsx":
    case "tsx":
      return "\u269B"; // atom symbol
    case "js":
    case "ts":
      return "\uD83D\uDCDC"; // scroll
    case "css":
    case "scss":
      return "\uD83C\uDFA8"; // palette
    case "json":
      return "\uD83D\uDCCB"; // clipboard
    default:
      return "\uD83D\uDCC4"; // page
  }
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

export default function FileBadges({ files, action = "created" }: FileBadgesProps) {
  if (!files || files.length === 0) return null;

  if (files.length > 4) {
    return (
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
          {"\uD83D\uDCC4"} {files.length} files {action}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {files.map((file) => (
        <span
          key={file}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200"
          title={file}
        >
          {getFileIcon(file)} {basename(file)}
        </span>
      ))}
    </div>
  );
}
