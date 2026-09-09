/** ฟังก์ชันจัดระเบียบข้อความไทยก่อนนำไปวิเคราะห์ */

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

/** แปลงเลขไทย ๐-๙ เป็นเลขอารบิก */
export function thaiDigitsToArabic(input: string): string {
  return input.replace(/[๐-๙]/g, (ch) => String(THAI_DIGITS.indexOf(ch)));
}

/** ลบอีโมจิและอักขระตกแต่งที่รบกวนการจับรูปแบบ */
export function stripDecorations(input: string): string {
  return input
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[•▪▶►☆★✅✔️❌➡️👉🔥💥]/g, " ");
}

/**
 * ทำความสะอาดข้อความสำหรับการวิเคราะห์
 * - เลขไทย -> อารบิก
 * - ตัดอีโมจิ
 * - ยุบช่องว่าง/บรรทัดว่างซ้ำ
 */
export function normalizeText(input: string): string {
  return stripDecorations(thaiDigitsToArabic(input))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * ข้อความมาตรฐานสำหรับทำ content hash (ใช้จับโพสต์ซ้ำแบบเป๊ะ ๆ)
 * ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข เพื่อให้โพสต์เดิมที่แก้เว้นวรรค
 * หรือใส่อีโมจิเพิ่ม ยังได้ hash เดียวกัน
 */
export function canonicalizeForHash(input: string): string {
  return normalizeText(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 4000);
}

/** ตัดข้อความให้สั้นลงโดยไม่ตัดกลางคำภาษาอังกฤษ */
export function truncate(input: string, max: number): string {
  const text = input.trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

/** แปลงสตริงตัวเลขที่มีคอมมาเป็นตัวเลข */
export function toNumber(raw: string): number | null {
  const cleaned = thaiDigitsToArabic(raw).replace(/,/g, "").trim();
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}
