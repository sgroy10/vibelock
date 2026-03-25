/**
 * Console Capture — injects a script into the WebContainer's index.html
 * that captures console.error/warn and posts them to the parent window.
 * This enables debug-first error recovery.
 */

export interface ConsoleLine {
  level: "error" | "warn" | "log";
  message: string;
  timestamp: number;
}

const MAX_CONSOLE_LINES = 50;

let consoleLines: ConsoleLine[] = [];
let listener: ((event: MessageEvent) => void) | null = null;

/** Start listening for console messages from the preview iframe */
export function startConsoleCapture() {
  consoleLines = [];

  if (listener) {
    window.removeEventListener("message", listener);
  }

  listener = (event: MessageEvent) => {
    if (event.data?.type === "vibelock-console") {
      const line: ConsoleLine = {
        level: event.data.level || "log",
        message: String(event.data.message || "").slice(0, 500),
        timestamp: Date.now(),
      };
      consoleLines.push(line);
      if (consoleLines.length > MAX_CONSOLE_LINES) {
        consoleLines = consoleLines.slice(-MAX_CONSOLE_LINES);
      }
    }
  };

  window.addEventListener("message", listener);
}

/** Stop listening */
export function stopConsoleCapture() {
  if (listener) {
    window.removeEventListener("message", listener);
    listener = null;
  }
}

/** Noise patterns to filter from console — these are NOT real app errors */
const NOISE_PATTERNS = [
  /websocket connection/i,
  /WebSocket handshake/i,
  /\[vite\] server connection lost/i,
  /\[vite\] connecting\.\.\./i,
  /\[vite\] Failed to reload/i,
  /\[vite\] page reload/i,
  /hmr/i,
  /hot update/i,
  /Empty response/i,
  /ERR_CONNECTION_REFUSED/i,
];

/** Get recent console errors/warnings for AI debugging (filtered) */
export function getConsoleErrors(): string {
  const errors = consoleLines
    .filter((l) => l.level === "error" || l.level === "warn")
    .filter((l) => !NOISE_PATTERNS.some((p) => p.test(l.message)));

  if (errors.length === 0) return "";

  return errors
    .slice(-10)
    .map((e) => `[${e.level.toUpperCase()}] ${e.message}`)
    .join("\n");
}

/** Clear captured logs */
export function clearConsoleLogs() {
  consoleLines = [];
}

/**
 * Script to inject into generated apps to capture console output.
 * This overrides console.error and console.warn to postMessage to parent.
 */
export const CONSOLE_CAPTURE_SCRIPT = `
<script>
(function() {
  const origError = console.error;
  const origWarn = console.warn;
  function post(level, args) {
    try {
      const msg = Array.from(args).map(a => {
        if (a instanceof Error) return a.message + '\\n' + (a.stack || '');
        if (typeof a === 'object') return JSON.stringify(a);
        return String(a);
      }).join(' ');
      window.parent.postMessage({ type: 'vibelock-console', level, message: msg }, '*');
    } catch(e) {}
  }
  console.error = function() { post('error', arguments); origError.apply(console, arguments); };
  console.warn = function() { post('warn', arguments); origWarn.apply(console, arguments); };
  window.addEventListener('error', function(e) {
    post('error', [e.message + ' at ' + e.filename + ':' + e.lineno]);
  });
  window.addEventListener('unhandledrejection', function(e) {
    post('error', ['Unhandled Promise: ' + (e.reason?.message || e.reason || 'unknown')]);
  });
})();
</script>`;
