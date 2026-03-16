import { createRequestHandler } from '@remix-run/node';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BUILD_DIR = join(__dirname, 'build');
const CLIENT_DIR = join(BUILD_DIR, 'client');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

// Build env object matching the Cloudflare Env interface from worker-configuration.d.ts
function getEnv() {
  return {
    RUNNING_IN_DOCKER: process.env.RUNNING_IN_DOCKER || '',
    DEFAULT_NUM_CTX: process.env.DEFAULT_NUM_CTX || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    HuggingFace_API_KEY: process.env.HuggingFace_API_KEY || '',
    OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY || '',
    OLLAMA_API_BASE_URL: process.env.OLLAMA_API_BASE_URL || '',
    OPENAI_LIKE_API_KEY: process.env.OPENAI_LIKE_API_KEY || '',
    OPENAI_LIKE_API_BASE_URL: process.env.OPENAI_LIKE_API_BASE_URL || '',
    OPENAI_LIKE_API_MODELS: process.env.OPENAI_LIKE_API_MODELS || '',
    TOGETHER_API_KEY: process.env.TOGETHER_API_KEY || '',
    TOGETHER_API_BASE_URL: process.env.TOGETHER_API_BASE_URL || '',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    LMSTUDIO_API_BASE_URL: process.env.LMSTUDIO_API_BASE_URL || '',
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || '',
    XAI_API_KEY: process.env.XAI_API_KEY || '',
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || '',
    AWS_BEDROCK_CONFIG: process.env.AWS_BEDROCK_CONFIG || '',
  };
}

// Try to serve a static file, return true if served
function tryServeStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = join(CLIENT_DIR, url.pathname);

  // Don't serve directories
  if (filePath.endsWith('/')) {
    return false;
  }

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    // Cache immutable assets (fingerprinted files in /assets/)
    const cacheControl = url.pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600';

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': content.length,
      'Cache-Control': cacheControl,
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

async function start() {
  const serverBuild = await import('./build/server/index.js');

  const remixHandler = createRequestHandler(serverBuild, 'production');

  const env = getEnv();

  const server = createServer(async (req, res) => {
    // Try static files first
    if (tryServeStatic(req, res)) {
      return;
    }

    // Convert Node.js request to Web Request
    const url = new URL(req.url, `http://${req.headers.host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const body = req.method !== 'GET' && req.method !== 'HEAD'
      ? await new Promise((resolve) => {
          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
        })
      : undefined;

    const webRequest = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
      duplex: body ? 'half' : undefined,
    });

    try {
      // Call Remix with cloudflare-compatible context
      const loadContext = {
        cloudflare: {
          env,
        },
      };

      const webResponse = await remixHandler(webRequest, loadContext);

      // Stream the response back
      res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));

      if (webResponse.body) {
        const reader = webResponse.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump().catch((err) => {
          console.error('Stream error:', err);
          res.end();
        });
      } else {
        res.end();
      }
    } catch (err) {
      console.error('Request error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  const port = parseInt(process.env.PORT || '5173', 10);
  server.listen(port, '0.0.0.0', () => {
    console.log(`VibeLock server running on http://0.0.0.0:${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
