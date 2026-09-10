import { handler, ok } from "@/lib/pos/api";
import { clearSessionCookie } from "@/lib/pos/session";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  clearSessionCookie();
  return ok({ loggedOut: true });
});
