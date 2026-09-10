import { handler, ok, db, requireUser } from "@/lib/pos/api";
import { getPriceTiers } from "@/lib/pos/pricing";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireUser();
  return ok(await getPriceTiers(await db()));
});
