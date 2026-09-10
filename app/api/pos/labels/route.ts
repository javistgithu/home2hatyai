import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { code128Svg } from "@/lib/pos/barcode";
import { listLocations } from "@/lib/pos/location";
import { num, str } from "@/lib/db";
import type { LocationKind } from "@/lib/pos/types";

export const dynamic = "force-dynamic";

/**
 * ข้อมูลป้ายที่จะพิมพ์ไปติดชั้นวาง/สินค้า
 *
 * ป้ายช่องวางคือชิ้นส่วนที่ทำให้ทั้งระบบทำงาน:
 * ถ้าไม่ติดป้ายให้ครบทุกช่อง พนักงานก็ยังต้องเดาว่า "S-A2-3" คือชั้นไหน
 * แล้วระบบก็ไม่ต่างจากเดิม
 */
export const GET = handler(async (req) => {
  await requireUser();
  const p = new URL(req.url).searchParams;
  const kind = p.get("kind") ?? "location";
  const pool = await db();

  if (kind === "product") {
    const res = await pool.query<Record<string, unknown>>(
      `SELECT p.id, p.sku, p.name_th, p.unit,
              (SELECT b.barcode FROM product_barcode b
                WHERE b.product_id = p.id ORDER BY b.is_primary DESC LIMIT 1) AS barcode,
              (SELECT pp.price FROM product_price pp
                WHERE pp.product_id = p.id AND pp.tier_level = 1) AS price
       FROM product p WHERE p.is_active ORDER BY p.sku`
    );
    return ok(
      res.rows.map((r) => {
        const code = str(r.barcode) || str(r.sku);
        return {
          id: num(r.id),
          title: str(r.sku),
          subtitle: str(r.name_th),
          extra: r.price ? `${num(r.price).toLocaleString("th-TH")} บาท / ${str(r.unit)}` : "",
          code,
          svg: code128Svg(code, { moduleWidth: 2, height: 44, fontSize: 11 }),
        };
      })
    );
  }

  const locations = await listLocations(pool, {
    zoneCode: p.get("zone") ?? undefined,
    kind: (p.get("locKind") as LocationKind) ?? undefined,
  });
  return ok(
    locations.map((l) => ({
      id: l.id,
      title: l.code,
      subtitle: l.labelTh,
      extra: "",
      code: l.code,
      svg: code128Svg(l.code, { moduleWidth: 3, height: 56, fontSize: 13 }),
    }))
  );
});
