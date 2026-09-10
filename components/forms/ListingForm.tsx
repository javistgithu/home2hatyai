"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import LocationPicker from "@/components/map/LocationPicker";
import { DISTRICT_OPTIONS, HATYAI_SUBDISTRICT_OPTIONS } from "@/lib/parser/gazetteer";
import { PROPERTY_TYPE_TH } from "@/lib/format";
import type { ActionResult } from "@/app/seller/actions";
import type { DealType, Listing, PropertyType } from "@/lib/types/database";

interface ListingFormProps {
  mode: "create" | "edit";
  listing?: Listing | null;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? "กำลังบันทึก…" : mode === "create" ? "ส่งประกาศให้แอดมินตรวจ" : "บันทึกการแก้ไข"}
    </button>
  );
}

export default function ListingForm({ mode, listing, action }: ListingFormProps) {
  const [state, formAction] = useFormState(action, null);

  const [dealType, setDealType] = useState<DealType>(listing?.deal_type ?? "sale");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    listing?.lat != null && listing.lng != null ? { lat: listing.lat, lng: listing.lng } : null
  );
  const [district, setDistrict] = useState(listing?.district ?? "หาดใหญ่");

  // เติมข้อมูลอัตโนมัติจากข้อความโพสต์
  const [pasteText, setPasteText] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [autofill, setAutofill] = useState<Record<string, string>>({});

  const autofillFromPost = async () => {
    if (pasteText.trim().length < 20) return;
    setPasting(true);
    setPasteNote(null);
    try {
      const response = await fetch("/api/parse-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: pasteText }),
      });
      const parsed = await response.json();
      if (!response.ok) {
        setPasteNote(parsed?.error ?? "อ่านข้อความไม่สำเร็จ");
        return;
      }

      setAutofill({
        title: parsed.title ?? "",
        description: parsed.description ?? "",
        property_type: parsed.propertyType ?? "other",
        price: parsed.price ?? "",
        rent_per_month: parsed.rentPerMonth ?? "",
        land_area_sqwa: parsed.landAreaSqwa ?? "",
        usable_area_sqm: parsed.usableAreaSqm ?? "",
        bedrooms: parsed.bedrooms ?? "",
        bathrooms: parsed.bathrooms ?? "",
        floors: parsed.floors ?? "",
        parking: parsed.parking ?? "",
        address_text: parsed.addressText ?? "",
        landmark: parsed.landmark ?? "",
        subdistrict: parsed.subdistrict ?? "",
        contact_phone: parsed.contactPhone ?? "",
        contact_line: parsed.contactLine ?? "",
        amenities: (parsed.amenities ?? []).join(", "),
      });
      if (parsed.dealType) setDealType(parsed.dealType);
      if (parsed.district) setDistrict(parsed.district);
      if (parsed.lat != null && parsed.geoPrecision === "exact") {
        setPosition({ lat: parsed.lat, lng: parsed.lng });
      }
      setPasteNote(
        `เติมข้อมูลให้แล้ว (ความมั่นใจ ${Math.round((parsed.confidence ?? 0) * 100)}%) — ` +
        `กรุณาตรวจทานทุกช่องก่อนบันทึก${parsed.warnings?.length ? ` · ${parsed.warnings[0]}` : ""}`
      );
    } catch {
      setPasteNote("เชื่อมต่อไม่สำเร็จ");
    } finally {
      setPasting(false);
    }
  };

  /** ค่าเริ่มต้นของช่อง: ค่าที่เติมอัตโนมัติมาก่อน แล้วค่อยเป็นค่าเดิมของประกาศ */
  const initial = (key: string, existing: unknown): string => {
    if (autofill[key] !== undefined && autofill[key] !== "") return String(autofill[key]);
    return existing === null || existing === undefined ? "" : String(existing);
  };

  // key ที่เปลี่ยนเมื่อเติมข้อมูลใหม่ เพื่อบังคับให้ React วาดช่องกรอกใหม่พร้อมค่า
  const formKey = Object.keys(autofill).length > 0 ? JSON.stringify(autofill).length : 0;

  return (
    <form action={formAction} className="stack" key={formKey}>
      {listing ? <input type="hidden" name="id" value={listing.id} /> : null}
      <input type="hidden" name="lat" value={position?.lat ?? ""} />
      <input type="hidden" name="lng" value={position?.lng ?? ""} />

      {mode === "create" ? (
        <section className="card card-pad stack">
          <div className="strong">⚡ ลัดขั้นตอน: วางข้อความประกาศเดิม</div>
          <p className="tiny muted" style={{ margin: 0 }}>
            คัดลอกข้อความประกาศที่คุณเคยโพสต์มาวางที่นี่ ระบบจะแยกราคา พื้นที่ ห้อง เบอร์โทร
            และที่ตั้งให้อัตโนมัติ แล้วคุณค่อยตรวจแก้
          </p>
          <textarea
            className="textarea" rows={4} value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="เช่น ขายบ้านเดี่ยว 2 ชั้น 62 ตร.ว. ต.คอหงส์ 3 ห้องนอน ราคา 4.65 ล้าน โทร 081-234-5678"
          />
          <button type="button" className="btn btn-soft btn-sm" onClick={autofillFromPost}
            disabled={pasting || pasteText.trim().length < 20}>
            {pasting ? "กำลังอ่าน…" : "อ่านข้อความและเติมให้อัตโนมัติ"}
          </button>
          {pasteNote ? <div className="notice notice-info tiny">{pasteNote}</div> : null}
        </section>
      ) : null}

      <section className="card card-pad stack">
        <div className="strong">ข้อมูลทรัพย์</div>

        <div className="field">
          <label className="label" htmlFor="title">ชื่อประกาศ *</label>
          <input id="title" name="title" className="input" required minLength={10} maxLength={110}
            defaultValue={initial("title", listing?.title)}
            placeholder="เช่น บ้านเดี่ยว 2 ชั้น ต.คอหงส์ 62 ตร.ว. ใกล้ ม.อ." />
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="property_type">ประเภททรัพย์ *</label>
            <select id="property_type" name="property_type" className="select"
              defaultValue={initial("property_type", listing?.property_type) || "house"}>
              {(Object.keys(PROPERTY_TYPE_TH) as PropertyType[]).map((type) => (
                <option key={type} value={type}>{PROPERTY_TYPE_TH[type]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="deal_type">ประเภทประกาศ *</label>
            <select id="deal_type" name="deal_type" className="select" value={dealType}
              onChange={(event) => setDealType(event.target.value as DealType)}>
              <option value="sale">ขาย</option>
              <option value="rent">ให้เช่า</option>
              <option value="sale_or_rent">ขายหรือให้เช่า</option>
            </select>
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="price">ราคาขาย (บาท){dealType !== "rent" ? " *" : ""}</label>
            <input id="price" name="price" className="input" type="number" inputMode="numeric" min={0}
              defaultValue={initial("price", listing?.price)} placeholder="4650000" />
          </div>
          <div className="field">
            <label className="label" htmlFor="rent_per_month">ค่าเช่า/เดือน (บาท){dealType === "rent" ? " *" : ""}</label>
            <input id="rent_per_month" name="rent_per_month" className="input" type="number" inputMode="numeric" min={0}
              defaultValue={initial("rent_per_month", listing?.rent_per_month)} placeholder="8500" />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="land_area_sqwa">เนื้อที่ดิน (ตร.ว.)</label>
            <input id="land_area_sqwa" name="land_area_sqwa" className="input" type="number" step="0.01" min={0}
              defaultValue={initial("land_area_sqwa", listing?.land_area_sqwa)} placeholder="62" />
            <span className="hint">1 ไร่ = 400 ตร.ว. · 1 งาน = 100 ตร.ว.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="usable_area_sqm">พื้นที่ใช้สอย (ตร.ม.)</label>
            <input id="usable_area_sqm" name="usable_area_sqm" className="input" type="number" step="0.01" min={0}
              defaultValue={initial("usable_area_sqm", listing?.usable_area_sqm)} placeholder="180" />
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="bedrooms">ห้องนอน</label>
            <input id="bedrooms" name="bedrooms" className="input" type="number" min={0} max={99}
              defaultValue={initial("bedrooms", listing?.bedrooms)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="bathrooms">ห้องน้ำ</label>
            <input id="bathrooms" name="bathrooms" className="input" type="number" min={0} max={99}
              defaultValue={initial("bathrooms", listing?.bathrooms)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="floors">จำนวนชั้น</label>
            <input id="floors" name="floors" className="input" type="number" min={0} max={99}
              defaultValue={initial("floors", listing?.floors)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="parking">ที่จอดรถ (คัน)</label>
            <input id="parking" name="parking" className="input" type="number" min={0} max={20}
              defaultValue={initial("parking", listing?.parking)} />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="description">รายละเอียด</label>
          <textarea id="description" name="description" className="textarea" rows={5}
            defaultValue={initial("description", listing?.description)}
            placeholder="สภาพบ้าน สิ่งที่ต่อเติม เอกสารสิทธิ์ เงื่อนไขการโอน ฯลฯ" />
        </div>
      </section>

      <section className="card card-pad stack">
        <div className="strong">ที่ตั้ง</div>

        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="district">อำเภอ</label>
            <select id="district" name="district" className="select" value={district}
              onChange={(event) => setDistrict(event.target.value)}>
              {DISTRICT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="subdistrict">ตำบล</label>
            {district === "หาดใหญ่" ? (
              <select id="subdistrict" name="subdistrict" className="select"
                defaultValue={initial("subdistrict", listing?.subdistrict)}>
                <option value="">ไม่ระบุ</option>
                {HATYAI_SUBDISTRICT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input id="subdistrict" name="subdistrict" className="input"
                defaultValue={initial("subdistrict", listing?.subdistrict)} placeholder="ชื่อตำบล" />
            )}
          </div>
        </div>
        <input type="hidden" name="province" value="สงขลา" />

        <div className="field">
          <label className="label" htmlFor="address_text">ที่อยู่/ถนน/ซอย</label>
          <input id="address_text" name="address_text" className="input"
            defaultValue={initial("address_text", listing?.address_text)} placeholder="เช่น ซ.กาญจนวนิช 12" />
        </div>

        <div className="field">
          <label className="label" htmlFor="landmark">จุดสังเกตใกล้เคียง</label>
          <input id="landmark" name="landmark" className="input"
            defaultValue={initial("landmark", listing?.landmark)} placeholder="เช่น ใกล้เซ็นทรัลหาดใหญ่" />
        </div>

        <div className="field">
          <span className="label">ปักหมุดตำแหน่งบนแผนที่</span>
          <LocationPicker
            lat={position?.lat ?? null}
            lng={position?.lng ?? null}
            onChange={setPosition}
          />
        </div>
      </section>

      <section className="card card-pad stack">
        <div className="strong">ช่องทางติดต่อ</div>
        <div className="field">
          <label className="label" htmlFor="contact_name">ชื่อผู้ติดต่อ</label>
          <input id="contact_name" name="contact_name" className="input"
            defaultValue={initial("contact_name", listing?.contact_name)} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="contact_phone">เบอร์โทร</label>
            <input id="contact_phone" name="contact_phone" className="input" type="tel" inputMode="tel"
              defaultValue={initial("contact_phone", listing?.contact_phone)} placeholder="08x-xxx-xxxx" />
          </div>
          <div className="field">
            <label className="label" htmlFor="contact_line">LINE ID</label>
            <input id="contact_line" name="contact_line" className="input"
              defaultValue={initial("contact_line", listing?.contact_line)} placeholder="@yourline" />
          </div>
        </div>
        <span className="hint">ต้องมีอย่างน้อย 1 ช่องทาง เพื่อให้ผู้ซื้อติดต่อได้</span>
      </section>

      <section className="card card-pad stack">
        <div className="strong">รูปภาพและจุดเด่น</div>
        <div className="field">
          <label className="label" htmlFor="images">ลิงก์รูปภาพ (บรรทัดละ 1 ลิงก์)</label>
          <textarea id="images" name="images" className="textarea" rows={3}
            defaultValue={(listing?.images ?? []).join("\n")}
            placeholder="https://example.com/photo1.jpg" />
          <span className="hint">รองรับลิงก์รูปจากภายนอก — ถ้าต้องการอัปโหลดไฟล์ ให้เปิดใช้ Supabase Storage เพิ่มเติม</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="amenities">จุดเด่น (คั่นด้วยจุลภาค)</label>
          <input id="amenities" name="amenities" className="input"
            defaultValue={initial("amenities", (listing?.amenities ?? []).join(", "))}
            placeholder="พร้อมอยู่, ใกล้ห้าง, เจ้าของขายเอง" />
        </div>
      </section>

      {state?.error ? <div className="notice notice-danger">{state.error}</div> : null}

      <div className="notice notice-info small">
        ประกาศจะเข้าคิวให้แอดมินตรวจสอบก่อนเผยแพร่ ปกติใช้เวลาไม่นาน
        และหากแก้ไขข้อมูลสำคัญของประกาศที่เผยแพร่แล้ว ระบบจะส่งกลับเข้าคิวตรวจอีกครั้ง
      </div>

      <SubmitButton mode={mode} />
    </form>
  );
}
