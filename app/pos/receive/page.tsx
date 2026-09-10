"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get, post, money, qty as fmtQty, locClass, daysAgo } from "@/lib/pos/client";
import type { ProductLookup, LocationRef } from "@/lib/pos/types";

/**
 * หน้ารับของเข้า
 *
 * กฎเดียวที่ห้ามยืดหยุ่น: ทุกบรรทัดต้องเลือกช่องเก็บ
 *
 * ตอนรับของคือจุดที่ตำแหน่งของหายไปจากระบบมากที่สุด
 * ถ้าปล่อยให้รับเข้าโดยไม่ระบุช่อง ของจะเข้าระบบแต่ไม่มีใครรู้ว่าอยู่ไหน
 * แล้ววงจร "ระบบบอกมี แต่หาไม่เจอ" ก็เริ่มรอบใหม่
 *
 * ถ้ายังไม่รู้จะเก็บไหนจริงๆ ให้เลือกจุดพักของ (F-TMP)
 * ซึ่งจะขึ้นเตือนทุกวันจนกว่าจะย้ายเข้าชั้น
 */

interface RLine {
  key: string;
  product: ProductLookup;
  qty: number;
  unitCost: number;
  location: LocationRef | null;
}

interface Unputaway {
  productId: number;
  sku: string;
  productName: string;
  unit: string;
  qty: number;
  since: string | null;
}

export default function ReceivePage() {
  const [lines, setLines] = useState<RLine[]>([]);
  const [locations, setLocations] = useState<LocationRef[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [supplierDoc, setSupplierDoc] = useState("");
  const [unputaway, setUnputaway] = useState<Unputaway[]>([]);
  const [scan, setScan] = useState("");
  const [defaultLoc, setDefaultLoc] = useState<LocationRef | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | {
    docNo: string;
    totalCost: number;
    putaway: { productName: string; qty: number; unit: string; locationCode: string; locationLabel: string }[];
    warnings: string[];
  }>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const [locs, meta] = await Promise.all([
        get<LocationRef[]>("/api/pos/locations"),
        get<{ unputaway: Unputaway[]; suppliers: { id: number; name: string }[] }>(
          "/api/pos/receive"
        ),
      ]);
      setLocations(locs.filter((l) => l.kind === "BIN" || l.kind === "STAGING"));
      setUnputaway(meta.unputaway);
      setSuppliers(meta.suppliers);
    } catch { /* หน้ายังใช้ได้แม้โหลดข้อมูลเสริมไม่ได้ */ }
  }, []);

  useEffect(() => {
    void reload();
    scanRef.current?.focus();
  }, [reload]);

  async function handleScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setScan("");
    setBusy(true);
    try {
      const res = await get<{
        scan: { kind: string; productId?: number; locationId?: number; packQty?: number };
        product?: ProductLookup | null;
        location?: LocationRef | null;
      }>(`/api/pos/scan?code=${encodeURIComponent(code)}`);

      // ยิงป้ายชั้น -> ตั้งเป็นช่องปลายทางเริ่มต้นของบรรทัดต่อไป
      if (res.scan.kind === "LOCATION" && res.location) {
        setDefaultLoc(res.location);
        setLines((prev) =>
          prev.map((l) => (l.location ? l : { ...l, location: res.location! }))
        );
        setMsg({ kind: "info", text: `ตั้งช่องเก็บเป็น ${res.location.code} แล้ว` });
        return;
      }

      if (res.scan.kind === "PRODUCT" && res.product) {
        const p = res.product;
        setLines((prev) => {
          const idx = prev.findIndex((l) => l.product.product.id === p.product.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], qty: next[idx].qty + (res.scan.packQty ?? 1) };
            return next;
          }
          // ช่องเริ่มต้น: ช่องที่เคยเก็บของตัวนี้อยู่แล้ว จะได้ไม่ต้องเลือกใหม่ทุกครั้ง
          const home =
            p.stock.find((s) => s.isPickable && s.locationKind === "BIN") ?? null;
          const homeLoc = home
            ? locations.find((l) => l.id === home.locationId) ?? null
            : null;
          return [
            ...prev,
            {
              key: `${p.product.id}`,
              product: p,
              qty: res.scan.packQty ?? 1,
              unitCost: p.product.costAvg || 0,
              location: homeLoc ?? defaultLoc,
            },
          ];
        });
        return;
      }
      setMsg({ kind: "warn", text: `ไม่รู้จัก "${code}"` });
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
      setTimeout(() => scanRef.current?.focus(), 30);
    }
  }

  async function submit() {
    const missing = lines.filter((l) => !l.location);
    if (missing.length > 0) {
      setMsg({
        kind: "danger",
        text:
          `ยังไม่ได้เลือกช่องเก็บ ${missing.length} รายการ — ` +
          `ถ้ายังไม่รู้จะเก็บไหน ให้เลือก "จุดพักของ" ระบบจะเตือนให้ย้ายเข้าชั้นทีหลัง`,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await post<typeof done>("/api/pos/receive", {
        supplierId: supplierId === "" ? null : supplierId,
        supplierDoc: supplierDoc.trim() || null,
        lines: lines.map((l) => ({
          productId: l.product.product.id,
          qty: l.qty,
          unitCost: l.unitCost,
          locationId: l.location!.id,
        })),
      });
      setDone(res);
      setLines([]);
      setSupplierDoc("");
      setMsg(null);
      await reload();
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }

  const total = lines.reduce((a, l) => a + l.qty * l.unitCost, 0);

  return (
    <main className="page">
      {done && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            รับของเรียบร้อย • {done.docNo}
            <div className="spacer" />
            <span className="chip">ต้นทุนรวม {money(done.totalCost)}</span>
            <button className="btn-sm" onClick={() => setDone(null)}>ปิด</button>
          </div>
          <div className="card-body stack">
            {done.warnings.map((w, i) => (
              <div key={i} className="alert alert-warn">{w}</div>
            ))}
            <h3>📍 ใบจัดเก็บ — เอาไปวางช่องนี้</h3>
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
                  {done.putaway.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <span className={locClass(p.locationCode.split("-")[0])}>
                          {p.locationCode}
                        </span>
                      </td>
                      <td>
                        {p.productName}
                        <div className="tiny muted">{p.locationLabel}</div>
                      </td>
                      <td className="r num bold">
                        {fmtQty(p.qty)} {p.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="no-print" onClick={() => window.print()}>
              พิมพ์ใบจัดเก็บ
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body stack">
          <input
            ref={scanRef}
            className="scan-input"
            value={scan}
            disabled={busy}
            autoComplete="off"
            placeholder="ยิงบาร์โค้ดสินค้าที่รับเข้า (ยิงป้ายชั้นเพื่อตั้งช่องเก็บ)"
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleScan(scan)}
          />
          <div className="row row-wrap" style={{ gap: 8 }}>
            <select
              style={{ maxWidth: 260 }}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value === "" ? "" : Number(e.target.value))}
            >
              <option value="">— เลือกซัพพลายเออร์ —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              style={{ maxWidth: 220 }}
              placeholder="เลขที่บิลของซัพพลายเออร์"
              value={supplierDoc}
              onChange={(e) => setSupplierDoc(e.target.value)}
            />
            {defaultLoc && (
              <span className={locClass(defaultLoc.zoneCode)}>
                ช่องเริ่มต้น {defaultLoc.code}
              </span>
            )}
          </div>
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.kind}`} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}

      {lines.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">รายการรับเข้า ({lines.length})</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th style={{ width: 96 }}>จำนวน</th>
                  <th style={{ width: 110 }}>ทุน/หน่วย</th>
                  <th style={{ width: 210 }}>เก็บที่ช่อง</th>
                  <th className="r"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td>
                      <div className="bold">{l.product.product.nameTh}</div>
                      <div className="tiny muted mono">{l.product.product.sku}</div>
                    </td>
                    <td>
                      <input
                        className="num"
                        style={{ minHeight: 38, textAlign: "center" }}
                        inputMode="decimal"
                        value={l.qty}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key ? { ...x, qty: Number(e.target.value) || 0 } : x
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        style={{ minHeight: 38, textAlign: "right" }}
                        inputMode="decimal"
                        value={l.unitCost}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? { ...x, unitCost: Number(e.target.value) || 0 }
                                : x
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      <select
                        style={{ minHeight: 38 }}
                        value={l.location?.id ?? ""}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key
                                ? {
                                    ...x,
                                    location:
                                      locations.find((c) => c.id === Number(e.target.value)) ??
                                      null,
                                  }
                                : x
                            )
                          )
                        }
                      >
                        <option value="">— ต้องเลือกช่อง —</option>
                        {locations.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} · {c.labelTh}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="r">
                      <button
                        className="btn-sm"
                        onClick={() =>
                          setLines((prev) => prev.filter((x) => x.key !== l.key))
                        }
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-body row">
            <span className="muted">ต้นทุนรวม</span>
            <div className="spacer" />
            <span className="total-amount" style={{ fontSize: "1.5rem" }}>
              {money(total)}
            </span>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <button
              className="btn-primary btn-lg btn-block"
              disabled={busy}
              onClick={submit}
            >
              บันทึกรับของเข้า
            </button>
          </div>
        </div>
      )}

      {/* ของค้างจุดพักของ */}
      {unputaway.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head" style={{ color: "var(--warn)" }}>
            ⚠️ ของค้างที่จุดพักของ ยังไม่ได้เก็บเข้าชั้น ({unputaway.length})
          </div>
          <div className="card-body">
            <p className="small muted" style={{ marginBottom: 8 }}>
              ของพวกนี้อยู่ในระบบแต่ยังไม่มีตำแหน่งจริง ถ้าปล่อยไว้จะกลายเป็นของที่หาไม่เจอ
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th className="r">จำนวน</th>
                    <th className="r">ค้างมาตั้งแต่</th>
                    <th className="r no-print">ย้ายเข้าชั้น</th>
                  </tr>
                </thead>
                <tbody>
                  {unputaway.map((u) => (
                    <PutawayRow
                      key={u.productId}
                      item={u}
                      locations={locations}
                      onDone={reload}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PutawayRow({
  item, locations, onDone,
}: {
  item: Unputaway;
  locations: LocationRef[];
  onDone: () => Promise<void>;
}) {
  const [target, setTarget] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const staging = locations.find((l) => l.code === "F-TMP");

  async function move() {
    if (target === "" || !staging) return;
    setBusy(true);
    try {
      await post("/api/pos/transfer", {
        productId: item.productId,
        fromLocationId: staging.id,
        toLocationId: target,
        qty: item.qty,
        note: "ย้ายจากจุดพักของเข้าชั้นจริง",
      });
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>
        <div>{item.productName}</div>
        <div className="tiny muted mono">{item.sku}</div>
      </td>
      <td className="r num bold">
        {fmtQty(item.qty)} {item.unit}
      </td>
      <td className="r small muted nowrap">{daysAgo(item.since)}</td>
      <td className="r no-print">
        <div className="row" style={{ gap: 5, justifyContent: "flex-end" }}>
          <select
            style={{ minHeight: 36, maxWidth: 190 }}
            value={target}
            onChange={(e) => setTarget(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">— เลือกช่อง —</option>
            {locations
              .filter((l) => l.kind === "BIN")
              .map((l) => (
                <option key={l.id} value={l.id}>{l.code}</option>
              ))}
          </select>
          <button className="btn-sm btn-primary" disabled={busy || target === ""} onClick={move}>
            ย้าย
          </button>
        </div>
      </td>
    </tr>
  );
}
