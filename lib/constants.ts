export const BOT_NAME = "แอดมินอยากมีบ้านหาดใหญ่";

export const DEFAULT_REPLY =
  "ขออภัยค่ะ ระบบขัดข้องชั่วคราว รบกวนฝากเบอร์โทรไว้ แอดมินจะติดต่อกลับนะคะ 🙏";

export const SHEET_CACHE_TTL_MS = 60_000;

export const GEMINI_TIMEOUT_MS = 8_000;

export const GEMINI_MAX_OUTPUT_TOKENS = 1024;

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || "";

export const LINE_CHANNEL_ACCESS_TOKEN =
  process.env.LINE_CHANNEL_ACCESS_TOKEN || "";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export const SHEET_CSV_URL = process.env.SHEET_CSV_URL || "";
