import type { Metadata } from "next";
import TopBar from "@/components/nav/TopBar";
import AdminNav from "@/components/admin/AdminNav";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { createSource, toggleSource } from "../actions";
import { formatRelativeTime } from "@/lib/format";
import type { Source } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "แหล่งข้อมูล" };

const KIND_TH: Record<string, string> = {
  facebook_group: "กลุ่ม Facebook",
  facebook_page: "เพจ Facebook",
  manual: "วางเอง",
  csv: "ไฟล์นำเข้า",
  webhook: "Webhook",
  seller_app: "ผู้ขายลงเอง",
};

export default async function SourcesPage() {
  const session = await requireRole(["admin"], "/admin/sources");
  const supabase = createClient();

  const { data } = await supabase.from("sources").select("*").order("created_at", { ascending: false });
  const sources = (data ?? []) as Source[];

  return (
    <>
      <TopBar role={session.role} title="แหล่งข้อมูล" back="/admin" subtitle={`${sources.length} แหล่ง`} />
      <AdminNav />

      <div className="container section stack">
        <form action={createSource} className="card card-pad stack">
          <div className="strong">เพิ่มแหล่งข้อมูล</div>
          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor="name">ชื่อแหล่ง *</label>
              <input id="name" name="name" className="input" required placeholder="ชื่อกลุ่ม/เพจ" />
            </div>
            <div className="field">
              <label className="label" htmlFor="kind">ชนิด</label>
              <select id="kind" name="kind" className="select" defaultValue="facebook_group">
                {Object.entries(KIND_TH).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor="external_id">รหัสกลุ่ม/เพจ</label>
              <input id="external_id" name="external_id" className="input" placeholder="100000000000001" />
            </div>
            <div className="field">
              <label className="label" htmlFor="url">ลิงก์</label>
              <input id="url" name="url" className="input" type="url" placeholder="https://facebook.com/groups/…" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-sm">เพิ่มแหล่งข้อมูล</button>
        </form>

        {sources.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📥</div>
            <div className="strong">ยังไม่มีแหล่งข้อมูล</div>
            <p className="small">เพิ่มแหล่งแรก หรือระบบจะสร้างให้อัตโนมัติเมื่อนำเข้าข้อมูลครั้งแรก</p>
          </div>
        ) : (
          sources.map((source) => (
            <div key={source.id} className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row-between">
                <div className="grow">
                  <div className="strong">{source.name}</div>
                  <div className="tiny muted">
                    {KIND_TH[source.kind] ?? source.kind}
                    {source.external_id ? ` · ${source.external_id}` : ""}
                  </div>
                </div>
                <span className={source.is_enabled ? "badge badge-ok" : "badge"}>
                  {source.is_enabled ? "เปิดใช้" : "ปิดอยู่"}
                </span>
              </div>

              <div className="row-between tiny muted">
                <span>ความน่าเชื่อถือ {source.trust_score}/100</span>
                <span>
                  {source.last_synced_at ? `เก็บล่าสุด ${formatRelativeTime(source.last_synced_at)}` : "ยังไม่เคยเก็บ"}
                </span>
              </div>

              {source.last_error ? (
                <div className="notice notice-danger tiny">{source.last_error}</div>
              ) : null}

              <div className="row" style={{ gap: 6 }}>
                <form action={toggleSource}>
                  <input type="hidden" name="id" value={source.id} />
                  <input type="hidden" name="enable" value={source.is_enabled ? "0" : "1"} />
                  <button type="submit" className="btn btn-sm">
                    {source.is_enabled ? "ปิดการเก็บข้อมูล" : "เปิดการเก็บข้อมูล"}
                  </button>
                </form>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                    เปิดแหล่งข้อมูล
                  </a>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
