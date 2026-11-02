import { NextRequest, NextResponse } from "next/server";
import { getEnv, PARTICIPANT_SELECT, ParticipantWithPass } from "@/lib/db";
import { sendTicketEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const env = await getEnv();
  const { DB } = env;
  let resend = false;
  let limit = 25;
  let after = "";
  let through = "";
  try {
    const body = (await req.json()) as { resend?: unknown; limit?: unknown; after?: unknown; through?: unknown };
    resend = body.resend === true;
    if (typeof body.after === "string") after = body.after;
    if (typeof body.through === "string") through = body.through;
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) limit = Math.min(Math.max(1, Math.floor(body.limit)), 25);
  } catch { /* empty body is fine */ }

  // Freeze the upper ID boundary for this run. IDs are immutable, so every
  // batch advances even if some sends fail. Avoid concurrent imports while sending.
  if (!through) through = (await DB.prepare("SELECT MAX(id) AS id FROM participants").first<{ id: string | null }>())?.id || "";
  const filter = resend ? "" : "AND p.email_status IN ('pending', 'failed')";
  const { results } = await DB.prepare(
    `${PARTICIPANT_SELECT} WHERE p.id > ? AND p.id <= ? ${filter} ORDER BY p.id ASC LIMIT ?`
  ).bind(after, through, limit).all<ParticipantWithPass>();

  const mode = (env.EMAIL_MODE || "mock").toLowerCase() === "ses" ? "ses" : "mock";

  let sent = 0;
  let failed = 0;
  const failures: { email: string; error: string }[] = [];

  for (const p of results) {
    const r = await sendTicketEmail(env, {
      toEmail: p.email,
      toName: p.name,
      passName: p.pass_name,
      token: p.token,
    });
    if (r.ok) {
      sent++;
      await DB.prepare(
        `UPDATE participants SET email_status = ?, email_error = NULL, emailed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
      ).bind(r.mode === "mock" ? "mocked" : "sent", p.id).run();
    } else {
      failed++;
      failures.push({ email: p.email, error: r.error || "unknown" });
      await DB.prepare(`UPDATE participants SET email_status = 'failed', email_error = ? WHERE id = ?`)
        .bind(r.error || "unknown", p.id)
        .run();
    }
  }

  const remaining = await DB.prepare(
    `SELECT COUNT(*) AS n FROM participants WHERE email_status IN ('pending', 'failed')`
  ).first<{ n: number }>();

  return NextResponse.json({
    mode,
    attempted: results.length,
    sent,
    failed,
    remainingUnsent: remaining?.n ?? 0,
    failures: failures.slice(0, 20),
    through,
    nextCursor: results.length === limit ? results[results.length - 1].id : null,
  });
}
