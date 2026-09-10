"use client";

import { useCallback, useEffect, useState } from "react";
import { get, post, money, qty as fmtQty, daysAgo } from "@/lib/pos/client";
import type { LocationRef, ProductLookup } from "@/lib/pos/types";

/**
 * หน้าจัดการตัวโชว์โคมไฟ
 *
 * ตอบข้อกำหนด "โคมไฟต้องมีตัวโชว์ และบอกได้ว่าอยู่จุดไหน"
 *
 * 3 อย่างที่หน้านี้ทำ:
 *   1. ผังโชว์รูม - จุดไหนแขวนโคมรุ่นอะไร (พาลูกค้าเดินดูได้ / เดินตรวจได้)
 *   2. รายการโคมที่ยังไม่มีตัวโชว์ - ของเข้าใหม่แล้วไม่มีใครแขวน ลูกค้าก็ไม่รู้ว่าร้านมี
 *   3. ตรวจสภาพตามรอบ - โคมโชว์ฝุ่นจับ/หลอดขาด ทำให้ร้านดูไม่น่าเชื่อถือ
 */

interface DisplayMapSpot {
  locationId: number;
  locationCode: string;
  locationLabel: string;
  units: {
    id: number;
    productId: number;
    sku: string;
    productName: string;
    spotLabel: string;
    condition: string;
    isSellable: boolean;
    displayPrice: number | null;
    qtySellable: number;
    checkedAt: string | null;
  }[];
}

interface LampMissing {
  productId: number;
  sku: string;
  productName: string;
  qtySellable: number;
  brand: string | null;
}

const CONDITION_TH: Record<string, string> = {
  NEW: "ใหม่", GOOD: "ดี", FAIR: "พอใช้", DUSTY: "ฝุ่นจับ", DAMAGED: "ชำรุด",
};

export default function DisplayPage() {
  const [map, setMap] = useState<DisplayMapSpot[]>([]);
  const [missing, setMissing] = useState<LampMissing[]>([]);
  const [spots, setSpots] = useState<LocationRef[]>([]);
  const [bins, setBins] = useState<LocationRef[]>([]);
  const [setupFor, setSetupFor] = useState<LampMissing | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [data, locs] = await Promise.all([
        get<{ map: DisplayMapSpot[]; lampsWithoutDisplay: LampMissing[] }>("/api/pos/display"),
        get<LocationRef[]>("/api/pos/locations"),
      ]);
      setMap(data.map);
      setMissing(data.lampsWithoutDisplay);
      setSpots(locs.filter((l) => l.kind === "DISPLAY_SPOT"));
      setBins(locs.filter((l) => l.kind === "BIN" || l.kind === "STAGING"));
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "โหลดข้อมูลไม่ได้" });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function act(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    try {
      await post("/api/pos/display", body);
      setMsg({ kind: "ok", text: okText });
      await reload();
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }

  const totalUnits = map.reduce((a, s) => a + s.units.length, 0);
  const needCheck = map
    .flatMap((s) => s.units)
    .filter((u) => !u.checkedAt || Date.now() - new Date(u.checkedAt).getTime() > 30 * 86400000);

  return (
    <main className="page">
      {msg && <div className={`alert alert-${msg.kind}`}>{msg.text}</div>}

      <div className="grid grid-3" style={{ marginTop: msg ? 12 : 0 }}>
        <div className="card">
          <div className="card-body">
            <div className="small muted">ตัวโชว์ที่แขวนอยู่</div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--display)" }}>
              {totalUnits}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="small muted">โคมที่ยังไม่มีตัวโชว์</div>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                color: missing.length > 0 ? "var(--warn)" : "var(--ok)",
              }}
            >
              {missing.length}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="small muted">ถึงรอบตรวจสภาพ</div>
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                color: needCheck.length > 0 ? "var(--warn)" : "var(--ok)",
              }}
            >
              {needCheck.length}
            </div>
          </div>
        </div>
      </div>

      {/* โคมที่ยังไม่มีตัวโชว์ */}
      {missing.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head" style={{ color: "var(--warn)" }}>
            ⚠️ โคมไฟที่ยังไม่มีตัวโชว์ ({missing.length})
          </div>
          <div className="card-body">
            <p className="small muted" style={{ marginBottom: 8 }}>
              ลูกค้าซื้อโคมไฟจากการเห็นของจริง รุ่นที่ไม่มีตัวโชว์แทบไม่มีคนถาม
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>รุ่น</th>
                    <th className="r">มีในสต๊อก</th>
                    <th className="r no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {missing.map((m) => (
                    <tr key={m.productId}>
                      <td>
                        <div className="bold">{m.productName}</div>
                        <div className="tiny muted mono">
                          {m.sku}
                          {m.brand && ` • ${m.brand}`}
                        </div>
                      </td>
                      <td className="r num bold">{fmtQty(m.qtySellable)}</td>
                      <td className="r no-print">
                        <button
                          className="btn-sm btn-primary"
                          disabled={busy || m.qtySellable < 1}
                          onClick={() => setSetupFor(m)}
                          title={m.qtySellable < 1 ? "ไม่มีของให้ยกไปโชว์" : ""}
                        >
                          ตั้งโชว์
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ผังโชว์รูม */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-head">💡 ผังจุดโชว์ในร้าน</div>
        {map.length === 0 ? (
          <div className="empty">ยังไม่มีจุดโชว์ — ให้เจ้าของสร้างจุดโชว์ก่อน</div>
        ) : (
          <div className="card-body stack">
            {map.map((spot) => (
              <div key={spot.locationId} className="card" style={{ boxShadow: "none" }}>
                <div className="card-head" style={{ padding: "9px 12px" }}>
                  <span className="loc loc-display loc-lg">{spot.locationCode}</span>
                  <span className="small">{spot.locationLabel}</span>
                  <div className="spacer" />
                  <span className="chip">{spot.units.length} ตัว</span>
                </div>
                {spot.units.length === 0 ? (
                  <div className="empty small">จุดนี้ยังว่าง</div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>ตำแหน่งที่แขวน / รุ่น</th>
                          <th>สภาพ</th>
                          <th className="r">ในกล่อง</th>
                          <th className="r">ราคาตัวโชว์</th>
                          <th className="r">ตรวจล่าสุด</th>
                          <th className="r no-print">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spot.units.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <div className="bold">{u.spotLabel}</div>
                              <div className="small">{u.productName}</div>
                              <div className="tiny muted mono">{u.sku}</div>
                            </td>
                            <td>
                              <span
                                className={
                                  u.condition === "DAMAGED" || u.condition === "DUSTY"
                                    ? "chip chip-warn"
                                    : "chip chip-ok"
                                }
                              >
                                {CONDITION_TH[u.condition] ?? u.condition}
                              </span>
                              {!u.isSellable && (
                                <div className="tiny muted">ห้ามขายตัวนี้</div>
                              )}
                            </td>
                            <td className="r num">
                              {u.qtySellable > 0 ? (
                                fmtQty(u.qtySellable)
                              ) : (
                                <span className="chip chip-danger">หมด</span>
                              )}
                            </td>
                            <td className="r num">
                              {u.displayPrice != null ? money(u.displayPrice) : "-"}
                            </td>
                            <td className="r small muted nowrap">
                              {daysAgo(u.checkedAt, "ยังไม่ตรวจ")}
                            </td>
                            <td className="r no-print">
                              <UnitActions
                                unitId={u.id}
                                spots={spots}
                                bins={bins}
                                busy={busy}
                                onAct={act}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {setupFor && (
        <SetupModal
          lamp={setupFor}
          spots={spots}
          onClose={() => setSetupFor(null)}
          onDone={async (payload) => {
            await act(payload, `ตั้งโชว์ ${setupFor.productName} เรียบร้อย`);
            setSetupFor(null);
          }}
        />
      )}
    </main>
  );
}

// =====================================================================
function UnitActions({
  unitId, spots, bins, busy, onAct,
}: {
  unitId: number;
  spots: LocationRef[];
  bins: LocationRef[];
  busy: boolean;
  onAct: (body: Record<string, unknown>, okText: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn-sm" onClick={() => setOpen(true)} disabled={busy}>
        จัดการ
      </button>
    );
  }

  return (
    <div className="stack-sm" style={{ minWidth: 180 }}>
      <select
        style={{ minHeight: 36 }}
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          void onAct(
            { action: "check", displayUnitId: unitId, condition: e.target.value },
            "บันทึกผลตรวจสภาพแล้ว"
          );
          setOpen(false);
        }}
      >
        <option value="">— บันทึกผลตรวจสภาพ —</option>
        {Object.entries(CONDITION_TH).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <select
        style={{ minHeight: 36 }}
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          const spot = spots.find((s) => s.id === Number(e.target.value));
          void onAct(
            {
              action: "move",
              displayUnitId: unitId,
              toLocationId: Number(e.target.value),
              spotLabel: spot?.labelTh ?? "",
            },
            "ย้ายจุดโชว์แล้ว"
          );
          setOpen(false);
        }}
      >
        <option value="">— ย้ายไปจุดอื่น —</option>
        {spots.map((s) => (
          <option key={s.id} value={s.id}>{s.code} · {s.labelTh}</option>
        ))}
      </select>

      <select
        style={{ minHeight: 36 }}
        defaultValue=""
        onChange={(e) => {
          if (!e.target.value) return;
          void onAct(
            {
              action: "return",
              displayUnitId: unitId,
              toLocationId: Number(e.target.value),
              condition: "GOOD",
            },
            "เก็บตัวโชว์กลับเข้าสต๊อกแล้ว"
          );
          setOpen(false);
        }}
      >
        <option value="">— เก็บกลับเข้าชั้น —</option>
        {bins.map((b) => (
          <option key={b.id} value={b.id}>{b.code}</option>
        ))}
      </select>

      <button className="btn-sm btn-ghost" onClick={() => setOpen(false)}>ปิด</button>
    </div>
  );
}

// =====================================================================
function SetupModal({
  lamp, spots, onClose, onDone,
}: {
  lamp: LampMissing;
  spots: LocationRef[];
  onClose: () => void;
  onDone: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [product, setProduct] = useState<ProductLookup | null>(null);
  const [fromLocationId, setFromLocationId] = useState<number | "">("");
  const [spotId, setSpotId] = useState<number | "">("");
  const [spotLabel, setSpotLabel] = useState("");
  const [displayPrice, setDisplayPrice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<ProductLookup>(`/api/pos/products/${lamp.productId}`)
      .then((p) => {
        setProduct(p);
        const first = p.stock.find((s) => s.isPickable && s.qtyOnHand > 0);
        if (first) setFromLocationId(first.locationId);
      })
      .catch(() => {});
  }, [lamp.productId]);

  const valid = fromLocationId !== "" && spotId !== "" && spotLabel.trim().length > 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          ตั้งโชว์ {lamp.productName}
          <div className="spacer" />
          <button className="btn-ghost btn-sm" onClick={onClose}>ปิด</button>
        </div>
        <div className="card-body stack">
          <div className="alert alert-info small">
            ระบบจะยกของ 1 ชิ้นออกจากช่องเก็บไปอยู่ที่จุดโชว์
            ยอด &quot;พร้อมขาย&quot; จะลดลง 1 ซึ่งถูกต้อง เพราะตัวที่แขวนแล้วขายเป็นของใหม่ไม่ได้
          </div>

          <div className="stack-sm">
            <label>ยกจากช่องไหน</label>
            <select
              value={fromLocationId}
              onChange={(e) => setFromLocationId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">— เลือกช่อง —</option>
              {product?.stock
                .filter((s) => s.isPickable && s.qtyOnHand > 0)
                .map((s) => (
                  <option key={s.locationId} value={s.locationId}>
                    {s.locationCode} · เหลือ {fmtQty(s.qtyOnHand)}
                  </option>
                ))}
            </select>
          </div>

          <div className="stack-sm">
            <label>ไปตั้งโชว์ที่จุดไหน</label>
            <select
              value={spotId}
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                setSpotId(v);
                const s = spots.find((x) => x.id === v);
                if (s && !spotLabel) setSpotLabel(s.labelTh.replace(/^.*• /, ""));
              }}
            >
              <option value="">— เลือกจุดโชว์ —</option>
              {spots.map((s) => (
                <option key={s.id} value={s.id}>{s.code} · {s.labelTh}</option>
              ))}
            </select>
          </div>

          <div className="stack-sm">
            <label>ตำแหน่งที่แขวนจริง (พนักงานอ่านแล้วเดินไปเจอทันที)</label>
            <input
              placeholder="เช่น เสา 3 แถวบน ตัวที่ 2"
              value={spotLabel}
              onChange={(e) => setSpotLabel(e.target.value)}
            />
          </div>

          <div className="stack-sm">
            <label>ราคาขายตัวโชว์ (เว้นว่างถ้าขายราคาปกติ)</label>
            <input
              className="num"
              inputMode="decimal"
              placeholder="ปกติลดจากราคาปกติเพราะมีรอยจับ/ฝุ่น"
              value={displayPrice}
              onChange={(e) => setDisplayPrice(e.target.value)}
            />
          </div>

          <button
            className="btn-primary btn-lg btn-block"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDone({
                  action: "setup",
                  productId: lamp.productId,
                  fromLocationId,
                  displayLocationId: spotId,
                  spotLabel: spotLabel.trim(),
                  displayPrice: displayPrice === "" ? null : Number(displayPrice),
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            ยกไปตั้งโชว์
          </button>
        </div>
      </div>
    </div>
  );
}
