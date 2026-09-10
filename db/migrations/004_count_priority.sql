-- =====================================================================
-- ปรับคิวงานนับ: กันจุดโชว์ไม่ให้ยึดคิวประจำวัน
-- =====================================================================
-- ปัญหาที่เจอตอนทดสอบ: ร้านมีจุดโชว์ 8 จุด พอเปิดใช้ระบบใหม่ๆ ทุกจุดยัง
-- "ไม่เคยนับ" เหมือนกันหมด คิวนับ 10 อันดับแรกจึงเป็นจุดโชว์ล้วน
-- แล้วช่องเก็บจริงที่ควรนับกลับหล่นไปอยู่หน้าสอง
--
-- ผลคือพนักงานเปิดมาเห็นรายการที่ไม่ตรงกับงานจริง แล้วเลิกดูคิวนี้ไปเลย
--
-- ทางแก้: ตัวโชว์ไม่เข้าคิวนับประจำวัน เพราะมันแขวนให้เห็นอยู่แล้ว
-- และมีรอบตรวจสภาพของตัวเองในหน้า "ตัวโชว์"
-- ยกเว้น 2 กรณีที่ผิดปกติจริง ต้องเข้าคิวทันที:
--   1. ยอดติดลบ (แปลว่ามีคนขายตัวโชว์ไปโดยไม่ผ่านระบบ)
--   2. มีคนแจ้งว่าหาไม่เจอ
DROP VIEW IF EXISTS v_count_priority;

CREATE VIEW v_count_priority AS
SELECT
  sb.product_id,
  sb.location_id,
  p.sku,
  p.name_th          AS product_name,
  p.count_class,
  l.code             AS location_code,
  l.label_th         AS location_label,
  sb.qty_on_hand,
  sb.last_counted_at,
  (SELECT COUNT(*) FROM not_found_report nf
    WHERE nf.product_id = sb.product_id
      AND nf.location_id = sb.location_id
      AND nf.status = 'OPEN')                  AS open_not_found,
  CASE
    -- ผิดแน่นอน ต้องนับทันทีไม่ว่าจะเป็นช่องแบบไหน
    WHEN sb.qty_on_hand < 0 THEN 100
    WHEN EXISTS (SELECT 1 FROM not_found_report nf
                  WHERE nf.product_id = sb.product_id
                    AND nf.location_id = sb.location_id
                    AND nf.status = 'OPEN') THEN 90
    -- จุดโชว์ไม่เข้าคิวนับประจำ ใช้รอบตรวจสภาพในหน้าตัวโชว์แทน
    WHEN l.kind <> 'BIN' THEN 0
    WHEN sb.last_counted_at IS NULL THEN 70
    WHEN p.count_class = 'A'
     AND sb.last_counted_at < now() - interval '7 days'  THEN 60
    WHEN p.count_class = 'B'
     AND sb.last_counted_at < now() - interval '30 days' THEN 40
    WHEN p.count_class = 'C'
     AND sb.last_counted_at < now() - interval '90 days' THEN 20
    ELSE 0
  END                                          AS priority,
  l.kind                                       AS location_kind
FROM stock_balance sb
JOIN product  p ON p.id = sb.product_id
JOIN location l ON l.id = sb.location_id
WHERE l.is_active;
