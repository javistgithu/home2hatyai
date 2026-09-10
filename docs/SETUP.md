# คู่มือติดตั้ง

ใช้เวลาประมาณ 20-30 นาที ตั้งแต่ศูนย์จนเปิดใช้งานได้

---

## 1. สร้างโปรเจกต์ Supabase

1. เข้า [supabase.com](https://supabase.com) → **New project**
2. ตั้งชื่อ เลือก region **Southeast Asia (Singapore)** (ใกล้ไทยที่สุด ทำให้เร็วขึ้น)
3. ตั้งรหัสผ่านฐานข้อมูลแล้วเก็บไว้ให้ดี
4. รอสร้างเสร็จประมาณ 2 นาที

---

## 2. สร้างตารางและกฎความปลอดภัย

ไปที่ **SQL Editor** ในแดชบอร์ด Supabase แล้วรันไฟล์ตามลำดับนี้
(เปิดไฟล์จากโปรเจกต์ คัดลอกทั้งไฟล์ไปวาง แล้วกด Run ทีละไฟล์)

| ลำดับ | ไฟล์ | สร้างอะไร |
|-------|------|-----------|
| 1 | `supabase/migrations/0001_init.sql` | ตาราง 11 ตาราง, enum, index |
| 2 | `supabase/migrations/0002_functions.sql` | ฟังก์ชันค้นหา คัดซ้ำ สถิติ ทริกเกอร์ |
| 3 | `supabase/migrations/0003_rls.sql` | กฎความปลอดภัยระดับแถว (RLS) 3 บทบาท |
| 4 | `supabase/migrations/0004_seed.sql` | ข้อมูลตัวอย่าง 12 ประกาศ (ข้ามได้ถ้าไม่ต้องการ) |

> ถ้าใช้ Supabase CLI: `supabase db push` จะรันให้ทั้งหมดอัตโนมัติ

**ตรวจว่าสำเร็จ** — รันคำสั่งนี้ ควรได้ 11 แถว
```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

---

## 3. ตั้งค่า environment

```bash
cp .env.example .env.local
```

เปิด `.env.local` แล้วใส่ค่าจาก **Supabase Dashboard → Project Settings → API**

| ตัวแปร | เอาค่ามาจาก |
|--------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**ความลับ**) |
| `INGEST_SECRET` | สร้างเอง: `openssl rand -hex 32` |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` ข้าม RLS ได้ทั้งหมด
> ห้ามใส่ในตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_` และห้ามหลุดไปฝั่งเบราว์เซอร์

---

## 4. ตั้งค่า Google Maps

1. เข้า [Google Cloud Console](https://console.cloud.google.com) → สร้างโปรเจกต์
2. เปิดใช้ API 2 ตัว: **Maps JavaScript API** และ **Geocoding API**
3. สร้าง API key 2 ใบ แล้วจำกัดสิทธิ์แต่ละใบ

| คีย์ | ใส่ในตัวแปร | จำกัดสิทธิ์อย่างไร |
|------|-------------|---------------------|
| ใบที่ 1 (เบราว์เซอร์) | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | HTTP referrer = โดเมนเว็บคุณ + เลือกเฉพาะ Maps JavaScript API |
| ใบที่ 2 (เซิร์ฟเวอร์) | `GOOGLE_GEOCODING_API_KEY` | IP address ของเซิร์ฟเวอร์ + เลือกเฉพาะ Geocoding API |

4. ตั้งงบจำกัด (budget alert) ใน Google Cloud เพื่อกันค่าใช้จ่ายบานปลาย

> **ไม่มีคีย์ก็ใช้งานได้** — แผนที่จะแสดงข้อความแนะนำแทน
> ส่วนพิกัดจะใช้จุดกึ่งกลางตำบล/อำเภอโดยประมาณจากทะเบียนสถานที่ในโปรเจกต์

---

## 5. รันแอป

```bash
npm install
npm run dev
```

เปิด http://localhost:3000 — ถ้าตั้งค่าครบจะเห็นประกาศตัวอย่างทันที

---

## 6. ตั้งแอดมินคนแรก

ระบบ **ไม่ยอมให้สมัครเป็นแอดมินเอง** (ทริกเกอร์ในฐานข้อมูลบังคับให้เป็น buyer/seller เท่านั้น)
ต้องตั้งจากฐานข้อมูลโดยตรง

1. สมัครสมาชิกผ่านหน้าเว็บตามปกติ
2. ไปที่ Supabase **SQL Editor** แล้วรัน

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'อีเมลของคุณ@example.com');
```

3. ออกจากระบบแล้วเข้าใหม่ จะเห็นเมนู "แอดมิน" ที่แถบล่าง

จากนั้นตั้งแอดมินคนถัดไปได้จากหน้า **แอดมิน → ผู้ใช้** ในเว็บเลย

---

## 7. นำเข้าข้อมูลชุดแรก

### วิธีที่ 1 — วางข้อความในหน้าแอดมิน (ง่ายที่สุด)
เข้า **แอดมิน → นำเข้าข้อมูล** วางข้อความโพสต์ คั่นแต่ละโพสต์ด้วยบรรทัด `---`
ระบบจะแปลง หาพิกัด และคัดซ้ำให้ พร้อมแสดงผลทีละรายการ

### วิธีที่ 2 — นำเข้าจากไฟล์
```bash
export APP_URL=http://localhost:3000
export INGEST_SECRET=<ค่าเดียวกับใน .env.local>
npm run import:samples                          # ข้อมูลตัวอย่าง
npx tsx scripts/import-posts.mjs posts.csv      # ไฟล์ของคุณเอง (ต้องมีคอลัมน์ content)
```

### วิธีที่ 3 — Facebook Graph API
สำหรับกลุ่ม/เพจที่คุณเป็นแอดมินเท่านั้น — อ่าน [DATA-COLLECTION.md](DATA-COLLECTION.md) ก่อน

---

## 8. ขึ้น production (Vercel)

```bash
npx vercel
```

ตั้งค่า environment variables ทั้งหมดใน Vercel Dashboard → Settings → Environment Variables
แล้วอย่าลืม

- เพิ่มโดเมน Vercel เข้าไปในรายการ HTTP referrer ของ Google Maps API key
- ตั้ง `APP_URL` เป็นโดเมนจริง
- เพิ่มโดเมนใน Supabase → Authentication → URL Configuration → Redirect URLs

### เก็บข้อมูลอัตโนมัติทุกวัน (ไม่บังคับ)
สร้างไฟล์ `.github/workflows/collect.yml` แล้วตั้ง schedule เรียก `npm run collect:facebook`
โดยเก็บ token และ secret ไว้ใน GitHub Secrets

---

## ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|-------|------------------|
| หน้าแรกขึ้น "ยังตั้งค่าระบบไม่ครบ" | ยังไม่ได้ใส่ค่าใน `.env.local` หรือยังไม่ได้รีสตาร์ต `npm run dev` |
| แผนที่ว่างเปล่า | ยังไม่ได้ใส่ `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` หรือคีย์ยังไม่เปิด Maps JavaScript API |
| เข้า /admin แล้วเด้งกลับหน้าแรก | บัญชียังไม่ใช่ admin — ทำตามข้อ 6 |
| นำเข้าข้อมูลแล้วขึ้น 401 | `INGEST_SECRET` ฝั่งสคริปต์กับฝั่งเซิร์ฟเวอร์ไม่ตรงกัน |
| ประกาศไม่ขึ้นให้ผู้ซื้อเห็น | ยังอยู่สถานะ "รอตรวจสอบ" — อนุมัติที่ **แอดมิน → รออนุมัติ** |
| ประกาศหายไปหลังนำเข้า | อาจถูกรวมเป็นรายการซ้ำ — ดูที่ **แอดมิน → รายการซ้ำ** และยกเลิกการรวมได้ |
