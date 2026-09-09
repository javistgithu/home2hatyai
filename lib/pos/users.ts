/**
 * ผู้ใช้งานและการยืนยันตัวตน
 *
 * ใช้ PIN 4-6 หลัก ไม่ใช่รหัสผ่าน เพราะหน้าร้านต้องสลับคนใช้เครื่องบ่อย
 * ถ้าล็อกอินช้าหรือยุ่งยาก พนักงานจะเปิดค้างไว้ใช้ร่วมกัน
 * แล้วเราจะไม่รู้เลยว่าใครขาย ใครปรับยอด ใครลดราคา
 *
 * PIN เก็บเป็น scrypt hash พร้อม salt สุ่ม ไม่เก็บ PIN ตรงๆ
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "../db";
import { num, str, bool } from "../db";
import type { AppUser } from "./types";

const SCRYPT_KEYLEN = 32;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPinHash(pin: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const actual = scryptSync(pin, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePinFormat(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return "PIN ต้องเป็นตัวเลข 4-6 หลัก";
  if (/^(\d)\1+$/.test(pin)) return "PIN ห้ามเป็นเลขซ้ำกันทั้งหมด เช่น 1111";
  if (pin === "1234" || pin === "123456") return "PIN นี้เดาง่ายเกินไป";
  return null;
}

export async function createUser(
  db: Db,
  input: { code: string; name: string; pin: string; role: "OWNER" | "STAFF" }
): Promise<number> {
  const problem = validatePinFormat(input.pin);
  if (problem) throw new Error(problem);

  const res = await db.query<Record<string, unknown>>(
    `INSERT INTO app_user (code, name, pin_hash, role)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.code, input.name, hashPin(input.pin), input.role]
  );
  return num(res.rows[0].id);
}

export async function changePin(
  db: Db,
  input: { userId: number; newPin: string }
): Promise<void> {
  const problem = validatePinFormat(input.newPin);
  if (problem) throw new Error(problem);
  await db.query("UPDATE app_user SET pin_hash=$2 WHERE id=$1", [
    input.userId,
    hashPin(input.newPin),
  ]);
}

/** ยืนยัน PIN แล้วคืนข้อมูลผู้ใช้ คืน null เมื่อ PIN ผิด */
export async function authenticate(
  db: Db,
  code: string,
  pin: string
): Promise<AppUser | null> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT id, code, name, role, pin_hash, is_active
     FROM app_user WHERE upper(code) = upper($1)`,
    [code]
  );
  const row = res.rows[0];
  if (!row || !bool(row.is_active)) return null;
  if (!verifyPinHash(pin, str(row.pin_hash))) return null;
  return {
    id: num(row.id),
    code: str(row.code),
    name: str(row.name),
    role: str(row.role) as "OWNER" | "STAFF",
    isActive: true,
  };
}

/** ยืนยันว่าเป็นเจ้าของ ใช้ตอนขออนุมัติราคาพิเศษ/แก้ราคา */
export async function verifyOwnerPin(
  db: Db,
  pin: string
): Promise<AppUser | null> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT id, code, name, role, pin_hash
     FROM app_user WHERE role='OWNER' AND is_active`
  );
  for (const row of res.rows) {
    if (verifyPinHash(pin, str(row.pin_hash))) {
      return {
        id: num(row.id),
        code: str(row.code),
        name: str(row.name),
        role: "OWNER",
        isActive: true,
      };
    }
  }
  return null;
}

export async function listUsers(db: Db): Promise<AppUser[]> {
  const res = await db.query<Record<string, unknown>>(
    "SELECT id, code, name, role, is_active FROM app_user ORDER BY role, name"
  );
  return res.rows.map((r) => ({
    id: num(r.id),
    code: str(r.code),
    name: str(r.name),
    role: str(r.role) as "OWNER" | "STAFF",
    isActive: bool(r.is_active),
  }));
}
