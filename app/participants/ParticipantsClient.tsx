"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Row {
  id: string;
  name: string;
  email: string;
  pass_name: string;
  pass_color: string;
  token: string;
  email_status: string;
  email_error: string | null;
  checked_in_at: string | null;
}
interface Pass { id: string; name: string }

interface ImportResult {
  imported: number;
  updated: number;
  failed: number;
  errors: { row: number; message: string }[];
}
interface SendResult {
  mode: string;
  attempted: number;
  sent: number;
  failed: number;
  remainingUnsent: number;
  nextCursor?: string | null;
  through?: string;
}

export default function ParticipantsClient({
  participants,
  passes,
  emailMode,
}: {
  participants: Row[];
  passes: Pass[];
  emailMode: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"import" | "send" | null>(null);
  const [filter, setFilter] = useState("");
  const [passFilter, setPassFilter] = useState("");

  async function uploadCsv() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy("import");
    setImportResult(null);
    const form = new FormData();
    form.append("file", file);
    setActionError(null);
    try {
      const res = await fetch("/api/participants/import", { method: "POST", body: form });
      const data = (await res.json().catch(() => { throw new Error("The server returned an unreadable response. Check the connection and try again."); })) as ImportResult & { error?: string };
      if (!res.ok) {
        if (typeof data.imported === "number") setImportResult(data);
        throw new Error(data.error || "Import failed.");
      }
      setImportResult(data);
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Import failed. Check the connection.");
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function sendEmails(resend: boolean) {
    setBusy("send");
    setSendResult(null);
    setActionError(null);
    const total: SendResult = { mode: "", attempted: 0, sent: 0, failed: 0, remainingUnsent: 0 };
    let after: string | null = "";
    let through: string | undefined;
    try {
      do {
        const res = await fetch("/api/send-emails", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ resend, after, through }),
        });
        const data = (await res.json().catch(() => { throw new Error("The server returned an unreadable response."); })) as SendResult & { error?: string };
        if (!res.ok) throw new Error(data.error || "Send failed.");
        total.mode = data.mode;
        total.attempted += data.attempted;
        total.sent += data.sent;
        total.failed += data.failed;
        total.remainingUnsent = data.remainingUnsent;
        setSendResult({ ...total });
        after = data.nextCursor || null;
        through = data.through;
      } while (after);
    } catch (error) {
      setActionError(`${error instanceof Error ? error.message : "Send failed."} Sending stopped. Some invitations may already have been processed; refresh before retrying.`);
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const filtered = participants.filter((p) => {
    if (passFilter && p.pass_name !== passFilter) return false;
    if (filter && !(`${p.name} ${p.email}`.toLowerCase().includes(filter.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">1. Upload CSV</label>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm hover:file:bg-zinc-200" />
            <button
              onClick={uploadCsv}
              disabled={busy !== null}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {busy === "import" ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
        <div className="sm:border-l sm:border-zinc-200 sm:pl-3">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            2. Email QR passes {emailMode === "ses" ? "(via Amazon SES)" : "(mock mode - not sent)"}
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => sendEmails(false)}
              disabled={busy !== null}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy === "send" ? "Sending..." : "Send pending invites"}
            </button>
            <button
              onClick={() => sendEmails(true)}
              disabled={busy !== null}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            >
              Resend to all
            </button>
          </div>
        </div>
      </div>

      {actionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{actionError}</div>}

      {importResult && (
        <div className={`rounded-xl border p-4 text-sm ${importResult.failed === 0 ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {importResult.failed === -1 ? (
            <div>{importResult.errors[0]?.message}</div>
          ) : (
            <>
              <div>
                Imported <b>{importResult.imported}</b> new, updated <b>{importResult.updated}</b> existing, skipped <b>{importResult.failed}</b> rows.
              </div>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.message}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {sendResult && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          {sendResult.mode === "mock" ? "Mock run: " : ""}
          Processed {sendResult.attempted}, succeeded {sendResult.sent}, failed {sendResult.failed}.
          {sendResult.remainingUnsent > 0 && ` ${sendResult.remainingUnsent} still pending.`}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search name or email"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 sm:w-auto sm:py-1.5"
        />
        <select
          value={passFilter}
          onChange={(e) => setPassFilter(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none sm:w-auto sm:py-1.5"
        >
          <option value="">All passes</option>
          {passes.map((p) => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
        <span className="self-center text-xs text-zinc-400">{filtered.length} shown</span>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-sm text-zinc-500">No participants yet. Upload a CSV above.</div>
        ) : (
          <>
          {/* mobile: cards */}
          <ul className="divide-y divide-zinc-100 sm:hidden">
            {filtered.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="truncate text-xs text-zinc-500">{p.email}</div>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: p.pass_color }}>
                    {p.pass_name}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span>
                    {p.email_status === "sent" || p.email_status === "mocked" ? (
                      <span className="text-green-600">{p.email_status === "mocked" ? "invite mocked" : "invite sent"}</span>
                    ) : p.email_status === "failed" ? (
                      <span className="text-red-600">invite failed</span>
                    ) : (
                      <span className="text-zinc-400">invite pending</span>
                    )}
                  </span>
                  {p.checked_in_at ? (
                    <span className="font-medium text-green-700">
                      in {new Date(p.checked_in_at).toLocaleString("en-IN", { timeZone: "Asia/Calcutta" })}
                    </span>
                  ) : (
                    <span className="text-zinc-400">not checked in</span>
                  )}
                  <a href={`/api/qr/${p.token}.png`} target="_blank" className="text-indigo-600 underline">
                    QR
                  </a>
                </div>
              </li>
            ))}
          </ul>
          {/* sm+: table */}
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Pass</th>
                <th className="px-4 py-2">Invite</th>
                <th className="px-4 py-2">Check-in</th>
                <th className="px-4 py-2">QR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-zinc-100">
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-zinc-600">{p.email}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: p.pass_color }}>
                      {p.pass_name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.email_status === "sent" || p.email_status === "mocked" ? (
                      <span className="text-xs text-green-600">{p.email_status === "mocked" ? "mocked" : "sent"}</span>
                    ) : p.email_status === "failed" ? (
                      <span className="text-xs text-red-600" title={p.email_error || ""}>failed</span>
                    ) : (
                      <span className="text-xs text-zinc-400">pending</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.checked_in_at ? (
                      <span className="text-xs font-medium text-green-700">
                        {new Date(p.checked_in_at).toLocaleString("en-IN", { timeZone: "Asia/Calcutta" })}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <a href={`/api/qr/${p.token}.png`} target="_blank" className="text-xs text-indigo-600 underline">
                      view
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </section>
    </div>
  );
}
