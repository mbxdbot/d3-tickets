import { NextRequest, NextResponse } from "next/server";
import { getEnv, PARTICIPANT_SELECT, ParticipantWithPass } from "@/lib/db";
import { decodePayload } from "@/lib/qr";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { DB } = await getEnv();
  let raw: string;
  try {
    const body = (await req.json()) as { code?: unknown };
    raw = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!raw) return NextResponse.json({ error: "Missing code." }, { status: 400 });

  // Accept a full D3 payload (from our QR) or a bare token typed manually.
  const decoded = decodePayload(raw);
  const token = decoded ? decoded.t : raw.trim();
  if (!token) return NextResponse.json({ error: "Could not read a token from that code." }, { status: 400 });

  const p = await DB.prepare(`${PARTICIPANT_SELECT} WHERE p.token = ?`).bind(token).first<ParticipantWithPass>();
  if (!p) return NextResponse.json({ status: "invalid", error: "Unknown code. This pass is not registered." }, { status: 404 });

  // Cross-check the pass embedded in the QR against the record.
  const embeddedPass = decoded?.p ?? null;
  const passMismatch = embeddedPass !== null && embeddedPass.toLowerCase() !== p.pass_name.toLowerCase();

  if (p.checked_in_at) {
    return NextResponse.json({
      status: "already",
      participant: publicView(p),
      checkedInAt: p.checked_in_at,
      embeddedPass,
      passMismatch,
    });
  }

  const update = await DB.prepare(`UPDATE participants SET checked_in_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND checked_in_at IS NULL`)
    .bind(p.id).run();
  const fresh = await DB.prepare(`${PARTICIPANT_SELECT} WHERE p.id = ?`).bind(p.id).first<ParticipantWithPass>();
  return NextResponse.json({
    status: update.meta.changes ? "ok" : "already",
    participant: publicView(fresh!),
    checkedInAt: fresh!.checked_in_at,
    embeddedPass,
    passMismatch,
  });
}

function publicView(p: ParticipantWithPass) {
  return { name: p.name, email: p.email, passName: p.pass_name, passColor: p.pass_color };
}
