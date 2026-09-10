import type { Metadata } from "next";
import Link from "next/link";
import TopBar from "@/components/nav/TopBar";
import AdminNav from "@/components/admin/AdminNav";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { approveListing, approveMany, rejectListing } from "../actions";
import {
  DEAL_TYPE_TH, GEO_PRECISION_TH, PROPERTY_TYPE_TH, formatArea, formatLocation,
  formatPhone, formatPriceFull, formatRelativeTime, isApproximate,
} from "@/lib/format";
import type { Listing, RawPost, Source } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "รออนุมัติ" };

export default async function ModerationPage() {
  const session = await requireRole(["admin"], "/admin/moderation");
  const supabase = createClient();

  const { data } = await supabase
    .from("listings")
    .select("*, sources:source_id(name, kind), raw_posts:raw_post_id(permalink, author_name, content)")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  const listings = (data ?? []) as unknown as Array<
    Listing & { sources: Pick<Source, "name" | "kind"> | null; raw_posts: Pick<RawPost, "permalink" | "author_name" | "content"> | null }
  >;

  return (
    <>
      <TopBar role={session.role} title="รออนุมัติ" back="/admin" subtitle={`${listings.length} รายการในคิว`} />
      <AdminNav counts={{ pending: listings.length }} />

      <div className="container section stack">
        {listings.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">✅</div>
            <div className="strong">ไม่มีประกาศรอตรวจสอบ</div>
            <p className="small">คิวว่างแล้ว</p>
          </div>
        ) : (
          <>
            <form action={approveMany} className="card card-pad stack">
              <div className="small muted">
                เลือกหลายรายการเพื่ออนุมัติพร้อมกัน — ควรใช้กับประกาศที่ข้อมูลครบและไม่มีคำเตือนเท่านั้น
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {listings.slice(0, 20).map((listing) => (
                  <label key={listing.id} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                    <input type="checkbox" name="ids" value={listing.id} style={{ marginTop: 4 }} />
                    <span className="small grow truncate">
                      {listing.title}
                      <span className="muted"> · {formatPriceFull(listing.price ?? listing.rent_per_month)}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button type="submit" className="btn btn-primary btn-sm">อนุมัติรายการที่เลือก</button>
            </form>

            {listings.map((listing) => {
              const approximate = isApproximate(listing.geo_precision);
              return (
                <article key={listing.id} className="card card-pad stack">
                  <div className="row-between">
                    <span className="badge badge-warn">รอตรวจสอบ</span>
                    <span className="tiny muted">{formatRelativeTime(listing.created_at)}</span>
                  </div>

                  <h3 style={{ fontSize: 15, margin: 0, lineHeight: 1.4 }}>{listing.title}</h3>

                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge badge-brand">{DEAL_TYPE_TH[listing.deal_type]}</span>
                    <span className="badge">{PROPERTY_TYPE_TH[listing.property_type]}</span>
                    <span className="badge">คุณภาพข้อมูล {listing.quality_score}/100</span>
                    <span className={approximate ? "badge badge-warn" : "badge badge-ok"}>
                      {GEO_PRECISION_TH[listing.geo_precision]}
                    </span>
                  </div>

                  <div className="small stack" style={{ gap: 3 }}>
                    <div className="row-between">
                      <span className="muted">ราคา</span>
                      <span className="strong">
                        {formatPriceFull(listing.deal_type === "rent" ? listing.rent_per_month : listing.price)}
                      </span>
                    </div>
                    <div className="row-between">
                      <span className="muted">เนื้อที่</span>
                      <span>{listing.land_area_sqwa ? formatArea(listing.land_area_sqwa) : "-"}</span>
                    </div>
                    <div className="row-between">
                      <span className="muted">ที่ตั้ง</span>
                      <span>{formatLocation(listing.subdistrict, listing.district, listing.province)}</span>
                    </div>
                    <div className="row-between">
                      <span className="muted">ติดต่อ</span>
                      <span>{formatPhone(listing.contact_phone) || listing.contact_line || "ไม่มี"}</span>
                    </div>
                    <div className="row-between">
                      <span className="muted">แหล่งที่มา</span>
                      <span>{listing.sources?.name ?? "ผู้ขายลงเอง"}</span>
                    </div>
                  </div>

                  {!listing.contact_phone && !listing.contact_line ? (
                    <div className="notice notice-danger tiny">ไม่มีช่องทางติดต่อ — ผู้ซื้อจะติดต่อไม่ได้</div>
                  ) : null}
                  {!listing.price && !listing.rent_per_month ? (
                    <div className="notice notice-danger tiny">ไม่มีราคา</div>
                  ) : null}
                  {approximate ? (
                    <div className="notice notice-warn tiny">
                      ตำแหน่งยังไม่แม่น — เปิดแก้ไขเพื่อปักหมุดให้ตรงจุดก่อนอนุมัติจะดีกว่า
                    </div>
                  ) : null}

                  {listing.raw_posts?.content ? (
                    <details>
                      <summary className="small link" style={{ cursor: "pointer" }}>ดูข้อความต้นฉบับ</summary>
                      <div className="pre-wrap tiny muted" style={{ marginTop: 8 }}>
                        {listing.raw_posts.content.slice(0, 1200)}
                      </div>
                    </details>
                  ) : null}

                  <div className="row wrap" style={{ gap: 6 }}>
                    <form action={approveListing}>
                      <input type="hidden" name="id" value={listing.id} />
                      <button type="submit" className="btn btn-sm btn-primary">อนุมัติและเผยแพร่</button>
                    </form>

                    <Link href={`/seller/listings/${listing.id}/edit`} className="btn btn-sm">แก้ไขก่อน</Link>

                    {listing.raw_posts?.permalink ? (
                      <a href={listing.raw_posts.permalink} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                        โพสต์ต้นทาง
                      </a>
                    ) : null}
                  </div>

                  <form action={rejectListing} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="id" value={listing.id} />
                    <input name="reason" className="input grow" placeholder="เหตุผลที่ไม่ผ่าน (ไม่บังคับ)" />
                    <button type="submit" className="btn btn-sm" style={{ color: "var(--danger)" }}>ไม่ผ่าน</button>
                  </form>
                </article>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
