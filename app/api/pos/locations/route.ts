import { handler, ok, db, requireUser, requireOwner, ApiError } from "@/lib/pos/api";
import { listLocations, createRack, createDisplaySpot } from "@/lib/pos/location";
import type { LocationKind } from "@/lib/pos/types";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  await requireUser();
  const p = new URL(req.url).searchParams;
  return ok(
    await listLocations(await db(), {
      zoneCode: p.get("zone") ?? undefined,
      kind: (p.get("kind") as LocationKind) ?? undefined,
    })
  );
});

/** สร้างชั้นวางทั้งชั้นในครั้งเดียว - ตอนติดตั้งระบบต้องสร้างเป็นร้อยช่อง */
export const POST = handler(async (req) => {
  await requireOwner();
  const body = (await req.json()) as {
    mode?: "rack" | "displaySpot";
    zoneCode?: string;
    rack?: string;
    levels?: number;
    binsPerLevel?: number;
    spotCode?: string;
    labelTh?: string;
    walkOrder?: number;
  };
  const pool = await db();

  if (body.mode === "displaySpot") {
    if (!body.spotCode || !body.labelTh) throw new ApiError("ต้องระบุรหัสและชื่อจุดโชว์");
    return ok(
      await createDisplaySpot(pool, {
        spotCode: body.spotCode,
        labelTh: body.labelTh,
        walkOrder: body.walkOrder,
      })
    );
  }

  if (!body.zoneCode || !body.rack || !body.levels || !body.binsPerLevel) {
    throw new ApiError("ต้องระบุ โซน ชั้นวาง จำนวนชั้น และจำนวนช่องต่อชั้น");
  }
  return ok(
    await createRack(pool, {
      zoneCode: body.zoneCode,
      rack: body.rack,
      levels: body.levels,
      binsPerLevel: body.binsPerLevel,
    })
  );
});
