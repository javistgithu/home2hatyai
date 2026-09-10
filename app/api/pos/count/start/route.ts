import { handler, ok, db, requireUser, ApiError } from "@/lib/pos/api";
import { startCountSession } from "@/lib/pos/count";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as {
    locationIds?: number[];
    kind?: "FULL" | "CYCLE" | "SPOT";
    isBlind?: boolean;
    note?: string;
  };
  if (!body.locationIds?.length) throw new ApiError("ต้องเลือกช่องที่จะนับ");
  return ok(
    await startCountSession(await db(), {
      userId: user.id,
      kind: body.kind ?? "CYCLE",
      locationIds: body.locationIds,
      isBlind: body.isBlind ?? true,
      note: body.note,
    })
  );
});
