/** ตัวช่วยส่งข้อมูลเข้า /api/ingest พร้อมลงลายเซ็น HMAC */
import { createHmac } from "node:crypto";

export function signBody(rawBody, secret, timestamp = Date.now()) {
  return {
    "x-ingest-timestamp": String(timestamp),
    "x-ingest-signature":
      "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"),
  };
}

/** ส่งโพสต์เข้าระบบเป็นชุด ๆ (ชุดละไม่เกิน 200 ตามที่ API กำหนด) */
export async function pushToIngest({ appUrl, secret, source, posts, options = {}, batchSize = 50 }) {
  if (!appUrl) throw new Error("ต้องตั้งค่า APP_URL (เช่น https://your-app.vercel.app)");
  if (!secret) throw new Error("ต้องตั้งค่า INGEST_SECRET ให้ตรงกับฝั่งเซิร์ฟเวอร์");

  const totals = {
    received: 0, inserted: 0, skipped_existing: 0, rejected: 0,
    merged: 0, flagged: 0, errors: 0, created_listings: 0,
  };
  const allItems = [];

  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    const rawBody = JSON.stringify({ source, posts: batch, options });
    const response = await fetch(new URL("/api/ingest", appUrl).toString(), {
      method: "POST",
      headers: { "content-type": "application/json", ...signBody(rawBody, secret) },
      body: rawBody,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`ingest ล้มเหลว (${response.status}): ${text.slice(0, 400)}`);
    }
    const report = JSON.parse(text);
    for (const key of Object.keys(totals)) totals[key] += report[key] ?? 0;
    allItems.push(...(report.items ?? []));
    console.log(
      `  ชุดที่ ${Math.floor(i / batchSize) + 1}: รับ ${report.received} | ` +
      `สร้าง ${report.inserted} | ซ้ำเดิม ${report.skipped_existing} | ` +
      `รวมอัตโนมัติ ${report.merged} | รอตรวจ ${report.flagged} | คัดออก ${report.rejected}`
    );
  }
  return { totals, items: allItems };
}
