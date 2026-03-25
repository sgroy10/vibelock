import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Project persistence API — save and load chat history, files, and constraints.
 * This is what enables "resume where you left off."
 *
 * GET /api/projects/[id] — load full project state (messages, files, constraints)
 * PUT /api/projects/[id] — save project state after each build
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        language: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Load messages, files, and constraints in parallel
    const [messages, files, constraints] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      }),
      prisma.projectFile.findMany({
        where: { projectId: id },
        select: { path: true, content: true },
      }),
      prisma.projectConstraint.findMany({
        where: { projectId: id, active: true },
        select: { id: true, text: true, source: true, createdAt: true },
      }),
    ]);

    return NextResponse.json({
      project,
      messages,
      files: Object.fromEntries(files.map((f) => [f.path, f.content])),
      constraints,
    });
  } catch (error) {
    console.error("Load project error:", error);
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { messages, files, constraints, name } = await req.json();

    // Ensure project exists — update or create
    const existingProject = await prisma.project.findUnique({ where: { id } });
    if (existingProject) {
      await prisma.project.update({
        where: { id },
        data: { name: name || existingProject.name, updatedAt: new Date() },
      });
    } else {
      // For anonymous users, find or create a default user
      let user = await prisma.user.findFirst({ where: { email: "anonymous@vibelock.in" } });
      if (!user) {
        user = await prisma.user.create({
          data: { email: "anonymous@vibelock.in", name: "Anonymous" },
        });
      }
      await prisma.project.create({
        data: { id, name: name || "Untitled", userId: user.id },
      });
    }

    // Save messages — delete old and insert new (simpler than diffing)
    if (messages && Array.isArray(messages)) {
      await prisma.chatMessage.deleteMany({ where: { projectId: id } });
      if (messages.length > 0) {
        await prisma.chatMessage.createMany({
          data: messages.map((m: { role: string; content: string }) => ({
            projectId: id,
            role: m.role,
            content: m.content,
          })),
        });
      }
    }

    // Save files — upsert each file
    if (files && typeof files === "object") {
      const fileEntries = Object.entries(files) as [string, string][];
      // Delete files that no longer exist
      await prisma.projectFile.deleteMany({ where: { projectId: id } });
      if (fileEntries.length > 0) {
        await prisma.projectFile.createMany({
          data: fileEntries.map(([path, content]) => ({
            projectId: id,
            path,
            content,
          })),
        });
      }
    }

    // Save constraints
    if (constraints && Array.isArray(constraints)) {
      await prisma.projectConstraint.deleteMany({ where: { projectId: id } });
      if (constraints.length > 0) {
        await prisma.projectConstraint.createMany({
          data: constraints.map((c: { text: string; source?: string }) => ({
            projectId: id,
            text: c.text,
            source: c.source || "auto",
          })),
        });
      }
    }

    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error("Save project error:", error);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }
}
