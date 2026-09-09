/**
 * เลขที่เอกสาร
 *
 * ต้อง atomic เพราะถ้าขายพร้อมกัน 2 เครื่องแล้วได้เลขซ้ำ
 * ใบเสร็จจะชนกันและบัญชีจะพัง — ใช้ UPDATE ... RETURNING ในคำสั่งเดียว
 * ไม่ใช่ SELECT แล้วค่อย UPDATE (ซึ่งมีช่องว่างให้ race condition)
 *
 * รูปแบบ: IV2609-0001
 *   IV    ประเภทเอกสาร (IV ขาย, RC รับของ, CT นับสต๊อก)
 *   2609  ปี-เดือน (ค.ศ. 2 หลัก + เดือน) เลขรันรีเซ็ตทุกเดือน
 *   0001  ลำดับในเดือนนั้น
 */

import type { Db } from "../db";
import { num, str } from "../db";

function currentPeriod(at = new Date()): string {
  const yy = String(at.getFullYear() % 100).padStart(2, "0");
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

export async function nextDocNo(
  tx: Db,
  counterName: "SALE" | "RECEIPT" | "COUNT",
  at = new Date()
): Promise<string> {
  const period = currentPeriod(at);
  const res = await tx.query<Record<string, unknown>>(
    `UPDATE doc_counter
     SET value  = CASE WHEN period = $2 THEN value + 1 ELSE 1 END,
         period = $2
     WHERE name = $1
     RETURNING prefix, period, value`,
    [counterName, period]
  );
  if (!res.rows[0]) {
    throw new Error(`ไม่พบตัวนับเลขที่เอกสาร ${counterName}`);
  }
  const row = res.rows[0];
  return `${str(row.prefix)}${str(row.period)}-${String(num(row.value)).padStart(4, "0")}`;
}
