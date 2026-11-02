import { NextResponse } from "next/server";
import { getEnv } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { DB } = await getEnv();
  const totals = await DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN email_status IN ('sent','mocked') THEN 1 ELSE 0 END) AS emailed,
            SUM(CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END) AS email_failed,
            SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS checked_in
     FROM participants`
  ).first();
  const perPass = await DB.prepare(
    `SELECT pt.id, pt.name, pt.color,
            COUNT(p.id) AS total,
            SUM(CASE WHEN p.email_status IN ('sent','mocked') THEN 1 ELSE 0 END) AS emailed,
            SUM(CASE WHEN p.checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS checked_in
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
