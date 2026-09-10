import { handler, ok, fail, db, requireUser } from "@/lib/pos/api";
import { lookupProduct } from "@/lib/pos/catalog";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req, { params }) => {
  await requireUser();
  const result = await lookupProduct(await db(), Number(params.id));
  return result ? ok(result) : fail("ไม่พบสินค้านี้", 404);
});
