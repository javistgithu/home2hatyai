import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { num, str } from "@/lib/db";
import { normalizeSearchKey } from "@/lib/pos/catalog";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  await requireUser();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const key = normalizeSearchKey(q);
  const res = await (await db()).query<Record<string, unknown>>(
    `SELECT id, code, name, phone, default_tier_level, credit_limit
     FROM customer
     WHERE is_active AND ($1 = '' OR search_key LIKE '%' || $1 || '%')
     ORDER BY name LIMIT 20`,
    [key]
  );
  return ok(
    res.rows.map((r) => ({
      id: num(r.id),
      code: str(r.code),
      name: str(r.name),
      phone: str(r.phone),
      defaultTierLevel: num(r.default_tier_level),
      creditLimit: num(r.credit_limit),
    }))
  );
});
