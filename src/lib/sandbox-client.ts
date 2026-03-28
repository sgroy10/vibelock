/**
 * E2B Sandbox Client — calls VibeLock's sandbox API.
 * Preview URL: https://{sandboxId}-5173.e2b.dev (real subdomain, works in iframe)
 */

export async function createSandbox(
  projectId: string,
  files: { path: string; content: string }[]
): Promise<{ sandboxId: string; previewUrl: string }> {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", projectId, files }),
  });
  if (!res.ok) throw new Error(`Sandbox create failed: ${await res.text()}`);
  return res.json();
}

export async function writeToSandbox(
  sandboxId: string,
  files: { path: string; content: string }[]
): Promise<{ written: number; verified: number }> {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "write", sandboxId, files }),
  });
  if (!res.ok) throw new Error("Write failed");
  return res.json();
}

export async function restartVite(
  sandboxId: string
): Promise<{ previewUrl: string }> {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "restart", sandboxId }),
  });
  if (!res.ok) throw new Error("Restart failed");
  return res.json();
}

export async function execInSandbox(
  sandboxId: string,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "exec", sandboxId, command }),
  });
  if (!res.ok) throw new Error("Exec failed");
  return res.json();
}
