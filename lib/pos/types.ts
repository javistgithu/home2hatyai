/** ชนิดข้อมูลกลางของระบบ POS */

// ---------------------------------------------------------------- ราคา
export interface PriceTier {
  level: number;
  code: string;
  nameTh: string;
  descriptionTh: string | null;
  isDefault: boolean;
  requiresApproval: boolean;
  isAnchor: boolean;
  minMarginPct: number | null;
  colorHex: string;
  sortOrder: number;
}

export interface ProductPrice {
  tierLevel: number;
  price: number;
}

// ------------------------------------------------------------ ตำแหน่ง
export type LocationKind =
  | "BIN"
  | "DISPLAY_SPOT"
  | "STAGING"
  | "DAMAGED"
  | "RESERVED";

export type ZoneKind = "SHOP" | "STORE" | "DISPLAY" | "OTHER";

export interface LocationRef {
  id: number;
  code: string;
  labelTh: string;
  kind: LocationKind;
  zoneCode: string;
  zoneName: string;
  zoneKind: ZoneKind;
  walkOrder: number;
  pickPriority: number;
  isPickable: boolean;
}

// -------------------------------------------------------------- สินค้า
export interface ProductSummary {
  id: number;
  sku: string;
  nameTh: string;
  unit: string;
  brand: string | null;
  isLamp: boolean;
  categoryName: string | null;
  countClass: "A" | "B" | "C";
  reorderPoint: number;
  costAvg: number;
}

export interface ProductSpec {
  watt: number | null;
  lumen: number | null;
  colorTemp: string | null;
  baseType: string | null;
  voltage: string | null;
  ipRating: string | null;
  beamAngle: number | null;
  cutOutMm: number | null;
  dimension: string | null;
  material: string | null;
  wireSize: string | null;
  ampRating: string | null;
  warrantyMonths: number | null;
  isDimmable: boolean;
}

/** ยอดคงเหลือ 1 ช่อง */
export interface StockAtLocation {
  locationId: number;
  locationCode: string;
  locationLabel: string;
  locationKind: LocationKind;
  zoneCode: string;
  zoneName: string;
  qtyOnHand: number;
  qtyReserved: number;
  qtyAvailable: number;
  walkOrder: number;
  pickPriority: number;
  isPickable: boolean;
  lastCountedAt: string | null;
}

/** ตัวโชว์ 1 ตัว */
export interface DisplayUnitInfo {
  id: number;
  productId: number;
  locationId: number;
  locationCode: string;
  locationLabel: string;
  spotLabel: string;
  status:
    | "ON_DISPLAY"
    | "RESERVED"
    | "SOLD"
    | "RETURNED_TO_STOCK"
    | "DAMAGED";
  condition: "NEW" | "GOOD" | "FAIR" | "DUSTY" | "DAMAGED";
  isSellable: boolean;
  displayPrice: number | null;
  photoUrl: string | null;
  installedAt: string | null;
  checkedAt: string | null;
  note: string | null;
}

/**
 * ผลลัพธ์การค้นหาสินค้า - ข้อมูลชุดเดียวที่ตอบได้ทั้ง
 * "ราคาเท่าไหร่" และ "ของอยู่ตรงไหน" ในหน้าจอเดียว
 */
export interface ProductLookup {
  product: ProductSummary;
  spec: ProductSpec | null;
  prices: ProductPrice[];
  barcodes: string[];
  /** ของที่ขายได้จริง แยกตามช่อง เรียงตามลำดับการเดินหยิบ */
  stock: StockAtLocation[];
  /** ตัวโชว์ที่แขวนอยู่ (ไม่นับเป็นของขายได้) */
  displayUnits: DisplayUnitInfo[];
  qtySellable: number;
  qtyOnDisplay: number;
  qtyReserved: number;
}

// --------------------------------------------------------------- ขาย
export interface PickRequest {
  locationId: number;
  qty: number;
}

export interface SaleLineInput {
  productId: number;
  qty: number;
  /** ถ้าไม่ระบุ ใช้ระดับราคาของทั้งบิล */
  tierLevel?: number;
  /** ระบุเมื่อพนักงานแก้ราคาเอง (ต้องมีสิทธิ์) */
  unitPrice?: number;
  discount?: number;
  /** ขายตัวโชว์ตัวนี้ */
  displayUnitId?: number | null;
  /** ระบุช่องที่หยิบเอง ถ้าไม่ระบุระบบเลือกให้ตามลำดับการเดิน */
  pickFrom?: PickRequest[];
  note?: string;
}

export type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "CREDIT";

export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  ref?: string;
}

export interface SaleInput {
  userId: number;
  tierLevel: number;
  lines: SaleLineInput[];
  customerId?: number | null;
  customerName?: string | null;
  billDiscount?: number;
  payments: PaymentInput[];
  needTaxInvoice?: boolean;
  note?: string;
  /** ผู้อนุมัติ (จำเป็นเมื่อใช้ราคาพิเศษหรือแก้ราคาเอง) */
  approvedBy?: number | null;
}

export interface SalePickResult {
  locationId: number;
  locationCode: string;
  locationLabel: string;
  qty: number;
  wasOversell: boolean;
}

export interface SaleLineResult {
  lineNo: number;
  productId: number;
  sku: string;
  productName: string;
  unit: string;
  qty: number;
  tierLevel: number;
  unitPrice: number;
  listPrice: number | null;
  discount: number;
  lineTotal: number;
  isDisplayUnit: boolean;
  /** หยิบจากช่องไหนบ้าง - พิมพ์ลงใบจัดของให้พนักงานเดินหยิบ */
  picks: SalePickResult[];
}

export interface SaleResult {
  saleId: number;
  docNo: string;
  soldAt: string;
  tierLevel: number;
  lines: SaleLineResult[];
  subtotal: number;
  billDiscount: number;
  vatBase: number;
  vatAmount: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  /** ช่องที่ยอดไม่พอแต่ขายไป - ต้องไปนับซ้ำ */
  oversoldLocations: { locationId: number; locationCode: string; sku: string }[];
  warnings: string[];
}

// ------------------------------------------------------------- นับสต๊อก
export interface CountLineInput {
  locationId: number;
  productId: number;
  countedQty: number;
  note?: string;
}

export interface CountVariance {
  lineId: number;
  productId: number;
  sku: string;
  productName: string;
  unit: string;
  locationId: number;
  locationCode: string;
  locationLabel: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  isNewFind: boolean;
  costImpact: number;
}

// --------------------------------------------------------- ผู้ใช้งาน
export interface AppUser {
  id: number;
  code: string;
  name: string;
  role: "OWNER" | "STAFF";
  isActive: boolean;
}

// ----------------------------------------------------------- ยิงบาร์โค้ด
export type ScanKind = "PRODUCT" | "LOCATION" | "UNKNOWN";

export interface ScanResult {
  kind: ScanKind;
  raw: string;
  productId?: number;
  /** ยิงบาร์โค้ดแพ็ค 1 ครั้ง = ได้กี่หน่วย */
  packQty?: number;
  locationId?: number;
}
