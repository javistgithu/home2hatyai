#!/usr/bin/env node
/**
 * นำเข้าโพสต์จากไฟล์ JSON หรือ CSV เข้าระบบ
 *
 *   node scripts/import-posts.mjs scripts/sample-posts.json
 *   node scripts/import-posts.mjs my-posts.csv --source-name "กลุ่มบ้านหาดใหญ่" --kind facebook_group
 *
 * รูปแบบไฟล์ JSON : อาร์เรย์ของ { content, external_post_id?, permalink?, author_name?, posted_at?, images? }
 * รูปแบบไฟล์ CSV  : ต้องมีคอลัมน์ content เป็นอย่างน้อย
 *
 * ตัวแปรที่ต้องตั้ง : APP_URL, INGEST_SECRET
 */
import { readFileSync } from "node:fs";
import { pushToIngest } from "./lib-ingest-client.mjs";

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));
if (!filePath) {
  console.error("ใช้งาน: node scripts/import-posts.mjs <ไฟล์.json|ไฟล์.csv> [--source-name ชื่อ] [--kind csv] [--publish]");
  process.exit(1);
}

const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const sourceName = flag("source-name", "นำเข้าจากไฟล์");
const kind = flag("kind", "csv");
const autoPublish = args.includes("--publish");

/** CSV parser แบบรองรับเครื่องหมายคำพูดและขึ้นบรรทัดใหม่ในเซลล์ */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  return body.map((cells) =>
    Object.fromEntries(header.map((key, index) => [key.trim(), (cells[index] ?? "").trim()]))
  );
}

const raw = readFileSync(filePath, "utf8");
let posts;

if (filePath.endsWith(".json")) {
  posts = JSON.parse(raw);
} else {
  posts = parseCsv(raw).map((row) => ({
    content: row.content ?? row.message ?? row.text ?? "",
    external_post_id: row.external_post_id || row.id || null,
    permalink: row.permalink || row.url || null,
    author_name: row.author_name || row.author || null,
    posted_at: row.posted_at || row.created_time || null,
    images: row.images ? row.images.split("|").filter(Boolean) : [],
  }));
}

posts = posts.filter((p) => (p.content ?? "").trim().length >= 20);
console.log(`อ่านได้ ${posts.length} โพสต์จาก ${filePath}`);
if (posts.length === 0) process.exit(0);

const { totals, items } = await pushToIngest({
  appUrl: process.env.APP_URL,
  secret: process.env.INGEST_SECRET,
  source: { kind, name: sourceName },
  posts,
  options: { autoPublish, useGeocoding: true, dedupe: true },
});

console.log("\n═══ สรุป ═══");
for (const [key, value] of Object.entries(totals)) console.log(`  ${key.padEnd(18)} ${value}`);

const merged = items.filter((i) => i.status === "merged");
if (merged.length > 0) {
  console.log("\nรายการที่ระบบรวมเป็นตัวซ้ำอัตโนมัติ:");
  for (const item of merged) {
    console.log(`  • ${item.title} (คะแนนซ้ำ ${item.duplicate_score})`);
  }
}
