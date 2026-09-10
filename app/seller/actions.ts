"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { ListingStatus } from "@/lib/types/database";

export interface ActionResult { ok: boolean; error?: string; listingId?: string }

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number.parseFloat(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  const text = value === null ? "" : String(value).trim();
  return text ? text : null;
}

/** แปลง FormData เป็นฟิลด์ของประกาศ (ใช้ร่วมกันทั้งสร้างและแก้ไข) */
function readListingForm(formData: FormData) {
  const lat = numberOrNull(formData.get("lat"));
  const lng = numberOrNull(formData.get("lng"));

  return {
    title: String(formData.get("title") ?? "").trim(),
    description: textOrNull(formData.get("description")),
    property_type: String(formData.get("property_type") ?? "other"),
    deal_type: String(formData.get("deal_type") ?? "sale"),
    price: numberOrNull(formData.get("price")),
    rent_per_month: numberOrNull(formData.get("rent_per_month")),
    land_area_sqwa: numberOrNull(formData.get("land_area_sqwa")),
    usable_area_sqm: numberOrNull(formData.get("usable_area_sqm")),
    bedrooms: numberOrNull(formData.get("bedrooms")),
    bathrooms: numberOrNull(formData.get("bathrooms")),
    floors: numberOrNull(formData.get("floors")),
    parking: numberOrNull(formData.get("parking")),
    address_text: textOrNull(formData.get("address_text")),
    landmark: textOrNull(formData.get("landmark")),
    subdistrict: textOrNull(formData.get("subdistrict")),
    district: textOrNull(formData.get("district")),
    province: textOrNull(formData.get("province")) ?? "สงขลา",
    lat,
    lng,
    // ผู้ขายปักหมุดเอง = พิกัดที่แม่นที่สุดที่ระบบมี
    geo_precision: lat !== null ? ("exact" as const) : ("unknown" as const),
    geo_source: lat !== null ? "seller_pin" : null,
    contact_name: textOrNull(formData.get("contact_name")),
    contact_phone: textOrNull(formData.get("contact_phone")),
    contact_line: textOrNull(formData.get("contact_line")),
    images: String(formData.get("images") ?? "")
      .split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
    amenities: String(formData.get("amenities") ?? "")
      .split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
  };
}

function validate(fields: ReturnType<typeof readListingForm>): string | null {
  if (fields.title.length < 10) return "ชื่อประกาศต้องมีอย่างน้อย 10 ตัวอักษร";
  if (fields.deal_type === "rent" && fields.rent_per_month === null) return "ประกาศให้เช่าต้องระบุค่าเช่าต่อเดือน";
  if (fields.deal_type !== "rent" && fields.price === null) return "ต้องระบุราคาขาย";
  if (fields.price !== null && fields.price < 10_000) return "ราคาดูจะต่ำผิดปกติ กรุณาตรวจสอบอีกครั้ง";
  if (!fields.contact_phone && !fields.contact_line) return "ต้องมีช่องทางติดต่ออย่างน้อย 1 อย่าง";
  return null;
}

/** สร้างประกาศใหม่ — จะเข้าคิวรอแอดมินอนุมัติเสมอ */
export async function createListing(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
  if (session.role !== "seller" && session.role !== "admin") {
    return { ok: false, error: "เฉพาะบัญชีผู้ขายเท่านั้นที่ลงประกาศได้" };
  }

  const fields = readListingForm(formData);
  const problem = validate(fields);
  if (problem) return { ok: false, error: problem };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("listings")
    .insert({ ...fields, owner_id: session.userId, status: "pending" as ListingStatus })
    .select("id")
    .single();

  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` };

  revalidatePath("/seller");
  redirect(`/seller?created=${data.id}`);
}

/** แก้ไขประกาศของตัวเอง (ทริกเกอร์ในฐานข้อมูลจะส่งกลับเข้าคิวตรวจให้เองถ้าแก้ข้อมูลสำคัญ) */
export async function updateListing(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };

  const listingId = String(formData.get("id") ?? "");
  if (!listingId) return { ok: false, error: "ไม่พบรหัสประกาศ" };

  const fields = readListingForm(formData);
  const problem = validate(fields);
  if (problem) return { ok: false, error: problem };

  const supabase = createClient();
  const { error } = await supabase.from("listings").update(fields).eq("id", listingId);
  if (error) return { ok: false, error: `บันทึกไม่สำเร็จ: ${error.message}` };

  revalidatePath("/seller");
  revalidatePath(`/listing/${listingId}`);
  redirect(`/seller?updated=${listingId}`);
}

/** เปลี่ยนสถานะประกาศของตัวเอง เช่น ทำเครื่องหมายว่าขายแล้ว */
export async function setListingStatus(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const listingId = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!listingId || !["pending", "sold", "archived", "draft"].includes(status)) return;

  const supabase = createClient();
  await supabase.from("listings").update({ status }).eq("id", listingId);

  revalidatePath("/seller");
  revalidatePath(`/listing/${listingId}`);
}

/** อัปเดตสถานะการติดต่อผู้สนใจ */
export async function setLeadStatus(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;

  const leadId = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!leadId || !["new", "contacted", "viewing", "closed", "lost"].includes(status)) return;

  const supabase = createClient();
  await supabase.from("leads").update({ status }).eq("id", leadId);
  revalidatePath("/seller/leads");
}
