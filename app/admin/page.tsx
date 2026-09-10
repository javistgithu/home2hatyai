import type { Metadata } from "next";
import Link from "next/link";
import TopBar from "@/components/nav/TopBar";
import AdminNav from "@/components/admin/AdminNav";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { PROPERTY_TYPE_TH, formatRelativeTime } from "@/lib/format";
import type { AdminStats, AuditLog, IngestRun, PropertyType } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ผู้ดูแลระบบ" };

export default async function AdminDashboard() {
  const session = await requireRole(["admin"], "/admin");
  const supabase = createClient();

  const [{ data: statsData, error }, { data: runsData }, { data: auditData }] = await Promise.all([
    supabase.rpc("admin_dashboard_stats"),
    supabase.from("ingest_runs").select("*").order("started_at", { ascending: false }).limit(5),
    supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  const stats = (statsData ?? {}) as Partial<AdminStats>;
  const runs = (runsData ?? []) as IngestRun[];
  const audits = (auditData ?? []) as AuditLog[];

  const maxDistrict = Math.max(1, ...(stats.by_district ?? []).map((d) => d.total));

  return (
    <>
      <TopBar role={session.role} title="ผู้ดูแลระบบ" subtitle="ภาพรวมข้อมูลทั้งระบบ" />
      <AdminNav counts={{ pending: stats.listings_pending ?? 0, duplicates: stats.dup_pending_review ?? 0 }} />

      <div className="container section stack">
        {error ? <div className="notice notice-danger">โหลดสถิติไม่สำเร็จ: {error.message}</div> : null}

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">ประกาศเผยแพร่</div>
            <div className="stat-value">{(stats.listings_published ?? 0).toLocaleString("th-TH")}</div>
            <div className="stat-note">+{stats.published_7d ?? 0} ใน 7 วัน</div>
          </div>
          <div className="stat">
            <div className="stat-label">รออนุมัติ</div>
            <div className="stat-value" style={{ color: (stats.listings_pending ?? 0) > 0 ? "var(--warn)" : undefined }}>
              {stats.listings_pending ?? 0}
            </div>
            <Link className="stat-note link" href="/admin/moderation">ตรวจเลย →</Link>
          </div>
          <div className="stat">
            <div className="stat-label">รายการซ้ำที่รวมแล้ว</div>
            <div className="stat-value">{stats.listings_duplicate ?? 0}</div>
            <div className="stat-note">รอตัดสิน {stats.dup_pending_review ?? 0}</div>
          </div>
          <div className="stat">
            <div className="stat-label">โพสต์ดิบที่เก็บได้</div>
            <div className="stat-value">{(stats.raw_posts_total ?? 0).toLocaleString("th-TH")}</div>
            <div className="stat-note">+{stats.ingested_7d ?? 0} ใน 7 วัน</div>
          </div>
        </div>

        <div className="card card-pad stack">
          <div className="strong">คุณภาพข้อมูล</div>
          <div className="row-between small">
            <span className="muted">ประกาศที่มีพิกัดบนแผนที่</span>
            <span className="strong">{stats.geo_coverage_pct ?? 0}%</span>
          </div>
          <div className="bar"><span style={{ width: `${stats.geo_coverage_pct ?? 0}%` }} /></div>

          <div className="row-between small" style={{ marginTop: 6 }}>
            <span className="muted">คะแนนความครบถ้วนเฉลี่ย</span>
            <span className="strong">{stats.avg_quality ?? 0}/100</span>
          </div>
          <div className="bar"><span style={{ width: `${stats.avg_quality ?? 0}%` }} /></div>

          {(stats.listings_no_geo ?? 0) > 0 ? (
            <div className="notice notice-warn tiny">
              มี {stats.listings_no_geo} ประกาศที่ยังไม่มีพิกัด — ปักหมุดให้เพื่อให้แสดงบนแผนที่ได้
            </div>
          ) : null}
        </div>

        <div className="card card-pad stack">
          <div className="strong">ประกาศแยกตามอำเภอ</div>
          {(stats.by_district ?? []).length === 0 ? (
            <div className="small muted">ยังไม่มีข้อมูล</div>
          ) : (
            (stats.by_district ?? []).map((row) => (
              <div key={row.district} className="stack" style={{ gap: 3 }}>
                <div className="row-between small">
                  <span>{row.district}</span>
                  <span className="strong">{row.total}</span>
                </div>
                <div className="bar"><span style={{ width: `${(row.total / maxDistrict) * 100}%` }} /></div>
              </div>
            ))
          )}
        </div>

        <div className="card card-pad stack">
          <div className="strong">ประกาศแยกตามประเภท</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {(stats.by_type ?? []).map((row) => (
              <span key={row.type} className="badge">
                {PROPERTY_TYPE_TH[row.type as PropertyType] ?? row.type} · {row.total}
              </span>
            ))}
            {(stats.by_type ?? []).length === 0 ? <span className="small muted">ยังไม่มีข้อมูล</span> : null}
          </div>
        </div>

        <div className="card card-pad stack">
          <div className="strong">แหล่งข้อมูลที่ให้ประกาศมากที่สุด</div>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr><th>แหล่ง</th><th>ชนิด</th><th style={{ textAlign: "right" }}>ประกาศ</th></tr>
              </thead>
              <tbody>
                {(stats.by_source ?? []).map((row) => (
                  <tr key={`${row.name}-${row.kind}`}>
                    <td>{row.name}</td>
                    <td className="muted">{row.kind}</td>
                    <td style={{ textAlign: "right" }} className="strong">{row.total}</td>
                  </tr>
                ))}
                {(stats.by_source ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="muted">ยังไม่มีข้อมูล</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad stack">
          <div className="row-between">
            <span className="strong">รอบการนำเข้าล่าสุด</span>
            <Link href="/admin/ingest" className="link small">นำเข้าข้อมูล →</Link>
          </div>
          {runs.length === 0 ? (
            <div className="small muted">ยังไม่เคยนำเข้าข้อมูล</div>
          ) : (
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr><th>เวลา</th><th>รับ</th><th>สร้าง</th><th>ซ้ำเดิม</th><th>รวมซ้ำ</th><th>ผิดพลาด</th></tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>{formatRelativeTime(run.started_at)}</td>
                      <td>{run.received}</td>
                      <td className="strong">{run.inserted}</td>
                      <td>{run.skipped_existing}</td>
                      <td>{run.duplicates}</td>
                      <td style={{ color: run.errors > 0 ? "var(--danger)" : undefined }}>{run.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad stack">
          <div className="strong">บันทึกการทำงานล่าสุด</div>
          {audits.length === 0 ? (
            <div className="small muted">ยังไม่มีบันทึก</div>
          ) : (
            audits.map((log) => (
              <div key={log.id} className="row-between small">
                <span className="mono truncate">{log.action} · {log.entity}</span>
                <span className="tiny muted" style={{ flex: "none" }}>{formatRelativeTime(log.created_at)}</span>
              </div>
            ))
          )}
        </div>

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">ผู้ใช้ทั้งหมด</div>
            <div className="stat-value">{stats.users_total ?? 0}</div>
            <div className="stat-note">ผู้ขาย {stats.users_sellers ?? 0} · ผู้ซื้อ {stats.users_buyers ?? 0}</div>
          </div>
          <div className="stat">
            <div className="stat-label">แหล่งข้อมูลที่เปิดใช้</div>
            <div className="stat-value">{stats.sources_enabled ?? 0}</div>
            <div className="stat-note">จากทั้งหมด {stats.sources_total ?? 0}</div>
          </div>
        </div>
      </div>
    </>
  );
}
