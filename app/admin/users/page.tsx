import type { Metadata } from "next";
import TopBar from "@/components/nav/TopBar";
import AdminNav from "@/components/admin/AdminNav";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { setUserRole, setUserVerified } from "../actions";
import { ROLE_TH, formatPhone, formatThaiDate } from "@/lib/format";
import type { Profile } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ผู้ใช้" };

export default async function AdminUsersPage() {
  const session = await requireRole(["admin"], "/admin/users");
  const supabase = createClient();

  const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
  const profiles = (data ?? []) as Profile[];

  return (
    <>
      <TopBar role={session.role} title="ผู้ใช้" back="/admin" subtitle={`${profiles.length} บัญชี`} />
      <AdminNav />

      <div className="container section stack">
        <div className="notice notice-info small">
          บทบาทกำหนดสิทธิ์ทั้งหมดในระบบ: <span className="strong">ผู้ซื้อ</span> ดูประกาศที่เผยแพร่แล้ว ·
          <span className="strong"> ผู้ขาย</span> ลงและแก้ประกาศของตัวเอง ·
          <span className="strong"> แอดมิน</span> เห็นและจัดการได้ทุกอย่าง
          การสมัครสมาชิกเองจะเป็นแอดมินไม่ได้ ต้องตั้งจากหน้านี้เท่านั้น
        </div>

        {profiles.map((profile) => (
          <div key={profile.id} className="card card-pad stack" style={{ gap: 8 }}>
            <div className="row-between">
              <div className="grow">
                <div className="strong">{profile.full_name || "ไม่ระบุชื่อ"}</div>
                <div className="tiny muted mono truncate">{profile.id}</div>
              </div>
              <span className="badge badge-brand">{ROLE_TH[profile.role]}</span>
            </div>

            <div className="tiny muted">
              {formatPhone(profile.phone) || "ไม่มีเบอร์"}
              {profile.agency_name ? ` · ${profile.agency_name}` : ""}
              {" · สมัคร "}{formatThaiDate(profile.created_at)}
            </div>

            <div className="row wrap" style={{ gap: 6 }}>
              <form action={setUserRole} className="row" style={{ gap: 6 }}>
                <input type="hidden" name="user_id" value={profile.id} />
                <select name="role" className="select btn-sm" defaultValue={profile.role} style={{ minHeight: 34, padding: "0 8px" }}>
                  <option value="buyer">ผู้ซื้อ</option>
                  <option value="seller">ผู้ขาย</option>
                  <option value="admin">แอดมิน</option>
                </select>
                <button type="submit" className="btn btn-sm">เปลี่ยนบทบาท</button>
              </form>

              {profile.role === "seller" ? (
                <form action={setUserVerified}>
                  <input type="hidden" name="user_id" value={profile.id} />
                  <input type="hidden" name="verified" value={profile.is_verified ? "0" : "1"} />
                  <button type="submit" className={`btn btn-sm ${profile.is_verified ? "" : "btn-soft"}`}>
                    {profile.is_verified ? "ยกเลิกการยืนยัน" : "ยืนยันตัวตนผู้ขาย"}
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
