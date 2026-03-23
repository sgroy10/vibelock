"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: authError } = await authClient.signIn.email({
        email,
        password,
      });
      if (authError) {
        setError(authError.message || "Login failed");
      } else {
        router.push("/projects");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold text-white"
              style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
            >
              V
            </div>
          </a>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to your VibeLock account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border border-gray-200 shadow-lg shadow-gray-100/50">
          {error && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-medium text-sm transition-all disabled:opacity-50 shadow-md shadow-orange-200/50"
            style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-orange-600 hover:text-orange-700 font-medium">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
