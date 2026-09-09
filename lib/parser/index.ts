/**
 * แปลงข้อความโพสต์ขายบ้าน/ที่ดิน -> โครงสร้างข้อมูลประกาศ
 *
 *   parsePost(rawText) -> ParsedListing
 *
 * ออกแบบให้ "อธิบายได้" : ทุกฟิลด์บอกได้ว่ามาจากไหน และมี warnings
 * ให้แอดมินตรวจสอบจุดที่ระบบเดา ก่อนกดอนุมัติ
 */
import { canonicalizeForHash, normalizeText, truncate } from "./normalize";
import {
  extractAmenities, extractArea, extractContact, extractCoords, extractDealType,
  extractPrice, extractPropertyType, extractRooms, detectPostIntent,
  type DealType, type PropertyType,
} from "./extract";
import { resolveLocation, type GeoPrecision, type LocationResult } from "./location";
import { isInServiceArea } from "./gazetteer";

export type { PropertyType, DealType, GeoPrecision };

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  house: "บ้านเดี่ยว",
  townhouse: "ทาวน์เฮ้าส์/ทาวน์โฮม",
  condo: "คอนโด",
  land: "ที่ดิน",
  commercial: "อาคารพาณิชย์",
  apartment: "อพาร์ตเมนต์/หอพัก",
  warehouse: "โกดัง/โรงงาน",
  other: "อสังหาริมทรัพย์",
};

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  sale: "ขาย",
  rent: "ให้เช่า",
  sale_or_rent: "ขาย/ให้เช่า",
};

export interface ParsedListing {
  title: string;
  description: string;
  propertyType: PropertyType;
  dealType: DealType;

  price: number | null;
  rentPerMonth: number | null;
  pricePerSqwa: number | null;

  landAreaSqwa: number | null;
  usableAreaSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floors: number | null;
  parking: number | null;

  subdistrict: string | null;
  district: string | null;
  province: string | null;
  addressText: string | null;
  landmark: string | null;
  geocodeQuery: string | null;

  lat: number | null;
  lng: number | null;
  geoPrecision: GeoPrecision;
  geoSource: string | null;
  /** ลิงก์แผนที่ย่อที่ต้องให้เซิร์ฟเวอร์ตามต่อเพื่อหาพิกัด */
  unresolvedMapUrl: string | null;

  contactPhone: string | null;
  contactPhones: string[];
  contactLine: string | null;

  amenities: string[];
  contentHash: string;

  /** โพสต์นี้เป็นประกาศขาย/ให้เช่า หรือเป็นโพสต์ตามหา */
  intent: "listing" | "wanted" | "unknown";
  /** ผ่านเกณฑ์ขั้นต่ำที่จะบันทึกเป็นประกาศได้หรือไม่ */
  isListing: boolean;

  /** 0-1 ความมั่นใจโดยรวมของการแปลง */
  confidence: number;
  /** จุดที่ระบบเดาหรือข้อมูลขาด ให้แอดมินตรวจ */
  warnings: string[];
  location: LocationResult;
}

/** sha256 ทำงานได้ทั้งบน Node และ Edge runtime */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatAreaLabel(sqwa: number | null): string | null {
  if (!sqwa) return null;
  if (sqwa >= 400) {
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
  return `${Number(sqwa.toFixed(2))} ตร.ว.`;
}

/** สร้างชื่อประกาศ : ใช้บรรทัดแรกถ้าใช้ได้ ไม่งั้นประกอบจากข้อมูลที่แปลงได้ */
type TitleInput = Pick<ParsedListing, "dealType" | "propertyType" | "landAreaSqwa" | "bedrooms" | "subdistrict" | "district">;

function buildTitle(text: string, parsed: TitleInput): string {
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length >= 12);
  const looksLikeTitle =
    firstLine &&
    firstLine.length <= 120 &&
    !/^[0-9\s\-.+()]+$/.test(firstLine) &&
    !/^(สนใจ|ติดต่อ|โทร|inbox|line)/i.test(firstLine);

  if (looksLikeTitle) return truncate(firstLine, 110);

  const parts = [
    DEAL_TYPE_LABELS[parsed.dealType],
    PROPERTY_TYPE_LABELS[parsed.propertyType],
    formatAreaLabel(parsed.landAreaSqwa),
    parsed.bedrooms ? `${parsed.bedrooms} ห้องนอน` : null,
    parsed.subdistrict ? `ต.${parsed.subdistrict}` : parsed.district ? `อ.${parsed.district}` : null,
  ].filter(Boolean);
  return truncate(parts.join(" ") || "ประกาศอสังหาริมทรัพย์", 110);
}

/**
 * คำนวณความมั่นใจ : ให้น้ำหนักกับข้อมูลที่ผู้ซื้อใช้ตัดสินใจจริง
 * (ราคา + ตำแหน่ง + ประเภท + ช่องทางติดต่อ)
 */
function computeConfidence(parsed: Partial<ParsedListing>): number {
  let score = 0;
  if (parsed.price || parsed.rentPerMonth) score += 0.3;
  if (parsed.landAreaSqwa || parsed.usableAreaSqm) score += 0.15;
  if (parsed.propertyType && parsed.propertyType !== "other") score += 0.15;
  if (parsed.geoPrecision === "exact" || parsed.geoPrecision === "rooftop") score += 0.15;
  else if (parsed.geoPrecision === "geocoded") score += 0.12;
  else if (parsed.lat != null) score += 0.06;   // พิกัดกึ่งกลางตำบล/อำเภอ ยังไม่แม่นพอ
  if (parsed.subdistrict || parsed.district) score += 0.1;
  if (parsed.contactPhone) score += 0.15;
  return Math.min(1, Number(score.toFixed(2)));
}

export async function parsePost(rawText: string): Promise<ParsedListing> {
  const text = normalizeText(rawText);
  const warnings: string[] = [];

  const priceResult = extractPrice(text);
  const area = extractArea(text);
  const rooms = extractRooms(text);
  const contact = extractContact(text);
  const coords = extractCoords(text);
  const location = resolveLocation(text);
  const typeResult = extractPropertyType(text);
  const amenities = extractAmenities(text);
  const intent = detectPostIntent(text);
  let dealType = extractDealType(text);

  warnings.push(...priceResult.warnings);

  // ปรับประเภทประกาศตามราคาที่จับได้จริง — คำว่า "เช่า" ในโพสต์ขายมักเป็นแค่จุดขาย
  if (dealType === "sale_or_rent" && priceResult.rentPerMonth === null && priceResult.price !== null) {
    dealType = "sale";
  } else if (dealType === "rent" && priceResult.rentPerMonth === null && priceResult.price !== null) {
    dealType = "sale";
    warnings.push("โพสต์มีคำว่าเช่า แต่พบเฉพาะราคาขาย จึงจัดเป็นประกาศขาย");
  }

  // ถ้าโพสต์บอกแค่ราคาต่อหน่วย ให้คำนวณราคารวมจากพื้นที่
  let price = priceResult.price;
  if (price === null && priceResult.pricePerRai !== null && area.landAreaSqwa !== null) {
    price = (area.landAreaSqwa / 400) * priceResult.pricePerRai;
    warnings.push("คำนวณราคารวมจาก 'ไร่ละ' คูณกับเนื้อที่");
  }
  if (price === null && priceResult.pricePerSqwa !== null && area.landAreaSqwa !== null) {
    price = area.landAreaSqwa * priceResult.pricePerSqwa;
    warnings.push("คำนวณราคารวมจาก 'ตารางวาละ' คูณกับเนื้อที่");
  }

  // พิกัด : ในโพสต์ > พิกัดสำรองจากทะเบียนสถานที่ > ไม่มี
  let lat: number | null = null;
  let lng: number | null = null;
  let geoPrecision: GeoPrecision = "unknown";
  let geoSource: string | null = null;

  if (coords.lat !== null && coords.lng !== null) {
    if (isInServiceArea(coords.lat, coords.lng)) {
      lat = coords.lat;
      lng = coords.lng;
      geoPrecision = "exact";
      geoSource = "post_coordinates";
    } else {
      warnings.push(`พบพิกัดในโพสต์ (${coords.lat}, ${coords.lng}) แต่อยู่นอกพื้นที่ จ.สงขลา จึงไม่นำมาใช้`);
    }
  }

  if (lat === null && location.fallback) {
    lat = location.fallback.lat;
    lng = location.fallback.lng;
    geoPrecision = location.fallback.precision;
    geoSource = "gazetteer";
    warnings.push(
      `ไม่พบพิกัดในโพสต์ ใช้จุดกึ่งกลาง${geoPrecision === "district" ? "อำเภอ" : "ตำบล"}โดยประมาณแทน`
    );
  }

  if (lat === null) warnings.push("ไม่สามารถระบุตำแหน่งได้ ต้องให้แอดมินปักหมุดเอง");
  if (price === null && priceResult.rentPerMonth === null) warnings.push("ไม่พบราคาในโพสต์");
  if (!contact.primaryPhone) warnings.push("ไม่พบเบอร์ติดต่อในโพสต์");
  if (typeResult.type === "other") warnings.push("ระบุประเภททรัพย์ไม่ได้");

  const core = {
    description: text,
    propertyType: typeResult.type,
    dealType,
    price: price !== null ? Math.round(price) : null,
    rentPerMonth: priceResult.rentPerMonth,
    pricePerSqwa: priceResult.pricePerSqwa,
    landAreaSqwa: area.landAreaSqwa,
    usableAreaSqm: area.usableAreaSqm,
    bedrooms: rooms.bedrooms,
    bathrooms: rooms.bathrooms,
    floors: rooms.floors,
    parking: rooms.parking,
    subdistrict: location.subdistrict,
    district: location.district,
    province: location.province ?? "สงขลา",
    addressText: location.addressText,
    landmark: location.landmark,
    geocodeQuery: location.geocodeQuery,
    lat,
    lng,
    geoPrecision,
    geoSource,
    unresolvedMapUrl: coords.unresolvedShortUrl,
    contactPhone: contact.primaryPhone,
    contactPhones: contact.phones,
    contactLine: contact.lineId,
    amenities,
  };

  if (intent === "wanted") {
    warnings.push("โพสต์นี้ดูเหมือน 'ประกาศตามหา/รับซื้อ' ไม่ใช่ประกาศขาย");
  }

  // เกณฑ์ขั้นต่ำที่จะเก็บเป็นประกาศ : ต้องไม่ใช่โพสต์ตามหา และต้องมีราคาหรือช่องทางติดต่อ
  const isListing =
    intent !== "wanted" &&
    (core.price !== null || core.rentPerMonth !== null) &&
    (core.contactPhone !== null || core.contactLine !== null || core.addressText !== null);

  return {
    ...core,
    intent,
    isListing,
    title: buildTitle(text, core),
    contentHash: await sha256Hex(canonicalizeForHash(rawText)),
    confidence: computeConfidence(core),
    warnings,
    location,
  };
}

export { formatAreaLabel };
