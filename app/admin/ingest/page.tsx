import type { Metadata } from "next";
import TopBar from "@/components/nav/TopBar";
import AdminNav from "@/components/admin/AdminNav";
import IngestConsole from "@/components/admin/IngestConsole";
import { requireRole } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "นำเข้าข้อมูล" };

export default async function AdminIngestPage() {
  const session = await requireRole(["admin"], "/admin/ingest");

  return (
    <>
      <TopBar role={session.role} title="นำเข้าข้อมูล" back="/admin" />
      <AdminNav />

      <div className="container section stack">
        {!isServiceRoleConfigured ? (
          <div className="notice notice-danger small">
            ยังไม่ได้ตั้งค่า <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span> จึงนำเข้าข้อมูลไม่ได้
            — ใส่ค่าในไฟล์ .env.local แล้วรีสตาร์ตเซิร์ฟเวอร์
          </div>
        ) : null}

        <div className="card card-pad stack">
          <div className="strong">3 วิธีนำข้อมูลเข้าระบบ</div>
          <ol className="small stack" style={{ paddingLeft: 18, gap: 6, margin: 0 }}>
            <li>
              <span className="strong">วางข้อความเอง</span> (ฟอร์มด้านล่าง) — เร็วที่สุด
              เหมาะกับการเก็บทีละไม่กี่โพสต์
            </li>
            <li>
              <span className="strong">Facebook Graph API</span> — สำหรับกลุ่ม/เพจที่คุณเป็นแอดมินเอง
              รันสคริปต์ <span className="mono">scripts/collect-facebook.mjs</span>
            </li>
            <li>
              <span className="strong">ไฟล์ CSV/JSON</span> — รัน
              <span className="mono"> scripts/import-posts.mjs ไฟล์.csv</span>
            </li>
          </ol>
          <div className="notice notice-warn tiny">
            การดึงข้อมูลจากกลุ่มที่คุณไม่ได้เป็นแอดมิน หรือใช้บอทล็อกอินแทนคน ผิดข้อกำหนดของ Meta
            และเสี่ยงถูกระงับบัญชี — อ่านรายละเอียดใน docs/DATA-COLLECTION.md
          </div>
        </div>

        <IngestConsole />
      </div>
    </>
  );
}
