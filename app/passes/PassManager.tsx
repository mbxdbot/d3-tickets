"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PassRow {
  id: string;
  name: string;
  description: string;
  color: string;
  participant_count: number;
}

const COLORS = ["#6366f1", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#9333ea", "#db2777", "#111827"];

export default function PassManager({ passes }: { passes: PassRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createPass(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pass-types", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, color }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create pass.");
      setName(""); setDescription("");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Network error. Could not reach the server.");
    } finally { setBusy(false); }
  }

  async function deletePass(id: string) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/pass-types/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete pass.");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Network error. Could not reach the server.");
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_360px]">
      <section className="rounded-xl border border-zinc-200 bg-white">
        {passes.length === 0 ? (
          <div className="px-4 py-8 text-sm text-zinc-500">No passes yet. Create your first one on the right - e.g. General, VIP, Speaker.</div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {passes.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    {p.description && <div className="text-xs text-zinc-500">{p.description}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 tabular-nums">{p.participant_count} participants</span>
                  <button
                    disabled={busy}
                    onClick={() => deletePass(p.id)}
                    className="rounded-md px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={createPass} className="h-fit space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-medium">New pass type</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. VIP)"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
          required
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Badge color</span>
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-zinc-800 ring-offset-2" : ""}`}
                style={{ background: c }}
                aria-label={`color ${c}`}
              />
            ))}
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? "Creating..." : "Create pass"}
        </button>
      </form>
    </div>
  );
}
