import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { getCountQueue } from "@/lib/pos/count";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  await requireUser();
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 20);
  return ok(await getCountQueue(await db(), limit));
});
