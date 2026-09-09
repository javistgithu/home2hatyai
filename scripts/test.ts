/**
 * ชุดทดสอบตรรกะธุรกิจ
 *
 * รันบนฐานข้อมูลในหน่วยความจำที่สร้างใหม่ทุกครั้ง ไม่แตะข้อมูลจริง
 * รันด้วย: npm test
 *
 * แต่ละเทสต์ผูกกับปัญหาจริงของร้าน ไม่ได้เขียนเพื่อให้มีเทสต์
 */

import { createTestDb, num, str, type DbPool } from "../lib/db";
import { runMigrations } from "../lib/migrate";
import { extractVat, lineTotal, sumMoney, round2 } from "../lib/pos/money";
import {
  resolvePrice, validatePriceLadder, setProductPrices, checkPriceGuard,
  getPriceTiers,
} from "../lib/pos/pricing";
import { createProduct, resolveScan, lookupProduct, searchProducts } from "../lib/pos/catalog";
import { createRack, createDisplaySpot } from "../lib/pos/location";
import { createUser, authenticate, verifyOwnerPin, validatePinFormat } from "../lib/pos/users";
import { receiveGoods } from "../lib/pos/receiving";
import { setUpDisplay, getLampsWithoutDisplay } from "../lib/pos/display";
import { createSale, voidSale } from "../lib/pos/sales";
import { reportNotFound } from "../lib/pos/notfound";
import {
  startCountSession, recordCount, postCountSession, getCountQueue,
} from "../lib/pos/count";
import { verifyLedgerIntegrity, getStockByProduct, transferStock } from "../lib/pos/stock";

// ------------------------------------------------------- ตัวรันเทสต์
let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, Object.is(actual, expected), `ได้ ${String(actual)} ควรเป็น ${String(expected)}`);
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

async function expectThrow(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(name, false, "ควรจะ error แต่ผ่านไปได้");
  } catch {
    check(name, true);
  }
}

// ------------------------------------------------------------ ตัวช่วย
interface Fixture {
  pool: DbPool;
  ownerId: number;
  staffId: number;
  loc: Map<string, number>;
  bulbId: number;
  lampId: number;
  wireId: number;
}

async function buildFixture(): Promise<Fixture> {
  const pool = await createTestDb("memory://");
  await runMigrations(pool, { log: () => {} });

  const ownerId = await createUser(pool, {
    code: "OWNER", name: "เจ้าของ", pin: "246810", role: "OWNER",
  });
  const staffId = await createUser(pool, {
    code: "S01", name: "พนักงาน 1", pin: "1357", role: "STAFF",
  });

  await createRack(pool, { zoneCode: "F", rack: "A", levels: 2, binsPerLevel: 3 });
  await createRack(pool, { zoneCode: "S", rack: "A", levels: 2, binsPerLevel: 3 });
  await createDisplaySpot(pool, { spotCode: "P1", labelTh: "เสา 1", walkOrder: 5010 });

  const loc = new Map<string, number>();
  const locRes = await pool.query<Record<string, unknown>>("SELECT id, code FROM location");
  for (const r of locRes.rows) loc.set(str(r.code), num(r.id));

  // หลอดไฟธรรมดา
  const bulbId = await createProduct(pool, {
    sku: "TEST-BULB", nameTh: "หลอด LED 9W ทดสอบ", unit: "หลอด",
    countClass: "A", barcodes: [{ barcode: "1111111111111" }],
  });
  await setProductPrices(pool, {
    productId: bulbId, userId: ownerId,
    prices: [
      { tierLevel: 5, price: 100 }, { tierLevel: 1, price: 80 },
      { tierLevel: 2, price: 70 },  { tierLevel: 3, price: 62 },
      { tierLevel: 4, price: 55 },
    ],
  });

  // โคมไฟ (ต้องมีตัวโชว์)
  const lampId = await createProduct(pool, {
    sku: "TEST-LAMP", nameTh: "โคมไฟช่อทดสอบ", unit: "ชุด", isLamp: true,
    barcodes: [{ barcode: "2222222222222" }],
  });
  await setProductPrices(pool, {
    productId: lampId, userId: ownerId,
    // ตั้งใจไม่ตั้งราคาช่างขายส่ง (ระดับ 3) เพื่อทดสอบ fallback
    prices: [
      { tierLevel: 5, price: 5000 }, { tierLevel: 1, price: 4000 },
      { tierLevel: 2, price: 3600 }, { tierLevel: 4, price: 3000 },
    ],
  });

  // สายไฟ ตัดขายเป็นเมตร (ทดสอบจำนวนทศนิยม)
  const wireId = await createProduct(pool, {
    sku: "TEST-WIRE", nameTh: "สายไฟ VAF 2x2.5 ทดสอบ", unit: "เมตร",
    barcodes: [{ barcode: "3333333333333" }],
  });
  await setProductPrices(pool, {
    productId: wireId, userId: ownerId,
    prices: [
      { tierLevel: 5, price: 34 }, { tierLevel: 1, price: 28 },
      { tierLevel: 2, price: 25 }, { tierLevel: 3, price: 23 },
      { tierLevel: 4, price: 20.5 },
    ],
  });

  await receiveGoods(pool, {
    userId: ownerId,
    lines: [
      { productId: bulbId, qty: 10, unitCost: 40, locationId: loc.get("F-A1-1")! },
      { productId: bulbId, qty: 50, unitCost: 40, locationId: loc.get("S-A1-1")! },
      { productId: lampId, qty: 3,  unitCost: 2400, locationId: loc.get("S-A2-1")! },
      { productId: wireId, qty: 100, unitCost: 18, locationId: loc.get("F-A1-2")! },
    ],
  });

  return { pool, ownerId, staffId, loc, bulbId, lampId, wireId };
}

// ===================================================================
async function main() {
  console.log("ทดสอบระบบ POS อุปกรณ์ไฟฟ้าและโคมไฟ");

  // -----------------------------------------------------------------
  section("การคำนวณเงิน");
  {
    const { base, vat } = extractVat(1070, 7);
    eq("ถอด VAT จาก 1,070 ได้ฐาน 1,000", base, 1000);
    eq("ถอด VAT จาก 1,070 ได้ภาษี 70", vat, 70);

    eq("ยอดบรรทัด 28 x 12.5 เมตร = 350", lineTotal(28, 12.5), 350);
    eq("ยอดบรรทัด 0.1 x 3 ไม่มีเศษลอย", lineTotal(0.1, 3), 0.3);
    eq("รวม 0.1+0.2 ได้ 0.3 พอดี", sumMoney([0.1, 0.2]), 0.3);

    // บวก 1 สตางค์ 100 ครั้ง ต้องได้ 1 บาทพอดี ไม่ใช่ 0.9999999
    eq("บวก 0.01 จำนวน 100 ครั้ง = 1.00", sumMoney(Array(100).fill(0.01)), 1);

    const v = extractVat(107.5, 7);
    eq("ถอด VAT ยอดมีเศษแล้วบวกกลับได้เท่าเดิม", round2(v.base + v.vat), 107.5);
  }

  // -----------------------------------------------------------------
  section("ราคา 5 ระดับ");
  const fx = await buildFixture();
  {
    const tiers = await getPriceTiers(fx.pool);
    eq("มีระดับราคาครบ 5 ระดับ", tiers.length, 5);
    eq("ระดับตั้งต้นคือราคาขายจริง", tiers.find((t) => t.isDefault)?.level, 1);
    eq("ราคาพิเศษต้องขออนุมัติ", tiers.find((t) => t.level === 4)?.requiresApproval, true);
    eq("ราคาเต็มก่อนลดเป็นราคาอ้างอิง", tiers.find((t) => t.level === 5)?.isAnchor, true);

    for (const [level, expect] of [[5, 100], [1, 80], [2, 70], [3, 62], [4, 55]] as const) {
      const r = await resolvePrice(fx.pool, fx.bulbId, level);
      eq(`ระดับ ${level} ได้ราคา ${expect}`, r.price, expect);
    }

    const r1 = await resolvePrice(fx.pool, fx.bulbId, 1);
    eq("ราคาเต็มถูกส่งมาด้วยเสมอ (ไว้โชว์ส่วนลด)", r1.listPrice, 100);

    // โคมไฟไม่ได้ตั้งราคาระดับ 3 -> ต้องถอยไปใช้ราคาขายจริง
    const rf = await resolvePrice(fx.pool, fx.lampId, 3);
    eq("ระดับที่ไม่ได้ตั้งราคา ถอยไปใช้ราคาขายจริง", rf.price, 4000);
    eq("ระดับที่ใช้จริงเปลี่ยนเป็น 1", rf.tierLevel, 1);
    check("ตั้งธงบอกว่ามีการถอยราคา", rf.fallbackUsed);

    const problems = validatePriceLadder([
      { tierLevel: 5, price: 100 }, { tierLevel: 1, price: 80 },
      { tierLevel: 2, price: 90 },  // ช่างแพงกว่าปลีก = กรอกสลับ
      { tierLevel: 3, price: 62 },  { tierLevel: 4, price: 55 },
    ]);
    check("จับได้ว่าราคาช่างแพงกว่าราคาขายจริง", problems.length === 1, problems.join(" | "));
    eq("ราคาที่เรียงถูกต้องไม่มีปัญหา", validatePriceLadder([
      { tierLevel: 5, price: 100 }, { tierLevel: 1, price: 80 },
      { tierLevel: 2, price: 70 },  { tierLevel: 3, price: 62 },
      { tierLevel: 4, price: 55 },
    ]).length, 0);

    const tier4 = tiers.find((t) => t.level === 4);
    const guardNoApproval = checkPriceGuard({
      price: 55, cost: 40, tier: tier4, isOverridden: false, hasApproval: false,
    });
    check("ราคาพิเศษไม่มีอนุมัติ = ขายไม่ได้", !guardNoApproval.ok);
    const guardApproved = checkPriceGuard({
      price: 55, cost: 40, tier: tier4, isOverridden: false, hasApproval: true,
    });
    check("ราคาพิเศษมีอนุมัติ = ขายได้", guardApproved.ok);
    const guardLoss = checkPriceGuard({
      price: 30, cost: 40, tier: tier4, isOverridden: false, hasApproval: true,
    });
    check("ขายต่ำกว่าทุนขึ้นคำเตือน", guardLoss.warnings.length > 0);
  }

  // -----------------------------------------------------------------
  section("ยิงบาร์โค้ดและค้นหา");
  {
    const s1 = await resolveScan(fx.pool, "1111111111111");
    eq("ยิงบาร์โค้ดเจอสินค้า", s1.productId, fx.bulbId);
    const s2 = await resolveScan(fx.pool, "TEST-WIRE");
    eq("พิมพ์รหัสสินค้าก็เจอ", s2.productId, fx.wireId);
    const s3 = await resolveScan(fx.pool, "F-A1-1");
    eq("ยิงป้ายช่องวางรู้ว่าเป็นช่อง", s3.kind, "LOCATION");
    const s4 = await resolveScan(fx.pool, "ไม่มีอะไรตรงนี้");
    eq("ยิงอะไรที่ไม่รู้จักคืน UNKNOWN", s4.kind, "UNKNOWN");

    const hits = await searchProducts(fx.pool, "led 9w");
    check("ค้นหา 'led 9w' เจอหลอด LED 9W", hits.some((h) => h.id === fx.bulbId));
    const hits2 = await searchProducts(fx.pool, "2x25");
    check("ค้นหา '2x25' เจอสายไฟ 2x2.5 (ตัดจุดและช่องว่าง)", hits2.some((h) => h.id === fx.wireId));
    const first = hits.find((h) => h.id === fx.bulbId)!;
    eq("ผลค้นหาบอกช่องที่ควรไปหยิบเลย", first.primaryLocationCode, "F-A1-1");
  }

  // -----------------------------------------------------------------
  section("ตำแหน่งเก็บของและการหยิบ");
  {
    const stock = await getStockByProduct(fx.pool, fx.bulbId);
    eq("หลอดไฟอยู่ 2 ช่อง", stock.length, 2);
    eq("ช่องแรกที่ระบบสั่งให้หยิบคือหน้าร้าน", stock[0].locationCode, "F-A1-1");
    eq("ช่องที่สองคือสโตร์", stock[1].locationCode, "S-A1-1");
    check("ป้ายช่องอ่านออกเป็นภาษาไทย",
      stock[0].locationLabel.includes("ชั้นวาง A") && stock[0].locationLabel.includes("ช่อง 1"),
      stock[0].locationLabel);
  }

  // -----------------------------------------------------------------
  section("ขายของ - หยิบจากหน้าร้านก่อน แล้วต่อที่สโตร์");
  {
    // หน้าร้านมี 10 ขาย 25 -> ต้องหยิบหน้าร้าน 10 + สโตร์ 15
    const sale = await createSale(fx.pool, {
      userId: fx.staffId, tierLevel: 1,
      lines: [{ productId: fx.bulbId, qty: 25 }],
      payments: [{ method: "CASH", amount: 2000 }],
    });
    eq("ยอดรวม 25 x 80 = 2,000", sale.total, 2000);
    eq("เงินทอน 0", sale.changeAmount, 0);
    eq("หยิบจาก 2 ช่อง", sale.lines[0].picks.length, 2);
    eq("หยิบหน้าร้านก่อน 10", sale.lines[0].picks[0].qty, 10);
    eq("ช่องแรกคือหน้าร้าน", sale.lines[0].picks[0].locationCode, "F-A1-1");
    eq("แล้วไปต่อที่สโตร์ 15", sale.lines[0].picks[1].qty, 15);
    check("ไม่มีการขายเกินยอด", sale.oversoldLocations.length === 0);

    const vat = extractVat(2000, 7);
    eq("แยก VAT ออกจากยอดรวมถูกต้อง", sale.vatAmount, vat.vat);

    const after = await getStockByProduct(fx.pool, fx.bulbId);
    eq("หน้าร้านเหลือ 0 (หายไปจากรายการ)", after.length, 1);
    eq("สโตร์เหลือ 35", after[0].qtyOnHand, 35);
    eq("เลขที่บิลขึ้นต้นด้วย IV", sale.docNo.slice(0, 2), "IV");
  }

  // -----------------------------------------------------------------
  section("ขายของตัดเป็นเมตร (จำนวนทศนิยม)");
  {
    const sale = await createSale(fx.pool, {
      userId: fx.staffId, tierLevel: 2,
      lines: [{ productId: fx.wireId, qty: 12.5 }],
      payments: [{ method: "CASH", amount: 400 }],
    });
    eq("สายไฟ 12.5 เมตร x 25 (ราคาช่าง) = 312.50", sale.total, 312.5);
    eq("เงินทอน 87.50", sale.changeAmount, 87.5);
    const stock = await getStockByProduct(fx.pool, fx.wireId);
    eq("สายไฟเหลือ 87.5 เมตร", stock[0].qtyOnHand, 87.5);
  }

  // -----------------------------------------------------------------
  section("ตัวโชว์โคมไฟ - ไม่ถูกนับเป็นของพร้อมขาย");
  {
    const before = await lookupProduct(fx.pool, fx.lampId);
    eq("ก่อนตั้งโชว์ พร้อมขาย 3 ชุด", before!.qtySellable, 3);
    eq("ยังไม่มีตัวโชว์", before!.qtyOnDisplay, 0);

    const missing = await getLampsWithoutDisplay(fx.pool);
    check("รายงานบอกว่าโคมไฟรุ่นนี้ยังไม่มีตัวโชว์",
      missing.some((m) => m.productId === fx.lampId));

    const unit = await setUpDisplay(fx.pool, {
      productId: fx.lampId,
      fromLocationId: fx.loc.get("S-A2-1")!,
      displayLocationId: fx.loc.get("D-P1")!,
      spotLabel: "เสา 1 • แขวนกลาง",
      userId: fx.ownerId,
      displayPrice: 3500,
    });
    eq("ตัวโชว์บอกจุดที่แขวนได้", unit.spotLabel, "เสา 1 • แขวนกลาง");

    const after = await lookupProduct(fx.pool, fx.lampId);
    eq("หลังตั้งโชว์ พร้อมขายเหลือ 2 ชุด", after!.qtySellable, 2);
    eq("ตัวโชว์นับแยก 1 ตัว", after!.qtyOnDisplay, 1);
    eq("ยอดรวมทั้งร้านยังเป็น 3 (ของไม่ได้หายไปไหน)",
      after!.qtySellable + after!.qtyOnDisplay, 3);
    eq("บอกได้ว่าตัวโชว์อยู่จุดไหน", after!.displayUnits[0].locationCode, "D-P1");

    const missing2 = await getLampsWithoutDisplay(fx.pool);
    check("ตั้งโชว์แล้วหลุดจากรายการโคมที่ยังไม่มีตัวโชว์",
      !missing2.some((m) => m.productId === fx.lampId));

    // ขายปกติ 2 ชุด ต้องไม่แตะตัวโชว์
    const sale = await createSale(fx.pool, {
      userId: fx.staffId, tierLevel: 1,
      lines: [{ productId: fx.lampId, qty: 2 }],
      payments: [{ method: "CASH", amount: 8000 }],
    });
    check("ขายปกติไม่หยิบจากจุดโชว์",
      sale.lines[0].picks.every((p) => p.locationCode !== "D-P1"),
      JSON.stringify(sale.lines[0].picks.map((p) => p.locationCode)));

    const after2 = await lookupProduct(fx.pool, fx.lampId);
    eq("ขายหมดแล้วพร้อมขายเหลือ 0", after2!.qtySellable, 0);
    eq("ตัวโชว์ยังอยู่ครบ 1 ตัว", after2!.qtyOnDisplay, 1);

    // ขายตัวโชว์ต้องเลือกเจตนา และใช้ราคาตัวโชว์
    const dSale = await createSale(fx.pool, {
      userId: fx.staffId, tierLevel: 1,
      lines: [{ productId: fx.lampId, qty: 1, displayUnitId: unit.id }],
      payments: [{ method: "CASH", amount: 3500 }],
    });
    eq("ขายตัวโชว์ใช้ราคาตัวโชว์ 3,500", dSale.total, 3500);
    check("บิลระบุว่าเป็นตัวโชว์", dSale.lines[0].isDisplayUnit);
    eq("หยิบจากจุดโชว์", dSale.lines[0].picks[0].locationCode, "D-P1");

    await expectThrow("ขายตัวโชว์ที่ขายไปแล้วซ้ำไม่ได้", () =>
      createSale(fx.pool, {
        userId: fx.staffId, tierLevel: 1,
        lines: [{ productId: fx.lampId, qty: 1, displayUnitId: unit.id }],
        payments: [{ method: "CASH", amount: 3500 }],
      })
    );
  }

  // -----------------------------------------------------------------
  section("ขายเกินยอด - ขายได้ แต่ตั้งธงให้ไปนับ");
  {
    // สโตร์เหลือ 35 ขาย 40 -> ขาด 5
    const sale = await createSale(fx.pool, {
      userId: fx.staffId, tierLevel: 1,
      lines: [{ productId: fx.bulbId, qty: 40 }],
      payments: [{ method: "CASH", amount: 3200 }],
    });
    eq("ขายได้ ไม่บล็อก", sale.lines[0].qty, 40);
    eq("มีช่องที่ขายเกินยอด 1 ช่อง", sale.oversoldLocations.length, 1);
    check("มีคำเตือนบอกให้ไปนับ",
      sale.warnings.some((w) => w.includes("ต้องไปนับ")), sale.warnings.join(" | "));

    const stock = await getStockByProduct(fx.pool, fx.bulbId);
    const neg = stock.find((s) => s.qtyOnHand < 0);
    eq("ยอดติดลบ 5 เพื่อให้เห็นว่าผิด", neg?.qtyOnHand, -5);
    // ต้องลงติดลบที่ช่องสโตร์ซึ่งของเพิ่งหมด ไม่ใช่ช่องหน้าร้านที่ว่างอยู่ก่อนแล้ว
    // ถ้าลงผิดช่อง ระบบจะสั่งให้พนักงานเดินไปนับผิดที่
    eq("ยอดติดลบลงที่ช่องที่ของเพิ่งหมดจริง", neg?.locationCode, "S-A1-1");

    const mv = await fx.pool.query<Record<string, unknown>>(
      "SELECT count(*) AS n FROM stock_movement WHERE reason='OVERSELL'"
    );
    eq("บันทึกเหตุผล OVERSELL แยกจากการขายปกติ", num(mv.rows[0].n), 1);

    const queue = await getCountQueue(fx.pool);
    check("ช่องที่ติดลบขึ้นคิวนับเป็นอันดับแรก",
      queue[0]?.qtyOnHand < 0 && queue[0]?.priority === 100,
      JSON.stringify(queue[0] ?? {}));
  }

  // -----------------------------------------------------------------
  section("ปุ่ม 'หาไม่เจอ'");
  {
    // เตรียมของไว้ 2 ช่อง แล้วแจ้งว่าหาไม่เจอที่ช่องแรก
    await receiveGoods(fx.pool, {
      userId: fx.ownerId,
      lines: [
        { productId: fx.bulbId, qty: 20, unitCost: 40, locationId: fx.loc.get("F-A1-1")! },
        { productId: fx.bulbId, qty: 12, unitCost: 40, locationId: fx.loc.get("F-A2-1")! },
      ],
    });

    const res = await reportNotFound(fx.pool, {
      productId: fx.bulbId,
      locationId: fx.loc.get("F-A1-1")!,
      userId: fx.staffId,
    });
    check("บอกช่องอื่นที่ยังมีของ", res.alternatives.length > 0);
    check("คำแนะนำบอกช่องที่ควรไปดูต่อ",
      res.advice.includes("F-A2-1"), res.advice);
    check("เปิดรอบนับให้อัตโนมัติ", res.countSessionId > 0);

    const sess = await fx.pool.query<Record<string, unknown>>(
      "SELECT kind, status FROM count_session WHERE id=$1", [res.countSessionId]
    );
    eq("รอบนับที่เปิดเป็นแบบนับเฉพาะจุด", str(sess.rows[0].kind), "SPOT");

    const queue = await getCountQueue(fx.pool);
    check("ช่องที่ถูกแจ้งขึ้นคิวนับ",
      queue.some((q) => q.locationCode === "F-A1-1" && q.openNotFound > 0));

    // แจ้งตัวโชว์: ระบบต้องเตือนว่าที่เห็นอาจเป็นตัวโชว์
    await setUpDisplay(fx.pool, {
      productId: fx.lampId,
      fromLocationId: fx.loc.get("S-A2-1")!,
      displayLocationId: fx.loc.get("D-P1")!,
      spotLabel: "เสา 1 • แขวนกลาง",
      userId: fx.ownerId,
    });
    const res2 = await reportNotFound(fx.pool, {
      productId: fx.lampId,
      locationId: fx.loc.get("S-A2-1")!,
      userId: fx.staffId,
    });
    check("เตือนว่าของที่เห็นอาจเป็นตัวโชว์",
      res2.advice.includes("ตัวโชว์"), res2.advice);
  }

  // -----------------------------------------------------------------
  section("นับสต๊อกและปรับยอด");
  {
    const binId = fx.loc.get("F-A1-1")!;
    const before = await getStockByProduct(fx.pool, fx.bulbId);
    const beforeQty = before.find((s) => s.locationId === binId)!.qtyOnHand;
    eq("ก่อนนับ ช่อง F-A1-1 มี 20 ตามที่รับเข้า", beforeQty, 20);

    const sess = await startCountSession(fx.pool, {
      userId: fx.staffId, kind: "CYCLE", locationIds: [binId],
    });
    check("เปิดรอบนับได้", sess.sessionId > 0);
    eq("เลขที่รอบนับขึ้นต้นด้วย CT", sess.docNo.slice(0, 2), "CT");

    // นับได้จริง 17 (หายไป 3)
    const rec = await recordCount(fx.pool, {
      sessionId: sess.sessionId, locationId: binId,
      productId: fx.bulbId, countedQty: 17, userId: fx.staffId,
    });
    eq("ผลต่าง -3", rec.variance, -3);

    // เจอสายไฟวางผิดช่องอยู่ในช่องนี้ด้วย
    const rec2 = await recordCount(fx.pool, {
      sessionId: sess.sessionId, locationId: binId,
      productId: fx.wireId, countedQty: 4, userId: fx.staffId,
      note: "เจอสายไฟวางผิดช่อง",
    });
    check("จับได้ว่าเจอของที่ระบบไม่รู้ว่าอยู่ช่องนี้", rec2.isNewFind);

    const posted = await postCountSession(fx.pool, {
      sessionId: sess.sessionId, userId: fx.ownerId,
    });
    eq("ปรับยอด 2 รายการ", posted.adjusted, 2);

    const after = await getStockByProduct(fx.pool, fx.bulbId);
    eq("หลังนับ ช่อง F-A1-1 เหลือ 17",
      after.find((s) => s.locationId === binId)!.qtyOnHand, 17);
    const wireAfter = await getStockByProduct(fx.pool, fx.wireId);
    eq("สายไฟที่วางผิดช่อง เข้าระบบแล้ว 4 เมตร",
      wireAfter.find((s) => s.locationId === binId)?.qtyOnHand, 4);

    const counted = await fx.pool.query<Record<string, unknown>>(
      "SELECT last_counted_at FROM stock_balance WHERE product_id=$1 AND location_id=$2",
      [fx.bulbId, binId]
    );
    check("บันทึกวันที่นับล่าสุด", counted.rows[0].last_counted_at !== null);

    await expectThrow("ปิดรอบนับซ้ำไม่ได้", () =>
      postCountSession(fx.pool, { sessionId: sess.sessionId, userId: fx.ownerId })
    );
  }

  // -----------------------------------------------------------------
  section("ย้ายของและยกเลิกบิล");
  {
    const from = fx.loc.get("F-A2-1")!;
    const to = fx.loc.get("F-A1-3")!;
    await transferStock(fx.pool, {
      productId: fx.bulbId, fromLocationId: from, toLocationId: to,
      qty: 5, userId: fx.staffId, note: "เติมของช่องหน้า",
    });
    const st = await getStockByProduct(fx.pool, fx.bulbId);
    eq("ช่องต้นทางลดลงเหลือ 7", st.find((s) => s.locationId === from)?.qtyOnHand, 7);
    eq("ช่องปลายทางเพิ่มเป็น 5", st.find((s) => s.locationId === to)?.qtyOnHand, 5);

    const sale = await createSale(fx.pool, {
      userId: fx.staffId, tierLevel: 3,
      lines: [{ productId: fx.bulbId, qty: 4 }],
      payments: [{ method: "CASH", amount: 300 }],
    });
    eq("ราคาช่างขายส่ง 4 x 62 = 248", sale.total, 248);
    const pickedLoc = sale.lines[0].picks[0].locationId;
    const beforeVoid = (await getStockByProduct(fx.pool, fx.bulbId))
      .find((s) => s.locationId === pickedLoc)!.qtyOnHand;

    const voided = await voidSale(fx.pool, {
      saleId: sale.saleId, userId: fx.ownerId, reason: "ลูกค้าเปลี่ยนใจ",
    });
    eq("ยกเลิกแล้วคืนของ 4", voided.restored, 4);
    const afterVoid = (await getStockByProduct(fx.pool, fx.bulbId))
      .find((s) => s.locationId === pickedLoc)!.qtyOnHand;
    eq("ของกลับเข้าช่องเดิม ไม่ใช่ช่องอื่น", afterVoid, beforeVoid + 4);

    await expectThrow("ยกเลิกบิลซ้ำไม่ได้", () =>
      voidSale(fx.pool, { saleId: sale.saleId, userId: fx.ownerId, reason: "ซ้ำ" })
    );
  }

  // -----------------------------------------------------------------
  section("สิทธิ์และการอนุมัติ");
  {
    const user = await authenticate(fx.pool, "S01", "1357");
    eq("ล็อกอินด้วย PIN ถูกต้อง", user?.name, "พนักงาน 1");
    eq("PIN ผิดล็อกอินไม่ได้", await authenticate(fx.pool, "S01", "9999"), null);
    const owner = await verifyOwnerPin(fx.pool, "246810");
    eq("PIN เจ้าของยืนยันได้", owner?.role, "OWNER");
    eq("PIN พนักงานใช้อนุมัติแทนเจ้าของไม่ได้",
      await verifyOwnerPin(fx.pool, "1357"), null);

    check("ห้าม PIN เลขซ้ำ", validatePinFormat("1111") !== null);
    check("ห้าม PIN 1234", validatePinFormat("1234") !== null);
    check("PIN ปกติผ่าน", validatePinFormat("2846") === null);

    await expectThrow("ขายราคาพิเศษโดยไม่มีคนอนุมัติไม่ได้", () =>
      createSale(fx.pool, {
        userId: fx.staffId, tierLevel: 4,
        lines: [{ productId: fx.bulbId, qty: 1 }],
        payments: [{ method: "CASH", amount: 100 }],
      })
    );
    const ok = await createSale(fx.pool, {
      userId: fx.staffId, tierLevel: 4, approvedBy: fx.ownerId,
      lines: [{ productId: fx.bulbId, qty: 1 }],
      payments: [{ method: "CASH", amount: 100 }],
    });
    eq("มีเจ้าของอนุมัติแล้วขายราคาพิเศษได้ 55", ok.total, 55);

    await expectThrow("รับเงินน้อยกว่ายอดบิลไม่ได้", () =>
      createSale(fx.pool, {
        userId: fx.staffId, tierLevel: 1,
        lines: [{ productId: fx.bulbId, qty: 1 }],
        payments: [{ method: "CASH", amount: 10 }],
      })
    );
  }

  // -----------------------------------------------------------------
  section("ความถูกต้องของบัญชีสต๊อก");
  {
    const problems = await verifyLedgerIntegrity(fx.pool);
    eq("ยอดคงเหลือตรงกับผลรวมบัญชีเดินสะพัดทุกช่อง", problems.length, 0);

    const orphan = await fx.pool.query<Record<string, unknown>>(
      `SELECT count(*) AS n FROM stock_movement WHERE qty_delta = 0`
    );
    eq("ไม่มีรายการเคลื่อนไหวที่จำนวนเป็น 0", num(orphan.rows[0].n), 0);

    // ทุกการขายต้องมีบันทึกว่าหยิบจากช่องไหน
    const noPick = await fx.pool.query<Record<string, unknown>>(
      `SELECT count(*) AS n FROM sale_line sl
       WHERE NOT EXISTS (SELECT 1 FROM sale_line_pick p WHERE p.sale_line_id = sl.id)`
    );
    eq("ทุกบรรทัดขายบอกได้ว่าหยิบจากช่องไหน", num(noPick.rows[0].n), 0);
  }

  await fx.pool.close();

  // -----------------------------------------------------------------
  console.log(`\n${"═".repeat(62)}`);
  console.log(`ผ่าน ${passed} รายการ / ไม่ผ่าน ${failed} รายการ`);
  if (failed > 0) {
    console.log("\nรายการที่ไม่ผ่าน:");
    failures.forEach((f) => console.log(`  • ${f}`));
    process.exit(1);
  }
  console.log("ผ่านทั้งหมด");
}

main().catch((err) => {
  console.error("\nเทสต์ล้มเหลว:", err);
  process.exit(1);
});
