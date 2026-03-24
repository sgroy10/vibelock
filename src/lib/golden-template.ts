/**
 * Golden Template — the one known-good Vite + React + Tailwind scaffold.
 * Pre-mounted into WebContainer on boot so the AI never has to regenerate config files.
 * AI only writes src/ files for new apps, and edits them for modifications.
 */

export const GOLDEN_TEMPLATE: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "vibelock-app",
      private: true,
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        vite: "^6.0.0",
        tailwindcss: "^3.4.0",
        postcss: "^8.4.0",
        autoprefixer: "^10.4.0",
      },
    },
    null,
    2
  ),

  "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
`,

  "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,

  "tailwind.config.js": `export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
`,

  "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>App</title>
</head>
<body class="bg-white text-gray-900 min-h-screen font-sans antialiased">
  <div id="root"></div>
  <script>
  (function(){
    var oe=console.error,ow=console.warn;
    function p(l,a){try{var m=Array.from(a).map(function(x){return x instanceof Error?x.message+'\\n'+(x.stack||''):typeof x==='object'?JSON.stringify(x):String(x)}).join(' ');window.parent.postMessage({type:'vibelock-console',level:l,message:m},'*')}catch(e){}}
    console.error=function(){p('error',arguments);oe.apply(console,arguments)};
    console.warn=function(){p('warn',arguments);ow.apply(console,arguments)};
    window.addEventListener('error',function(e){p('error',[e.message+' at '+e.filename+':'+e.lineno])});
    window.addEventListener('unhandledrejection',function(e){p('error',['Unhandled: '+(e.reason&&e.reason.message||e.reason||'unknown')])});
  })();
  </script>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
`,

  "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;
`,

  "src/main.jsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
`,

  "src/App.jsx": `export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Ready to build</h1>
        <p className="text-gray-500">Describe your app in the chat...</p>
      </div>
    </div>
  )
}
`,
};

/**
 * List of config files that the AI should NEVER regenerate.
 * These are pre-mounted and managed by the platform.
 */
export const LOCKED_CONFIG_FILES = new Set([
  "package.json",
  "vite.config.js",
  "postcss.config.js",
  "tailwind.config.js",
  "index.html",
  "src/index.css",
  "src/main.jsx",
]);
