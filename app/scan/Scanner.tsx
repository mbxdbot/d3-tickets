"use client";

import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";

interface CheckinResponse {
  status: "ok" | "already" | "invalid";
  participant?: { name: string; email: string; passName: string; passColor: string };
  checkedInAt?: string;
  embeddedPass?: string | null;
  passMismatch?: boolean;
  error?: string;
}

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    return () => controlsRef.current?.stop();
  }, []);

  async function start() {
    setCameraError(null);
    setResult(null);
    try {
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 300 });
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current!, async (res) => {
        if (!res) return;
        const code = res.getText();
        const now = Date.now();
        if (lastRef.current && lastRef.current.code === code && now - lastRef.current.at < 4000) return;
        lastRef.current = { code, at: now };
        await submit(code);
      });
      setRunning(true);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "Camera unavailable. Use the manual code box below.");
    }
  }

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setRunning(false);
  }

  async function submit(code: string) {
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      setResult(await res.json());
    } catch {
      setResult({ status: "invalid", error: "Network error - could not reach the server." });
    }
  }

  const tone =
    result?.status === "ok"
      ? "border-green-300 bg-green-50"
      : result?.status === "already"
        ? "border-amber-300 bg-amber-50"
        : "border-red-300 bg-red-50";

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-black">
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      </div>
      <div className="flex gap-2">
        {!running ? (
          <button onClick={start} className="flex-1 rounded-md bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-700">
            Start camera
          </button>
        ) : (
          <button onClick={stop} className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm hover:bg-zinc-50">
            Stop camera
          </button>
        )}
      </div>
      {cameraError && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{cameraError}</div>}

      {result && (
        <div className={`rounded-xl border p-4 ${tone}`}>
          {result.status === "ok" && result.participant && (
            <>
              <div className="text-lg font-bold text-green-800">Checked in</div>
              <div className="mt-1 text-sm">
                {result.participant.name} -{" "}
                <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: result.participant.passColor }}>
                  {result.participant.passName}
                </span>
              </div>
            </>
          )}
          {result.status === "already" && result.participant && (
            <>
              <div className="text-lg font-bold text-amber-800">Already checked in</div>
              <div className="mt-1 text-sm">
                {result.participant.name} ({result.participant.passName}) entered at{" "}
                {result.checkedInAt ? new Date(result.checkedInAt).toLocaleString("en-IN", { timeZone: "Asia/Calcutta" }) : "?"}
              </div>
            </>
          )}
          {result.status === "invalid" && <div className="text-sm font-medium text-red-800">{result.error || "Unknown code."}</div>}
          {result.passMismatch && (
            <div className="mt-2 text-xs font-medium text-red-700">
              Warning: the pass stored on this QR (&quot;{result.embeddedPass}&quot;) does not match the guest list record.
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); if (manual.trim()) submit(manual.trim()); }}
        className="flex gap-2"
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type a code manually"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-500"
        />
        <button className="rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm hover:bg-zinc-50">Check in</button>
      </form>
    </div>
  );
}
