"use client";

import { useFormState, useFormStatus } from "react-dom";
import { ingestPastedPosts, type IngestActionState } from "@/app/admin/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? "กำลังประมวลผล…" : "นำเข้าและคัดข้อมูลซ้ำ"}
    </button>
  );
}

const STATUS_TH: Record<string, string> = {
  created: "สร้างประกาศใหม่",
  merged: "รวมกับรายการเดิม (ซ้ำ)",
  flagged: "สร้างแล้ว แต่สงสัยว่าซ้ำ",
  skipped_existing: "เคยเก็บโพสต์นี้แล้ว",
  rejected: "คัดออก",
  error: "ผิดพลาด",
};

const STATUS_CLASS: Record<string, string> = {
  created: "badge badge-ok",
  merged: "badge badge-info",
  flagged: "badge badge-warn",
  skipped_existing: "badge",
  rejected: "badge",
  error: "badge badge-danger",
};

export default function IngestConsole() {
  const [state, formAction] = useFormState<IngestActionState | null, FormData>(ingestPastedPosts, null);
  const report = state?.report;

  return (
    <div className="stack">
      <form action={formAction} className="card card-pad stack">
        <div className="grid-2">
          <div className="field">
            <label className="label" htmlFor="source_name">ชื่อแหล่งข้อมูล *</label>
            <input id="source_name" name="source_name" className="input" required
              placeholder="เช่น กลุ่มซื้อขายบ้านที่ดินหาดใหญ่" />
          </div>
          <div className="field">
            <label className="label" htmlFor="source_kind">ชนิดแหล่ง</label>
            <select id="source_kind" name="source_kind" className="select" defaultValue="facebook_group">
              <option value="facebook_group">กลุ่ม Facebook</option>
              <option value="facebook_page">เพจ Facebook</option>
              <option value="manual">คัดลอกมาวางเอง</option>
              <option value="csv">นำเข้าจากไฟล์</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="source_url">ลิงก์แหล่งข้อมูล</label>
          <input id="source_url" name="source_url" className="input" type="url" placeholder="https://facebook.com/groups/…" />
        </div>

        <div className="field">
          <label className="label" htmlFor="posts">ข้อความโพสต์ *</label>
          <textarea
            id="posts" name="posts" className="textarea" rows={12} required
            placeholder={"วางข้อความโพสต์ที่นี่ คั่นแต่ละโพสต์ด้วยบรรทัดที่มีขีดสามอัน\n\nขายบ้านเดี่ยว 2 ชั้น ต.คอหงส์ 62 ตร.ว. 3 ห้องนอน ราคา 4.65 ล้าน โทร 081-234-5678\n---\nขายที่ดิน 2 ไร่ ต.คลองแห ไร่ละ 3.5 ล้าน โทร 089-876-5432"}
          />
          <span className="hint">คั่นแต่ละโพสต์ด้วยบรรทัด --- (สูงสุด 100 โพสต์ต่อครั้ง)</span>
        </div>

        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" name="auto_publish" />
          <span className="small">เผยแพร่ทันทีโดยไม่ต้องรออนุมัติ (ใช้เมื่อมั่นใจในคุณภาพข้อมูลเท่านั้น)</span>
        </label>

        {state?.error ? <div className="notice notice-danger">{state.error}</div> : null}

        <SubmitButton />
      </form>

      {report ? (
        <div className="card card-pad stack">
          <div className="strong">ผลการนำเข้า</div>

          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">รับเข้ามา</div>
              <div className="stat-value">{report.received}</div>
            </div>
            <div className="stat">
              <div className="stat-label">สร้างประกาศ</div>
              <div className="stat-value" style={{ color: "var(--ok)" }}>{report.inserted}</div>
            </div>
            <div className="stat">
              <div className="stat-label">รวมเป็นรายการซ้ำ</div>
              <div className="stat-value">{report.merged}</div>
              <div className="stat-note">รอตรวจอีก {report.flagged}</div>
            </div>
            <div className="stat">
              <div className="stat-label">คัดออก</div>
              <div className="stat-value">{report.rejected}</div>
              <div className="stat-note">ซ้ำเดิม {report.skipped_existing} · ผิดพลาด {report.errors}</div>
            </div>
          </div>

          <div className="stack" style={{ gap: 8, marginTop: 6 }}>
            {report.items.map((item, index) => (
              <div key={`${item.external_post_id ?? index}`} className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className={STATUS_CLASS[item.status] ?? "badge"}>
                    {STATUS_TH[item.status] ?? item.status}
                  </span>
                  {item.confidence !== undefined ? (
                    <span className="tiny muted">ความมั่นใจ {Math.round(item.confidence * 100)}%</span>
                  ) : null}
                  {item.duplicate_score !== undefined ? (
                    <span className="tiny muted">คะแนนซ้ำ {Math.round(item.duplicate_score)}</span>
                  ) : null}
                </div>
                {item.title ? <div className="small strong">{item.title}</div> : null}
                {item.reason ? <div className="tiny muted">{item.reason}</div> : null}
                {item.warnings?.length ? (
                  <div className="tiny" style={{ color: "var(--warn)" }}>⚠ {item.warnings.join(" · ")}</div>
                ) : null}
                <div className="divider" style={{ margin: "4px 0" }} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
