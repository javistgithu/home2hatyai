/** อ่าน/เขียนค่าตั้งค่าระบบ พร้อม cache ในหน่วยความจำ 30 วินาที */

import type { Db } from "../db";
import { str } from "../db";

let cache: { at: number; map: Map<string, string> } | null = null;
const TTL_MS = 30_000;

export async function getSettings(db: Db): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const res = await db.query<Record<string, unknown>>(
    "SELECT key, value FROM app_setting"
  );
  const map = new Map(res.rows.map((r) => [str(r.key), str(r.value)]));
  cache = { at: Date.now(), map };
  return map;
}

export async function getSetting(
  db: Db,
  key: string,
  fallback = ""
): Promise<string> {
  return (await getSettings(db)).get(key) ?? fallback;
}

export async function getNumberSetting(
  db: Db,
  key: string,
  fallback: number
): Promise<number> {
  const v = Number(await getSetting(db, key, String(fallback)));
  return Number.isFinite(v) ? v : fallback;
}

export async function setSetting(
  db: Db,
  key: string,
  value: string
): Promise<void> {
  await db.query(
    `INSERT INTO app_setting (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
  cache = null;
}

export function clearSettingsCache(): void {
  cache = null;
}
