/**
 * ตัวโชว์สินค้า (โคมไฟ)
 *
 * โจทย์: โคมไฟลูกค้าต้องเห็นของจริงก่อนซื้อ ร้านจึงต้องแขวนโชว์ไว้
 * แต่ตัวที่แขวนโชว์ "ไม่ใช่ของใหม่ในกล่อง" ที่จะขายให้ลูกค้าได้
 *
 * นี่คือสาเหตุที่ระบบเดิมบอกว่ามีของแต่หยิบไม่ได้:
 * ของ 1 ชิ้นที่ระบบนับไว้ คือตัวที่แขวนอยู่บนเพดานนั่นเอง
 *
 * วิธีแก้ในระบบนี้:
 *   - ตัวโชว์อยู่คนละ location (kind = DISPLAY_SPOT) ซึ่งตั้ง is_pickable = false
 *     ระบบจึงไม่มีทางเลือกตัวโชว์ไปตัดขายอัตโนมัติ
 *   - หน้าจอแยกโชว์ 2 บรรทัดเสมอ: "พร้อมขาย X" กับ "ตัวโชว์ Y ตัว อยู่ที่ ..."
 *   - ถ้าจะขายตัวโชว์ ต้องกดเลือกอย่างจงใจ และระบบจะเสนอราคาตัวโชว์ให้
 */

import type { Db, DbPool } from "../db";
import { num, str, bool } from "../db";
import { recordMovement } from "./stock";
import type { DisplayUnitInfo } from "./types";

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

const DISPLAY_SELECT = `
  SELECT d.id, d.product_id, d.location_id, d.spot_label, d.status,
         d.condition, d.is_sellable, d.display_price, d.photo_url,
         d.installed_at, d.checked_at, d.note,
         l.code AS location_code, l.label_th AS location_label
  FROM display_unit d
  JOIN location l ON l.id = d.location_id
`;

/**
 * ยกสินค้า 1 ชิ้นจากช่องเก็บไปตั้งโชว์
 *
 * ตัดยอดจากช่องเก็บ + เพิ่มยอดที่จุดโชว์ ยอดรวมทั้งร้านไม่เปลี่ยน
 * แต่ยอด "พร้อมขาย" ลดลง 1 ซึ่งถูกต้อง เพราะตัวนั้นขายเป็นของใหม่ไม่ได้แล้ว
 */
export async function setUpDisplay(
  pool: DbPool,
  input: {
    productId: number;
    fromLocationId: number;
    displayLocationId: number;
    spotLabel: string;
    userId: number;
    condition?: DisplayUnitInfo["condition"];
    displayPrice?: number | null;
    isSellable?: boolean;
    photoUrl?: string | null;
    note?: string;
  }
): Promise<DisplayUnitInfo> {
  return pool.transaction(async (tx) => {
    const locRes = await tx.query<Record<string, unknown>>(
      "SELECT kind, code, label_th FROM location WHERE id = $1",
      [input.displayLocationId]
    );
    if (!locRes.rows[0]) throw new Error("ไม่พบจุดโชว์ที่เลือก");
    if (str(locRes.rows[0].kind) !== "DISPLAY_SPOT") {
      throw new Error(
        `${str(locRes.rows[0].code)} ไม่ใช่จุดโชว์ — ตัวโชว์ต้องอยู่ที่จุดโชว์เท่านั้น`
      );
    }

    // ยกออกจากช่องเก็บ
    await recordMovement(tx, {
      productId: input.productId,
      locationId: input.fromLocationId,
      qtyDelta: -1,
      reason: "DISPLAY_OUT",
      refType: "DISPLAY",
      userId: input.userId,
      note: `ยกไปตั้งโชว์ที่ ${input.spotLabel}`,
    });
    // เข้าจุดโชว์
    await recordMovement(tx, {
      productId: input.productId,
      locationId: input.displayLocationId,
      qtyDelta: 1,
      reason: "DISPLAY_IN",
      refType: "DISPLAY",
      userId: input.userId,
      note: `ตั้งโชว์ที่ ${input.spotLabel}`,
    });

    const res = await tx.query<Record<string, unknown>>(
      `INSERT INTO display_unit
         (product_id, location_id, spot_label, status, condition,
          is_sellable, display_price, photo_url, note)
       VALUES ($1,$2,$3,'ON_DISPLAY',$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        input.productId,
        input.displayLocationId,
        input.spotLabel,
        input.condition ?? "NEW",
        input.isSellable ?? true,
        input.displayPrice ?? null,
        input.photoUrl ?? null,
        input.note ?? null,
      ]
    );

    const created = await tx.query<Record<string, unknown>>(
      DISPLAY_SELECT + " WHERE d.id = $1",
      [num(res.rows[0].id)]
    );
    return mapDisplayUnit(created.rows[0]);
  });
}

/** ย้ายตัวโชว์ไปจุดอื่น (จัดโชว์รูมใหม่) */
export async function moveDisplayUnit(
  pool: DbPool,
  input: {
    displayUnitId: number;
    toLocationId: number;
    spotLabel: string;
    userId: number;
  }
): Promise<DisplayUnitInfo> {
  return pool.transaction(async (tx) => {
    const cur = await tx.query<Record<string, unknown>>(
      "SELECT product_id, location_id, status FROM display_unit WHERE id=$1 FOR UPDATE",
      [input.displayUnitId]
    );
    if (!cur.rows[0]) throw new Error("ไม่พบตัวโชว์นี้");
    if (str(cur.rows[0].status) !== "ON_DISPLAY") {
      throw new Error("ตัวโชว์นี้ไม่ได้แขวนโชว์อยู่ ย้ายไม่ได้");
    }
    const productId = num(cur.rows[0].product_id);
    const fromId = num(cur.rows[0].location_id);

    if (fromId !== input.toLocationId) {
      await recordMovement(tx, {
        productId,
        locationId: fromId,
        qtyDelta: -1,
        reason: "TRANSFER_OUT",
        refType: "DISPLAY",
        refId: input.displayUnitId,
        userId: input.userId,
        note: "ย้ายจุดโชว์",
      });
      await recordMovement(tx, {
        productId,
        locationId: input.toLocationId,
        qtyDelta: 1,
        reason: "TRANSFER_IN",
        refType: "DISPLAY",
        refId: input.displayUnitId,
        userId: input.userId,
        note: `ย้ายมาโชว์ที่ ${input.spotLabel}`,
      });
    }

    await tx.query(
      "UPDATE display_unit SET location_id=$2, spot_label=$3 WHERE id=$1",
      [input.displayUnitId, input.toLocationId, input.spotLabel]
    );
    const res = await tx.query<Record<string, unknown>>(
      DISPLAY_SELECT + " WHERE d.id = $1",
      [input.displayUnitId]
    );
    return mapDisplayUnit(res.rows[0]);
  });
}

/** เก็บตัวโชว์กลับเข้ากล่อง/ชั้น (เลิกโชว์รุ่นนี้) */
export async function returnDisplayToStock(
  pool: DbPool,
  input: {
    displayUnitId: number;
    toLocationId: number;
    userId: number;
    condition?: DisplayUnitInfo["condition"];
    note?: string;
  }
): Promise<void> {
  await pool.transaction(async (tx) => {
    const cur = await tx.query<Record<string, unknown>>(
      "SELECT product_id, location_id, status FROM display_unit WHERE id=$1 FOR UPDATE",
      [input.displayUnitId]
    );
    if (!cur.rows[0]) throw new Error("ไม่พบตัวโชว์นี้");
    if (str(cur.rows[0].status) === "SOLD") {
      throw new Error("ตัวโชว์นี้ขายไปแล้ว");
    }

    await recordMovement(tx, {
      productId: num(cur.rows[0].product_id),
      locationId: num(cur.rows[0].location_id),
      qtyDelta: -1,
      reason: "DISPLAY_OUT",
      refType: "DISPLAY",
      refId: input.displayUnitId,
      userId: input.userId,
      note: "เก็บตัวโชว์กลับเข้าสต๊อก",
    });
    await recordMovement(tx, {
      productId: num(cur.rows[0].product_id),
      locationId: input.toLocationId,
      qtyDelta: 1,
      reason: "DISPLAY_IN",
      refType: "DISPLAY",
      refId: input.displayUnitId,
      userId: input.userId,
      note: input.note ?? "เก็บตัวโชว์กลับเข้าสต๊อก",
    });

    await tx.query(
      `UPDATE display_unit
       SET status='RETURNED_TO_STOCK', location_id=$2, condition=COALESCE($3, condition)
       WHERE id=$1`,
      [input.displayUnitId, input.toLocationId, input.condition ?? null]
    );
  });
}

/** ตรวจสภาพตัวโชว์ตามรอบ (ฝุ่นจับ หลอดขาด ฯลฯ) */
export async function markDisplayChecked(
  pool: DbPool,
  input: {
    displayUnitId: number;
    condition: DisplayUnitInfo["condition"];
    userId: number;
    note?: string;
  }
): Promise<void> {
  await pool.query(
    `UPDATE display_unit
     SET checked_at=now(), condition=$2,
         is_sellable = CASE WHEN $2 = 'DAMAGED' THEN false ELSE is_sellable END,
         note = COALESCE($3, note)
     WHERE id=$1`,
    [input.displayUnitId, input.condition, input.note ?? null]
  );
  await pool.query(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, detail)
     VALUES ($1,'DISPLAY_CHECKED','display_unit',$2,$3)`,
    [input.userId, input.displayUnitId, JSON.stringify({ condition: input.condition })]
  );
}

export async function listDisplayUnits(
  db: Db,
  opts: { productId?: number; locationId?: number; activeOnly?: boolean } = {}
): Promise<DisplayUnitInfo[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.activeOnly !== false) {
    where.push("d.status IN ('ON_DISPLAY','RESERVED')");
  }
  if (opts.productId) {
    params.push(opts.productId);
    where.push(`d.product_id = $${params.length}`);
  }
  if (opts.locationId) {
    params.push(opts.locationId);
    where.push(`d.location_id = $${params.length}`);
  }
  const res = await db.query<Record<string, unknown>>(
    DISPLAY_SELECT +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY l.walk_order, d.spot_label",
    params
  );
  return res.rows.map(mapDisplayUnit);
}

/**
 * โคมไฟที่ยังไม่มีตัวโชว์
 *
 * ตอบโจทย์ข้อกำหนด "อุปกรณ์ที่เป็นโคมไฟต้องมีตัวโชว์"
 * รายงานนี้คือเช็คลิสต์ที่บอกว่ารุ่นไหนยังไม่ได้แขวนโชว์
 * ถ้าไม่มีรายงานนี้ ของใหม่เข้ามาแล้วไม่มีใครแขวน ลูกค้าก็ไม่รู้ว่าร้านมีขาย
 */
export async function getLampsWithoutDisplay(
  db: Db
): Promise<
  {
    productId: number;
    sku: string;
    productName: string;
    qtySellable: number;
    brand: string | null;
  }[]
> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT p.id, p.sku, p.name_th, p.brand,
            COALESCE(s.qty_sellable, 0) AS qty_sellable
     FROM product p
     LEFT JOIN v_product_stock_summary s ON s.product_id = p.id
     WHERE p.is_lamp AND p.is_active
       AND NOT EXISTS (
         SELECT 1 FROM display_unit d
         WHERE d.product_id = p.id AND d.status IN ('ON_DISPLAY','RESERVED')
       )
     ORDER BY COALESCE(s.qty_sellable,0) DESC, p.name_th`
  );
  return res.rows.map((r) => ({
    productId: num(r.id),
    sku: str(r.sku),
    productName: str(r.name_th),
    qtySellable: num(r.qty_sellable),
    brand: r.brand ? str(r.brand) : null,
  }));
}

/** ผังโชว์รูม - ตัวโชว์แต่ละจุดมีอะไรบ้าง ใช้เดินตรวจและพาลูกค้าดู */
export async function getDisplayMap(
  db: Db
): Promise<
  {
    locationId: number;
    locationCode: string;
    locationLabel: string;
    units: {
      id: number;
      productId: number;
      sku: string;
      productName: string;
      spotLabel: string;
      condition: string;
      isSellable: boolean;
      displayPrice: number | null;
      qtySellable: number;
      checkedAt: string | null;
    }[];
  }[]
> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT l.id AS location_id, l.code AS location_code,
            l.label_th AS location_label, l.walk_order,
            d.id AS unit_id, d.product_id, d.spot_label, d.condition,
            d.is_sellable, d.display_price, d.checked_at,
            p.sku, p.name_th,
            COALESCE(s.qty_sellable, 0) AS qty_sellable
     FROM location l
     LEFT JOIN display_unit d
            ON d.location_id = l.id AND d.status IN ('ON_DISPLAY','RESERVED')
     LEFT JOIN product p ON p.id = d.product_id
     LEFT JOIN v_product_stock_summary s ON s.product_id = d.product_id
     WHERE l.kind = 'DISPLAY_SPOT' AND l.is_active
     ORDER BY l.walk_order, d.spot_label`
  );

  const map = new Map<number, ReturnType<typeof emptySpot>>();
  function emptySpot(r: Record<string, unknown>) {
    return {
      locationId: num(r.location_id),
      locationCode: str(r.location_code),
      locationLabel: str(r.location_label),
      units: [] as {
        id: number;
        productId: number;
        sku: string;
        productName: string;
        spotLabel: string;
        condition: string;
        isSellable: boolean;
        displayPrice: number | null;
        qtySellable: number;
        checkedAt: string | null;
      }[],
    };
  }

  for (const r of res.rows) {
    const id = num(r.location_id);
    if (!map.has(id)) map.set(id, emptySpot(r));
    if (r.unit_id) {
      map.get(id)!.units.push({
        id: num(r.unit_id),
        productId: num(r.product_id),
        sku: str(r.sku),
        productName: str(r.name_th),
        spotLabel: str(r.spot_label),
        condition: str(r.condition),
        isSellable: bool(r.is_sellable),
        displayPrice: r.display_price === null ? null : num(r.display_price),
        qtySellable: num(r.qty_sellable),
        checkedAt: r.checked_at ? String(r.checked_at) : null,
      });
    }
  }
  return [...map.values()];
}
