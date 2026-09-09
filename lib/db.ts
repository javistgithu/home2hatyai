/**
 * ชั้นเชื่อมต่อฐานข้อมูล
 *
 * รองรับ 2 โหมด โดยดูจาก DATABASE_URL:
 *
 *   ไม่มี DATABASE_URL  -> PGlite (Postgres ที่คอมไพล์เป็น WASM)
 *                          เก็บไฟล์ไว้ใน .pgdata/ ในโปรเจกต์
 *                          ใช้ตอน dev/ลองระบบ: `npm run dev` แล้วใช้ได้เลย
 *                          ไม่ต้องติดตั้ง Postgres
 *
 *   มี DATABASE_URL     -> Postgres จริงผ่าน pg.Pool
 *                          ใช้ตอน production (Neon / Supabase / เครื่องที่ร้าน)
 *
 * ทั้งสองโหมดพูด SQL ภาษาเดียวกัน โค้ดธุรกิจจึงไม่ต้องรู้ว่าใช้ตัวไหนอยู่
 *
 * คำเตือน: PGlite ห้ามใช้ production บน serverless เพราะข้อมูลอยู่ในไฟล์
 * ของแต่ละ instance พอ instance ถูกรีไซเคิลข้อมูลหาย
 */

import type { Pool as PgPool, PoolClient } from "pg";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** อินเทอร์เฟซที่โค้ดธุรกิจใช้ ใช้ได้ทั้งนอกและในทรานแซกชัน */
export interface Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

export interface DbPool extends Db {
  /** รันหลายคำสั่งติดกัน (ใช้กับไฟล์ migration) */
  exec(sql: string): Promise<void>;
  /**
   * รันในทรานแซกชัน commit อัตโนมัติเมื่อสำเร็จ rollback เมื่อ throw
   * ทุกงานที่แตะสต๊อกต้องผ่านฟังก์ชันนี้เท่านั้น
   */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly driver: "pglite" | "postgres";
}

// -------------------------------------------------------------------
// PGlite
// -------------------------------------------------------------------
async function createPglitePool(dataDir: string): Promise<DbPool> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create(dataDir);

  const wrap = (): Db => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pg.query<T>(sql, params as never[]);
      return { rows: res.rows as T[], rowCount: res.rows.length };
    },
  });

  return {
    driver: "pglite",
    query: (sql, params) => wrap().query(sql, params),
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      // PGlite รองรับ transaction แต่ต้องใช้ tx object ของมันเอง
      const result = await pg.transaction(async (tx) => {
        const db: Db = {
          async query<R>(sql: string, params: unknown[] = []) {
            const res = await tx.query<R>(sql, params as never[]);
            return { rows: res.rows as R[], rowCount: res.rows.length };
          },
        };
        return await fn(db);
      });
      return result as T;
    },
    async close() {
      await pg.close();
    },
  };
}

// -------------------------------------------------------------------
// Postgres จริง
// -------------------------------------------------------------------
async function createPostgresPool(url: string): Promise<DbPool> {
  const pgMod = await import("pg");
  const Pool = pgMod.default?.Pool ?? pgMod.Pool;

  const pool: PgPool = new Pool({
    connectionString: url,
    // ค่าเริ่มต้นเหมาะกับ Neon/Supabase pooler และเครื่องเล็กในร้าน
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: url.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });

  return {
    driver: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const db: Db = {
          async query<R>(sql: string, params: unknown[] = []) {
            const res = await client.query(sql, params);
            return {
              rows: res.rows as R[],
              rowCount: res.rowCount ?? res.rows.length,
            };
          },
        };
        const result = await fn(db);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

// -------------------------------------------------------------------
// Singleton
// -------------------------------------------------------------------
// Next.js dev server รีโหลดโมดูลบ่อย ถ้าไม่เก็บไว้ใน globalThis
// จะเปิด PGlite ซ้ำหลายตัวแล้วล็อกไฟล์ชนกัน
const globalForDb = globalThis as unknown as { __posDbPool?: Promise<DbPool> };

export function getDb(): Promise<DbPool> {
  if (!globalForDb.__posDbPool) {
    const url = process.env.DATABASE_URL;
    globalForDb.__posDbPool = url
      ? createPostgresPool(url)
      : createPglitePool(process.env.PGLITE_DIR ?? "./.pgdata");
  }
  return globalForDb.__posDbPool;
}

/** ใช้ในเทสต์: สร้าง pool ใหม่ที่ไม่ผูกกับ singleton */
export async function createTestDb(dataDir = "memory://"): Promise<DbPool> {
  return createPglitePool(dataDir);
}

// -------------------------------------------------------------------
// ตัวช่วยแปลงค่าจาก Postgres
// -------------------------------------------------------------------
/**
 * Postgres คืนค่า numeric มาเป็น string เสมอ (เพื่อไม่ให้เสียความละเอียด)
 * ต้องแปลงเองทุกครั้ง ห้ามใช้ค่าดิบไปคำนวณ เพราะ "10" + 5 = "105"
 */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

export function bool(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1;
}

export function dateOrNull(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}
