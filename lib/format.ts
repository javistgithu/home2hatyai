/** ฟังก์ชันจัดรูปแบบข้อความภาษาไทยสำหรับหน้าจอ */
import type {
  DealType, GeoPrecision, ListingStatus, PropertyType, UserRole,
} from "@/lib/types/database";

export const PROPERTY_TYPE_TH: Record<PropertyType, string> = {
  house: "บ้านเดี่ยว",
  townhouse: "ทาวน์เฮ้าส์",
  condo: "คอนโด",
  land: "ที่ดิน",
  commercial: "อาคารพาณิชย์",
  apartment: "อพาร์ตเมนต์",
  warehouse: "โกดัง/โรงงาน",
  other: "อื่น ๆ",
};

export const PROPERTY_TYPE_ICON: Record<PropertyType, string> = {
  house: "🏠", townhouse: "🏘️", condo: "🏢", land: "🟩",
  commercial: "🏬", apartment: "🏨", warehouse: "🏭", other: "📍",
};

export const DEAL_TYPE_TH: Record<DealType, string> = {
  sale: "ขาย", rent: "ให้เช่า", sale_or_rent: "ขาย/ให้เช่า",
};

export const STATUS_TH: Record<ListingStatus, string> = {
  draft: "ฉบับร่าง", pending: "รอตรวจสอบ", published: "เผยแพร่แล้ว",
  rejected: "ไม่ผ่าน", archived: "เก็บเข้ากรุ", sold: "ขายแล้ว",
};

export const STATUS_BADGE: Record<ListingStatus, string> = {
  draft: "badge", pending: "badge badge-warn", published: "badge badge-ok",
  rejected: "badge badge-danger", archived: "badge", sold: "badge badge-info",
};

export const ROLE_TH: Record<UserRole, string> = {
  admin: "ผู้ดูแลระบบ", seller: "ผู้ขาย", buyer: "ผู้ซื้อ",
};

export const GEO_PRECISION_TH: Record<GeoPrecision, string> = {
  exact: "พิกัดจริงจากผู้ขาย",
  rooftop: "ระดับบ้านเลขที่",
  geocoded: "ระดับถนน/ซอย",
  subdistrict: "ประมาณระดับตำบล",
  district: "ประมาณระดับอำเภอ",
  unknown: "ยังไม่มีพิกัด",
};

/** พิกัดที่หยาบกว่าระดับถนน ต้องบอกผู้ใช้ให้ชัดว่าเป็นตำแหน่งโดยประมาณ */
export function isApproximate(precision: GeoPrecision): boolean {
  return precision === "subdistrict" || precision === "district" || precision === "unknown";
}

/** ราคาแบบสั้นสำหรับการ์ดและหมุดบนแผนที่ : 4,650,000 -> "4.65 ล้าน" */
export function formatPriceShort(value: number | null | undefined): string {
  if (value === null || value === undefined) return "ไม่ระบุราคา";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const text = millions >= 100 ? millions.toFixed(0) : millions.toFixed(2).replace(/\.?0+$/, "");
    return `${text} ล้าน`;
  }
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)} พัน`;
  return value.toLocaleString("th-TH");
}

/** ราคาเต็มพร้อมหน่วย : 4650000 -> "4,650,000 บาท" */
export function formatPriceFull(value: number | null | undefined): string {
  if (value === null || value === undefined) return "ไม่ระบุราคา";
  return `${Math.round(value).toLocaleString("th-TH")} บาท`;
}

/** ราคาสำหรับหมุดบนแผนที่ ต้องสั้นที่สุด : "4.6 ล." */
export function formatPricePin(value: number | null | undefined, rent?: number | null): string {
  if (value === null || value === undefined) {
    if (rent) return `${Math.round(rent / 1000)}พัน/ด.`;
    return "—";
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1).replace(/\.0$/, "")} ล.`;
  }
  return `${Math.round(value / 1000)}พัน`;
}

/** พื้นที่ดิน : 630 -> "1 ไร่ 2 งาน 30 ตร.ว." */
export function formatArea(sqwa: number | null | undefined): string {
  if (!sqwa || sqwa <= 0) return "ไม่ระบุ";
  if (sqwa < 400) return `${Number(sqwa.toFixed(2))} ตร.ว.`;

  const rai = Math.floor(sqwa / 400);
  const remainder = sqwa % 400;
  const ngan = Math.floor(remainder / 100);
  const wa = Math.round(remainder % 100);
  return [
    `${rai} ไร่`,
    ngan > 0 ? `${ngan} งาน` : null,
    wa > 0 ? `${wa} ตร.ว.` : null,
  ].filter(Boolean).join(" ");
}

/** พื้นที่แบบสั้นสำหรับการ์ด */
export function formatAreaShort(sqwa: number | null | undefined, sqm: number | null | undefined): string | null {
  if (sqwa && sqwa > 0) {
    return sqwa >= 400 ? formatArea(sqwa) : `${Number(sqwa.toFixed(0))} ตร.ว.`;
  }
  if (sqm && sqm > 0) return `${Number(sqm.toFixed(0))} ตร.ม.`;
  return null;
}

/** เบอร์โทร : 0812345678 -> 081-234-5678 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return phone;
}

/** เวลาแบบเข้าใจง่าย : "3 วันที่แล้ว" */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "";

  const diffMs = Date.now() - target;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "เมื่อครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;

  const days = Math.round(hours / 24);
  if (days < 31) return `${days} วันที่แล้ว`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} เดือนที่แล้ว`;
  return `${Math.round(months / 12)} ปีที่แล้ว`;
}

/** วันที่แบบไทย : 9 ก.ย. 2569 */
export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/** ที่ตั้งแบบสั้น : "ต.บ้านพรุ อ.หาดใหญ่" */
export function formatLocation(
  subdistrict: string | null | undefined,
  district: string | null | undefined,
  province?: string | null
): string {
  const parts = [
    subdistrict ? `ต.${subdistrict}` : null,
    district ? `อ.${district}` : null,
    !subdistrict && !district && province ? `จ.${province}` : null,
  ].filter(Boolean);
  return parts.join(" ") || "ไม่ระบุที่ตั้ง";
}

/** ราคาต่อตารางวา ใช้เทียบความคุ้มค่า */
export function formatPricePerSqwa(value: number | null | undefined): string | null {
  if (!value || value <= 0) return null;
  return `${Math.round(value).toLocaleString("th-TH")} บาท/ตร.ว.`;
}
