"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone } from "@/lib/format";

interface ContactButtonsProps {
  listingId: string;
  phone: string | null;
  lineId: string | null;
  sourceUrl: string | null;
  isLoggedIn: boolean;
}

/**
 * ซ่อนเบอร์ไว้ก่อน แล้วเปิดเผยเมื่อผู้ซื้อกด — พร้อมบันทึกเป็น "ผู้สนใจ" ให้ผู้ขายเห็น
 * (ช่วยลดการดูดเบอร์อัตโนมัติ และทำให้ผู้ขายรู้ว่ามีคนสนใจกี่ราย)
 */
export default function ContactButtons({
  listingId, phone, lineId, sourceUrl, isLoggedIn,
}: ContactButtonsProps) {
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);

  const reveal = async () => {
    setRevealed(true);
    if (!isLoggedIn) return;

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("leads").insert({
          listing_id: listingId,
          buyer_id: user.id,
          message: "กดดูเบอร์ติดต่อจากหน้าประกาศ",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!phone && !lineId && !sourceUrl) {
    return <div className="notice notice-warn">ประกาศนี้ไม่มีช่องทางติดต่อ</div>;
  }

  if (!revealed) {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={reveal}>
        📞 ดูเบอร์ติดต่อ
      </button>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      {phone ? (
        <a className="btn btn-primary btn-block" href={`tel:${phone}`}>
          📞 โทร {formatPhone(phone)}
        </a>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        {lineId ? (
          <a
            className="btn grow"
            href={`https://line.me/R/ti/p/${encodeURIComponent(lineId.startsWith("@") ? lineId : "@" + lineId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 LINE {lineId}
          </a>
        ) : null}
        {sourceUrl ? (
          <a className="btn grow" href={sourceUrl} target="_blank" rel="noopener noreferrer">
            🔗 โพสต์ต้นทาง
          </a>
        ) : null}
      </div>
      {saving ? <div className="tiny muted">กำลังบันทึกความสนใจ…</div> : null}
      {!isLoggedIn ? (
        <div className="tiny muted">เข้าสู่ระบบเพื่อบันทึกประกาศนี้และติดตามความคืบหน้า</div>
      ) : null}
    </div>
  );
}
