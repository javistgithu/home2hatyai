/** ตัวช่วยสำหรับ API route - รูปแบบคำตอบเหมือนกันทุกเส้นทาง */

import { NextResponse } from "next/server";
import { getDb, type DbPool } from "../db";
import { runMigrations, isInstalled } from "../migrate";
import { getCurrentUser } from "./session";
import type { AppUser } from "./types";

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * เตรียมฐานข้อมูลให้พร้อม
 *
 * ตอน dev (PGlite) จะรัน migration ให้อัตโนมัติ เพื่อให้เปิดเว็บครั้งแรกใช้ได้เลย
 * ตอน production (Postgres) ไม่รันอัตโนมัติ ต้องสั่ง npm run db:migrate เอง
 * เพราะการเปลี่ยนโครงสร้างฐานข้อมูลจริงต้องเป็นการตัดสินใจของคน ไม่ใช่ผลข้างเคียง
 * ของการที่มีคนเผลอเปิดหน้าเว็บ
 */
let migrationChecked = false;
export async function db(): Promise<DbPool> {
  const pool = await getDb();
  if (!migrationChecked) {
    migrationChecked = true;
    if (pool.driver === "pglite" && !(await isInstalled(pool))) {
      await runMigrations(pool, { log: console.log });
    }
  }
  return pool;
}

export class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** บังคับให้ล็อกอินก่อน */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("กรุณาเข้าสู่ระบบก่อน", 401);
  return user;
}

/** บังคับให้เป็นเจ้าของร้าน */
export async function requireOwner(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "OWNER") {
    throw new ApiError("เฉพาะเจ้าของร้านเท่านั้น", 403);
  }
  return user;
}

/** ห่อ handler ให้จัดการ error เป็นข้อความไทยที่หน้าจอเอาไปแสดงได้เลย */
export function handler(
  fn: (req: Request, ctx: { params: Record<string, string> }) => Promise<NextResponse>
) {
  return async (req: Request, ctx: { params: Record<string, string> }) => {
    try {
      await db();
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.message, err.status);
      const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
      console.error("[api]", err);
      return fail(message, 500);
    }
  };
}
