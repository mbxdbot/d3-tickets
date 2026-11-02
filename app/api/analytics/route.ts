import { NextResponse } from "next/server";
import { getEnv } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { DB } = await getEnv();
  const totals = await DB.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN email_status = 'sent' THEN 1 ELSE 0 END), 0) AS emailed,
            COALESCE(SUM(CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END), 0) AS email_failed,
            COALESCE(SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS checked_in
     FROM participants`
  ).first();
  const perPass = await DB.prepare(
    `SELECT pt.id, pt.name, pt.color,
            COUNT(p.id) AS total,
            COALESCE(SUM(CASE WHEN p.email_status = 'sent' THEN 1 ELSE 0 END), 0) AS emailed,
            COALESCE(SUM(CASE WHEN p.checked_in_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS checked_in
     FROM pass_types pt LEFT JOIN participants p ON p.pass_type_id = pt.id
     GROUP BY pt.id ORDER BY pt.created_at ASC`
  ).all();
  const recent = await DB.prepare(
    `SELECT p.name, p.email, pt.name AS pass_name, pt.color AS pass_color, p.checked_in_at
     FROM participants p JOIN pass_types pt ON pt.id = p.pass_type_id
     WHERE p.checked_in_at IS NOT NULL ORDER BY p.checked_in_at DESC LIMIT 20`
  ).all();
  return NextResponse.json({ totals, perPass: perPass.results, recentCheckins: recent.results });
}
