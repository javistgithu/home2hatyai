"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get, post, money, qty as fmtQty, locClass, daysAgo } from "@/lib/pos/client";
import type { ProductLookup, LocationRef, PriceTier } from "@/lib/pos/types";

/**
 * หน้า "ของอยู่ไหน"
 *
 * หน้านี้มีอยู่เพื่อตอบคำถามเดียวให้ได้ใน 5 วินาที:
 *   "ของตัวนี้อยู่ช่องไหน กี่ชิ้น"
 *
 * เดิมคำตอบอยู่ในหัวพนักงานคนที่อยู่มานาน คนอื่นต้องเดินหาหรือรอถาม
 * หน้านี้ทำให้คำตอบอยู่ในระบบ ใครก็เปิดดูได้จากมือถือตัวเอง
 *
 * ปุ่ม "หาไม่เจอ" คือหัวใจ: เปลี่ยนความหงุดหงิดให้เป็นข้อมูล
 * กดครั้งเดียว ระบบบอกช่องอื่นที่มีของ + เตือนเรื่องตัวโชว์ + ตั้งงานนับให้เอง
 */

interface SearchHit {
  id: number;
  sku: string;
  nameTh: string;
  unit: string;
  brand: string | null;
  isLamp: boolean;
  qtySellable: number;
  qtyOnDisplay: number;
  primaryLocationCode: string | null;
  primaryLocationLabel: string | null;
  binCount: number;
  prices: { tierLevel: number; price: number }[];
}

export default function FindPage() {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [detail, setDetail] = useState<ProductLookup | null>(null);
  const [binView, setBinView] = useState<{
    location: LocationRef;
    contents: { productId: number; sku: string; productName: string; unit: string; qtyOnHand: number }[];
  } | null>(null);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    get<PriceTier[]>("/api/pos/tiers").then(setTiers).catch(() => {});
    inputRef.current?.focus();
  }, []);

  const loadProduct = useCallback(async (id: number) => {
    setBusy(true);
    try {
      setBinView(null);
      setDetail(await get<ProductLookup>(`/api/pos/products/${id}`));
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }, []);

  /** ช่องเดียวรับทั้งบาร์โค้ดสินค้า รหัสสินค้า ชื่อไทย และรหัสช่องวาง */
  async function submit(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setBusy(true);
    setMsg(null);
    try {
      const scanned = await get<{
        scan: { kind: string; productId?: number; locationId?: number };
        product?: ProductLookup | null;
        location?: LocationRef | null;
        contents?: { productId: number; sku: string; productName: string; unit: string; qtyOnHand: number }[];
      }>(`/api/pos/scan?code=${encodeURIComponent(code)}`);

      if (scanned.scan.kind === "PRODUCT" && scanned.product) {
        setDetail(scanned.product);
        setBinView(null);
        setHits([]);
        return;
      }
      if (scanned.scan.kind === "LOCATION" && scanned.location) {
        setBinView({ location: scanned.location, contents: scanned.contents ?? [] });
        setDetail(null);
        setHits([]);
        return;
      }

      // ไม่ใช่รหัสตรงตัว -> ค้นหาด้วยชื่อ
      const found = await get<SearchHit[]>(
        `/api/pos/products?q=${encodeURIComponent(code)}`
      );
      setHits(found);
      setDetail(null);
      setBinView(null);
      if (found.length === 0) {
        setMsg({ kind: "warn", text: `ไม่พบสินค้าที่ตรงกับ "${code}"` });
      }
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }

  async function reportNotFound(productId: number, locationId: number) {
    setBusy(true);
    try {
      const res = await post<{ advice: string }>("/api/pos/notfound", {
        productId,
        locationId,
      });
      setMsg({ kind: "info", text: res.advice });
      await loadProduct(productId);
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="card">
        <div className="card-body">
          <input
            ref={inputRef}
            className="scan-input"
            value={term}
            disabled={busy}
            autoComplete="off"
            placeholder="ยิงบาร์โค้ด / พิมพ์ชื่อสินค้า / ยิงป้ายชั้นวาง"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit(term)}
          />
          <p className="tiny muted" style={{ marginTop: 6 }}>
            ยิงป้ายชั้นวาง (เช่น S-A2-3) เพื่อดูว่าช่องนั้นควรมีอะไรอยู่
          </p>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.kind}`} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}

      {/* ผลค้นหาหลายรายการ */}
      {hits.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">พบ {hits.length} รายการ</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th className="r">พร้อมขาย</th>
                  <th>อยู่ช่อง</th>
                  <th className="r">ราคาขายจริง</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((h) => (
                  <tr
                    key={h.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => void loadProduct(h.id)}
                  >
                    <td>
                      <div className="bold">{h.nameTh}</div>
                      <div className="tiny muted mono">{h.sku}</div>
                    </td>
                    <td className="r">
                      <span
                        className={
                          h.qtySellable > 0 ? "chip chip-ok" : "chip chip-danger"
                        }
                      >
                        {fmtQty(h.qtySellable)} {h.unit}
                      </span>
                      {h.qtyOnDisplay > 0 && (
                        <div className="tiny" style={{ color: "var(--display)" }}>
                          + ตัวโชว์ {fmtQty(h.qtyOnDisplay)}
                        </div>
                      )}
                    </td>
                    <td>
                      {h.primaryLocationCode ? (
                        <>
                          <span className={locClass(h.primaryLocationCode.split("-")[0])}>
                            {h.primaryLocationCode}
                          </span>
                          {h.binCount > 1 && (
                            <span className="tiny muted"> +{h.binCount - 1} ช่อง</span>
                          )}
                        </>
                      ) : (
                        <span className="muted2 tiny">ไม่มีของ</span>
                      )}
                    </td>
                    <td className="r num bold">
                      {money(h.prices.find((p) => p.tierLevel === 1)?.price ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* รายละเอียดสินค้า + ตำแหน่ง */}
      {detail && (
        <ProductDetail
          data={detail}
          tiers={tiers}
          busy={busy}
          onNotFound={(locId) => void reportNotFound(detail.product.id, locId)}
        />
      )}

      {/* เนื้อหาในช่องวาง (ยิงป้ายชั้น) */}
      {binView && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            <span className={`${locClass(binView.location.zoneCode)} loc-lg`}>
              {binView.location.code}
            </span>
            <span className="small muted">{binView.location.labelTh}</span>
          </div>
          {binView.contents.length === 0 ? (
            <div className="empty">ระบบว่าช่องนี้ว่าง — ถ้ามีของอยู่จริง ให้ไปนับช่องนี้</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th className="r">ระบบว่ามี</th>
                  </tr>
                </thead>
                <tbody>
                  {binView.contents.map((c) => (
                    <tr
                      key={c.productId}
                      style={{ cursor: "pointer" }}
                      onClick={() => void loadProduct(c.productId)}
                    >
                      <td>
                        <div>{c.productName}</div>
                        <div className="tiny muted mono">{c.sku}</div>
                      </td>
                      <td className="r num bold">
                        {fmtQty(c.qtyOnHand)} {c.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

// =====================================================================
function ProductDetail({
  data, tiers, busy, onNotFound,
}: {
  data: ProductLookup;
  tiers: PriceTier[];
  busy: boolean;
  onNotFound: (locationId: number) => void;
}) {
  const p = data.product;
  const bins = data.stock.filter(
    (s) => s.locationKind === "BIN" || s.locationKind === "STAGING"
  );
  const other = data.stock.filter(
    (s) => s.locationKind === "DAMAGED" || s.locationKind === "RESERVED"
  );
  const spec = data.spec;

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      {/* หัวเรื่อง + ยอดพร้อมขาย */}
      <div className="card">
        <div className="card-body stack">
          <div className="row row-wrap">
            <div className="grow">
              <h1>{p.nameTh}</h1>
              <div className="row row-wrap small muted" style={{ marginTop: 4 }}>
                <span className="mono">{p.sku}</span>
                {p.brand && <span>• {p.brand}</span>}
                {p.categoryName && <span>• {p.categoryName}</span>}
                {p.isLamp && <span className="chip chip-display">โคมไฟ</span>}
                <span className="chip">นับรอบ {p.countClass}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-3">
            <div
              style={{
                background: data.qtySellable > 0 ? "var(--ok-bg)" : "var(--danger-bg)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
              }}
            >
              <div className="small bold">พร้อมขาย</div>
              <div style={{ fontSize: "1.9rem", fontWeight: 800, lineHeight: 1.1 }}>
                {fmtQty(data.qtySellable)}{" "}
                <span style={{ fontSize: "1rem", fontWeight: 600 }}>{p.unit}</span>
              </div>
            </div>
            <div
              style={{
                background: "var(--display-bg)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
              }}
            >
              <div className="small bold" style={{ color: "var(--display)" }}>
                ตัวโชว์ (ขายเป็นของใหม่ไม่ได้)
              </div>
              <div style={{ fontSize: "1.9rem", fontWeight: 800, lineHeight: 1.1,
                            color: "var(--display)" }}>
                {fmtQty(data.qtyOnDisplay)}
              </div>
            </div>
            <div
              style={{
                background: "var(--surface-2)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
              }}
            >
              <div className="small bold">อยู่กี่ช่อง</div>
              <div style={{ fontSize: "1.9rem", fontWeight: 800, lineHeight: 1.1 }}>
                {bins.filter((b) => b.qtyOnHand > 0).length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ตำแหน่งเก็บ - ส่วนที่สำคัญที่สุดของหน้านี้ */}
      <div className="card">
        <div className="card-head">📍 ของอยู่ช่องไหน (เรียงตามลำดับที่ควรเดินไปหยิบ)</div>
        {bins.length === 0 ? (
          <div className="empty">ระบบไม่มียอดในช่องไหนเลย — ต้องสั่งของเพิ่ม</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 130 }}>ช่อง</th>
                  <th>ตำแหน่ง</th>
                  <th className="r">จำนวน</th>
                  <th className="r">นับล่าสุด</th>
                  <th className="r no-print">แจ้งปัญหา</th>
                </tr>
              </thead>
              <tbody>
                {bins.map((s) => (
                  <tr key={s.locationId}>
                    <td>
                      <span className={`${locClass(s.zoneCode)} loc-lg`}>
                        {s.locationCode}
                      </span>
                    </td>
                    <td>
                      <div>{s.locationLabel}</div>
                      {s.qtyReserved > 0 && (
                        <div className="tiny muted">
                          จองไว้ {fmtQty(s.qtyReserved)}
                        </div>
                      )}
                    </td>
                    <td className="r">
                      <span
                        className={
                          s.qtyOnHand < 0
                            ? "bold num"
                            : "bold num"
                        }
                        style={{
                          fontSize: "1.15rem",
                          color: s.qtyOnHand < 0 ? "var(--danger)" : undefined,
                        }}
                      >
                        {fmtQty(s.qtyOnHand)}
                      </span>
                      <div className="tiny muted">{p.unit}</div>
                      {s.qtyOnHand < 0 && (
                        <div className="tiny" style={{ color: "var(--danger)" }}>
                          ยอดติดลบ ต้องนับ
                        </div>
                      )}
                    </td>
                    <td className="r small muted nowrap">
                      {daysAgo(s.lastCountedAt, "ไม่เคยนับ")}
                    </td>
                    <td className="r no-print">
                      <button
                        className="btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => onNotFound(s.locationId)}
                        title="เดินไปที่ช่องนี้แล้วหาของไม่เจอ"
                      >
                        หาไม่เจอ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ตัวโชว์ */}
      {data.displayUnits.length > 0 && (
        <div className="card">
          <div className="card-head" style={{ color: "var(--display)" }}>
            💡 ตัวโชว์อยู่จุดไหน
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>จุด</th>
                  <th>ตำแหน่งที่แขวน/ตั้ง</th>
                  <th>สภาพ</th>
                  <th className="r">ราคาตัวโชว์</th>
                  <th className="r">ตรวจล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {data.displayUnits.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="loc loc-display loc-lg">{u.locationCode}</span>
                    </td>
                    <td>
                      <div className="bold">{u.spotLabel}</div>
                      <div className="tiny muted">{u.locationLabel}</div>
                    </td>
                    <td>
                      <span
                        className={
                          u.condition === "DAMAGED" || u.condition === "DUSTY"
                            ? "chip chip-warn"
                            : "chip chip-ok"
                        }
                      >
                        {
                          ({
                            NEW: "ใหม่",
                            GOOD: "ดี",
                            FAIR: "พอใช้",
                            DUSTY: "ฝุ่นจับ",
                            DAMAGED: "ชำรุด",
                          } as Record<string, string>)[u.condition]
                        }
                      </span>
                      {!u.isSellable && (
                        <div className="tiny muted">ไม่ขายตัวโชว์นี้</div>
                      )}
                    </td>
                    <td className="r num">
                      {u.displayPrice != null ? money(u.displayPrice) : "-"}
                    </td>
                    <td className="r small muted nowrap">{daysAgo(u.checkedAt, "ยังไม่ตรวจ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {other.length > 0 && (
        <div className="card">
          <div className="card-head">ของที่ขายไม่ได้</div>
          <div className="card-body stack-sm">
            {other.map((s) => (
              <div key={s.locationId} className="row small">
                <span className={locClass(s.zoneCode)}>{s.locationCode}</span>
                <span className="muted">{s.locationLabel}</span>
                <div className="spacer" />
                <span className="num bold">
                  {fmtQty(s.qtyOnHand)} {p.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ราคา 5 ระดับ */}
      <div className="card">
        <div className="card-head">💰 ราคาทั้ง 5 ระดับ</div>
        <div className="table-wrap">
          <table>
            <tbody>
              {tiers.map((t) => {
                const row = data.prices.find((x) => x.tierLevel === t.level);
                return (
                  <tr key={t.level}>
                    <td style={{ width: 44 }}>
                      <span
                        className="chip"
                        style={{ background: t.colorHex, color: "#fff" }}
                      >
                        {t.level}
                      </span>
                    </td>
                    <td>
                      <div className="bold">{t.nameTh}</div>
                      <div className="tiny muted">{t.descriptionTh}</div>
                    </td>
                    <td className="r">
                      {row ? (
                        <span className="num bold" style={{ fontSize: "1.2rem" }}>
                          {money(row.price)}
                        </span>
                      ) : (
                        <span className="chip chip-warn">ยังไม่ตั้งราคา</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* คุณสมบัติสินค้า */}
      {spec && (
        <div className="card">
          <div className="card-head">ข้อมูลทางเทคนิค</div>
          <div className="card-body">
            <div className="grid grid-3">
              {([
                ["กำลังไฟ", spec.watt ? `${spec.watt} วัตต์` : null],
                ["ความสว่าง", spec.lumen ? `${spec.lumen} lm` : null],
                ["แสง", spec.colorTemp],
                ["ขั้วหลอด", spec.baseType],
                ["แรงดัน", spec.voltage],
                ["กันน้ำ", spec.ipRating],
                ["องศาลำแสง", spec.beamAngle ? `${spec.beamAngle}°` : null],
                ["รูเจาะฝ้า", spec.cutOutMm ? `${spec.cutOutMm} มม.` : null],
                ["ขนาด", spec.dimension],
                ["วัสดุ", spec.material],
                ["ขนาดสาย", spec.wireSize],
                ["พิกัดกระแส", spec.ampRating],
                ["ประกัน", spec.warrantyMonths ? `${spec.warrantyMonths} เดือน` : null],
                ["หรี่ไฟได้", spec.isDimmable ? "ได้" : null],
              ] as [string, string | null][])
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <div className="tiny muted">{k}</div>
                    <div className="bold small">{v}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {data.barcodes.length > 0 && (
        <div className="card">
          <div className="card-body row row-wrap small">
            <span className="muted">บาร์โค้ด:</span>
            {data.barcodes.map((b) => (
              <span key={b} className="chip mono">{b}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
