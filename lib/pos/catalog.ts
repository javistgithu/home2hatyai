/**
 * ค้นหาสินค้าและอ่านข้อมูลสินค้า
 *
 * หน้าจอทุกหน้าเริ่มจากที่เดียวกัน: ช่องเดียวที่รับได้ทั้ง
 * บาร์โค้ดที่ยิงมา / รหัสสินค้า / ชื่อไทย / รหัสช่องวาง
 *
 * เจตนา: พนักงานไม่ต้องเลือกก่อนว่า "จะค้นด้วยอะไร"
 * แค่ยิงหรือพิมพ์ลงไป ระบบแยกเองว่าคืออะไร
 * ทุกขั้นตอนที่ตัดออกได้ คือเหตุผลหนึ่งข้อที่พนักงานจะไม่เลิกใช้ระบบ
 */

import type { Db } from "../db";
import { num, str, bool, numOrNull, strOrNull } from "../db";
import type {
  ProductLookup,
  ProductSummary,
  ProductSpec,
  ScanResult,
  StockAtLocation,
  DisplayUnitInfo,
  LocationKind,
} from "./types";

/**
 * ทำคีย์ค้นหา: ตัดช่องว่าง ขีด จุด และแปลงเป็นตัวพิมพ์เล็ก
 * เพื่อให้พิมพ์ "led9w" เจอ "LED 9W" และพิมพ์ "2x25" เจอ "2 x 2.5"
 */
export function normalizeSearchKey(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[\s\-_.()/]+/g, "");
}

/** ตัดคำค้นเป็นชิ้นๆ เพื่อค้นแบบ "ต้องมีครบทุกคำ" */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[\-_.()/]+/g, ""))
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

// -------------------------------------------------------------------
// ยิงบาร์โค้ด
// -------------------------------------------------------------------
/**
 * แปลงสิ่งที่ยิง/พิมพ์เข้ามาเป็นสิ่งที่ระบบเข้าใจ
 *
 * ลำดับการตรวจ: บาร์โค้ดสินค้า -> รหัสสินค้า (SKU) -> รหัสช่องวาง
 * เรียงตามความถี่ในการใช้จริง บาร์โค้ดถูกยิงบ่อยที่สุดจึงตรวจก่อน
 */
export async function resolveScan(db: Db, raw: string): Promise<ScanResult> {
  const code = raw.trim();
  if (!code) return { kind: "UNKNOWN", raw };

  const bc = await db.query<Record<string, unknown>>(
    "SELECT product_id, pack_qty FROM product_barcode WHERE barcode = $1",
    [code]
  );
  if (bc.rows[0]) {
    return {
      kind: "PRODUCT",
      raw: code,
      productId: num(bc.rows[0].product_id),
      packQty: num(bc.rows[0].pack_qty) || 1,
    };
  }

  const sku = await db.query<Record<string, unknown>>(
    "SELECT id FROM product WHERE upper(sku) = upper($1)",
    [code]
  );
  if (sku.rows[0]) {
    return { kind: "PRODUCT", raw: code, productId: num(sku.rows[0].id), packQty: 1 };
  }

  const loc = await db.query<Record<string, unknown>>(
    "SELECT id FROM location WHERE upper(code) = upper($1)",
    [code]
  );
  if (loc.rows[0]) {
    return { kind: "LOCATION", raw: code, locationId: num(loc.rows[0].id) };
  }

  return { kind: "UNKNOWN", raw: code };
}

// -------------------------------------------------------------------
// ค้นหา
// -------------------------------------------------------------------
export interface ProductSearchHit {
  id: number;
  sku: string;
  nameTh: string;
  unit: string;
  brand: string | null;
  isLamp: boolean;
  qtySellable: number;
  qtyOnDisplay: number;
  /** ช่องแรกที่ควรไปหยิบ - โชว์ในผลค้นหาเลยจะได้ไม่ต้องกดเข้าไปดู */
  primaryLocationCode: string | null;
  primaryLocationLabel: string | null;
  binCount: number;
  prices: { tierLevel: number; price: number }[];
}

export async function searchProducts(
  db: Db,
  query: string,
  opts: { limit?: number; lampOnly?: boolean; inStockOnly?: boolean } = {}
): Promise<ProductSearchHit[]> {
  const tokens = tokenize(query);
  const params: unknown[] = [];
  const where: string[] = ["p.is_active"];

  for (const t of tokens) {
    params.push(`%${t}%`);
    where.push(`p.search_key LIKE $${params.length}`);
  }
  if (opts.lampOnly) where.push("p.is_lamp");
  if (opts.inStockOnly) where.push("COALESCE(s.qty_sellable,0) > 0");

  params.push(opts.limit ?? 30);

  const res = await db.query<Record<string, unknown>>(
    `SELECT p.id, p.sku, p.name_th, p.unit, p.brand, p.is_lamp,
            COALESCE(s.qty_sellable, 0)   AS qty_sellable,
            COALESCE(s.qty_on_display, 0) AS qty_on_display,
            COALESCE(s.bin_count, 0)      AS bin_count,
            (SELECT vs.location_code FROM v_stock_detail vs
              WHERE vs.product_id = p.id AND vs.qty_on_hand > 0
                AND vs.is_pickable AND vs.location_kind IN ('BIN','STAGING')
              ORDER BY vs.pick_priority, vs.walk_order LIMIT 1)  AS primary_code,
            (SELECT vs.location_label FROM v_stock_detail vs
              WHERE vs.product_id = p.id AND vs.qty_on_hand > 0
                AND vs.is_pickable AND vs.location_kind IN ('BIN','STAGING')
              ORDER BY vs.pick_priority, vs.walk_order LIMIT 1)  AS primary_label
     FROM product p
     LEFT JOIN v_product_stock_summary s ON s.product_id = p.id
     WHERE ${where.join(" AND ")}
     ORDER BY (COALESCE(s.qty_sellable,0) > 0) DESC, p.name_th
     LIMIT $${params.length}`,
    params
  );

  const ids = res.rows.map((r) => num(r.id));
  const priceMap = await loadPricesFor(db, ids);

  return res.rows.map((r) => ({
    id: num(r.id),
    sku: str(r.sku),
    nameTh: str(r.name_th),
    unit: str(r.unit),
    brand: strOrNull(r.brand),
    isLamp: bool(r.is_lamp),
    qtySellable: num(r.qty_sellable),
    qtyOnDisplay: num(r.qty_on_display),
    primaryLocationCode: strOrNull(r.primary_code),
    primaryLocationLabel: strOrNull(r.primary_label),
    binCount: num(r.bin_count),
    prices: priceMap.get(num(r.id)) ?? [],
  }));
}

async function loadPricesFor(
  db: Db,
  productIds: number[]
): Promise<Map<number, { tierLevel: number; price: number }[]>> {
  const map = new Map<number, { tierLevel: number; price: number }[]>();
  if (productIds.length === 0) return map;
  const res = await db.query<Record<string, unknown>>(
    `SELECT pp.product_id, pp.tier_level, pp.price
     FROM product_price pp
     JOIN price_tier pt ON pt.level = pp.tier_level
     WHERE pp.product_id = ANY($1::bigint[])
     ORDER BY pt.sort_order`,
    [productIds]
  );
  for (const r of res.rows) {
    const id = num(r.product_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push({ tierLevel: num(r.tier_level), price: num(r.price) });
  }
  return map;
}

// -------------------------------------------------------------------
// ข้อมูลสินค้าเต็ม
// -------------------------------------------------------------------
/**
 * ข้อมูลชุดเดียวที่หน้าจอ "ของอยู่ไหน" ต้องใช้ทั้งหมด
 * ตอบได้ครบใน request เดียว: ราคาทุกระดับ ของอยู่ช่องไหนกี่ชิ้น ตัวโชว์อยู่จุดไหน
 */
export async function lookupProduct(
  db: Db,
  productId: number
): Promise<ProductLookup | null> {
  const pRes = await db.query<Record<string, unknown>>(
    `SELECT p.id, p.sku, p.name_th, p.unit, p.brand, p.is_lamp,
            p.count_class, p.reorder_point, p.cost_avg,
            c.name_th AS category_name
     FROM product p
     LEFT JOIN product_category c ON c.id = p.category_id
     WHERE p.id = $1`,
    [productId]
  );
  if (!pRes.rows[0]) return null;
  const r = pRes.rows[0];

  const product: ProductSummary = {
    id: num(r.id),
    sku: str(r.sku),
    nameTh: str(r.name_th),
    unit: str(r.unit),
    brand: strOrNull(r.brand),
    isLamp: bool(r.is_lamp),
    categoryName: strOrNull(r.category_name),
    countClass: (str(r.count_class) || "C") as "A" | "B" | "C",
    reorderPoint: num(r.reorder_point),
    costAvg: num(r.cost_avg),
  };

  const [specRes, priceRes, bcRes, stockRes, duRes] = await Promise.all([
    db.query<Record<string, unknown>>(
      "SELECT * FROM product_spec WHERE product_id = $1",
      [productId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT pp.tier_level, pp.price FROM product_price pp
       JOIN price_tier pt ON pt.level = pp.tier_level
       WHERE pp.product_id = $1 ORDER BY pt.sort_order`,
      [productId]
    ),
    db.query<Record<string, unknown>>(
      "SELECT barcode FROM product_barcode WHERE product_id = $1 ORDER BY is_primary DESC",
      [productId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT location_id, location_code, location_label, location_kind,
              zone_code, zone_name, qty_on_hand, qty_reserved, qty_available,
              walk_order, pick_priority, is_pickable, last_counted_at
       FROM v_stock_detail
       WHERE product_id = $1 AND qty_on_hand <> 0
       ORDER BY pick_priority, walk_order`,
      [productId]
    ),
    db.query<Record<string, unknown>>(
      `SELECT d.id, d.product_id, d.location_id, d.spot_label, d.status,
              d.condition, d.is_sellable, d.display_price, d.photo_url,
              d.installed_at, d.checked_at, d.note,
              l.code AS location_code, l.label_th AS location_label
       FROM display_unit d
       JOIN location l ON l.id = d.location_id
       WHERE d.product_id = $1 AND d.status IN ('ON_DISPLAY','RESERVED')
       ORDER BY l.walk_order`,
      [productId]
    ),
  ]);

  const s = specRes.rows[0];
  const spec: ProductSpec | null = s
    ? {
        watt: numOrNull(s.watt),
        lumen: numOrNull(s.lumen),
        colorTemp: strOrNull(s.color_temp),
        baseType: strOrNull(s.base_type),
        voltage: strOrNull(s.voltage),
        ipRating: strOrNull(s.ip_rating),
        beamAngle: numOrNull(s.beam_angle),
        cutOutMm: numOrNull(s.cut_out_mm),
        dimension: strOrNull(s.dimension),
        material: strOrNull(s.material),
        wireSize: strOrNull(s.wire_size),
        ampRating: strOrNull(s.amp_rating),
        warrantyMonths: numOrNull(s.warranty_months),
        isDimmable: bool(s.is_dimmable),
      }
    : null;

  const stock: StockAtLocation[] = stockRes.rows.map((x) => ({
    locationId: num(x.location_id),
    locationCode: str(x.location_code),
    locationLabel: str(x.location_label),
    locationKind: str(x.location_kind) as LocationKind,
    zoneCode: str(x.zone_code),
    zoneName: str(x.zone_name),
    qtyOnHand: num(x.qty_on_hand),
    qtyReserved: num(x.qty_reserved),
    qtyAvailable: num(x.qty_available),
    walkOrder: num(x.walk_order),
    pickPriority: num(x.pick_priority),
    isPickable: bool(x.is_pickable),
    lastCountedAt: x.last_counted_at ? String(x.last_counted_at) : null,
  }));

  const displayUnits: DisplayUnitInfo[] = duRes.rows.map((x) => ({
    id: num(x.id),
    productId: num(x.product_id),
    locationId: num(x.location_id),
    locationCode: str(x.location_code),
    locationLabel: str(x.location_label),
    spotLabel: str(x.spot_label),
    status: str(x.status) as DisplayUnitInfo["status"],
    condition: str(x.condition) as DisplayUnitInfo["condition"],
    isSellable: bool(x.is_sellable),
    displayPrice: x.display_price === null ? null : num(x.display_price),
    photoUrl: strOrNull(x.photo_url),
    installedAt: x.installed_at ? String(x.installed_at) : null,
    checkedAt: x.checked_at ? String(x.checked_at) : null,
    note: strOrNull(x.note),
  }));

  // แยกยอด "พร้อมขาย" ออกจาก "ตัวโชว์" อย่างเด็ดขาด
  const qtySellable = stock
    .filter((x) => x.isPickable && (x.locationKind === "BIN" || x.locationKind === "STAGING"))
    .reduce((a, x) => a + x.qtyOnHand, 0);
  const qtyOnDisplay = stock
    .filter((x) => x.locationKind === "DISPLAY_SPOT")
    .reduce((a, x) => a + x.qtyOnHand, 0);
  const qtyReserved = stock.reduce((a, x) => a + x.qtyReserved, 0);

  return {
    product,
    spec,
    prices: priceRes.rows.map((x) => ({
      tierLevel: num(x.tier_level),
      price: num(x.price),
    })),
    barcodes: bcRes.rows.map((x) => str(x.barcode)),
    stock,
    displayUnits,
    qtySellable,
    qtyOnDisplay,
    qtyReserved,
  };
}

// -------------------------------------------------------------------
// สร้าง/แก้ไขสินค้า
// -------------------------------------------------------------------
export interface CreateProductInput {
  sku: string;
  nameTh: string;
  unit: string;
  brand?: string | null;
  model?: string | null;
  categoryId?: number | null;
  isLamp?: boolean;
  costAvg?: number;
  reorderPoint?: number;
  countClass?: "A" | "B" | "C";
  note?: string | null;
  barcodes?: { barcode: string; kind?: string; packQty?: number }[];
  spec?: Partial<ProductSpec> | null;
}

export async function createProduct(
  db: Db,
  input: CreateProductInput
): Promise<number> {
  const searchKey = normalizeSearchKey(
    input.sku,
    input.nameTh,
    input.brand,
    input.model,
    ...(input.barcodes?.map((b) => b.barcode) ?? [])
  );

  const res = await db.query<Record<string, unknown>>(
    `INSERT INTO product
       (sku, name_th, category_id, brand, model, unit, is_lamp,
        cost_avg, reorder_point, count_class, search_key, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      input.sku,
      input.nameTh,
      input.categoryId ?? null,
      input.brand ?? null,
      input.model ?? null,
      input.unit,
      input.isLamp ?? false,
      input.costAvg ?? 0,
      input.reorderPoint ?? 0,
      input.countClass ?? "C",
      searchKey,
      input.note ?? null,
    ]
  );
  const productId = num(res.rows[0].id);

  for (const bc of input.barcodes ?? []) {
    await db.query(
      `INSERT INTO product_barcode (product_id, barcode, kind, pack_qty, is_primary)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (barcode) DO NOTHING`,
      [
        productId,
        bc.barcode,
        bc.kind ?? "MANUFACTURER",
        bc.packQty ?? 1,
        (input.barcodes ?? [])[0]?.barcode === bc.barcode,
      ]
    );
  }

  if (input.spec) {
    const s = input.spec;
    await db.query(
      `INSERT INTO product_spec
        (product_id, watt, lumen, color_temp, base_type, voltage, ip_rating,
         beam_angle, cut_out_mm, dimension, material, wire_size, amp_rating,
         warranty_months, is_dimmable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        productId,
        s.watt ?? null,
        s.lumen ?? null,
        s.colorTemp ?? null,
        s.baseType ?? null,
        s.voltage ?? null,
        s.ipRating ?? null,
        s.beamAngle ?? null,
        s.cutOutMm ?? null,
        s.dimension ?? null,
        s.material ?? null,
        s.wireSize ?? null,
        s.ampRating ?? null,
        s.warrantyMonths ?? null,
        s.isDimmable ?? false,
      ]
    );
  }

  return productId;
}

/** สร้างคีย์ค้นหาใหม่ทั้งตาราง (ใช้หลังนำเข้าข้อมูลจำนวนมาก) */
export async function rebuildSearchKeys(db: Db): Promise<number> {
  const res = await db.query<Record<string, unknown>>(
    `UPDATE product p
     SET search_key = lower(regexp_replace(
       concat_ws(' ', p.sku, p.name_th, p.brand, p.model,
         (SELECT string_agg(b.barcode, ' ') FROM product_barcode b
           WHERE b.product_id = p.id)),
       '[\\s\\-_.()/]+', '', 'g'))
     RETURNING id`
  );
  return res.rows.length;
}
