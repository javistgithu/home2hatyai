-- ============================================================================
-- Migration 0003 : Row Level Security — สิทธิ์ 3 ระดับ admin / seller / buyer
--
-- หลักการ
--   buyer  : เห็นเฉพาะประกาศที่เผยแพร่แล้วและไม่ใช่รายการซ้ำ, จัดการรายการโปรด
--            และคำขอติดต่อของตัวเอง
--   seller : ทำทุกอย่างที่ buyer ทำได้ + จัดการเฉพาะประกาศของตัวเอง
--            (เผยแพร่เองไม่ได้ ต้องผ่านแอดมิน)
--   admin  : เห็นและจัดการได้ทั้งหมด รวมถึงข้อมูลดิบและบันทึกการทำงาน
--   service_role (ฝั่งเซิร์ฟเวอร์ เช่น pipeline เก็บข้อมูล) ข้าม RLS โดยธรรมชาติ
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ทริกเกอร์กันการยกระดับสิทธิ์ตัวเอง : ผู้ใช้แก้ role/is_verified/is_blocked ไม่ได้
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;                       -- service role หรือแอดมิน แก้ได้
  end if;
  new.role        := old.role;
  new.is_verified := old.is_verified;
  new.is_blocked  := old.is_blocked;
  return new;
end;
$$;

drop trigger if exists profiles_10_guard on public.profiles;
create trigger profiles_10_guard before update on public.profiles
  for each row execute function public.profiles_guard_privileges();

-- ---------------------------------------------------------------------------
-- ทริกเกอร์บังคับกติกาของประกาศสำหรับผู้ที่ไม่ใช่แอดมิน
--   - เจ้าของประกาศต้องเป็นตัวเองเสมอ
--   - เผยแพร่ (published) / ปฏิเสธ (rejected) เองไม่ได้ ต้องให้แอดมินอนุมัติ
--   - แก้ข้อมูลสำคัญของประกาศที่เผยแพร่แล้ว = กลับเข้าคิวตรวจสอบใหม่
--   - ทำเครื่องหมายรายการซ้ำ / แก้ยอดวิว เองไม่ได้
-- ---------------------------------------------------------------------------
create or replace function public.listings_enforce_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;                       -- pipeline ฝั่งเซิร์ฟเวอร์ และแอดมิน ผ่านได้เลย
  end if;

  if tg_op = 'INSERT' then
    new.owner_id     := auth.uid();
    new.duplicate_of := null;
    new.view_count   := 0;
    new.contact_count := 0;
    new.reject_reason := null;
    if new.status not in ('draft', 'pending') then
      new.status := 'pending';
    end if;
    return new;
  end if;

  new.owner_id      := old.owner_id;
  new.duplicate_of  := old.duplicate_of;
  new.view_count    := old.view_count;
  new.contact_count := old.contact_count;
  new.reject_reason := old.reject_reason;
  new.source_id     := old.source_id;
  new.raw_post_id   := old.raw_post_id;

  -- ผู้ขายเปลี่ยนสถานะได้เฉพาะในกลุ่มนี้
  if new.status not in ('draft', 'pending', 'sold', 'archived') then
    new.status := old.status;
  end if;

  -- แก้ข้อมูลสำคัญของประกาศที่เผยแพร่อยู่ -> ส่งกลับเข้าคิวตรวจ
  if old.status = 'published' and new.status = 'published' and (
       new.title            is distinct from old.title or
       new.description      is distinct from old.description or
       new.price            is distinct from old.price or
       new.rent_per_month   is distinct from old.rent_per_month or
       new.land_area_sqwa   is distinct from old.land_area_sqwa or
       new.lat              is distinct from old.lat or
       new.lng              is distinct from old.lng or
       new.contact_phone    is distinct from old.contact_phone
     ) then
    new.status := 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists listings_10_enforce_role on public.listings;
create trigger listings_10_enforce_role before insert or update on public.listings
  for each row execute function public.listings_enforce_role();

-- ---------------------------------------------------------------------------
-- ทริกเกอร์เติม seller_id ของคำขอติดต่อ ให้ตรงกับเจ้าของประกาศเสมอ
-- ---------------------------------------------------------------------------
create or replace function public.leads_fill_seller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select owner_id into new.seller_id from public.listings where id = new.listing_id;
  if auth.uid() is not null and new.buyer_id is null then
    new.buyer_id := auth.uid();
  end if;
  update public.listings set contact_count = contact_count + 1 where id = new.listing_id;
  return new;
end;
$$;

drop trigger if exists leads_10_fill_seller on public.leads;
create trigger leads_10_fill_seller before insert on public.leads
  for each row execute function public.leads_fill_seller();

-- ---------------------------------------------------------------------------
-- เปิด RLS ทุกตาราง
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.sources            enable row level security;
alter table public.raw_posts          enable row level security;
alter table public.listings           enable row level security;
alter table public.listing_duplicates enable row level security;
alter table public.favorites          enable row level security;
alter table public.leads              enable row level security;
alter table public.saved_searches     enable row level security;
alter table public.geocode_cache      enable row level security;
alter table public.ingest_runs        enable row level security;
alter table public.audit_logs         enable row level security;

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- SOURCES : อ่านได้ทุกคน (ใช้แสดงเครดิตแหล่งที่มา) แก้ไขเฉพาะแอดมิน
-- ---------------------------------------------------------------------------
drop policy if exists sources_select_all on public.sources;
create policy sources_select_all on public.sources
  for select using (true);

drop policy if exists sources_write_admin on public.sources;
create policy sources_write_admin on public.sources
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- RAW_POSTS : ข้อมูลดิบมีชื่อผู้โพสต์ = ข้อมูลส่วนบุคคล เปิดให้แอดมินเท่านั้น
-- ---------------------------------------------------------------------------
drop policy if exists raw_posts_admin_only on public.raw_posts;
create policy raw_posts_admin_only on public.raw_posts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- LISTINGS
-- ---------------------------------------------------------------------------
drop policy if exists listings_select_public on public.listings;
create policy listings_select_public on public.listings
  for select using (
    (status = 'published' and duplicate_of is null)
    or owner_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists listings_insert_seller on public.listings;
create policy listings_insert_seller on public.listings
  for insert with check (
    public.is_admin()
    or (public.is_seller() and owner_id = auth.uid())
  );

drop policy if exists listings_update_owner on public.listings;
create policy listings_update_owner on public.listings
  for update using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists listings_delete_owner on public.listings;
create policy listings_delete_owner on public.listings
  for delete using (
    public.is_admin()
    or (owner_id = auth.uid() and status in ('draft', 'pending', 'rejected'))
  );

-- ---------------------------------------------------------------------------
-- LISTING_DUPLICATES : แอดมินจัดการ / ผู้ขายดูของประกาศตัวเองได้
-- ---------------------------------------------------------------------------
drop policy if exists listing_duplicates_select on public.listing_duplicates;
create policy listing_duplicates_select on public.listing_duplicates
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.listings l
      where l.id in (primary_id, duplicate_id) and l.owner_id = auth.uid()
    )
  );

drop policy if exists listing_duplicates_write_admin on public.listing_duplicates;
create policy listing_duplicates_write_admin on public.listing_duplicates
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- FAVORITES : ของใครของมัน
-- ---------------------------------------------------------------------------
drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- LEADS : ผู้ซื้อสร้างและดูของตัวเอง ผู้ขายดู/อัปเดตของประกาศตัวเอง
-- ---------------------------------------------------------------------------
drop policy if exists leads_insert_authenticated on public.leads;
create policy leads_insert_authenticated on public.leads
  for insert with check (auth.uid() is not null);

drop policy if exists leads_select_related on public.leads;
create policy leads_select_related on public.leads
  for select using (
    buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()
  );

drop policy if exists leads_update_seller on public.leads;
create policy leads_update_seller on public.leads
  for update using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- SAVED_SEARCHES : ของใครของมัน
-- ---------------------------------------------------------------------------
drop policy if exists saved_searches_own on public.saved_searches;
create policy saved_searches_own on public.saved_searches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- GEOCODE_CACHE / INGEST_RUNS / AUDIT_LOGS : แอดมินอ่าน เขียนผ่าน service role
-- ---------------------------------------------------------------------------
drop policy if exists geocode_cache_admin on public.geocode_cache;
create policy geocode_cache_admin on public.geocode_cache
  for select using (public.is_admin());

drop policy if exists ingest_runs_admin on public.ingest_runs;
create policy ingest_runs_admin on public.ingest_runs
  for select using (public.is_admin());

drop policy if exists audit_logs_admin on public.audit_logs;
create policy audit_logs_admin on public.audit_logs
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- GRANTS : เปิดเฉพาะฟังก์ชันที่ผู้ใช้ทั่วไปต้องเรียกจริง
-- ---------------------------------------------------------------------------
grant execute on function public.search_listings(
  text, public.property_type[], public.deal_type, numeric, numeric, numeric, numeric,
  integer, text, text, double precision, double precision, double precision, double precision,
  double precision, double precision, double precision, boolean, text, integer, integer
) to anon, authenticated;

grant execute on function public.nearby_listings(uuid, double precision, integer) to anon, authenticated;
grant execute on function public.increment_listing_view(uuid) to anon, authenticated;
grant execute on function public.haversine_km(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.seller_dashboard_stats() to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.find_duplicate_candidates(uuid, numeric, integer) to authenticated;
grant execute on function public.merge_duplicate(uuid, uuid, numeric, jsonb, public.dup_decision) to authenticated;
grant execute on function public.unmerge_duplicate(uuid) to authenticated;
