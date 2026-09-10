import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SearchListingRow } from "@/lib/types/database";
import { isSupabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = new Set([
  "house", "townhouse", "condo", "land", "commercial", "apartment", "warehouse", "other",
]);
const VALID_SORTS = new Set(["newest", "price_asc", "price_desc", "area_desc", "distance", "quality"]);

function num(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * ค้นหาประกาศสำหรับหน้าแผนที่และหน้ารายการ
 * เรียกผ่าน RPC search_listings ที่ยังอยู่ภายใต้ RLS (ผู้ไม่ล็อกอินเห็นเฉพาะที่เผยแพร่แล้ว)
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { error: "ยังไม่ได้ตั้งค่า Supabase — ดูขั้นตอนใน docs/SETUP.md", items: [], total: 0 },
      { status: 503 }
    );
  }

  const params = request.nextUrl.searchParams;
  const supabase = createClient();

  const types = params.getAll("type").filter((t) => VALID_TYPES.has(t));
  const sort = params.get("sort");

  const { data, error } = await supabase.rpc("search_listings", {
    p_q: params.get("q") || null,
    p_property_types: types.length > 0 ? types : null,
    p_deal_type: params.get("deal") || null,
    p_min_price: num(params.get("minPrice")),
    p_max_price: num(params.get("maxPrice")),
    p_min_area: num(params.get("minArea")),
    p_max_area: num(params.get("maxArea")),
    p_bedrooms: num(params.get("bedrooms")),
    p_district: params.get("district") || null,
    p_subdistrict: params.get("subdistrict") || null,
    p_south: num(params.get("south")),
    p_west: num(params.get("west")),
    p_north: num(params.get("north")),
    p_east: num(params.get("east")),
    p_center_lat: num(params.get("lat")),
    p_center_lng: num(params.get("lng")),
    p_radius_km: num(params.get("radius")),
    p_has_geo: params.get("hasGeo") === "1",
    p_sort: sort && VALID_SORTS.has(sort) ? sort : "newest",
    p_limit: Math.min(num(params.get("limit")) ?? 40, 200),
    p_offset: Math.max(num(params.get("offset")) ?? 0, 0),
  });

  if (error) {
    console.error("[api/listings] ค้นหาไม่สำเร็จ", error);
    return NextResponse.json({ error: "ค้นหาข้อมูลไม่สำเร็จ", detail: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as SearchListingRow[];
  return NextResponse.json({
    items: rows,
    total: rows[0]?.total_count ?? 0,
  });
}
