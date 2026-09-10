import { handler, ok, db, requireUser, ApiError } from "@/lib/pos/api";
import { receiveGoods, getUnputawayItems } from "@/lib/pos/receiving";
import { num, str } from "@/lib/db";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as {
    supplierId?: number | null;
    supplierDoc?: string | null;
    note?: string;
    lines?: { productId: number; qty: number; unitCost: number; locationId: number }[];
  };
  if (!body.lines?.length) throw new ApiError("ไม่มีรายการสินค้าที่รับเข้า");
  return ok(
    await receiveGoods(await db(), {
      supplierId: body.supplierId ?? null,
      supplierDoc: body.supplierDoc ?? null,
      note: body.note,
      lines: body.lines,
      userId: user.id,
    })
  );
});

/** ของที่ค้างจุดพักของ ยังไม่ได้เก็บเข้าชั้น */
export const GET = handler(async () => {
  await requireUser();
  const pool = await db();
  const suppliers = await pool.query<Record<string, unknown>>(
    "SELECT id, code, name FROM supplier WHERE is_active ORDER BY name"
  );
  return ok({
    unputaway: await getUnputawayItems(pool),
    suppliers: suppliers.rows.map((r) => ({
      id: num(r.id),
      code: str(r.code),
      name: str(r.name),
    })),
  });
});
