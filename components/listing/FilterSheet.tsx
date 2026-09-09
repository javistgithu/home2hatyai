"use client";

import { useEffect, useState } from "react";
import { DISTRICT_OPTIONS, HATYAI_SUBDISTRICT_OPTIONS } from "@/lib/parser/gazetteer";
import { PROPERTY_TYPE_TH } from "@/lib/format";
import type { DealType, PropertyType } from "@/lib/types/database";

export interface Filters {
  q: string;
  types: PropertyType[];
  deal: DealType | "";
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
  bedrooms: string;
  district: string;
  subdistrict: string;
  sort: string;
}

export const EMPTY_FILTERS: Filters = {
  q: "", types: [], deal: "", minPrice: "", maxPrice: "",
  minArea: "", maxArea: "", bedrooms: "", district: "", subdistrict: "", sort: "newest",
};

/** นับจำนวนเงื่อนไขที่ตั้งไว้ ใช้แสดงตัวเลขบนปุ่มฟิลเตอร์ */
export function countActiveFilters(filters: Filters): number {
  let count = 0;
  if (filters.types.length > 0) count += 1;
  if (filters.deal) count += 1;
  if (filters.minPrice || filters.maxPrice) count += 1;
  if (filters.minArea || filters.maxArea) count += 1;
  if (filters.bedrooms) count += 1;
  if (filters.district) count += 1;
  if (filters.subdistrict) count += 1;
  return count;
}

const PRICE_PRESETS: Array<[string, string, string]> = [
  ["ไม่เกิน 1.5 ล้าน", "", "1500000"],
  ["1.5-3 ล้าน", "1500000", "3000000"],
  ["3-5 ล้าน", "3000000", "5000000"],
  ["5 ล้านขึ้นไป", "5000000", ""],
];

interface FilterSheetProps {
  value: Filters;
  onApply: (filters: Filters) => void;
  onClose: () => void;
}

export default function FilterSheet({ value, onApply, onClose }: FilterSheetProps) {
  const [draft, setDraft] = useState<Filters>(value);

  // ปิดด้วยปุ่ม Esc และล็อกไม่ให้พื้นหลังเลื่อนตาม
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const toggleType = (type: PropertyType) => {
    setDraft((current) => ({
      ...current,
      types: current.types.includes(type)
        ? current.types.filter((t) => t !== type)
        : [...current.types, type],
    }));
  };

  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setDraft((current) => ({ ...current, [key]: val }));

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} role="presentation" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="ตัวกรองการค้นหา">
        <div className="sheet-grip" />
        <div className="row-between">
          <h2 className="sheet-title" style={{ margin: 0 }}>ตัวกรอง</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(EMPTY_FILTERS)}>
            ล้างทั้งหมด
          </button>
        </div>

        <div className="stack" style={{ marginTop: 14 }}>
          <div className="field">
            <span className="label">ประเภททรัพย์</span>
            <div className="chips wrap" style={{ flexWrap: "wrap" }}>
              {(Object.keys(PROPERTY_TYPE_TH) as PropertyType[])
                .filter((t) => t !== "other")
                .map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`chip ${draft.types.includes(type) ? "active" : ""}`}
                    onClick={() => toggleType(type)}
                  >
                    {PROPERTY_TYPE_TH[type]}
                  </button>
                ))}
            </div>
          </div>

          <div className="field">
            <span className="label">ประเภทประกาศ</span>
            <div className="chips">
              {[["", "ทั้งหมด"], ["sale", "ขาย"], ["rent", "ให้เช่า"]].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`chip ${draft.deal === val ? "active" : ""}`}
                  onClick={() => set("deal", val as DealType | "")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">ช่วงราคา</span>
            <div className="chips" style={{ marginBottom: 8 }}>
              {PRICE_PRESETS.map(([label, min, max]) => (
                <button
                  key={label}
                  type="button"
                  className={`chip ${draft.minPrice === min && draft.maxPrice === max ? "active" : ""}`}
                  onClick={() => setDraft((c) => ({ ...c, minPrice: min, maxPrice: max }))}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid-2">
              <input className="input" type="number" inputMode="numeric" placeholder="ต่ำสุด (บาท)"
                value={draft.minPrice} onChange={(e) => set("minPrice", e.target.value)} />
              <input className="input" type="number" inputMode="numeric" placeholder="สูงสุด (บาท)"
                value={draft.maxPrice} onChange={(e) => set("maxPrice", e.target.value)} />
            </div>
          </div>

          <div className="field">
            <span className="label">เนื้อที่ (ตารางวา)</span>
            <div className="grid-2">
              <input className="input" type="number" inputMode="numeric" placeholder="ต่ำสุด"
                value={draft.minArea} onChange={(e) => set("minArea", e.target.value)} />
              <input className="input" type="number" inputMode="numeric" placeholder="สูงสุด"
                value={draft.maxArea} onChange={(e) => set("maxArea", e.target.value)} />
            </div>
          </div>

          <div className="field">
            <span className="label">ห้องนอนอย่างน้อย</span>
            <div className="chips">
              {["", "1", "2", "3", "4"].map((value_) => (
                <button
                  key={value_ || "any"}
                  type="button"
                  className={`chip ${draft.bedrooms === value_ ? "active" : ""}`}
                  onClick={() => set("bedrooms", value_)}
                >
                  {value_ ? `${value_}+` : "ไม่กำหนด"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor="f-district">อำเภอ</label>
              <select id="f-district" className="select" value={draft.district}
                onChange={(e) => setDraft((c) => ({ ...c, district: e.target.value, subdistrict: "" }))}>
                <option value="">ทุกอำเภอ</option>
                {DISTRICT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="f-subdistrict">ตำบล</label>
              <select id="f-subdistrict" className="select" value={draft.subdistrict}
                disabled={draft.district !== "หาดใหญ่"}
                onChange={(e) => set("subdistrict", e.target.value)}>
                <option value="">{draft.district === "หาดใหญ่" ? "ทุกตำบล" : "เลือกอำเภอหาดใหญ่ก่อน"}</option>
                {HATYAI_SUBDISTRICT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="f-sort">เรียงลำดับ</label>
            <select id="f-sort" className="select" value={draft.sort} onChange={(e) => set("sort", e.target.value)}>
              <option value="newest">ใหม่ล่าสุด</option>
              <option value="price_asc">ราคาน้อยไปมาก</option>
              <option value="price_desc">ราคามากไปน้อย</option>
              <option value="area_desc">เนื้อที่มากไปน้อย</option>
              <option value="quality">ข้อมูลครบถ้วนที่สุด</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 18, gap: 10 }}>
          <button type="button" className="btn grow" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-primary grow" onClick={() => onApply(draft)}>
            ดูผลลัพธ์
          </button>
        </div>
      </div>
    </>
  );
}
