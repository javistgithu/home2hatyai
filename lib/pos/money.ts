/**
 * การคำนวณเงินและจำนวน
 *
 * ปัญหาที่ต้องกันตั้งแต่แรก:
 *   0.1 + 0.2 === 0.30000000000000004
 * ถ้าปล่อยไว้ พอบวกกัน 30 บรรทัด ยอดท้ายบิลจะเพี้ยน 1 สตางค์
 * แล้วเงินในลิ้นชักจะไม่ตรงกับระบบทุกวัน จนพนักงานเลิกเชื่อระบบ
 *
 * วิธีแก้: คำนวณทุกอย่างด้วยจำนวนเต็ม "สตางค์" แล้วค่อยแปลงกลับเป็นบาท
 * ตอนแสดงผล/บันทึกลงฐานข้อมูล
 */

/** บาท -> สตางค์ (จำนวนเต็ม) */
export function toSatang(baht: number): number {
  return Math.round(baht * 100);
}

/** สตางค์ -> บาท ทศนิยม 2 ตำแหน่ง */
export function toBaht(satang: number): number {
  return Math.round(satang) / 100;
}

/** ปัดเงินเป็นทศนิยม 2 ตำแหน่ง */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** ปัดจำนวนสินค้าเป็นทศนิยม 3 ตำแหน่ง (สายไฟตัดเป็นเมตร/เศษเมตรได้) */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * คิดยอดรวมบรรทัด = ราคาต่อหน่วย x จำนวน - ส่วนลด
 * คูณในหน่วยสตางค์เพื่อไม่ให้เศษหาย
 */
export function lineTotal(
  unitPrice: number,
  qty: number,
  discount = 0
): number {
  const grossSatang = Math.round(toSatang(unitPrice) * qty);
  const netSatang = grossSatang - toSatang(discount);
  return toBaht(netSatang);
}

/**
 * ถอด VAT ออกจากราคาที่รวม VAT แล้ว (แบบร้านค้าปลีกไทย)
 *   ยอดก่อน VAT = total x 100/107
 *   VAT         = total - ยอดก่อน VAT
 * ต้องคำนวณจากยอดรวมท้ายบิลครั้งเดียว ห้ามคิดทีละบรรทัดแล้วเอามาบวกกัน
 * เพราะการปัดเศษทีละบรรทัดจะทำให้ยอดไม่ตรงกับที่สรรพากรคำนวณ
 */
export function extractVat(
  totalIncVat: number,
  vatRate: number
): { base: number; vat: number } {
  const totalSatang = toSatang(totalIncVat);
  const baseSatang = Math.round((totalSatang * 100) / (100 + vatRate));
  return {
    base: toBaht(baseSatang),
    vat: toBaht(totalSatang - baseSatang),
  };
}

/** บวก VAT เข้ากับราคาที่ยังไม่รวม VAT */
export function addVat(
  totalExVat: number,
  vatRate: number
): { base: number; vat: number } {
  const baseSatang = toSatang(totalExVat);
  const vatSatang = Math.round((baseSatang * vatRate) / 100);
  return { base: toBaht(baseSatang), vat: toBaht(vatSatang) };
}

/** รวมยอดหลายรายการโดยไม่ให้เศษสะสม */
export function sumMoney(values: number[]): number {
  return toBaht(values.reduce((acc, v) => acc + toSatang(v), 0));
}

/** กำไรเป็นเปอร์เซ็นต์ของราคาขาย (gross margin) */
export function marginPct(price: number, cost: number): number {
  if (price <= 0) return 0;
  return round2(((price - cost) / price) * 100);
}

/** จัดรูปแบบเงินสำหรับแสดงผล เช่น 1,250.00 */
export function formatMoney(n: number): string {
  return round2(n).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** จัดรูปแบบจำนวน ตัดศูนย์ท้ายทิ้ง เช่น 2.5 ไม่ใช่ 2.500 */
export function formatQty(n: number): string {
  const r = round3(n);
  return Number.isInteger(r)
    ? r.toLocaleString("th-TH")
    : r.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}
