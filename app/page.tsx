import { getEnv } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Totals { total: number; emailed: number; email_failed: number; checked_in: number }
interface PerPass { id: string; name: string; color: string; total: number; emailed: number; checked_in: number }
interface Recent { name: string; email: string; pass_name: string; pass_color: string; checked_in_at: string }

export default async function Dashboard() {
  const { DB } = await getEnv();
  const totals = (await DB.prepare(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN email_status = 'sent' THEN 1 ELSE 0 END),0) AS emailed,
            COALESCE(SUM(CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END),0) AS email_failed,
            COALESCE(SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END),0) AS checked_in
     FROM participants`
  ).first<Totals>()) ?? { total: 0, emailed: 0, email_failed: 0, checked_in: 0 };

  const perPass = (await DB.prepare(
    `SELECT pt.id, pt.name, pt.color, COUNT(p.id) AS total,
            COALESCE(SUM(CASE WHEN p.checked_in_at IS NOT NULL THEN 1 ELSE 0 END),0) AS checked_in,
            COALESCE(SUM(CASE WHEN p.email_status = 'sent' THEN 1 ELSE 0 END),0) AS emailed
     FROM pass_types pt LEFT JOIN participants p ON p.pass_type_id = pt.id
     GROUP BY pt.id ORDER BY pt.created_at ASC`
  ).all<PerPass>()).results;

  const recent = (await DB.prepare(
    `SELECT p.name, p.email, pt.name AS pass_name, pt.color AS pass_color, p.checked_in_at
     FROM participants p JOIN pass_types pt ON pt.id = p.pass_type_id
     WHERE p.checked_in_at IS NOT NULL ORDER BY p.checked_in_at DESC LIMIT 15`
  ).all<Recent>()).results;

  const pct = totals.total ? Math.round((totals.checked_in / totals.total) * 100) : 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-lg font-semibold sm:text-xl">Check-in analytics</h1>
        <p className="text-sm text-zinc-500">Live view of invitations and door check-ins.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Participants" value={totals.total} />
        <StatCard label="Invites sent" value={totals.emailed} sub={totals.email_failed ? `${totals.email_failed} failed` : undefined} />
        <StatCard label="Checked in" value={totals.checked_in} />
        <StatCard label="Check-in rate" value={`${pct}%`} />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3 text-sm font-medium">Per pass type</div>
        {perPass.length === 0 ? (
          <EmptyNote>No passes yet. Create them on the <Link className="underline" href="/passes">Passes</Link> page.</EmptyNote>
        ) : (
          <>
            {/* mobile: cards */}
            <ul className="divide-y divide-zinc-100 sm:hidden">
              {perPass.map((p) => {
                const w = p.total ? Math.round((p.checked_in / p.total) * 100) : 0;
                return (
                  <li key={p.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-medium">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </span>
                      <span className="text-xs text-zinc-500 tabular-nums">
                        {p.checked_in}/{p.total} in
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-zinc-100">
                      <div className="h-2 rounded-full" style={{ width: `${w}%`, background: p.color }} />
                    </div>
                    <div className="mt-1 text-xs text-zinc-400 tabular-nums">{p.emailed} invited</div>
                  </li>
                );
              })}
            </ul>
            {/* sm+: table */}
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2">Pass</th>
                  <th className="px-4 py-2">Participants</th>
                  <th className="px-4 py-2">Invited</th>
                  <th className="px-4 py-2">Checked in</th>
                  <th className="w-1/3 px-4 py-2">Progress</th>
                </tr>
              </thead>
              <tbody>
                {perPass.map((p) => {
                  const w = p.total ? Math.round((p.checked_in / p.total) * 100) : 0;
                  return (
                    <tr key={p.id} className="border-t border-zinc-100">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                          {p.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{p.total}</td>
                      <td className="px-4 py-2.5 tabular-nums">{p.emailed}</td>
                      <td className="px-4 py-2.5 tabular-nums">{p.checked_in}</td>
                      <td className="px-4 py-2.5">
                        <div className="h-2 rounded-full bg-zinc-100">
                          <div className="h-2 rounded-full" style={{ width: `${w}%`, background: p.color }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3 text-sm font-medium">Recent check-ins</div>
        {recent.length === 0 ? (
          <EmptyNote>Nobody checked in yet. The <Link className="underline" href="/scan">Scanner</Link> is ready when doors open.</EmptyNote>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-xs text-zinc-500">{r.email}</div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: r.pass_color }}>
                    {r.pass_name}
                  </span>
                  <div className="mt-0.5 text-xs text-zinc-400">{new Date(r.checked_in_at).toLocaleString("en-IN", { timeZone: "Asia/Calcutta" })}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      {sub && <div className="text-xs text-red-500">{sub}</div>}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-sm text-zinc-500">{children}</div>;
}
