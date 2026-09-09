/**
 * ระบบราคา 5 ระดับ
 *
 * ระดับตามที่ร้านใช้จริง:
 *   5  ราคาเต็มก่อนลด   (แพงสุด - ราคาป้าย ใช้โชว์ส่วนลด)
 *   1  ราคาขายจริง       (ค่าตั้งต้น ลูกค้าทั่วไป)
 *   2  ราคาช่าง
 *   3  ราคาช่างขายส่ง
 *   4  ราคาพิเศษ         (ถูกสุด - ต้องอนุมัติ)
 *
 * ข้อควรระวังที่สุดของโมดูลนี้:
 * ตัวเลขระดับ "ไม่ได้" เรียงตามราคา ระดับ 5 แพงกว่าระดับ 1
 * ห้ามเขียนโค้ดที่สมมติว่า level มาก = ถูกกว่า เด็ดขาด
 */

import type { Db } from "../db";
import { num, str, bool, numOrNull, strOrNull } from "../db";
import { marginPct, round2 } from "./money";
import type { PriceTier, ProductPrice } from "./types";

export const TIER_LIST_PRICE = 5;   // ราคาเต็มก่อนลด
export const TIER_RETAIL = 1;       // ราคาขายจริง
export const TIER_TECHNICIAN = 2;   // ราคาช่าง
export const TIER_WHOLESALE = 3;    // ราคาช่างขายส่ง
export const TIER_SPECIAL = 4;      // ราคาพิเศษ

/** ลำดับราคาจากแพงไปถูก ใช้ตรวจว่าตั้งราคาสลับกันหรือเปล่า */
export const TIER_ORDER_EXPENSIVE_FIRST = [5, 1, 2, 3, 4] as const;

export async function getPriceTiers(db: Db): Promise<PriceTier[]> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT level, code, name_th, description_th, is_default, requires_approval,
            is_anchor, min_margin_pct, color_hex, sort_order
     FROM price_tier ORDER BY sort_order`
  );
  return res.rows.map((r) => ({
    level: num(r.level),
    code: str(r.code),
    nameTh: str(r.name_th),
    descriptionTh: strOrNull(r.description_th),
    isDefault: bool(r.is_default),
    requiresApproval: bool(r.requires_approval),
    isAnchor: bool(r.is_anchor),
    minMarginPct: numOrNull(r.min_margin_pct),
    colorHex: str(r.color_hex),
    sortOrder: num(r.sort_order),
  }));
}

export async function getProductPrices(
  db: Db,
  productId: number
): Promise<ProductPrice[]> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT pp.tier_level, pp.price
     FROM product_price pp
     JOIN price_tier pt ON pt.level = pp.tier_level
     WHERE pp.product_id = $1
     ORDER BY pt.sort_order`,
    [productId]
  );
  return res.rows.map((r) => ({
    tierLevel: num(r.tier_level),
    price: num(r.price),
  }));
}

export interface ResolvedPrice {
  productId: number;
  /** ระดับที่ใช้จริง (อาจไม่ตรงกับที่ขอ ถ้าระดับที่ขอไม่ได้ตั้งราคาไว้) */
  tierLevel: number;
  requestedTier: number;
  price: number;
  /** ราคาเต็ม (ระดับ 5) ไว้โชว์ว่า "ลดให้เท่าไหร่" */
  listPrice: number | null;
  /** true เมื่อระดับที่ขอไม่มีราคา ระบบถอยไปใช้ราคาขายจริงแทน */
  fallbackUsed: boolean;
  requiresApproval: boolean;
}

/**
 * หาราคาของสินค้าตามระดับที่ขอ
 *
 * กฎการถอย (fallback) เมื่อระดับที่ขอยังไม่ได้ตั้งราคา:
 *   ระดับที่ขอ -> ราคาขายจริง (ระดับ 1) -> ราคาเต็ม (ระดับ 5) -> ผิดพลาด
 *
 * เหตุผล: ถ้าไม่มี fallback แล้วโยน error หน้าขายจะค้างกลางบิล
 * พนักงานจะเลิกใช้ทันที การถอยไปใช้ราคาขายจริงปลอดภัยกว่า
 * เพราะเป็นราคาที่สูงกว่าราคาช่าง/ส่ง (ไม่ทำให้ร้านขาดทุน)
 * แต่ต้องตั้งธง fallbackUsed ให้หน้าจอเตือนว่า "ตัวนี้ยังไม่ได้ตั้งราคาช่าง"
 */
export async function resolvePrice(
  db: Db,
  productId: number,
  requestedTier: number
): Promise<ResolvedPrice> {
  const [prices, tiers] = await Promise.all([
    getProductPrices(db, productId),
    getPriceTiers(db),
  ]);

  const byTier = new Map(prices.map((p) => [p.tierLevel, p.price]));
  const listPrice = byTier.get(TIER_LIST_PRICE) ?? null;
  const tierInfo = tiers.find((t) => t.level === requestedTier);

  let used = requestedTier;
  let price = byTier.get(requestedTier);
  let fallbackUsed = false;

  if (price === undefined) {
    price = byTier.get(TIER_RETAIL);
    used = TIER_RETAIL;
    fallbackUsed = true;
  }
  if (price === undefined) {
    price = byTier.get(TIER_LIST_PRICE);
    used = TIER_LIST_PRICE;
    fallbackUsed = true;
  }
  if (price === undefined) {
    throw new Error(
      `สินค้ารหัส ${productId} ยังไม่ได้ตั้งราคาเลยสักระดับ ตั้งราคาก่อนจึงจะขายได้`
    );
  }

  return {
    productId,
    tierLevel: used,
    requestedTier,
    price: round2(price),
    listPrice,
    fallbackUsed,
    requiresApproval: tierInfo?.requiresApproval ?? false,
  };
}

/** หาราคาหลายสินค้าพร้อมกัน (ใช้ตอนโหลดตะกร้าทั้งใบ) */
export async function resolvePrices(
  db: Db,
  items: { productId: number; tierLevel: number }[]
): Promise<Map<number, ResolvedPrice>> {
  const out = new Map<number, ResolvedPrice>();
  for (const item of items) {
    out.set(item.productId, await resolvePrice(db, item.productId, item.tierLevel));
  }
  return out;
}

export interface PriceGuardResult {
  ok: boolean;
  warnings: string[];
  blockers: string[];
  marginPct: number;
}

/**
 * ตรวจราคาก่อนขาย
 *
 * blockers = ขายไม่ได้จนกว่าจะมีคนอนุมัติ
 * warnings = ขายได้ แต่ขึ้นเตือนให้คนขายเห็น
 *
 * ตั้งใจแยกสองระดับ เพราะถ้าบล็อกทุกอย่างพนักงานจะหาทางเลี่ยงระบบ
 * แต่ถ้าไม่เตือนเลย ร้านก็ขายขาดทุนโดยไม่รู้ตัว
 */
export function checkPriceGuard(input: {
  price: number;
  cost: number;
  tier: PriceTier | undefined;
  isOverridden: boolean;
  hasApproval: boolean;
}): PriceGuardResult {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const margin = marginPct(input.price, input.cost);

  if (input.cost > 0 && input.price < input.cost) {
    warnings.push(
      `ราคาขาย ${round2(input.price)} ต่ำกว่าทุน ${round2(input.cost)} บาท — ขายแล้วขาดทุน`
    );
  } else if (
    input.tier?.minMarginPct != null &&
    input.cost > 0 &&
    margin < input.tier.minMarginPct
  ) {
    warnings.push(
      `กำไร ${margin}% ต่ำกว่าเกณฑ์ของ${input.tier.nameTh} (${input.tier.minMarginPct}%)`
    );
  }

  if (input.tier?.requiresApproval && !input.hasApproval) {
    blockers.push(`${input.tier.nameTh} ต้องให้เจ้าของกด PIN อนุมัติก่อน`);
  }
  if (input.isOverridden && !input.hasApproval) {
    blockers.push("แก้ราคาเองต้องให้เจ้าของกด PIN อนุมัติก่อน");
  }

  return {
    ok: blockers.length === 0,
    warnings,
    blockers,
    marginPct: margin,
  };
}

/**
 * ตรวจว่าตั้งราคา 5 ระดับสลับกันหรือเปล่า
 *
 * ราคาที่ถูกต้องต้องเรียง: เต็ม(5) >= ขายจริง(1) >= ช่าง(2) >= ส่ง(3) >= พิเศษ(4)
 * ถ้าคนกรอกสลับช่อง ราคาส่งจะแพงกว่าราคาปลีก แล้วลูกค้าประจำจะโดนเก็บแพงกว่าคนเดินเข้า
 * ตรวจตั้งแต่ตอนกรอกดีกว่ามารู้ตอนลูกค้าโวย
 */
export function validatePriceLadder(
  prices: { tierLevel: number; price: number }[]
): string[] {
  const byTier = new Map(prices.map((p) => [p.tierLevel, p.price]));
  const problems: string[] = [];
  const names: Record<number, string> = {
    5: "ราคาเต็มก่อนลด",
    1: "ราคาขายจริง",
    2: "ราคาช่าง",
    3: "ราคาช่างขายส่ง",
    4: "ราคาพิเศษ",
  };

  const ladder = TIER_ORDER_EXPENSIVE_FIRST.filter((t) => byTier.has(t));
  for (let i = 0; i < ladder.length - 1; i++) {
    const hi = ladder[i];
    const lo = ladder[i + 1];
    const hiPrice = byTier.get(hi)!;
    const loPrice = byTier.get(lo)!;
    if (loPrice > hiPrice) {
      problems.push(
        `${names[lo]} (${loPrice}) แพงกว่า${names[hi]} (${hiPrice}) — น่าจะกรอกสลับช่องกัน`
      );
    }
  }
  return problems;
}

/** ตั้งราคาทั้ง 5 ระดับพร้อมกัน และเก็บประวัติทุกครั้งที่เปลี่ยน */
export async function setProductPrices(
  db: Db,
  input: {
    productId: number;
    prices: { tierLevel: number; price: number }[];
    userId: number;
    reason?: string;
  }
): Promise<{ warnings: string[] }> {
  const warnings = validatePriceLadder(input.prices);

  const existing = await db.query<Record<string, unknown>>(
    "SELECT tier_level, price FROM product_price WHERE product_id = $1",
    [input.productId]
  );
  const old = new Map(
    existing.rows.map((r) => [num(r.tier_level), num(r.price)])
  );

  for (const p of input.prices) {
    const oldPrice = old.get(p.tierLevel);
    if (oldPrice !== undefined && round2(oldPrice) === round2(p.price)) continue;

    await db.query(
      `INSERT INTO product_price (product_id, tier_level, price, updated_at, updated_by)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (product_id, tier_level)
       DO UPDATE SET price = EXCLUDED.price,
                     updated_at = now(),
                     updated_by = EXCLUDED.updated_by`,
      [input.productId, p.tierLevel, round2(p.price), input.userId]
    );
    await db.query(
      `INSERT INTO price_change_log
         (product_id, tier_level, old_price, new_price, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.productId,
        p.tierLevel,
        oldPrice ?? null,
        round2(p.price),
        input.userId,
        input.reason ?? null,
      ]
    );
  }

  return { warnings };
}
