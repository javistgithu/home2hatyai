#!/usr/bin/env node
/**
 * เก็บโพสต์จาก Facebook ผ่าน Graph API อย่างเป็นทางการ แล้วส่งเข้าระบบ
 *
 * ⚠️ ข้อกำหนดที่ต้องอ่านก่อนใช้ (docs/DATA-COLLECTION.md)
 *    - ใช้ได้เฉพาะ "กลุ่มที่คุณเป็นแอดมิน" หรือ "เพจที่คุณเป็นเจ้าของ" เท่านั้น
 *      และต้องติดตั้งแอป Facebook ของคุณเข้ากับกลุ่ม/เพจนั้นก่อน
 *    - การดึงข้อมูลจากกลุ่มที่ไม่ได้เป็นแอดมิน หรือใช้บอท/สคริปต์ล็อกอินแทนคน
 *      ผิดข้อกำหนดการใช้งานของ Meta และบัญชีอาจถูกระงับ
 *    - เก็บเฉพาะเนื้อหาประกาศ ไม่เก็บข้อมูลส่วนบุคคลเกินจำเป็น
 *
 * ตัวแปรที่ต้องตั้ง
 *    FB_ACCESS_TOKEN   access token ที่มีสิทธิ์อ่านกลุ่ม/เพจนั้น
 *    FB_GROUP_IDS      รหัสกลุ่ม คั่นด้วยจุลภาค (ไม่บังคับ)
 *    FB_PAGE_IDS       รหัสเพจ คั่นด้วยจุลภาค (ไม่บังคับ)
 *    APP_URL           URL ของแอปนี้
 *    INGEST_SECRET     กุญแจลับ ต้องตรงกับฝั่งเซิร์ฟเวอร์
 *    SINCE_DAYS        ดึงย้อนหลังกี่วัน (ค่าเริ่มต้น 7)
 *
 * ใช้งาน:  node scripts/collect-facebook.mjs
 */
import { pushToIngest } from "./lib-ingest-client.mjs";

const GRAPH_VERSION = "v21.0";
const TOKEN = process.env.FB_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL;
const SECRET = process.env.INGEST_SECRET;
const SINCE_DAYS = Number.parseInt(process.env.SINCE_DAYS ?? "7", 10);
const AUTO_PUBLISH = process.env.AUTO_PUBLISH === "1";

const groupIds = (process.env.FB_GROUP_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const pageIds = (process.env.FB_PAGE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

if (!TOKEN) {
  console.error("✗ ต้องตั้งค่า FB_ACCESS_TOKEN");
  process.exit(1);
}
if (groupIds.length === 0 && pageIds.length === 0) {
  console.error("✗ ต้องตั้งค่า FB_GROUP_IDS หรือ FB_PAGE_IDS อย่างน้อยหนึ่งอย่าง");
  process.exit(1);
}

const since = Math.floor((Date.now() - SINCE_DAYS * 86400_000) / 1000);

async function graph(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  url.searchParams.set("access_token", TOKEN);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const response = await fetch(url.toString());
  const payload = await response.json();
  if (payload.error) {
    const e = payload.error;
    throw new Error(
      `Graph API: ${e.message} (code ${e.code}${e.error_subcode ? "/" + e.error_subcode : ""})\n` +
      `  โปรดตรวจว่า token มีสิทธิ์ และคุณเป็นแอดมินของกลุ่ม/เพจนี้`
    );
  }
  return payload;
}

/** ดึงฟีดพร้อมตามหน้าถัดไป (จำกัดจำนวนหน้าไว้กัน quota หมด) */
async function fetchFeed(nodeId, maxPages = 5) {
  const posts = [];
  let path = `${nodeId}/feed`;
  let params = {
    fields: "id,message,created_time,permalink_url,from{name,id},attachments{media,subattachments}",
    limit: 100,
    since,
  };

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await graph(path, params);
    for (const item of payload.data ?? []) {
      if (!item.message || item.message.trim().length < 20) continue;
      posts.push({
        external_post_id: item.id,
        permalink: item.permalink_url ?? null,
        author_name: item.from?.name ?? null,
        author_external_id: item.from?.id ?? null,
        posted_at: item.created_time ?? null,
        content: item.message,
        images: extractImages(item),
        raw: { source_node: nodeId },
      });
    }
    const next = payload.paging?.next;
    if (!next) break;
    const nextUrl = new URL(next);
    path = nextUrl.pathname.replace(`/${GRAPH_VERSION}/`, "");
    params = Object.fromEntries(nextUrl.searchParams.entries());
    delete params.access_token;
  }
  return posts;
}

function extractImages(item) {
  const images = [];
  for (const attachment of item.attachments?.data ?? []) {
    if (attachment.media?.image?.src) images.push(attachment.media.image.src);
    for (const sub of attachment.subattachments?.data ?? []) {
      if (sub.media?.image?.src) images.push(sub.media.image.src);
    }
  }
  return [...new Set(images)];
}

const targets = [
  ...groupIds.map((id) => ({ id, kind: "facebook_group" })),
  ...pageIds.map((id) => ({ id, kind: "facebook_page" })),
];

const grandTotal = { received: 0, inserted: 0, skipped_existing: 0, rejected: 0, merged: 0, flagged: 0, errors: 0 };

for (const target of targets) {
  console.log(`\n▶ ${target.kind} ${target.id} (ย้อนหลัง ${SINCE_DAYS} วัน)`);
  try {
    const info = await graph(target.id, { fields: "id,name" });
    const posts = await fetchFeed(target.id);
    console.log(`  ดึงได้ ${posts.length} โพสต์จาก "${info.name}"`);
    if (posts.length === 0) continue;

    const { totals } = await pushToIngest({
      appUrl: APP_URL,
      secret: SECRET,
      source: {
        kind: target.kind,
        name: info.name ?? target.id,
        external_id: target.id,
        url: `https://facebook.com/${target.id}`,
      },
      posts,
      options: { autoPublish: AUTO_PUBLISH, useGeocoding: true, dedupe: true },
    });
    for (const key of Object.keys(grandTotal)) grandTotal[key] += totals[key] ?? 0;
  } catch (error) {
    console.error(`  ✗ ${error.message}`);
    grandTotal.errors += 1;
  }
}

console.log("\n═══ สรุปรวม ═══");
console.log(`  รับเข้ามา       ${grandTotal.received}`);
console.log(`  สร้างประกาศใหม่ ${grandTotal.inserted}`);
console.log(`  โพสต์ซ้ำเดิม     ${grandTotal.skipped_existing}`);
console.log(`  รวมรายการซ้ำ     ${grandTotal.merged}`);
console.log(`  รอแอดมินตรวจซ้ำ  ${grandTotal.flagged}`);
console.log(`  คัดออก (ไม่ใช่ประกาศ) ${grandTotal.rejected}`);
console.log(`  ข้อผิดพลาด       ${grandTotal.errors}`);
