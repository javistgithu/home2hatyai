import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePost, type ParsedListing } from "@/lib/parser";
import { geocodeAddress, resolveShortMapUrl } from "@/lib/geocode";
import { autoDedupe, type DedupeOutcome } from "@/lib/dedupe";
import { isInServiceArea } from "@/lib/parser/gazetteer";
import type { GeoPrecision, SourceKind } from "@/lib/types/database";

/** โพสต์ 1 รายการที่ส่งเข้ามาให้ระบบเก็บ */
export interface IngestPostInput {
  content: string;
  external_post_id?: string | null;
  permalink?: string | null;
  author_name?: string | null;
  author_external_id?: string | null;
  posted_at?: string | null;
  images?: string[];
  raw?: Record<string, unknown>;
}

export interface IngestSourceInput {
  kind: SourceKind;
  name: string;
  external_id?: string | null;
  url?: string | null;
}

export interface IngestOptions {
  /** เผยแพร่ทันทีโดยไม่ต้องรออนุมัติ (ค่าเริ่มต้น: false — เข้าคิวให้แอดมินตรวจ) */
  autoPublish?: boolean;
  /** เรียก Google Geocoding เพื่อหาพิกัดที่แม่นขึ้น (มีค่าใช้จ่ายต่อครั้ง) */
  useGeocoding?: boolean;
  /** ตรวจและรวมรายการซ้ำอัตโนมัติ */
  dedupe?: boolean;
  actor?: string;
}

export interface IngestItemResult {
  external_post_id: string | null;
  status: "created" | "skipped_existing" | "rejected" | "merged" | "flagged" | "error";
  listing_id?: string;
  title?: string;
  reason?: string;
  confidence?: number;
  warnings?: string[];
  duplicate_of?: string;
  duplicate_score?: number;
}

export interface IngestReport {
  run_id: string | null;
  received: number;
  inserted: number;
  skipped_existing: number;
  rejected: number;
  merged: number;
  flagged: number;
  errors: number;
  created_listings: number;
  items: IngestItemResult[];
}

/** หา source เดิม หรือสร้างใหม่ถ้ายังไม่มี */
export async function ensureSource(
  supabase: SupabaseClient,
  input: IngestSourceInput
): Promise<string | null> {
  if (input.external_id) {
    const { data: existing } = await supabase
      .from("sources")
      .select("id")
      .eq("kind", input.kind)
      .eq("external_id", input.external_id)
      .maybeSingle();
    if (existing) return existing.id as string;
  } else {
    const { data: existing } = await supabase
      .from("sources")
      .select("id")
      .eq("kind", input.kind)
      .eq("name", input.name)
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id as string;
  }

  const { data, error } = await supabase
    .from("sources")
    .insert({
      kind: input.kind,
      name: input.name,
      external_id: input.external_id ?? null,
      url: input.url ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ingest] สร้างแหล่งข้อมูลไม่สำเร็จ", error);
    return null;
  }
  return data.id as string;
}

/**
 * เติมพิกัดให้ประกาศตามลำดับความน่าเชื่อถือ
 *   1) พิกัดที่อยู่ในโพสต์โดยตรง
 *   2) ลิงก์ Google Maps ย่อ (ตามลิงก์ไปหาพิกัดจริง)
 *   3) Google Geocoding จากที่อยู่ที่แกะได้
 *   4) จุดกึ่งกลางตำบล/อำเภอจากทะเบียนสถานที่ (คร่าว ๆ)
 */
async function enrichGeo(
  parsed: ParsedListing,
  useGeocoding: boolean
): Promise<{
  lat: number | null; lng: number | null;
  precision: GeoPrecision; source: string | null;
  subdistrict: string | null; district: string | null; province: string | null;
  postcode: string | null; addressText: string | null;
}> {
  let { lat, lng, geoPrecision: precision, geoSource: source } = parsed;
  let { subdistrict, district, province, addressText } = parsed;
  let postcode: string | null = null;

  // ลิงก์ย่อของ Google Maps — พิกัดจริงอยู่ที่ปลายทาง
  if (precision !== "exact" && parsed.unresolvedMapUrl) {
    const resolved = await resolveShortMapUrl(parsed.unresolvedMapUrl);
    if (resolved) {
      lat = resolved.lat; lng = resolved.lng;
      precision = "exact"; source = "map_short_link";
    }
  }

  // ยังไม่มีพิกัดที่แม่นพอ -> ลอง geocode จากข้อความที่อยู่
  const needsGeocode = precision === "unknown" || precision === "subdistrict" || precision === "district";
  if (useGeocoding && needsGeocode && parsed.geocodeQuery) {
    const geo = await geocodeAddress(parsed.geocodeQuery);
    if (geo && isInServiceArea(geo.lat, geo.lng)) {
      lat = geo.lat; lng = geo.lng;
      precision = geo.precision; source = "google_geocoding";
      subdistrict = geo.subdistrict ?? subdistrict;
      district = geo.district ?? district;
      province = geo.province ?? province;
      postcode = geo.postcode;
      addressText = addressText ?? geo.formattedAddress;
    }
  }

  return { lat, lng, precision, source, subdistrict, district, province, postcode, addressText };
}

/**
 * ท่อลำเลียงข้อมูลหลัก : โพสต์ดิบ -> ตรวจซ้ำระดับโพสต์ -> แปลงข้อมูล ->
 * เติมพิกัด -> บันทึกประกาศ -> ตรวจซ้ำระดับประกาศ
 */
export async function ingestPosts(
  supabase: SupabaseClient,
  source: IngestSourceInput,
  posts: IngestPostInput[],
  options: IngestOptions = {}
): Promise<IngestReport> {
  const { autoPublish = false, useGeocoding = true, dedupe = true, actor = "api" } = options;

  const sourceId = await ensureSource(supabase, source);
  const report: IngestReport = {
    run_id: null, received: posts.length, inserted: 0, skipped_existing: 0,
    rejected: 0, merged: 0, flagged: 0, errors: 0, created_listings: 0, items: [],
  };

  const { data: run } = await supabase
    .from("ingest_runs")
    .insert({ source_id: sourceId, actor, received: posts.length })
    .select("id")
    .single();
  report.run_id = (run?.id as string) ?? null;

  for (const post of posts) {
    const label = post.external_post_id ?? null;
    try {
      const parsed = await parsePost(post.content);

      // ---- ชั้นที่ 1 : โพสต์เดิมจากแหล่งเดิม (จับด้วย content hash) ----
      const { data: rawPost, error: rawError } = await supabase
        .from("raw_posts")
        .insert({
          source_id: sourceId,
          external_post_id: post.external_post_id ?? null,
          permalink: post.permalink ?? null,
          author_name: post.author_name ?? null,
          author_external_id: post.author_external_id ?? null,
          posted_at: post.posted_at ?? null,
          content: post.content,
          images: post.images ?? [],
          raw: post.raw ?? {},
          content_hash: parsed.contentHash,
          status: "new",
        })
        .select("id")
        .single();

      if (rawError) {
        // 23505 = unique violation -> โพสต์นี้เคยเก็บไปแล้ว
        if (rawError.code === "23505") {
          report.skipped_existing += 1;
          report.items.push({ external_post_id: label, status: "skipped_existing", reason: "เก็บโพสต์นี้ไปแล้ว" });
          continue;
        }
        throw rawError;
      }

      const rawPostId = rawPost.id as string;

      // ---- ชั้นที่ 2 : คัดโพสต์ที่ไม่ใช่ประกาศขาย ----
      if (!parsed.isListing) {
        const reason =
          parsed.intent === "wanted"
            ? "เป็นโพสต์ตามหา/รับซื้อ ไม่ใช่ประกาศขาย"
            : "ข้อมูลไม่พอเป็นประกาศ (ต้องมีราคา และช่องทางติดต่อหรือที่ตั้ง)";
        await supabase.from("raw_posts").update({ status: "rejected", parse_error: reason }).eq("id", rawPostId);
        report.rejected += 1;
        report.items.push({ external_post_id: label, status: "rejected", reason, confidence: parsed.confidence });
        continue;
      }

      // ---- เติมพิกัด ----
      const geo = await enrichGeo(parsed, useGeocoding);

      // ---- บันทึกประกาศ ----
      const { data: listing, error: listingError } = await supabase
        .from("listings")
        .insert({
          raw_post_id: rawPostId,
          source_id: sourceId,
          title: parsed.title,
          description: parsed.description,
          property_type: parsed.propertyType,
          deal_type: parsed.dealType,
          price: parsed.price,
          rent_per_month: parsed.rentPerMonth,
          land_area_sqwa: parsed.landAreaSqwa,
          usable_area_sqm: parsed.usableAreaSqm,
          bedrooms: parsed.bedrooms,
          bathrooms: parsed.bathrooms,
          floors: parsed.floors,
          parking: parsed.parking,
          address_text: geo.addressText,
          landmark: parsed.landmark,
          subdistrict: geo.subdistrict,
          district: geo.district,
          province: geo.province ?? "สงขลา",
          postcode: geo.postcode,
          lat: geo.lat,
          lng: geo.lng,
          geo_precision: geo.precision,
          geo_source: geo.source,
          contact_name: post.author_name ?? null,
          contact_phone: parsed.contactPhone,
          contact_line: parsed.contactLine,
          contact_url: post.permalink ?? null,
          images: post.images ?? [],
          amenities: parsed.amenities,
          status: autoPublish ? "published" : "pending",
          posted_at: post.posted_at ?? null,
        })
        .select("id, title")
        .single();

      if (listingError) throw listingError;

      const listingId = listing.id as string;
      await supabase.from("raw_posts").update({ status: "parsed", listing_id: listingId }).eq("id", rawPostId);

      report.inserted += 1;
      report.created_listings += 1;

      // ---- ชั้นที่ 3 : ตรวจซ้ำระดับประกาศ (ข้ามกลุ่ม/ข้อความต่างกัน) ----
      let dedupeResult: DedupeOutcome = { status: "unique", candidates: [] };
      if (dedupe) dedupeResult = await autoDedupe(supabase, listingId);

      if (dedupeResult.status === "merged") report.merged += 1;
      if (dedupeResult.status === "flagged") report.flagged += 1;

      report.items.push({
        external_post_id: label,
        status: dedupeResult.status === "unique" ? "created" : dedupeResult.status,
        listing_id: listingId,
        title: listing.title as string,
        confidence: parsed.confidence,
        warnings: parsed.warnings,
        duplicate_of: dedupeResult.primaryId,
        duplicate_score: dedupeResult.score,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ingest] ประมวลผลโพสต์ล้มเหลว", message);
      report.errors += 1;
      report.items.push({ external_post_id: label, status: "error", reason: message });
    }
  }

  if (report.run_id) {
    await supabase
      .from("ingest_runs")
      .update({
        inserted: report.inserted,
        skipped_existing: report.skipped_existing,
        duplicates: report.merged + report.flagged,
        created_listings: report.created_listings,
        errors: report.errors,
        detail: { rejected: report.rejected, flagged: report.flagged, merged: report.merged },
        finished_at: new Date().toISOString(),
      })
      .eq("id", report.run_id);
  }

  if (sourceId) {
    await supabase
      .from("sources")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", sourceId);
  }

  return report;
}
