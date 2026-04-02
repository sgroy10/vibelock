import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "e2b";

/**
 * E2B Sandbox API — manages cloud sandboxes for code execution.
 * Each project gets a real Linux VM with filesystem, Node.js, and Vite.
 * Preview URL: https://{sandboxId}-5173.e2b.dev (real subdomain, works in iframe)
 *
 * POST /api/sandbox { action: "create" | "write" | "exec" | "restart", ... }
 */

const E2B_API_KEY = process.env.E2B_API_KEY;

// Keep track of active sandboxes (in-memory)
// Keyed by BOTH projectId and sandboxId for lookup from either
const sandboxes = new Map<string, Sandbox>();
const sandboxIdMap = new Map<string, Sandbox>(); // sandboxId → Sandbox

// Golden template files — shadcn/ui + Tailwind CSS + professional defaults
const TEMPLATE_FILES: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "app", private: true, type: "module",
    scripts: { dev: "vite --host 0.0.0.0 --port 5173", build: "vite build" },
    dependencies: {
      react: "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^7.1.1",
      "lucide-react": "^0.475.0",
      "class-variance-authority": "^0.7.1", "clsx": "^2.1.1", "tailwind-merge": "^2.6.0",
      "@radix-ui/react-slot": "^1.1.1",
      "@radix-ui/react-dialog": "^1.1.4",
      "@radix-ui/react-dropdown-menu": "^2.1.4",
      "@radix-ui/react-tabs": "^1.1.2",
      "@radix-ui/react-avatar": "^1.1.2",
      "@radix-ui/react-separator": "^1.1.1",
      "@radix-ui/react-label": "^2.1.1",
      "@radix-ui/react-select": "^2.1.4",
      "@radix-ui/react-toast": "^1.2.4",
      "@radix-ui/react-tooltip": "^1.1.6",
      "@radix-ui/react-switch": "^1.1.2",
      "@radix-ui/react-checkbox": "^1.1.3",
    },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.4", vite: "^6.0.0",
      tailwindcss: "^3.4.0", postcss: "^8.4.0", autoprefixer: "^10.4.0",
      "tailwindcss-animate": "^1.0.7",
    }
  }, null, 2),
  "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true }
})
`,
  "postcss.config.js": `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }\n`,
  "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
`,
  "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <title>App</title>
</head>
<body class="min-h-screen font-sans antialiased bg-background text-foreground">
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
  <script>
  // VibeLock console capture + visual selection support
  (function() {
    var origError = console.error, origWarn = console.warn;
    function post(level, args) {
      try {
        var msg = Array.from(args).map(function(a) {
          if (a instanceof Error) return a.message + '\\n' + (a.stack || '');
          if (typeof a === 'object') return JSON.stringify(a);
          return String(a);
        }).join(' ');
        window.parent.postMessage({ type: 'vibelock-console', level: level, message: msg }, '*');
      } catch(e) {}
    }
    console.error = function() { post('error', arguments); origError.apply(console, arguments); };
    console.warn = function() { post('warn', arguments); origWarn.apply(console, arguments); };
    window.addEventListener('error', function(e) { post('error', [e.message + ' at ' + e.filename + ':' + e.lineno]); });
    window.addEventListener('unhandledrejection', function(e) { post('error', ['Unhandled Promise: ' + (e.reason?.message || e.reason || 'unknown')]); });

    // Listen for visual select mode from parent
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'vibelock-run-script') {
        try { new Function(e.data.script)(); } catch(err) { console.warn('Visual select script error:', err); }
      }
    });
  })();
  </script>
</body>
</html>
`,
  "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 24 95% 53%;
    --primary-foreground: 0 0% 100%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 24 95% 53%;
    --radius: 0.75rem;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
`,
  "src/main.jsx": `import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
createRoot(document.getElementById('root')).render(<App />)
`,
  "src/App.jsx": `export default function App() {
  return <div className="min-h-screen flex items-center justify-center"><h1 className="text-3xl font-bold">Ready</h1></div>
}
`,
  // ─── shadcn/ui utility ───
  "src/lib/utils.js": `import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs) { return twMerge(clsx(inputs)) }
`,
  // ─── shadcn/ui Button ───
  "src/components/ui/button.jsx": `import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
Button.displayName = "Button"
export { buttonVariants }
`,
  // ─── shadcn/ui Card ───
  "src/components/ui/card.jsx": `import { cn } from "@/lib/utils"

export function Card({ className, ...props }) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)} {...props} />
}
export function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
}
export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
}
export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}
export function CardContent({ className, ...props }) {
  return <div className={cn("p-6 pt-0", className)} {...props} />
}
export function CardFooter({ className, ...props }) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
}
`,
  // ─── shadcn/ui Input ───
  "src/components/ui/input.jsx": `import { cn } from "@/lib/utils"

export function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}
`,
  // ─── shadcn/ui Badge ───
  "src/components/ui/badge.jsx": `import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
`,
  // ─── shadcn/ui Separator ───
  "src/components/ui/separator.jsx": `import * as SeparatorPrimitive from "@radix-ui/react-separator"
import { cn } from "@/lib/utils"

export function Separator({ className, orientation = "horizontal", decorative = true, ...props }) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]", className)}
      {...props}
    />
  )
}
`,
  // ─── shadcn/ui Avatar ───
  "src/components/ui/avatar.jsx": `import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn } from "@/lib/utils"

export function Avatar({ className, ...props }) {
  return <AvatarPrimitive.Root className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)} {...props} />
}
export function AvatarImage({ className, ...props }) {
  return <AvatarPrimitive.Image className={cn("aspect-square h-full w-full", className)} {...props} />
}
export function AvatarFallback({ className, ...props }) {
  return <AvatarPrimitive.Fallback className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)} {...props} />
}
`,
  // ─── shadcn/ui Textarea ───
  "src/components/ui/textarea.jsx": `import { cn } from "@/lib/utils"

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}
`,
  // ─── shadcn/ui Label ───
  "src/components/ui/label.jsx": `import * as LabelPrimitive from "@radix-ui/react-label"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const labelVariants = cva("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70")

export function Label({ className, ...props }) {
  return <LabelPrimitive.Root className={cn(labelVariants(), className)} {...props} />
}
`,
  // ─── shadcn/ui Switch ───
  "src/components/ui/switch.jsx": `import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

export function Switch({ className, ...props }) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitives.Root>
  )
}
`,
  // ─── shadcn/ui Dialog ───
  "src/components/ui/dialog.jsx": `import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogPortal(props) { return <DialogPrimitive.Portal {...props} /> }
export function DialogOverlay({ className, ...props }) {
  return <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)} {...props} />
}
export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content className={cn("fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg", className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" /><span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}
export function DialogHeader({ className, ...props }) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
}
export function DialogFooter({ className, ...props }) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
}
export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
}
export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
}
`,
  // ─── shadcn/ui Select ───
  "src/components/ui/select.jsx": `import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger className={cn("flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1", className)} {...props}>
      {children}
      <SelectPrimitive.Icon asChild><ChevronDown className="h-4 w-4 opacity-50" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}
export function SelectContent({ className, children, position = "popper", ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className={cn("relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className)} position={position} {...props}>
        <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1"><ChevronUp className="h-4 w-4" /></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className={cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}>{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1"><ChevronDown className="h-4 w-4" /></SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}
export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item className={cn("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)} {...props}>
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator></span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
export function SelectLabel({ className, ...props }) {
  return <SelectPrimitive.Label className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
}
export function SelectSeparator({ className, ...props }) {
  return <SelectPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
}
`,
  // ─── shadcn/ui Tabs ───
  "src/components/ui/tabs.jsx": `import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

export const Tabs = TabsPrimitive.Root
export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)} {...props} />
}
export function TabsTrigger({ className, ...props }) {
  return <TabsPrimitive.Trigger className={cn("inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)} {...props} />
}
export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)} {...props} />
}
`,
};

async function getOrCreateSandbox(projectId: string): Promise<Sandbox> {
  const existing = sandboxes.get(projectId);
  if (existing) {
    try {
      // Check if still alive
      await existing.commands.run("echo ok", { timeoutMs: 5000 });
      return existing;
    } catch {
      sandboxes.delete(projectId);
    }
  }

  // Create new sandbox
  const sandbox = await Sandbox.create({
    apiKey: E2B_API_KEY!,
    timeoutMs: 1_800_000, // 30 min timeout
  });
  sandboxes.set(projectId, sandbox);
  sandboxIdMap.set(sandbox.sandboxId, sandbox);
  return sandbox;
}

export async function POST(req: NextRequest) {
  if (!E2B_API_KEY) {
    return NextResponse.json({ error: "E2B API key not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { projectId, files } = body as {
        projectId: string;
        files: { path: string; content: string }[];
      };

      const sandbox = await getOrCreateSandbox(projectId);

      // Write template files
      for (const [path, content] of Object.entries(TEMPLATE_FILES)) {
        const dir = path.includes("/") ? path.split("/").slice(0, -1).join("/") : null;
        if (dir) await sandbox.files.makeDir(dir).catch(() => {});
        await sandbox.files.write(path, content);
      }

      // Write user files
      if (files?.length) {
        for (const f of files) {
          const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : null;
          if (dir) await sandbox.files.makeDir(dir).catch(() => {});
          await sandbox.files.write(f.path, f.content);
        }
      }

      // Install deps
      const install = await sandbox.commands.run("npm install", { timeoutMs: 120_000 });
      if (install.exitCode !== 0) {
        return NextResponse.json({
          error: "npm install failed",
          stderr: install.stderr?.slice(-500),
        }, { status: 500 });
      }

      // Start Vite dev server in background using nohup
      // Start Vite in background — timeout is EXPECTED (bg process never exits)
      sandbox.commands.run("npx vite --host 0.0.0.0 --port 5173", { timeoutMs: 600000 }).catch(() => {});

      // Wait for Vite to FULLY compile (not just serve HTML shell)
      // Check both root HTML and the main App module
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const check = await sandbox.commands.run(
            "curl -sf http://localhost:5173/src/App.jsx > /dev/null 2>&1 && echo OK || echo WAIT",
            { timeoutMs: 10000 }
          );
          if (check.stdout?.includes("OK")) break;
        } catch {
          // Vite not ready yet — continue waiting
        }
      }

      // E2B preview URL — real subdomain, works everywhere
      const previewUrl = `https://${sandbox.getHost(5173)}`;

      return NextResponse.json({
        sandboxId: sandbox.sandboxId,
        previewUrl,
        filesWritten: Object.keys(TEMPLATE_FILES).length + (files?.length || 0),
      });
    }

    if (action === "write") {
      const { sandboxId, files } = body as {
        sandboxId: string;
        files: { path: string; content: string }[];
      };

      // Find sandbox by ID
      const sandbox = sandboxIdMap.get(sandboxId);
      if (!sandbox) {
        return NextResponse.json({ error: "Sandbox not found: " + sandboxId }, { status: 404 });
      }

      let written = 0;
      for (const f of files) {
        const dir = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : null;
        if (dir) await sandbox.files.makeDir(dir).catch(() => {});
        await sandbox.files.write(f.path, f.content);
        written++;
      }

      // Auto-restart Vite after writing files
      await sandbox.commands.run("pkill -f vite 2>/dev/null; sleep 1", { timeoutMs: 10000 }).catch(() => {});
      // Start Vite in background — timeout is EXPECTED (bg process never exits)
      sandbox.commands.run("npx vite --host 0.0.0.0 --port 5173", { timeoutMs: 600000 }).catch(() => {});

      // Wait for Vite to fully compile
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const check = await sandbox.commands.run(
            "curl -sf http://localhost:5173/src/App.jsx > /dev/null 2>&1 && echo OK || echo WAIT",
            { timeoutMs: 10000 }
          );
          if (check.stdout?.includes("OK")) break;
        } catch {
          // Vite not ready yet — continue waiting
        }
      }

      const previewUrl = `https://${sandbox.getHost(5173)}`;
      return NextResponse.json({ written, verified: written, previewUrl });
    }

    if (action === "restart") {
      const { sandboxId } = body as { sandboxId: string };

      let sandbox: Sandbox | undefined;
      for (const [, sb] of sandboxes) {
        if (sb.sandboxId === sandboxId) { sandbox = sb; break; }
      }
      if (!sandbox) {
        return NextResponse.json({ error: "Sandbox not found" }, { status: 404 });
      }

      // Kill old Vite and restart
      await sandbox.commands.run("pkill -f vite 2>/dev/null; sleep 1", { timeoutMs: 10000 }).catch(() => {});
      // Start Vite in background — timeout is EXPECTED (bg process never exits)
      sandbox.commands.run("npx vite --host 0.0.0.0 --port 5173", { timeoutMs: 600000 }).catch(() => {});

      // Wait for full compilation
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const check = await sandbox.commands.run(
            "curl -sf http://localhost:5173/src/App.jsx > /dev/null 2>&1 && echo OK || echo WAIT",
            { timeoutMs: 10000 }
          );
          if (check.stdout?.includes("OK")) break;
        } catch {
          // Vite not ready yet — continue waiting
        }
      }

      const previewUrl = `https://${sandbox.getHost(5173)}`;
      return NextResponse.json({ previewUrl });
    }

    if (action === "exec") {
      const { sandboxId, command } = body as { sandboxId: string; command: string };

      let sandbox: Sandbox | undefined;
      for (const [, sb] of sandboxes) {
        if (sb.sandboxId === sandboxId) { sandbox = sb; break; }
      }
      if (!sandbox) {
        return NextResponse.json({ error: "Sandbox not found" }, { status: 404 });
      }

      const result = await sandbox.commands.run(command, { timeoutMs: 30_000 });
      return NextResponse.json({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Sandbox API error:", err);
    return NextResponse.json({
      error: "Sandbox operation failed",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
