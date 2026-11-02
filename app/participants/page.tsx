import { getEnv, PARTICIPANT_SELECT, ParticipantWithPass, PassType } from "@/lib/db";
import ParticipantsClient from "./ParticipantsClient";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  const { DB } = await getEnv();
  const participants = (await DB.prepare(
    `${PARTICIPANT_SELECT} ORDER BY p.created_at DESC LIMIT 1000`
  ).all<ParticipantWithPass>()).results;
  const passes = (await DB.prepare(`SELECT * FROM pass_types ORDER BY created_at ASC`).all<PassType>()).results;
  const emailMode = ((await getEnv()).EMAIL_MODE || "mock").toLowerCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Participants</h1>
        <p className="text-sm text-zinc-500">
          Upload a CSV with columns <code className="rounded bg-zinc-200 px-1">name,email,pass</code>. Every pass value must match a pass type from the Passes page.
        </p>
      </div>
      <ParticipantsClient participants={participants} passes={passes} emailMode={emailMode} />
    </div>
  );
}
