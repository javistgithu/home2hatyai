import { handler, ok, db, requireUser, ApiError } from "@/lib/pos/api";
import { reportNotFound, listOpenNotFound, resolveNotFound } from "@/lib/pos/notfound";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as {
    productId?: number;
    locationId?: number;
    saleId?: number | null;
    note?: string;
  };
  if (!body.productId || !body.locationId) {
    throw new ApiError("ต้องระบุสินค้าและช่องที่หาไม่เจอ");
  }
  return ok(
    await reportNotFound(await db(), {
      productId: body.productId,
      locationId: body.locationId,
      saleId: body.saleId ?? null,
      note: body.note,
      userId: user.id,
    })
  );
});

export const GET = handler(async () => {
  await requireUser();
  return ok(await listOpenNotFound(await db()));
});

export const PATCH = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as {
    reportId?: number;
    resolution?: "FOUND_SAME_BIN" | "FOUND_OTHER_BIN" | "WAS_DISPLAY" | "ADJUSTED" | "DAMAGED" | "UNRESOLVED";
    foundLocationId?: number | null;
    note?: string;
  };
  if (!body.reportId || !body.resolution) {
    throw new ApiError("ต้องระบุเรื่องที่จะปิดและผลสรุป");
  }
  await resolveNotFound(await db(), {
    reportId: body.reportId,
    resolution: body.resolution,
    foundLocationId: body.foundLocationId ?? null,
    note: body.note,
    userId: user.id,
  });
  return ok({ resolved: true });
});
