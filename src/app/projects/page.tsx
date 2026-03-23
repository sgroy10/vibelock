"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

interface Project {
  id: string;
  name: string;
  description: string | null;
  language: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (!data?.user) {
        router.push("/login");
        return;
      }
      setUser({ name: data.user.name || "", email: data.user.email || "" });

      fetch("/api/projects")
        .then((r) => r.json())
        .then((d) => setProjects(d.projects || []))
        .finally(() => setLoading(false));
    });
  }, [router]);

  const createProject = () => {
    router.push("/workspace/new");
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
            >
              V
            </div>
            <span className="text-sm font-semibold text-gray-900">VibeLock</span>
          </a>

          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-gray-500">{user.name || user.email}</span>
            )}
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your Projects</h1>
            <p className="text-sm text-gray-500 mt-1">Build and manage your apps</p>
          </div>
          <button
            onClick={createProject}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white shadow-md shadow-orange-200/50 transition-all hover:shadow-lg"
            style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
          >
            + New Project
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="text-4xl mb-4">🚀</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No projects yet</h2>
            <p className="text-sm text-gray-500 mb-6">
              Create your first app — describe it in any language
            </p>
            <button
              onClick={createProject}
              className="px-6 py-3 rounded-xl text-sm font-medium text-white shadow-md shadow-orange-200/50"
              style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
            >
              Create your first app
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <a
                key={project.id}
                href={`/workspace/${project.id}`}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all hover:scale-[1.01]"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 text-sm">{project.name}</h3>
                  <span className="text-xs text-gray-400">{timeAgo(project.updatedAt)}</span>
                </div>
                {project.description && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{project.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {project._count.messages} messages
                  </span>
                  {project.language !== "en" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-600 border border-orange-100">
                      {project.language}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
