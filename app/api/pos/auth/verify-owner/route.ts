import { handler, ok, fail, db, requireUser, ApiError } from "@/lib/pos/api";
import { verifyOwnerPin } from "@/lib/pos/users";

export const dynamic = "force-dynamic";

/** ใช้ตอนขออนุมัติราคาพิเศษ/แก้ราคาหน้าขาย - เจ้าของเดินมากด PIN ที่เครื่อง */
export const POST = handler(async (req) => {
  await requireUser();
  const { pin } = (await req.json()) as { pin?: string };
  if (!pin) throw new ApiError("กรุณากรอก PIN");
  const owner = await verifyOwnerPin(await db(), pin);
  if (!owner) return fail("PIN เจ้าของไม่ถูกต้อง", 401);
  return ok(owner);
});
