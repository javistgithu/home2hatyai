import Papa from "papaparse";
import { SHEET_CACHE_TTL_MS, SHEET_CSV_URL } from "./constants";

interface FaqRow {
  question: string;
  answer: string;
}

interface Cache {
  text: string;
  fetchedAt: number;
}

let cache: Cache | null = null;

function formatFaqText(rows: FaqRow[]): string {
  return rows
    .filter((row) => row.question && row.answer)
    .map((row) => `Q: ${row.question}\nA: ${row.answer}`)
    .join("\n\n");
}

async function fetchFaqText(): Promise<string> {
  if (!SHEET_CSV_URL) {
    throw new Error("SHEET_CSV_URL is not set");
  }

  const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Sheet fetch failed with status ${res.status}`);
  }

  const csv = await res.text();
  const parsed = Papa.parse<FaqRow>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    console.error("[sheet] csv parse errors", parsed.errors);
  }

  return formatFaqText(parsed.data);
}

// ดึง FAQ จาก Google Sheet CSV พร้อม cache in-memory 60 วิ
// ถ้าดึงไม่ได้แต่มี cache เก่าอยู่ (แม้หมดอายุ) ให้ใช้ cache เก่าแทนการพัง
export async function getFaqFromSheet(): Promise<string> {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < SHEET_CACHE_TTL_MS) {
    return cache.text;
  }

  try {
    const text = await fetchFaqText();
    cache = { text, fetchedAt: now };
    return text;
  } catch (err) {
    console.error("[sheet] fetch failed", err);
    if (cache) {
      console.warn("[sheet] falling back to stale cache");
      return cache.text;
    }
    throw err;
  }
}
