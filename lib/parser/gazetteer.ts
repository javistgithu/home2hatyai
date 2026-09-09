/**
 * ทะเบียนสถานที่ จ.สงขลา (เน้น อ.หาดใหญ่)
 *
 * ใช้ 2 อย่าง
 *   1) จับชื่อ ตำบล/อำเภอ/แลนด์มาร์ก จากข้อความโพสต์
 *   2) เป็นพิกัดสำรอง (fallback) เมื่อไม่มี Google Geocoding API key
 *      หรือ geocode ไม่พบ — จะได้ยังปักหมุดบนแผนที่ได้แบบคร่าว ๆ
 *
 * ⚠️ พิกัดในไฟล์นี้เป็น "จุดกึ่งกลางโดยประมาณ" ของพื้นที่ ไม่ใช่พิกัดบ้านเลขที่
 *    ระบบจะบันทึกความแม่นยำเป็น subdistrict/district เสมอ และแสดงบนแผนที่
 *    เป็นวงพื้นที่ ไม่ใช่หมุดตำแหน่งจริง
 *    แนะนำให้แทนที่ด้วยข้อมูลขอบเขตการปกครองจากกรมการปกครองเมื่อใช้งานจริง
 */

export type PlaceKind = "subdistrict" | "district" | "landmark";

export interface GazetteerEntry {
  /** ชื่อทางการที่ใช้บันทึกลงฐานข้อมูล */
  name: string;
  kind: PlaceKind;
  district: string;
  subdistrict?: string;
  province: string;
  lat: number;
  lng: number;
  /** คำสะกดอื่น ๆ ที่คนเขียนจริงในโพสต์ */
  aliases: string[];
}

const HATYAI = "หาดใหญ่";
const SONGKHLA = "สงขลา";

/** ตำบลใน อ.หาดใหญ่ */
export const HATYAI_SUBDISTRICTS: GazetteerEntry[] = [
  { name: "หาดใหญ่", kind: "subdistrict", district: HATYAI, subdistrict: "หาดใหญ่", province: SONGKHLA, lat: 7.0086, lng: 100.4747,
    aliases: ["ต.หาดใหญ่", "ตำบลหาดใหญ่", "เทศบาลนครหาดใหญ่", "ในเมืองหาดใหญ่", "กลางเมืองหาดใหญ่"] },
  { name: "คอหงส์", kind: "subdistrict", district: HATYAI, subdistrict: "คอหงส์", province: SONGKHLA, lat: 7.0064, lng: 100.4990,
    aliases: ["ต.คอหงส์", "ตำบลคอหงส์", "คอหงษ์"] },
  { name: "ควนลัง", kind: "subdistrict", district: HATYAI, subdistrict: "ควนลัง", province: SONGKHLA, lat: 6.9899, lng: 100.4265,
    aliases: ["ต.ควนลัง", "ตำบลควนลัง"] },
  { name: "คลองแห", kind: "subdistrict", district: HATYAI, subdistrict: "คลองแห", province: SONGKHLA, lat: 7.0490, lng: 100.4770,
    aliases: ["ต.คลองแห", "ตำบลคลองแห"] },
  { name: "คลองอู่ตะเภา", kind: "subdistrict", district: HATYAI, subdistrict: "คลองอู่ตะเภา", province: SONGKHLA, lat: 7.0300, lng: 100.4550,
    aliases: ["ต.คลองอู่ตะเภา", "ตำบลคลองอู่ตะเภา", "อู่ตะเภา"] },
  { name: "คูเต่า", kind: "subdistrict", district: HATYAI, subdistrict: "คูเต่า", province: SONGKHLA, lat: 7.0900, lng: 100.4500,
    aliases: ["ต.คูเต่า", "ตำบลคูเต่า"] },
  { name: "ฉลุง", kind: "subdistrict", district: HATYAI, subdistrict: "ฉลุง", province: SONGKHLA, lat: 7.0050, lng: 100.3700,
    aliases: ["ต.ฉลุง", "ตำบลฉลุง"] },
  { name: "ทุ่งตำเสา", kind: "subdistrict", district: HATYAI, subdistrict: "ทุ่งตำเสา", province: SONGKHLA, lat: 6.9500, lng: 100.3200,
    aliases: ["ต.ทุ่งตำเสา", "ตำบลทุ่งตำเสา"] },
  { name: "ทุ่งใหญ่", kind: "subdistrict", district: HATYAI, subdistrict: "ทุ่งใหญ่", province: SONGKHLA, lat: 7.0600, lng: 100.4300,
    aliases: ["ต.ทุ่งใหญ่", "ตำบลทุ่งใหญ่"] },
  { name: "ท่าข้าม", kind: "subdistrict", district: HATYAI, subdistrict: "ท่าข้าม", province: SONGKHLA, lat: 6.9550, lng: 100.5120,
    aliases: ["ต.ท่าข้าม", "ตำบลท่าข้าม"] },
  { name: "น้ำน้อย", kind: "subdistrict", district: HATYAI, subdistrict: "น้ำน้อย", province: SONGKHLA, lat: 7.0700, lng: 100.5300,
    aliases: ["ต.น้ำน้อย", "ตำบลน้ำน้อย"] },
  { name: "บ้านพรุ", kind: "subdistrict", district: HATYAI, subdistrict: "บ้านพรุ", province: SONGKHLA, lat: 6.9300, lng: 100.4700,
    aliases: ["ต.บ้านพรุ", "ตำบลบ้านพรุ", "เทศบาลเมืองบ้านพรุ"] },
  { name: "พะตง", kind: "subdistrict", district: HATYAI, subdistrict: "พะตง", province: SONGKHLA, lat: 6.8300, lng: 100.5100,
    aliases: ["ต.พะตง", "ตำบลพะตง"] },
];

/** อำเภออื่นใน จ.สงขลา (พิกัดกึ่งกลางอำเภอโดยประมาณ) */
export const SONGKHLA_DISTRICTS: GazetteerEntry[] = [
  { name: "หาดใหญ่", kind: "district", district: "หาดใหญ่", province: SONGKHLA, lat: 7.0086, lng: 100.4747, aliases: ["อ.หาดใหญ่", "อำเภอหาดใหญ่", "hatyai", "hat yai"] },
  { name: "เมืองสงขลา", kind: "district", district: "เมืองสงขลา", province: SONGKHLA, lat: 7.1988, lng: 100.5951, aliases: ["อ.เมืองสงขลา", "อำเภอเมืองสงขลา", "ในเมืองสงขลา", "เมืองสงขลา"] },
  { name: "สะเดา", kind: "district", district: "สะเดา", province: SONGKHLA, lat: 6.6394, lng: 100.4222, aliases: ["อ.สะเดา", "อำเภอสะเดา", "ด่านนอก", "ปาดังเบซาร์"] },
  { name: "บางกล่ำ", kind: "district", district: "บางกล่ำ", province: SONGKHLA, lat: 7.0333, lng: 100.3833, aliases: ["อ.บางกล่ำ", "อำเภอบางกล่ำ"] },
  { name: "คลองหอยโข่ง", kind: "district", district: "คลองหอยโข่ง", province: SONGKHLA, lat: 6.8833, lng: 100.3833, aliases: ["อ.คลองหอยโข่ง", "อำเภอคลองหอยโข่ง"] },
  { name: "นาหม่อม", kind: "district", district: "นาหม่อม", province: SONGKHLA, lat: 6.9500, lng: 100.5500, aliases: ["อ.นาหม่อม", "อำเภอนาหม่อม"] },
  { name: "รัตภูมิ", kind: "district", district: "รัตภูมิ", province: SONGKHLA, lat: 7.1167, lng: 100.2667, aliases: ["อ.รัตภูมิ", "อำเภอรัตภูมิ"] },
  { name: "ควนเนียง", kind: "district", district: "ควนเนียง", province: SONGKHLA, lat: 7.1667, lng: 100.3667, aliases: ["อ.ควนเนียง", "อำเภอควนเนียง"] },
  { name: "สิงหนคร", kind: "district", district: "สิงหนคร", province: SONGKHLA, lat: 7.2167, lng: 100.5167, aliases: ["อ.สิงหนคร", "อำเภอสิงหนคร"] },
  { name: "สทิงพระ", kind: "district", district: "สทิงพระ", province: SONGKHLA, lat: 7.4667, lng: 100.4333, aliases: ["อ.สทิงพระ", "อำเภอสทิงพระ"] },
  { name: "ระโนด", kind: "district", district: "ระโนด", province: SONGKHLA, lat: 7.7667, lng: 100.3167, aliases: ["อ.ระโนด", "อำเภอระโนด"] },
  { name: "กระแสสินธุ์", kind: "district", district: "กระแสสินธุ์", province: SONGKHLA, lat: 7.6000, lng: 100.3333, aliases: ["อ.กระแสสินธุ์", "อำเภอกระแสสินธุ์"] },
  { name: "นาทวี", kind: "district", district: "นาทวี", province: SONGKHLA, lat: 6.7167, lng: 100.7000, aliases: ["อ.นาทวี", "อำเภอนาทวี"] },
  { name: "จะนะ", kind: "district", district: "จะนะ", province: SONGKHLA, lat: 6.9000, lng: 100.7500, aliases: ["อ.จะนะ", "อำเภอจะนะ"] },
  { name: "เทพา", kind: "district", district: "เทพา", province: SONGKHLA, lat: 6.8167, lng: 100.9500, aliases: ["อ.เทพา", "อำเภอเทพา"] },
  { name: "สะบ้าย้อย", kind: "district", district: "สะบ้าย้อย", province: SONGKHLA, lat: 6.4667, lng: 100.9167, aliases: ["อ.สะบ้าย้อย", "อำเภอสะบ้าย้อย"] },
];

/**
 * แลนด์มาร์กที่คนหาดใหญ่ใช้อ้างอิงตำแหน่งในโพสต์จริง
 * พิกัดเป็นค่าประมาณ ใช้เพื่อ "เดาตำบล" และเป็นคำใบ้ให้ Google Geocoding
 */
export const HATYAI_LANDMARKS: GazetteerEntry[] = [
  { name: "มหาวิทยาลัยสงขลานครินทร์ หาดใหญ่", kind: "landmark", district: HATYAI, subdistrict: "คอหงส์", province: SONGKHLA, lat: 7.0069, lng: 100.4986,
    aliases: ["ม.อ.", "มอ.หาดใหญ่", "ม.อ.หาดใหญ่", "psu", "ม.สงขลานครินทร์", "โรงพยาบาล ม.อ.", "รพ.ม.อ."] },
  { name: "เซ็นทรัลหาดใหญ่", kind: "landmark", district: HATYAI, subdistrict: "หาดใหญ่", province: SONGKHLA, lat: 7.0189, lng: 100.4695,
    aliases: ["เซ็นทรัลเฟสติวัลหาดใหญ่", "central hatyai", "เซนทรัลหาดใหญ่", "เซ็นทรัล"] },
  { name: "ท่าอากาศยานนานาชาติหาดใหญ่", kind: "landmark", district: HATYAI, subdistrict: "ควนลัง", province: SONGKHLA, lat: 6.9333, lng: 100.3928,
    aliases: ["สนามบินหาดใหญ่", "สนามบิน", "ท่าอากาศยานหาดใหญ่"] },
  { name: "ตลาดกิมหยง", kind: "landmark", district: HATYAI, subdistrict: "หาดใหญ่", province: SONGKHLA, lat: 7.0083, lng: 100.4722,
    aliases: ["กิมหยง", "ตลาดสันติสุข"] },
  { name: "สถานีรถไฟหาดใหญ่", kind: "landmark", district: HATYAI, subdistrict: "หาดใหญ่", province: SONGKHLA, lat: 7.0074, lng: 100.4652,
    aliases: ["สถานีรถไฟหาดใหญ่", "หน้าสถานีรถไฟ"] },
  { name: "โรงพยาบาลหาดใหญ่", kind: "landmark", district: HATYAI, subdistrict: "หาดใหญ่", province: SONGKHLA, lat: 7.0122, lng: 100.4783,
    aliases: ["รพ.หาดใหญ่", "โรงพยาบาลหาดใหญ่"] },
  { name: "สวนสาธารณะเทศบาลนครหาดใหญ่", kind: "landmark", district: HATYAI, subdistrict: "คอหงส์", province: SONGKHLA, lat: 6.9878, lng: 100.4633,
    aliases: ["สวนสาธารณะหาดใหญ่", "เขาคอหงส์", "ท้าวมหาพรหม"] },
  { name: "โลตัสหาดใหญ่", kind: "landmark", district: HATYAI, subdistrict: "หาดใหญ่", province: SONGKHLA, lat: 7.0035, lng: 100.4790,
    aliases: ["โลตัสหาดใหญ่", "เทสโก้โลตัส"] },
  { name: "บิ๊กซีหาดใหญ่", kind: "landmark", district: HATYAI, subdistrict: "หาดใหญ่", province: SONGKHLA, lat: 7.0212, lng: 100.4744,
    aliases: ["บิ๊กซีหาดใหญ่", "big c หาดใหญ่"] },
  { name: "ตลาดน้ำคลองแห", kind: "landmark", district: HATYAI, subdistrict: "คลองแห", province: SONGKHLA, lat: 7.0428, lng: 100.4767,
    aliases: ["ตลาดน้ำคลองแห", "วัดคลองแห"] },
  { name: "น้ำตกโตนงาช้าง", kind: "landmark", district: HATYAI, subdistrict: "ทุ่งตำเสา", province: SONGKHLA, lat: 6.9500, lng: 100.2833,
    aliases: ["โตนงาช้าง", "น้ำตกโตนงาช้าง"] },
  { name: "นิคมอุตสาหกรรมภาคใต้ (ฉลุง)", kind: "landmark", district: HATYAI, subdistrict: "ฉลุง", province: SONGKHLA, lat: 6.9667, lng: 100.3667,
    aliases: ["นิคมอุตสาหกรรม", "นิคมฉลุง", "นิคมอุตสาหกรรมฉลุง"] },
];

export const ALL_PLACES: GazetteerEntry[] = [
  ...HATYAI_LANDMARKS,
  ...HATYAI_SUBDISTRICTS,
  ...SONGKHLA_DISTRICTS,
];

/** ตำบล/อำเภอ ใช้เป็นตัวเลือกในฟิลเตอร์ฝั่งผู้ใช้ */
export const DISTRICT_OPTIONS = SONGKHLA_DISTRICTS.map((d) => d.name);
export const HATYAI_SUBDISTRICT_OPTIONS = HATYAI_SUBDISTRICTS.map((s) => s.name);

/** จุดกึ่งกลางหาดใหญ่ ใช้เป็นจุดเริ่มต้นของแผนที่ */
export const HATYAI_CENTER = { lat: 7.0086, lng: 100.4747 };

/** ขอบเขตคร่าว ๆ ของ จ.สงขลา ใช้ตรวจว่าพิกัดที่ได้อยู่ในพื้นที่ให้บริการหรือไม่ */
export const SONGKHLA_BOUNDS = { south: 6.3, west: 100.0, north: 7.9, east: 101.2 };

export function isInServiceArea(lat: number, lng: number): boolean {
  return (
    lat >= SONGKHLA_BOUNDS.south && lat <= SONGKHLA_BOUNDS.north &&
    lng >= SONGKHLA_BOUNDS.west && lng <= SONGKHLA_BOUNDS.east
  );
}

/** ดัชนี alias -> entry เรียงจาก alias ยาวไปสั้น เพื่อให้จับคำเฉพาะเจาะจงก่อน */
const ALIAS_INDEX: Array<{ alias: string; entry: GazetteerEntry }> = ALL_PLACES.flatMap(
  (entry) => [entry.name, ...entry.aliases].map((alias) => ({ alias: alias.toLowerCase(), entry }))
).sort((a, b) => b.alias.length - a.alias.length);

export interface PlaceMatch {
  entry: GazetteerEntry;
  matchedAlias: string;
  index: number;
}

/**
 * หาสถานที่ทั้งหมดที่ปรากฏในข้อความ เรียงตามความเฉพาะเจาะจง
 * (แลนด์มาร์ก > ตำบล > อำเภอ และ alias ยาวกว่าถือว่าเจาะจงกว่า)
 */
export function findPlaces(text: string): PlaceMatch[] {
  const haystack = text.toLowerCase();
  const found: PlaceMatch[] = [];
  const seen = new Set<string>();

  for (const { alias, entry } of ALIAS_INDEX) {
    const index = haystack.indexOf(alias);
    if (index === -1) continue;
    const key = `${entry.kind}:${entry.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ entry, matchedAlias: alias, index });
  }

  const kindRank: Record<PlaceKind, number> = { landmark: 0, subdistrict: 1, district: 2 };
  return found.sort(
    (a, b) => kindRank[a.entry.kind] - kindRank[b.entry.kind] || b.matchedAlias.length - a.matchedAlias.length
  );
}
