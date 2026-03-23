import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * VibeLock Built-in File Storage
 * Stores files as base64 in PostgreSQL (up to 5MB per file).
 *
 * GET    /api/files/[projectId]              → list files
 * GET    /api/files/[projectId]?id=abc       → get file
 * POST   /api/files/[projectId]              → upload (multipart or base64 JSON)
 * DELETE /api/files/[projectId]?id=abc       → delete file
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const file = await prisma.appFile.findFirst({ where: { id, projectId } });
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404, headers: cors });

    // Return the file as a data URL
    return NextResponse.json(
      {
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        dataUrl: `data:${file.mimeType};base64,${file.data}`,
        createdAt: file.createdAt,
      },
      { headers: cors }
    );
  }

  const files = await prisma.appFile.findMany({
    where: { projectId },
    select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ files }, { headers: cors });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const { fileName, mimeType, data } = await req.json();

    if (!fileName || !data) {
      return NextResponse.json({ error: "fileName and data required" }, { status: 400, headers: cors });
    }

    // data should be base64
    const size = Math.ceil(data.length * 0.75); // approximate decoded size
    if (size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413, headers: cors });
    }

    const file = await prisma.appFile.create({
      data: {
        projectId,
        fileName,
        mimeType: mimeType || "application/octet-stream",
        size,
        data,
      },
    });

    return NextResponse.json(
      { id: file.id, fileName: file.fileName, size: file.size },
      { headers: cors }
    );
  } catch (error) {
    console.error("File upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500, headers: cors });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400, headers: cors });
  }

  await prisma.appFile.deleteMany({ where: { id, projectId } });
  return NextResponse.json({ deleted: true }, { headers: cors });
}
