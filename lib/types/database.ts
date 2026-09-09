/**
 * ชนิดข้อมูลของตารางใน Supabase
 * (เขียนมือให้ตรงกับ supabase/migrations — ถ้าแก้ schema อย่าลืมแก้ไฟล์นี้ด้วย
 *  หรือสร้างใหม่ด้วย `supabase gen types typescript`)
 */

export type UserRole = "admin" | "seller" | "buyer";
export type PropertyType =
  | "house" | "townhouse" | "condo" | "land" | "commercial" | "apartment" | "warehouse" | "other";
export type DealType = "sale" | "rent" | "sale_or_rent";
export type ListingStatus = "draft" | "pending" | "published" | "rejected" | "archived" | "sold";
export type RawPostStatus = "new" | "parsed" | "duplicate" | "rejected" | "error";
export type GeoPrecision = "exact" | "rooftop" | "geocoded" | "subdistrict" | "district" | "unknown";
export type SourceKind = "facebook_group" | "facebook_page" | "manual" | "csv" | "webhook" | "seller_app";
export type LeadStatus = "new" | "contacted" | "viewing" | "closed" | "lost";
export type DupDecision = "pending" | "auto" | "confirmed" | "rejected";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  line_id: string | null;
  avatar_url: string | null;
  agency_name: string | null;
  is_verified: boolean;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  kind: SourceKind;
  name: string;
  external_id: string | null;
  url: string | null;
  is_enabled: boolean;
  trust_score: number;
  last_synced_at: string | null;
  last_error: string | null;
  post_count: number;
  created_at: string;
}

export interface RawPost {
  id: string;
  source_id: string | null;
  external_post_id: string | null;
  permalink: string | null;
  author_name: string | null;
  author_external_id: string | null;
  posted_at: string | null;
  content: string;
  images: string[];
  raw: Record<string, unknown>;
  content_hash: string;
  status: RawPostStatus;
  parse_error: string | null;
  listing_id: string | null;
  ingested_at: string;
}

export interface Listing {
  id: string;
  raw_post_id: string | null;
  source_id: string | null;
  owner_id: string | null;
  title: string;
  description: string | null;
  property_type: PropertyType;
  deal_type: DealType;
  price: number | null;
  price_per_sqwa: number | null;
  rent_per_month: number | null;
  land_area_sqwa: number | null;
  usable_area_sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floors: number | null;
  parking: number | null;
  address_text: string | null;
  landmark: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  geo_precision: GeoPrecision;
  geo_source: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_phone_normalized: string | null;
  contact_line: string | null;
  contact_url: string | null;
  images: string[];
  amenities: string[];
  status: ListingStatus;
  reject_reason: string | null;
  duplicate_of: string | null;
  dedupe_key: string | null;
  quality_score: number;
  search_blob: string | null;
  view_count: number;
  contact_count: number;
  posted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ListingInsert = Partial<Listing> & { title: string };

export interface ListingDuplicate {
  id: string;
  primary_id: string;
  duplicate_id: string;
  score: number;
  reasons: Record<string, unknown>;
  decision: DupDecision;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface Favorite {
  user_id: string;
  listing_id: string;
  note: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  listing_id: string;
  buyer_id: string | null;
  seller_id: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  message: string | null;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

export interface IngestRun {
  id: string;
  source_id: string | null;
  actor: string | null;
  received: number;
  inserted: number;
  skipped_existing: number;
  duplicates: number;
  created_listings: number;
  errors: number;
  detail: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  actor_role: UserRole | null;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

/** แถวผลลัพธ์จาก RPC search_listings */
export interface SearchListingRow {
  id: string;
  title: string;
  property_type: PropertyType;
  deal_type: DealType;
  price: number | null;
  rent_per_month: number | null;
  price_per_sqwa: number | null;
  land_area_sqwa: number | null;
  usable_area_sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  district: string | null;
  subdistrict: string | null;
  province: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  geo_precision: GeoPrecision;
  images: string[];
  quality_score: number;
  view_count: number;
  published_at: string | null;
  created_at: string;
  source_id: string | null;
  distance_km: number | null;
  total_count: number;
}

export interface DuplicateCandidateRow {
  candidate_id: string;
  score: number;
  reasons: Record<string, unknown>;
  candidate_title: string;
  candidate_source: string | null;
  candidate_created_at: string;
}

export interface AdminStats {
  listings_total: number;
  listings_published: number;
  listings_pending: number;
  listings_rejected: number;
  listings_duplicate: number;
  listings_no_geo: number;
  dup_pending_review: number;
  raw_posts_total: number;
  raw_posts_new: number;
  raw_posts_error: number;
  sources_total: number;
  sources_enabled: number;
  users_total: number;
  users_sellers: number;
  users_buyers: number;
  leads_new: number;
  ingested_7d: number;
  published_7d: number;
  avg_quality: number;
  geo_coverage_pct: number;
  by_district: Array<{ district: string; total: number }>;
  by_type: Array<{ type: PropertyType; total: number }>;
  by_source: Array<{ name: string; kind: string; total: number }>;
}

export interface SellerStats {
  total: number;
  published: number;
  pending: number;
  rejected: number;
  sold: number;
  views: number;
  leads_new: number;
  leads_total: number;
}
