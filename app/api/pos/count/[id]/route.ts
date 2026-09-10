import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { getVariances, getPendingLines } from "@/lib/pos/count";
import { num, str, bool } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req, { params }) => {
  await requireUser();
  const pool = await db();
  const id = Number(params.id);

  const sess = await pool.query<Record<string, unknown>>(
    "SELECT id, doc_no, kind, status, is_blind, started_at FROM count_session WHERE id=$1",
    [id]
  );
  const s = sess.rows[0];

  return ok({
    session: s
      ? {
          id: num(s.id),
          docNo: str(s.doc_no),
          kind: str(s.kind),
          status: str(s.status),
          isBlind: bool(s.is_blind),
          startedAt: str(s.started_at),
        }
      : null,
    counted: await getVariances(pool, id),
    pending: await getPendingLines(pool, id),
  });
});
