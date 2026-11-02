import { NextRequest, NextResponse } from "next/server";
import { getEnv, PassType } from "@/lib/db";
import { parseParticipantCsv } from "@/lib/csv";
import { newId, newToken } from "@/lib/id";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const { DB } = await getEnv();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach the CSV as form field 'file'." }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "CSV too large (max 2 MB)." }, { status: 400 });

  const parsed = parseParticipantCsv(await file.text());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.rows.length === 0) return NextResponse.json({ error: "No participant rows found." }, { status: 400 });

  const { results: passes } = await DB.prepare(`SELECT * FROM pass_types`).all<PassType>();
  const passByName = new Map(passes.map((p) => [p.name.toLowerCase(), p]));

  const errors: { row: number; message: string }[] = [];
  let imported = 0;
  let updated = 0;
  const seenEmails = new Set<string>();

  for (const row of parsed.rows) {
    if (!row.name) { errors.push({ row: row.rowNumber, message: "Missing name." }); continue; }
    if (!EMAIL_RE.test(row.email)) { errors.push({ row: row.rowNumber, message: `Invalid email "${row.email}".` }); continue; }
    const pass = passByName.get(row.pass.toLowerCase());
    if (!row.pass) { errors.push({ row: row.rowNumber, message: "Missing pass type." }); continue; }
    if (!pass) {
      errors.push({
        row: row.rowNumber,
        message: `Unknown pass type "${row.pass}". Create it in the Passes page first.`,
      });
      continue;
    }
    const emailKey = row.email.toLowerCase();
    if (seenEmails.has(emailKey)) { errors.push({ row: row.rowNumber, message: `Duplicate email in file: ${row.email}.` }); continue; }
    seenEmails.add(emailKey);

    const existing = await DB.prepare(`SELECT id FROM participants WHERE email = ?`).bind(row.email).first<{ id: string }>();
    if (existing) {
      await DB.prepare(`UPDATE participants SET name = ?, pass_type_id = ? WHERE id = ?`)
        .bind(row.name, pass.id, existing.id)
        .run();
      updated++;
    } else {
      await DB.prepare(
        `INSERT INTO participants (id, name, email, pass_type_id, token) VALUES (?, ?, ?, ?, ?)`
      ).bind(newId(), row.name, row.email, pass.id, newToken()).run();
      imported++;
    }
  }

  return NextResponse.json({ imported, updated, failed: errors.length, errors: errors.slice(0, 50) });
}
