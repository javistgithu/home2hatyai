import type { Metadata } from "next";
import Link from "next/link";
import TopBar from "@/components/nav/TopBar";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { setLeadStatus } from "../actions";
import { formatPhone, formatRelativeTime } from "@/lib/format";
import type { Lead, Listing } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ผู้สนใจติดต่อ" };

const LEAD_STATUS_TH: Record<string, string> = {
  new: "ใหม่", contacted: "ติดต่อแล้ว", viewing: "นัดดูแล้ว", closed: "ปิดการขาย", lost: "ไม่สนใจแล้ว",
};

export default async function SellerLeadsPage() {
  const session = await requireRole(["seller", "admin"], "/seller/leads");
  const supabase = createClient();

  const { data } = await supabase
    .from("leads")
    .select("*, listings:listing_id(id, title)")
    .order("created_at", { ascending: false })
    .limit(100);

  const leads = (data ?? []) as unknown as Array<Lead & { listings: Pick<Listing, "id" | "title"> | null }>;

  return (
    <>
      <TopBar role={session.role} title="ผู้สนใจติดต่อ" back="/seller" subtitle={`ทั้งหมด ${leads.length} ราย`} />
      <div className="container section stack">
        {leads.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📩</div>
            <div className="strong">ยังไม่มีผู้สนใจติดต่อ</div>
            <p className="small">
              เมื่อผู้ซื้อกดดูเบอร์ติดต่อในประกาศของคุณ รายชื่อจะขึ้นที่นี่
              ประกาศที่มีรูปและพิกัดครบมักได้รับการติดต่อมากกว่า
            </p>
          </div>
        ) : (
          leads.map((lead) => (
            <div key={lead.id} className="card card-pad stack" style={{ gap: 8 }}>
              <div className="row-between">
                <span className={lead.status === "new" ? "badge badge-ok" : "badge"}>
                  {LEAD_STATUS_TH[lead.status] ?? lead.status}
                </span>
                <span className="tiny muted">{formatRelativeTime(lead.created_at)}</span>
              </div>

              {lead.listings ? (
                <Link href={`/listing/${lead.listings.id}`} className="strong small">
                  {lead.listings.title}
                </Link>
              ) : <span className="small muted">ประกาศถูกลบแล้ว</span>}

              <div className="small">
                <div>ผู้สนใจ: {lead.buyer_name ?? "ผู้ใช้ในระบบ"}</div>
                {lead.buyer_phone ? <div>โทร: {formatPhone(lead.buyer_phone)}</div> : null}
                {lead.message ? <div className="muted">“{lead.message}”</div> : null}
              </div>

              <form action={setLeadStatus} className="row" style={{ gap: 8 }}>
                <input type="hidden" name="id" value={lead.id} />
                <select name="status" className="select grow" defaultValue={lead.status}>
                  {Object.entries(LEAD_STATUS_TH).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-sm">บันทึก</button>
              </form>
            </div>
          ))
        )}
      </div>
    </>
  );
}
