import Scanner from "./Scanner";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Check-in scanner</h1>
        <p className="text-sm text-zinc-500">
          Point the camera at a participant&apos;s QR code. The pass type is read straight from the code and verified against the guest list.
        </p>
      </div>
      <Scanner />
    </div>
  );
}
