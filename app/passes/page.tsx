import { getEnv, PassType } from "@/lib/db";
import PassManager from "./PassManager";

export const dynamic = "force-dynamic";

export default async function PassesPage() {
  const { DB } = await getEnv();
  const passes = (await DB.prepare(
    `SELECT pt.*, (SELECT COUNT(*) FROM participants p WHERE p.pass_type_id = pt.id) AS participant_count
     FROM pass_types pt ORDER BY pt.created_at ASC`
  ).all<PassType & { participant_count: number }>()).results;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pass types</h1>
        <p className="text-sm text-zinc-500">
          Create the ticket levels your event offers. CSV uploads only accept pass names that exist here (matching is case-insensitive).
        </p>
      </div>
      <PassManager passes={passes} />
    </div>
  );
}
