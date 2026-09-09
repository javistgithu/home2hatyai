-- ============================================================================
-- home2hatyai : ระบบรวมประกาศขายบ้าน/ที่ดิน (Hat Yai Property Aggregator)
-- Migration 0001 : Extensions, Enums, Tables, Indexes
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid(), digest()
create extension if not exists pg_trgm;    -- ใช้เทียบความคล้ายข้อความไทย (ไม่มีการตัดคำ)

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'seller', 'buyer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.property_type as enum (
    'house',        -- บ้านเดี่ยว
    'townhouse',    -- ทาวน์เฮ้าส์ / ทาวน์โฮม
    'condo',        -- คอนโด
    'land',         -- ที่ดินเปล่า
    'commercial',   -- อาคารพาณิชย์ / ตึกแถว
    'apartment',    -- อพาร์ตเมนต์ / หอพัก
    'warehouse',    -- โกดัง / โรงงาน
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.deal_type as enum ('sale', 'rent', 'sale_or_rent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.listing_status as enum (
    'draft',      -- ผู้ขายยังไม่ส่ง
    'pending',    -- รออนุมัติจากแอดมิน
    'published',  -- เผยแพร่แล้ว (ผู้ซื้อเห็น)
    'rejected',   -- ไม่ผ่าน
    'archived',   -- เก็บเข้ากรุ
    'sold'        -- ขายแล้ว
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.raw_post_status as enum ('new', 'parsed', 'duplicate', 'rejected', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  -- ความแม่นยำของพิกัด GPS เรียงจากแม่นสุด -> หยาบสุด
  create type public.geo_precision as enum (
    'exact',        -- พิกัดจากผู้ขาย/ลิงก์ Google Maps ในโพสต์
    'rooftop',      -- geocode ระดับบ้านเลขที่
    'geocoded',     -- geocode ระดับถนน/ซอย
    'subdistrict',  -- ประมาณจากจุดกึ่งกลางตำบล
    'district',     -- ประมาณจากจุดกึ่งกลางอำเภอ
    'unknown'       -- ไม่มีพิกัด
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.source_kind as enum (
    'facebook_group', 'facebook_page', 'manual', 'csv', 'webhook', 'seller_app'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum ('new', 'contacted', 'viewing', 'closed', 'lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dup_decision as enum ('pending', 'auto', 'confirmed', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1) PROFILES : ผู้ใช้ 3 ระดับ (admin / seller / buyer)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         public.user_role not null default 'buyer',
  full_name    text,
  phone        text,
  line_id      text,
  avatar_url   text,
  agency_name  text,                                   -- ชื่อร้าน/นายหน้า (สำหรับผู้ขาย)
  is_verified  boolean not null default false,          -- แอดมินยืนยันตัวตนผู้ขายแล้ว
  is_blocked   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.profiles is 'ข้อมูลผู้ใช้และบทบาท 3 ระดับ: admin / seller / buyer';

-- ---------------------------------------------------------------------------
-- 2) SOURCES : แหล่งข้อมูล (กลุ่ม Facebook, เพจ, นำเข้า CSV, ผู้ขายลงเอง)
-- ---------------------------------------------------------------------------
create table if not exists public.sources (
  id             uuid primary key default gen_random_uuid(),
  kind           public.source_kind not null,
  name           text not null,
  external_id    text,                                  -- group id / page id ของ Facebook
  url            text,
  is_enabled     boolean not null default true,
  trust_score    smallint not null default 50 check (trust_score between 0 and 100),
  last_synced_at timestamptz,
  last_error     text,
  post_count     integer not null default 0,
  created_at     timestamptz not null default now()
);
create unique index if not exists sources_kind_external_key
  on public.sources (kind, external_id) where external_id is not null;
comment on table public.sources is 'แหล่งที่มาของข้อมูลประกาศ ใช้ให้เครดิตแหล่ง และคุมการเปิด/ปิดการเก็บ';

-- ---------------------------------------------------------------------------
-- 3) RAW_POSTS : ข้อความโพสต์ดิบก่อนแปลงเป็นประกาศ (เก็บไว้ตรวจสอบย้อนหลัง)
-- ---------------------------------------------------------------------------
create table if not exists public.raw_posts (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid references public.sources (id) on delete set null,
  external_post_id    text,
  permalink           text,
  author_name         text,
  author_external_id  text,
  posted_at           timestamptz,
  content             text not null,
  images              jsonb not null default '[]'::jsonb,
  raw                 jsonb not null default '{}'::jsonb,
  content_hash        text not null,                    -- sha256 ของข้อความหลัง normalize
  status              public.raw_post_status not null default 'new',
  parse_error         text,
  listing_id          uuid,                             -- FK เพิ่มหลังสร้างตาราง listings
  ingested_at         timestamptz not null default now()
);
-- กันโพสต์เดิมซ้ำจากแหล่งเดียวกัน (คนละกลุ่มยังเก็บได้ แล้วไปรวมกันชั้น listings)
create unique index if not exists raw_posts_source_content_key
  on public.raw_posts (source_id, content_hash);
create unique index if not exists raw_posts_source_external_key
  on public.raw_posts (source_id, external_post_id) where external_post_id is not null;
create index if not exists raw_posts_status_idx on public.raw_posts (status, ingested_at desc);
comment on table public.raw_posts is 'โพสต์ดิบที่เก็บเข้ามา 1 แถว = 1 โพสต์ ใช้ตรวจสอบที่มาและ re-parse ใหม่ได้';

-- ---------------------------------------------------------------------------
-- 4) LISTINGS : ประกาศที่แปลงเป็นโครงสร้างแล้ว (หัวใจของระบบ)
-- ---------------------------------------------------------------------------
create table if not exists public.listings (
  id                       uuid primary key default gen_random_uuid(),
  raw_post_id              uuid references public.raw_posts (id) on delete set null,
  source_id                uuid references public.sources (id) on delete set null,
  owner_id                 uuid references public.profiles (id) on delete set null,

  title                    text not null,
  description              text,
  property_type            public.property_type not null default 'other',
  deal_type                public.deal_type not null default 'sale',

  price                    numeric(14, 2) check (price is null or price >= 0),
  price_per_sqwa           numeric(14, 2),
  rent_per_month           numeric(12, 2) check (rent_per_month is null or rent_per_month >= 0),

  land_area_sqwa           numeric(12, 2) check (land_area_sqwa is null or land_area_sqwa > 0),
  usable_area_sqm          numeric(12, 2) check (usable_area_sqm is null or usable_area_sqm > 0),
  bedrooms                 smallint check (bedrooms is null or bedrooms between 0 and 99),
  bathrooms                smallint check (bathrooms is null or bathrooms between 0 and 99),
  floors                   smallint check (floors is null or floors between 0 and 99),
  parking                  smallint check (parking is null or parking between 0 and 99),

  address_text             text,
  landmark                 text,
  subdistrict              text,
  district                 text,
  province                 text default 'สงขลา',
  postcode                 text,
  lat                      double precision check (lat is null or lat between -90 and 90),
  lng                      double precision check (lng is null or lng between -180 and 180),
  geo_precision            public.geo_precision not null default 'unknown',
  geo_source               text,

  contact_name             text,
  contact_phone            text,
  contact_phone_normalized text,                        -- เบอร์ 10 หลักไม่มีขีด ใช้จับซ้ำ
  contact_line             text,
  contact_url              text,

  images                   text[] not null default '{}',
  amenities                text[] not null default '{}',

  status                   public.listing_status not null default 'pending',
  reject_reason            text,
  duplicate_of             uuid references public.listings (id) on delete set null,
  dedupe_key               text,                        -- ลายนิ้วมือแบบ deterministic
  quality_score            smallint not null default 0, -- 0-100 ความครบถ้วนของข้อมูล
  search_blob              text,                        -- ข้อความรวมสำหรับค้นหา trigram

  view_count               integer not null default 0,
  contact_count            integer not null default 0,

  posted_at                timestamptz,                 -- เวลาที่โพสต์ต้นทาง
  published_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint listings_no_self_duplicate check (duplicate_of is null or duplicate_of <> id)
);
comment on table public.listings is 'ประกาศขายบ้าน/ที่ดินหลังผ่านการแปลงและคัดซ้ำ duplicate_of ชี้ไปยังประกาศหลัก';

create index if not exists listings_live_idx
  on public.listings (published_at desc)
  where status = 'published' and duplicate_of is null;
create index if not exists listings_geo_idx
  on public.listings (lat, lng)
  where status = 'published' and duplicate_of is null and lat is not null;
create index if not exists listings_status_idx        on public.listings (status, created_at desc);
create index if not exists listings_owner_idx         on public.listings (owner_id, created_at desc);
create index if not exists listings_source_idx        on public.listings (source_id);
create index if not exists listings_duplicate_of_idx  on public.listings (duplicate_of);
create index if not exists listings_price_idx         on public.listings (price);
create index if not exists listings_type_idx          on public.listings (property_type, deal_type);
create index if not exists listings_district_idx      on public.listings (district, subdistrict);
create index if not exists listings_phone_idx         on public.listings (contact_phone_normalized);
create index if not exists listings_dedupe_key_idx    on public.listings (dedupe_key);
create index if not exists listings_search_trgm_idx   on public.listings using gin (search_blob gin_trgm_ops);

alter table public.raw_posts
  drop constraint if exists raw_posts_listing_id_fkey;
alter table public.raw_posts
  add constraint raw_posts_listing_id_fkey
  foreign key (listing_id) references public.listings (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5) LISTING_DUPLICATES : คู่ประกาศที่ระบบมองว่าซ้ำกัน + คะแนน + เหตุผล
-- ---------------------------------------------------------------------------
create table if not exists public.listing_duplicates (
  id           uuid primary key default gen_random_uuid(),
  primary_id   uuid not null references public.listings (id) on delete cascade,
  duplicate_id uuid not null references public.listings (id) on delete cascade,
  score        numeric(5, 2) not null check (score between 0 and 100),
  reasons      jsonb not null default '[]'::jsonb,
  decision     public.dup_decision not null default 'pending',
  decided_by   uuid references public.profiles (id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint listing_duplicates_pair_key unique (primary_id, duplicate_id),
  constraint listing_duplicates_distinct check (primary_id <> duplicate_id)
);
create index if not exists listing_duplicates_pending_idx
  on public.listing_duplicates (decision, score desc);
comment on table public.listing_duplicates is 'บันทึกคู่ที่ซ้ำพร้อมคะแนนและเหตุผล ให้แอดมินตรวจซ้ำได้';

-- ---------------------------------------------------------------------------
-- 6) FAVORITES : รายการโปรดของผู้ซื้อ
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ---------------------------------------------------------------------------
-- 7) LEADS : ผู้ซื้อกดติดต่อผู้ขาย
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  buyer_id     uuid references public.profiles (id) on delete set null,
  seller_id    uuid references public.profiles (id) on delete set null,
  buyer_name   text,
  buyer_phone  text,
  message      text,
  status       public.lead_status not null default 'new',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists leads_seller_idx on public.leads (seller_id, created_at desc);
create index if not exists leads_buyer_idx  on public.leads (buyer_id, created_at desc);
create index if not exists leads_listing_idx on public.leads (listing_id);

-- ---------------------------------------------------------------------------
-- 8) SAVED_SEARCHES : เงื่อนไขค้นหาที่ผู้ซื้อบันทึกไว้
-- ---------------------------------------------------------------------------
create table if not exists public.saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  filters    jsonb not null default '{}'::jsonb,
  notify     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists saved_searches_user_idx on public.saved_searches (user_id);

-- ---------------------------------------------------------------------------
-- 9) GEOCODE_CACHE : กันเรียก Google Geocoding API ซ้ำ (ประหยัดโควตา/ค่าใช้จ่าย)
-- ---------------------------------------------------------------------------
create table if not exists public.geocode_cache (
  query_hash        text primary key,
  query             text not null,
  lat               double precision,
  lng               double precision,
  formatted_address text,
  subdistrict       text,
  district          text,
  province          text,
  postcode          text,
  precision         public.geo_precision not null default 'unknown',
  provider          text not null default 'google',
  hit_count         integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 10) INGEST_RUNS : บันทึกทุกรอบการเก็บข้อมูล (ตรวจสอบย้อนหลังได้)
-- ---------------------------------------------------------------------------
create table if not exists public.ingest_runs (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references public.sources (id) on delete set null,
  actor            text,
  received         integer not null default 0,
  inserted         integer not null default 0,
  skipped_existing integer not null default 0,
  duplicates       integer not null default 0,
  created_listings integer not null default 0,
  errors           integer not null default 0,
  detail           jsonb not null default '{}'::jsonb,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index if not exists ingest_runs_started_idx on public.ingest_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- 11) AUDIT_LOGS : ใครทำอะไรกับข้อมูล (สำคัญมากสำหรับระบบที่มีแอดมิน)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  actor_role public.user_role,
  action     text not null,
  entity     text not null,
  entity_id  text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx  on public.audit_logs (entity, entity_id);
