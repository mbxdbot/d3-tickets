import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { authorizeAdmin } from "../lib/admin-auth";
import { GET as analytics } from "../app/api/analytics/route";
import { POST as checkin } from "../app/api/checkin/route";
import { POST as createPass } from "../app/api/pass-types/route";
import { POST as sendEmails } from "../app/api/send-emails/route";
import { POST as importCsv } from "../app/api/participants/import/route";
import { sendTicketEmail } from "../lib/email";

interface TestResponse {
  totals: { total: number; emailed: number; email_failed: number; checked_in: number };
  perPass: { emailed: number }[];
  status: string; checkedInAt: string;
  attempted: number; sent: number; nextCursor: string; through: string;
  imported: number; updated: number;
}
async function readResponse(response: Response): Promise<TestResponse> {
  return await response.json() as TestResponse;
}

let db: DatabaseSync;
let env: Record<string, unknown>;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
  class Statement {
    values: (string | number | null)[] = [];
    constructor(public sql: string) {}
    bind(...values: (string | number | null)[]) { this.values = values; return this; }
    async first() { return db.prepare(this.sql).get(...this.values) || null; }
    async all() { return { results: db.prepare(this.sql).all(...this.values) }; }
    async run() { return { meta: { changes: db.prepare(this.sql).run(...this.values).changes } }; }
  }
  env = { EMAIL_MODE: "mock", DB: {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      db.exec("BEGIN");
      try { const results = []; for (const s of statements) results.push(await s.run()); db.exec("COMMIT"); return results; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  } };
  (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] = { env, ctx: {} };
  db.exec("INSERT INTO pass_types (id, name) VALUES ('vip', 'VIP')");
});
function participant(id: string, status = "pending") {
  db.prepare("INSERT INTO participants (id,name,email,pass_type_id,token,email_status) VALUES (?, ?, ?, 'vip', ?, ?)")
    .run(id, `Guest ${id}`, `${id}@example.com`, `token-${id}`, status);
}
function post(path: string, body: unknown) {
  return new NextRequest(`https://event.example${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("all paths fail closed until admin auth is configured and authenticated", async () => {
  const password = "test-only-password-123456789";
  for (const path of ["/", "/api/analytics", "/api/participants", "/scan", "/api/qr/token.png", "/_next/data/x"] ) {
    const url = `https://preview.example${path}`;
    assert.equal((await authorizeAdmin(new Request(url), {}))?.status, 503);
    assert.equal((await authorizeAdmin(new Request(url), { ADMIN_PASSWORD: password }))?.status, 401);
    assert.equal(await authorizeAdmin(new Request(url, { headers: { Authorization: `Basic ${btoa(`admin:${password}`)}` } }), { ADMIN_PASSWORD: password }), null);
  }
  const headers = { Authorization: `Basic ${btoa(`admin:${password}`)}`, Origin: "https://attacker.example" };
  assert.equal((await authorizeAdmin(new Request("https://event.example/api/checkin", { method: "POST", headers }), { ADMIN_PASSWORD: password }))?.status, 403);
});
test("analytics is numeric for empty lists and mocked tickets are not sent", async () => {
  assert.deepEqual((await readResponse(await analytics())).totals, { total: 0, emailed: 0, email_failed: 0, checked_in: 0 });
  participant("mock", "mocked"); participant("real", "sent");
  const body = await readResponse(await analytics());
  assert.equal(body.totals.emailed, 1); assert.equal(body.perPass[0].emailed, 1);
});
test("concurrent check-ins accept one scan and preserve first timestamp", async () => {
  participant("one");
  const responses = await Promise.all([checkin(post("/api/checkin", { code: "token-one" })), checkin(post("/api/checkin", { code: "token-one" }))]);
  const body = await Promise.all(responses.map(readResponse));
  assert.deepEqual(body.map((b) => b.status).sort(), ["already", "ok"]);
  assert.equal(body[0].checkedInAt, body[1].checkedInAt);
});
test("pass input handles null, arrays and non-string fields without throwing", async () => {
  for (const body of [null, [], { name: 5 }, { name: {} }]) assert.equal((await createPass(post("/api/pass-types", body))).status, 400);
  assert.equal((await createPass(post("/api/pass-types", { name: "General", description: 5, color: {} }))).status, 201);
});
test("resend pagination reaches all 61 guests exactly once, including same-timestamp rows", async () => {
  for (let i = 0; i < 61; i++) participant(`p${String(i).padStart(3, "0")}`, "sent");
  let after = "", through = "", attempted = 0;
  const batches = [];
  do {
    const data = await readResponse(await sendEmails(post("/api/send-emails", { resend: true, after, through })));
    attempted += data.attempted; batches.push(data.attempted);
    after = data.nextCursor; through = data.through;
  } while (after);
  assert.equal(attempted, 61); assert.deepEqual(batches, [25, 25, 11]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM participants WHERE email_status = 'mocked'").get()?.n, 61);
});
test("pending sends advance past failures instead of retrying forever", async () => {
  env.EMAIL_MODE = "ses"; // incomplete SES configuration intentionally fails every send
  for (let i = 0; i < 51; i++) participant(`p${String(i).padStart(3, "0")}`);
  let after = "", through = "", attempted = 0;
  do {
    const data = await readResponse(await sendEmails(post("/api/send-emails", { after, through })));
    assert.equal(data.sent, 0); attempted += data.attempted;
    after = data.nextCursor; through = data.through;
  } while (after);
  assert.equal(attempted, 51);
});
async function importRows(csv: string) {
  const form = new FormData(); form.set("file", new File([csv], "participants.csv", { type: "text/csv" }));
  return importCsv(new NextRequest("https://event.example/api/participants/import", { method: "POST", body: form }));
}
test("bounded CSV upserts keep tokens and reject oversized files before writes", async () => {
  participant("existing");
  const data = await readResponse(await importRows("name,email,pass\nUpdated,existing@example.com,VIP\nNew,new@example.com,VIP"));
  assert.equal(data.updated, 1); assert.equal(data.imported, 1);
  assert.equal(db.prepare("SELECT token FROM participants WHERE id = 'existing'").get()?.token, "token-existing");
  const large = "name,email,pass\n" + Array.from({ length: 501 }, (_, i) => `Guest,g${i}@example.com,VIP`).join("\n");
  assert.equal((await importRows(large)).status, 400);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM participants").get()?.n, 2);
});
test("SES MIME uses inline QR and wraps every encoded line; no real mail is sent", async () => {
  const originalFetch = globalThis.fetch;
  let raw = "";
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const body = await request.json() as { Content: { Raw: { Data: string } } };
    raw = Buffer.from(body.Content.Raw.Data, "base64").toString("utf8");
    return new Response("{}", { status: 200 });
  };
  try {
    const ses = { ...env, EMAIL_MODE: "ses", SES_REGION: "us-east-1", SES_ACCESS_KEY_ID: "TESTKEY", SES_SECRET_ACCESS_KEY: "test-only-secret", SES_FROM_EMAIL: "sender@example.com" };
    const args = { toEmail: "guest@example.com", toName: "Guest", passName: "VIP", token: "test-token" };
    const result = await sendTicketEmail(ses as never, args);
    assert.equal(result.ok, true);
    assert.ok(raw.includes("Content-ID: <pass-qr>"));
    assert.ok(raw.split("\r\n").every((line) => line.length <= 998));
    const html = Buffer.from(raw.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0], "base64").toString();
    assert.ok(html.includes('src="cid:pass-qr"')); assert.ok(!html.includes("/api/qr/"));
    assert.equal((await sendTicketEmail(ses as never, { ...args, passName: "VIP\r\nBcc: stolen@example.com" })).ok, false);
  } finally { globalThis.fetch = originalFetch; }
});
