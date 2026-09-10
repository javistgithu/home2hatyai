import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { num, str } from "@/lib/db";
import { getCountQueue } from "@/lib/pos/count";
import { listOpenNotFound, getNotFoundStats } from "@/lib/pos/notfound";
import { getLampsWithoutDisplay } from "@/lib/pos/display";
import { getUnputawayItems } from "@/lib/pos/receiving";

export const dynamic = "force-dynamic";

/**
 * งานที่ต้องทำวันนี้ - หน้าแรกที่พนักงานเปิดมาเจอ
 *
 * ตั้งใจให้เป็นรายการสั้นๆ ที่ทำเสร็จได้ในไม่กี่นาที
 * ไม่ใช่แดชบอร์ดกราฟสวยๆ ที่ไม่มีใครกด
 */
export const GET = handler(async () => {
  await requireUser();
  const pool = await db();

  const [today, replenish, negatives] = await Promise.all([
    pool.query<Record<string, unknown>>(
      `SELECT COALESCE(SUM(total),0) AS sales_total,
              COUNT(*)               AS bill_count
       FROM sale
       WHERE status='COMPLETED' AND sold_at >= date_trunc('day', now())`
    ),
    pool.query<Record<string, unknown>>(
      `SELECT product_name, location_code, location_label, qty_now, qty_to_fill, unit
       FROM v_replenish_needed ORDER BY qty_now LIMIT 15`
    ),
    pool.query<Record<string, unknown>>(
      `SELECT p.name_th, l.code AS location_code, sb.qty_on_hand
       FROM stock_balance sb
       JOIN product p  ON p.id = sb.product_id
       JOIN location l ON l.id = sb.location_id
       WHERE sb.qty_on_hand < 0
       ORDER BY sb.qty_on_hand LIMIT 15`
    ),
  ]);

  const [countQueue, openNotFound, lampsNoDisplay, unputaway, stats] =
    await Promise.all([
      getCountQueue(pool, 10),
      listOpenNotFound(pool, 10),
      getLampsWithoutDisplay(pool),
      getUnputawayItems(pool),
      getNotFoundStats(pool, 30),
    ]);

  return ok({
    todaySales: num(today.rows[0]?.sales_total),
    todayBills: num(today.rows[0]?.bill_count),
    countQueue,
    openNotFound,
    lampsWithoutDisplay: lampsNoDisplay,
    unputaway,
    notFoundStats: stats,
    replenish: replenish.rows.map((r) => ({
      productName: str(r.product_name),
      locationCode: str(r.location_code),
      locationLabel: str(r.location_label),
      qtyNow: num(r.qty_now),
      qtyToFill: num(r.qty_to_fill),
      unit: str(r.unit),
    })),
    negativeStock: negatives.rows.map((r) => ({
      productName: str(r.name_th),
      locationCode: str(r.location_code),
      qty: num(r.qty_on_hand),
    })),
  });
});
