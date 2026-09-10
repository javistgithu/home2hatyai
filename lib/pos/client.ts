/** ตัวช่วยเรียก API จากฝั่งเบราว์เซอร์ */

export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; error: string }

/**
 * เรียก API แล้วคืนข้อมูล หรือโยน Error ที่มีข้อความไทยพร้อมแสดงบนจอ
 *
 * ข้อความ error ทุกตัวที่ออกจากระบบเป็นภาษาไทยและบอกวิธีแก้
 * ไม่ใช่รหัส error ที่พนักงานอ่านไม่เข้าใจแล้วต้องโทรถามเจ้าของ
 */
export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json ? { "content-type": "application/json", ...rest.headers } : rest.headers,
    body: json ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });

  let payload: ApiOk<T> | ApiErr;
  try {
    payload = (await res.json()) as ApiOk<T> | ApiErr;
  } catch {
    throw new Error(`ติดต่อเซิร์ฟเวอร์ไม่ได้ (${res.status}) ลองใหม่อีกครั้ง`);
  }
  if (!payload.ok) throw new Error(payload.error);
  return payload.data;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, json: unknown) =>
  api<T>(path, { method: "POST", json });
export const patch = <T>(path: string, json: unknown) =>
  api<T>(path, { method: "PATCH", json });

/** จัดรูปแบบเงินสำหรับแสดงผล */
export function money(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** จัดรูปแบบจำนวน ตัดศูนย์ท้ายทิ้ง (2.5 ไม่ใช่ 2.500) */
export function qty(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString("th-TH")
    : n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

/** คลาส CSS ของป้ายรหัสช่อง ตามโซน - สีเดียวกันทุกหน้าจอ */
export function locClass(zoneCodeOrKind: string): string {
  switch (zoneCodeOrKind) {
    case "F": case "SHOP":    return "loc loc-shop";
    case "S": case "STORE":   return "loc loc-store";
    case "D": case "DISPLAY": case "DISPLAY_SPOT": return "loc loc-display";
    default: return "loc loc-other";
  }
}

/** วันเวลาแบบไทย สั้น อ่านง่าย */
export function thaiDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function thaiDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    day: "numeric", month: "short", year: "2-digit",
  });
}

/** "3 วันที่แล้ว" / "ไม่เคยนับ" - อ่านเร็วกว่าวันที่เต็ม */
export function daysAgo(iso: string | null, neverText = "ไม่เคย"): string {
  if (!iso) return neverText;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return neverText;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "วันนี้";
  if (days === 1) return "เมื่อวาน";
  if (days < 31) return `${days} วันที่แล้ว`;
  const months = Math.floor(days / 30);
  return `${months} เดือนที่แล้ว`;
}

/**
 * หาราคาตามระดับจากรายการราคาที่โหลดมาแล้ว (ใช้ฝั่งจอเท่านั้น)
 *
 * กฎการถอยเหมือนฝั่งเซิร์ฟเวอร์: ระดับที่ขอ -> ราคาขายจริง(1) -> ราคาเต็ม(5)
 * ฝั่งเซิร์ฟเวอร์คำนวณราคาใหม่ตอนบันทึกบิลเสมอ ฟังก์ชันนี้ใช้แค่แสดงผล
 * ราคาที่ลูกค้าจ่ายจริงยึดตามที่เซิร์ฟเวอร์คำนวณ ไม่ใช่ตัวเลขที่ส่งมาจากจอ
 */
export function resolveTierPrice(
  prices: { tierLevel: number; price: number }[],
  tierLevel: number
): { price: number; usedTier: number; fallback: boolean } {
  const byTier = new Map(prices.map((p) => [p.tierLevel, p.price]));
  const direct = byTier.get(tierLevel);
  if (direct !== undefined) return { price: direct, usedTier: tierLevel, fallback: false };
  const retail = byTier.get(1);
  if (retail !== undefined) return { price: retail, usedTier: 1, fallback: true };
  const list = byTier.get(5);
  if (list !== undefined) return { price: list, usedTier: 5, fallback: true };
  return { price: 0, usedTier: tierLevel, fallback: true };
}
