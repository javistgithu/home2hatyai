import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { resolveScan, lookupProduct } from "@/lib/pos/catalog";
import { getStockByLocation } from "@/lib/pos/stock";
import { getLocationById } from "@/lib/pos/location";

export const dynamic = "force-dynamic";

/**
 * ช่องรับข้อมูลช่องเดียวของทั้งระบบ
 * ยิงบาร์โค้ดสินค้า / พิมพ์รหัสสินค้า / ยิงป้ายช่องวาง ใช้เส้นทางนี้ทั้งหมด
 * ระบบแยกเองว่าที่ยิงมาคืออะไร แล้วส่งข้อมูลที่เกี่ยวข้องกลับไปให้ครบในครั้งเดียว
 */
export const GET = handler(async (req) => {
  await requireUser();
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const pool = await db();
  const scan = await resolveScan(pool, code);

  if (scan.kind === "PRODUCT" && scan.productId) {
    return ok({ scan, product: await lookupProduct(pool, scan.productId) });
  }
  if (scan.kind === "LOCATION" && scan.locationId) {
    return ok({
      scan,
      location: await getLocationById(pool, scan.locationId),
      contents: await getStockByLocation(pool, scan.locationId),
    });
  }
  return ok({ scan });
});
