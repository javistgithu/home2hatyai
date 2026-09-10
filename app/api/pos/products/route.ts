import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { searchProducts } from "@/lib/pos/catalog";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  await requireUser();
  const p = new URL(req.url).searchParams;
  return ok(
    await searchProducts(await db(), p.get("q") ?? "", {
      limit: Number(p.get("limit") ?? 30),
      lampOnly: p.get("lamp") === "1",
      inStockOnly: p.get("inStock") === "1",
    })
  );
});
