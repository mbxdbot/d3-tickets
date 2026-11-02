import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { DB } = await getEnv();
  const inUse = await DB.prepare(`SELECT COUNT(*) AS n FROM participants WHERE pass_type_id = ?`).bind(id).first<{ n: number }>();
  if (inUse && inUse.n > 0) {
    return NextResponse.json(
      { error: `This pass is used by ${inUse.n} participant(s) and cannot be deleted.` },
      { status: 409 }
    );
  }
  const res = await DB.prepare(`DELETE FROM pass_types WHERE id = ?`).bind(id).run();
  if (!res.meta.changes) return NextResponse.json({ error: "Pass not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
