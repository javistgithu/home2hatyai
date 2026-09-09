-- ============================================================================
-- Migration 0002 : Functions, Triggers, Search RPC, Dedupe engine
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper : บทบาทของผู้ใช้ปัจจุบัน
-- SECURITY DEFINER เพื่อไม่ให้ policy ของ profiles เรียกตัวเองวนซ้ำ (infinite recursion)
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_seller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('seller', 'admin') from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Helper : updated_at อัตโนมัติ
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- สมัครสมาชิกใหม่ -> สร้าง profile อัตโนมัติ
-- บทบาทรับได้เฉพาะ buyer/seller เท่านั้น (admin ต้องตั้งจากฐานข้อมูลโดยตรง)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := coalesce(new.raw_user_meta_data ->> 'role', 'buyer');
  safe_role public.user_role;
begin
  safe_role := case when requested = 'seller' then 'seller'::public.user_role
                    else 'buyer'::public.user_role end;

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    safe_role,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- normalize เบอร์โทรไทย : +66812345678 / 081-234-5678 -> 0812345678
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if p_phone is null then return null; end if;
  digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if digits = '' then return null; end if;
  if left(digits, 2) = '66' and length(digits) between 11 and 12 then
    digits := '0' || substring(digits from 3);
  end if;
  if length(digits) < 9 or length(digits) > 10 then return null; end if;
  return digits;
end;
$$;

-- ---------------------------------------------------------------------------
-- ระยะทางระหว่างพิกัด (กิโลเมตร) — สูตร Haversine ไม่ต้องพึ่ง PostGIS
-- ---------------------------------------------------------------------------
create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 6371.0 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  end;
$$;

-- ---------------------------------------------------------------------------
-- คะแนนความครบถ้วนของประกาศ 0-100 (ใช้จัดอันดับและเตือนผู้ขาย)
-- ---------------------------------------------------------------------------
create or replace function public.compute_quality_score(l public.listings)
returns smallint
language sql
immutable
as $$
  select least(100, (
      (case when l.title is not null and length(l.title) >= 10 then 10 else 0 end) +
      (case when l.description is not null and length(l.description) >= 40 then 10 else 0 end) +
      (case when l.price is not null or l.rent_per_month is not null then 20 else 0 end) +
      (case when l.land_area_sqwa is not null or l.usable_area_sqm is not null then 12 else 0 end) +
      (case when l.property_type <> 'other' then 8 else 0 end) +
      (case when l.lat is not null and l.geo_precision in ('exact', 'rooftop', 'geocoded') then 20
            when l.lat is not null then 10 else 0 end) +
      (case when l.contact_phone_normalized is not null then 10 else 0 end) +
      (case when array_length(l.images, 1) >= 1 then 10 else 0 end)
  ))::smallint;
$$;

-- ---------------------------------------------------------------------------
-- ก่อนบันทึก listing : เติมข้อมูลที่คำนวณได้ทั้งหมด
-- ---------------------------------------------------------------------------
create or replace function public.listings_before_write()
returns trigger
language plpgsql
as $$
begin
  new.contact_phone_normalized := public.normalize_phone(new.contact_phone);

  -- ราคาต่อตารางวา คำนวณให้อัตโนมัติเมื่อมีข้อมูลครบ
  if new.price is not null and new.land_area_sqwa is not null and new.land_area_sqwa > 0 then
    new.price_per_sqwa := round(new.price / new.land_area_sqwa, 2);
  end if;

  -- ข้อความรวมสำหรับค้นหา + เทียบความคล้าย (trigram)
  new.search_blob := lower(trim(regexp_replace(
    concat_ws(' ',
      new.title, new.description, new.address_text, new.landmark,
      new.subdistrict, new.district, new.province, new.contact_name
    ), '\s+', ' ', 'g')));

  -- ลายนิ้วมือแบบหยาบ : ทรัพย์ประเภทเดียวกัน ราคาใกล้กัน พื้นที่ใกล้กัน พิกัดใกล้กัน
  new.dedupe_key := encode(digest(concat_ws('|',
      new.property_type::text,
      new.deal_type::text,
      coalesce(round(coalesce(new.price, new.rent_per_month, 0) / 50000)::text, '0'),
      coalesce(round(coalesce(new.land_area_sqwa, new.usable_area_sqm, 0) / 5)::text, '0'),
      coalesce(new.contact_phone_normalized, ''),
      coalesce(round(new.lat::numeric, 3)::text, ''),
      coalesce(round(new.lng::numeric, 3)::text, '')
    ), 'sha256'), 'hex');

  new.quality_score := public.compute_quality_score(new);

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists listings_before_write on public.listings;
drop trigger if exists listings_20_compute on public.listings;
create trigger listings_20_compute before insert or update on public.listings
  for each row execute function public.listings_before_write();

-- ---------------------------------------------------------------------------
-- เครื่องมือคัดข้อมูลซ้ำ : ให้คะแนน 0-100 พร้อมเหตุผลที่อธิบายได้
--   เบอร์โทรตรงกัน            +40
--   ราคาต่างกันไม่เกิน 2%     +18
--   พื้นที่ต่างกันไม่เกิน 3%   +14
--   พิกัดห่างกันน้อยกว่า 300 ม. +16  (500 ม. +8)
--   ข้อความคล้ายกัน            + similarity * 32
--   คนละประเภททรัพย์          -25
-- ---------------------------------------------------------------------------
create or replace function public.find_duplicate_candidates(
  p_listing_id uuid,
  p_min_score numeric default 55,
  p_limit integer default 20
)
returns table (
  candidate_id uuid,
  score numeric,
  reasons jsonb,
  candidate_title text,
  candidate_source uuid,
  candidate_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  base public.listings;
begin
  -- ป้องกันสิทธิ์: SECURITY DEFINER ทำให้ฟังก์ชันนี้ข้าม RLS ได้
  -- ผู้ใช้ที่ล็อกอินอยู่ต้องเป็นแอดมินเท่านั้น (auth.uid() = null คือ service role ฝั่งเซิร์ฟเวอร์)
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'ต้องเป็นแอดมินเท่านั้น' using errcode = '42501';
  end if;

  select * into base from public.listings where id = p_listing_id;
  if base.id is null then return; end if;

  return query
  with scored as (
    select
      c.id,
      c.title,
      c.source_id,
      c.created_at,
      -- เบอร์โทร
      (case when base.contact_phone_normalized is not null
             and c.contact_phone_normalized = base.contact_phone_normalized
            then 40 else 0 end)::numeric as s_phone,
      -- ราคา
      (case when base.price is not null and c.price is not null and base.price > 0
             and abs(c.price - base.price) / base.price <= 0.02
            then 18 else 0 end)::numeric as s_price,
      -- พื้นที่
      (case when base.land_area_sqwa is not null and c.land_area_sqwa is not null
             and base.land_area_sqwa > 0
             and abs(c.land_area_sqwa - base.land_area_sqwa) / base.land_area_sqwa <= 0.03
            then 14 else 0 end)::numeric as s_area,
      -- ระยะห่างพิกัด
      (case
        when base.lat is null or c.lat is null then 0
        when public.haversine_km(base.lat, base.lng, c.lat, c.lng) <= 0.3 then 16
        when public.haversine_km(base.lat, base.lng, c.lat, c.lng) <= 0.5 then 8
        else 0 end)::numeric as s_geo,
      -- ความคล้ายข้อความ
      (coalesce(similarity(left(coalesce(base.search_blob, ''), 500),
                           left(coalesce(c.search_blob, ''), 500)), 0) * 32)::numeric as s_text,
      -- ประเภททรัพย์คนละอย่าง = โทษ
      (case when c.property_type <> base.property_type then -25 else 4 end)::numeric as s_type,
      public.haversine_km(base.lat, base.lng, c.lat, c.lng) as dist_km,
      similarity(left(coalesce(base.search_blob, ''), 500),
                 left(coalesce(c.search_blob, ''), 500)) as text_sim
    from public.listings c
    where c.id <> base.id
      and c.duplicate_of is null
      and c.status <> 'rejected'
      and (
        c.contact_phone_normalized = base.contact_phone_normalized
        or c.dedupe_key = base.dedupe_key
        or (base.lat is not null and c.lat is not null
            and c.lat between base.lat - 0.02 and base.lat + 0.02
            and c.lng between base.lng - 0.02 and base.lng + 0.02)
        or left(coalesce(c.search_blob, ''), 500) % left(coalesce(base.search_blob, ''), 500)
      )
  )
  select
    s.id,
    round(greatest(0, least(100, s.s_phone + s.s_price + s.s_area + s.s_geo + s.s_text + s.s_type)), 2),
    jsonb_strip_nulls(jsonb_build_object(
      'phone_match',    case when s.s_phone > 0 then true else null end,
      'price_match',    case when s.s_price > 0 then true else null end,
      'area_match',     case when s.s_area > 0 then true else null end,
      'distance_km',    case when s.dist_km is not null then round(s.dist_km::numeric, 3) else null end,
      'text_similarity', round(coalesce(s.text_sim, 0)::numeric, 3),
      'same_type',      case when s.s_type > 0 then true else false end
    )),
    s.title,
    s.source_id,
    s.created_at
  from scored s
  where greatest(0, least(100, s.s_phone + s.s_price + s.s_area + s.s_geo + s.s_text + s.s_type)) >= p_min_score
  order by 2 desc, s.created_at asc
  limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- รวมประกาศซ้ำเข้ากับประกาศหลัก (ใช้โดยแอดมิน หรือ pipeline อัตโนมัติ)
-- ประกาศรองจะถูกทำเครื่องหมาย duplicate_of + archived แต่ไม่ลบ (ตรวจสอบย้อนหลังได้)
-- ---------------------------------------------------------------------------
create or replace function public.merge_duplicate(
  p_primary_id uuid,
  p_duplicate_id uuid,
  p_score numeric default 100,
  p_reasons jsonb default '[]'::jsonb,
  p_decision public.dup_decision default 'confirmed'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  primary_images text[];
  dup_images text[];
begin
  -- ป้องกันสิทธิ์: SECURITY DEFINER ทำให้ฟังก์ชันนี้ข้าม RLS ได้
  -- ผู้ใช้ที่ล็อกอินอยู่ต้องเป็นแอดมินเท่านั้น (auth.uid() = null คือ service role ฝั่งเซิร์ฟเวอร์)
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'ต้องเป็นแอดมินเท่านั้น' using errcode = '42501';
  end if;

  if p_primary_id = p_duplicate_id then
    raise exception 'ไม่สามารถรวมประกาศเข้ากับตัวเองได้';
  end if;

  -- รวมรูปภาพจากประกาศซ้ำเข้าประกาศหลัก (ไม่ให้ซ้ำกัน)
  select images into primary_images from public.listings where id = p_primary_id;
  select images into dup_images     from public.listings where id = p_duplicate_id;

  update public.listings
  set images = (
    select coalesce(array_agg(distinct img), '{}')
    from unnest(coalesce(primary_images, '{}') || coalesce(dup_images, '{}')) as img
  )
  where id = p_primary_id;

  update public.listings
  set duplicate_of = p_primary_id,
      status = case when status = 'published' then 'archived'::public.listing_status else status end
  where id = p_duplicate_id;

  insert into public.listing_duplicates (primary_id, duplicate_id, score, reasons, decision, decided_by, decided_at)
  values (p_primary_id, p_duplicate_id, p_score, p_reasons, p_decision, auth.uid(), now())
  on conflict (primary_id, duplicate_id)
  do update set decision = excluded.decision,
                score = excluded.score,
                reasons = excluded.reasons,
                decided_by = excluded.decided_by,
                decided_at = now();

  update public.raw_posts set status = 'duplicate' where listing_id = p_duplicate_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id, meta)
  values (auth.uid(), public.current_role(), 'merge_duplicate', 'listing', p_duplicate_id::text,
          jsonb_build_object('primary_id', p_primary_id, 'score', p_score, 'reasons', p_reasons));
end;
$$;

-- ---------------------------------------------------------------------------
-- ยกเลิกการรวม (กรณีแอดมินตรวจแล้วพบว่าไม่ซ้ำจริง)
-- ---------------------------------------------------------------------------
create or replace function public.unmerge_duplicate(p_duplicate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ป้องกันสิทธิ์: SECURITY DEFINER ทำให้ฟังก์ชันนี้ข้าม RLS ได้
  -- ผู้ใช้ที่ล็อกอินอยู่ต้องเป็นแอดมินเท่านั้น (auth.uid() = null คือ service role ฝั่งเซิร์ฟเวอร์)
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'ต้องเป็นแอดมินเท่านั้น' using errcode = '42501';
  end if;

  update public.listings
  set duplicate_of = null,
      status = case when status = 'archived' then 'pending'::public.listing_status else status end
  where id = p_duplicate_id;

  update public.listing_duplicates
  set decision = 'rejected', decided_by = auth.uid(), decided_at = now()
  where duplicate_id = p_duplicate_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity, entity_id)
  values (auth.uid(), public.current_role(), 'unmerge_duplicate', 'listing', p_duplicate_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- ค้นหาประกาศ : ใช้ทั้งหน้ารายการและหน้าแผนที่ (bbox)
-- SECURITY INVOKER โดยตั้งใจ -> RLS ยังทำงาน ผู้ซื้อเห็นเฉพาะ published
-- ---------------------------------------------------------------------------
create or replace function public.search_listings(
  p_q             text default null,
  p_property_types public.property_type[] default null,
  p_deal_type     public.deal_type default null,
  p_min_price     numeric default null,
  p_max_price     numeric default null,
  p_min_area      numeric default null,
  p_max_area      numeric default null,
  p_bedrooms      integer default null,
  p_district      text default null,
  p_subdistrict   text default null,
  p_south         double precision default null,
  p_west          double precision default null,
  p_north         double precision default null,
  p_east          double precision default null,
  p_center_lat    double precision default null,
  p_center_lng    double precision default null,
  p_radius_km     double precision default null,
  p_has_geo       boolean default false,
  p_sort          text default 'newest',
  p_limit         integer default 30,
  p_offset        integer default 0
)
returns table (
  id uuid,
  title text,
  property_type public.property_type,
  deal_type public.deal_type,
  price numeric,
  rent_per_month numeric,
  price_per_sqwa numeric,
  land_area_sqwa numeric,
  usable_area_sqm numeric,
  bedrooms smallint,
  bathrooms smallint,
  district text,
  subdistrict text,
  province text,
  landmark text,
  lat double precision,
  lng double precision,
  geo_precision public.geo_precision,
  images text[],
  quality_score smallint,
  view_count integer,
  published_at timestamptz,
  created_at timestamptz,
  source_id uuid,
  distance_km double precision,
  total_count bigint
)
language sql
stable
as $$
  with filtered as (
    select l.*,
      case when p_center_lat is not null and p_center_lng is not null
           then public.haversine_km(p_center_lat, p_center_lng, l.lat, l.lng)
           else null end as dist_km
    from public.listings l
    where l.status = 'published'
      and l.duplicate_of is null
      and (p_q is null or p_q = '' or l.search_blob ilike '%' || lower(p_q) || '%')
      and (p_property_types is null or l.property_type = any (p_property_types))
      and (p_deal_type is null or l.deal_type = p_deal_type or l.deal_type = 'sale_or_rent')
      and (p_min_price is null or coalesce(l.price, l.rent_per_month) >= p_min_price)
      and (p_max_price is null or coalesce(l.price, l.rent_per_month) <= p_max_price)
      and (p_min_area is null or coalesce(l.land_area_sqwa, l.usable_area_sqm / 4) >= p_min_area)
      and (p_max_area is null or coalesce(l.land_area_sqwa, l.usable_area_sqm / 4) <= p_max_area)
      and (p_bedrooms is null or l.bedrooms >= p_bedrooms)
      and (p_district is null or l.district = p_district)
      and (p_subdistrict is null or l.subdistrict = p_subdistrict)
      and (not p_has_geo or l.lat is not null)
      and (p_south is null or (l.lat between p_south and p_north and l.lng between p_west and p_east))
      and (p_radius_km is null or p_center_lat is null
           or public.haversine_km(p_center_lat, p_center_lng, l.lat, l.lng) <= p_radius_km)
  )
  select
    f.id, f.title, f.property_type, f.deal_type, f.price, f.rent_per_month, f.price_per_sqwa,
    f.land_area_sqwa, f.usable_area_sqm, f.bedrooms, f.bathrooms,
    f.district, f.subdistrict, f.province, f.landmark,
    f.lat, f.lng, f.geo_precision, f.images, f.quality_score, f.view_count,
    f.published_at, f.created_at, f.source_id,
    f.dist_km,
    count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'price_asc'  then coalesce(f.price, f.rent_per_month) end asc nulls last,
    case when p_sort = 'price_desc' then coalesce(f.price, f.rent_per_month) end desc nulls last,
    case when p_sort = 'area_desc'  then coalesce(f.land_area_sqwa, f.usable_area_sqm / 4) end desc nulls last,
    case when p_sort = 'distance'   then f.dist_km end asc nulls last,
    case when p_sort = 'quality'    then f.quality_score end desc nulls last,
    f.published_at desc nulls last,
    f.created_at desc
  limit least(coalesce(p_limit, 30), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- ประกาศใกล้เคียง (ใช้ในหน้ารายละเอียด)
-- ---------------------------------------------------------------------------
create or replace function public.nearby_listings(
  p_listing_id uuid,
  p_radius_km double precision default 3,
  p_limit integer default 6
)
returns setof public.listings
language sql
stable
as $$
  select c.*
  from public.listings b
  join public.listings c
    on c.id <> b.id
   and c.status = 'published'
   and c.duplicate_of is null
   and c.lat is not null
   and public.haversine_km(b.lat, b.lng, c.lat, c.lng) <= p_radius_km
  where b.id = p_listing_id and b.lat is not null
  order by public.haversine_km(b.lat, b.lng, c.lat, c.lng) asc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- นับยอดเข้าชม (ไม่ต้องมี RLS update สำหรับผู้ซื้อ)
-- ---------------------------------------------------------------------------
create or replace function public.increment_listing_view(p_listing_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.listings
  set view_count = view_count + 1
  where id = p_listing_id and status = 'published';
$$;

-- ---------------------------------------------------------------------------
-- สถิติหน้าแดชบอร์ดแอดมิน (คิวรีเดียวจบ)
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'ต้องเป็นแอดมินเท่านั้น';
  end if;

  select jsonb_build_object(
    'listings_total',      (select count(*) from public.listings),
    'listings_published',  (select count(*) from public.listings where status = 'published' and duplicate_of is null),
    'listings_pending',    (select count(*) from public.listings where status = 'pending'),
    'listings_rejected',   (select count(*) from public.listings where status = 'rejected'),
    'listings_duplicate',  (select count(*) from public.listings where duplicate_of is not null),
    'listings_no_geo',     (select count(*) from public.listings where lat is null and status in ('published','pending')),
    'dup_pending_review',  (select count(*) from public.listing_duplicates where decision = 'pending'),
    'raw_posts_total',     (select count(*) from public.raw_posts),
    'raw_posts_new',       (select count(*) from public.raw_posts where status = 'new'),
    'raw_posts_error',     (select count(*) from public.raw_posts where status = 'error'),
    'sources_total',       (select count(*) from public.sources),
    'sources_enabled',     (select count(*) from public.sources where is_enabled),
    'users_total',         (select count(*) from public.profiles),
    'users_sellers',       (select count(*) from public.profiles where role = 'seller'),
    'users_buyers',        (select count(*) from public.profiles where role = 'buyer'),
    'leads_new',           (select count(*) from public.leads where status = 'new'),
    'ingested_7d',         (select count(*) from public.raw_posts where ingested_at > now() - interval '7 days'),
    'published_7d',        (select count(*) from public.listings where published_at > now() - interval '7 days'),
    'avg_quality',         (select round(coalesce(avg(quality_score), 0), 1) from public.listings where status = 'published'),
    'geo_coverage_pct',    (select case when count(*) = 0 then 0
                                   else round(100.0 * count(*) filter (where lat is not null) / count(*), 1) end
                            from public.listings where status = 'published' and duplicate_of is null),
    'by_district',         (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                              select coalesce(district, 'ไม่ระบุ') as district, count(*) as total
                              from public.listings where status = 'published' and duplicate_of is null
                              group by 1 order by 2 desc limit 10) x),
    'by_type',             (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                              select property_type::text as type, count(*) as total
                              from public.listings where status = 'published' and duplicate_of is null
                              group by 1 order by 2 desc) x),
    'by_source',           (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                              select coalesce(s.name, 'ไม่ระบุแหล่ง') as name, s.kind::text as kind, count(l.id) as total
                              from public.listings l left join public.sources s on s.id = l.source_id
                              where l.duplicate_of is null
                              group by 1, 2 order by 3 desc limit 10) x)
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- สถิติของผู้ขาย (เห็นเฉพาะประกาศตัวเอง)
-- ---------------------------------------------------------------------------
create or replace function public.seller_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total',      (select count(*) from public.listings where owner_id = auth.uid()),
    'published',  (select count(*) from public.listings where owner_id = auth.uid() and status = 'published'),
    'pending',    (select count(*) from public.listings where owner_id = auth.uid() and status = 'pending'),
    'rejected',   (select count(*) from public.listings where owner_id = auth.uid() and status = 'rejected'),
    'sold',       (select count(*) from public.listings where owner_id = auth.uid() and status = 'sold'),
    'views',      (select coalesce(sum(view_count), 0) from public.listings where owner_id = auth.uid()),
    'leads_new',  (select count(*) from public.leads where seller_id = auth.uid() and status = 'new'),
    'leads_total',(select count(*) from public.leads where seller_id = auth.uid())
  );
$$;
