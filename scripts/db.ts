/**
 * เครื่องมือจัดการฐานข้อมูลจากบรรทัดคำสั่ง
 *
 *   npm run db:migrate   สร้าง/อัปเดตโครงสร้างตาราง
 *   npm run db:seed      ใส่ข้อมูลตัวอย่างสำหรับทดลองใช้
 *   npm run db:reset     ลบทิ้งแล้วสร้างใหม่ทั้งหมด (ห้ามใช้กับข้อมูลจริง)
 *   npm run db:status    ดูสถานะฐานข้อมูล
 */

import { rm } from "node:fs/promises";
import { getDb, num } from "../lib/db";
import { runMigrations, isInstalled } from "../lib/migrate";
import { seedDemo } from "./seed-demo";

const cmd = process.argv[2] ?? "status";

async function main() {
  if (cmd === "reset") {
    if (process.env.DATABASE_URL) {
      console.error(
        "ปฏิเสธการ reset: มี DATABASE_URL อยู่ (อาจเป็นฐานข้อมูลจริง)\n" +
          "ถ้าต้องการล้างจริงๆ ให้ทำผ่านเครื่องมือของผู้ให้บริการฐานข้อมูลเอง"
      );
      process.exit(1);
    }
    const dir = process.env.PGLITE_DIR ?? "./.pgdata";
    await rm(dir, { recursive: true, force: true });
    console.log(`[db] ลบ ${dir} แล้ว`);
  }

  const db = await getDb();
  console.log(`[db] ไดรเวอร์: ${db.driver}`);
  if (db.driver === "pglite") {
    // PGlite เก็บฐานข้อมูลเป็นไฟล์ในโฟลเดอร์เดียว และเปิดได้ทีละ process เท่านั้น
    // ถ้ารันคำสั่งนี้พร้อมกับ `npm run dev` ที่เปิดค้างอยู่ ทั้งสองฝั่งจะเห็นข้อมูล
    // คนละชุด แล้วงานที่เขียนไประหว่างนั้นจะหายไปเงียบๆ
    console.log(
      "[db] เตือน: ปิด `npm run dev` ก่อนรันคำสั่งนี้ — PGlite เปิดได้ทีละโปรแกรม"
    );
  }

  if (cmd === "status") {
    const installed = await isInstalled(db);
    console.log(`[db] ติดตั้งแล้ว: ${installed ? "ใช่" : "ยัง"}`);
    if (installed) {
      const stats = await db.query<Record<string, unknown>>(
        `SELECT
           (SELECT count(*) FROM product)                        AS products,
           (SELECT count(*) FROM location WHERE is_active)       AS locations,
           (SELECT count(*) FROM display_unit
             WHERE status='ON_DISPLAY')                          AS displays,
           (SELECT count(*) FROM sale WHERE status='COMPLETED')  AS sales,
           (SELECT count(*) FROM stock_movement)                 AS movements,
           (SELECT count(*) FROM not_found_report
             WHERE status='OPEN')                                AS open_not_found`
      );
      const s = stats.rows[0];
      console.log(`     สินค้า          ${num(s.products)} รายการ`);
      console.log(`     ช่องเก็บ        ${num(s.locations)} ช่อง`);
      console.log(`     ตัวโชว์         ${num(s.displays)} ตัว`);
      console.log(`     บิลขาย          ${num(s.sales)} ใบ`);
      console.log(`     รายการเคลื่อนไหว ${num(s.movements)} รายการ`);
      console.log(`     แจ้งหาไม่เจอค้าง ${num(s.open_not_found)} เรื่อง`);
    }
    await db.close();
    return;
  }

  if (cmd === "migrate" || cmd === "reset" || cmd === "seed") {
    const ran = await runMigrations(db, { log: console.log });
    if (ran.length) console.log(`[db] รัน migration ${ran.length} ไฟล์`);
  }

  if (cmd === "seed" || cmd === "reset") {
    const existing = await db.query<Record<string, unknown>>(
      "SELECT count(*) AS n FROM product"
    );
    if (num(existing.rows[0].n) > 0) {
      console.log("[db] มีสินค้าอยู่แล้ว ข้ามการใส่ข้อมูลตัวอย่าง");
    } else {
      await seedDemo(db);
    }
  }

  await db.close();
  console.log("[db] เรียบร้อย");
}

main().catch((err) => {
  console.error("[db] ผิดพลาด:", err);
  process.exit(1);
});
