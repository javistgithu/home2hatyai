import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { createSale } from "@/lib/pos/sales";
import type { SaleInput } from "@/lib/pos/types";
import { num, str } from "@/lib/db";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as Omit<SaleInput, "userId">;
  return ok(await createSale(await db(), { ...body, userId: user.id }));
});

/** บิลล่าสุด ใช้ตอนหาบิลเพื่อยกเลิก/พิมพ์ซ้ำ */
export const GET = handler(async (req) => {
  await requireUser();
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 20);
  const res = await (await db()).query<Record<string, unknown>>(
    `SELECT s.id, s.doc_no, s.sold_at, s.total, s.status, s.tier_level,
            COALESCE(s.customer_name, c.name, 'ลูกค้าทั่วไป') AS customer,
            u.name AS cashier,
            (SELECT count(*) FROM sale_line sl WHERE sl.sale_id = s.id) AS line_count
     FROM sale s
     LEFT JOIN customer c ON c.id = s.customer_id
     LEFT JOIN app_user u ON u.id = s.user_id
     ORDER BY s.sold_at DESC LIMIT $1`,
    [limit]
  );
  return ok(
    res.rows.map((r) => ({
      id: num(r.id),
      docNo: str(r.doc_no),
      soldAt: str(r.sold_at),
      total: num(r.total),
      status: str(r.status),
      tierLevel: num(r.tier_level),
      customer: str(r.customer),
      cashier: str(r.cashier),
      lineCount: num(r.line_count),
    }))
  );
});
