/**
 * ตัวรัน migration
 *
 * อ่านไฟล์ .sql ใน db/migrations เรียงตามชื่อไฟล์ แล้วรันทีละไฟล์
 * บันทึกไฟล์ที่รันแล้วไว้ในตาราง schema_migration เพื่อไม่รันซ้ำ
 *
 * เจตนา: ให้ไฟล์ SQL เป็นแหล่งความจริงเดียวของโครงสร้างฐานข้อมูล
 * อ่านรีวิวได้ ตรวจสอบได้ ไม่ต้องแกะจากโค้ด ORM
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { DbPool } from "./db";

const MIGRATION_DIR = path.join(process.cwd(), "db", "migrations");

async function ensureMigrationTable(db: DbPool): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function runMigrations(
  db: DbPool,
  opts: { dir?: string; log?: (msg: string) => void } = {}
): Promise<string[]> {
  const dir = opts.dir ?? MIGRATION_DIR;
  const log = opts.log ?? (() => {});

  await ensureMigrationTable(db);

  const applied = await db.query<{ name: string }>(
    "SELECT name FROM schema_migration"
  );
  const done = new Set(applied.rows.map((r) => r.name));

  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  const ran: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    log(`[migrate] applying ${file}`);
    // ไฟล์ migration รันเป็นก้อนเดียว ถ้าพังกลางทางต้องพังทั้งไฟล์
    // ไม่งั้นจะได้ schema ครึ่งๆ กลางๆ ที่แก้ยากกว่าเดิม
    await db.exec(sql);
    await db.query("INSERT INTO schema_migration (name) VALUES ($1)", [file]);
    ran.push(file);
  }

  if (ran.length === 0) log("[migrate] schema ล่าสุดอยู่แล้ว ไม่มีอะไรต้องรัน");
  return ran;
}

/** ตรวจว่าฐานข้อมูลถูกติดตั้งแล้วหรือยัง (ใช้ตอนเปิดหน้าเว็บครั้งแรก) */
export async function isInstalled(db: DbPool): Promise<boolean> {
  try {
    const res = await db.query<{ n: string }>(
      "SELECT count(*) AS n FROM price_tier"
    );
    return Number(res.rows[0]?.n ?? 0) === 5;
  } catch {
    return false;
  }
}
