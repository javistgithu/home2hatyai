import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { getStockByLocation } from "@/lib/pos/stock";
import { getLocationById } from "@/lib/pos/location";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req, { params }) => {
  await requireUser();
  const pool = await db();
  const id = Number(params.id);
  return ok({
    location: await getLocationById(pool, id),
    contents: await getStockByLocation(pool, id),
  });
});
