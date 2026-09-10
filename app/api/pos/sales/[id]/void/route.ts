import { handler, ok, db, requireOwner, ApiError } from "@/lib/pos/api";
import { voidSale } from "@/lib/pos/sales";

export const dynamic = "force-dynamic";

/**
 * ยกเลิกบิลได้เฉพาะเจ้าของ
 * เพราะเป็นช่องทางที่ใช้ปกปิดการเอาเงินออกจากลิ้นชักได้ง่ายที่สุด
 */
export const POST = handler(async (req, { params }) => {
  const owner = await requireOwner();
  const { reason } = (await req.json()) as { reason?: string };
  if (!reason?.trim()) throw new ApiError("ต้องระบุเหตุผลที่ยกเลิกบิล");
  return ok(
    await voidSale(await db(), {
      saleId: Number(params.id),
      userId: owner.id,
      reason: reason.trim(),
    })
  );
});
