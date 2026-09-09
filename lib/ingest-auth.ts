import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { INGEST_SECRET } from "@/lib/env";

/** อายุสูงสุดของลายเซ็น กันการเล่นซ้ำ (replay attack) */
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export interface IngestAuthResult {
  ok: boolean;
  reason?: string;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * ตรวจลายเซ็นของคำขอนำเข้าข้อมูล
 *
 *   x-ingest-timestamp: <unix ms>
 *   x-ingest-signature: sha256=<hex ของ HMAC(secret, `${timestamp}.${rawBody}`)>
 *
 * ใช้ timestamp ร่วมด้วยเพื่อไม่ให้ดักคำขอเดิมมายิงซ้ำได้
 */
export function verifyIngestSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null
): IngestAuthResult {
  if (!INGEST_SECRET) {
    return { ok: false, reason: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า INGEST_SECRET" };
  }
  if (!signatureHeader || !timestampHeader) {
    return { ok: false, reason: "ไม่มี header x-ingest-signature หรือ x-ingest-timestamp" };
  }

  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "x-ingest-timestamp ไม่ถูกต้อง" };
  }
  if (Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) {
    return { ok: false, reason: "ลายเซ็นหมดอายุ (เกิน 5 นาที)" };
  }

  const expected =
    "sha256=" + createHmac("sha256", INGEST_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");

  if (!safeEqual(expected, signatureHeader)) {
    return { ok: false, reason: "ลายเซ็นไม่ถูกต้อง" };
  }
  return { ok: true };
}

/** สร้างลายเซ็นฝั่งผู้ส่ง (ใช้ในสคริปต์เก็บข้อมูล) */
export function signIngestBody(rawBody: string, secret: string, timestamp = Date.now()) {
  return {
    timestamp: String(timestamp),
    signature: "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"),
  };
}
