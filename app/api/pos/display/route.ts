import { handler, ok, db, requireUser, ApiError } from "@/lib/pos/api";
import {
  getDisplayMap, getLampsWithoutDisplay, setUpDisplay,
  moveDisplayUnit, returnDisplayToStock, markDisplayChecked,
} from "@/lib/pos/display";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireUser();
  const pool = await db();
  return ok({
    map: await getDisplayMap(pool),
    lampsWithoutDisplay: await getLampsWithoutDisplay(pool),
  });
});

export const POST = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as Record<string, never> & {
    action?: "setup" | "move" | "return" | "check";
    [k: string]: unknown;
  };
  const pool = await db();

  switch (body.action) {
    case "setup":
      return ok(
        await setUpDisplay(pool, {
          productId: Number(body.productId),
          fromLocationId: Number(body.fromLocationId),
          displayLocationId: Number(body.displayLocationId),
          spotLabel: String(body.spotLabel ?? ""),
          displayPrice: body.displayPrice == null ? null : Number(body.displayPrice),
          isSellable: body.isSellable !== false,
          note: body.note ? String(body.note) : undefined,
          userId: user.id,
        })
      );
    case "move":
      return ok(
        await moveDisplayUnit(pool, {
          displayUnitId: Number(body.displayUnitId),
          toLocationId: Number(body.toLocationId),
          spotLabel: String(body.spotLabel ?? ""),
          userId: user.id,
        })
      );
    case "return":
      await returnDisplayToStock(pool, {
        displayUnitId: Number(body.displayUnitId),
        toLocationId: Number(body.toLocationId),
        condition: body.condition as never,
        note: body.note ? String(body.note) : undefined,
        userId: user.id,
      });
      return ok({ returned: true });
    case "check":
      await markDisplayChecked(pool, {
        displayUnitId: Number(body.displayUnitId),
        condition: body.condition as never,
        note: body.note ? String(body.note) : undefined,
        userId: user.id,
      });
      return ok({ checked: true });
    default:
      throw new ApiError("ไม่รู้จักคำสั่งนี้");
  }
});
