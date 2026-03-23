import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * One-click deploy to Netlify.
 * Receives file tree from WebContainer, deploys as a static site.
 *
 * POST /api/deploy { files: { "index.html": "...", "assets/main.js": "..." }, projectName: "my-app" }
 * Returns: { url: "https://xxx.netlify.app", siteId: "..." }
 */

const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN;
const NETLIFY_API = "https://api.netlify.com/api/v1";

export async function POST(req: NextRequest) {
  if (!NETLIFY_TOKEN) {
    return NextResponse.json({ error: "Netlify not configured" }, { status: 500 });
  }

  try {
    const { files, projectName } = await req.json();

    if (!files || Object.keys(files).length === 0) {
      return NextResponse.json({ error: "No files to deploy" }, { status: 400 });
    }

    // Step 1: Create a new Netlify site
    const siteName = `vibelock-${(projectName || "app").toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now().toString(36)}`;

    const createRes = await fetch(`${NETLIFY_API}/sites`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: siteName }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("Netlify create site error:", err);
      return NextResponse.json({ error: "Failed to create site" }, { status: 502 });
    }

    const site = await createRes.json();
    const siteId = site.id;

    // Step 2: Prepare file digests for deploy
    // Netlify needs SHA1 hash of each file
    const fileHashes: Record<string, string> = {};
    const fileContents: Record<string, Buffer> = {};

    for (const [path, content] of Object.entries(files)) {
      // Skip node_modules and other build artifacts
      if (path.includes("node_modules") || path.startsWith(".")) continue;

      const buf = Buffer.from(content as string, "utf-8");
      const hash = crypto.createHash("sha1").update(buf).digest("hex");

      // Netlify wants paths starting with /
      const netlifyPath = path.startsWith("/") ? path : `/${path}`;
      fileHashes[netlifyPath] = hash;
      fileContents[hash] = buf;
    }

    // Step 3: Create deploy with file manifest
    const deployRes = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: fileHashes,
        draft: false,
      }),
    });

    if (!deployRes.ok) {
      const err = await deployRes.text();
      console.error("Netlify deploy error:", err);
      return NextResponse.json({ error: "Deploy failed" }, { status: 502 });
    }

    const deploy = await deployRes.json();
    const deployId = deploy.id;
    const required = deploy.required || [];

    // Step 4: Upload required files
    for (const hash of required) {
      const buf = fileContents[hash];
      if (!buf) continue;

      await fetch(`${NETLIFY_API}/deploys/${deployId}/files/${hash}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${NETLIFY_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(buf),
      });
    }

    // The deploy URL
    const url = deploy.ssl_url || deploy.url || `https://${siteName}.netlify.app`;

    return NextResponse.json({
      url,
      siteId,
      siteName,
      deployId,
    });
  } catch (error) {
    console.error("Deploy error:", error);
    return NextResponse.json({ error: "Deploy failed" }, { status: 500 });
  }
}
