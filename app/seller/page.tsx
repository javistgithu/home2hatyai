import type { Metadata } from "next";
import Link from "next/link";
import TopBar from "@/components/nav/TopBar";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { setListingStatus } from "./actions";
import {
  PROPERTY_TYPE_ICON, STATUS_BADGE, STATUS_TH, formatAreaShort, formatLocation,
  formatPriceShort, formatRelativeTime,
} from "@/lib/format";
import type { Listing, SellerStats } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ประกาศของฉัน" };

export default async function SellerDashboard({
  searchParams,
}: {
  searchParams: { created?: string; updated?: string };
}) {
  const session = await requireRole(["seller", "admin"], "/seller");
  const supabase = createClient();

  const [{ data: statsData }, { data: listingsData }] = await Promise.all([
    supabase.rpc("seller_dashboard_stats"),
    supabase.from("listings").select("*").eq("owner_id", session.userId).order("created_at", { ascending: false }).limit(50),
  ]);

  const stats = (statsData ?? {}) as Partial<SellerStats>;
  const listings = (listingsData ?? []) as Listing[];

  return (
    <>
      <TopBar
        role={session.role}
        title="ประกาศของฉัน"
        subtitle={session.profile?.agency_name ?? session.profile?.full_name ?? undefined}
        action={<Link href="/seller/new" className="btn btn-primary btn-sm">+ ลงประกาศ</Link>}
      />

      <div className="container section stack">
        {searchParams.created ? (
          <div className="notice notice-ok">ส่งประกาศเรียบร้อย รอแอดมินตรวจสอบก่อนเผยแพร่</div>
        ) : null}
        {searchParams.updated ? (
          <div className="notice notice-ok">บันทึกการแก้ไขเรียบร้อยแล้ว</div>
        ) : null}

        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">เผยแพร่อยู่</div>
            <div className="stat-value">{stats.published ?? 0}</div>
          </div>
          <div className="stat">
            <div className="stat-label">รอตรวจสอบ</div>
            <div className="stat-value">{stats.pending ?? 0}</div>
          </div>
          <div className="stat">
            <div className="stat-label">ยอดเข้าชมรวม</div>
            <div className="stat-value">{(stats.views ?? 0).toLocaleString("th-TH")}</div>
          </div>
          <div className="stat">
            <div className="stat-label">ผู้สนใจใหม่</div>
            <div className="stat-value">{stats.leads_new ?? 0}</div>
            <Link className="stat-note link" href="/seller/leads">ดูรายชื่อ →</Link>
          </div>
        </div>

        {stats.rejected ? (
          <div className="notice notice-warn small">
            มีประกาศไม่ผ่านการตรวจ {stats.rejected} รายการ — เปิดดูเหตุผลและแก้ไขได้จากรายการด้านล่าง
          </div>
        ) : null}

        <h2 style={{ fontSize: 15, margin: "6px 0 0" }}>รายการทั้งหมด ({listings.length})</h2>

        {listings.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🏷️</div>
            <div className="strong">ยังไม่มีประกาศ</div>
            <p className="small">ลงประกาศแรกของคุณ ใช้เวลาไม่ถึง 2 นาที</p>
            <Link href="/seller/new" className="btn btn-primary btn-sm">+ ลงประกาศ</Link>
          </div>
        ) : (
          <div className="stack">
            {listings.map((listing) => (
              <div key={listing.id} className="card card-pad stack" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <div className="listing-thumb" style={{ width: 54, height: 54, fontSize: 22 }}>
                    {listing.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={listing.images[0]} alt="" loading="lazy" />
                    ) : (
                      <span aria-hidden="true">{PROPERTY_TYPE_ICON[listing.property_type]}</span>
                    )}
                  </div>
                  <div className="grow">
                    <div className="row" style={{ gap: 6, marginBottom: 3 }}>
                      <span className={STATUS_BADGE[listing.status]}>{STATUS_TH[listing.status]}</span>
                      {listing.duplicate_of ? <span className="badge badge-warn">ถูกรวมเป็นรายการซ้ำ</span> : null}
                    </div>
                    <div className="listing-title">{listing.title}</div>
                    <div className="listing-meta">
                      <span className="listing-price" style={{ fontSize: 14 }}>
                        {formatPriceShort(listing.deal_type === "rent" ? listing.rent_per_month : listing.price)}
                      </span>
                      {formatAreaShort(listing.land_area_sqwa, listing.usable_area_sqm)
                        ? <span>{formatAreaShort(listing.land_area_sqwa, listing.usable_area_sqm)}</span> : null}
                      <span>👁 {listing.view_count}</span>
                      <span>📩 {listing.contact_count}</span>
                    </div>
                    <div className="tiny muted">
                      {formatLocation(listing.subdistrict, listing.district, listing.province)} ·
                      แก้ไข {formatRelativeTime(listing.updated_at)}
                    </div>
                  </div>
                </div>

                {listing.status === "rejected" && listing.reject_reason ? (
                  <div className="notice notice-danger tiny">เหตุผลที่ไม่ผ่าน: {listing.reject_reason}</div>
                ) : null}

                <div className="row wrap" style={{ gap: 6 }}>
                  <Link href={`/seller/listings/${listing.id}/edit`} className="btn btn-sm">แก้ไข</Link>
                  {listing.status === "published" ? (
                    <Link href={`/listing/${listing.id}`} className="btn btn-sm btn-ghost">ดูหน้าประกาศ</Link>
                  ) : null}

                  {listing.status !== "sold" ? (
                    <form action={setListingStatus}>
                      <input type="hidden" name="id" value={listing.id} />
                      <input type="hidden" name="status" value="sold" />
                      <button type="submit" className="btn btn-sm btn-ghost">ทำเครื่องหมายว่าขายแล้ว</button>
                    </form>
                  ) : (
                    <form action={setListingStatus}>
                      <input type="hidden" name="id" value={listing.id} />
                      <input type="hidden" name="status" value="pending" />
                      <button type="submit" className="btn btn-sm btn-ghost">เปิดขายอีกครั้ง</button>
                    </form>
                  )}

                  {listing.status !== "archived" ? (
                    <form action={setListingStatus}>
                      <input type="hidden" name="id" value={listing.id} />
                      <input type="hidden" name="status" value="archived" />
                      <button type="submit" className="btn btn-sm btn-ghost">เก็บเข้ากรุ</button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
