"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get, post, money, qty as fmtQty, locClass, resolveTierPrice } from "@/lib/pos/client";
import type {
  PriceTier, ProductLookup, SaleResult, PaymentMethod, DisplayUnitInfo,
} from "@/lib/pos/types";

/**
 * หน้าขาย
 *
 * ออกแบบให้ขายจบได้โดยแตะจอครั้งเดียว: ยิงบาร์โค้ด -> กดรับเงิน
 * ทุกอย่างที่เหลือเป็นทางเลือก ไม่ใช่ขั้นตอนบังคับ
 *
 * สิ่งที่ตั้งใจ "ไม่" ทำ:
 *   - ไม่บังคับเลือกลูกค้าก่อนขาย (ลูกค้าเดินเข้าร้านส่วนใหญ่ไม่มีประวัติ)
 *   - ไม่บังคับเลือกช่องหยิบของ (ระบบเลือกให้ตามลำดับการเดิน)
 *   - ไม่ขึ้นกล่องยืนยันซ้ำซ้อน
 * ทุกขั้นตอนที่ตัดออกได้ คือเหตุผลหนึ่งข้อที่พนักงานจะไม่กลับไปเขียนใส่กระดาษ
 */

interface CartLine {
  key: string;
  product: ProductLookup;
  qty: number;
  tierLevel: number;
  unitPrice: number;
  overridden: boolean;
  displayUnit: DisplayUnitInfo | null;
}

export default function SellPage() {
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [tierLevel, setTierLevel] = useState(1);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [scan, setScan] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [approvedBy, setApprovedBy] = useState<number | null>(null);
  const [approveFor, setApproveFor] = useState<null | { tierLevel: number }>(null);
  const [customerName, setCustomerName] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  const focusScan = useCallback(() => {
    setTimeout(() => scanRef.current?.focus(), 30);
  }, []);

  useEffect(() => {
    get<PriceTier[]>("/api/pos/tiers").then(setTiers).catch(() => {});
    focusScan();
  }, [focusScan]);

  const subtotal = lines.reduce(
    (a, l) => a + Math.round(l.unitPrice * 100 * l.qty) / 100,
    0
  );
  const tier = tiers.find((t) => t.level === tierLevel);

  // ------------------------------------------------------------ ยิงของ
  async function handleScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setScan("");
    setBusy(true);
    setMsg(null);
    try {
      const res = await get<{
        scan: { kind: string; productId?: number; packQty?: number };
        product?: ProductLookup | null;
      }>(`/api/pos/scan?code=${encodeURIComponent(code)}`);

      if (res.scan.kind !== "PRODUCT" || !res.product) {
        setMsg({
          kind: "warn",
          text: `ไม่รู้จัก "${code}" — ถ้าเป็นสินค้าใหม่ ให้เจ้าของเพิ่มสินค้าและติดบาร์โค้ดก่อน`,
        });
        return;
      }
      addProduct(res.product, res.scan.packQty ?? 1);
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
      focusScan();
    }
  }

  function addProduct(product: ProductLookup, addQty = 1, displayUnit: DisplayUnitInfo | null = null) {
    setLines((prev) => {
      const key = `${product.product.id}:${displayUnit?.id ?? ""}`;
      const idx = prev.findIndex((l) => l.key === key);
      if (idx >= 0 && !displayUnit) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + addQty };
        return next;
      }
      if (idx >= 0 && displayUnit) return prev; // ตัวโชว์มีตัวเดียว เพิ่มซ้ำไม่ได้

      const resolved = resolveTierPrice(product.prices, tierLevel);
      const price = displayUnit?.displayPrice ?? resolved.price;
      return [
        ...prev,
        {
          key,
          product,
          qty: displayUnit ? 1 : addQty,
          tierLevel: resolved.usedTier,
          unitPrice: price,
          overridden: false,
          displayUnit,
        },
      ];
    });

    // เตือนทันทีเมื่อของพร้อมขายไม่พอ ตอนนี้ยังแก้ทันก่อนลูกค้าจ่ายเงิน
    if (product.qtySellable <= 0) {
      setMsg({
        kind: "warn",
        text:
          product.qtyOnDisplay > 0
            ? `${product.product.nameTh}: ของในกล่องหมด เหลือแต่ตัวโชว์ที่ ` +
              `${product.displayUnits.map((d) => d.spotLabel).join(", ")} — ` +
              `ถ้าลูกค้าเอาตัวโชว์ ให้กดปุ่ม "ขายตัวโชว์" ที่บรรทัดนั้น`
            : `${product.product.nameTh}: ระบบว่าของหมด — ถ้ามีของจริงขายได้เลย ` +
              `ระบบจะตั้งงานให้ไปนับช่องนั้น`,
      });
    }
  }

  // เปลี่ยนระดับราคาทั้งบิล -> คำนวณราคาทุกบรรทัดใหม่ (ยกเว้นบรรทัดที่แก้ราคาเอง)
  function changeTier(level: number) {
    const t = tiers.find((x) => x.level === level);
    if (t?.requiresApproval && !approvedBy) {
      setApproveFor({ tierLevel: level });
      return;
    }
    setTierLevel(level);
    setLines((prev) =>
      prev.map((l) => {
        if (l.overridden || l.displayUnit) return l;
        const r = resolveTierPrice(l.product.prices, level);
        return { ...l, tierLevel: r.usedTier, unitPrice: r.price };
      })
    );
    focusScan();
  }

  function setLineQty(key: string, q: number) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, qty: Math.max(0, q) } : l)).filter((l) => l.qty > 0)
    );
  }

  function setLinePrice(key: string, price: number) {
    if (!approvedBy) {
      setApproveFor({ tierLevel: tierLevel });
      return;
    }
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, unitPrice: price, overridden: true } : l))
    );
  }

  async function sellDisplayUnit(line: CartLine, unit: DisplayUnitInfo) {
    // แทนที่บรรทัดปกติด้วยบรรทัดตัวโชว์ ไม่ใช่เพิ่มบรรทัดใหม่
    setLines((prev) => prev.filter((l) => l.key !== line.key));
    addProduct(line.product, 1, unit);
    focusScan();
  }

  async function reportNotFound(line: CartLine) {
    const loc = line.product.stock.find((s) => s.isPickable && s.qtyOnHand > 0);
    if (!loc) {
      setMsg({ kind: "info", text: "ระบบไม่มียอดในช่องไหนอยู่แล้ว ไม่ต้องแจ้ง" });
      return;
    }
    setBusy(true);
    try {
      const res = await post<{ advice: string }>("/api/pos/notfound", {
        productId: line.product.product.id,
        locationId: loc.locationId,
      });
      setMsg({ kind: "info", text: res.advice });
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }

  async function submitSale(payments: { method: PaymentMethod; amount: number }[]) {
    setBusy(true);
    try {
      const res = await post<SaleResult>("/api/pos/sales", {
        tierLevel,
        customerName: customerName.trim() || null,
        approvedBy,
        lines: lines.map((l) => ({
          productId: l.product.product.id,
          qty: l.qty,
          tierLevel: l.tierLevel,
          unitPrice: l.overridden || l.displayUnit ? l.unitPrice : undefined,
          displayUnitId: l.displayUnit?.id ?? null,
        })),
        payments,
      });
      setResult(res);
      setLines([]);
      setPayOpen(false);
      setApprovedBy(null);
      setCustomerName("");
      setTierLevel(1);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "บันทึกบิลไม่สำเร็จ" });
      setPayOpen(false);
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------- หน้าจอผลลัพธ์
  if (result) {
    return (
      <main className="page">
        <ReceiptView
          result={result}
          onNew={() => {
            setResult(null);
            focusScan();
          }}
        />
      </main>
    );
  }

  return (
    <main className="page">
      {/* ระดับราคา 5 ช่อง โชว์ทั้งหมดตลอดเวลา */}
      <div className="card">
        <div className="card-body tight">
          <div className="tier-row">
            {tiers.map((t) => {
              const on = t.level === tierLevel;
              return (
                <button
                  key={t.level}
                  className="tier-btn"
                  data-on={on ? "1" : "0"}
                  style={
                    on
                      ? { background: t.colorHex, borderColor: t.colorHex, color: "#fff" }
                      : { borderColor: t.colorHex, color: t.colorHex }
                  }
                  onClick={() => changeTier(t.level)}
                  title={t.descriptionTh ?? ""}
                >
                  <span className="tier-no">ระดับ {t.level}</span>
                  <span>{t.nameTh}</span>
                  {t.requiresApproval && <span className="tier-no">ต้องอนุมัติ</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ช่องยิงบาร์โค้ด */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-body stack">
          <input
            ref={scanRef}
            className="scan-input"
            value={scan}
            disabled={busy}
            autoComplete="off"
            placeholder="ยิงบาร์โค้ด หรือพิมพ์รหัส/ชื่อสินค้า แล้วกด Enter"
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleScan(scan);
            }}
          />
          <div className="row row-wrap small muted">
            <span>ลูกค้า:</span>
            <input
              style={{ minHeight: 38, maxWidth: 260 }}
              placeholder="ลูกค้าทั่วไป (ไม่ต้องกรอกก็ได้)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            {approvedBy && <span className="chip chip-ok">เจ้าของอนุมัติแล้ว</span>}
          </div>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.kind}`} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}

      {/* ตะกร้า */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-head">
          รายการขาย
          <div className="spacer" />
          <span className="small muted">{lines.length} รายการ</span>
        </div>
        {lines.length === 0 ? (
          <div className="empty">ยังไม่มีสินค้า — ยิงบาร์โค้ดเพื่อเริ่มขาย</div>
        ) : (
          <div>
            {lines.map((l) => (
              <CartRow
                key={l.key}
                line={l}
                tiers={tiers}
                onQty={(q) => setLineQty(l.key, q)}
                onPrice={(p) => setLinePrice(l.key, p)}
                onRemove={() => setLineQty(l.key, 0)}
                onSellDisplay={(u) => void sellDisplayUnit(l, u)}
                onNotFound={() => void reportNotFound(l)}
              />
            ))}
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="total-bar" style={{ marginTop: 12, borderRadius: "var(--radius)" }}>
          <div>
            <div className="total-label">
              ยอดรวม ({tier?.nameTh ?? "ราคาขายจริง"})
            </div>
            <div className="total-amount">{money(subtotal)}</div>
          </div>
          <div className="spacer" />
          <button className="btn-primary btn-lg" onClick={() => setPayOpen(true)} disabled={busy}>
            รับเงิน
          </button>
        </div>
      )}

      {payOpen && (
        <PaymentModal
          total={subtotal}
          busy={busy}
          onClose={() => {
            setPayOpen(false);
            focusScan();
          }}
          onConfirm={submitSale}
        />
      )}

      {approveFor && (
        <ApprovalModal
          tierName={tiers.find((t) => t.level === approveFor.tierLevel)?.nameTh ?? ""}
          onClose={() => setApproveFor(null)}
          onApproved={(ownerId) => {
            setApprovedBy(ownerId);
            setApproveFor(null);
            setTierLevel(approveFor.tierLevel);
            setLines((prev) =>
              prev.map((l) => {
                if (l.overridden || l.displayUnit) return l;
                const r = resolveTierPrice(l.product.prices, approveFor.tierLevel);
                return { ...l, tierLevel: r.usedTier, unitPrice: r.price };
              })
            );
            focusScan();
          }}
        />
      )}
    </main>
  );
}

// =====================================================================
function CartRow({
  line, tiers, onQty, onPrice, onRemove, onSellDisplay, onNotFound,
}: {
  line: CartLine;
  tiers: PriceTier[];
  onQty: (q: number) => void;
  onPrice: (p: number) => void;
  onRemove: () => void;
  onSellDisplay: (u: DisplayUnitInfo) => void;
  onNotFound: () => void;
}) {
  const p = line.product;
  const listPrice = p.prices.find((x) => x.tierLevel === 5)?.price ?? null;
  const saved = listPrice && listPrice > line.unitPrice ? listPrice - line.unitPrice : 0;
  const tierInfo = tiers.find((t) => t.level === line.tierLevel);

  // ช่องที่ควรไปหยิบ เรียงตามลำดับการเดิน (หน้าร้านก่อน)
  const pickable = p.stock.filter((s) => s.isPickable && s.qtyOnHand > 0);

  return (
    <div className="line-item">
      <div className="grow stack-sm">
        <div className="name">
          {p.product.nameTh}
          {line.displayUnit && (
            <span className="chip chip-display" style={{ marginInlineStart: 6 }}>
              ตัวโชว์ • {line.displayUnit.spotLabel}
            </span>
          )}
        </div>

        <div className="row row-wrap tiny muted">
          <span className="mono">{p.product.sku}</span>
          {tierInfo && (
            <span className="chip" style={{ color: tierInfo.colorHex }}>
              {tierInfo.nameTh}
            </span>
          )}
          {line.overridden && <span className="chip chip-warn">แก้ราคาเอง</span>}
        </div>

        {/* ตำแหน่งที่ต้องไปหยิบ - ข้อมูลสำคัญที่สุดของบรรทัดนี้ */}
        {!line.displayUnit && (
          <div className="row row-wrap" style={{ gap: 6 }}>
            {pickable.length === 0 ? (
              <span className="chip chip-danger">ระบบว่าไม่มีของในช่องไหนเลย</span>
            ) : (
              pickable.slice(0, 3).map((s) => (
                <span key={s.locationId} className={locClass(s.zoneCode)}>
                  {s.locationCode}
                  <span style={{ opacity: 0.75, fontWeight: 500 }}>
                    {fmtQty(s.qtyOnHand)}
                  </span>
                </span>
              ))
            )}
            {p.qtyOnDisplay > 0 && !line.displayUnit && (
              <span className="chip chip-display">
                มีตัวโชว์ {p.qtyOnDisplay} ตัว
              </span>
            )}
          </div>
        )}

        {/* ปุ่มขายตัวโชว์ - โผล่เฉพาะโคมไฟที่มีตัวโชว์ขายได้ */}
        {!line.displayUnit &&
          p.displayUnits
            .filter((u) => u.isSellable && u.status === "ON_DISPLAY")
            .map((u) => (
              <button
                key={u.id}
                className="btn-sm"
                style={{ alignSelf: "flex-start", borderColor: "var(--display)", color: "var(--display)" }}
                onClick={() => onSellDisplay(u)}
              >
                ขายตัวโชว์ที่ {u.spotLabel}
                {u.displayPrice != null && ` (${money(u.displayPrice)})`}
              </button>
            ))}

        <div className="row row-wrap" style={{ gap: 6, marginTop: 2 }}>
          <button className="btn-sm" onClick={onNotFound} title="แจ้งว่าเดินไปหยิบแล้วหาไม่เจอ">
            🔎 หาไม่เจอ
          </button>
          <button className="btn-sm" onClick={onRemove}>
            ลบ
          </button>
        </div>
      </div>

      <div className="stack-sm" style={{ width: 132, flexShrink: 0 }}>
        <div className="row" style={{ gap: 4 }}>
          <button
            className="btn-sm"
            style={{ width: 34, padding: 0 }}
            onClick={() => onQty(line.qty - 1)}
            disabled={!!line.displayUnit}
          >
            −
          </button>
          <input
            className="num"
            style={{ minHeight: 36, textAlign: "center", padding: "4px 2px" }}
            value={line.qty}
            inputMode="decimal"
            disabled={!!line.displayUnit}
            onChange={(e) => onQty(Number(e.target.value) || 0)}
          />
          <button
            className="btn-sm"
            style={{ width: 34, padding: 0 }}
            onClick={() => onQty(line.qty + 1)}
            disabled={!!line.displayUnit}
          >
            +
          </button>
        </div>
        <div className="tiny muted right">{p.product.unit}</div>

        <input
          className="num"
          style={{ minHeight: 36, textAlign: "right" }}
          value={line.unitPrice}
          inputMode="decimal"
          onChange={(e) => onPrice(Number(e.target.value) || 0)}
        />
        {saved > 0 && (
          <div className="tiny right muted2">
            <span className="strike">{money(listPrice!)}</span> ลด {money(saved)}
          </div>
        )}
        <div className="right bold money">
          {money(Math.round(line.unitPrice * 100 * line.qty) / 100)}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
function PaymentModal({
  total, busy, onClose, onConfirm,
}: {
  total: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (p: { method: PaymentMethod; amount: number }[]) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [received, setReceived] = useState("");
  const amount = Number(received) || 0;
  const change = method === "CASH" ? Math.max(0, amount - total) : 0;
  const short = method === "CASH" && amount > 0 && amount < total;

  // ปุ่มปัดเงินที่ลูกค้ามักยื่นมา - กดครั้งเดียวไม่ต้องพิมพ์
  const quick = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, 1000]
    .filter((v, i, arr) => v >= total && arr.indexOf(v) === i)
    .slice(0, 4);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          รับเงิน
          <div className="spacer" />
          <button className="btn-ghost btn-sm" onClick={onClose}>ปิด</button>
        </div>
        <div className="card-body stack">
          <div className="row">
            <div>
              <div className="total-label">ยอดที่ต้องจ่าย</div>
              <div className="total-amount">{money(total)}</div>
            </div>
          </div>

          <div className="row" style={{ gap: 6 }}>
            {([
              ["CASH", "เงินสด"],
              ["TRANSFER", "โอน"],
              ["CARD", "บัตร"],
              ["CREDIT", "ลงบัญชี"],
            ] as [PaymentMethod, string][]).map(([m, label]) => (
              <button
                key={m}
                className={method === m ? "btn-primary" : undefined}
                style={{ flex: 1 }}
                onClick={() => setMethod(m)}
              >
                {label}
              </button>
            ))}
          </div>

          {method === "CASH" && (
            <>
              <div className="stack-sm">
                <label>รับเงินมา</label>
                <input
                  className="num"
                  style={{ fontSize: "1.5rem", textAlign: "right", minHeight: 58 }}
                  inputMode="decimal"
                  autoFocus
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                />
              </div>
              <div className="row" style={{ gap: 6 }}>
                {quick.map((v) => (
                  <button key={v} style={{ flex: 1 }} onClick={() => setReceived(String(v))}>
                    {money(v)}
                  </button>
                ))}
              </div>
              <div
                className="row"
                style={{
                  background: change > 0 ? "var(--ok-bg)" : "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  padding: "10px 12px",
                }}
              >
                <span className="bold">เงินทอน</span>
                <div className="spacer" />
                <span className="total-amount" style={{ fontSize: "1.6rem" }}>
                  {money(change)}
                </span>
              </div>
              {short && (
                <div className="alert alert-danger">
                  รับเงินมาน้อยกว่ายอดบิล {money(total - amount)} บาท
                </div>
              )}
            </>
          )}

          <button
            className="btn-primary btn-lg btn-block"
            disabled={busy || (method === "CASH" && amount < total)}
            onClick={() =>
              onConfirm([{ method, amount: method === "CASH" ? amount : total }])
            }
          >
            {busy ? "กำลังบันทึก..." : "ยืนยันการขาย"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
function ApprovalModal({
  tierName, onClose, onApproved,
}: {
  tierName: string;
  onClose: () => void;
  onApproved: (ownerId: number) => void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setErr("");
    try {
      const owner = await post<{ id: number }>("/api/pos/auth/verify-owner", { pin });
      onApproved(owner.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "PIN ไม่ถูกต้อง");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          ขออนุมัติ{tierName}
          <div className="spacer" />
          <button className="btn-ghost btn-sm" onClick={onClose}>ยกเลิก</button>
        </div>
        <div className="card-body stack">
          <p className="small muted">
            ให้เจ้าของร้านกด PIN ที่เครื่องนี้ — ระบบจะบันทึกไว้ว่าใครเป็นคนอนุมัติ
          </p>
          <div
            className="row"
            style={{ justifyContent: "center", gap: 10, minHeight: 48,
                     background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}
          >
            {pin.length === 0
              ? <span className="muted2">กดตัวเลข</span>
              : Array.from({ length: pin.length }).map((_, i) => (
                  <span key={i} style={{ fontSize: "1.4rem" }}>●</span>
                ))}
          </div>
          {err && <div className="alert alert-danger">{err}</div>}
          <div className="keypad">
            {["1","2","3","4","5","6","7","8","9","ลบ","0","ตกลง"].map((k) => (
              <button
                key={k}
                disabled={busy}
                className={k === "ตกลง" ? "btn-primary" : undefined}
                onClick={() => {
                  if (k === "ลบ") setPin((p) => p.slice(0, -1));
                  else if (k === "ตกลง") void check();
                  else setPin((p) => (p.length >= 6 ? p : p + k));
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
/**
 * หน้าจอหลังขายเสร็จ
 *
 * สำคัญที่สุดคือ "ใบจัดของ": บอกว่าต้องเดินไปหยิบอะไรจากช่องไหน
 * เรียงตามลำดับการเดิน ให้เดินรอบเดียวจบ ไม่ต้องเดินย้อนไปมา
 */
function ReceiptView({ result, onNew }: { result: SaleResult; onNew: () => void }) {
  const picks = result.lines.flatMap((l) =>
    l.picks.map((p) => ({ ...p, name: l.productName, unit: l.unit }))
  );

  return (
    <div className="stack">
      <div className="card">
        <div className="card-body row">
          <div>
            <div className="total-label">ขายสำเร็จ • บิล {result.docNo}</div>
            <div className="total-amount">{money(result.total)}</div>
          </div>
          <div className="spacer" />
          <div className="right">
            <div className="small muted">เงินทอน</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>
              {money(result.changeAmount)}
            </div>
          </div>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="alert alert-warn">
          {result.warnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-head">📍 ใบจัดของ — เดินหยิบตามลำดับนี้</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>ช่อง</th>
                <th>สินค้า</th>
                <th className="r">จำนวน</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((p, i) => (
                <tr key={i}>
                  <td>
                    <span className={locClass(p.locationCode.split("-")[0])}>
                      {p.locationCode}
                    </span>
                    {p.wasOversell && (
                      <div className="tiny" style={{ color: "var(--danger)" }}>
                        ยอดไม่พอ ต้องนับ
                      </div>
                    )}
                  </td>
                  <td>
                    {p.name}
                    <div className="tiny muted">{p.locationLabel}</div>
                  </td>
                  <td className="r bold num">
                    {fmtQty(p.qty)} {p.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">ใบเสร็จ</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>รายการ</th>
                <th className="r">จำนวน</th>
                <th className="r">ราคา</th>
                <th className="r">รวม</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((l) => (
                <tr key={l.lineNo}>
                  <td>
                    {l.productName}
                    {l.isDisplayUnit && (
                      <span className="chip chip-display" style={{ marginInlineStart: 5 }}>
                        ตัวโชว์
                      </span>
                    )}
                  </td>
                  <td className="r num">{fmtQty(l.qty)}</td>
                  <td className="r num">{money(l.unitPrice)}</td>
                  <td className="r num bold">{money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-body stack-sm small">
          <div className="row">
            <span className="muted">ยอดก่อนภาษี</span>
            <div className="spacer" />
            <span className="num">{money(result.vatBase)}</span>
          </div>
          <div className="row">
            <span className="muted">ภาษีมูลค่าเพิ่ม 7%</span>
            <div className="spacer" />
            <span className="num">{money(result.vatAmount)}</span>
          </div>
          <div className="row bold" style={{ fontSize: "1.1rem" }}>
            <span>รวมทั้งสิ้น</span>
            <div className="spacer" />
            <span className="num">{money(result.total)}</span>
          </div>
        </div>
      </div>

      <div className="row no-print" style={{ gap: 8 }}>
        <button className="btn-primary btn-lg" style={{ flex: 1 }} onClick={onNew}>
          ขายบิลใหม่
        </button>
        <button className="btn-lg" onClick={() => window.print()}>
          พิมพ์
        </button>
      </div>
    </div>
  );
}
