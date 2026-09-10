"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { get, post, money, qty as fmtQty, locClass, daysAgo } from "@/lib/pos/client";
import type { LocationRef, CountVariance } from "@/lib/pos/types";

/**
 * หน้านับสต๊อก
 *
 * ออกแบบให้นับ 1 ช่องจบใน 1 นาที เพราะนี่คือเงื่อนไขเดียวที่จะทำให้เกิดขึ้นจริง
 * ร้านที่มีพนักงาน 2 คนไม่มีใครยอมปิดร้านนับทั้งวัน
 * แต่ถ้านับวันละ 3 ช่อง ช่องละ 1 นาที ทั้งร้านจะแม่นขึ้นภายในเดือนเดียว
 *
 * ค่าเริ่มต้นเป็น "นับแบบปิดยอด" - ไม่โชว์ยอดระบบตอนนับ
 * เพราะถ้าเห็นยอดระบบก่อน คนนับจะกรอกตามยอดนั้นโดยไม่ได้นับจริง
 * แล้วเราจะได้ข้อมูลปลอมที่แย่กว่าไม่นับเลย (เพราะมันทำให้เชื่อว่าสต๊อกแม่น)
 */

interface QueueItem {
  productId: number;
  locationId: number;
  sku: string;
  productName: string;
  locationCode: string;
  locationLabel: string;
  qtyOnHand: number;
  priority: number;
  openNotFound: number;
  lastCountedAt: string | null;
  reason: string;
}

interface SessionInfo {
  session: { id: number; docNo: string; kind: string; status: string; isBlind: boolean } | null;
  counted: CountVariance[];
  pending: {
    locationId: number;
    locationCode: string;
    productId: number;
    sku: string;
    productName: string;
    unit: string;
  }[];
}

export default function CountPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [bin, setBin] = useState<LocationRef | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [blind, setBlind] = useState(true);
  const [scan, setScan] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<null | {
    docNo: string;
    adjusted: number;
    totalCostImpact: number;
    variances: CountVariance[];
  }>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const loadQueue = useCallback(async () => {
    try {
      setQueue(await get<QueueItem[]>("/api/pos/count/queue?limit=25"));
    } catch { /* ไม่สำคัญพอให้ขึ้น error */ }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const refreshSession = useCallback(async (id: number) => {
    setInfo(await get<SessionInfo>(`/api/pos/count/${id}`));
  }, []);

  /** เริ่มนับช่องหนึ่ง: ยิงป้ายชั้น หรือกดจากคิวงาน */
  async function startBin(locationId: number) {
    setBusy(true);
    setMsg(null);
    setPosted(null);
    try {
      const loc = await get<{ location: LocationRef }>(
        `/api/pos/locations/${locationId}/stock`
      );
      const started = await post<{ sessionId: number; docNo: string; lineCount: number }>(
        "/api/pos/count/start",
        { locationIds: [locationId], kind: "CYCLE", isBlind: blind }
      );
      setBin(loc.location);
      setSessionId(started.sessionId);
      await refreshSession(started.sessionId);
      setMsg({
        kind: "info",
        text:
          `เริ่มนับช่อง ${loc.location.code} (${started.docNo}) — ` +
          `ระบบคาดว่ามี ${started.lineCount} รายการในช่องนี้\n` +
          `นับของที่เห็นจริง ถ้าเจอของที่ไม่อยู่ในรายการ ให้ยิงบาร์โค้ดเพิ่มได้เลย`,
      });
      setTimeout(() => scanRef.current?.focus(), 50);
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }

  async function handleScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    setScan("");
    setBusy(true);
    try {
      const res = await get<{
        scan: { kind: string; productId?: number; locationId?: number };
        location?: LocationRef | null;
      }>(`/api/pos/scan?code=${encodeURIComponent(code)}`);

      // ยิงป้ายชั้น -> เริ่มนับช่องนั้น
      if (res.scan.kind === "LOCATION" && res.scan.locationId) {
        await startBin(res.scan.locationId);
        return;
      }
      // ยิงสินค้า -> เปิดช่องกรอกจำนวนของตัวนั้น
      if (res.scan.kind === "PRODUCT" && res.scan.productId) {
        if (!sessionId) {
          setMsg({ kind: "warn", text: "ยิงป้ายชั้นวางก่อน เพื่อบอกระบบว่ากำลังนับช่องไหน" });
          return;
        }
        setPendingProduct(res.scan.productId);
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

  const [pendingProduct, setPendingProduct] = useState<number | null>(null);

  async function saveCount(productId: number, countedQty: number) {
    if (!sessionId || !bin) return;
    setBusy(true);
    try {
      const res = await post<{ isNewFind: boolean; systemQty: number; variance: number }>(
        "/api/pos/count/record",
        { sessionId, locationId: bin.id, productId, countedQty }
      );
      await refreshSession(sessionId);
      setPendingProduct(null);
      if (res.isNewFind) {
        setMsg({
          kind: "warn",
          text:
            "เจอของที่ระบบไม่รู้ว่าอยู่ช่องนี้ — บันทึกแล้ว\n" +
            "ของวางผิดช่องคือสาเหตุอันดับหนึ่งของการหาไม่เจอ ข้อมูลนี้มีค่ามาก",
        });
      }
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
      setTimeout(() => scanRef.current?.focus(), 30);
    }
  }

  async function finish() {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await post<{
        docNo: string;
        adjusted: number;
        totalCostImpact: number;
        variances: CountVariance[];
      }>("/api/pos/count/post", { sessionId, treatUncountedAsZero: true });
      setPosted(res);
      setSessionId(null);
      setBin(null);
      setInfo(null);
      setMsg(null);
      await loadQueue();
    } catch (e) {
      setMsg({ kind: "danger", text: e instanceof Error ? e.message : "ผิดพลาด" });
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ หน้าจอ
  return (
    <main className="page">
      <div className="card">
        <div className="card-body stack">
          <input
            ref={scanRef}
            className="scan-input"
            value={scan}
            disabled={busy}
            autoComplete="off"
            placeholder={
              bin
                ? `กำลังนับ ${bin.code} — ยิงบาร์โค้ดสินค้าที่เห็นในช่อง`
                : "ยิงป้ายชั้นวางที่จะนับ (เช่น S-A2-3)"
            }
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleScan(scan)}
          />
          {!bin && (
            <label className="row small" style={{ gap: 8 }}>
              <input
                type="checkbox"
                style={{ width: 20, height: 20, minHeight: 20 }}
                checked={blind}
                onChange={(e) => setBlind(e.target.checked)}
              />
              <span>
                นับแบบปิดยอด (ไม่โชว์ยอดในระบบตอนนับ){" "}
                <span className="muted">— แนะนำให้เปิดไว้ ผลนับจะเชื่อถือได้จริง</span>
              </span>
            </label>
          )}
        </div>
      </div>

      {msg && (
        <div className={`alert alert-${msg.kind}`} style={{ marginTop: 12 }}>
          {msg.text}
        </div>
      )}

      {/* ผลหลังปรับยอด */}
      {posted && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            ปรับยอดเรียบร้อย • {posted.docNo}
            <div className="spacer" />
            <button className="btn-sm" onClick={() => setPosted(null)}>ปิด</button>
          </div>
          <div className="card-body stack">
            <div className="row row-wrap">
              <span className="chip chip-info">แก้ไข {posted.adjusted} รายการ</span>
              <span
                className={
                  posted.totalCostImpact < 0 ? "chip chip-danger" : "chip chip-ok"
                }
              >
                ผลต่างเป็นเงิน {money(posted.totalCostImpact)} บาท
              </span>
            </div>
            {posted.variances.length === 0 ? (
              <div className="alert alert-ok">
                นับแล้วตรงกับระบบทุกรายการ — ช่องนี้เชื่อถือได้
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th className="r">ระบบว่ามี</th>
                      <th className="r">นับได้</th>
                      <th className="r">ต่าง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posted.variances.map((v) => (
                      <tr key={v.lineId}>
                        <td>
                          {v.productName}
                          {v.isNewFind && (
                            <span className="chip chip-warn" style={{ marginInlineStart: 5 }}>
                              วางผิดช่อง
                            </span>
                          )}
                        </td>
                        <td className="r num">{fmtQty(v.systemQty)}</td>
                        <td className="r num bold">{fmtQty(v.countedQty)}</td>
                        <td
                          className="r num bold"
                          style={{ color: v.variance < 0 ? "var(--danger)" : "var(--ok)" }}
                        >
                          {v.variance > 0 ? "+" : ""}
                          {fmtQty(v.variance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* กำลังนับช่องนี้ */}
      {bin && info && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            <span className={`${locClass(bin.zoneCode)} loc-lg`}>{bin.code}</span>
            <span className="small muted">{bin.labelTh}</span>
            <div className="spacer" />
            <span className="chip chip-info">
              นับแล้ว {info.counted.length} / {info.counted.length + info.pending.length}
            </span>
          </div>

          <div className="card-body stack">
            {/* ยังไม่ได้นับ */}
            {info.pending.length > 0 && (
              <>
                <h3 className="small muted">ยังไม่ได้นับ — กดเพื่อกรอกจำนวน</h3>
                <div className="stack-sm">
                  {info.pending.map((x) => (
                    <button
                      key={x.productId}
                      className="row"
                      style={{ justifyContent: "flex-start", textAlign: "left", padding: "8px 12px" }}
                      onClick={() => setPendingProduct(x.productId)}
                    >
                      <span className="grow">
                        {x.productName}
                        <div className="tiny muted mono">{x.sku}</div>
                      </span>
                      <span className="chip">กรอกจำนวน</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* นับแล้ว */}
            {info.counted.length > 0 && (
              <>
                <h3 className="small muted">นับแล้ว</h3>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>สินค้า</th>
                        <th className="r">นับได้</th>
                        {!info.session?.isBlind && <th className="r">ต่าง</th>}
                        <th className="r no-print"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.counted.map((v) => (
                        <tr key={v.lineId}>
                          <td>
                            {v.productName}
                            {v.isNewFind && (
                              <span className="chip chip-warn" style={{ marginInlineStart: 5 }}>
                                วางผิดช่อง
                              </span>
                            )}
                          </td>
                          <td className="r num bold">
                            {fmtQty(v.countedQty)} {v.unit}
                          </td>
                          {!info.session?.isBlind && (
                            <td
                              className="r num bold"
                              style={{
                                color: v.variance === 0
                                  ? "var(--ok)"
                                  : v.variance < 0 ? "var(--danger)" : "var(--warn)",
                              }}
                            >
                              {v.variance > 0 ? "+" : ""}
                              {fmtQty(v.variance)}
                            </td>
                          )}
                          <td className="r no-print">
                            <button
                              className="btn-sm"
                              onClick={() => setPendingProduct(v.productId)}
                            >
                              แก้
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="alert alert-warn small">
              รายการที่ยังไม่นับ ระบบจะถือว่าเป็น 0 เมื่อกดปรับยอด
              เพราะถ้าไม่เจอของในช่องแปลว่าไม่มีจริง ยอดผีจะค้างอยู่ตลอดถ้าไม่ล้าง
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn-primary btn-lg"
                style={{ flex: 1 }}
                disabled={busy || info.counted.length === 0}
                onClick={finish}
              >
                ปรับยอดตามที่นับได้
              </button>
              <button
                className="btn-lg"
                disabled={busy}
                onClick={() => {
                  setBin(null);
                  setSessionId(null);
                  setInfo(null);
                  setMsg({ kind: "info", text: "ออกจากการนับแล้ว ยอดยังไม่ถูกปรับ" });
                }}
              >
                ออก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* คิวงานนับ */}
      {!bin && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            📦 ช่องที่ควรนับ (เรียงตามความเร่งด่วน)
            <div className="spacer" />
            <button className="btn-sm" onClick={() => void loadQueue()}>
              โหลดใหม่
            </button>
          </div>
          {queue.length === 0 ? (
            <div className="empty">ไม่มีช่องที่ต้องนับตอนนี้ — สต๊อกอยู่ในเกณฑ์ดี</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>ช่อง</th>
                    <th>สินค้า / เหตุผล</th>
                    <th className="r">ระบบว่ามี</th>
                    <th className="r">นับล่าสุด</th>
                    <th className="r no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((q) => (
                    <tr key={`${q.productId}:${q.locationId}`}>
                      <td>
                        <span className={locClass(q.locationCode.split("-")[0])}>
                          {q.locationCode}
                        </span>
                      </td>
                      <td>
                        <div>{q.productName}</div>
                        <div
                          className="tiny"
                          style={{
                            color: q.priority >= 90 ? "var(--danger)" : "var(--text-2)",
                          }}
                        >
                          {q.reason}
                        </div>
                      </td>
                      <td
                        className="r num bold"
                        style={{ color: q.qtyOnHand < 0 ? "var(--danger)" : undefined }}
                      >
                        {fmtQty(q.qtyOnHand)}
                      </td>
                      <td className="r small muted nowrap">
                        {daysAgo(q.lastCountedAt, "ไม่เคย")}
                      </td>
                      <td className="r no-print">
                        <button
                          className="btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => void startBin(q.locationId)}
                        >
                          นับช่องนี้
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pendingProduct && bin && (
        <QtyModal
          productId={pendingProduct}
          systemQty={
            info?.session?.isBlind
              ? null
              : info?.counted.find((c) => c.productId === pendingProduct)?.systemQty ??
                null
          }
          name={
            info?.pending.find((p) => p.productId === pendingProduct)?.productName ??
            info?.counted.find((c) => c.productId === pendingProduct)?.productName ??
            "สินค้า"
          }
          onClose={() => setPendingProduct(null)}
          onSave={(q) => void saveCount(pendingProduct, q)}
        />
      )}
    </main>
  );
}

// =====================================================================
function QtyModal({
  productId, name, systemQty, onClose, onSave,
}: {
  productId: number;
  name: string;
  systemQty: number | null;
  onClose: () => void;
  onSave: (q: number) => void;
}) {
  const [val, setVal] = useState("");
  const n = Number(val);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          นับได้กี่{"ชิ้น/หน่วย"}
          <div className="spacer" />
          <button className="btn-ghost btn-sm" onClick={onClose}>ปิด</button>
        </div>
        <div className="card-body stack">
          <div className="bold">{name}</div>
          {systemQty !== null && (
            <div className="small muted">ระบบว่ามี {fmtQty(systemQty)}</div>
          )}
          <input
            className="num"
            style={{ fontSize: "1.8rem", textAlign: "center", minHeight: 64 }}
            inputMode="decimal"
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && val !== "" && Number.isFinite(n) && n >= 0) {
                onSave(n);
              }
            }}
          />
          <div className="keypad">
            {["1","2","3","4","5","6","7","8","9",".","0","ลบ"].map((k) => (
              <button
                key={k}
                onClick={() =>
                  setVal((v) => (k === "ลบ" ? v.slice(0, -1) : v + k))
                }
              >
                {k}
              </button>
            ))}
          </div>
          <button
            className="btn-primary btn-lg btn-block"
            disabled={val === "" || !Number.isFinite(n) || n < 0}
            onClick={() => onSave(n)}
          >
            บันทึก
          </button>
          <button className="btn-block" onClick={() => onSave(0)}>
            ไม่มีของในช่องนี้ (นับได้ 0)
          </button>
        </div>
      </div>
    </div>
  );
}
