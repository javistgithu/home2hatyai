import { handler, ok, db, requireUser, ApiError } from "@/lib/pos/api";
import { postCountSession } from "@/lib/pos/count";

export const dynamic = "force-dynamic";

export const POST = handler(async (req) => {
  const user = await requireUser();
  const body = (await req.json()) as {
    sessionId?: number;
    treatUncountedAsZero?: boolean;
  };
  if (!body.sessionId) throw new ApiError("ต้องระบุรอบนับ");
  return ok(
    await postCountSession(await db(), {
      sessionId: body.sessionId,
      userId: user.id,
      treatUncountedAsZero: body.treatUncountedAsZero,
    })
  );
});
