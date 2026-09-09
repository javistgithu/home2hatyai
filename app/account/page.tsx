import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import TopBar from "@/components/nav/TopBar";
import { getSession } from "@/lib/auth";
import { ROLE_TH, formatPhone, formatThaiDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "บัญชีของฉัน" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/account");

  const { profile, role, email } = session;

  return (
    <>
      <TopBar role={role} title="บัญชีของฉัน" />
      <div className="container section stack">
        <div className="card card-pad stack">
          <div className="row" style={{ gap: 12 }}>
            <div className="brand-mark" style={{ width: 46, height: 46, fontSize: 20, borderRadius: 14 }}>
              {(profile?.full_name ?? email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="grow">
              <div className="strong">{profile?.full_name || "ยังไม่ได้ตั้งชื่อ"}</div>
              <div className="small muted truncate">{email}</div>
            </div>
            <span className="badge badge-brand">{ROLE_TH[role]}</span>
          </div>

          <div className="divider" />

          <div className="small stack" style={{ gap: 6 }}>
            <div className="row-between">
              <span className="muted">เบอร์โทร</span>
              <span>{formatPhone(profile?.phone) || "ยังไม่ระบุ"}</span>
            </div>
            <div className="row-between">
              <span className="muted">LINE</span>
              <span>{profile?.line_id || "ยังไม่ระบุ"}</span>
            </div>
            <div className="row-between">
              <span className="muted">สมัครเมื่อ</span>
              <span>{formatThaiDate(profile?.created_at)}</span>
            </div>
            {role === "seller" ? (
              <div className="row-between">
                <span className="muted">สถานะการยืนยันตัวตน</span>
                <span className={profile?.is_verified ? "badge badge-ok" : "badge badge-warn"}>
                  {profile?.is_verified ? "ยืนยันแล้ว" : "รอแอดมินยืนยัน"}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="stack">
          {role === "admin" ? (
            <Link href="/admin" className="btn btn-block">🛠️ ไปยังหน้าผู้ดูแลระบบ</Link>
          ) : null}
          {role === "seller" || role === "admin" ? (
            <Link href="/seller" className="btn btn-block">🏷️ จัดการประกาศของฉัน</Link>
          ) : null}
          <Link href="/favorites" className="btn btn-block">❤️ รายการโปรด</Link>

          {role === "buyer" ? (
            <div className="notice notice-info small">
              อยากลงประกาศขายเองใช่ไหม? แจ้งแอดมินเพื่อขอเปลี่ยนบัญชีเป็นผู้ขาย
              หรือสมัครบัญชีใหม่แล้วเลือก "ผู้ขาย" ตอนสมัคร
            </div>
          ) : null}

          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-block" style={{ color: "var(--danger)" }}>
              ออกจากระบบ
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
