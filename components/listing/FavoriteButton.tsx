"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface FavoriteButtonProps {
  listingId: string;
  initialSaved: boolean;
  isLoggedIn: boolean;
}

export default function FavoriteButton({ listingId, initialSaved, isLoggedIn }: FavoriteButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = () => {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`);
      return;
    }

    const next = !saved;
    setSaved(next);        // อัปเดตหน้าจอทันที แล้วค่อยย้อนกลับถ้าบันทึกไม่สำเร็จ

    startTransition(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setSaved(!next); return; }

      const { error } = next
        ? await supabase.from("favorites").insert({ user_id: user.id, listing_id: listingId })
        : await supabase.from("favorites").delete().eq("user_id", user.id).eq("listing_id", listingId);

      if (error) setSaved(!next);
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`btn btn-icon ${saved ? "btn-soft" : ""}`}
      aria-pressed={saved}
      aria-label={saved ? "นำออกจากรายการโปรด" : "บันทึกเข้ารายการโปรด"}
      title={saved ? "นำออกจากรายการโปรด" : "บันทึกเข้ารายการโปรด"}
    >
      {saved ? "❤️" : "🤍"}
    </button>
  );
}
