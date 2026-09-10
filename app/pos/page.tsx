"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { get, money, qty as fmtQty, locClass, daysAgo, thaiDateTime } from "@/lib/pos/client";

/**
 * หน้าแรก - งานวันนี้
 *
 * ไม่ใช่แดชบอร์ดกราฟสวยงาม แต่เป็น "รายการงานที่ทำเสร็จได้ในไม่กี่นาที"
 *
 * เหตุผล: ปัญหาสต๊อกของร้านนี้ไม่ได้แก้ด้วยการรู้ตัวเลข แต่แก้ด้วยการทำงานเล็กๆ
 * ทุกวัน (นับ 3 ช่อง, เก็บของเข้าชั้น, ปิดใบแจ้งหาไม่เจอ)
 * หน้านี้จึงบอกว่า "วันนี้ต้องทำอะไร" ไม่ใช่ "เดือนนี้ขายได้เท่าไหร่"
 */

interface Dash {
  todaySales: number;
  todayBills: number;
  countQueue: {
    productId: number; locationId: number; sku: string; productName: string;
    locationCode: string; qtyOnHand: number; priority: number; reason: string;
    lastCountedAt: string | null;
  }[];
  openNotFound: {
    id: number; reportedAt: string; sku: string; productName: string;
    locationCode: string; locationLabel: string; expectedQty: number; reportedBy: string;
  }[];
  lampsWithoutDisplay: { productId: number; sku: string; productName: string; qtySellable: number }[];
  unputaway: { productId: number; sku: string; productName: string; unit: string; qty: number; since: string | null }[];
  negativeStock: { productName: string; locationCode: string; qty: number }[];
  replenish: {
    productName: string; locationCode: string; locationLabel: string;
    qtyNow: number; qtyToFill: number; unit: string;
  }[];
  notFoundStats: {
    total: number;
    byLocation: { locationCode: string; locationLabel: string; count: number }[];
    byProduct: { sku: string; productName: string; count: number }[];
    byResolution: { resolution: string; count: number }[];
  };
}

export default function DashboardPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setD(await get<Dash>("/api/pos/dashboard"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่ได้");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) {
    return (
      <main className="page">
        <div className="alert alert-danger">{err}</div>
      </main>
    );
  }
  if (!d) {
    return (
      <main className="page">
        <div className="empty">กำลังโหลด...</div>
      </main>
    );
  }

  const jobs = [
    { n: d.negativeStock.length, label: "ยอดติดลบ", href: "/pos/count", tone: "danger" },
    { n: d.openNotFound.length, label: "แจ้งหาไม่เจอ", href: "/pos/count", tone: "danger" },
    { n: d.unputaway.length, label: "ของยังไม่เข้าชั้น", href: "/pos/receive", tone: "warn" },
    { n: d.countQueue.length, label: "ช่องที่ควรนับ", href: "/pos/count", tone: "warn" },
    { n: d.replenish.length, label: "ต้องเติมหน้าร้าน", href: "/pos/find", tone: "info" },
    { n: d.lampsWithoutDisplay.length, label: "โคมไม่มีตัวโชว์", href: "/pos/display", tone: "info" },
  ];

  return (
    <main className="page stack">
      {/* ยอดขายวันนี้ */}
      <div className="card">
        <div className="card-body row row-wrap">
          <div>
            <div className="total-label">ยอดขายวันนี้</div>
            <div className="total-amount">{money(d.todaySales)}</div>
          </div>
          <div className="spacer" />
          <div className="right">
            <div className="small muted">จำนวนบิล</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{d.todayBills}</div>
          </div>
          <Link href="/pos/sell" className="btn btn-primary btn-lg" style={{ marginInlineStart: 12 }}>
            เปิดหน้าขาย
          </Link>
        </div>
      </div>

      {/* สรุปงานค้าง */}
      <div className="grid grid-3">
        {jobs.map((j) => (
          <Link
            key={j.label}
            href={j.href}
            className="card"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="card-body">
              <div className="small muted">{j.label}</div>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  color:
                    j.n === 0
                      ? "var(--ok)"
                      : j.tone === "danger"
                      ? "var(--danger)"
                      : j.tone === "warn"
                      ? "var(--warn)"
                      : "var(--info)",
                }}
              >
                {j.n}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ยอดติดลบ - ผิดแน่นอน ต้องแก้ก่อนเพื่อน */}
      {d.negativeStock.length > 0 && (
        <div className="card">
          <div className="card-head" style={{ color: "var(--danger)" }}>
            🔴 ยอดติดลบ — ขายไปมากกว่าที่ระบบมี ต้องนับช่องนี้ทันที
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>สินค้า</th><th>ช่อง</th><th className="r">ยอด</th></tr>
              </thead>
              <tbody>
                {d.negativeStock.map((n, i) => (
                  <tr key={i}>
                    <td>{n.productName}</td>
                    <td>
                      <span className={locClass(n.locationCode.split("-")[0])}>
                        {n.locationCode}
                      </span>
                    </td>
                    <td className="r num bold" style={{ color: "var(--danger)" }}>
                      {fmtQty(n.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ใบแจ้งหาไม่เจอที่ยังไม่ปิด */}
      {d.openNotFound.length > 0 && (
        <div className="card">
          <div className="card-head" style={{ color: "var(--danger)" }}>
            🔎 แจ้งหาไม่เจอ ยังไม่ได้ตรวจ ({d.openNotFound.length})
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>สินค้า</th><th>ช่อง</th>
                  <th className="r">ระบบว่ามี</th><th>แจ้งโดย</th><th className="r">เมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {d.openNotFound.map((n) => (
                  <tr key={n.id}>
                    <td>
                      {n.productName}
                      <div className="tiny muted mono">{n.sku}</div>
                    </td>
                    <td>
                      <span className={locClass(n.locationCode.split("-")[0])}>
                        {n.locationCode}
                      </span>
                    </td>
                    <td className="r num">{fmtQty(n.expectedQty)}</td>
                    <td className="small">{n.reportedBy}</td>
                    <td className="r small muted nowrap">{thaiDateTime(n.reportedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ต้องเติมของหน้าร้าน */}
      {d.replenish.length > 0 && (
        <div className="card">
          <div className="card-head">🔄 เติมของหน้าร้านจากสโตร์</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>สินค้า</th><th>ช่องหน้าร้าน</th>
                  <th className="r">เหลือ</th><th className="r">ควรเติม</th>
                </tr>
              </thead>
              <tbody>
                {d.replenish.map((r, i) => (
                  <tr key={i}>
                    <td>{r.productName}</td>
                    <td>
                      <span className={locClass(r.locationCode.split("-")[0])}>
                        {r.locationCode}
                      </span>
                    </td>
                    <td className="r num">{fmtQty(r.qtyNow)}</td>
                    <td className="r num bold">
                      +{fmtQty(r.qtyToFill)} {r.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ช่องที่ควรนับวันนี้ */}
      {d.countQueue.length > 0 && (
        <div className="card">
          <div className="card-head">
            📦 นับสต๊อกวันนี้ (แนะนำ 3 ช่องพอ ใช้เวลา 3 นาที)
            <div className="spacer" />
            <Link href="/pos/count" className="btn btn-sm btn-primary">ไปนับ</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ช่อง</th><th>สินค้า / เหตุผล</th>
                  <th className="r">ระบบว่ามี</th><th className="r">นับล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {d.countQueue.slice(0, 6).map((q) => (
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
                        style={{ color: q.priority >= 90 ? "var(--danger)" : "var(--text-2)" }}
                      >
                        {q.reason}
                      </div>
                    </td>
                    <td className="r num">{fmtQty(q.qtyOnHand)}</td>
                    <td className="r small muted nowrap">{daysAgo(q.lastCountedAt, "ไม่เคย")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* สถิติต้นเหตุ - สำหรับเจ้าของ */}
      {d.notFoundStats.total > 0 && (
        <div className="card">
          <div className="card-head">
            📊 สถิติ &quot;หาไม่เจอ&quot; 30 วันล่าสุด — รวม {d.notFoundStats.total} ครั้ง
          </div>
          <div className="card-body grid grid-3">
            <div>
              <h3 className="small muted">ช่องที่มีปัญหาบ่อย</h3>
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {d.notFoundStats.byLocation.slice(0, 5).map((l) => (
                  <div key={l.locationCode} className="row small">
                    <span className={locClass(l.locationCode.split("-")[0])}>
                      {l.locationCode}
                    </span>
                    <div className="spacer" />
                    <span className="bold num">{l.count} ครั้ง</span>
                  </div>
                ))}
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                ช่องที่ขึ้นบ่อยแปลว่ามีอะไรผิดปกติจริง เช่น ป้ายหลุด ของสองรุ่นหน้าตาคล้ายกัน
                หรือชั้นสูงเกินไปจนมองไม่เห็น — แก้ที่ช่องนั้นได้ผลกว่าเตือนพนักงาน
              </p>
            </div>
            <div>
              <h3 className="small muted">สินค้าที่หาไม่เจอบ่อย</h3>
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {d.notFoundStats.byProduct.slice(0, 5).map((p) => (
                  <div key={p.sku} className="row small">
                    <span className="grow">{p.productName}</span>
                    <span className="bold num">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="small muted">สรุปแล้วเกิดจากอะไร</h3>
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {d.notFoundStats.byResolution.map((r) => (
                  <div key={r.resolution} className="row small">
                    <span className="grow">
                      {({
                        FOUND_SAME_BIN: "หาเจอในช่องเดิม (มองไม่เห็นเอง)",
                        FOUND_OTHER_BIN: "ไปเจอช่องอื่น (วางผิดที่)",
                        WAS_DISPLAY: "ที่เห็นคือตัวโชว์",
                        ADJUSTED: "ไม่มีจริง ปรับยอดลง",
                        DAMAGED: "ของเสียไม่ได้บันทึก",
                        UNRESOLVED: "ยังหาสาเหตุไม่ได้",
                      } as Record<string, string>)[r.resolution] ?? r.resolution}
                    </span>
                    <span className="bold num">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body row row-wrap" style={{ gap: 8 }}>
          <Link href="/pos/labels" className="btn">🏷️ พิมพ์ป้ายบาร์โค้ด</Link>
          <Link href="/pos/find" className="btn">🔍 ค้นหาของ</Link>
          <Link href="/pos/display" className="btn">💡 ตัวโชว์โคมไฟ</Link>
        </div>
      </div>
    </main>
  );
}
