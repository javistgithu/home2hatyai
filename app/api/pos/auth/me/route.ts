import { handler, ok } from "@/lib/pos/api";
import { getCurrentUser } from "@/lib/pos/session";

export const dynamic = "force-dynamic";

export const GET = handler(async () => ok(await getCurrentUser()));
