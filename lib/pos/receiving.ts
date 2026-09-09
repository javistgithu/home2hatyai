/**
 * รับของเข้า
 *
 * กฎเดียวที่ห้ามยืดหยุ่น: ทุกบรรทัดต้องระบุช่องเก็บ
 *
 * เหตุผล: จุดที่ตำแหน่งของหายไปจากระบบมากที่สุดคือตอนรับของ
 * ถ้าอนุญาตให้รับเข้าโดยไม่ระบุช่อง ("เดี๋ยวค่อยเก็บ") ของจะเข้าระบบ
 * แต่ไม่มีใครรู้ว่าอยู่ไหน แล้ววงจร "ระบบบอกมี แต่หาไม่เจอ" ก็เริ่มใหม่
 *
 * ถ้ายังไม่รู้จะเก็บที่ไหนจริงๆ ให้รับเข้าช่อง F-TMP (จุดพักของ)
 * ซึ่งจะขึ้นเตือนทุกวันจนกว่าจะย้ายเข้าชั้นจริง
 */

import type { DbPool } from "../db";
import { num, str } from "../db";
import { round2, round3, sumMoney } from "./money";
import { recordMovement } from "./stock";
import { nextDocNo } from "./docno";

export interface ReceiveLineInput {
  productId: number;
  qty: number;
  unitCost: number;
  locationId: number;
}

export interface ReceiveResult {
  receiptId: number;
  docNo: string;
  totalCost: number;
  /** ใบจัดเก็บ: เอาไปวางช่องไหนบ้าง เรียงตามลำดับการเดิน */
  putaway: {
    productId: number;
    sku: string;
    productName: string;
    qty: number;
    unit: string;
    locationCode: string;
    locationLabel: string;
  }[];
  warnings: string[];
}

export async function receiveGoods(
  pool: DbPool,
  input: {
    supplierId?: number | null;
    supplierDoc?: string | null;
    lines: ReceiveLineInput[];
    userId: number;
    note?: string;
  }
): Promise<ReceiveResult> {
  if (input.lines.length === 0) throw new Error("ไม่มีรายการสินค้าที่รับเข้า");

  return pool.transaction(async (tx) => {
    const warnings: string[] = [];
    const docNo = await nextDocNo(tx, "RECEIPT");
    const totalCost = sumMoney(
      input.lines.map((l) => round2(l.unitCost * l.qty))
    );

    const recRes = await tx.query<Record<string, unknown>>(
      `INSERT INTO goods_receipt
         (doc_no, supplier_id, supplier_doc, total_cost, user_id, note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        docNo,
        input.supplierId ?? null,
        input.supplierDoc ?? null,
        totalCost,
        input.userId,
        input.note ?? null,
      ]
    );
    const receiptId = num(recRes.rows[0].id);

    const putaway: ReceiveResult["putaway"] = [];

    for (const line of input.lines) {
      const qty = round3(line.qty);
      if (qty <= 0) throw new Error("จำนวนที่รับเข้าต้องมากกว่า 0");

      const locRes = await tx.query<Record<string, unknown>>(
        `SELECT l.code, l.label_th, l.kind, l.walk_order
         FROM location l WHERE l.id = $1 AND l.is_active`,
        [line.locationId]
      );
      if (!locRes.rows[0]) throw new Error("ช่องเก็บที่ระบุไม่มีอยู่จริง");
      if (str(locRes.rows[0].kind) === "DISPLAY_SPOT") {
        throw new Error(
          "รับของเข้าจุดโชว์โดยตรงไม่ได้ — รับเข้าช่องเก็บก่อน แล้วค่อยยกไปตั้งโชว์"
        );
      }
      if (str(locRes.rows[0].code) === "F-TMP") {
        warnings.push(
          "มีของรับเข้าจุดพักของ (F-TMP) — ต้องย้ายเข้าชั้นจริงโดยเร็ว " +
            "ไม่งั้นจะกลับไปเป็นปัญหาหาของไม่เจอ"
        );
      }

      const prodRes = await tx.query<Record<string, unknown>>(
        "SELECT sku, name_th, unit, cost_avg FROM product WHERE id=$1 FOR UPDATE",
        [line.productId]
      );
      if (!prodRes.rows[0]) throw new Error(`ไม่พบสินค้ารหัส ${line.productId}`);

      // ---- ต้นทุนเฉลี่ยถ่วงน้ำหนัก -------------------------------------
      // ต้องคิดจากยอดคงเหลือทั้งร้าน ไม่ใช่เฉพาะช่องที่รับเข้า
      const balRes = await tx.query<Record<string, unknown>>(
        `SELECT COALESCE(SUM(qty_on_hand),0) AS total
         FROM stock_balance WHERE product_id=$1`,
        [line.productId]
      );
      const oldQty = Math.max(0, num(balRes.rows[0]?.total));
      const oldCost = num(prodRes.rows[0].cost_avg);
      const newCost =
        oldQty + qty > 0
          ? (oldQty * oldCost + qty * line.unitCost) / (oldQty + qty)
          : line.unitCost;

      await tx.query(
        "UPDATE product SET cost_avg=$2, updated_at=now() WHERE id=$1",
        [line.productId, Number(newCost.toFixed(4))]
      );

      await tx.query(
        `INSERT INTO goods_receipt_line
           (receipt_id, product_id, qty, unit_cost, location_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [receiptId, line.productId, qty, round2(line.unitCost), line.locationId]
      );

      await recordMovement(tx, {
        productId: line.productId,
        locationId: line.locationId,
        qtyDelta: qty,
        reason: "RECEIVE",
        refType: "RECEIPT",
        refId: receiptId,
        userId: input.userId,
        note: `รับเข้าใบ ${docNo}`,
      });

      putaway.push({
        productId: line.productId,
        sku: str(prodRes.rows[0].sku),
        productName: str(prodRes.rows[0].name_th),
        qty,
        unit: str(prodRes.rows[0].unit),
        locationCode: str(locRes.rows[0].code),
        locationLabel: str(locRes.rows[0].label_th),
      });
    }

    putaway.sort((a, b) => a.locationCode.localeCompare(b.locationCode));

    return { receiptId, docNo, totalCost, putaway, warnings };
  });
}

/** ของที่ค้างอยู่จุดพักของ ยังไม่ได้เก็บเข้าชั้น */
export async function getUnputawayItems(
  pool: DbPool
): Promise<
  {
    productId: number;
    sku: string;
    productName: string;
    unit: string;
    qty: number;
    since: string | null;
  }[]
> {
  const res = await pool.query<Record<string, unknown>>(
    `SELECT sb.product_id, p.sku, p.name_th, p.unit, sb.qty_on_hand,
            sb.last_movement_at
     FROM stock_balance sb
     JOIN product  p ON p.id = sb.product_id
     JOIN location l ON l.id = sb.location_id
     WHERE l.code = 'F-TMP' AND sb.qty_on_hand > 0
     ORDER BY sb.last_movement_at`
  );
  return res.rows.map((r) => ({
    productId: num(r.product_id),
    sku: str(r.sku),
    productName: str(r.name_th),
    unit: str(r.unit),
    qty: num(r.qty_on_hand),
    since: r.last_movement_at ? String(r.last_movement_at) : null,
  }));
}
