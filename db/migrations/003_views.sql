-- =====================================================================
-- View ที่ใช้บ่อย - รวม logic การ join ไว้ที่เดียว
-- =====================================================================

-- ตำแหน่งเก็บพร้อมข้อมูลโซน (ใช้แทบทุกหน้าจอ)
CREATE VIEW v_location AS
SELECT
  l.id,
  l.code,
  l.label_th,
  l.kind,
  l.rack,
  l.level,
  l.bin,
  l.walk_order,
  l.is_pickable,
  l.is_active,
  z.id            AS zone_id,
  z.code          AS zone_code,
  z.name_th       AS zone_name,
  z.kind          AS zone_kind,
  z.pick_priority
FROM location l
JOIN zone z ON z.id = l.zone_id;


-- สต๊อกรายช่อง พร้อมข้อมูลสินค้าและตำแหน่ง
-- หัวใจของหน้า "ของอยู่ไหน"
CREATE VIEW v_stock_detail AS
SELECT
  sb.product_id,
  sb.location_id,
  sb.qty_on_hand,
  sb.qty_reserved,
  (sb.qty_on_hand - sb.qty_reserved)          AS qty_available,
  sb.last_counted_at,
  sb.last_movement_at,
  p.sku,
  p.name_th                                   AS product_name,
  p.unit,
  p.is_lamp,
  l.code                                      AS location_code,
  l.label_th                                  AS location_label,
  l.kind                                      AS location_kind,
  l.walk_order,
  l.is_pickable,
  z.code                                      AS zone_code,
  z.name_th                                   AS zone_name,
  z.kind                                      AS zone_kind,
  z.pick_priority
FROM stock_balance sb
JOIN product  p ON p.id = sb.product_id
JOIN location l ON l.id = sb.location_id
JOIN zone     z ON z.id = l.zone_id;


-- ยอดรวมต่อสินค้า แยก "ของขายได้" ออกจาก "ตัวโชว์" ให้ชัด
-- ถ้ารวมกันเมื่อไหร่ ปัญหา "ระบบบอกมี 1 ชิ้น แต่ที่เห็นคือตัวโชว์" จะกลับมาทันที
CREATE VIEW v_product_stock_summary AS
SELECT
  p.id                                         AS product_id,
  p.sku,
  p.name_th,
  p.unit,
  p.is_lamp,
  p.reorder_point,
  COALESCE(SUM(sb.qty_on_hand) FILTER (
    WHERE l.kind = 'BIN' AND l.is_pickable
  ), 0)                                        AS qty_sellable,
  COALESCE(SUM(sb.qty_reserved) FILTER (
    WHERE l.kind = 'BIN' AND l.is_pickable
  ), 0)                                        AS qty_reserved,
  COALESCE(SUM(sb.qty_on_hand) FILTER (
    WHERE l.kind = 'DISPLAY_SPOT'
  ), 0)                                        AS qty_on_display,
  COALESCE(SUM(sb.qty_on_hand) FILTER (
    WHERE l.kind = 'DAMAGED'
  ), 0)                                        AS qty_damaged,
  COALESCE(SUM(sb.qty_on_hand), 0)             AS qty_total,
  COUNT(*) FILTER (
    WHERE sb.qty_on_hand > 0 AND l.kind = 'BIN'
  )                                            AS bin_count
FROM product p
LEFT JOIN stock_balance sb ON sb.product_id = p.id
LEFT JOIN location l       ON l.id = sb.location_id
GROUP BY p.id, p.sku, p.name_th, p.unit, p.is_lamp, p.reorder_point;


-- ช่องที่ต้องไปนับซ้ำ เรียงตามความเร่งด่วน
-- รวม 3 สัญญาณ: มีคนแจ้งหาไม่เจอ / ยอดติดลบ / ไม่ได้นับมานาน
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
    WHEN sb.qty_on_hand < 0 THEN 100           -- ยอดติดลบ = ผิดแน่นอน
    WHEN EXISTS (SELECT 1 FROM not_found_report nf
                  WHERE nf.product_id = sb.product_id
                    AND nf.location_id = sb.location_id
                    AND nf.status = 'OPEN') THEN 90
    WHEN sb.last_counted_at IS NULL THEN 70    -- ไม่เคยนับเลย
    WHEN p.count_class = 'A'
     AND sb.last_counted_at < now() - interval '7 days'  THEN 60
    WHEN p.count_class = 'B'
     AND sb.last_counted_at < now() - interval '30 days' THEN 40
    WHEN p.count_class = 'C'
     AND sb.last_counted_at < now() - interval '90 days' THEN 20
    ELSE 0
  END                                          AS priority
FROM stock_balance sb
JOIN product  p ON p.id = sb.product_id
JOIN location l ON l.id = sb.location_id
WHERE l.is_active;


-- ของหน้าร้านที่ต้องเติมจากสโตร์
CREATE VIEW v_replenish_needed AS
SELECT
  r.product_id,
  r.location_id,
  p.sku,
  p.name_th                            AS product_name,
  p.unit,
  l.code                               AS location_code,
  l.label_th                           AS location_label,
  COALESCE(sb.qty_on_hand, 0)          AS qty_now,
  r.min_qty,
  r.max_qty,
  (r.max_qty - COALESCE(sb.qty_on_hand, 0)) AS qty_to_fill
FROM replenish_rule r
JOIN product  p ON p.id = r.product_id
JOIN location l ON l.id = r.location_id
LEFT JOIN stock_balance sb
       ON sb.product_id = r.product_id AND sb.location_id = r.location_id
WHERE COALESCE(sb.qty_on_hand, 0) <= r.min_qty;
