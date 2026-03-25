/**
 * Stream parser for VibeLock AI output.
 *
 * The AI outputs structured operations using these markers:
 *   <vibelock-file path="src/App.tsx">...content...</vibelock-file>
 *   <vibelock-shell>npm install</vibelock-shell>
 *
 * This parser processes streaming text incrementally and emits
 * complete operations as they are detected.
 *
 * CRITICAL: Handles edge cases that cause file drops:
 * - Stream ending before closing tag (flush captures in-progress ops)
 * - Single quotes in path attribute
 * - Markdown code fences wrapping tags
 * - Extra whitespace in tags
 */

export interface FileOp {
  type: "file";
  path: string;
  content: string;
}

export interface ShellOp {
  type: "shell";
  command: string;
}

export type VibeLockOp = FileOp | ShellOp;

// Support both single and double quotes, flexible whitespace
const FILE_OPEN = /<vibelock-file\s+path=["']([^"']+)["']\s*>/;
const SHELL_OPEN = /<vibelock-shell\s*>/;

export class StreamParser {
  private buffer = "";
  private state: "text" | "file" | "shell" = "text";
  private currentPath = "";
  private currentContent = "";
  private ops: VibeLockOp[] = [];
  private textParts: string[] = [];

  /** Pre-process chunk: strip markdown code fences that wrap vibelock tags */
  private preprocess(chunk: string): string {
    // Remove markdown code fences that AI sometimes wraps around tags
    // e.g., ```xml\n<vibelock-file ...> or ```\n<vibelock-file ...>
    return chunk
      .replace(/```(?:xml|html|jsx|javascript|js|tsx|typescript|ts|text)?\s*\n?(?=<\/?vibelock-)/g, "")
      .replace(/(?<=<\/vibelock-(?:file|shell)>)\s*\n?```/g, "");
  }

  /** Feed a new chunk from the stream */
  feed(chunk: string): { ops: VibeLockOp[]; text: string } {
    this.buffer += this.preprocess(chunk);
    const newOps: VibeLockOp[] = [];
    let newText = "";

    while (this.buffer.length > 0) {
      if (this.state === "text") {
        const fileMatch = this.buffer.match(FILE_OPEN);
        const shellMatch = this.buffer.match(SHELL_OPEN);

        const fileIdx = fileMatch ? this.buffer.indexOf(fileMatch[0]) : -1;
        const shellIdx = shellMatch ? this.buffer.indexOf(shellMatch[0]) : -1;

        if (fileIdx === -1 && shellIdx === -1) {
          // No tags found — check for partial tag at end of buffer
          const partialIdx = this.buffer.lastIndexOf("<");
          if (partialIdx !== -1 && partialIdx > this.buffer.length - 100) {
            newText += this.buffer.slice(0, partialIdx);
            this.buffer = this.buffer.slice(partialIdx);
          } else {
            newText += this.buffer;
            this.buffer = "";
          }
          break;
        }

        const useFile =
          fileIdx !== -1 && (shellIdx === -1 || fileIdx < shellIdx);

        if (useFile && fileMatch) {
          newText += this.buffer.slice(0, fileIdx);
          this.state = "file";
          this.currentPath = fileMatch[1];
          this.currentContent = "";
          this.buffer = this.buffer.slice(fileIdx + fileMatch[0].length);
        } else if (shellMatch && shellIdx !== -1) {
          newText += this.buffer.slice(0, shellIdx);
          this.state = "shell";
          this.currentContent = "";
          this.buffer = this.buffer.slice(shellIdx + shellMatch[0].length);
        }
      } else if (this.state === "file") {
        const closeIdx = this.buffer.indexOf("</vibelock-file>");
        if (closeIdx !== -1) {
          this.currentContent += this.buffer.slice(0, closeIdx);
          // Clean file content: strip code fences and leading whitespace
          let content = this.currentContent;
          content = content.replace(/^```(?:jsx|tsx|js|ts|javascript|typescript|html|css|json|xml|text)?\s*\n/, "");
          content = content.replace(/\n```\s*$/, "");
          // Remove leading blank lines (AI often puts newline after opening tag)
          content = content.replace(/^\n+/, "");
          const op: FileOp = {
            type: "file",
            path: this.currentPath,
            content,
          };
          newOps.push(op);
          this.ops.push(op);
          this.buffer = this.buffer.slice(closeIdx + "</vibelock-file>".length);
          this.state = "text";
        } else {
          // Tag not yet closed, accumulate and wait for more data
          this.currentContent += this.buffer;
          this.buffer = "";
          break;
        }
      } else if (this.state === "shell") {
        const closeIdx = this.buffer.indexOf("</vibelock-shell>");
        if (closeIdx !== -1) {
          this.currentContent += this.buffer.slice(0, closeIdx);
          const op: ShellOp = {
            type: "shell",
            command: this.currentContent.trim(),
          };
          newOps.push(op);
          this.ops.push(op);
          this.buffer = this.buffer.slice(closeIdx + "</vibelock-shell>".length);
          this.state = "text";
        } else {
          this.currentContent += this.buffer;
          this.buffer = "";
          break;
        }
      }
    }

    if (newText) {
      this.textParts.push(newText);
    }

    return { ops: newOps, text: newText };
  }

  /**
   * CRITICAL: Call this after the stream ends.
   * Captures any in-progress file/shell that was never closed
   * (e.g., AI response was truncated or closing tag was malformed).
   * This prevents file drops.
   */
  flush(): VibeLockOp[] {
    const flushed: VibeLockOp[] = [];

    if (this.state === "file" && this.currentPath) {
      // We have an unclosed file — save it anyway
      const content = this.currentContent + this.buffer;
      // Strip any trailing partial closing tags
      const cleaned = content
        .replace(/<\/vibelock-file\s*$/, "")
        .replace(/<\/vibelock-f\s*$/, "")
        .replace(/<\/vibelock\s*$/, "")
        .replace(/<\/vibe\s*$/, "")
        .replace(/<\/\s*$/, "")
        .replace(/<\s*$/, "");

      if (cleaned.trim()) {
        const op: FileOp = {
          type: "file",
          path: this.currentPath,
          content: cleaned,
        };
        flushed.push(op);
        this.ops.push(op);
      }
    } else if (this.state === "shell" && this.currentContent.trim()) {
      const op: ShellOp = {
        type: "shell",
        command: this.currentContent.trim(),
      };
      flushed.push(op);
      this.ops.push(op);
    }

    // Also try to extract any ops from remaining buffer text
    // (handles case where closing tag was malformed but content is there)
    if (this.buffer) {
      const remainingFileMatches = this.buffer.matchAll(
        /<vibelock-file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/vibelock-file>/g
      );
      for (const match of remainingFileMatches) {
        const op: FileOp = { type: "file", path: match[1], content: match[2] };
        flushed.push(op);
        this.ops.push(op);
      }
    }

    this.state = "text";
    this.buffer = "";
    this.currentContent = "";
    this.currentPath = "";

    return flushed;
  }

  /** Get all operations parsed so far */
  getAllOps(): VibeLockOp[] {
    return [...this.ops];
  }

  /** Get all plain text (non-operation) content, with any leaked tags stripped */
  getAllText(): string {
    return StreamParser.cleanText(this.textParts.join(""));
  }

  /** Strip any vibelock tags that leaked through the parser */
  static cleanText(text: string): string {
    return text
      .replace(/<vibelock-file[^>]*>[\s\S]*?<\/vibelock-file>/g, "")
      .replace(/<vibelock-shell>[\s\S]*?<\/vibelock-shell>/g, "")
      .replace(/<vibelock-file[^>]*>/g, "")
      .replace(/<\/vibelock-file>/g, "")
      .replace(/<vibelock-shell>/g, "")
      .replace(/<\/vibelock-shell>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /** Reset parser state */
  reset() {
    this.buffer = "";
    this.state = "text";
    this.currentPath = "";
    this.currentContent = "";
    this.ops = [];
    this.textParts = [];
  }
}
