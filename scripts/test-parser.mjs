/**
 * ทดสอบ parser กับโพสต์ตัวอย่าง
 *   node --experimental-strip-types scripts/test-parser.mjs
 */
import { readFileSync } from "node:fs";
import { parsePost, PROPERTY_TYPE_LABELS, DEAL_TYPE_LABELS } from "../lib/parser/index.ts";

const posts = JSON.parse(readFileSync(new URL("./sample-posts.json", import.meta.url), "utf8"));
const baht = (n) => (n === null || n === undefined ? "-" : n.toLocaleString("th-TH") + " ฿");

for (const post of posts) {
  const r = await parsePost(post.content);
  console.log("─".repeat(78));
  console.log(`[${post.external_post_id}] ${post.source_name}`);
  console.log(`  ชื่อประกาศ : ${r.title}`);
  console.log(`  ประเภท     : ${DEAL_TYPE_LABELS[r.dealType]} / ${PROPERTY_TYPE_LABELS[r.propertyType]}`);
  console.log(`  ราคา       : ${baht(r.price)}   เช่า/เดือน: ${baht(r.rentPerMonth)}`);
  console.log(`  พื้นที่     : ${r.landAreaSqwa ?? "-"} ตร.ว. | ใช้สอย ${r.usableAreaSqm ?? "-"} ตร.ม.`);
  console.log(`  ห้อง       : นอน ${r.bedrooms ?? "-"} / น้ำ ${r.bathrooms ?? "-"} / ชั้น ${r.floors ?? "-"} / จอดรถ ${r.parking ?? "-"}`);
  console.log(`  ที่ตั้ง     : ต.${r.subdistrict ?? "-"} อ.${r.district ?? "-"} จ.${r.province ?? "-"} | แลนด์มาร์ก: ${r.landmark ?? "-"}`);
  console.log(`  พิกัด      : ${r.lat ?? "-"}, ${r.lng ?? "-"} (${r.geoPrecision} / ${r.geoSource ?? "-"})`);
  console.log(`  ติดต่อ     : ${r.contactPhone ?? "-"} | LINE ${r.contactLine ?? "-"}`);
  console.log(`  ความมั่นใจ : ${(r.confidence * 100).toFixed(0)}%  hash ${r.contentHash.slice(0, 12)}`);
  if (r.warnings.length) console.log(`  ⚠ ${r.warnings.join("\n  ⚠ ")}`);
}
