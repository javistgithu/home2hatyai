/**
 * ตัวแยกข้อมูลจากข้อความโพสต์ขายบ้าน/ที่ดินภาษาไทย
 * เขียนด้วย regex ล้วน ไม่พึ่ง external service เพื่อให้ทำงานเร็วและตรวจสอบได้
 */
import { toNumber } from "./normalize";

// ---------------------------------------------------------------------------
// ราคา
// ---------------------------------------------------------------------------

/** ตัวคูณหน่วยเงินไทยที่พบในโพสต์ */
const MONEY_UNITS: Array<[RegExp, number]> = [
  [/^ล้าน|^ลบ\.?$|^ล\.?$|^mb$|^m$/i, 1_000_000],
  [/^แสน/, 100_000],
  [/^หมื่น/, 10_000],
  [/^พัน|^k$/i, 1_000],
  [/^บาท|^฿/, 1],
];

function unitMultiplier(unit?: string | null): number {
  if (!unit) return 1;
  const u = unit.trim();
  for (const [pattern, mult] of MONEY_UNITS) {
    if (pattern.test(u)) return mult;
  }
  return 1;
}

export interface PriceResult {
  /** ราคาขายรวม (บาท) */
  price: number | null;
  /** ค่าเช่าต่อเดือน (บาท) */
  rentPerMonth: number | null;
  /** ราคาต่อตารางวาที่ประกาศไว้ */
  pricePerSqwa: number | null;
  /** ราคาต่อไร่ที่ประกาศไว้ */
  pricePerRai: number | null;
  warnings: string[];
}

const NUM = "([0-9][0-9,]*(?:\\.[0-9]+)?)";
const UNIT = "\\s*(ล้าน|แสน|หมื่น|พัน|ลบ\\.?|บาท)?";

/**
 * ตีความตัวเลขราคาให้เป็นบาท
 * โพสต์ไทยนิยมเขียนย่อ เช่น "ราคา 2.9" = 2.9 ล้าน จึงเดาให้เมื่อค่าน้อยผิดปกติ
 */
function interpretMoney(rawNumber: string, unit: string | undefined, warnings: string[]): number | null {
  const base = toNumber(rawNumber);
  if (base === null) return null;
  const mult = unitMultiplier(unit);
  let value = base * mult;

  if (!unit && value > 0 && value <= 100) {
    // "ราคา 2.9" / "ขาย 15" -> ตีความว่าเป็นหน่วยล้านบาท
    value = value * 1_000_000;
    warnings.push(`ตีความ "${rawNumber}" เป็น ${value.toLocaleString("th-TH")} บาท (สันนิษฐานหน่วยล้าน)`);
  }
  return value;
}

export function extractPrice(text: string): PriceResult {
  const warnings: string[] = [];
  const result: PriceResult = {
    price: null, rentPerMonth: null, pricePerSqwa: null, pricePerRai: null, warnings,
  };

  // 1) ราคาต่อหน่วย — ต้องจับก่อน เพราะเลขชุดนี้ไม่ใช่ราคารวม
  //    และต้อง "ปิดบัง" ข้อความส่วนนั้นไว้ ไม่งั้นขั้นตอนหาราคารวมจะหยิบเลขเดียวกันไปใช้
  //    (เช่น "2 ไร่ ราคาไร่ละ 3.5 ล้าน" ต้องได้ 7 ล้าน ไม่ใช่ 3.5 ล้าน)
  let textForTotal = text;
  const maskRange = (source: string, match: RegExpExecArray): string =>
    source.slice(0, match.index) + " ".repeat(match[0].length) + source.slice(match.index + match[0].length);

  const perRai = new RegExp(`(?:ไร่ละ|ราคาไร่ละ)\\s*${NUM}${UNIT}`).exec(text);
  if (perRai) {
    result.pricePerRai = interpretMoney(perRai[1], perRai[2], warnings);
    textForTotal = maskRange(textForTotal, perRai);
  }

  const perSqwa = new RegExp(
    `(?:ตารางวาละ|ตร\\.?ว\\.?ละ|ตรว\\.?ละ|วาละ)\\s*${NUM}${UNIT}`
  ).exec(text);
  if (perSqwa) {
    const value = interpretMoney(perSqwa[1], perSqwa[2], warnings);
    // ราคาต่อตารางวาปกติหลักพัน-หลักแสน ถ้าถูกเดาเป็นล้านให้ถอยกลับ
    result.pricePerSqwa = value !== null && value > 2_000_000 ? value / 1_000_000 : value;
    textForTotal = maskRange(textForTotal, perSqwa);
  }

  // 2) ค่าเช่ารายเดือน
  const rentPatterns = [
    new RegExp(`(?:ค่าเช่า|ให้เช่า|ปล่อยเช่า|เช่า)\\s*(?:เพียง|เดือนละ)?\\s*${NUM}${UNIT}\\s*(?:บาท)?\\s*(?:\\/|ต่อ|)\\s*(?:เดือน|ด\\.|month|mo)`),
    new RegExp(`เดือนละ\\s*${NUM}${UNIT}`),
  ];
  for (const pattern of rentPatterns) {
    const match = pattern.exec(text);
    if (match) {
      const value = interpretMoney(match[1], match[2], warnings);
      if (value !== null && value >= 500 && value <= 5_000_000) {
        result.rentPerMonth = value;
        break;
      }
    }
  }

  // 3) ราคาขายรวม
  const salePatterns = [
    new RegExp(`(?:ราคาขาย|ราคา|ขายด่วน|ขายเพียง|ขาย|price)\\s*(?:เพียง|แค่|ที่)?\\s*${NUM}${UNIT}`, "i"),
    new RegExp(`${NUM}\\s*(ล้าน|ลบ\\.?)`),
    new RegExp(`${NUM}\\s*บาท`),
  ];
  for (const pattern of salePatterns) {
    const match = pattern.exec(textForTotal);
    if (!match) continue;
    const value = interpretMoney(match[1], match[2], warnings);
    // กรอบสมเหตุสมผลของอสังหาฯ ไทย: 5 หมื่น - 500 ล้าน
    if (value !== null && value >= 50_000 && value <= 500_000_000) {
      result.price = value;
      break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// พื้นที่ (ไร่ - งาน - ตารางวา - ตารางเมตร)
// ---------------------------------------------------------------------------

export const SQWA_PER_RAI = 400;
export const SQWA_PER_NGAN = 100;
export const SQM_PER_SQWA = 4;

export interface AreaResult {
  /** เนื้อที่ดินรวม หน่วยตารางวา */
  landAreaSqwa: number | null;
  /** พื้นที่ใช้สอย หน่วยตารางเมตร */
  usableAreaSqm: number | null;
  /** รายละเอียดที่จับได้ ใช้แสดงให้แอดมินตรวจ */
  breakdown: { rai?: number; ngan?: number; sqwa?: number };
}

export function extractArea(text: string): AreaResult {
  const breakdown: AreaResult["breakdown"] = {};

  // "2 ไร่" แต่ไม่จับ "ไร่ละ 3.5 ล้าน" (ไม่มีตัวเลขนำหน้า)
  const rai = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*ไร่/.exec(text);
  const ngan = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*งาน/.exec(text);
  const sqwa = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:ตารางวา|ตร\.?ว\.?|ตรว\.?|ว\.?า)(?!ละ)/.exec(text);

  if (rai) breakdown.rai = toNumber(rai[1]) ?? undefined;
  if (ngan) breakdown.ngan = toNumber(ngan[1]) ?? undefined;
  if (sqwa) breakdown.sqwa = toNumber(sqwa[1]) ?? undefined;

  let landAreaSqwa: number | null = null;
  if (breakdown.rai || breakdown.ngan || breakdown.sqwa) {
    landAreaSqwa =
      (breakdown.rai ?? 0) * SQWA_PER_RAI +
      (breakdown.ngan ?? 0) * SQWA_PER_NGAN +
      (breakdown.sqwa ?? 0);
  }

  // พื้นที่ใช้สอย ระบุชัดเจนมาก่อน แล้วค่อย fallback เป็น ตร.ม. ทั่วไป
  const usableExplicit = /(?:พื้นที่ใช้สอย|ใช้สอย|usable)\s*(?:ประมาณ)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:ตารางเมตร|ตร\.?ม\.?|ตรม\.?|sqm|sq\.m)?/i.exec(text);
  const sqmGeneric = /([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:ตารางเมตร|ตร\.?ม\.?|ตรม\.?|sqm|sq\.m)(?!ละ)/i.exec(text);
  const usableAreaSqm = toNumber((usableExplicit ?? sqmGeneric)?.[1] ?? "") ?? null;

  return {
    landAreaSqwa: landAreaSqwa && landAreaSqwa > 0 ? Number(landAreaSqwa.toFixed(2)) : null,
    usableAreaSqm: usableAreaSqm && usableAreaSqm > 0 ? usableAreaSqm : null,
    breakdown,
  };
}

// ---------------------------------------------------------------------------
// ห้องนอน / ห้องน้ำ / ชั้น / ที่จอดรถ
// ---------------------------------------------------------------------------

export interface RoomsResult {
  bedrooms: number | null;
  bathrooms: number | null;
  floors: number | null;
  parking: number | null;
}

function firstInt(text: string, patterns: RegExp[], max = 99): number | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = toNumber(match[1]);
    if (value !== null && value >= 0 && value <= max) return Math.round(value);
  }
  return null;
}

export function extractRooms(text: string): RoomsResult {
  const bedrooms = firstInt(text, [
    /([0-9]+)\s*ห้องนอน/,
    /ห้องนอน\s*([0-9]+)/,
    /([0-9]+)\s*นอน/,
    /([0-9]+)\s*(?:bedrooms?|beds?|br)\b/i,
  ], 30);

  const bathrooms = firstInt(text, [
    /([0-9]+)\s*ห้องน้ำ/,
    /ห้องน้ำ\s*([0-9]+)/,
    /([0-9]+)\s*น้ำ/,
    /([0-9]+)\s*(?:bathrooms?|baths?|ba)\b/i,
  ], 30);

  let floors = firstInt(text, [/([0-9]+)\s*ชั้นครึ่ง/, /([0-9]+)\s*ชั้น/], 60);
  if (floors === null && /ชั้นเดียว|บ้านชั้นเดียว/.test(text)) floors = 1;
  if (floors === null && /สองชั้น|2ชั้น/.test(text)) floors = 2;

  const parking = firstInt(text, [
    /(?:จอดรถ|ที่จอดรถ|โรงรถ)\s*(?:ได้)?\s*([0-9]+)\s*คัน/,
    /([0-9]+)\s*คัน/,
  ], 20);

  return { bedrooms, bathrooms, floors, parking };
}

// ---------------------------------------------------------------------------
// ข้อมูลติดต่อ
// ---------------------------------------------------------------------------

export interface ContactResult {
  phones: string[];
  primaryPhone: string | null;
  lineId: string | null;
}

/** แปลงเบอร์ไทยให้เป็น 10 หลักไม่มีขีด (+66xx -> 0xx) */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("66") && digits.length >= 11 && digits.length <= 12) {
    digits = "0" + digits.slice(2);
  }
  if (digits.length < 9 || digits.length > 10) return null;
  if (!digits.startsWith("0")) return null;
  return digits;
}

export function extractContact(text: string): ContactResult {
  const phones = new Set<string>();
  const phonePattern = /(?:^|[^0-9])((?:\+?66|0)[\s\-.]?[0-9](?:[\s\-.]?[0-9]){7,8})(?![0-9])/g;
  let match: RegExpExecArray | null;
  while ((match = phonePattern.exec(text)) !== null) {
    const normalized = normalizePhone(match[1]);
    if (normalized) phones.add(normalized);
  }

  const linePatterns = [
    /(?:line\s*id|lineid|ไลน์ไอดี|ไอดีไลน์|ไลน์|line)\s*[:：\-=]?\s*(@?[a-zA-Z0-9._-]{3,30})/i,
    /(?:^|\s)(@[a-zA-Z0-9._-]{3,30})/,
  ];
  let lineId: string | null = null;
  for (const pattern of linePatterns) {
    const found = pattern.exec(text);
    if (found && !/^https?/i.test(found[1])) {
      lineId = found[1];
      break;
    }
  }

  const list = [...phones];
  return { phones: list, primaryPhone: list[0] ?? null, lineId };
}

// ---------------------------------------------------------------------------
// พิกัด GPS / ลิงก์ Google Maps
// ---------------------------------------------------------------------------

export interface CoordsResult {
  lat: number | null;
  lng: number | null;
  /** ลิงก์แผนที่ที่เจอในโพสต์ (ลิงก์ย่อจะต้องตามไปยังปลายทางก่อนถึงได้พิกัด) */
  mapUrl: string | null;
  /** ลิงก์ย่อที่ยังแกะพิกัดไม่ได้ ต้องให้ฝั่งเซิร์ฟเวอร์ตามต่อ */
  unresolvedShortUrl: string | null;
}

const COORD_PATTERNS = [
  /@(-?[0-9]{1,2}\.[0-9]{4,}),\s*(-?[0-9]{1,3}\.[0-9]{4,})/,      // /maps/@7.0086,100.4747,17z
  /[?&](?:q|ll|daddr|destination)=(-?[0-9]{1,2}\.[0-9]{3,}),\s*(-?[0-9]{1,3}\.[0-9]{3,})/i,
  /!3d(-?[0-9]{1,2}\.[0-9]{3,})!4d(-?[0-9]{1,3}\.[0-9]{3,})/,     // รูปแบบใน URL แบบเต็ม
  /(-?[0-9]{1,2}\.[0-9]{4,})\s*,\s*(-?[0-9]{1,3}\.[0-9]{4,})/,    // พิกัดเปล่า ๆ ในข้อความ
];

export function extractCoords(text: string): CoordsResult {
  const result: CoordsResult = { lat: null, lng: null, mapUrl: null, unresolvedShortUrl: null };

  const url = /(https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps[^\s]*|maps\.google[^\s]*|maps\.app\.goo\.gl\/[^\s]+|goo\.gl\/maps\/[^\s]+))/i.exec(text);
  if (url) result.mapUrl = url[1];

  for (const pattern of COORD_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const lat = Number.parseFloat(match[1]);
    const lng = Number.parseFloat(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      result.lat = lat;
      result.lng = lng;
      break;
    }
  }

  if (result.lat === null && result.mapUrl && /goo\.gl/.test(result.mapUrl)) {
    result.unresolvedShortUrl = result.mapUrl;
  }
  return result;
}

// ---------------------------------------------------------------------------
// ประเภททรัพย์ / ประเภทประกาศ
// ---------------------------------------------------------------------------

export type PropertyType =
  | "house" | "townhouse" | "condo" | "land" | "commercial" | "apartment" | "warehouse" | "other";
export type DealType = "sale" | "rent" | "sale_or_rent";

/** คำสำคัญพร้อมน้ำหนัก — คำที่เจาะจงกว่าได้น้ำหนักสูงกว่า */
const TYPE_KEYWORDS: Array<{ type: PropertyType; keywords: Array<[string, number]> }> = [
  { type: "townhouse", keywords: [["ทาวน์เฮ้าส์", 10], ["ทาวน์เฮาส์", 10], ["ทาวเฮ้าส์", 10], ["ทาวน์โฮม", 10], ["ทาวโฮม", 9], ["บ้านแฝด", 8], ["townhouse", 9], ["townhome", 9]] },
  { type: "condo", keywords: [["คอนโดมิเนียม", 10], ["คอนโด", 9], ["ห้องชุด", 8], ["condo", 9]] },
  { type: "commercial", keywords: [["อาคารพาณิชย์", 10], ["ตึกแถว", 9], ["ห้องแถว", 8], ["โฮมออฟฟิศ", 9], ["เซ้งร้าน", 8], ["เซ้งกิจการ", 8], ["shophouse", 8]] },
  { type: "apartment", keywords: [["อพาร์ตเมนต์", 10], ["อพาร์ทเม้นท์", 10], ["หอพัก", 9], ["แมนชั่น", 8], ["apartment", 9]] },
  { type: "warehouse", keywords: [["คลังสินค้า", 10], ["โกดัง", 9], ["โรงงาน", 9], ["warehouse", 9]] },
  { type: "house", keywords: [["บ้านเดี่ยว", 10], ["บ้านชั้นเดียว", 9], ["บ้านสวน", 8], ["บ้านพร้อมที่ดิน", 9], ["บ้านมือสอง", 8], ["บ้านน็อคดาวน์", 7], ["บ้าน", 5], ["house", 6], ["villa", 6]] },
  { type: "land", keywords: [["ที่ดินเปล่า", 10], ["ที่ดินจัดสรร", 9], ["ที่ดิน", 8], ["ที่สวน", 7], ["ที่นา", 7], ["land", 7], ["ที่ดินติด", 8]] },
];

export function extractPropertyType(text: string): { type: PropertyType; score: number } {
  const haystack = text.toLowerCase();
  let best: { type: PropertyType; score: number } = { type: "other", score: 0 };

  for (const group of TYPE_KEYWORDS) {
    for (const [keyword, weight] of group.keywords) {
      if (haystack.includes(keyword.toLowerCase()) && weight > best.score) {
        best = { type: group.type, score: weight };
      }
    }
  }
  return best;
}

export function extractDealType(text: string): DealType {
  // "เหมาะปล่อยเช่านักศึกษา" / "ปล่อยเช่าได้" เป็นจุดขายของประกาศ "ขาย" ไม่ใช่การให้เช่า
  const rentAsSellingPoint = /(เหมาะ(?:สำหรับ)?(?:การ)?(?:ซื้อ)?ปล่อยเช่า|ปล่อยเช่าได้|ทำหอพัก|ลงทุนปล่อยเช่า|ผลตอบแทนค่าเช่า)/;
  const cleaned = text.replace(rentAsSellingPoint, " ");

  const wantsRent = /(ให้เช่า|ปล่อยเช่า|ค่าเช่า|เช่าเดือนละ|เช่าเดือน|for rent)/i.test(cleaned);
  const wantsSale = /(ขาย|จำหน่าย|for sale|เซ้ง)/i.test(cleaned);
  if (wantsRent && wantsSale) return "sale_or_rent";
  if (wantsRent) return "rent";
  return "sale";
}

/**
 * แยกโพสต์ "ประกาศขาย" ออกจากโพสต์ "ประกาศตามหา/รับซื้อ"
 * กลุ่มซื้อขายอสังหาฯ มีโพสต์ตามหาปนอยู่เยอะ ถ้าไม่กรองจะกลายเป็นประกาศผีในระบบ
 */
export function detectPostIntent(text: string): "listing" | "wanted" | "unknown" {
  const wantedSignals = [
    /(?:รับซื้อ|ต้องการซื้อ|หาซื้อ|อยากซื้อ|ต้องการเช่า|หาบ้านเช่า|หาห้องเช่า|หาที่ดิน)/,
    /(?:มีใคร|ใครมี).{0,20}(?:ขาย|ปล่อย|ให้เช่า).{0,12}(?:บ้าง|มั้ย|ไหม)/,
    /(?:รบกวนแนะนำ|ขอคำแนะนำ|ช่วยแนะนำ)/,
    /งบ(?:ประมาณ|ไม่เกิน)/,
  ];
  const listingSignals = [
    /(?:ขายด่วน|ประกาศขาย|ขายบ้าน|ขายที่ดิน|ขายคอนโด|ให้เช่า|ปล่อยเช่า)/,
    /(?:สนใจติดต่อ|โทรสอบถาม|สอบถามเพิ่มเติม|นัดดูบ้าน|นัดชม)/,
  ];

  const wanted = wantedSignals.filter((p) => p.test(text)).length;
  const listing = listingSignals.filter((p) => p.test(text)).length;

  if (wanted > 0 && wanted >= listing) return "wanted";
  if (listing > 0) return "listing";
  return "unknown";
}

/** สิ่งอำนวยความสะดวกที่พบบ่อยในโพสต์ */
const AMENITY_KEYWORDS = [
  "เฟอร์นิเจอร์ครบ", "เฟอร์นิเจอร์บางส่วน", "แอร์", "เครื่องทำน้ำอุ่น", "ที่จอดรถ",
  "สระว่ายน้ำ", "ฟิตเนส", "รปภ", "กล้องวงจรปิด", "ใกล้ห้าง", "ใกล้โรงเรียน",
  "ใกล้โรงพยาบาล", "ใกล้มหาวิทยาลัย", "ถมแล้ว", "ติดถนนลาดยาง", "ไฟฟ้า", "ประปา",
  "โฉนด", "นส.3", "พร้อมอยู่", "ต่อเติมแล้ว", "เจ้าของขายเอง", "ต่อรองได้", "ผ่อนได้",
];

export function extractAmenities(text: string): string[] {
  return AMENITY_KEYWORDS.filter((keyword) => text.includes(keyword));
}
