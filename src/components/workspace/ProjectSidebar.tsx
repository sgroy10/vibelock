"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { Plus, ChevronLeft, ChevronRight, MessageSquare, FolderOpen } from "lucide-react";

interface ProjectEntry {
  id: string;
  name: string;
  updatedAt: string;
  _count?: { messages?: number };
  messageCount?: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ProjectSidebar() {
  const router = useRouter();
  const params = useParams();
  const currentId = params.id as string;

  const [collapsed, setCollapsed] = useState(false);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [notLoggedIn, setNotLoggedIn] = useState(false);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) {
          setNotLoggedIn(true);
          return;
        }
        const data = await res.json();
        if (data.error) {
          setNotLoggedIn(true);
          return;
        }
        setProjects(Array.isArray(data) ? data : []);
      } catch {
        setNotLoggedIn(true);
      }
    }
    fetchProjects();
  }, []);

  const handleNewProject = () => {
    const id = crypto.randomUUID().slice(0, 8);
    router.push(`/workspace/${id}`);
  };

  if (collapsed) {
    return (
      <div className="w-12 flex flex-col items-center py-3 border-r border-gray-100 bg-gray-50/50 shrink-0">
        <button
          onClick={handleNewProject}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors mb-3"
          title="New Project"
        >
          <Plus size={16} />
        </button>

        {projects.slice(0, 6).map((p) => (
          <button
            key={p.id}
            onClick={() => router.push(`/workspace/${p.id}`)}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center mb-1 transition-colors",
              p.id === currentId
                ? "bg-orange-50 text-orange-600"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            )}
            title={p.name || "Untitled"}
          >
            <FolderOpen size={14} />
          </button>
        ))}

        <div className="mt-auto">
          <button
            onClick={() => setCollapsed(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[220px] flex flex-col border-r border-gray-100 bg-gray-50/50 shrink-0">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-100">
        <button
          onClick={handleNewProject}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-white shadow-sm transition-all hover:shadow-md"
          style={{ background: "linear-gradient(135deg, #FF6B2C, #FF8F3C)" }}
        >
          <Plus size={14} />
          New Project
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {notLoggedIn && (
          <div className="px-3 py-4 text-center">
            <p className="text-[11px] text-gray-400 mb-2">Sign in to save projects</p>
            <a
              href="/auth/signin"
              className="text-[11px] text-orange-600 hover:text-orange-700 underline"
            >
              Sign in
            </a>
          </div>
        )}

        {!notLoggedIn && projects.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-gray-400">
            No projects yet
          </div>
        )}

        {projects.map((project) => {
          const msgCount = project.messageCount ?? project._count?.messages ?? 0;
          return (
            <button
              key={project.id}
              onClick={() => router.push(`/workspace/${project.id}`)}
              className={cn(
                "w-full text-left px-3 py-2 border-l-2 transition-colors hover:bg-gray-100/50",
                project.id === currentId
                  ? "border-l-orange-500 bg-orange-50/50"
                  : "border-l-transparent"
              )}
            >
              <div className="text-[12px] font-medium text-gray-700 truncate">
                {project.name || "Untitled"}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-gray-400">
                  {timeAgo(project.updatedAt)}
                </span>
                {msgCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                    <MessageSquare size={9} />
                    {msgCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Collapse button */}
      <div className="px-3 py-2 border-t border-gray-100">
        <button
          onClick={() => setCollapsed(true)}
          className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={12} />
          Collapse
        </button>
      </div>
    </div>
  );
}
