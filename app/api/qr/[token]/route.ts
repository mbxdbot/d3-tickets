import { NextRequest, NextResponse } from "next/server";
import { getEnv, PARTICIPANT_SELECT, ParticipantWithPass } from "@/lib/db";
import { qrPng, encodePayload } from "@/lib/qr";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.png$/, "");
  const { DB } = await getEnv();
  const p = await DB.prepare(`${PARTICIPANT_SELECT} WHERE p.token = ?`).bind(token).first<ParticipantWithPass>();
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const png = await qrPng(encodePayload({ v: 1, t: p.token, p: p.pass_name, n: p.name }));
  return new NextResponse(png as unknown as BodyInit, {
    headers: { "content-type": "image/png", "cache-control": "private, no-store" },
  });
}
