/** ค่าตั้งค่าจาก environment variables พร้อมข้อความช่วยเหลือเมื่อยังไม่ได้ตั้ง */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** คีย์ฝั่งเบราว์เซอร์สำหรับ Google Maps JavaScript API */
export const GOOGLE_MAPS_BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
/** คีย์ฝั่งเซิร์ฟเวอร์สำหรับ Geocoding API (จำกัดสิทธิ์ตาม IP ได้) */
export const GOOGLE_GEOCODING_KEY =
  process.env.GOOGLE_GEOCODING_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

/** กุญแจลับสำหรับตัวเก็บข้อมูลภายนอกที่ยิงเข้ามาที่ /api/ingest */
export const INGEST_SECRET = process.env.INGEST_SECRET || "";

export const APP_NAME = "อยากมีบ้านหาดใหญ่";
export const APP_TAGLINE = "รวมประกาศบ้านและที่ดินหาดใหญ่ไว้บนแผนที่เดียว";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const isServiceRoleConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
export const isMapsConfigured = Boolean(GOOGLE_MAPS_BROWSER_KEY);

export const SETUP_HINT =
  "ยังไม่ได้ตั้งค่า Supabase — คัดลอก .env.example เป็น .env.local แล้วใส่ NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY (ดูขั้นตอนใน docs/SETUP.md)";
