"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATES = [
  { icon: "🛍️", label: "Online Store", prompt: "Build me a modern e-commerce store" },
  { icon: "📊", label: "Dashboard", prompt: "Create an analytics dashboard" },
  { icon: "📝", label: "Blog", prompt: "Build a blog with posts and comments" },
  { icon: "📋", label: "To-Do App", prompt: "Make a task management app" },
  { icon: "💬", label: "Chat App", prompt: "Build a real-time chat application" },
  { icon: "🍽️", label: "Restaurant", prompt: "Create a restaurant website with menu" },
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
      {/* Header */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-gray-100">
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
        <a
          href="https://github.com/sgroy10/vibelock"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          GitHub
        </a>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="max-w-2xl w-full text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 bg-green-50 text-green-700 border border-green-100">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Protected by SpecLock
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 leading-tight tracking-tight text-gray-900">
            Build apps in{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #FF8F3C, #FF6B2C, #E85A1E)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              any language
            </span>
          </h1>

          <p className="text-base lg:text-lg text-gray-500 max-w-lg mx-auto mb-10">
            Describe what you want — in Hindi, Gujarati, Arabic, Spanish, or any language.
            VibeLock builds it live with AI.
          </p>

          {/* Prompt Input */}
          <div className="relative rounded-2xl overflow-hidden mb-8 bg-white border border-gray-200 shadow-lg shadow-gray-100/50">
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
              className="w-full bg-transparent text-gray-900 placeholder:text-gray-400 px-5 pt-5 pb-14 text-sm resize-none outline-none min-h-[120px]"
            />
            <div className="absolute bottom-3 right-3">
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-30 shadow-md shadow-orange-200/50"
                style={{
                  background: input.trim()
                    ? "linear-gradient(135deg, #FF6B2C, #FF8F3C)"
                    : "#E5E7EB",
                }}
              >
                Build →
              </button>
            </div>
          </div>

          {/* Templates */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => handleSubmit(t.prompt)}
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-left text-sm transition-all hover:scale-[1.02] bg-gray-50 border border-gray-100 hover:border-gray-200 hover:shadow-sm"
              >
                <span className="text-lg">{t.icon}</span>
                <span className="text-gray-600">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Language pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
            {["English", "हिन्दी", "ગુજરાતી", "العربية", "Español", "中文"].map((lang) => (
              <span
                key={lang}
                className="px-2.5 py-1 rounded-full text-xs bg-orange-50 text-orange-600 border border-orange-100"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-400">
        Built by Sandeep Roy · Powered by SpecLock
      </footer>
    </div>
  );
}
