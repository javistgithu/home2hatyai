/**
 * เซสชันผู้ใช้งาน
 *
 * เก็บใน cookie ที่เซ็นด้วย HMAC เพื่อไม่ต้องมีตารางเซสชันในฐานข้อมูล
 * (ร้านเดียว 2-3 คน ไม่ต้องการอะไรซับซ้อนกว่านี้)
 *
 * อายุเซสชัน 12 ชั่วโมง = ครอบคลุมกะทำงาน 1 วัน
 * ไม่ตั้งยาวกว่านี้เพราะถ้าเครื่องหาย/ลืมล็อกเอาต์ จะมีคนใช้สิทธิ์แทนกันได้
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, num, str, bool } from "../db";
import type { AppUser } from "./types";

const COOKIE_NAME = "pos_session";
const MAX_AGE_SEC = 12 * 60 * 60;

function secret(): string {
  return (
    process.env.POS_SESSION_SECRET ||
    // ค่าสำรองสำหรับ dev เท่านั้น production ต้องตั้ง POS_SESSION_SECRET
    "dev-only-insecure-secret-change-me"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createToken(userId: number): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readToken(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;
  if (Number(parts[1]) * 1000 < Date.now()) return null;
  return Number(parts[0]);
}

export function setSessionCookie(userId: number): void {
  cookies().set(COOKIE_NAME, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(): void {
  cookies().delete(COOKIE_NAME);
}

/** อ่านผู้ใช้จาก cookie คืน null เมื่อยังไม่ล็อกอินหรือหมดอายุ */
export async function getCurrentUser(): Promise<AppUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const userId = readToken(token);
  if (!userId) return null;

  const db = await getDb();
  const res = await db.query<Record<string, unknown>>(
    "SELECT id, code, name, role, is_active FROM app_user WHERE id=$1",
    [userId]
  );
  const row = res.rows[0];
  if (!row || !bool(row.is_active)) return null;
  return {
    id: num(row.id),
    code: str(row.code),
    name: str(row.name),
    role: str(row.role) as "OWNER" | "STAFF",
    isActive: true,
  };
}
