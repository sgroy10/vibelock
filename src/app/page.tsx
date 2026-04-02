"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATES = [
  { icon: "🛍️", label: "Online Store", prompt: "Build me a modern e-commerce store with product catalog, cart, and checkout", desc: "Full shopping experience" },
  { icon: "📊", label: "Dashboard", prompt: "Create an analytics dashboard with charts, metrics, and data tables", desc: "Data visualization" },
  { icon: "📝", label: "Blog Platform", prompt: "Build a blog platform with rich posts, comments, and author profiles", desc: "Content management" },
  { icon: "📋", label: "Project Manager", prompt: "Make a project management app with boards, tasks, and team views", desc: "Task tracking" },
  { icon: "💬", label: "Chat App", prompt: "Build a real-time messaging app with channels and direct messages", desc: "Communication tool" },
  { icon: "🍽️", label: "Restaurant", prompt: "Create a restaurant website with menu, reservations, and online ordering", desc: "Food & dining" },
  { icon: "🏥", label: "Health Tracker", prompt: "Build a personal health tracking app with metrics, goals, and progress charts", desc: "Wellness & fitness" },
  { icon: "🎓", label: "Learning Platform", prompt: "Create an online course platform with lessons, quizzes, and progress tracking", desc: "Education" },
  { icon: "💼", label: "Portfolio", prompt: "Build a stunning personal portfolio website with projects, skills, and contact form", desc: "Professional showcase" },
];

const FEATURES = [
  {
    icon: "🔒",
    title: "SpecLock Protection",
    desc: "Your constraints are locked. When you say \"never change this\", VibeLock remembers and enforces it across every iteration.",
  },
  {
    icon: "🌍",
    title: "22 Languages",
    desc: "Build in Hindi, Gujarati, Arabic, Tamil, or any of 22 supported languages. VibeLock understands your native tongue.",
  },
  {
    icon: "⚡",
    title: "Production-Quality UI",
    desc: "Every app uses shadcn/ui components — the same design system used by Vercel, Linear, and top startups.",
  },
  {
    icon: "🛠️",
    title: "Built-in Backend",
    desc: "Database, authentication, and file storage included. No external setup needed — just describe what you want.",
  },
  {
    icon: "🤖",
    title: "Smart Agent",
    desc: "Plans before building, auto-fixes errors, and suggests improvements. Like having a senior developer on your team.",
  },
  {
    icon: "🚀",
    title: "One-Click Deploy",
    desc: "Publish your app to the web instantly. Custom domains, SSL, everything handled automatically.",
  },
];

const STEPS = [
  { num: "1", title: "Describe", desc: "Tell VibeLock what you want to build in any language. Be as detailed or as simple as you like." },
  { num: "2", title: "Watch it build", desc: "VibeLock plans, writes code, and shows you a live preview in seconds. See visible progress for every step." },
  { num: "3", title: "Iterate & ship", desc: "Refine with follow-up prompts, add features, then publish with one click. Your constraints are always protected." },
];

export default function Home() {
  const [input, setInput] = useState("");
  const router = useRouter();

  const handleSubmit = (prompt?: string) => {
    const text = prompt || input;
    if (!text.trim()) return;
    const encoded = encodeURIComponent(text.trim());
    router.push(`/workspace/new?prompt=${encoded}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 h-14 border-b border-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold text-white"
            style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
          >
            V
          </div>
          <span className="text-base font-semibold tracking-tight text-gray-900">
            VibeLock
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/login" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Sign in
          </a>
          <a
            href="/signup"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
            style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
          >
            Get started
          </a>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="flex flex-col items-center justify-center px-4 pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="max-w-3xl w-full text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 bg-green-50 text-green-700 border border-green-100">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Protected by SpecLock — your constraints, always enforced
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-5 leading-[1.1] tracking-tight text-gray-900">
            Build production apps{" "}
            <br className="hidden sm:block" />
            <span
              style={{
                background: "linear-gradient(135deg, #FF8F3C, #FF6B2C, #E85A1E)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              in any language
            </span>
          </h1>

          <p className="text-lg lg:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Describe what you want in Hindi, Gujarati, Arabic, or any of 22 languages.
            VibeLock builds professional apps with shadcn/ui, protects your constraints, and deploys in one click.
          </p>

          {/* ── Prompt Input ── */}
          <div className="relative rounded-2xl overflow-hidden mb-8 bg-white border border-gray-200 shadow-xl shadow-gray-200/30 max-w-2xl mx-auto">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="What do you want to build? (किसी भी भाषा में लिखें...)"
              className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 px-5 pt-5 pb-16 text-base resize-none outline-none min-h-[130px]"
            />
            <div className="absolute bottom-3 left-4 text-xs text-gray-300">
              Shift+Enter for new line
            </div>
            <div className="absolute bottom-3 right-3">
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim()}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-30 shadow-md hover:shadow-lg hover:scale-[1.02]"
                style={{
                  background: input.trim()
                    ? "linear-gradient(135deg, #FF6B2C, #FF8F3C)"
                    : "#D1D5DB",
                }}
              >
                Build it
              </button>
            </div>
          </div>

          {/* Language pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            {["English", "हिन्दी", "ગુજરાતી", "मराठी", "தமிழ்", "తెలుగు", "বাংলা", "العربية", "Español", "中文", "اردو", "ಕನ್ನಡ"].map((lang) => (
              <span
                key={lang}
                className="px-2.5 py-1 rounded-full text-xs bg-orange-50 text-orange-600 border border-orange-100"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Template Grid ── */}
      <section className="px-4 pb-20 md:pb-28">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-2xl font-bold text-gray-900 mb-2">Start with a template</h2>
          <p className="text-center text-gray-500 mb-8">Or describe your own idea above</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => handleSubmit(t.prompt)}
                className="group flex items-start gap-3 px-5 py-4 rounded-xl text-left transition-all hover:scale-[1.02] hover:shadow-md bg-white border border-gray-200 hover:border-orange-200"
              >
                <span className="text-2xl mt-0.5">{t.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">{t.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="px-4 py-20 md:py-28 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-center text-2xl font-bold text-gray-900 mb-2">How it works</h2>
          <p className="text-center text-gray-500 mb-12">From idea to deployed app in minutes</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.num} className="text-center">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold text-white mx-auto mb-4"
                  style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
                >
                  {step.num}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="px-4 py-20 md:py-28">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-center text-2xl font-bold text-gray-900 mb-2">Why VibeLock</h2>
          <p className="text-center text-gray-500 mb-12">The only AI builder with constraint protection and multilingual intelligence</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="p-6 rounded-xl border border-gray-200 bg-white hover:shadow-md hover:border-orange-100 transition-all"
              >
                <span className="text-3xl mb-4 block">{f.icon}</span>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="px-4 py-20 md:py-28 bg-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to build something?</h2>
          <p className="text-gray-500 mb-8">Join developers and creators who ship faster with VibeLock</p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="px-8 py-3 rounded-xl text-base font-semibold text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
            style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
          >
            Start building for free
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
            >
              V
            </div>
            <span className="text-sm font-semibold text-gray-900">VibeLock</span>
            <span className="text-xs text-gray-400 ml-2">Built by Sandeep Roy</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>Powered by SpecLock</span>
            <span>|</span>
            <span>22 Languages</span>
            <span>|</span>
            <span>shadcn/ui Design System</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
