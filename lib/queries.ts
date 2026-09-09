import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchListingRow } from "@/lib/types/database";

export interface SearchParams {
  q?: string | null;
  types?: string[] | null;
  deal?: string | null;
  district?: string | null;
  subdistrict?: string | null;
  sort?: string;
  limit?: number;
  offset?: number;
  hasGeo?: boolean;
}

/** เรียก RPC ค้นหาประกาศจากฝั่งเซิร์ฟเวอร์ (ใช้ตอน render หน้าแรก) */
export async function searchListings(
  supabase: SupabaseClient,
  params: SearchParams = {}
): Promise<{ items: SearchListingRow[]; total: number; error: string | null }> {
  const { data, error } = await supabase.rpc("search_listings", {
    p_q: params.q ?? null,
    p_property_types: params.types?.length ? params.types : null,
    p_deal_type: params.deal ?? null,
    p_district: params.district ?? null,
    p_subdistrict: params.subdistrict ?? null,
    p_has_geo: params.hasGeo ?? false,
    p_sort: params.sort ?? "newest",
    p_limit: params.limit ?? 30,
    p_offset: params.offset ?? 0,
  });

  if (error) {
    console.error("[queries] search_listings ล้มเหลว", error);
    return { items: [], total: 0, error: error.message };
  }
  const items = (data ?? []) as SearchListingRow[];
  return { items, total: items[0]?.total_count ?? 0, error: null };
}
