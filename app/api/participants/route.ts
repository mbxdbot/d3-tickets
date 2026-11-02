import { NextRequest, NextResponse } from "next/server";
import { getEnv, PARTICIPANT_SELECT, ParticipantWithPass } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { DB } = await getEnv();
  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // checked_in | not_checked_in
  const passId = url.searchParams.get("pass");
  const q = (url.searchParams.get("q") || "").trim();

  const where: string[] = [];
  const binds: string[] = [];
  if (status === "checked_in") where.push("p.checked_in_at IS NOT NULL");
  if (status === "not_checked_in") where.push("p.checked_in_at IS NULL");
  if (passId) { where.push("p.pass_type_id = ?"); binds.push(passId); }
  if (q) { where.push("(p.name LIKE ? OR p.email LIKE ?)"); binds.push(`%${q}%`, `%${q}%`); }

  const sql = `${PARTICIPANT_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.created_at DESC LIMIT 1000`;
  const { results } = await DB.prepare(sql).bind(...binds).all<ParticipantWithPass>();
  return NextResponse.json({ participants: results });
}
