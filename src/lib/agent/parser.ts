/**
 * Stream parser for VibeLock AI output.
 *
 * The AI outputs structured operations using these markers:
 *   <vibelock-file path="src/App.tsx">...content...</vibelock-file>
 *   <vibelock-shell>npm install</vibelock-shell>
 *
 * This parser processes streaming text incrementally and emits
 * complete operations as they are detected.
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

const FILE_OPEN = /<vibelock-file\s+path="([^"]+)">/;
const FILE_CLOSE = /<\/vibelock-file>/;
const SHELL_OPEN = /<vibelock-shell>/;
const SHELL_CLOSE = /<\/vibelock-shell>/;

export class StreamParser {
  private buffer = "";
  private state: "text" | "file" | "shell" = "text";
  private currentPath = "";
  private currentContent = "";
  private ops: VibeLockOp[] = [];
  private textParts: string[] = [];

  /** Feed a new chunk from the stream */
  feed(chunk: string): { ops: VibeLockOp[]; text: string } {
    this.buffer += chunk;
    const newOps: VibeLockOp[] = [];
    let newText = "";

    while (this.buffer.length > 0) {
      if (this.state === "text") {
        // Look for opening tags
        const fileMatch = this.buffer.match(FILE_OPEN);
        const shellMatch = this.buffer.match(SHELL_OPEN);

        // Find earliest match
        const fileIdx = fileMatch ? this.buffer.indexOf(fileMatch[0]) : -1;
        const shellIdx = shellMatch ? this.buffer.indexOf(shellMatch[0]) : -1;

        if (fileIdx === -1 && shellIdx === -1) {
          // No tags found — check if buffer might contain a partial tag
          const partialIdx = this.buffer.lastIndexOf("<");
          if (partialIdx !== -1 && partialIdx > this.buffer.length - 30) {
            // Might be a partial tag, keep it in buffer
            newText += this.buffer.slice(0, partialIdx);
            this.buffer = this.buffer.slice(partialIdx);
          } else {
            newText += this.buffer;
            this.buffer = "";
          }
          break;
        }

        // Determine which tag comes first
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
          const op: FileOp = {
            type: "file",
            path: this.currentPath,
            content: this.currentContent,
          };
          newOps.push(op);
          this.ops.push(op);
          this.buffer = this.buffer.slice(closeIdx + "</vibelock-file>".length);
          this.state = "text";
        } else {
          // Tag not yet closed, accumulate and wait
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
          this.buffer = this.buffer.slice(
            closeIdx + "</vibelock-shell>".length
          );
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

  /** Get all operations parsed so far */
  getAllOps(): VibeLockOp[] {
    return [...this.ops];
  }

  /** Get all plain text (non-operation) content */
  getAllText(): string {
    return this.textParts.join("");
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
