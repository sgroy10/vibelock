import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * VibeLock Built-in Auth for Generated Apps
 * Each project gets its own user pool.
 *
 * POST /api/app-auth/[projectId] { action: "signup", email, password, name }
 * POST /api/app-auth/[projectId] { action: "login", email, password }
 * POST /api/app-auth/[projectId] { action: "me", token }
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "vibelock-salt-2026").digest("hex");
}

function generateToken(userId: string): string {
  return crypto.createHash("sha256").update(userId + Date.now() + Math.random()).digest("hex");
}

// Simple in-memory token store (per-request, but works for preview)
const tokens = new Map<string, string>(); // token → userId

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const { action, email, password, name, token } = await req.json();

    if (action === "signup") {
      if (!email || !password) {
        return NextResponse.json({ error: "Email and password required" }, { status: 400, headers: cors });
      }

      const existing = await prisma.appUser.findUnique({
        where: { projectId_email: { projectId, email } },
      });
      if (existing) {
        return NextResponse.json({ error: "User already exists" }, { status: 409, headers: cors });
      }

      const user = await prisma.appUser.create({
        data: {
          projectId,
          email,
          password: hashPassword(password),
          name: name || null,
        },
      });

      const t = generateToken(user.id);
      tokens.set(t, user.id);

      return NextResponse.json(
        { user: { id: user.id, email: user.email, name: user.name }, token: t },
        { headers: cors }
      );
    }

    if (action === "login") {
      if (!email || !password) {
        return NextResponse.json({ error: "Email and password required" }, { status: 400, headers: cors });
      }

      const user = await prisma.appUser.findUnique({
        where: { projectId_email: { projectId, email } },
      });
      if (!user || user.password !== hashPassword(password)) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401, headers: cors });
      }

      const t = generateToken(user.id);
      tokens.set(t, user.id);

      return NextResponse.json(
        { user: { id: user.id, email: user.email, name: user.name }, token: t },
        { headers: cors }
      );
    }

    if (action === "me") {
      if (!token) {
        return NextResponse.json({ error: "Token required" }, { status: 401, headers: cors });
      }

      const userId = tokens.get(token);
      if (!userId) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401, headers: cors });
      }

      const user = await prisma.appUser.findUnique({ where: { id: userId } });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404, headers: cors });
      }

      return NextResponse.json(
        { user: { id: user.id, email: user.email, name: user.name } },
        { headers: cors }
      );
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: cors });
  } catch (error) {
    console.error("App auth error:", error);
    return NextResponse.json({ error: "Auth failed" }, { status: 500, headers: cors });
  }
}
