import { AwsClient } from "aws4fetch";
import type { AppEnv } from "./db";
import { qrPng, encodePayload } from "./qr";

export interface SendTicketArgs {
  toEmail: string;
  toName: string;
  passName: string;
  token: string;
}

export interface SendResult {
  ok: boolean;
  mode: "ses" | "mock";
  error?: string;
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function buildTicketHtml(a: SendTicketArgs): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;text-align:center;">
    <div style="font-size:20px;font-weight:700;color:#111827;">D<sup>3</sup> Ticketing</div>
    <p style="color:#374151;font-size:15px;">Hi ${escapeHtml(a.toName)}, here is your entry pass.</p>
    <div style="display:inline-block;border:2px solid #111827;border-radius:10px;padding:6px 18px;margin:8px 0 16px;font-weight:600;color:#111827;">${escapeHtml(a.passName)}</div>
    <div><img src="cid:pass-qr" width="220" height="220" alt="Your check-in QR code" style="display:block;margin:0 auto;" /></div>
    <p style="color:#6b7280;font-size:13px;margin-top:16px;">Show this QR code at the entrance to check in. If the image does not load, your check-in code is
      <span style="font-family:monospace;color:#111827;">${a.token}</span>.</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrap76(value: string): string {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

function buildMime(from: string, to: string, subject: string, html: string, png: Uint8Array): string {
  const boundary = "----d3ticket" + Math.random().toString(36).slice(2);
  const enc = new TextEncoder();
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(base64(enc.encode(html))),
    `--${boundary}`,
    'Content-Type: image/png; name="pass-qr.png"',
    "Content-Transfer-Encoding: base64",
    "Content-ID: <pass-qr>",
    'Content-Disposition: inline; filename="pass-qr.png"',
    "",
    wrap76(base64(png)),
    `--${boundary}--`,
    "",
  ];
  return lines.join("\r\n");
}

export async function sendTicketEmail(env: AppEnv, a: SendTicketArgs): Promise<SendResult> {
  const fromName = env.SES_FROM_NAME || "D3 Ticketing";
  const from = env.SES_FROM_EMAIL ? `${fromName} <${env.SES_FROM_EMAIL}>` : "";
  const subject = `Your ${a.passName} pass - D3 Ticketing`;
  const mode = (env.EMAIL_MODE || "mock").toLowerCase();
  const hasSes =
    mode === "ses" && env.SES_REGION && env.SES_ACCESS_KEY_ID && env.SES_SECRET_ACCESS_KEY && env.SES_FROM_EMAIL;

  if (mode === "mock") return { ok: true, mode: "mock" };
  if (!hasSes) return { ok: false, mode: "ses", error: "SES is not fully configured." };
  // Never permit header injection through imported CSV fields or sender settings.
  if ([fromName, env.SES_FROM_EMAIL || "", a.toEmail, subject].some((s) => /[\r\n]/.test(s))) {
    return { ok: false, mode: "ses", error: "Invalid email header value." };
  }

  try {
    const payload = encodePayload({ v: 1, t: a.token, p: a.passName, n: a.toName });
    const png = await qrPng(payload);
    const html = buildTicketHtml(a);
    const mime = buildMime(from, a.toEmail, subject, html, png);
    const aws = new AwsClient({
      accessKeyId: env.SES_ACCESS_KEY_ID!,
      secretAccessKey: env.SES_SECRET_ACCESS_KEY!,
      region: env.SES_REGION!,
      service: "ses",
    });
    const res = await aws.fetch(`https://email.${env.SES_REGION}.amazonaws.com/v2/email/outbound-emails`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ Content: { Raw: { Data: base64(new TextEncoder().encode(mime)) } } }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, mode: "ses", error: `SES ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true, mode: "ses" };
  } catch (err) {
    return { ok: false, mode: "ses", error: err instanceof Error ? err.message : String(err) };
  }
}
