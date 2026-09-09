import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { GOOGLE_GEOCODING_KEY } from "@/lib/env";
import { isInServiceArea } from "@/lib/parser/gazetteer";
import type { GeoPrecision } from "@/lib/types/database";

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
  precision: GeoPrecision;
  provider: string;
  cached: boolean;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Google บอกความละเอียดของผลลัพธ์มาใน location_type */
function mapPrecision(locationType: string | undefined): GeoPrecision {
  switch (locationType) {
    case "ROOFTOP": return "rooftop";
    case "RANGE_INTERPOLATED":
    case "GEOMETRIC_CENTER": return "geocoded";
    case "APPROXIMATE": return "geocoded";
    default: return "geocoded";
  }
}

interface GoogleComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

function pickComponent(components: GoogleComponent[], types: string[]): string | null {
  for (const type of types) {
    const found = components.find((c) => c.types.includes(type));
    if (found) return found.long_name;
  }
  return null;
}

/** ตัดคำนำหน้าที่ Google ใส่มา เช่น "Tambon Ban Phru" / "ตำบลบ้านพรุ" */
function cleanThaiAdminName(name: string | null): string | null {
  if (!name) return null;
  return name
    .replace(/^(ตำบล|แขวง|อำเภอ|เขต|จังหวัด)\s*/u, "")
    .replace(/^(Tambon|Khwaeng|Amphoe|Amphur|Khet|Changwat|Mueang)\s+/i, "")
    .replace(/\s+(District|Subdistrict|Province)$/i, "")
    .trim() || null;
}

/**
 * แปลงข้อความที่อยู่เป็นพิกัด ผ่าน Google Geocoding API พร้อมแคชในฐานข้อมูล
 * คืน null เมื่อไม่มีคีย์ / หาไม่พบ / ผลลัพธ์อยู่นอกพื้นที่ให้บริการ
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const queryHash = await sha256Hex(trimmed.toLowerCase());
  const admin = createAdminClient();

  // 1) แคชก่อนเสมอ — ประหยัดค่าเรียก API และเร็วกว่ามาก
  const { data: cached } = await admin
    .from("geocode_cache")
    .select("*")
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (cached) {
    await admin
      .from("geocode_cache")
      .update({ hit_count: (cached.hit_count ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq("query_hash", queryHash);

    if (cached.lat === null || cached.lng === null) return null;   // เคยหาแล้วไม่เจอ
    return {
      lat: cached.lat, lng: cached.lng,
      formattedAddress: cached.formatted_address,
      subdistrict: cached.subdistrict, district: cached.district,
      province: cached.province, postcode: cached.postcode,
      precision: cached.precision as GeoPrecision,
      provider: cached.provider, cached: true,
    };
  }

  if (!GOOGLE_GEOCODING_KEY) return null;

  // 2) เรียก Google Geocoding API (จำกัดเฉพาะประเทศไทย ผลลัพธ์ภาษาไทย)
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", GOOGLE_GEOCODING_KEY);
  url.searchParams.set("language", "th");
  url.searchParams.set("region", "th");
  url.searchParams.set("components", "country:TH");

  let payload: any;
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    payload = await response.json();
  } catch (error) {
    console.error("[geocode] เรียก Google Geocoding ไม่สำเร็จ", error);
    return null;
  }

  const result = payload?.results?.[0];
  if (payload?.status !== "OK" || !result) {
    // จำไว้ว่าหาไม่เจอ จะได้ไม่ยิงซ้ำ
    await admin.from("geocode_cache").upsert({
      query_hash: queryHash, query: trimmed, lat: null, lng: null,
      precision: "unknown", provider: "google",
    });
    return null;
  }

  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !isInServiceArea(lat, lng)) {
    console.warn(`[geocode] ผลลัพธ์อยู่นอกพื้นที่ให้บริการ: "${trimmed}"`);
    return null;
  }

  const components: GoogleComponent[] = result.address_components ?? [];
  const geocoded: GeocodeResult = {
    lat, lng,
    formattedAddress: result.formatted_address ?? null,
    subdistrict: cleanThaiAdminName(
      pickComponent(components, ["sublocality_level_2", "sublocality_level_1", "sublocality", "administrative_area_level_3", "locality"])
    ),
    district: cleanThaiAdminName(pickComponent(components, ["administrative_area_level_2"])),
    province: cleanThaiAdminName(pickComponent(components, ["administrative_area_level_1"])),
    postcode: pickComponent(components, ["postal_code"]),
    precision: mapPrecision(result.geometry?.location_type),
    provider: "google",
    cached: false,
  };

  await admin.from("geocode_cache").upsert({
    query_hash: queryHash, query: trimmed,
    lat: geocoded.lat, lng: geocoded.lng,
    formatted_address: geocoded.formattedAddress,
    subdistrict: geocoded.subdistrict, district: geocoded.district,
    province: geocoded.province, postcode: geocoded.postcode,
    precision: geocoded.precision, provider: "google",
  });

  return geocoded;
}

/**
 * ลิงก์ย่อของ Google Maps (maps.app.goo.gl) ไม่มีพิกัดอยู่ในตัว URL
 * ต้องตามไปยังปลายทางก่อน แล้วค่อยแกะพิกัดจาก URL เต็ม
 */
export async function resolveShortMapUrl(shortUrl: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(shortUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; home2hatyai/1.0)" },
    });
    const finalUrl = response.url;
    const patterns = [
      /@(-?[0-9.]+),(-?[0-9.]+)/,
      /[?&]q=(-?[0-9.]+),(-?[0-9.]+)/,
      /!3d(-?[0-9.]+)!4d(-?[0-9.]+)/,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(finalUrl);
      if (!match) continue;
      const lat = Number.parseFloat(match[1]);
      const lng = Number.parseFloat(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && isInServiceArea(lat, lng)) {
        return { lat, lng };
      }
    }
  } catch (error) {
    console.error("[geocode] ตามลิงก์ย่อไม่สำเร็จ", error);
  }
  return null;
}
