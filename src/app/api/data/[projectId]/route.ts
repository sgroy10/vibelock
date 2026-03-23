import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Built-in database API for user apps.
 * Simple key-value store backed by PostgreSQL.
 * No auth required — apps in WebContainer call this directly.
 *
 * GET /api/data/[projectId]?key=todos → get one key
 * GET /api/data/[projectId] → get all keys
 * POST /api/data/[projectId] { key, value } → set a key
 * DELETE /api/data/[projectId]?key=todos → delete a key
 */

// Allow CORS for WebContainer iframe
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const key = req.nextUrl.searchParams.get("key");

  try {
    if (key) {
      const data = await prisma.projectData.findUnique({
        where: { projectId_key: { projectId, key } },
      });
      if (!data) {
        return NextResponse.json({ value: null }, { headers: corsHeaders });
      }
      return NextResponse.json(
        { key: data.key, value: JSON.parse(data.value) },
        { headers: corsHeaders }
      );
    }

    // Return all keys
    const allData = await prisma.projectData.findMany({
      where: { projectId },
      select: { key: true, value: true, updatedAt: true },
    });

    const result = allData.map((d) => ({
      key: d.key,
      value: JSON.parse(d.value),
      updatedAt: d.updatedAt,
    }));

    return NextResponse.json({ data: result }, { headers: corsHeaders });
  } catch (error) {
    console.error("Data GET error:", error);
    return NextResponse.json(
      { error: "Failed to read data" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const { key, value } = await req.json();

    if (!key) {
      return NextResponse.json(
        { error: "key is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const data = await prisma.projectData.upsert({
      where: { projectId_key: { projectId, key } },
      update: { value: JSON.stringify(value) },
      create: { projectId, key, value: JSON.stringify(value) },
    });

    return NextResponse.json(
      { key: data.key, value: JSON.parse(data.value) },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Data POST error:", error);
    return NextResponse.json(
      { error: "Failed to save data" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const key = req.nextUrl.searchParams.get("key");

  try {
    if (key) {
      await prisma.projectData.delete({
        where: { projectId_key: { projectId, key } },
      });
      return NextResponse.json({ deleted: true }, { headers: corsHeaders });
    }

    // Delete all project data
    await prisma.projectData.deleteMany({ where: { projectId } });
    return NextResponse.json({ deleted: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("Data DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete data" },
      { status: 500, headers: corsHeaders }
    );
  }
}
