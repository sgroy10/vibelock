import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * VibeLock Built-in Database API
 * Dynamic tables backed by Railway PostgreSQL.
 * Generated apps call this — zero config for users.
 *
 * GET    /api/db/[projectId]?table=products              → list all rows
 * GET    /api/db/[projectId]?table=products&id=abc       → get one row
 * POST   /api/db/[projectId] { table, data }             → insert row
 * PUT    /api/db/[projectId] { id, table, data }         → update row
 * DELETE /api/db/[projectId]?table=products&id=abc       → delete row
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const table = req.nextUrl.searchParams.get("table");
  const id = req.nextUrl.searchParams.get("id");
  const search = req.nextUrl.searchParams.get("search");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");

  if (!table) {
    // List all tables for this project
    const tables = await prisma.appTable.groupBy({
      by: ["tableName"],
      where: { projectId },
      _count: true,
    });
    return NextResponse.json(
      { tables: tables.map((t) => ({ name: t.tableName, count: t._count })) },
      { headers: cors }
    );
  }

  if (id) {
    const row = await prisma.appTable.findFirst({
      where: { id, projectId, tableName: table },
    });
    if (!row) return NextResponse.json({ row: null }, { headers: cors });
    return NextResponse.json(
      { row: { id: row.id, ...JSON.parse(row.data), _createdAt: row.createdAt } },
      { headers: cors }
    );
  }

  // List rows with optional search
  let rows = await prisma.appTable.findMany({
    where: { projectId, tableName: table },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  let parsed = rows.map((r) => ({
    id: r.id,
    ...JSON.parse(r.data),
    _createdAt: r.createdAt,
  }));

  // Client-side search across all fields
  if (search) {
    const q = search.toLowerCase();
    parsed = parsed.filter((row) =>
      Object.values(row).some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q)
      )
    );
  }

  return NextResponse.json({ rows: parsed, count: parsed.length }, { headers: cors });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const { table, data } = await req.json();
    if (!table || !data) {
      return NextResponse.json({ error: "table and data required" }, { status: 400, headers: cors });
    }

    const row = await prisma.appTable.create({
      data: {
        projectId,
        tableName: table,
        data: JSON.stringify(data),
      },
    });

    return NextResponse.json(
      { row: { id: row.id, ...data, _createdAt: row.createdAt } },
      { headers: cors }
    );
  } catch (error) {
    console.error("DB insert error:", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500, headers: cors });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const { id, table, data } = await req.json();
    if (!id || !table || !data) {
      return NextResponse.json({ error: "id, table, and data required" }, { status: 400, headers: cors });
    }

    const row = await prisma.appTable.updateMany({
      where: { id, projectId, tableName: table },
      data: { data: JSON.stringify(data) },
    });

    if (row.count === 0) {
      return NextResponse.json({ error: "Row not found" }, { status: 404, headers: cors });
    }

    return NextResponse.json({ updated: true, id }, { headers: cors });
  } catch (error) {
    console.error("DB update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500, headers: cors });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const table = req.nextUrl.searchParams.get("table");
  const id = req.nextUrl.searchParams.get("id");

  try {
    if (id) {
      await prisma.appTable.deleteMany({ where: { id, projectId } });
      return NextResponse.json({ deleted: true }, { headers: cors });
    }
    if (table) {
      const result = await prisma.appTable.deleteMany({ where: { projectId, tableName: table } });
      return NextResponse.json({ deleted: true, count: result.count }, { headers: cors });
    }
    return NextResponse.json({ error: "id or table required" }, { status: 400, headers: cors });
  } catch (error) {
    console.error("DB delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500, headers: cors });
  }
}
