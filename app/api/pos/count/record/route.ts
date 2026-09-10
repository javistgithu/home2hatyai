import { handler, ok, db, requireUser, ApiError } from "@/lib/pos/api";
import { recordCount } from "@/lib/pos/count";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as {
    sessionId?: number;
    locationId?: number;
    productId?: number;
    countedQty?: number;
    note?: string;
  };
  if (!body.sessionId || !body.locationId || !body.productId) {
    throw new ApiError("ข้อมูลไม่ครบ");
  }
  if (body.countedQty === undefined || body.countedQty === null) {
    throw new ApiError("ต้องกรอกจำนวนที่นับได้");
  }
  return ok(
    await recordCount(await db(), {
      sessionId: body.sessionId,
      locationId: body.locationId,
      productId: body.productId,
      countedQty: body.countedQty,
      note: body.note,
      userId: user.id,
    })
  );
});
