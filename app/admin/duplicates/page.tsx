import type { Metadata } from "next";
import Link from "next/link";
import TopBar from "@/components/nav/TopBar";
import AdminNav from "@/components/admin/AdminNav";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { confirmDuplicate, rejectDuplicate } from "../actions";
import { formatLocation, formatPriceFull, formatRelativeTime } from "@/lib/format";
import type { Listing, ListingDuplicate } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ตรวจรายการซ้ำ" };

/** แปลงเหตุผลที่ระบบให้มาเป็นข้อความอ่านง่าย */
function reasonLabels(reasons: Record<string, unknown>): string[] {
  const labels: string[] = [];
  if (reasons.phone_match) labels.push("เบอร์โทรตรงกัน");
  if (reasons.price_match) labels.push("ราคาตรงกัน");
  if (reasons.area_match) labels.push("เนื้อที่ตรงกัน");
  if (reasons.same_type) labels.push("ประเภททรัพย์เดียวกัน");
  if (typeof reasons.distance_km === "number") {
    labels.push(reasons.distance_km < 0.05 ? "พิกัดจุดเดียวกัน" : `ห่างกัน ${reasons.distance_km} กม.`);
  }
  if (typeof reasons.text_similarity === "number") {
    labels.push(`ข้อความคล้ายกัน ${Math.round(reasons.text_similarity * 100)}%`);
  }
  return labels;
}

function Side({ listing, label }: { listing: Listing | null; label: string }) {
  if (!listing) return <div className="small muted">ไม่พบข้อมูล</div>;
  return (
    <div className="stack" style={{ gap: 3 }}>
      <span className="badge">{label}</span>
      <Link href={`/listing/${listing.id}`} className="strong small">{listing.title}</Link>
      <div className="small">{formatPriceFull(listing.price ?? listing.rent_per_month)}</div>
      <div className="tiny muted">
        {formatLocation(listing.subdistrict, listing.district, listing.province)} ·
        {listing.contact_phone ?? "ไม่มีเบอร์"} · {formatRelativeTime(listing.created_at)}
      </div>
    </div>
  );
}

export default async function DuplicatesPage() {
  const session = await requireRole(["admin"], "/admin/duplicates");
  const supabase = createClient();

  const { data } = await supabase
    .from("listing_duplicates")
    .select("*, primary:primary_id(*), duplicate:duplicate_id(*)")
    .eq("decision", "pending")
    .order("score", { ascending: false })
    .limit(50);

  const pairs = (data ?? []) as unknown as Array<
    ListingDuplicate & { primary: Listing | null; duplicate: Listing | null }
  >;

  const { data: autoMerged } = await supabase
    .from("listing_duplicates")
    .select("*, primary:primary_id(id, title), duplicate:duplicate_id(id, title)")
    .in("decision", ["auto", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(20);

  const merged = (autoMerged ?? []) as unknown as Array<
    ListingDuplicate & { primary: Pick<Listing, "id" | "title"> | null; duplicate: Pick<Listing, "id" | "title"> | null }
  >;

  return (
    <>
      <TopBar role={session.role} title="ตรวจรายการซ้ำ" back="/admin" subtitle={`${pairs.length} คู่รอตัดสิน`} />
      <AdminNav counts={{ duplicates: pairs.length }} />

      <div className="container section stack">
        <div className="notice notice-info small">
          ระบบรวมรายการที่คะแนนความซ้ำ ≥ 85 ให้อัตโนมัติ ส่วนคู่ที่คะแนน 60–84
          จะรอให้แอดมินตัดสินที่หน้านี้ เพื่อไม่ให้ประกาศจริงหายไปจากระบบโดยไม่ตั้งใจ
        </div>

        {pairs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🎯</div>
            <div className="strong">ไม่มีคู่ที่รอตัดสิน</div>
          </div>
        ) : (
          pairs.map((pair) => (
            <article key={pair.id} className="card card-pad stack">
              <div className="row-between">
                <span className={Number(pair.score) >= 75 ? "badge badge-danger" : "badge badge-warn"}>
                  คะแนนความซ้ำ {Number(pair.score).toFixed(0)}/100
                </span>
                <span className="tiny muted">{formatRelativeTime(pair.created_at)}</span>
              </div>

              <div className="row wrap" style={{ gap: 5 }}>
                {reasonLabels(pair.reasons).map((label) => (
                  <span key={label} className="badge">{label}</span>
                ))}
              </div>

              <div className="grid-2" style={{ gap: 12 }}>
                <Side listing={pair.primary} label="ประกาศหลัก (เก่ากว่า)" />
                <Side listing={pair.duplicate} label="ประกาศที่สงสัยว่าซ้ำ" />
              </div>

              <div className="row wrap" style={{ gap: 6 }}>
                <form action={confirmDuplicate}>
                  <input type="hidden" name="primary_id" value={pair.primary_id} />
                  <input type="hidden" name="duplicate_id" value={pair.duplicate_id} />
                  <input type="hidden" name="score" value={String(pair.score)} />
                  <button type="submit" className="btn btn-sm btn-primary">ใช่ ซ้ำกัน — รวมรายการ</button>
                </form>
                <form action={rejectDuplicate}>
                  <input type="hidden" name="primary_id" value={pair.primary_id} />
                  <input type="hidden" name="duplicate_id" value={pair.duplicate_id} />
                  <button type="submit" className="btn btn-sm">ไม่ซ้ำ — แยกไว้</button>
                </form>
              </div>
            </article>
          ))
        )}

        {merged.length > 0 ? (
          <div className="card card-pad stack">
            <div className="strong">รายการที่รวมไปแล้ว</div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr><th>ประกาศหลัก</th><th>ตัวซ้ำ</th><th>คะแนน</th><th>วิธี</th><th></th></tr>
                </thead>
                <tbody>
                  {merged.map((pair) => (
                    <tr key={pair.id}>
                      <td className="truncate" style={{ maxWidth: 180 }}>
                        {pair.primary ? (
                          <Link href={`/listing/${pair.primary.id}`} className="link">{pair.primary.title}</Link>
                        ) : "-"}
                      </td>
                      <td className="truncate muted" style={{ maxWidth: 180 }}>{pair.duplicate?.title ?? "-"}</td>
                      <td>{Number(pair.score).toFixed(0)}</td>
                      <td>{pair.decision === "auto" ? "อัตโนมัติ" : "แอดมิน"}</td>
                      <td>
                        <form action={rejectDuplicate}>
                          <input type="hidden" name="primary_id" value={pair.primary_id} />
                          <input type="hidden" name="duplicate_id" value={pair.duplicate_id} />
                          <button type="submit" className="btn btn-sm btn-ghost">ยกเลิกการรวม</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
