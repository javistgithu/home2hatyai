import { SETUP_HINT } from "@/lib/env";

/** แสดงเมื่อยังไม่ได้เชื่อมต่อ Supabase — ให้ผู้ติดตั้งรู้ว่าต้องทำอะไรต่อ */
export default function SetupNotice() {
  return (
    <div className="container section">
      <div className="card card-pad stack">
        <div className="row" style={{ gap: 10 }}>
          <span style={{ fontSize: 26 }}>⚙️</span>
          <div>
            <div className="strong">ยังตั้งค่าระบบไม่ครบ</div>
            <div className="small muted">{SETUP_HINT}</div>
          </div>
        </div>
        <div className="divider" />
        <ol className="small stack" style={{ paddingLeft: 18, gap: 6 }}>
          <li>สร้างโปรเจกต์ที่ <span className="mono">supabase.com</span></li>
          <li>รันไฟล์ใน <span className="mono">supabase/migrations/</span> ตามลำดับ 0001 → 0004 ใน SQL Editor</li>
          <li>คัดลอก <span className="mono">.env.example</span> เป็น <span className="mono">.env.local</span> แล้วใส่คีย์</li>
          <li>รัน <span className="mono">npm run dev</span> อีกครั้ง</li>
        </ol>
        <p className="small muted">รายละเอียดทั้งหมดอยู่ใน <span className="mono">docs/SETUP.md</span></p>
      </div>
    </div>
  );
}
