import { handler, ok, db, requireUser, ApiError } from "@/lib/pos/api";
import { transferStock } from "@/lib/pos/stock";

export const dynamic = "force-dynamic";

/**
 * ย้ายของระหว่างช่อง
 *
 * ใช้ 2 กรณีหลัก:
 *   1. เติมของหน้าร้านจากสโตร์
 *   2. ย้ายของที่ค้างจุดพักของเข้าชั้นจริง
 * ทั้งสองกรณีคือการทำให้ "ตำแหน่งในระบบ" ตรงกับ "ตำแหน่งจริง"
 * ซึ่งเป็นงานที่ต้องง่ายที่สุด ไม่งั้นไม่มีใครทำ
 */
export const POST = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as {
    productId?: number;
    fromLocationId?: number;
    toLocationId?: number;
    qty?: number;
    note?: string;
  };
  if (!body.productId || !body.fromLocationId || !body.toLocationId || !body.qty) {
    throw new ApiError("ต้องระบุสินค้า ช่องต้นทาง ช่องปลายทาง และจำนวน");
  }
  const pool = await db();
  return ok(
    await pool.transaction((tx) =>
      transferStock(tx, {
        productId: body.productId!,
        fromLocationId: body.fromLocationId!,
        toLocationId: body.toLocationId!,
        qty: body.qty!,
        note: body.note,
        userId: user.id,
      })
    )
  );
});
