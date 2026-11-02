import { NextRequest, NextResponse } from "next/server";
import { getEnv, PassType } from "@/lib/db";
import { newId } from "@/lib/id";

export const dynamic = "force-dynamic";

export async function GET() {
  const { DB } = await getEnv();
  const { results } = await DB.prepare(
    `SELECT pt.*, (SELECT COUNT(*) FROM participants p WHERE p.pass_type_id = pt.id) AS participant_count
     FROM pass_types pt ORDER BY pt.created_at ASC`
  ).all();
  return NextResponse.json({ passTypes: results });
}

export async function POST(req: NextRequest) {
  const { DB } = await getEnv();
  let body: { name?: unknown; description?: unknown; color?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Pass name is required." }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "Pass name is too long (max 60)." }, { status: 400 });
  const color = typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : "#6366f1";

  const existing = await DB.prepare(`SELECT id FROM pass_types WHERE name = ?`).bind(name).first();
  if (existing) return NextResponse.json({ error: `A pass named "${name}" already exists.` }, { status: 409 });

  const id = newId();
  await DB.prepare(`INSERT INTO pass_types (id, name, description, color) VALUES (?, ?, ?, ?)`)
    .bind(id, name, typeof body.description === "string" ? body.description.trim() : "", color)
    .run();
  const pass = await DB.prepare(`SELECT * FROM pass_types WHERE id = ?`).bind(id).first<PassType>();
  return NextResponse.json({ passType: pass }, { status: 201 });
}
