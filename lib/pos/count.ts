/**
 * การนับสต๊อก
 *
 * ออกแบบตามข้อจำกัดจริงของร้าน: พนักงาน 2 คน ไม่มีเวลานับทั้งร้าน
 * และไม่ชอบขั้นตอนเยอะ ดังนั้น
 *
 *   - นับทีละช่อง ไม่ใช่ทีละสินค้า (เดินไปยืนหน้าชั้นแล้วนับสิ่งที่เห็น)
 *   - 1 ช่องใช้เวลาไม่เกิน 1 นาที
 *   - นับแบบปิดยอด (blind) เป็นค่าเริ่มต้น ไม่โชว์ยอดระบบตอนนับ
 *     เพราะถ้าเห็นยอดระบบ คนนับจะกรอกตามยอดระบบโดยไม่ได้นับจริง
 *     แล้วการนับก็ไร้ความหมาย
 *   - ถ้าเจอของที่ระบบไม่รู้ว่าอยู่ช่องนี้ ให้กรอกได้เลย (is_new_find)
 *     เพราะ "ของวางผิดช่อง" คือสาเหตุอันดับหนึ่งของการหาไม่เจอ
 */

import type { Db, DbPool } from "../db";
import { num, str, bool } from "../db";
import { round2, round3 } from "./money";
import { recordMovement } from "./stock";
import { nextDocNo } from "./docno";
import type { CountVariance } from "./types";

export interface StartCountInput {
  userId: number;
  kind: "FULL" | "CYCLE" | "SPOT";
  locationIds: number[];
  isBlind?: boolean;
  note?: string;
}

/**
 * เปิดรอบนับ และถ่ายภาพยอดระบบ ณ วินาทีนี้ไว้
 *
 * ต้อง snapshot ตอนเปิดรอบ ไม่ใช่ตอนกดบันทึก
 * เพราะระหว่างนับอาจมีลูกค้าซื้อของจากช่องนั้นพอดี
 * ถ้าใช้ยอด ณ ตอนบันทึก ผลต่างจะเพี้ยนแล้วจะไปปรับยอดผิด
 */
export async function startCountSession(
  pool: DbPool,
  input: StartCountInput
): Promise<{ sessionId: number; docNo: string; lineCount: number }> {
  if (input.locationIds.length === 0) {
    throw new Error("ต้องเลือกช่องที่จะนับอย่างน้อย 1 ช่อง");
  }

  return pool.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, "COUNT");
    const sessionRes = await tx.query<Record<string, unknown>>(
      `INSERT INTO count_session (doc_no, kind, status, is_blind, user_id, note)
       VALUES ($1,$2,'COUNTING',$3,$4,$5)
       RETURNING id`,
      [docNo, input.kind, input.isBlind ?? true, input.userId, input.note ?? null]
    );
    const sessionId = num(sessionRes.rows[0].id);

    const res = await tx.query<Record<string, unknown>>(
      `INSERT INTO count_line
         (session_id, location_id, product_id, system_qty)
       SELECT $1, sb.location_id, sb.product_id, sb.qty_on_hand
       FROM stock_balance sb
       WHERE sb.location_id = ANY($2::bigint[])
       RETURNING id`,
      [sessionId, input.locationIds]
    );

    return { sessionId, docNo, lineCount: res.rows.length };
  });
}

/**
 * บันทึกจำนวนที่นับได้ 1 รายการ
 *
 * รองรับกรณีเจอของที่ระบบไม่รู้ว่าอยู่ช่องนี้ (สินค้าวางผิดช่อง)
 * ซึ่งเป็นข้อมูลที่มีค่าที่สุดจากการนับ
 */
export async function recordCount(
  pool: DbPool,
  input: {
    sessionId: number;
    locationId: number;
    productId: number;
    countedQty: number;
    userId: number;
    note?: string;
  }
): Promise<{ isNewFind: boolean; systemQty: number; variance: number }> {
  return pool.transaction(async (tx) => {
    const session = await tx.query<Record<string, unknown>>(
      "SELECT status FROM count_session WHERE id = $1",
      [input.sessionId]
    );
    if (!session.rows[0]) throw new Error("ไม่พบรอบนับนี้");
    if (str(session.rows[0].status) !== "COUNTING") {
      throw new Error("รอบนับนี้ปิดไปแล้ว แก้ไขไม่ได้");
    }

    const counted = round3(input.countedQty);
    if (counted < 0) throw new Error("จำนวนที่นับได้ต้องไม่ติดลบ");

    const existing = await tx.query<Record<string, unknown>>(
      `SELECT id, system_qty FROM count_line
       WHERE session_id=$1 AND location_id=$2 AND product_id=$3`,
      [input.sessionId, input.locationId, input.productId]
    );

    let systemQty: number;
    let isNewFind = false;

    if (existing.rows[0]) {
      systemQty = num(existing.rows[0].system_qty);
      await tx.query(
        `UPDATE count_line
         SET counted_qty=$2, variance=$2-system_qty, counted_at=now(),
             counted_by=$3, note=$4
         WHERE id=$1`,
        [num(existing.rows[0].id), counted, input.userId, input.note ?? null]
      );
    } else {
      // ระบบไม่คิดว่ามีสินค้าตัวนี้ในช่องนี้ แต่ไปเจอของจริง
      systemQty = 0;
      isNewFind = true;
      await tx.query(
        `INSERT INTO count_line
           (session_id, location_id, product_id, system_qty, counted_qty,
            variance, is_new_find, counted_at, counted_by, note)
         VALUES ($1,$2,$3,0,$4,$4,true,now(),$5,$6)`,
        [
          input.sessionId,
          input.locationId,
          input.productId,
          counted,
          input.userId,
          input.note ?? "เจอของในช่องที่ระบบไม่ได้บันทึกไว้",
        ]
      );
    }

    return { isNewFind, systemQty, variance: round3(counted - systemQty) };
  });
}

/** ผลต่างของรอบนับ เรียงจากผลกระทบเป็นเงินมากไปน้อย */
export async function getVariances(
  db: Db,
  sessionId: number,
  opts: { onlyDifferent?: boolean } = {}
): Promise<CountVariance[]> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT cl.id, cl.product_id, cl.location_id, cl.system_qty,
            cl.counted_qty, cl.variance, cl.is_new_find,
            p.sku, p.name_th AS product_name, p.unit, p.cost_avg,
            l.code AS location_code, l.label_th AS location_label
     FROM count_line cl
     JOIN product  p ON p.id = cl.product_id
     JOIN location l ON l.id = cl.location_id
     WHERE cl.session_id = $1
       AND cl.counted_qty IS NOT NULL
       ${opts.onlyDifferent ? "AND cl.variance <> 0" : ""}
     ORDER BY ABS(cl.variance * p.cost_avg) DESC, l.code`,
    [sessionId]
  );
  return res.rows.map((r) => ({
    lineId: num(r.id),
    productId: num(r.product_id),
    sku: str(r.sku),
    productName: str(r.product_name),
    unit: str(r.unit),
    locationId: num(r.location_id),
    locationCode: str(r.location_code),
    locationLabel: str(r.location_label),
    systemQty: num(r.system_qty),
    countedQty: num(r.counted_qty),
    variance: num(r.variance),
    isNewFind: bool(r.is_new_find),
    costImpact: round2(num(r.variance) * num(r.cost_avg)),
  }));
}

/** รายการที่ยังไม่ได้นับในรอบนี้ */
export async function getPendingLines(
  db: Db,
  sessionId: number
): Promise<
  {
    locationId: number;
    locationCode: string;
    productId: number;
    sku: string;
    productName: string;
    unit: string;
  }[]
> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT cl.location_id, cl.product_id, p.sku, p.name_th, p.unit,
            l.code AS location_code
     FROM count_line cl
     JOIN product p  ON p.id = cl.product_id
     JOIN location l ON l.id = cl.location_id
     WHERE cl.session_id = $1 AND cl.counted_qty IS NULL
     ORDER BY l.walk_order, p.name_th`,
    [sessionId]
  );
  return res.rows.map((r) => ({
    locationId: num(r.location_id),
    locationCode: str(r.location_code),
    productId: num(r.product_id),
    sku: str(r.sku),
    productName: str(r.name_th),
    unit: str(r.unit),
  }));
}

export interface PostCountResult {
  docNo: string;
  adjusted: number;
  totalCostImpact: number;
  uncountedTreatedAsZero: number;
  variances: CountVariance[];
}

/**
 * ปิดรอบนับและปรับยอดตามที่นับได้
 *
 * ตัวเลือก treatUncountedAsZero:
 *   - รอบนับเต็มช่อง (FULL/CYCLE): ควรตั้ง true เพราะถ้าไม่เจอของในช่อง
 *     แปลว่าไม่มีจริง ต้องปรับเป็น 0 ไม่งั้นยอดผีจะค้างอยู่ตลอดไป
 *   - รอบนับเฉพาะจุด (SPOT): ควรตั้ง false เพราะนับแค่บางตัว
 *     ตัวที่ไม่ได้นับไม่ได้แปลว่าไม่มี
 */
export async function postCountSession(
  pool: DbPool,
  input: {
    sessionId: number;
    userId: number;
    treatUncountedAsZero?: boolean;
  }
): Promise<PostCountResult> {
  return pool.transaction(async (tx) => {
    const sess = await tx.query<Record<string, unknown>>(
      "SELECT doc_no, kind, status FROM count_session WHERE id=$1 FOR UPDATE",
      [input.sessionId]
    );
    if (!sess.rows[0]) throw new Error("ไม่พบรอบนับนี้");
    if (str(sess.rows[0].status) === "POSTED") {
      throw new Error("รอบนับนี้ปรับยอดไปแล้ว");
    }
    const docNo = str(sess.rows[0].doc_no);
    const kind = str(sess.rows[0].kind);
    const treatZero =
      input.treatUncountedAsZero ?? (kind === "FULL" || kind === "CYCLE");

    // ตัวที่ยังไม่ได้นับ: ถือว่านับได้ 0
    let uncounted = 0;
    if (treatZero) {
      const res = await tx.query<Record<string, unknown>>(
        `UPDATE count_line
         SET counted_qty=0, variance=-system_qty, counted_at=now(), counted_by=$2,
             note = COALESCE(note,'') || ' [ไม่พบของในช่อง ถือว่าเป็น 0]'
         WHERE session_id=$1 AND counted_qty IS NULL
         RETURNING id`,
        [input.sessionId, input.userId]
      );
      uncounted = res.rows.length;
    }

    const variances = await getVariances(tx, input.sessionId, {
      onlyDifferent: true,
    });

    let adjusted = 0;
    let totalCostImpact = 0;
    for (const v of variances) {
      await recordMovement(tx, {
        productId: v.productId,
        locationId: v.locationId,
        qtyDelta: v.variance,
        reason: "COUNT_ADJUST",
        refType: "COUNT",
        refId: input.sessionId,
        userId: input.userId,
        note:
          `นับรอบ ${docNo}: ระบบมี ${v.systemQty} นับได้ ${v.countedQty}` +
          (v.isNewFind ? " (เจอของที่ระบบไม่ได้บันทึกไว้)" : ""),
      });
      adjusted++;
      totalCostImpact = round2(totalCostImpact + v.costImpact);
    }

    // อัปเดตวันที่นับล่าสุดของทุกช่อง/สินค้าที่นับในรอบนี้
    await tx.query(
      `UPDATE stock_balance sb
       SET last_counted_at = now()
       FROM count_line cl
       WHERE cl.session_id = $1
         AND cl.product_id = sb.product_id
         AND cl.location_id = sb.location_id
         AND cl.counted_qty IS NOT NULL`,
      [input.sessionId]
    );

    // ปิดใบแจ้ง "หาไม่เจอ" ที่ผูกกับรอบนับนี้
    await tx.query(
      `UPDATE not_found_report
       SET status='RESOLVED', resolution='ADJUSTED', resolved_at=now(),
           resolved_by=$2
       WHERE count_session_id=$1 AND status='OPEN'`,
      [input.sessionId, input.userId]
    );

    await tx.query(
      `UPDATE count_session
       SET status='POSTED', posted_at=now(), posted_by=$2
       WHERE id=$1`,
      [input.sessionId, input.userId]
    );
    await tx.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, detail)
       VALUES ($1,'COUNT_POSTED','count_session',$2,$3)`,
      [
        input.userId,
        input.sessionId,
        JSON.stringify({ docNo, adjusted, totalCostImpact }),
      ]
    );

    return {
      docNo,
      adjusted,
      totalCostImpact,
      uncountedTreatedAsZero: uncounted,
      variances,
    };
  });
}

/**
 * ช่องที่ควรไปนับต่อไป เรียงตามความเร่งด่วน
 *
 * ใช้เป็น "งานประจำวัน" ให้พนักงาน: เปิดมาเห็นว่าวันนี้ต้องนับ 3 ช่อง
 * ใช้เวลา 3 นาที จบ ดีกว่าปิดร้านนับทั้งวันปีละครั้ง
 * ซึ่งไม่มีใครอยากทำและทำแล้วก็เพี้ยนอีกภายในเดือนเดียว
 */
export async function getCountQueue(
  db: Db,
  limit = 20
): Promise<
  {
    productId: number;
    locationId: number;
    sku: string;
    productName: string;
    locationCode: string;
    locationLabel: string;
    qtyOnHand: number;
    priority: number;
    openNotFound: number;
    lastCountedAt: string | null;
    reason: string;
  }[]
> {
  const res = await db.query<Record<string, unknown>>(
    `SELECT * FROM v_count_priority
     WHERE priority > 0
     ORDER BY priority DESC, location_code
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => {
    const priority = num(r.priority);
    const qty = num(r.qty_on_hand);
    let reason = "ถึงรอบนับตามกำหนด";
    if (qty < 0) reason = "ยอดติดลบ — ขายไปมากกว่าที่ระบบมี";
    else if (num(r.open_not_found) > 0) reason = "มีคนแจ้งว่าหาไม่เจอ";
    else if (!r.last_counted_at) reason = "ไม่เคยนับช่องนี้เลย";
    return {
      productId: num(r.product_id),
      locationId: num(r.location_id),
      sku: str(r.sku),
      productName: str(r.product_name),
      locationCode: str(r.location_code),
      locationLabel: str(r.location_label),
      qtyOnHand: qty,
      priority,
      openNotFound: num(r.open_not_found),
      lastCountedAt: r.last_counted_at ? String(r.last_counted_at) : null,
      reason,
    };
  });
}
