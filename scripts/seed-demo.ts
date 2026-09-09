/**
 * ข้อมูลตัวอย่างสำหรับทดลองใช้ระบบ
 *
 * จำลองร้านอุปกรณ์ไฟฟ้าและโคมไฟขนาดเล็กจริง:
 * หน้าร้าน 3 ชั้นวาง สโตร์หลังร้าน 4 ชั้นวาง จุดโชว์โคมไฟ 8 จุด
 * สินค้า 30 รายการ ครอบคลุมทั้งของนับเป็นชิ้นและของตัดขายเป็นเมตร
 *
 * รันด้วย: npm run db:seed
 */

import type { DbPool } from "../lib/db";
import { createProduct, normalizeSearchKey } from "../lib/pos/catalog";
import { createRack, createDisplaySpot } from "../lib/pos/location";
import { setProductPrices } from "../lib/pos/pricing";
import { createUser } from "../lib/pos/users";
import { receiveGoods } from "../lib/pos/receiving";
import { setUpDisplay } from "../lib/pos/display";
import { num } from "../lib/db";

interface SeedProduct {
  sku: string;
  name: string;
  unit: string;
  brand?: string;
  category: string;
  isLamp?: boolean;
  countClass?: "A" | "B" | "C";
  barcode?: string;
  /** ราคา 5 ระดับ [เต็ม(5), ขายจริง(1), ช่าง(2), ส่ง(3), พิเศษ(4)] */
  prices: [number, number, number, number, number];
  cost: number;
  /** ช่องเก็บหลัก / จำนวนที่รับเข้า */
  bin: string;
  qty: number;
  /** ของบางตัวเก็บสำรองที่สโตร์ด้วย */
  backupBin?: string;
  backupQty?: number;
  spec?: Record<string, unknown>;
  /** โคมไฟ: ตั้งโชว์ที่จุดไหน */
  displaySpot?: { code: string; label: string; price?: number };
}

const CATEGORIES: [string, string][] = [
  ["BULB", "หลอดไฟ"],
  ["DOWNLIGHT", "โคมดาวน์ไลท์"],
  ["CEILING", "โคมไฟเพดาน / โคมช่อ"],
  ["OUTDOOR", "โคมไฟภายนอก / สปอร์ตไลท์"],
  ["WIRE", "สายไฟ"],
  ["BREAKER", "เบรกเกอร์ / ตู้ไฟ"],
  ["SWITCH", "ปลั๊ก / สวิตช์"],
  ["ACC", "อุปกรณ์ติดตั้ง"],
];

const PRODUCTS: SeedProduct[] = [
  // ---------------------------------------------------------- หลอดไฟ
  {
    sku: "BLB-LED9-E27-DL", name: "หลอด LED บัลบ์ 9W ขั้ว E27 แสงขาว เดย์ไลท์",
    unit: "หลอด", brand: "Philips", category: "BULB", countClass: "A",
    barcode: "8850123400019", prices: [79, 65, 58, 52, 45], cost: 38,
    bin: "F-A1-1", qty: 48, backupBin: "S-A1-1", backupQty: 120,
    spec: { watt: 9, lumen: 806, colorTemp: "6500K เดย์ไลท์", baseType: "E27", voltage: "220V", warrantyMonths: 24 },
  },
  {
    sku: "BLB-LED9-E27-WW", name: "หลอด LED บัลบ์ 9W ขั้ว E27 แสงเหลือง วอร์มไวท์",
    unit: "หลอด", brand: "Philips", category: "BULB", countClass: "A",
    barcode: "8850123400026", prices: [79, 65, 58, 52, 45], cost: 38,
    bin: "F-A1-2", qty: 36, backupBin: "S-A1-1", backupQty: 96,
    spec: { watt: 9, lumen: 806, colorTemp: "3000K วอร์มไวท์", baseType: "E27", voltage: "220V", warrantyMonths: 24 },
  },
  {
    sku: "BLB-LED13-E27-DL", name: "หลอด LED บัลบ์ 13W ขั้ว E27 แสงขาว",
    unit: "หลอด", brand: "Philips", category: "BULB", countClass: "A",
    barcode: "8850123400033", prices: [109, 89, 80, 72, 62], cost: 52,
    bin: "F-A1-3", qty: 24, backupBin: "S-A1-2", backupQty: 60,
    spec: { watt: 13, lumen: 1250, colorTemp: "6500K เดย์ไลท์", baseType: "E27", voltage: "220V", warrantyMonths: 24 },
  },
  {
    sku: "BLB-T8-18W-120", name: "หลอดนีออน LED T8 18W ยาว 120 ซม.",
    unit: "หลอด", brand: "Panasonic", category: "BULB", countClass: "B",
    barcode: "8850123400040", prices: [159, 129, 115, 105, 92], cost: 78,
    bin: "F-A2-1", qty: 20, backupBin: "S-A1-3", backupQty: 48,
    spec: { watt: 18, lumen: 1800, colorTemp: "6500K เดย์ไลท์", baseType: "T8", voltage: "220V", warrantyMonths: 12 },
  },
  {
    sku: "BLB-LED5-E14-CD", name: "หลอด LED จำปา 5W ขั้ว E14 แสงเหลือง",
    unit: "หลอด", brand: "Opple", category: "BULB", countClass: "B",
    barcode: "8850123400057", prices: [89, 72, 65, 58, 50], cost: 42,
    bin: "F-A1-4", qty: 30, backupBin: "S-A1-2", backupQty: 60,
    spec: { watt: 5, lumen: 450, colorTemp: "3000K วอร์มไวท์", baseType: "E14", voltage: "220V", isDimmable: false },
  },

  // ------------------------------------------------------ โคมดาวน์ไลท์
  {
    sku: "DL-LED9-4IN-WH", name: "โคมดาวน์ไลท์ LED 9W ฝังฝ้า 4 นิ้ว ขอบขาว",
    unit: "ชุด", brand: "Lamptan", category: "DOWNLIGHT", isLamp: true, countClass: "A",
    barcode: "8850123400064", prices: [320, 265, 235, 210, 185], cost: 155,
    bin: "F-B1-1", qty: 16, backupBin: "S-B1-1", backupQty: 40,
    spec: { watt: 9, lumen: 750, colorTemp: "6500K เดย์ไลท์", cutOutMm: 95, beamAngle: 120, material: "อลูมิเนียม", warrantyMonths: 24 },
    displaySpot: { code: "W1", label: "ผนังโชว์ 1 • แถวบน ตัวที่ 1" },
  },
  {
    sku: "DL-LED12-6IN-WH", name: "โคมดาวน์ไลท์ LED 12W ฝังฝ้า 6 นิ้ว ขอบขาว",
    unit: "ชุด", brand: "Lamptan", category: "DOWNLIGHT", isLamp: true, countClass: "A",
    barcode: "8850123400071", prices: [420, 350, 315, 285, 250], cost: 210,
    bin: "F-B1-2", qty: 12, backupBin: "S-B1-1", backupQty: 30,
    spec: { watt: 12, lumen: 1050, colorTemp: "6500K เดย์ไลท์", cutOutMm: 145, beamAngle: 120, material: "อลูมิเนียม", warrantyMonths: 24 },
    displaySpot: { code: "W1", label: "ผนังโชว์ 1 • แถวบน ตัวที่ 2" },
  },
  {
    sku: "DL-LED7-SQ-BK", name: "โคมดาวน์ไลท์ LED 7W ทรงเหลี่ยม ขอบดำ ปรับองศาได้",
    unit: "ชุด", brand: "EVE", category: "DOWNLIGHT", isLamp: true, countClass: "B",
    barcode: "8850123400088", prices: [390, 320, 288, 260, 230], cost: 195,
    bin: "F-B1-3", qty: 8, backupBin: "S-B1-2", backupQty: 18,
    spec: { watt: 7, lumen: 620, colorTemp: "3000K วอร์มไวท์", cutOutMm: 75, beamAngle: 36, material: "อลูมิเนียม" },
    displaySpot: { code: "W1", label: "ผนังโชว์ 1 • แถวกลาง ตัวที่ 1" },
  },

  // ------------------------------------------------ โคมไฟเพดาน / โคมช่อ
  {
    sku: "CL-CRYSTAL-6", name: "โคมไฟช่อระย้าคริสตัล 6 กิ่ง ขั้ว E14",
    unit: "ชุด", brand: "Deco", category: "CEILING", isLamp: true, countClass: "B",
    barcode: "8850123400095", prices: [4900, 3900, 3500, 3200, 2850], cost: 2400,
    bin: "S-C1-1", qty: 3,
    spec: { baseType: "E14", voltage: "220V", dimension: "60 x 60 x 70 ซม.", material: "คริสตัล + โครเมียม", warrantyMonths: 12 },
    displaySpot: { code: "P1", label: "เสา 1 • แขวนกลาง", price: 3500 },
  },
  {
    sku: "CL-LED24-RND", name: "โคมไฟเพดานกลม LED 24W ปรับแสง 3 สี พร้อมรีโมท",
    unit: "ชุด", brand: "Opple", category: "CEILING", isLamp: true, countClass: "A",
    barcode: "8850123400101", prices: [1290, 1050, 950, 870, 780], cost: 690,
    bin: "S-C1-2", qty: 6, backupBin: "S-C1-3", backupQty: 4,
    spec: { watt: 24, lumen: 2200, colorTemp: "ปรับได้ 3000K/4000K/6500K", dimension: "เส้นผ่านศูนย์กลาง 40 ซม.", isDimmable: true, warrantyMonths: 24 },
    displaySpot: { code: "C1", label: "ราวแขวนเพดาน A • จุดที่ 1", price: 950 },
  },
  {
    sku: "CL-PENDANT-BLK", name: "โคมไฟแขวนเดี่ยว ทรงกรวย สีดำด้าน ขั้ว E27",
    unit: "ชุด", brand: "Deco", category: "CEILING", isLamp: true, countClass: "B",
    barcode: "8850123400118", prices: [890, 720, 650, 590, 520], cost: 430,
    bin: "S-C2-1", qty: 5,
    spec: { baseType: "E27", dimension: "เส้นผ่านศูนย์กลาง 25 ซม. สายยาว 1 ม.", material: "เหล็กพ่นสี" },
    displaySpot: { code: "C1", label: "ราวแขวนเพดาน A • จุดที่ 2" },
  },
  {
    sku: "CL-FAN-LED-52", name: "พัดลมเพดานติดโคมไฟ LED 52 นิ้ว 5 ใบพัด",
    unit: "ชุด", brand: "Hatari", category: "CEILING", isLamp: true, countClass: "C",
    barcode: "8850123400125", prices: [6900, 5600, 5100, 4700, 4200], cost: 3800,
    bin: "S-C3-1", qty: 2,
    spec: { watt: 60, voltage: "220V", dimension: "52 นิ้ว", warrantyMonths: 24 },
    displaySpot: { code: "P2", label: "เสา 2 • ติดเพดานจำลอง", price: 5100 },
  },

  // ------------------------------------------ โคมภายนอก / สปอร์ตไลท์
  {
    sku: "OD-FLOOD50-IP66", name: "สปอร์ตไลท์ LED 50W กันน้ำ IP66 แสงขาว",
    unit: "ชุด", brand: "EVE", category: "OUTDOOR", isLamp: true, countClass: "A",
    barcode: "8850123400132", prices: [690, 560, 505, 460, 410], cost: 340,
    bin: "F-B2-1", qty: 10, backupBin: "S-B2-1", backupQty: 24,
    spec: { watt: 50, lumen: 4500, colorTemp: "6500K เดย์ไลท์", ipRating: "IP66", material: "อลูมิเนียมหล่อ", warrantyMonths: 24 },
    displaySpot: { code: "W2", label: "ผนังโชว์ 2 • แถวบน" },
  },
  {
    sku: "OD-WALL-IP65-BK", name: "โคมไฟติดผนังภายนอก ทรงกระบอก 2 ทาง กันน้ำ IP65",
    unit: "ชุด", brand: "Deco", category: "OUTDOOR", isLamp: true, countClass: "B",
    barcode: "8850123400149", prices: [790, 640, 580, 525, 470], cost: 390,
    bin: "F-B2-2", qty: 6, backupBin: "S-B2-1", backupQty: 12,
    spec: { baseType: "GU10", ipRating: "IP65", material: "อลูมิเนียมพ่นสีดำ", dimension: "10 x 10 x 20 ซม." },
    displaySpot: { code: "W2", label: "ผนังโชว์ 2 • แถวกลาง" },
  },
  {
    sku: "OD-SOLAR-100", name: "โคมไฟถนนโซล่าเซลล์ 100W พร้อมรีโมท",
    unit: "ชุด", brand: "Solarlite", category: "OUTDOOR", isLamp: true, countClass: "B",
    barcode: "8850123400156", prices: [2490, 1990, 1800, 1650, 1480], cost: 1280,
    bin: "S-B3-1", qty: 4,
    spec: { watt: 100, ipRating: "IP67", voltage: "โซล่าเซลล์ในตัว", warrantyMonths: 12 },
    displaySpot: { code: "P3", label: "เสา 3 • ยึดกับเสาสูง", price: 1800 },
  },

  // ----------------------------------------------------------- สายไฟ
  // สายไฟตัดขายเป็นเมตร - หน่วยนับเป็นทศนิยมได้
  {
    sku: "WIRE-VAF-2X15", name: "สายไฟ VAF 2x1.5 sq.mm (ตัดขายเป็นเมตร)",
    unit: "เมตร", brand: "Thai Yazaki", category: "WIRE", countClass: "A",
    barcode: "8850123400163", prices: [22, 18, 16, 14.5, 13], cost: 11.5,
    bin: "F-C1-1", qty: 300, backupBin: "S-D1-1", backupQty: 700,
    spec: { wireSize: "2 x 1.5 sq.mm", voltage: "300/500V", material: "ทองแดงแท้" },
  },
  {
    sku: "WIRE-VAF-2X25", name: "สายไฟ VAF 2x2.5 sq.mm (ตัดขายเป็นเมตร)",
    unit: "เมตร", brand: "Thai Yazaki", category: "WIRE", countClass: "A",
    barcode: "8850123400170", prices: [34, 28, 25, 23, 20.5], cost: 18,
    bin: "F-C1-2", qty: 250, backupBin: "S-D1-1", backupQty: 500,
    spec: { wireSize: "2 x 2.5 sq.mm", voltage: "300/500V", material: "ทองแดงแท้" },
  },
  {
    sku: "WIRE-THW-1X25", name: "สายไฟ THW 1x2.5 sq.mm สีดำ (ตัดขายเป็นเมตร)",
    unit: "เมตร", brand: "Bangkok Cable", category: "WIRE", countClass: "B",
    barcode: "8850123400187", prices: [16, 13, 11.5, 10.5, 9.5], cost: 8.2,
    bin: "F-C1-3", qty: 400, backupBin: "S-D1-2", backupQty: 800,
    spec: { wireSize: "1 x 2.5 sq.mm", voltage: "450/750V", material: "ทองแดงแท้" },
  },
  {
    sku: "WIRE-VCT-3X15", name: "สายไฟ VCT 3x1.5 sq.mm (ตัดขายเป็นเมตร)",
    unit: "เมตร", brand: "Thai Yazaki", category: "WIRE", countClass: "B",
    barcode: "8850123400194", prices: [42, 35, 32, 29, 26], cost: 23,
    bin: "F-C2-1", qty: 150, backupBin: "S-D1-2", backupQty: 300,
    spec: { wireSize: "3 x 1.5 sq.mm", voltage: "300/500V", material: "ทองแดงแท้ ฉนวน 2 ชั้น" },
  },

  // ------------------------------------------------- เบรกเกอร์ / ตู้ไฟ
  {
    sku: "BRK-MCB-16A", name: "เบรกเกอร์ลูกย่อย MCB 16A 1 โพล",
    unit: "ตัว", brand: "Schneider", category: "BREAKER", countClass: "A",
    barcode: "8850123400200", prices: [185, 150, 135, 122, 108], cost: 92,
    bin: "F-C2-2", qty: 25, backupBin: "S-D2-1", backupQty: 60,
    spec: { ampRating: "16A", voltage: "230/400V" },
  },
  {
    sku: "BRK-MCB-32A", name: "เบรกเกอร์ลูกย่อย MCB 32A 1 โพล",
    unit: "ตัว", brand: "Schneider", category: "BREAKER", countClass: "A",
    barcode: "8850123400217", prices: [205, 168, 152, 138, 122], cost: 105,
    bin: "F-C2-3", qty: 20, backupBin: "S-D2-1", backupQty: 45,
    spec: { ampRating: "32A", voltage: "230/400V" },
  },
  {
    sku: "BRK-CU-10WAY", name: "ตู้คอนซูมเมอร์ยูนิต 10 ช่อง พร้อมเมน 63A",
    unit: "ชุด", brand: "Schneider", category: "BREAKER", countClass: "B",
    barcode: "8850123400224", prices: [2290, 1850, 1670, 1530, 1370], cost: 1180,
    bin: "S-D2-2", qty: 5,
    spec: { ampRating: "63A", voltage: "230V", dimension: "10 ช่อง" },
  },
  {
    sku: "BRK-RCBO-32A", name: "เบรกเกอร์กันดูด RCBO 32A 30mA",
    unit: "ตัว", brand: "Schneider", category: "BREAKER", countClass: "B",
    barcode: "8850123400231", prices: [1290, 1050, 950, 870, 780], cost: 680,
    bin: "S-D2-3", qty: 8,
    spec: { ampRating: "32A / 30mA", voltage: "230V" },
  },

  // -------------------------------------------------- ปลั๊ก / สวิตช์
  {
    sku: "SW-1WAY-WH", name: "สวิตช์ทางเดียว 1 ช่อง สีขาว",
    unit: "ตัว", brand: "Panasonic", category: "SWITCH", countClass: "A",
    barcode: "8850123400248", prices: [59, 48, 43, 39, 34], cost: 29,
    bin: "F-A3-1", qty: 60, backupBin: "S-A2-1", backupQty: 150,
    spec: { ampRating: "16A", voltage: "250V" },
  },
  {
    sku: "SW-SOCKET-2G", name: "เต้ารับคู่ มีกราวด์ 3 ขา สีขาว",
    unit: "ตัว", brand: "Panasonic", category: "SWITCH", countClass: "A",
    barcode: "8850123400255", prices: [129, 105, 95, 86, 76], cost: 64,
    bin: "F-A3-2", qty: 45, backupBin: "S-A2-1", backupQty: 110,
    spec: { ampRating: "16A", voltage: "250V" },
  },
  {
    sku: "SW-PLATE-2G", name: "ฝาครอบพลาสติก 2 ช่อง สีขาว",
    unit: "ชิ้น", brand: "Panasonic", category: "SWITCH", countClass: "B",
    barcode: "8850123400262", prices: [39, 32, 28, 25, 22], cost: 18,
    bin: "F-A3-3", qty: 80, backupBin: "S-A2-2", backupQty: 200,
  },
  {
    sku: "SW-EXTCORD-5M", name: "ปลั๊กพ่วง 5 ช่อง สายยาว 5 เมตร มีสวิตช์",
    unit: "ชุด", brand: "Toshino", category: "SWITCH", countClass: "B",
    barcode: "8850123400279", prices: [420, 340, 308, 280, 250], cost: 218,
    bin: "F-A4-1", qty: 14, backupBin: "S-A2-3", backupQty: 30,
    spec: { ampRating: "10A", voltage: "250V", warrantyMonths: 12 },
  },

  // ------------------------------------------------- อุปกรณ์ติดตั้ง
  {
    sku: "ACC-TAPE-PVC", name: "เทปพันสายไฟ PVC สีดำ 10 หลา",
    unit: "ม้วน", brand: "3M", category: "ACC", countClass: "A",
    barcode: "8850123400286", prices: [29, 23, 20, 18, 16], cost: 13,
    bin: "F-A4-2", qty: 100, backupBin: "S-A3-1", backupQty: 240,
  },
  {
    sku: "ACC-CLIP-6MM", name: "เข็มขัดรัดสายไฟ 6 มม. (แพ็ค 100 ตัว)",
    unit: "แพ็ค", brand: "-", category: "ACC", countClass: "B",
    barcode: "8850123400293", prices: [45, 36, 32, 29, 26], cost: 22,
    bin: "F-A4-3", qty: 40, backupBin: "S-A3-1", backupQty: 80,
  },
  {
    sku: "ACC-PVC-HALF", name: 'ท่อร้อยสายไฟ PVC สีเหลือง 1/2 นิ้ว ยาว 4 เมตร',
    unit: "เส้น", brand: "SCG", category: "ACC", countClass: "B",
    barcode: "8850123400309", prices: [59, 48, 43, 39, 35], cost: 31,
    bin: "S-A3-2", qty: 50,
  },
  {
    sku: "ACC-SOCKET-E27", name: "ขั้วหลอดเซรามิก E27 แบบห้อย",
    unit: "ตัว", brand: "-", category: "ACC", countClass: "C",
    barcode: "8850123400316", prices: [45, 36, 32, 29, 26], cost: 21,
    bin: "S-A3-3", qty: 35,
  },
];

const DISPLAY_SPOTS: { code: string; label: string; walkOrder: number }[] = [
  { code: "P1", label: "เสา 1 (หน้าประตูทางเข้า)", walkOrder: 5010 },
  { code: "P2", label: "เสา 2 (กลางร้าน)", walkOrder: 5020 },
  { code: "P3", label: "เสา 3 (ใกล้เคาน์เตอร์)", walkOrder: 5030 },
  { code: "P4", label: "เสา 4 (มุมขวาหลังร้าน)", walkOrder: 5040 },
  { code: "C1", label: "ราวแขวนเพดาน A (แถวหน้า)", walkOrder: 5050 },
  { code: "C2", label: "ราวแขวนเพดาน B (แถวหลัง)", walkOrder: 5060 },
  { code: "W1", label: "ผนังโชว์ 1 (ดาวน์ไลท์)", walkOrder: 5070 },
  { code: "W2", label: "ผนังโชว์ 2 (โคมภายนอก)", walkOrder: 5080 },
];

export async function seedDemo(pool: DbPool, log = console.log): Promise<void> {
  // ---------------------------------------------------------- ผู้ใช้
  log("[seed] สร้างผู้ใช้งาน");
  const ownerId = await createUser(pool, {
    code: "OWNER", name: "เจ้าของร้าน", pin: "246810", role: "OWNER",
  });
  await createUser(pool, {
    code: "S01", name: "พนักงาน คนที่ 1", pin: "1357", role: "STAFF",
  });
  await createUser(pool, {
    code: "S02", name: "พนักงาน คนที่ 2", pin: "2468", role: "STAFF",
  });

  // -------------------------------------------------------- หมวดสินค้า
  log("[seed] สร้างหมวดสินค้า");
  const catIds = new Map<string, number>();
  for (const [code, name] of CATEGORIES) {
    const res = await pool.query<Record<string, unknown>>(
      `INSERT INTO product_category (code, name_th) VALUES ($1,$2) RETURNING id`,
      [code, name]
    );
    catIds.set(code, num(res.rows[0].id));
  }

  // ------------------------------------------------------- ผังชั้นวาง
  log("[seed] สร้างผังชั้นวาง");
  // หน้าร้าน: ชั้นวางเตี้ย หยิบง่าย ของขายเร็วอยู่ตรงนี้
  await createRack(pool, { zoneCode: "F", rack: "A", levels: 4, binsPerLevel: 4 });
  await createRack(pool, { zoneCode: "F", rack: "B", levels: 3, binsPerLevel: 4 });
  await createRack(pool, { zoneCode: "F", rack: "C", levels: 3, binsPerLevel: 4 });
  // สโตร์หลังร้าน: ชั้นสูง เก็บของสำรอง
  await createRack(pool, { zoneCode: "S", rack: "A", levels: 4, binsPerLevel: 4 });
  await createRack(pool, { zoneCode: "S", rack: "B", levels: 4, binsPerLevel: 4 });
  await createRack(pool, { zoneCode: "S", rack: "C", levels: 4, binsPerLevel: 4 });
  await createRack(pool, { zoneCode: "S", rack: "D", levels: 4, binsPerLevel: 4 });

  log("[seed] สร้างจุดโชว์โคมไฟ");
  for (const s of DISPLAY_SPOTS) {
    await createDisplaySpot(pool, {
      spotCode: s.code, labelTh: s.label, walkOrder: s.walkOrder,
    });
  }

  const locIds = new Map<string, number>();
  const locRes = await pool.query<Record<string, unknown>>(
    "SELECT id, code FROM location"
  );
  for (const r of locRes.rows) locIds.set(String(r.code), num(r.id));

  // -------------------------------------------------------- ซัพพลายเออร์
  log("[seed] สร้างซัพพลายเออร์");
  const supRes = await pool.query<Record<string, unknown>>(
    `INSERT INTO supplier (code, name, phone) VALUES
       ('SUP01','บริษัท ไฟฟ้ารุ่งเรือง จำกัด','074-111111'),
       ('SUP02','ห้างหุ้นส่วน แสงทองอิเล็คทริค','074-222222'),
       ('SUP03','โรงงานโคมไฟ เดคโค ไลท์ติ้ง','02-3333333')
     RETURNING id`
  );
  const supplierId = num(supRes.rows[0].id);

  // -------------------------------------------------------------- ลูกค้า
  log("[seed] สร้างลูกค้า");
  const customers: [string, string, string, number][] = [
    ["C001", "ช่างสมชาย รับเหมาไฟฟ้า", "081-1111111", 2],
    ["C002", "ร้านไฟฟ้าพรชัย (ซื้อไปขายต่อ)", "081-2222222", 3],
    ["C003", "บริษัท รับเหมาก่อสร้างใต้ จำกัด", "074-333333", 3],
    ["C004", "คุณสมหญิง (ลูกค้าประจำ)", "089-4444444", 1],
    ["C005", "โครงการหมู่บ้านสุขใจ", "074-555555", 4],
  ];
  for (const [code, name, phone, tier] of customers) {
    await pool.query(
      `INSERT INTO customer (code, name, phone, default_tier_level, search_key)
       VALUES ($1,$2,$3,$4,$5)`,
      [code, name, phone, tier, normalizeSearchKey(code, name, phone)]
    );
  }

  // ------------------------------------------------------------- สินค้า
  log(`[seed] สร้างสินค้า ${PRODUCTS.length} รายการ`);
  const productIds = new Map<string, number>();
  for (const p of PRODUCTS) {
    const id = await createProduct(pool, {
      sku: p.sku,
      nameTh: p.name,
      unit: p.unit,
      brand: p.brand ?? null,
      categoryId: catIds.get(p.category) ?? null,
      isLamp: p.isLamp ?? false,
      countClass: p.countClass ?? "C",
      reorderPoint: p.unit === "เมตร" ? 100 : 6,
      barcodes: p.barcode ? [{ barcode: p.barcode }] : [],
      spec: p.spec ?? null,
    });
    productIds.set(p.sku, id);

    // ราคา 5 ระดับ: [เต็ม(5), ขายจริง(1), ช่าง(2), ส่ง(3), พิเศษ(4)]
    const [full, retail, tech, wholesale, special] = p.prices;
    await setProductPrices(pool, {
      productId: id,
      userId: ownerId,
      reason: "ตั้งราคาตอนเปิดใช้ระบบ",
      prices: [
        { tierLevel: 5, price: full },
        { tierLevel: 1, price: retail },
        { tierLevel: 2, price: tech },
        { tierLevel: 3, price: wholesale },
        { tierLevel: 4, price: special },
      ],
    });
  }

  // --------------------------------------------------------- รับของเข้า
  log("[seed] รับของเข้าตามช่องเก็บ");
  const receiveLines = [];
  for (const p of PRODUCTS) {
    const pid = productIds.get(p.sku)!;
    const binId = locIds.get(p.bin);
    if (!binId) throw new Error(`ไม่พบช่อง ${p.bin} สำหรับ ${p.sku}`);
    receiveLines.push({ productId: pid, qty: p.qty, unitCost: p.cost, locationId: binId });
    if (p.backupBin && p.backupQty) {
      const backupId = locIds.get(p.backupBin);
      if (!backupId) throw new Error(`ไม่พบช่องสำรอง ${p.backupBin}`);
      receiveLines.push({
        productId: pid, qty: p.backupQty, unitCost: p.cost, locationId: backupId,
      });
    }
  }
  await receiveGoods(pool, {
    supplierId,
    supplierDoc: "ยอดยกมาตอนเปิดใช้ระบบ",
    lines: receiveLines,
    userId: ownerId,
    note: "ข้อมูลตั้งต้นสำหรับทดลองใช้",
  });

  // ------------------------------------------------------ ตั้งโชว์โคมไฟ
  log("[seed] ยกโคมไฟไปตั้งโชว์");
  for (const p of PRODUCTS) {
    if (!p.displaySpot) continue;
    const pid = productIds.get(p.sku)!;
    const spotId = locIds.get(`D-${p.displaySpot.code}`);
    if (!spotId) throw new Error(`ไม่พบจุดโชว์ D-${p.displaySpot.code}`);
    await setUpDisplay(pool, {
      productId: pid,
      fromLocationId: locIds.get(p.bin)!,
      displayLocationId: spotId,
      spotLabel: p.displaySpot.label,
      userId: ownerId,
      condition: "NEW",
      displayPrice: p.displaySpot.price ?? null,
      isSellable: true,
    });
  }

  // ------------------------------------------- กฎเติมของหน้าร้าน
  log("[seed] ตั้งกฎเติมของหน้าร้าน");
  for (const p of PRODUCTS) {
    if (!p.backupBin) continue;
    const pid = productIds.get(p.sku)!;
    const binId = locIds.get(p.bin)!;
    const min = p.unit === "เมตร" ? 50 : Math.max(3, Math.floor(p.qty * 0.25));
    await pool.query(
      `INSERT INTO replenish_rule (product_id, location_id, min_qty, max_qty)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [pid, binId, min, p.qty]
    );
  }

  log("[seed] เสร็จแล้ว");
}
