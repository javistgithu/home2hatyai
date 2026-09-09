"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** นับยอดเข้าชม 1 ครั้งต่อการเปิดหน้า (ทำฝั่ง client เพื่อไม่ให้ bot/prefetch นับด้วย) */
export default function ViewTracker({ listingId }: { listingId: string }) {
  useEffect(() => {
    const key = `viewed:${listingId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void createClient().rpc("increment_listing_view", { p_listing_id: listingId });
  }, [listingId]);

  return null;
}
