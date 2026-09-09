/**
 * ระบบแจ้ง "หาไม่เจอ"
 *
 * นี่คือฟีเจอร์ที่ตอบโจทย์ปัญหาหลักของร้านนี้โดยตรง
 *
 * เดิม: ระบบบอกว่ามีของ พนักงานเดินไปหา หาไม่เจอ เสียเวลา 10 นาที
 *       ลูกค้ารอจนหงุดหงิด สุดท้ายบอกลูกค้าว่า "ของหมด" ทั้งที่ระบบบอกว่ามี
 *       แล้วไม่มีใครบันทึกอะไร ปัญหาเดิมจึงเกิดซ้ำทุกสัปดาห์
 *
 * ใหม่: กดปุ่มเดียว ระบบตอบกลับทันทีใน 1 วินาทีว่า
 *       1. ยังมีของช่องอื่นไหม (บ่อยมากที่ของถูกวางผิดช่อง)
 *       2. ที่เห็นอยู่เป็นตัวโชว์หรือเปล่า
 *       3. ตั้งงานนับช่องนั้นให้อัตโนมัติ
 *       และเก็บสถิติว่าช่องไหน/สินค้าตัวไหนมีปัญหาบ่อย
 *
 * เจตนาสำคัญ: ทำให้การ "แจ้งปัญหา" เร็วกว่าและง่ายกว่าการ "ปล่อยผ่าน"
 * ถ้าแจ้งแล้วยุ่งยากกว่าเดิม พนักงานจะไม่แจ้ง แล้วเราจะไม่มีข้อมูลไปแก้ต้นเหตุ
 */

import type { Db, DbPool } from "../db";
import { num, str, bool } from "../db";
import { nextDocNo } from "./docno";
import type { StockAtLocation, DisplayUnitInfo } from "./types";

export interface NotFoundResponse {
  reportId: number;
  /** ช่องอื่นที่ระบบบอกว่ายังมีของ - ให้พนักงานลองดูต่อทันที */
  alternatives: StockAtLocation[];
  /** ตัวโชว์ของสินค้านี้ - บ่อยครั้งที่ "ของชิ้นเดียวที่เห็น" คือตัวโชว์ */
  displayUnits: DisplayUnitInfo[];
  /** รอบนับที่ระบบเปิดให้อัตโนมัติ */
  countSessionId: number;
  /** ข้อความแนะนำที่จะโชว์บนหน้าจอทันที */
  advice: string;
}

export async function reportNotFound(
  pool: DbPool,
  input: {
    productId: number;
    locationId: number;
    userId: number;
    saleId?: number | null;
    note?: string;
  }
): Promise<NotFoundResponse> {
  return pool.transaction(async (tx) => {
    const balRes = await tx.query<Record<string, unknown>>(
      `SELECT qty_on_hand FROM stock_balance
       WHERE product_id=$1 AND location_id=$2`,
      [input.productId, input.locationId]
    );
    const expectedQty = num(balRes.rows[0]?.qty_on_hand);

    const reportRes = await tx.query<Record<string, unknown>>(
      `INSERT INTO not_found_report
         (product_id, location_id, expected_qty, user_id, sale_id, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [
        input.productId,
        input.locationId,
        expectedQty,
        input.userId,
        input.saleId ?? null,
        input.note ?? null,
      ]
    );
    const reportId = num(reportRes.rows[0].id);

    // ---- ช่องอื่นที่ยังมีของ ---------------------------------------
    const altRes = await tx.query<Record<string, unknown>>(
      `SELECT location_id, location_code, location_label, location_kind,
              zone_code, zone_name, qty_on_hand, qty_reserved, qty_available,
              walk_order, pick_priority, is_pickable, last_counted_at
       FROM v_stock_detail
       WHERE product_id = $1 AND location_id <> $2 AND qty_on_hand > 0
       ORDER BY pick_priority, walk_order`,
      [input.productId, input.locationId]
    );
    const alternatives: StockAtLocation[] = altRes.rows.map((r) => ({
      locationId: num(r.location_id),
      locationCode: str(r.location_code),
      locationLabel: str(r.location_label),
      locationKind: str(r.location_kind) as StockAtLocation["locationKind"],
      zoneCode: str(r.zone_code),
      zoneName: str(r.zone_name),
      qtyOnHand: num(r.qty_on_hand),
      qtyReserved: num(r.qty_reserved),
      qtyAvailable: num(r.qty_available),
      walkOrder: num(r.walk_order),
      pickPriority: num(r.pick_priority),
      isPickable: bool(r.is_pickable),
      lastCountedAt: r.last_counted_at ? String(r.last_counted_at) : null,
    }));

    // ---- ตัวโชว์ของสินค้านี้ ---------------------------------------
    const duRes = await tx.query<Record<string, unknown>>(
      `SELECT d.id, d.product_id, d.location_id, d.spot_label, d.status,
              d.condition, d.is_sellable, d.display_price, d.photo_url,
              d.installed_at, d.checked_at, d.note,
              l.code AS location_code, l.label_th AS location_label
       FROM display_unit d
       JOIN location l ON l.id = d.location_id
       WHERE d.product_id = $1 AND d.status IN ('ON_DISPLAY','RESERVED')`,
      [input.productId]
    );
    const displayUnits: DisplayUnitInfo[] = duRes.rows.map(mapDisplayUnit);

    // ---- เปิดรอบนับเฉพาะจุดให้อัตโนมัติ -----------------------------
    const docNo = await nextDocNo(tx, "COUNT");
    const sessRes = await tx.query<Record<string, unknown>>(
      `INSERT INTO count_session (doc_no, kind, status, is_blind, user_id, note)
       VALUES ($1,'SPOT','COUNTING',true,$2,$3)
       RETURNING id`,
      [docNo, input.userId, `เปิดอัตโนมัติจากการแจ้งหาไม่เจอ #${reportId}`]
    );
    const countSessionId = num(sessRes.rows[0].id);

    await tx.query(
      `INSERT INTO count_line (session_id, location_id, product_id, system_qty)
       SELECT $1, $2, $3, COALESCE(
         (SELECT qty_on_hand FROM stock_balance
          WHERE product_id=$3 AND location_id=$2), 0)`,
      [countSessionId, input.locationId, input.productId]
    );

    await tx.query(
      "UPDATE not_found_report SET count_session_id=$2 WHERE id=$1",
      [reportId, countSessionId]
    );

    // ---- ข้อความแนะนำที่พนักงานจะเห็นทันที ---------------------------
    const advice = buildAdvice(expectedQty, alternatives, displayUnits);

    return { reportId, alternatives, displayUnits, countSessionId, advice };
  });
}

function mapDisplayUnit(r: Record<string, unknown>): DisplayUnitInfo {
  return {
    id: num(r.id),
    productId: num(r.product_id),
    locationId: num(r.location_id),
    locationCode: str(r.location_code),
    locationLabel: str(r.location_label),
    spotLabel: str(r.spot_label),
    status: str(r.status) as DisplayUnitInfo["status"],
    condition: str(r.condition) as DisplayUnitInfo["condition"],
    isSellable: bool(r.is_sellable),
    displayPrice: r.display_price === null ? null : num(r.display_price),
    photoUrl: r.photo_url ? str(r.photo_url) : null,
    installedAt: r.installed_at ? String(r.installed_at) : null,
    checkedAt: r.checked_at ? String(r.checked_at) : null,
    note: r.note ? str(r.note) : null,
  };
}

function buildAdvice(
  expectedQty: number,
  alternatives: StockAtLocation[],
  displayUnits: DisplayUnitInfo[]
): string {
  const parts: string[] = [];

  const pickable = alternatives.filter(
    (a) => a.isPickable && a.qtyAvailable > 0
  );
  if (pickable.length > 0) {
    const list = pickable
      .map((a) => `${a.locationCode} (${a.locationLabel}) มี ${a.qtyAvailable}`)
      .join(" • ");
    parts.push(`ลองดูช่องนี้ต่อ: ${list}`);
  }

  if (displayUnits.length > 0) {
    const spots = displayUnits.map((d) => d.spotLabel).join(", ");
    parts.push(
      `สินค้าตัวนี้มีตัวโชว์แขวนอยู่ที่ ${spots} — ` +
        `ถ้าลูกค้าชี้ตัวที่แขวนอยู่ นั่นคือตัวโชว์ ไม่ใช่ของใหม่ในกล่อง`
    );
  }

  const damaged = alternatives.filter((a) => a.locationKind === "DAMAGED");
  if (damaged.length > 0) {
    parts.push(
      `มี ${damaged[0].qtyOnHand} ชิ้นอยู่ในช่องของเสีย (${damaged[0].locationCode}) ขายไม่ได้`
    );
  }

  if (parts.length === 0) {
    parts.push(
      expectedQty > 0
        ? `ระบบบอกว่ามี ${expectedQty} แต่ไม่มีที่อื่นแล้ว — ` +
            `แจ้งลูกค้าว่าของหมด แล้วนับช่องนี้ยืนยันอีกครั้ง`
        : "ระบบก็ไม่มียอดในช่องนี้เหมือนกัน — สั่งของเพิ่มได้เลย"
    );
  }

  parts.push("ระบบเปิดงานนับช่องนี้ให้แล้ว กรุณานับยืนยันเมื่อว่าง");
  return parts.join("\n");
}

/** ปิดใบแจ้ง พร้อมระบุว่าสรุปแล้วเกิดจากอะไร */
export async function resolveNotFound(
  pool: DbPool,
  input: {
    reportId: number;
    userId: number;
    resolution:
      | "FOUND_SAME_BIN"
      | "FOUND_OTHER_BIN"
      | "WAS_DISPLAY"
      | "ADJUSTED"
      | "DAMAGED"
      | "UNRESOLVED";
    foundLocationId?: number | null;
    note?: string;
  }
): Promise<void> {
  await pool.query(
    `UPDATE not_found_report
     SET status='RESOLVED', resolution=$2, found_location_id=$3,
         resolved_at=now(), resolved_by=$4,
         note = COALESCE(note,'') || CASE WHEN $5::text IS NULL THEN '' ELSE ' | ' || $5 END
     WHERE id=$1`,
    [
      input.reportId,
      input.resolution,
      input.foundLocationId ?? null,
      input.userId,
      input.note ?? null,
    ]
  );
}

export async function listOpenNotFound(
  db: Db,
  limit = 50
): Promise<
  {
    id: number;
    reportedAt: string;
    productId: number;
    sku: string;
    productName: string;
    locationCode: string;
    locationLabel: string;
    expectedQty: number;
    reportedBy: string;
  }[]
> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT nf.id, nf.reported_at, nf.product_id, nf.expected_qty,
            p.sku, p.name_th AS product_name,
            l.code AS location_code, l.label_th AS location_label,
            COALESCE(u.name,'-') AS reported_by
     FROM not_found_report nf
     JOIN product  p ON p.id = nf.product_id
     JOIN location l ON l.id = nf.location_id
     LEFT JOIN app_user u ON u.id = nf.user_id
     WHERE nf.status='OPEN'
     ORDER BY nf.reported_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => ({
    id: num(r.id),
    reportedAt: String(r.reported_at),
    productId: num(r.product_id),
    sku: str(r.sku),
    productName: str(r.product_name),
    locationCode: str(r.location_code),
    locationLabel: str(r.location_label),
    expectedQty: num(r.expected_qty),
    reportedBy: str(r.reported_by),
  }));
}

/**
 * สถิติปัญหา - ใช้หาต้นเหตุจริง ไม่ใช่แก้ทีละครั้ง
 *
 * ถ้าช่อง S-B2-1 ขึ้นบ่อยที่สุด แปลว่าช่องนั้นมีอะไรผิดปกติ:
 * ป้ายหลุด, ของสองตัวหน้าตาเหมือนกันวางติดกัน, ชั้นสูงเกินไปมองไม่เห็น
 * ตัวเลขนี้ทำให้แก้ที่ต้นเหตุได้ แทนที่จะบ่นว่าพนักงานไม่ระวัง
 */
export async function getNotFoundStats(
  db: Db,
  days = 90
): Promise<{
  byLocation: { locationCode: string; locationLabel: string; count: number }[];
  byProduct: { sku: string; productName: string; count: number }[];
  byResolution: { resolution: string; count: number }[];
  total: number;
}> {
  const since = `${days} days`;

  const [byLoc, byProd, byRes, total] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT l.code, l.label_th, COUNT(*) AS n
       FROM not_found_report nf JOIN location l ON l.id = nf.location_id
       WHERE nf.reported_at > now() - $1::interval
       GROUP BY l.code, l.label_th ORDER BY n DESC LIMIT 10`,
      [since]
    ),
    db.query<Record<string, unknown>>(
      `SELECT p.sku, p.name_th, COUNT(*) AS n
       FROM not_found_report nf JOIN product p ON p.id = nf.product_id
       WHERE nf.reported_at > now() - $1::interval
       GROUP BY p.sku, p.name_th ORDER BY n DESC LIMIT 10`,
      [since]
    ),
    db.query<Record<string, unknown>>(
      `SELECT COALESCE(resolution,'ยังไม่ปิดเรื่อง') AS r, COUNT(*) AS n
       FROM not_found_report
       WHERE reported_at > now() - $1::interval
       GROUP BY resolution ORDER BY n DESC`,
      [since]
    ),
    db.query<Record<string, unknown>>(
      `SELECT COUNT(*) AS n FROM not_found_report
       WHERE reported_at > now() - $1::interval`,
      [since]
    ),
  ]);

  return {
    byLocation: byLoc.rows.map((r) => ({
      locationCode: str(r.code),
      locationLabel: str(r.label_th),
      count: num(r.n),
    })),
    byProduct: byProd.rows.map((r) => ({
      sku: str(r.sku),
      productName: str(r.name_th),
      count: num(r.n),
    })),
    byResolution: byRes.rows.map((r) => ({
      resolution: str(r.r),
      count: num(r.n),
    })),
    total: num(total.rows[0]?.n),
  };
}
