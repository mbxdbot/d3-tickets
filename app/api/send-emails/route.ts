import { NextRequest, NextResponse } from "next/server";
import { getEnv, PARTICIPANT_SELECT, ParticipantWithPass } from "@/lib/db";
import { sendTicketEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const env = await getEnv();
  const { DB } = env;
  let resend = false;
  let limit = 50;
  try {
    const body = (await req.json()) as { resend?: unknown; limit?: unknown };
    resend = !!body.resend;
    if (typeof body.limit === "number") limit = Math.min(Math.max(1, body.limit), 500);
  } catch { /* empty body is fine */ }

  const filter = resend ? "" : `WHERE p.email_status IN ('pending', 'failed')`;
  const { results } = await DB.prepare(
    `${PARTICIPANT_SELECT} ${filter} ORDER BY p.created_at ASC LIMIT ?`
  ).bind(limit).all<ParticipantWithPass>();

  const baseUrl = (env.APP_BASE_URL || new URL(req.url).origin).replace(/\/$/, "");
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
      baseUrl,
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
  });
}
