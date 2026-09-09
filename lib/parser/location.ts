/** ตีความตำแหน่งที่ตั้งจากข้อความโพสต์ */
import {
  findPlaces, isInServiceArea, type GazetteerEntry, type PlaceMatch,
} from "./gazetteer";

export type GeoPrecision = "exact" | "rooftop" | "geocoded" | "subdistrict" | "district" | "unknown";

export interface LocationResult {
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  /** ถนน/ซอย/หมู่บ้าน ที่จับได้จากข้อความ */
  street: string | null;
  /** แลนด์มาร์กที่ผู้โพสต์ใช้อ้างอิง */
  landmark: string | null;
  /** ข้อความที่อยู่แบบอ่านได้ ประกอบจากชิ้นส่วนที่จับได้ */
  addressText: string | null;
  /** ข้อความสำหรับส่งไป Google Geocoding API */
  geocodeQuery: string | null;
  /** พิกัดสำรองจากทะเบียนสถานที่ (ใช้เมื่อ geocode ไม่ได้) */
  fallback: { lat: number; lng: number; precision: GeoPrecision } | null;
  matches: PlaceMatch[];
}

/** จับ "ต.บ้านพรุ" / "ตำบลบ้านพรุ" แบบระบุชัด ซึ่งเชื่อถือได้กว่าการเจอชื่อลอย ๆ */
function explicitSubdistrict(text: string): string | null {
  const match = /(?:ต\.|ตำบล)\s*([฀-๿]{2,20}?)(?=\s|$|[,.\/]|อ\.|อำเภอ|จ\.|จังหวัด)/.exec(text);
  return match ? match[1].trim() : null;
}

function explicitDistrict(text: string): string | null {
  const match = /(?:อ\.|อำเภอ)\s*([฀-๿]{2,20}?)(?=\s|$|[,.\/]|จ\.|จังหวัด)/.exec(text);
  return match ? match[1].trim() : null;
}

function explicitProvince(text: string): string | null {
  const match = /(?:จ\.|จังหวัด)\s*([฀-๿]{2,20}?)(?=\s|$|[,.\/])/.exec(text);
  return match ? match[1].trim() : null;
}

/** จับชื่อถนน/ซอย/หมู่บ้าน เช่น "ถ.เพชรเกษม" "ซ.กาญจนวนิช 12" "ม.ศุภาลัย" */
function extractStreet(text: string): string | null {
  const patterns = [
    /((?:ถนน|ถ\.)\s*[฀-๿0-9]{2,25}(?:\s*[0-9]{1,3})?)/,
    /((?:ซอย|ซ\.)\s*[฀-๿a-zA-Z0-9]{1,25}(?:\s*[0-9]{1,3})?)/,
    /((?:หมู่บ้าน|ม\.บ\.)\s*[฀-๿a-zA-Z0-9]{2,25})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

export function resolveLocation(text: string): LocationResult {
  const matches = findPlaces(text);

  const landmarkMatch = matches.find((m) => m.entry.kind === "landmark");
  const subdistrictMatch = matches.find((m) => m.entry.kind === "subdistrict");
  const districtMatch = matches.find((m) => m.entry.kind === "district");

  // ลำดับความน่าเชื่อถือ: เขียนระบุชัด > แลนด์มาร์ก > ชื่อที่เจอลอย ๆ
  const subdistrict =
    explicitSubdistrict(text) ??
    landmarkMatch?.entry.subdistrict ??
    subdistrictMatch?.entry.subdistrict ??
    null;

  const district =
    explicitDistrict(text) ??
    landmarkMatch?.entry.district ??
    subdistrictMatch?.entry.district ??
    districtMatch?.entry.district ??
    null;

  const province =
    explicitProvince(text) ??
    (matches.length > 0 ? matches[0].entry.province : null);

  const street = extractStreet(text);
  const landmark = landmarkMatch?.entry.name ?? null;

  const addressParts = [
    street,
    subdistrict ? `ต.${subdistrict}` : null,
    district ? `อ.${district}` : null,
    province ? `จ.${province}` : null,
  ].filter(Boolean) as string[];

  // คำค้นสำหรับ Google Geocoding: ใส่แลนด์มาร์กเป็นคำใบ้ ช่วยให้แม่นขึ้นมาก
  const queryParts = [street, landmark, subdistrict, district, province, "ประเทศไทย"]
    .filter(Boolean) as string[];

  const fallbackEntry: GazetteerEntry | undefined =
    subdistrictMatch?.entry ??
    (subdistrict ? findPlaces(`ต.${subdistrict}`)[0]?.entry : undefined) ??
    landmarkMatch?.entry ??
    districtMatch?.entry;

  const fallback =
    fallbackEntry && isInServiceArea(fallbackEntry.lat, fallbackEntry.lng)
      ? {
          lat: fallbackEntry.lat,
          lng: fallbackEntry.lng,
          precision: (fallbackEntry.kind === "district" ? "district" : "subdistrict") as GeoPrecision,
        }
      : null;

  return {
    subdistrict,
    district,
    province,
    street,
    landmark,
    addressText: addressParts.length > 0 ? addressParts.join(" ") : null,
    geocodeQuery: queryParts.length > 1 ? queryParts.join(", ") : null,
    fallback,
    matches,
  };
}
