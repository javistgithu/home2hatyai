/**
 * บัญชีสต๊อก
 *
 * กฎเหล็ก 3 ข้อของโมดูลนี้:
 *
 * 1. ห้ามแก้ stock_balance ตรงๆ จากที่อื่น ต้องผ่าน recordMovement() เท่านั้น
 *    เพื่อให้ทุกการเปลี่ยนแปลงมีร่องรอยใน stock_movement เสมอ
 *    ถ้ามีโค้ดที่ไหน UPDATE stock_balance เอง แปลว่าเรากำลังสร้างปัญหา
 *    "ของหายโดยไม่รู้สาเหตุ" กลับมาใหม่
 *
 * 2. ทุกฟังก์ชันที่เปลี่ยนยอดต้องรับ tx (ทรานแซกชัน) ไม่ใช่ pool
 *    ตัดสต๊อกกับบันทึกการขายต้องสำเร็จหรือล้มเหลวพร้อมกัน
 *
 * 3. การหยิบของต้องบอกได้เสมอว่าหยิบจากช่องไหน
 *    ถ้าตัดยอดโดยไม่ระบุช่อง เท่ากับกลับไปเป็นระบบเดิมที่หาของไม่เจอ
 */

import type { Db } from "../db";
import { num, str, bool, dateOrNull } from "../db";
import { round3 } from "./money";
import { getSetting } from "./settings";
import type { StockAtLocation, LocationKind } from "./types";

export type MovementReason =
  | "RECEIVE"
  | "SALE"
  | "SALE_RETURN"
  | "VOID_SALE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "COUNT_ADJUST"
  | "DAMAGE"
  | "DISPLAY_OUT"
  | "DISPLAY_IN"
  | "OVERSELL"
  | "OPENING"
  | "MANUAL_ADJUST";

export interface MovementInput {
  productId: number;
  locationId: number;
  /** บวก = ของเข้า, ลบ = ของออก */
  qtyDelta: number;
  reason: MovementReason;
  refType?: string | null;
  refId?: number | null;
  userId?: number | null;
  note?: string | null;
}

/**
 * บันทึกการเคลื่อนไหวสต๊อก 1 รายการ + อัปเดตยอดคงเหลือ
 *
 * ใช้ INSERT ... ON CONFLICT DO UPDATE เพื่อให้การบวก/ลบยอดเป็น atomic
 * ในคำสั่งเดียว ไม่มีช่องว่างให้ 2 บิลที่ขายพร้อมกันอ่านยอดเดียวกันแล้วเขียนทับ
 */
export async function recordMovement(
  tx: Db,
  input: MovementInput
): Promise<{ qtyAfter: number; movementId: number }> {
  const delta = round3(input.qtyDelta);
  if (delta === 0) {
    const cur = await tx.query<Record<string, unknown>>(
      "SELECT qty_on_hand FROM stock_balance WHERE product_id=$1 AND location_id=$2",
      [input.productId, input.locationId]
    );
    return { qtyAfter: num(cur.rows[0]?.qty_on_hand), movementId: 0 };
  }

  const balRes = await tx.query<Record<string, unknown>>(
    `INSERT INTO stock_balance
       (product_id, location_id, qty_on_hand, qty_reserved, last_movement_at)
     VALUES ($1, $2, $3, 0, now())
     ON CONFLICT (product_id, location_id) DO UPDATE
       SET qty_on_hand      = stock_balance.qty_on_hand + EXCLUDED.qty_on_hand,
           last_movement_at = now()
     RETURNING qty_on_hand`,
    [input.productId, input.locationId, delta]
  );
  const qtyAfter = round3(num(balRes.rows[0].qty_on_hand));

  const mvRes = await tx.query<Record<string, unknown>>(
    `INSERT INTO stock_movement
       (product_id, location_id, qty_delta, qty_after, reason,
        ref_type, ref_id, user_id, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      input.productId,
      input.locationId,
      delta,
      qtyAfter,
      input.reason,
      input.refType ?? null,
      input.refId ?? null,
      input.userId ?? null,
      input.note ?? null,
    ]
  );

  return { qtyAfter, movementId: num(mvRes.rows[0].id) };
}

// -------------------------------------------------------------------
// อ่านยอดสต๊อก
// -------------------------------------------------------------------
interface StockRow {
  location_id: string;
  location_code: string;
  location_label: string;
  location_kind: string;
  zone_code: string;
  zone_name: string;
  qty_on_hand: string;
  qty_reserved: string;
  qty_available: string;
  walk_order: string;
  pick_priority: string;
  is_pickable: boolean | string;
  last_counted_at: string | null;
}

function mapStock(r: StockRow): StockAtLocation {
  return {
    locationId: num(r.location_id),
    locationCode: str(r.location_code),
    locationLabel: str(r.location_label),
    locationKind: str(r.location_kind) as LocationKind,
    zoneCode: str(r.zone_code),
    zoneName: str(r.zone_name),
    qtyOnHand: num(r.qty_on_hand),
    qtyReserved: num(r.qty_reserved),
    qtyAvailable: num(r.qty_available),
    walkOrder: num(r.walk_order),
    pickPriority: num(r.pick_priority),
    isPickable: bool(r.is_pickable),
    lastCountedAt: dateOrNull(r.last_counted_at),
  };
}

/**
 * ยอดสต๊อกของสินค้า 1 ตัว แยกตามช่อง
 * เรียงตามลำดับที่ควรเดินไปหยิบ: หน้าร้านก่อน แล้วค่อยสโตร์
 */
export async function getStockByProduct(
  db: Db,
  productId: number,
  opts: { includeEmpty?: boolean } = {}
): Promise<StockAtLocation[]> {
  const res = await db.query<StockRow>(
    `SELECT location_id, location_code, location_label, location_kind,
            zone_code, zone_name, qty_on_hand, qty_reserved, qty_available,
            walk_order, pick_priority, is_pickable, last_counted_at
     FROM v_stock_detail
     WHERE product_id = $1
       ${opts.includeEmpty ? "" : "AND qty_on_hand <> 0"}
     ORDER BY pick_priority, walk_order`,
    [productId]
  );
  return res.rows.map(mapStock);
}

/** สินค้าทั้งหมดที่อยู่ในช่องนี้ ใช้ตอนนับสต๊อก */
export async function getStockByLocation(
  db: Db,
  locationId: number
): Promise<
  { productId: number; sku: string; productName: string; unit: string; qtyOnHand: number }[]
> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT product_id, sku, product_name, unit, qty_on_hand
     FROM v_stock_detail
     WHERE location_id = $1 AND qty_on_hand <> 0
     ORDER BY product_name`,
    [locationId]
  );
  return res.rows.map((r) => ({
    productId: num(r.product_id),
    sku: str(r.sku),
    productName: str(r.product_name),
    unit: str(r.unit),
    qtyOnHand: num(r.qty_on_hand),
  }));
}

// -------------------------------------------------------------------
// จัดสรรของสำหรับหยิบขาย
// -------------------------------------------------------------------
export interface AllocationPick {
  locationId: number;
  locationCode: string;
  locationLabel: string;
  qty: number;
  /** true = ยอดในระบบไม่พอ แต่ขายไปแล้ว ต้องไปนับช่องนี้ */
  wasOversell: boolean;
}

export interface AllocationResult {
  picks: AllocationPick[];
  /** จำนวนที่ยอดในระบบไม่พอ (0 = พอ) */
  shortBy: number;
  /** ช่องอื่นที่ยังมีของ ใช้บอกพนักงานตอนของช่องแรกไม่พอ */
  alternatives: StockAtLocation[];
}

/**
 * เลือกว่าจะหยิบของจากช่องไหนบ้าง
 *
 * ลำดับการเลือก: หน้าร้านก่อน (เดินใกล้สุด) แล้วค่อยสโตร์หลังร้าน
 * ภายในโซนเดียวกันเรียงตามลำดับการเดิน เพื่อให้หยิบทั้งบิลได้ในรอบเดียว
 *
 * ช่องที่ไม่ถูกเลือกเด็ดขาด:
 *   - จุดโชว์ (DISPLAY_SPOT) เพราะเป็นของที่แขวนอยู่ ไม่ใช่ของใหม่ในกล่อง
 *   - ของเสีย (DAMAGED)
 *   - ของจองลูกค้า (RESERVED)
 * นี่คือจุดที่ระบบเดิมพลาด: นับตัวโชว์รวมเป็นของขายได้
 * ระบบเลยบอกว่ามี 1 ชิ้น พนักงานไปหยิบแล้วเจอแต่ตัวที่แขวนโชว์อยู่
 */
export async function allocateForPick(
  tx: Db,
  input: {
    productId: number;
    qty: number;
    /** ถ้าพนักงานเลือกช่องเอง ให้หยิบจากช่องนี้ก่อน */
    preferLocationId?: number | null;
    oversellPolicy?: "allow" | "block";
  }
): Promise<AllocationResult> {
  const want = round3(input.qty);
  if (want <= 0) throw new Error("จำนวนที่ขายต้องมากกว่า 0");

  // ล็อกแถวยอดคงเหลือของสินค้านี้ทุกช่อง กันสองบิลแย่งของชิ้นสุดท้าย
  // FOR UPDATE OF sb = ล็อกเฉพาะตาราง stock_balance ไม่ล็อก location/zone
  const res = await tx.query<Record<string, unknown>>(
    `SELECT sb.location_id, sb.qty_on_hand, sb.qty_reserved,
            l.code AS location_code, l.label_th AS location_label,
            l.walk_order, l.kind AS location_kind,
            z.pick_priority
     FROM stock_balance sb
     JOIN location l ON l.id = sb.location_id
     JOIN zone     z ON z.id = l.zone_id
     WHERE sb.product_id = $1
       AND l.is_active
       AND l.is_pickable
       AND l.kind IN ('BIN','STAGING')
     ORDER BY z.pick_priority, l.walk_order
     FOR UPDATE OF sb`,
    [input.productId]
  );

  const candidates = res.rows.map((r) => ({
    locationId: num(r.location_id),
    locationCode: str(r.location_code),
    locationLabel: str(r.location_label),
    available: round3(num(r.qty_on_hand) - num(r.qty_reserved)),
    walkOrder: num(r.walk_order),
  }));

  // ช่องที่พนักงานเลือกเองต้องมาก่อนเสมอ
  if (input.preferLocationId) {
    const idx = candidates.findIndex(
      (c) => c.locationId === input.preferLocationId
    );
    if (idx > 0) candidates.unshift(candidates.splice(idx, 1)[0]);
  }

  const picks: AllocationPick[] = [];
  let remaining = want;
  // ช่องสุดท้ายที่หยิบของออกมาจริง = ช่องที่ของเพิ่งหมดไป
  // ถ้าขายเกินยอด ต้องลงยอดติดลบที่ช่องนี้ ไม่ใช่ช่องอื่น
  // เพราะช่องนี้คือช่องที่พนักงานเพิ่งไปยืนหยิบ และเป็นช่องที่ควรไปนับซ้ำ
  let lastPickedId: number | null = null;

  for (const c of candidates) {
    if (remaining <= 0) break;
    if (c.available <= 0) continue;
    const take = round3(Math.min(c.available, remaining));
    picks.push({
      locationId: c.locationId,
      locationCode: c.locationCode,
      locationLabel: c.locationLabel,
      qty: take,
      wasOversell: false,
    });
    lastPickedId = c.locationId;
    remaining = round3(remaining - take);
  }

  const alternatives = await getStockByProduct(tx, input.productId);

  if (remaining > 0) {
    const policy =
      input.oversellPolicy ?? (await getSetting(tx, "oversell_policy", "allow"));

    if (policy === "block") {
      const where = alternatives
        .filter((a) => a.qtyAvailable > 0)
        .map((a) => `${a.locationCode} (${a.qtyAvailable})`)
        .join(", ");
      throw new Error(
        `ยอดในระบบไม่พอ ขาดอีก ${remaining} — ` +
          (where ? `ยังมีที่ ${where}` : "ไม่มีในระบบเลย")
      );
    }

    // นโยบาย allow: ของอยู่ในมือลูกค้าแล้ว ต้องขายให้จบ
    // แล้วตั้งธงให้ไปนับช่องนั้นทันที ดีกว่าห้ามขายจนพนักงานหนีไปเขียนใส่กระดาษ
    // ลำดับการเลือกช่องที่จะลงยอดติดลบ:
    //   1. ช่องที่พนักงานระบุเอง (เขาไปยืนหยิบมาแล้ว รู้ดีที่สุด)
    //   2. ช่องสุดท้ายที่ของเพิ่งหมด (ขาดตรงนั้นแน่ๆ)
    //   3. ช่องแรกตามลำดับการเดิน / ช่องที่เคยมีของล่าสุด
    // ลงผิดช่องเมื่อไหร่ ระบบจะสั่งให้ไปนับผิดที่ แล้วปัญหาจะไม่ถูกแก้
    const fallbackId =
      input.preferLocationId ??
      lastPickedId ??
      candidates[0]?.locationId ??
      (await getFallbackLocationId(tx, input.productId));
    const fallback =
      candidates.find((c) => c.locationId === fallbackId) ??
      (await describeLocation(tx, fallbackId));

    // เก็บส่วนที่ขายเกินยอดเป็นรายการแยก ไม่รวมกับส่วนที่มีของจริง
    // เพื่อให้บัญชีเดินสะพัดแยกได้ว่า "ขายปกติเท่าไหร่ ขายเกินยอดเท่าไหร่"
    // ซึ่งเป็นตัวเลขที่ใช้วัดว่าสต๊อกแม่นขึ้นหรือยัง
    picks.push({
      locationId: fallbackId,
      locationCode: fallback.locationCode,
      locationLabel: fallback.locationLabel,
      qty: remaining,
      wasOversell: true,
    });
  }

  return { picks, shortBy: Math.max(0, remaining), alternatives };
}

/** ช่องที่จะใช้ตัดยอดเมื่อสินค้าไม่มีในระบบเลย: ช่องที่เคลื่อนไหวล่าสุด ไม่งั้นใช้จุดพักของ */
async function getFallbackLocationId(
  tx: Db,
  productId: number
): Promise<number> {
  const last = await tx.query<Record<string, unknown>>(
    `SELECT sb.location_id
     FROM stock_balance sb
     JOIN location l ON l.id = sb.location_id
     WHERE sb.product_id = $1 AND l.is_pickable AND l.kind IN ('BIN','STAGING')
     ORDER BY sb.last_movement_at DESC NULLS LAST
     LIMIT 1`,
    [productId]
  );
  if (last.rows[0]) return num(last.rows[0].location_id);

  const staging = await tx.query<Record<string, unknown>>(
    "SELECT id FROM location WHERE code = 'F-TMP'"
  );
  if (!staging.rows[0]) throw new Error("ไม่พบช่องพักของ F-TMP");
  return num(staging.rows[0].id);
}

async function describeLocation(
  tx: Db,
  locationId: number
): Promise<{ locationCode: string; locationLabel: string }> {
  const res = await tx.query<Record<string, unknown>>(
    "SELECT code, label_th FROM location WHERE id = $1",
    [locationId]
  );
  return {
    locationCode: str(res.rows[0]?.code),
    locationLabel: str(res.rows[0]?.label_th),
  };
}

// -------------------------------------------------------------------
// ย้ายของระหว่างช่อง
// -------------------------------------------------------------------
/**
 * ย้ายของจากช่องหนึ่งไปอีกช่อง (เช่น เติมของหน้าร้านจากสโตร์)
 * บันทึก 2 บรรทัดในบัญชี: ออกจากช่องต้นทาง + เข้าช่องปลายทาง
 * ยอดรวมทั้งร้านจึงไม่เปลี่ยน แต่ตำแหน่งอัปเดตถูกต้อง
 */
export async function transferStock(
  tx: Db,
  input: {
    productId: number;
    fromLocationId: number;
    toLocationId: number;
    qty: number;
    userId: number;
    note?: string;
  }
): Promise<{ fromQtyAfter: number; toQtyAfter: number }> {
  if (input.fromLocationId === input.toLocationId) {
    throw new Error("ช่องต้นทางกับปลายทางเป็นช่องเดียวกัน");
  }
  const qty = round3(input.qty);
  if (qty <= 0) throw new Error("จำนวนที่ย้ายต้องมากกว่า 0");

  const out = await recordMovement(tx, {
    productId: input.productId,
    locationId: input.fromLocationId,
    qtyDelta: -qty,
    reason: "TRANSFER_OUT",
    refType: "TRANSFER",
    userId: input.userId,
    note: input.note,
  });
  const inn = await recordMovement(tx, {
    productId: input.productId,
    locationId: input.toLocationId,
    qtyDelta: qty,
    reason: "TRANSFER_IN",
    refType: "TRANSFER",
    userId: input.userId,
    note: input.note,
  });

  return { fromQtyAfter: out.qtyAfter, toQtyAfter: inn.qtyAfter };
}

/** ปรับยอดด้วยมือ ต้องมีเหตุผลเสมอ */
export async function adjustStock(
  tx: Db,
  input: {
    productId: number;
    locationId: number;
    newQty: number;
    userId: number;
    reason: string;
  }
): Promise<{ delta: number; qtyAfter: number }> {
  const cur = await tx.query<Record<string, unknown>>(
    `SELECT qty_on_hand FROM stock_balance
     WHERE product_id=$1 AND location_id=$2 FOR UPDATE`,
    [input.productId, input.locationId]
  );
  const current = num(cur.rows[0]?.qty_on_hand);
  const delta = round3(input.newQty - current);
  if (delta === 0) return { delta: 0, qtyAfter: current };

  const res = await recordMovement(tx, {
    productId: input.productId,
    locationId: input.locationId,
    qtyDelta: delta,
    reason: "MANUAL_ADJUST",
    userId: input.userId,
    note: input.reason,
  });
  return { delta, qtyAfter: res.qtyAfter };
}

/**
 * ตรวจว่ายอดคงเหลือตรงกับผลรวมในบัญชีเดินสะพัดหรือไม่
 * ถ้าไม่ตรงแปลว่ามีโค้ดที่ไหนแก้ stock_balance โดยไม่ผ่าน recordMovement
 * ควรรันเป็นงานตรวจสุขภาพระบบทุกคืน
 */
export async function verifyLedgerIntegrity(
  db: Db
): Promise<
  { productId: number; locationId: number; balance: number; ledgerSum: number }[]
> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT sb.product_id, sb.location_id,
            sb.qty_on_hand AS balance,
            COALESCE(m.total, 0) AS ledger_sum
     FROM stock_balance sb
     LEFT JOIN (
       SELECT product_id, location_id, SUM(qty_delta) AS total
       FROM stock_movement GROUP BY product_id, location_id
     ) m ON m.product_id = sb.product_id AND m.location_id = sb.location_id
     WHERE ABS(sb.qty_on_hand - COALESCE(m.total, 0)) > 0.0005`
  );
  return res.rows.map((r) => ({
    productId: num(r.product_id),
    locationId: num(r.location_id),
    balance: num(r.balance),
    ledgerSum: num(r.ledger_sum),
  }));
}
