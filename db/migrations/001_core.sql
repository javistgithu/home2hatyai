-- =====================================================================
-- POS อุปกรณ์ไฟฟ้าและโคมไฟ - โครงสร้างฐานข้อมูลหลัก
-- =====================================================================
-- หลักการออกแบบ 3 ข้อที่ทุกตารางต้องเคารพ:
--
-- 1) ยอดสต๊อกผูกกับ "ช่องเก็บ" เสมอ ไม่ใช่ผูกกับสินค้าเฉยๆ
--    ถ้าระบบตอบได้แค่ "มี 12 ชิ้น" แต่ตอบไม่ได้ว่า "อยู่ช่องไหน"
--    พนักงานก็ยังต้องเดินหาเหมือนเดิม -> stock_balance จึงมี PK
--    เป็น (product_id, location_id) ไม่ใช่ product_id เดี่ยวๆ
--
-- 2) ทุกการเปลี่ยนแปลงยอดต้องมีบรรทัดใน stock_movement เสมอ
--    ตารางนี้เขียนอย่างเดียว ห้ามแก้ ห้ามลบ (append-only ledger)
--    และเก็บ qty_after ไว้ทุกแถว เพื่อให้ย้อนดูได้ว่า "ยอดเพี้ยนตอนไหน
--    ใครทำ เอกสารใบไหน" โดยไม่ต้องเดา
--
-- 3) ตัวโชว์คือของที่ "มีอยู่จริงแต่ขายเป็นของใหม่ไม่ได้"
--    ถ้านับรวมกับของในกล่อง ระบบจะบอกว่ามี 1 ชิ้น พนักงานไปหยิบแล้วเจอ
--    แต่เป็นตัวที่แขวนโชว์อยู่ -> ต้องแยกเป็นคนละ location เสมอ
-- =====================================================================


-- ---------------------------------------------------------------------
-- ผู้ใช้งาน
-- ---------------------------------------------------------------------
-- ล็อกอินด้วย PIN 4-6 หลัก ไม่ใช่ username/password
-- เหตุผล: หน้าร้านต้องสลับคนใช้เครื่องวันละหลายสิบครั้ง ถ้าล็อกอินช้า
-- พนักงานจะเปิดค้างไว้ใช้ร่วมกัน แล้ว audit trail จะไร้ความหมายทันที
CREATE TABLE app_user (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  pin_hash      text NOT NULL,
  role          text NOT NULL DEFAULT 'STAFF'
                CHECK (role IN ('OWNER','STAFF')),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- ผังตำแหน่งเก็บของ
-- ---------------------------------------------------------------------
-- zone = พื้นที่ใหญ่ (หน้าร้าน / สโตร์หลังร้าน / จุดโชว์)
CREATE TABLE zone (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          text NOT NULL UNIQUE,          -- F, S, D
  name_th       text NOT NULL,                 -- หน้าร้าน, สโตร์หลังร้าน, จุดโชว์
  kind          text NOT NULL
                CHECK (kind IN ('SHOP','STORE','DISPLAY','OTHER')),
  -- ลำดับที่ระบบจะเลือกหยิบก่อน: หน้าร้านเดินใกล้สุด -> เลข 1
  pick_priority int NOT NULL DEFAULT 100,
  sort_order    int NOT NULL DEFAULT 100
);

-- location = ช่องเก็บจริง 1 ช่อง (bin) หรือ 1 จุดแขวนโชว์
--
-- รหัสอ่านออกโดยไม่ต้องเปิดคู่มือ:  S-A2-3
--   S  = สโตร์หลังร้าน
--   A  = ชั้นวาง A
--   2  = ชั้นที่ 2 นับจากล่าง
--   3  = ช่องที่ 3 นับจากซ้าย
-- ป้ายที่ติดชั้นจะพิมพ์ทั้งรหัสตัวใหญ่ + บาร์โค้ด + คำอธิบายไทย
CREATE TABLE location (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  zone_id       bigint NOT NULL REFERENCES zone(id),
  rack          text,                          -- A, B, C ... หรือ P (เสา)
  level         int,                           -- ชั้นที่ (นับจากล่างขึ้นบน)
  bin           int,                           -- ช่องที่ (นับจากซ้ายไปขวา)
  label_th      text NOT NULL,                 -- "สโตร์ • ชั้นวาง A • ชั้น 2 • ช่อง 3"
  kind          text NOT NULL DEFAULT 'BIN'
                CHECK (kind IN (
                  'BIN',          -- ช่องเก็บของขายปกติ
                  'DISPLAY_SPOT', -- จุดแขวน/ตั้งโชว์ (ของในนี้ไม่ใช่ของใหม่)
                  'STAGING',      -- จุดพักของ เช่น ของที่ยังไม่เก็บเข้าชั้น
                  'DAMAGED',      -- ของเสีย/ของเคลม รอส่งคืน
                  'RESERVED'      -- ของจองไว้ให้ลูกค้า ห้ามหยิบขาย
                )),
  -- ลำดับการเดินหยิบของ ใช้เรียง pick list ให้เดินรอบเดียวจบ
  -- ไม่ต้องเดินย้อนไปย้อนมา
  walk_order    int NOT NULL DEFAULT 1000,
  is_pickable   boolean NOT NULL DEFAULT true, -- หยิบไปขายได้ไหม
  is_active     boolean NOT NULL DEFAULT true,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX location_zone_idx ON location(zone_id, walk_order);


-- ---------------------------------------------------------------------
-- สินค้า
-- ---------------------------------------------------------------------
CREATE TABLE product_category (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  name_th       text NOT NULL,
  parent_id     bigint REFERENCES product_category(id),
  sort_order    int NOT NULL DEFAULT 100
);

CREATE TABLE product (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku           text NOT NULL UNIQUE,
  name_th       text NOT NULL,
  category_id   bigint REFERENCES product_category(id),
  brand         text,
  model         text,
  -- หน่วยนับ: ชิ้น เมตร ม้วน กล่อง ชุด ตัว
  -- สายไฟตัดขายเป็นเมตรได้ -> ทุกคอลัมน์จำนวนจึงเป็น numeric(14,3)
  -- ไม่ใช่ integer  (บทเรียนราคาแพงของร้านไฟฟ้าทุกร้าน)
  unit          text NOT NULL DEFAULT 'ชิ้น',
  -- true = เป็นโคมไฟ/สินค้าที่ลูกค้าต้องเห็นของจริงก่อนซื้อ
  -- ระบบจะบังคับให้มีตัวโชว์ และเตือนถ้าไม่มี
  is_lamp       boolean NOT NULL DEFAULT false,
  cost_avg      numeric(12,4) NOT NULL DEFAULT 0,   -- ต้นทุนเฉลี่ยถ่วงน้ำหนัก
  reorder_point numeric(14,3) NOT NULL DEFAULT 0,   -- ยอดที่ควรสั่งซื้อเพิ่ม
  -- ABC class สำหรับรอบการนับ: A นับถี่สุด (ของแพง/ขายเร็ว)
  count_class   text NOT NULL DEFAULT 'C'
                CHECK (count_class IN ('A','B','C')),
  -- คีย์ค้นหาแบบตัดช่องว่าง/ขีด เพื่อให้พิมพ์ "led9w" แล้วเจอ "LED 9W"
  search_key    text NOT NULL DEFAULT '',
  is_active     boolean NOT NULL DEFAULT true,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_search_idx  ON product(search_key);
CREATE INDEX product_name_idx    ON product(name_th);
CREATE INDEX product_lamp_idx    ON product(is_lamp) WHERE is_lamp;

-- คุณสมบัติเฉพาะสินค้าไฟฟ้า/โคมไฟ
-- แยกตารางเพราะสินค้าส่วนใหญ่ (สายไฟ เบรกเกอร์) ไม่ได้ใช้ฟิลด์พวกนี้
CREATE TABLE product_spec (
  product_id      bigint PRIMARY KEY REFERENCES product(id) ON DELETE CASCADE,
  watt            numeric(10,2),        -- กำลังไฟ (W)
  lumen           int,                  -- ความสว่าง (lm)
  color_temp      text,                 -- 3000K วอร์มไวท์ / 4000K / 6500K เดย์ไลท์
  base_type       text,                 -- ขั้วหลอด E27, E14, GU10, G9, T8
  voltage         text,                 -- 220V, 12V, 24V
  ip_rating       text,                 -- IP20, IP44, IP65 (กันน้ำ)
  beam_angle      int,                  -- องศาลำแสง
  cut_out_mm      int,                  -- ขนาดรูเจาะฝ้า (ดาวน์ไลท์) หน่วย มม.
  dimension       text,                 -- กว้าง x ลึก x สูง
  material        text,                 -- อลูมิเนียม, แก้ว, อะคริลิก
  wire_size       text,                 -- ขนาดสายไฟ 2x1.5, 2x2.5 sq.mm
  amp_rating      text,                 -- พิกัดกระแส 16A, 32A
  warranty_months int,
  is_dimmable     boolean NOT NULL DEFAULT false
);

-- 1 สินค้า มีบาร์โค้ดได้หลายอัน
-- เหตุผล: บาร์โค้ดโรงงานเปลี่ยนบ่อย ของ lot เก่า/ใหม่ไม่เหมือนกัน
-- ถ้าบังคับ 1 สินค้า 1 บาร์โค้ด พนักงานจะยิงไม่ติดแล้วเลิกใช้ระบบ
CREATE TABLE product_barcode (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  barcode       text NOT NULL UNIQUE,
  kind          text NOT NULL DEFAULT 'MANUFACTURER'
                CHECK (kind IN ('MANUFACTURER','OWN_LABEL','PACK')),
  -- ถ้าเป็นบาร์โค้ดของแพ็ค/ลัง ยิง 1 ครั้ง = ได้กี่หน่วย
  pack_qty      numeric(14,3) NOT NULL DEFAULT 1,
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_barcode_product_idx ON product_barcode(product_id);


-- ---------------------------------------------------------------------
-- ราคาขาย 5 ระดับ
-- ---------------------------------------------------------------------
-- ระดับตามที่ร้านใช้จริง (ไม่ได้เรียงจากแพงไปถูก - ระดับ 5 คือแพงสุด)
--   1 ราคาขายจริง        <- ค่าตั้งต้นของลูกค้าทั่วไป
--   2 ราคาช่าง
--   3 ราคาช่างขายส่ง
--   4 ราคาพิเศษ (ต่ำสุด) <- ต้องให้เจ้าของอนุมัติ
--   5 ราคาเต็มก่อนลด     <- ราคาป้าย ใช้โชว์ว่า "ลดให้เท่าไหร่"
CREATE TABLE price_tier (
  level             int PRIMARY KEY CHECK (level BETWEEN 1 AND 5),
  code              text NOT NULL UNIQUE,
  name_th           text NOT NULL,
  description_th    text,
  is_default        boolean NOT NULL DEFAULT false,
  -- ต้องกด PIN เจ้าของก่อนใช้ราคานี้
  requires_approval boolean NOT NULL DEFAULT false,
  -- true = เป็นราคาอ้างอิงสำหรับโชว์ส่วนลด ไม่ใช่ราคาที่ตั้งใจขายจริง
  is_anchor         boolean NOT NULL DEFAULT false,
  -- กำไรขั้นต่ำที่ยอมรับได้ (%) ถ้าต่ำกว่านี้ระบบจะเตือน
  min_margin_pct    numeric(6,2),
  color_hex         text NOT NULL DEFAULT '#666666',
  sort_order        int  NOT NULL DEFAULT 100
);

CREATE TABLE product_price (
  product_id    bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  tier_level    int    NOT NULL REFERENCES price_tier(level),
  price         numeric(12,2) NOT NULL CHECK (price >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    bigint REFERENCES app_user(id),
  PRIMARY KEY (product_id, tier_level)
);

-- เก็บประวัติทุกครั้งที่ราคาเปลี่ยน ตอบคำถาม "ใครลดราคาตัวนี้"
CREATE TABLE price_change_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES product(id),
  tier_level    int    NOT NULL,
  old_price     numeric(12,2),
  new_price     numeric(12,2) NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    bigint REFERENCES app_user(id),
  reason        text
);


-- ---------------------------------------------------------------------
-- ลูกค้า
-- ---------------------------------------------------------------------
CREATE TABLE customer (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code               text NOT NULL UNIQUE,
  name               text NOT NULL,
  phone              text,
  tax_id             text,                    -- เลขผู้เสียภาษี (ออกใบกำกับเต็มรูป)
  address            text,
  -- ระดับราคาประจำตัวลูกค้า -> พอเลือกลูกค้า ราคาทั้งบิลเปลี่ยนอัตโนมัติ
  default_tier_level int NOT NULL DEFAULT 1 REFERENCES price_tier(level),
  credit_limit       numeric(12,2) NOT NULL DEFAULT 0,
  credit_days        int NOT NULL DEFAULT 0,
  search_key         text NOT NULL DEFAULT '',
  is_active          boolean NOT NULL DEFAULT true,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_search_idx ON customer(search_key);
CREATE INDEX customer_phone_idx  ON customer(phone);


-- ---------------------------------------------------------------------
-- สต๊อก
-- ---------------------------------------------------------------------
-- ยอดคงเหลือแยกตามช่องเก็บ  <-- ตารางที่แก้ปัญหา "หาไม่เจอ" โดยตรง
CREATE TABLE stock_balance (
  product_id      bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  location_id     bigint NOT NULL REFERENCES location(id),
  qty_on_hand     numeric(14,3) NOT NULL DEFAULT 0,
  -- ของที่จองไว้ให้ลูกค้าแล้ว ยังไม่ได้ส่ง -> หยิบไปขายคนอื่นไม่ได้
  qty_reserved    numeric(14,3) NOT NULL DEFAULT 0,
  last_counted_at timestamptz,      -- นับครั้งล่าสุดเมื่อไหร่
  last_movement_at timestamptz,
  PRIMARY KEY (product_id, location_id)
);
CREATE INDEX stock_balance_location_idx ON stock_balance(location_id);
-- ดัชนีสำหรับหา "ช่องไหนยังมีของ" เร็วๆ ตอนขาย
CREATE INDEX stock_balance_available_idx
  ON stock_balance(product_id) WHERE qty_on_hand > 0;

-- บัญชีเดินสะพัดของสต๊อก - เขียนอย่างเดียว ห้ามแก้ ห้ามลบ
-- ทุกแถวตอบได้ว่า: อะไร ที่ไหน เปลี่ยนเท่าไหร่ เหลือเท่าไหร่ เพราะอะไร ใครทำ
CREATE TABLE stock_movement (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  moved_at      timestamptz NOT NULL DEFAULT now(),
  product_id    bigint NOT NULL REFERENCES product(id),
  location_id   bigint NOT NULL REFERENCES location(id),
  qty_delta     numeric(14,3) NOT NULL,   -- บวก = เข้า, ลบ = ออก
  qty_after     numeric(14,3) NOT NULL,   -- ยอดคงเหลือหลังทำรายการนี้
  reason        text NOT NULL CHECK (reason IN (
                  'RECEIVE',        -- รับของเข้าจากซัพพลายเออร์
                  'SALE',           -- ขาย
                  'SALE_RETURN',    -- ลูกค้าคืนของ
                  'VOID_SALE',      -- ยกเลิกบิล คืนของเข้าสต๊อก
                  'TRANSFER_OUT',   -- ย้ายออกจากช่องนี้
                  'TRANSFER_IN',    -- ย้ายเข้าช่องนี้
                  'COUNT_ADJUST',   -- ปรับยอดจากการนับสต๊อก
                  'DAMAGE',         -- ของเสีย/แตก
                  'DISPLAY_OUT',    -- ยกออกจากกล่องไปตั้งโชว์
                  'DISPLAY_IN',     -- เก็บตัวโชว์กลับเข้าสต๊อก
                  'OVERSELL',       -- ขายทั้งที่ระบบว่ายอดไม่พอ (ตั้งธงให้ไปนับ)
                  'OPENING',        -- ยอดยกมาตอนเริ่มใช้ระบบ
                  'MANUAL_ADJUST'   -- ปรับมือ ต้องมีเหตุผลกำกับ
                )),
  ref_type      text,        -- SALE / RECEIPT / COUNT / TRANSFER / DISPLAY
  ref_id        bigint,
  user_id       bigint REFERENCES app_user(id),
  note          text
);
CREATE INDEX stock_movement_product_idx  ON stock_movement(product_id, moved_at DESC);
CREATE INDEX stock_movement_location_idx ON stock_movement(location_id, moved_at DESC);
CREATE INDEX stock_movement_ref_idx      ON stock_movement(ref_type, ref_id);
CREATE INDEX stock_movement_reason_idx   ON stock_movement(reason, moved_at DESC);

-- กฎเติมของหน้าร้าน: หน้าร้านเหลือน้อยกว่า min_qty -> เตือนให้ไปเติมจากสโตร์
CREATE TABLE replenish_rule (
  product_id   bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  location_id  bigint NOT NULL REFERENCES location(id),
  min_qty      numeric(14,3) NOT NULL DEFAULT 0,
  max_qty      numeric(14,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, location_id)
);


-- ---------------------------------------------------------------------
-- ตัวโชว์สินค้า (โคมไฟ)
-- ---------------------------------------------------------------------
-- 1 แถว = โคม 1 ตัวที่แขวน/ตั้งโชว์อยู่จริง 1 จุด
-- ยอดของตัวโชว์อยู่ใน stock_balance ที่ location kind='DISPLAY_SPOT'
-- ตารางนี้เก็บ "รายละเอียดที่สต๊อกเก็บไม่ได้": สภาพ รูป วันที่ตั้งโชว์
CREATE TABLE display_unit (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id     bigint NOT NULL REFERENCES product(id),
  location_id    bigint NOT NULL REFERENCES location(id),
  -- ป้ายจุดโชว์ที่ลูกค้า/พนักงานมองเห็นจริง เช่น "เสา 3 แถวบน ตัวที่ 2"
  spot_label     text NOT NULL,
  status         text NOT NULL DEFAULT 'ON_DISPLAY'
                 CHECK (status IN (
                   'ON_DISPLAY',       -- แขวนโชว์อยู่
                   'RESERVED',         -- ลูกค้าจองตัวโชว์นี้ไว้
                   'SOLD',             -- ขายตัวโชว์ไปแล้ว
                   'RETURNED_TO_STOCK',-- เก็บกลับเข้ากล่อง
                   'DAMAGED'           -- ชำรุด รอทิ้ง/เคลม
                 )),
  condition      text NOT NULL DEFAULT 'NEW'
                 CHECK (condition IN ('NEW','GOOD','FAIR','DUSTY','DAMAGED')),
  is_sellable    boolean NOT NULL DEFAULT true,   -- ขายตัวโชว์นี้ได้ไหม
  display_price  numeric(12,2),                   -- ราคาขายตัวโชว์ (ถ้าลดพิเศษ)
  photo_url      text,
  installed_at   timestamptz NOT NULL DEFAULT now(),
  checked_at     timestamptz,                     -- ตรวจสภาพครั้งล่าสุด
  sold_sale_id   bigint,
  note           text
);
CREATE INDEX display_unit_product_idx  ON display_unit(product_id);
CREATE INDEX display_unit_location_idx ON display_unit(location_id);
CREATE INDEX display_unit_status_idx   ON display_unit(status);


-- ---------------------------------------------------------------------
-- การขาย
-- ---------------------------------------------------------------------
CREATE TABLE sale (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_no          text NOT NULL UNIQUE,
  sold_at         timestamptz NOT NULL DEFAULT now(),
  customer_id     bigint REFERENCES customer(id),
  customer_name   text,                    -- ลูกค้าเดินเข้าร้าน ไม่ต้องสร้างประวัติ
  tier_level      int NOT NULL DEFAULT 1 REFERENCES price_tier(level),
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,  -- รวมก่อนส่วนลดท้ายบิล
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,  -- ส่วนลดท้ายบิล
  vat_rate        numeric(5,2)  NOT NULL DEFAULT 7,
  vat_amount      numeric(12,2) NOT NULL DEFAULT 0,
  total           numeric(12,2) NOT NULL DEFAULT 0,
  -- ราคาสินค้าในระบบรวม VAT อยู่แล้ว (แบบร้านค้าปลีกไทย)
  -- vat_amount จึงถอดออกมาจาก total ไม่ใช่บวกเพิ่ม
  price_includes_vat boolean NOT NULL DEFAULT true,
  cost_total      numeric(12,2) NOT NULL DEFAULT 0,  -- ต้นทุนรวม ใช้ดูกำไรบิลนี้
  status          text NOT NULL DEFAULT 'COMPLETED'
                  CHECK (status IN ('DRAFT','COMPLETED','VOIDED')),
  paid_amount     numeric(12,2) NOT NULL DEFAULT 0,
  change_amount   numeric(12,2) NOT NULL DEFAULT 0,
  need_tax_invoice boolean NOT NULL DEFAULT false,
  user_id         bigint REFERENCES app_user(id),
  approved_by     bigint REFERENCES app_user(id),   -- คนอนุมัติราคาพิเศษ
  note            text,
  voided_at       timestamptz,
  voided_by       bigint REFERENCES app_user(id),
  void_reason     text
);
CREATE INDEX sale_sold_at_idx   ON sale(sold_at DESC);
CREATE INDEX sale_customer_idx  ON sale(customer_id, sold_at DESC);
CREATE INDEX sale_status_idx    ON sale(status, sold_at DESC);

CREATE TABLE sale_line (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sale_id           bigint NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  line_no           int NOT NULL,
  product_id        bigint NOT NULL REFERENCES product(id),
  product_name      text NOT NULL,          -- snapshot ชื่อ ณ วันขาย
  unit              text NOT NULL,
  qty               numeric(14,3) NOT NULL CHECK (qty > 0),
  tier_level        int NOT NULL REFERENCES price_tier(level),
  unit_price        numeric(12,2) NOT NULL, -- ราคาที่ขายจริงต่อหน่วย
  list_price        numeric(12,2),          -- ราคาเต็ม (ระดับ 5) ไว้โชว์ส่วนลด
  unit_cost         numeric(12,4) NOT NULL DEFAULT 0,
  discount_amount   numeric(12,2) NOT NULL DEFAULT 0,
  line_total        numeric(12,2) NOT NULL,
  -- ใครกดเปลี่ยนราคาจากที่ระบบตั้งไว้ (NULL = ใช้ราคาระบบตามปกติ)
  price_overridden_by bigint REFERENCES app_user(id),
  original_price    numeric(12,2),
  -- ขายตัวโชว์ใช่ไหม
  is_display_unit   boolean NOT NULL DEFAULT false,
  display_unit_id   bigint REFERENCES display_unit(id),
  UNIQUE (sale_id, line_no)
);
CREATE INDEX sale_line_product_idx ON sale_line(product_id);

-- หยิบของบรรทัดนี้จากช่องไหนบ้าง (1 บรรทัดอาจหยิบหลายช่อง)
-- ตารางนี้ทำให้ตอบได้ว่า "ช่อง S-A2-3 ยอดเพี้ยนเพราะขายบิลไหนไป"
CREATE TABLE sale_line_pick (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sale_line_id   bigint NOT NULL REFERENCES sale_line(id) ON DELETE CASCADE,
  location_id    bigint NOT NULL REFERENCES location(id),
  qty            numeric(14,3) NOT NULL,
  was_oversell   boolean NOT NULL DEFAULT false  -- ยอดในระบบไม่พอแต่ของมีจริง
);
CREATE INDEX sale_line_pick_location_idx ON sale_line_pick(location_id);

CREATE TABLE payment (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sale_id      bigint NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  method       text NOT NULL CHECK (method IN ('CASH','TRANSFER','CARD','CREDIT')),
  amount       numeric(12,2) NOT NULL,
  ref          text,                        -- เลขอ้างอิงสลิปโอน
  paid_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_sale_idx ON payment(sale_id);


-- ---------------------------------------------------------------------
-- รับของเข้า
-- ---------------------------------------------------------------------
CREATE TABLE supplier (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  phone       text,
  contact     text,
  note        text,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE goods_receipt (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_no       text NOT NULL UNIQUE,
  supplier_id  bigint REFERENCES supplier(id),
  supplier_doc text,                        -- เลขที่บิลของซัพพลายเออร์
  received_at  timestamptz NOT NULL DEFAULT now(),
  total_cost   numeric(12,2) NOT NULL DEFAULT 0,
  user_id      bigint REFERENCES app_user(id),
  note         text
);

CREATE TABLE goods_receipt_line (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id   bigint NOT NULL REFERENCES goods_receipt(id) ON DELETE CASCADE,
  product_id   bigint NOT NULL REFERENCES product(id),
  qty          numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_cost    numeric(12,4) NOT NULL DEFAULT 0,
  -- บังคับระบุช่องเก็บตั้งแต่ตอนรับของ ไม่ใช่ "เก็บก่อนค่อยบันทึกทีหลัง"
  -- นี่คือจุดที่ตำแหน่งของหายไปจากระบบมากที่สุด
  location_id  bigint NOT NULL REFERENCES location(id)
);


-- ---------------------------------------------------------------------
-- นับสต๊อก
-- ---------------------------------------------------------------------
CREATE TABLE count_session (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_no      text NOT NULL UNIQUE,
  kind        text NOT NULL DEFAULT 'CYCLE'
              CHECK (kind IN (
                'FULL',   -- นับทั้งร้าน (ปีละครั้ง)
                'CYCLE',  -- นับหมุนเวียนตามรอบ (สัปดาห์ละไม่กี่ช่อง)
                'SPOT'    -- นับช่องเดียวทันที เกิดจากปุ่ม "หาไม่เจอ"
              )),
  status      text NOT NULL DEFAULT 'COUNTING'
              CHECK (status IN ('COUNTING','REVIEW','POSTED','CANCELLED')),
  -- นับแบบปิดยอด: ไม่โชว์ยอดระบบตอนนับ กันพนักงานกรอกตามยอดระบบ
  is_blind    boolean NOT NULL DEFAULT true,
  started_at  timestamptz NOT NULL DEFAULT now(),
  posted_at   timestamptz,
  user_id     bigint REFERENCES app_user(id),
  posted_by   bigint REFERENCES app_user(id),
  note        text
);

CREATE TABLE count_line (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id   bigint NOT NULL REFERENCES count_session(id) ON DELETE CASCADE,
  location_id  bigint NOT NULL REFERENCES location(id),
  product_id   bigint NOT NULL REFERENCES product(id),
  -- ยอดระบบ ณ วินาทีที่เริ่มนับ (snapshot) ไม่ใช่ยอดตอนกดบันทึก
  -- ถ้าใช้ยอดตอนกดบันทึก การขายที่เกิดระหว่างนับจะทำให้ผลเพี้ยน
  system_qty   numeric(14,3) NOT NULL,
  counted_qty  numeric(14,3),
  variance     numeric(14,3),              -- counted - system
  -- เจอของในช่องที่ระบบไม่รู้ว่ามี  <- เบาะแสสำคัญของปัญหา "หาไม่เจอ"
  is_new_find  boolean NOT NULL DEFAULT false,
  counted_at   timestamptz,
  counted_by   bigint REFERENCES app_user(id),
  note         text,
  UNIQUE (session_id, location_id, product_id)
);
CREATE INDEX count_line_session_idx ON count_line(session_id);


-- ---------------------------------------------------------------------
-- รายงาน "หาไม่เจอ"  <-- ฟีเจอร์ที่แก้ปัญหาหลักของร้านนี้
-- ---------------------------------------------------------------------
-- ทุกครั้งที่พนักงานหาของไม่เจอ กดปุ่มเดียว ระบบจะ
--   1. บอกทันทีว่ามีของช่องอื่นไหม
--   2. ตั้งงานนับช่องนั้นซ้ำ
--   3. เก็บสถิติว่า "ช่องไหน/สินค้าตัวไหน" มีปัญหาบ่อย
-- จากเรื่องน่าหงุดหงิดกลายเป็นข้อมูลที่เอาไปแก้ต้นเหตุได้
CREATE TABLE not_found_report (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reported_at       timestamptz NOT NULL DEFAULT now(),
  product_id        bigint NOT NULL REFERENCES product(id),
  location_id       bigint NOT NULL REFERENCES location(id),
  expected_qty      numeric(14,3) NOT NULL,   -- ระบบบอกว่ามีเท่าไหร่
  user_id           bigint REFERENCES app_user(id),
  sale_id           bigint REFERENCES sale(id),
  status            text NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','RESOLVED')),
  resolution        text CHECK (resolution IN (
                      'FOUND_SAME_BIN',   -- หาเจอในช่องเดิม (มองไม่เห็นเอง)
                      'FOUND_OTHER_BIN',  -- ไปเจอช่องอื่น (วางผิดที่)
                      'WAS_DISPLAY',      -- ที่เห็นคือตัวโชว์ ไม่ใช่ของใหม่
                      'ADJUSTED',         -- นับแล้วไม่มีจริง ปรับยอดลง
                      'DAMAGED',          -- ของเสีย ไม่ได้บันทึก
                      'UNRESOLVED'
                    )),
  found_location_id bigint REFERENCES location(id),
  count_session_id  bigint REFERENCES count_session(id),
  resolved_at       timestamptz,
  resolved_by       bigint REFERENCES app_user(id),
  note              text
);
CREATE INDEX not_found_status_idx   ON not_found_report(status, reported_at DESC);
CREATE INDEX not_found_product_idx  ON not_found_report(product_id);
CREATE INDEX not_found_location_idx ON not_found_report(location_id);


-- ---------------------------------------------------------------------
-- ระบบทั่วไป
-- ---------------------------------------------------------------------
-- เลขที่เอกสารแบบ atomic (กัน doc_no ซ้ำเวลาขายพร้อมกัน 2 เครื่อง)
CREATE TABLE doc_counter (
  name       text PRIMARY KEY,
  prefix     text NOT NULL,
  period     text NOT NULL DEFAULT '',   -- YYYYMM เพื่อรีเซ็ตเลขทุกเดือน
  value      bigint NOT NULL DEFAULT 0
);

CREATE TABLE app_setting (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  note       text
);

CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  user_id    bigint REFERENCES app_user(id),
  action     text NOT NULL,
  entity     text,
  entity_id  bigint,
  detail     jsonb
);
CREATE INDEX audit_log_at_idx     ON audit_log(at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log(entity, entity_id);
