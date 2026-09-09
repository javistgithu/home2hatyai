/**
 * การขาย
 *
 * ทุกอย่างในไฟล์นี้ทำงานในทรานแซกชันเดียว: ตัดสต๊อก บันทึกบิล รับเงิน
 * ถ้าขั้นตอนไหนพัง ต้องย้อนกลับทั้งหมด ห้ามมีสภาพ "ตัดสต๊อกแล้วแต่บิลไม่ขึ้น"
 * เพราะนั่นคือต้นเหตุที่ทำให้ยอดในระบบไม่ตรงกับของจริง
 */

import type { Db, DbPool } from "../db";
import { num, str, bool } from "../db";
import { extractVat, lineTotal, round2, round3, sumMoney } from "./money";
import { checkPriceGuard, getPriceTiers, resolvePrice, TIER_LIST_PRICE } from "./pricing";
import { allocateForPick, recordMovement } from "./stock";
import { nextDocNo } from "./docno";
import { getNumberSetting, getSetting } from "./settings";
import type {
  SaleInput,
  SaleResult,
  SaleLineResult,
  SalePickResult,
} from "./types";

interface ProductForSale {
  id: number;
  sku: string;
  nameTh: string;
  unit: string;
  costAvg: number;
  isLamp: boolean;
}

async function loadProducts(
  tx: Db,
  ids: number[]
): Promise<Map<number, ProductForSale>> {
  if (ids.length === 0) return new Map();
  const res = await tx.query<Record<string, unknown>>(
    `SELECT id, sku, name_th, unit, cost_avg, is_lamp
     FROM product WHERE id = ANY($1::bigint[])`,
    [ids]
  );
  return new Map(
    res.rows.map((r) => [
      num(r.id),
      {
        id: num(r.id),
        sku: str(r.sku),
        nameTh: str(r.name_th),
        unit: str(r.unit),
        costAvg: num(r.cost_avg),
        isLamp: bool(r.is_lamp),
      },
    ])
  );
}

/**
 * บันทึกการขาย 1 บิล
 *
 * ลำดับสำคัญ: จัดสรรของ (ล็อกแถว) -> คิดเงิน -> เขียนบิล -> ตัดสต๊อก -> รับเงิน
 * จัดสรรก่อนเสมอ เพราะเป็นขั้นตอนที่มีโอกาสชนกับบิลอื่นมากที่สุด
 */
export async function createSale(
  pool: DbPool,
  input: SaleInput
): Promise<SaleResult> {
  if (input.lines.length === 0) throw new Error("บิลนี้ไม่มีรายการสินค้า");

  return pool.transaction(async (tx) => {
    const tiers = await getPriceTiers(tx);
    const tierMap = new Map(tiers.map((t) => [t.level, t]));
    const products = await loadProducts(
      tx,
      input.lines.map((l) => l.productId)
    );

    const vatRate = await getNumberSetting(tx, "vat_rate", 7);
    const priceIncludesVat =
      (await getSetting(tx, "price_includes_vat", "true")) === "true";
    const oversellPolicy = (await getSetting(tx, "oversell_policy", "allow")) as
      | "allow"
      | "block";

    const warnings: string[] = [];
    const blockers: string[] = [];
    const oversoldLocations: SaleResult["oversoldLocations"] = [];
    const lineResults: SaleLineResult[] = [];

    // ---------------------------------------------------------------
    // 1. คิดราคาและจัดสรรของทีละบรรทัด
    // ---------------------------------------------------------------
    interface PreparedLine {
      lineNo: number;
      product: ProductForSale;
      qty: number;
      tierLevel: number;
      unitPrice: number;
      originalPrice: number | null;
      listPrice: number | null;
      discount: number;
      total: number;
      isOverridden: boolean;
      isDisplayUnit: boolean;
      displayUnitId: number | null;
      picks: (SalePickResult & { reason: "SALE" | "OVERSELL" })[];
    }
    const prepared: PreparedLine[] = [];

    let lineNo = 0;
    for (const line of input.lines) {
      lineNo++;
      const product = products.get(line.productId);
      if (!product) throw new Error(`ไม่พบสินค้ารหัส ${line.productId}`);

      const qty = round3(line.qty);
      if (qty <= 0) throw new Error(`${product.nameTh}: จำนวนต้องมากกว่า 0`);

      const wantTier = line.tierLevel ?? input.tierLevel;
      const resolved = await resolvePrice(tx, product.id, wantTier);
      if (resolved.fallbackUsed) {
        warnings.push(
          `${product.nameTh}: ยังไม่ได้ตั้ง${tierMap.get(wantTier)?.nameTh ?? "ราคาระดับนี้"} ` +
            `ระบบใช้${tierMap.get(resolved.tierLevel)?.nameTh ?? "ราคาสำรอง"}แทน`
        );
      }

      let unitPrice = resolved.price;
      let isOverridden = false;
      let originalPrice: number | null = null;
      const picks: PreparedLine["picks"] = [];
      let isDisplayUnit = false;
      let displayUnitId: number | null = null;

      // ---- ขายตัวโชว์ -------------------------------------------------
      if (line.displayUnitId) {
        const du = await tx.query<Record<string, unknown>>(
          `SELECT d.id, d.product_id, d.location_id, d.status, d.is_sellable,
                  d.display_price, d.spot_label,
                  l.code AS location_code, l.label_th AS location_label
           FROM display_unit d
           JOIN location l ON l.id = d.location_id
           WHERE d.id = $1
           FOR UPDATE OF d`,
          [line.displayUnitId]
        );
        const row = du.rows[0];
        if (!row) throw new Error("ไม่พบตัวโชว์ที่เลือก");
        if (num(row.product_id) !== product.id) {
          throw new Error("ตัวโชว์ที่เลือกไม่ตรงกับสินค้าในบรรทัดนี้");
        }
        if (str(row.status) !== "ON_DISPLAY" && str(row.status) !== "RESERVED") {
          throw new Error(
            `ตัวโชว์ตัวนี้สถานะ ${str(row.status)} ขายไม่ได้`
          );
        }
        if (!bool(row.is_sellable)) {
          throw new Error("ตัวโชว์ตัวนี้ตั้งไว้ว่าห้ามขาย");
        }
        if (qty !== 1) throw new Error("ขายตัวโชว์ได้ครั้งละ 1 ตัวเท่านั้น");

        isDisplayUnit = true;
        displayUnitId = num(row.id);
        // ราคาตัวโชว์ถ้าตั้งไว้ให้ใช้ราคานั้น (ปกติลดเพราะมีรอยจับ/ฝุ่น)
        const dp = row.display_price === null ? null : num(row.display_price);
        if (dp !== null) unitPrice = dp;

        picks.push({
          locationId: num(row.location_id),
          locationCode: str(row.location_code),
          locationLabel: `${str(row.location_label)} (${str(row.spot_label)})`,
          qty: 1,
          wasOversell: false,
          reason: "SALE",
        });
      }

      // ---- ราคาที่พนักงานแก้เอง ---------------------------------------
      if (line.unitPrice !== undefined && line.unitPrice !== null) {
        if (round2(line.unitPrice) !== round2(unitPrice)) {
          originalPrice = unitPrice;
          unitPrice = round2(line.unitPrice);
          isOverridden = true;
        }
      }

      const guard = checkPriceGuard({
        price: unitPrice,
        cost: product.costAvg,
        tier: tierMap.get(resolved.tierLevel),
        isOverridden,
        hasApproval: !!input.approvedBy,
      });
      guard.warnings.forEach((w) => warnings.push(`${product.nameTh}: ${w}`));
      guard.blockers.forEach((b) => blockers.push(`${product.nameTh}: ${b}`));

      // ---- จัดสรรของจากช่องเก็บ ---------------------------------------
      if (!isDisplayUnit) {
        if (line.pickFrom && line.pickFrom.length > 0) {
          // พนักงานระบุช่องเอง (เช่น เดินไปหยิบมาแล้ว)
          const sum = round3(
            line.pickFrom.reduce((a, p) => a + p.qty, 0)
          );
          if (sum !== qty) {
            throw new Error(
              `${product.nameTh}: จำนวนที่ระบุตามช่อง (${sum}) ไม่เท่ากับจำนวนขาย (${qty})`
            );
          }
          for (const p of line.pickFrom) {
            const loc = await tx.query<Record<string, unknown>>(
              "SELECT code, label_th FROM location WHERE id = $1",
              [p.locationId]
            );
            picks.push({
              locationId: p.locationId,
              locationCode: str(loc.rows[0]?.code),
              locationLabel: str(loc.rows[0]?.label_th),
              qty: round3(p.qty),
              wasOversell: false,
              reason: "SALE",
            });
          }
        } else {
          const alloc = await allocateForPick(tx, {
            productId: product.id,
            qty,
            oversellPolicy,
          });
          for (const p of alloc.picks) {
            picks.push({
              locationId: p.locationId,
              locationCode: p.locationCode,
              locationLabel: p.locationLabel,
              qty: p.qty,
              wasOversell: p.wasOversell,
              reason: p.wasOversell ? "OVERSELL" : "SALE",
            });
            if (p.wasOversell) {
              oversoldLocations.push({
                locationId: p.locationId,
                locationCode: p.locationCode,
                sku: product.sku,
              });
              warnings.push(
                `${product.nameTh}: ยอดในระบบไม่พอ ${p.qty} ${product.unit} ` +
                  `ที่ ${p.locationCode} — ขายให้แล้ว แต่ต้องไปนับช่องนี้`
              );
            }
          }
        }
      }

      const discount = round2(line.discount ?? 0);
      const total = lineTotal(unitPrice, qty, discount);

      prepared.push({
        lineNo,
        product,
        qty,
        tierLevel: resolved.tierLevel,
        unitPrice,
        originalPrice,
        listPrice: resolved.listPrice,
        discount,
        total,
        isOverridden,
        isDisplayUnit,
        displayUnitId,
        picks,
      });
    }

    if (blockers.length > 0) {
      throw new Error(`ขายไม่ได้:\n- ${blockers.join("\n- ")}`);
    }

    // ---------------------------------------------------------------
    // 2. คิดยอดรวม
    // ---------------------------------------------------------------
    const subtotal = sumMoney(prepared.map((l) => l.total));
    const billDiscount = round2(input.billDiscount ?? 0);
    if (billDiscount > subtotal) {
      throw new Error("ส่วนลดท้ายบิลมากกว่ายอดรวม");
    }
    const total = round2(subtotal - billDiscount);
    const { base: vatBase, vat: vatAmount } = priceIncludesVat
      ? extractVat(total, vatRate)
      : { base: total, vat: round2((total * vatRate) / 100) };

    const paidAmount = sumMoney(input.payments.map((p) => p.amount));
    const isCredit = input.payments.some((p) => p.method === "CREDIT");
    if (!isCredit && paidAmount + 0.005 < total) {
      throw new Error(
        `รับเงินมา ${paidAmount} บาท น้อยกว่ายอดที่ต้องจ่าย ${total} บาท`
      );
    }
    const changeAmount = isCredit ? 0 : round2(Math.max(0, paidAmount - total));
    const costTotal = sumMoney(
      prepared.map((l) => round2(l.product.costAvg * l.qty))
    );

    // ---------------------------------------------------------------
    // 3. เขียนหัวบิล
    // ---------------------------------------------------------------
    const docNo = await nextDocNo(tx, "SALE");
    const saleRes = await tx.query<Record<string, unknown>>(
      `INSERT INTO sale
        (doc_no, customer_id, customer_name, tier_level, subtotal,
         discount_amount, vat_rate, vat_amount, total, price_includes_vat,
         cost_total, status, paid_amount, change_amount, need_tax_invoice,
         user_id, approved_by, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'COMPLETED',$12,$13,$14,$15,$16,$17)
       RETURNING id, sold_at`,
      [
        docNo,
        input.customerId ?? null,
        input.customerName ?? null,
        input.tierLevel,
        subtotal,
        billDiscount,
        vatRate,
        vatAmount,
        total,
        priceIncludesVat,
        costTotal,
        paidAmount,
        changeAmount,
        input.needTaxInvoice ?? false,
        input.userId,
        input.approvedBy ?? null,
        input.note ?? null,
      ]
    );
    const saleId = num(saleRes.rows[0].id);
    const soldAt = String(saleRes.rows[0].sold_at);

    // ---------------------------------------------------------------
    // 4. เขียนรายการ + ตัดสต๊อก
    // ---------------------------------------------------------------
    for (const l of prepared) {
      const lineRes = await tx.query<Record<string, unknown>>(
        `INSERT INTO sale_line
          (sale_id, line_no, product_id, product_name, unit, qty, tier_level,
           unit_price, list_price, unit_cost, discount_amount, line_total,
           price_overridden_by, original_price, is_display_unit, display_unit_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          saleId,
          l.lineNo,
          l.product.id,
          l.product.nameTh,
          l.product.unit,
          l.qty,
          l.tierLevel,
          l.unitPrice,
          l.listPrice,
          l.product.costAvg,
          l.discount,
          l.total,
          l.isOverridden ? (input.approvedBy ?? input.userId) : null,
          l.originalPrice,
          l.isDisplayUnit,
          l.displayUnitId,
        ]
      );
      const saleLineId = num(lineRes.rows[0].id);

      for (const p of l.picks) {
        await tx.query(
          `INSERT INTO sale_line_pick (sale_line_id, location_id, qty, was_oversell)
           VALUES ($1,$2,$3,$4)`,
          [saleLineId, p.locationId, p.qty, p.wasOversell]
        );
        await recordMovement(tx, {
          productId: l.product.id,
          locationId: p.locationId,
          qtyDelta: -p.qty,
          reason: p.reason,
          refType: "SALE",
          refId: saleId,
          userId: input.userId,
          note: p.wasOversell
            ? `ขายเกินยอดในระบบ บิล ${docNo} — ต้องนับช่องนี้ซ้ำ`
            : `บิล ${docNo}`,
        });
      }

      if (l.isDisplayUnit && l.displayUnitId) {
        await tx.query(
          `UPDATE display_unit
           SET status = 'SOLD', sold_sale_id = $2
           WHERE id = $1`,
          [l.displayUnitId, saleId]
        );
      }

      lineResults.push({
        lineNo: l.lineNo,
        productId: l.product.id,
        sku: l.product.sku,
        productName: l.product.nameTh,
        unit: l.product.unit,
        qty: l.qty,
        tierLevel: l.tierLevel,
        unitPrice: l.unitPrice,
        listPrice: l.listPrice,
        discount: l.discount,
        lineTotal: l.total,
        isDisplayUnit: l.isDisplayUnit,
        picks: l.picks.map((p) => ({
          locationId: p.locationId,
          locationCode: p.locationCode,
          locationLabel: p.locationLabel,
          qty: p.qty,
          wasOversell: p.wasOversell,
        })),
      });
    }

    // ---------------------------------------------------------------
    // 5. รับเงิน
    // ---------------------------------------------------------------
    for (const p of input.payments) {
      await tx.query(
        `INSERT INTO payment (sale_id, method, amount, ref)
         VALUES ($1,$2,$3,$4)`,
        [saleId, p.method, round2(p.amount), p.ref ?? null]
      );
    }

    await tx.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, detail)
       VALUES ($1, 'SALE_CREATED', 'sale', $2, $3)`,
      [
        input.userId,
        saleId,
        JSON.stringify({
          docNo,
          total,
          tierLevel: input.tierLevel,
          oversellCount: oversoldLocations.length,
        }),
      ]
    );

    return {
      saleId,
      docNo,
      soldAt,
      tierLevel: input.tierLevel,
      lines: lineResults,
      subtotal,
      billDiscount,
      vatBase,
      vatAmount,
      total,
      paidAmount,
      changeAmount,
      oversoldLocations,
      warnings,
    };
  });
}

/**
 * ยกเลิกบิล - คืนของกลับเข้าช่องเดิมที่หยิบไป
 *
 * คืนเข้าช่องเดิมสำคัญมาก ถ้าคืนเข้าช่องอื่นหรือคืนแบบไม่ระบุช่อง
 * ยอดรวมจะถูกแต่ตำแหน่งจะผิด แล้วปัญหา "หาไม่เจอ" จะกลับมา
 */
export async function voidSale(
  pool: DbPool,
  input: { saleId: number; userId: number; reason: string }
): Promise<{ docNo: string; restored: number }> {
  return pool.transaction(async (tx) => {
    const saleRes = await tx.query<Record<string, unknown>>(
      "SELECT id, doc_no, status FROM sale WHERE id = $1 FOR UPDATE",
      [input.saleId]
    );
    const sale = saleRes.rows[0];
    if (!sale) throw new Error("ไม่พบบิลนี้");
    if (str(sale.status) === "VOIDED") throw new Error("บิลนี้ถูกยกเลิกไปแล้ว");

    const picks = await tx.query<Record<string, unknown>>(
      `SELECT sl.product_id, slp.location_id, slp.qty,
              sl.is_display_unit, sl.display_unit_id
       FROM sale_line sl
       JOIN sale_line_pick slp ON slp.sale_line_id = sl.id
       WHERE sl.sale_id = $1`,
      [input.saleId]
    );

    let restored = 0;
    for (const p of picks.rows) {
      await recordMovement(tx, {
        productId: num(p.product_id),
        locationId: num(p.location_id),
        qtyDelta: num(p.qty),
        reason: "VOID_SALE",
        refType: "SALE",
        refId: input.saleId,
        userId: input.userId,
        note: `ยกเลิกบิล ${str(sale.doc_no)}: ${input.reason}`,
      });
      restored += num(p.qty);
      if (bool(p.is_display_unit) && p.display_unit_id) {
        await tx.query(
          `UPDATE display_unit SET status='ON_DISPLAY', sold_sale_id=NULL WHERE id=$1`,
          [num(p.display_unit_id)]
        );
      }
    }

    await tx.query(
      `UPDATE sale
       SET status='VOIDED', voided_at=now(), voided_by=$2, void_reason=$3
       WHERE id=$1`,
      [input.saleId, input.userId, input.reason]
    );
    await tx.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, detail)
       VALUES ($1,'SALE_VOIDED','sale',$2,$3)`,
      [input.userId, input.saleId, JSON.stringify({ reason: input.reason })]
    );

    return { docNo: str(sale.doc_no), restored: round3(restored) };
  });
}
