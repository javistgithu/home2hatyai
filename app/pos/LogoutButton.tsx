"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/pos/client";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-ghost btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post("/api/pos/auth/logout", {});
          router.replace("/pos/login");
        } finally {
          setBusy(false);
        }
      }}
    >
      ออก
    </button>
  );
}
