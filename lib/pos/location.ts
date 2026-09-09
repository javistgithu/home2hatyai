/**
 * ระบบรหัสตำแหน่งเก็บของ
 *
 * เป้าหมายเดียว: พนักงานคนไหนก็ได้ อ่านรหัสแล้วเดินไปหยิบถูกช่องภายใน 30 วินาที
 * โดยไม่ต้องถามใคร ไม่ต้องจำเอง
 *
 * รูปแบบรหัส:   S-A2-3
 *   S   โซน       (F = หน้าร้าน, S = สโตร์หลังร้าน, D = จุดโชว์)
 *   A   ชั้นวาง   (ตัวอักษร ทาสี/ติดป้ายที่หัวชั้นให้เห็นแต่ไกล)
 *   2   ชั้นที่   (นับจากล่างขึ้นบน - ล่างสุดคือ 1 เพราะคนมองจากล่างก่อน)
 *   3   ช่องที่   (นับจากซ้ายไปขวา เมื่อยืนหันหน้าเข้าชั้น)
 *
 * ทำไมต้องนับจากล่างขึ้นบน / ซ้ายไปขวา:
 * เพราะเป็นทิศทางที่คนไทยอ่านและมองโดยธรรมชาติ ถ้าสลับทิศพนักงานจะหยิบผิดช่อง
 * แล้วโทษว่าระบบผิด
 */

import type { Db } from "../db";
import { num, str, bool } from "../db";
import type { LocationRef, LocationKind } from "./types";

/** สร้างรหัสช่องจากส่วนประกอบ */
export function buildLocationCode(
  zoneCode: string,
  rack: string,
  level: number,
  bin: number
): string {
  return `${zoneCode.toUpperCase()}-${rack.toUpperCase()}${level}-${bin}`;
}

/** สร้างคำอธิบายภาษาไทยที่พิมพ์ลงป้ายและแสดงบนจอ */
export function buildLocationLabel(
  zoneName: string,
  rack: string,
  level: number,
  bin: number
): string {
  return `${zoneName} • ชั้นวาง ${rack.toUpperCase()} • ชั้น ${level} • ช่อง ${bin}`;
}

/**
 * ลำดับการเดินหยิบของ
 *
 * เรียงตาม ชั้นวาง -> ชั้น -> ช่อง เพื่อให้ pick list พาเดินรอบเดียวจบ
 * ไม่ต้องเดินย้อนกลับไปกลับมา ซึ่งเป็นสาเหตุที่พนักงานเลิกใช้ใบจัดของ
 *
 * เว้นช่องว่างระหว่างเลขไว้ (คูณ 1000/100) เพื่อให้แทรกชั้นใหม่ทีหลังได้
 * โดยไม่ต้องคำนวณใหม่ทั้งร้าน
 */
export function computeWalkOrder(
  rack: string,
  level: number,
  bin: number
): number {
  const rackNum = rack.toUpperCase().charCodeAt(0) - 64; // A=1, B=2, ...
  return rackNum * 1000 + level * 100 + bin;
}

export interface CreateRackInput {
  zoneCode: string;
  rack: string;
  levels: number;   // ชั้นวางนี้มีกี่ชั้น
  binsPerLevel: number; // ชั้นละกี่ช่อง
}

/**
 * สร้างช่องเก็บทั้งชั้นวางในครั้งเดียว
 *
 * ตอนติดตั้งระบบ ร้านหนึ่งมีเป็นร้อยช่อง ถ้าให้กรอกทีละช่องจะไม่มีวันเสร็จ
 * แล้วเจ้าของจะยอมแพ้ตั้งแต่วันแรก -> ต้องสร้างเป็นชุดได้
 */
export async function createRack(
  db: Db,
  input: CreateRackInput
): Promise<LocationRef[]> {
  const zoneRes = await db.query<{ id: string; name_th: string; code: string }>(
    "SELECT id, name_th, code FROM zone WHERE code = $1",
    [input.zoneCode.toUpperCase()]
  );
  const zone = zoneRes.rows[0];
  if (!zone) throw new Error(`ไม่พบโซนรหัส ${input.zoneCode}`);

  const created: LocationRef[] = [];
  for (let level = 1; level <= input.levels; level++) {
    for (let bin = 1; bin <= input.binsPerLevel; bin++) {
      const code = buildLocationCode(zone.code, input.rack, level, bin);
      const label = buildLocationLabel(zone.name_th, input.rack, level, bin);
      const walk = computeWalkOrder(input.rack, level, bin);

      const res = await db.query<{ id: string }>(
        `INSERT INTO location
           (code, zone_id, rack, level, bin, label_th, kind, walk_order, is_pickable)
         VALUES ($1, $2, $3, $4, $5, $6, 'BIN', $7, true)
         ON CONFLICT (code) DO NOTHING
         RETURNING id`,
        [code, zone.id, input.rack.toUpperCase(), level, bin, label, walk]
      );
      if (res.rows[0]) {
        created.push({
          id: num(res.rows[0].id),
          code,
          labelTh: label,
          kind: "BIN",
          zoneCode: zone.code,
          zoneName: zone.name_th,
          zoneKind: "OTHER",
          walkOrder: walk,
          pickPriority: 100,
          isPickable: true,
        });
      }
    }
  }
  return created;
}

/** สร้างจุดโชว์โคมไฟ 1 จุด เช่น เสา 3 หรือ ราวแขวน B */
export async function createDisplaySpot(
  db: Db,
  input: { spotCode: string; labelTh: string; walkOrder?: number }
): Promise<LocationRef> {
  const zoneRes = await db.query<{ id: string; name_th: string; code: string }>(
    "SELECT id, name_th, code FROM zone WHERE code = 'D'"
  );
  const zone = zoneRes.rows[0];
  if (!zone) throw new Error("ไม่พบโซนจุดโชว์ (D)");

  const code = `D-${input.spotCode.toUpperCase()}`;
  const res = await db.query<{ id: string }>(
    `INSERT INTO location
       (code, zone_id, rack, level, bin, label_th, kind, walk_order, is_pickable)
     VALUES ($1, $2, $3, NULL, NULL, $4, 'DISPLAY_SPOT', $5, false)
     ON CONFLICT (code) DO UPDATE SET label_th = EXCLUDED.label_th
     RETURNING id`,
    [
      code,
      zone.id,
      input.spotCode.toUpperCase(),
      `${zone.name_th} • ${input.labelTh}`,
      input.walkOrder ?? 5000,
    ]
  );

  return {
    id: num(res.rows[0].id),
    code,
    labelTh: `${zone.name_th} • ${input.labelTh}`,
    kind: "DISPLAY_SPOT",
    zoneCode: zone.code,
    zoneName: zone.name_th,
    zoneKind: "DISPLAY",
    walkOrder: input.walkOrder ?? 5000,
    pickPriority: 99,
    // จุดโชว์ห้ามถูกหยิบขายอัตโนมัติ ต้องเลือกขายตัวโชว์อย่างจงใจเท่านั้น
    isPickable: false,
  };
}

interface LocationRow {
  id: string;
  code: string;
  label_th: string;
  kind: string;
  zone_code: string;
  zone_name: string;
  zone_kind: string;
  walk_order: string;
  pick_priority: string;
  is_pickable: boolean | string;
}

function mapLocation(r: LocationRow): LocationRef {
  return {
    id: num(r.id),
    code: str(r.code),
    labelTh: str(r.label_th),
    kind: str(r.kind) as LocationKind,
    zoneCode: str(r.zone_code),
    zoneName: str(r.zone_name),
    zoneKind: str(r.zone_kind) as LocationRef["zoneKind"],
    walkOrder: num(r.walk_order),
    pickPriority: num(r.pick_priority),
    isPickable: bool(r.is_pickable),
  };
}

const LOCATION_SELECT = `
  SELECT id, code, label_th, kind, zone_code, zone_name, zone_kind,
         walk_order, pick_priority, is_pickable
  FROM v_location
`;

export async function listLocations(
  db: Db,
  opts: { zoneCode?: string; kind?: LocationKind; activeOnly?: boolean } = {}
): Promise<LocationRef[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.activeOnly !== false) where.push("is_active");
  if (opts.zoneCode) {
    params.push(opts.zoneCode.toUpperCase());
    where.push(`zone_code = $${params.length}`);
  }
  if (opts.kind) {
    params.push(opts.kind);
    where.push(`kind = $${params.length}`);
  }
  const sql =
    LOCATION_SELECT +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY pick_priority, walk_order, code";
  const res = await db.query<LocationRow>(sql, params);
  return res.rows.map(mapLocation);
}

export async function getLocationByCode(
  db: Db,
  code: string
): Promise<LocationRef | null> {
  const res = await db.query<LocationRow>(
    LOCATION_SELECT + " WHERE upper(code) = upper($1)",
    [code.trim()]
  );
  return res.rows[0] ? mapLocation(res.rows[0]) : null;
}

export async function getLocationById(
  db: Db,
  id: number
): Promise<LocationRef | null> {
  const res = await db.query<LocationRow>(LOCATION_SELECT + " WHERE id = $1", [
    id,
  ]);
  return res.rows[0] ? mapLocation(res.rows[0]) : null;
}

/** ช่องที่ใช้รองรับของที่ยังไม่ระบุตำแหน่ง */
export async function getStagingLocationId(db: Db): Promise<number> {
  const res = await db.query<{ id: string }>(
    "SELECT id FROM location WHERE code = 'F-TMP'"
  );
  if (!res.rows[0]) throw new Error("ไม่พบช่องพักของ F-TMP (ยังไม่ได้รัน migration?)");
  return num(res.rows[0].id);
}
