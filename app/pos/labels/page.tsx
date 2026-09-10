"use client";

import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/pos/client";

/**
 * หน้าพิมพ์ป้ายบาร์โค้ด
 *
 * ป้ายติดชั้นวางคือชิ้นส่วนที่ทำให้ทั้งระบบทำงานได้จริง
 * ถ้าไม่ติดป้ายให้ครบทุกช่อง รหัส "S-A2-3" ก็เป็นแค่ตัวอักษรที่ไม่มีความหมาย
 * พนักงานยังต้องเดินหาเหมือนเดิม แล้วระบบทั้งหมดนี้ก็ไร้ค่า
 *
 * ลำดับการติดตั้งที่แนะนำ:
 *   1. พิมพ์ป้ายช่องวางทั้งหมด ติดให้ครบทุกช่องก่อน (ครึ่งวัน)
 *   2. ค่อยเริ่มใช้ระบบขาย
 * ทำสลับลำดับเมื่อไหร่ พนักงานจะเจอรหัสที่หาไม่เจอในวันแรก แล้วเลิกใช้ทันที
 *
 * บาร์โค้ดสร้างเป็น SVG ในเซิร์ฟเวอร์ ไม่พึ่งอินเทอร์เน็ต พิมพ์ได้แม้เน็ตหลุด
 */

interface LabelItem {
  id: number;
  title: string;
  subtitle: string;
  extra: string;
  code: string;
  svg: string;
}

export default function LabelsPage() {
  const [kind, setKind] = useState<"location" | "product">("location");
  const [zone, setZone] = useState("");
  const [items, setItems] = useState<LabelItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const q = new URLSearchParams({ kind });
      if (kind === "location" && zone) q.set("zone", zone);
      setItems(await get<LabelItem[]>(`/api/pos/labels?${q}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [kind, zone]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page page-wide">
      <div className="card no-print">
        <div className="card-body stack">
          <h1>พิมพ์ป้ายบาร์โค้ด</h1>
          <div className="alert alert-info small">
            ติดป้ายช่องวางให้ครบทุกช่องก่อนเริ่มใช้ระบบ — ป้ายคือสิ่งที่ทำให้รหัสในระบบ
            ตรงกับชั้นวางจริง ถ้าขาดป้าย พนักงานจะกลับไปเดินหาของเหมือนเดิม
          </div>
          <div className="row row-wrap" style={{ gap: 8 }}>
            <select
              style={{ maxWidth: 220 }}
              value={kind}
              onChange={(e) => setKind(e.target.value as "location" | "product")}
            >
              <option value="location">ป้ายช่องวาง (ติดที่ชั้น)</option>
              <option value="product">ป้ายสินค้า (ติดที่ของ)</option>
            </select>
            {kind === "location" && (
              <select
                style={{ maxWidth: 200 }}
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              >
                <option value="">ทุกโซน</option>
                <option value="F">หน้าร้าน</option>
                <option value="S">สโตร์หลังร้าน</option>
                <option value="D">จุดโชว์</option>
              </select>
            )}
            <button onClick={() => void load()} disabled={busy}>
              โหลดใหม่
            </button>
            <div className="spacer" />
            <span className="chip">{items.length} ป้าย</span>
            <button className="btn-primary" onClick={() => window.print()} disabled={items.length === 0}>
              พิมพ์
            </button>
          </div>
          {err && <div className="alert alert-danger">{err}</div>}
        </div>
      </div>

      <div className="label-sheet" style={{ marginTop: 12 }}>
        {items.map((it) => (
          <div key={it.id} className="label-card">
            <div className="lc-title">{it.title}</div>
            <div className="lc-sub">{it.subtitle}</div>
            {it.extra && <div className="lc-sub bold">{it.extra}</div>}
            <div dangerouslySetInnerHTML={{ __html: it.svg }} />
          </div>
        ))}
      </div>

      {items.length === 0 && !busy && (
        <div className="empty">ไม่มีป้ายให้พิมพ์</div>
      )}
    </main>
  );
}
