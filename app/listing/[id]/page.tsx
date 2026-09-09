import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TopBar from "@/components/nav/TopBar";
import ListingCard from "@/components/listing/ListingCard";
import ContactButtons from "@/components/listing/ContactButtons";
import FavoriteButton from "@/components/listing/FavoriteButton";
import ViewTracker from "@/components/listing/ViewTracker";
import MapView from "@/components/map/MapView";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import {
  DEAL_TYPE_TH, GEO_PRECISION_TH, PROPERTY_TYPE_ICON, PROPERTY_TYPE_TH, STATUS_BADGE, STATUS_TH,
  formatArea, formatLocation, formatPriceFull, formatPricePerSqwa, formatRelativeTime,
  formatThaiDate, isApproximate,
} from "@/lib/format";
import type { Listing, SearchListingRow, Source } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface PageProps { params: { id: string } }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!isSupabaseConfigured) return { title: "รายละเอียดประกาศ" };
  const supabase = createClient();
  const { data } = await supabase.from("listings").select("title, description").eq("id", params.id).maybeSingle();
  const listing = data as Pick<Listing, "title" | "description"> | null;
  return {
    title: listing?.title ?? "รายละเอียดประกาศ",
    description: listing?.description?.slice(0, 160) ?? undefined,
  };
}

export default async function ListingDetailPage({ params }: PageProps) {
  if (!isSupabaseConfigured) notFound();

  const supabase = createClient();
  const session = await getSession().catch(() => null);

  const { data } = await supabase.from("listings").select("*").eq("id", params.id).maybeSingle();
  const listing = data as Listing | null;
  if (!listing) notFound();

  // ถ้าประกาศนี้ถูกรวมเป็นรายการซ้ำ ให้พาไปยังประกาศหลักแทน
  if (listing.duplicate_of) {
    return (
      <>
        <TopBar role={session?.role ?? null} title="ประกาศซ้ำ" back="/" />
        <div className="container section">
          <div className="notice notice-info">
            ประกาศนี้ถูกรวมเข้ากับประกาศหลักแล้ว เพราะเป็นทรัพย์เดียวกันที่โพสต์ซ้ำหลายที่
          </div>
          <Link href={`/listing/${listing.duplicate_of}`} className="btn btn-primary btn-block" style={{ marginTop: 12 }}>
            ไปยังประกาศหลัก
          </Link>
        </div>
      </>
    );
  }

  const [{ data: sourceData }, { data: nearbyData }, { data: favoriteData }] = await Promise.all([
    listing.source_id
      ? supabase.from("sources").select("*").eq("id", listing.source_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("nearby_listings", { p_listing_id: listing.id, p_radius_km: 3, p_limit: 4 }),
    session
      ? supabase.from("favorites").select("listing_id").eq("user_id", session.userId).eq("listing_id", listing.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const source = sourceData as Source | null;
  const nearby = ((nearbyData ?? []) as Listing[]).map((item) => ({
    ...item, distance_km: null, total_count: 0,
  })) as unknown as SearchListingRow[];

  const price = listing.deal_type === "rent" ? listing.rent_per_month : listing.price;
  const approximate = isApproximate(listing.geo_precision);
  const isOwnerOrAdmin = session?.role === "admin" || session?.userId === listing.owner_id;

  const mapListing = {
    ...listing, distance_km: null, total_count: 1,
  } as unknown as SearchListingRow;

  const specs: Array<[string, string]> = [
    ["ประเภท", PROPERTY_TYPE_TH[listing.property_type]],
    ["ประกาศ", DEAL_TYPE_TH[listing.deal_type]],
    ...(listing.land_area_sqwa ? [["เนื้อที่ดิน", formatArea(listing.land_area_sqwa)] as [string, string]] : []),
    ...(listing.usable_area_sqm ? [["พื้นที่ใช้สอย", `${listing.usable_area_sqm} ตร.ม.`] as [string, string]] : []),
    ...(listing.bedrooms ? [["ห้องนอน", `${listing.bedrooms} ห้อง`] as [string, string]] : []),
    ...(listing.bathrooms ? [["ห้องน้ำ", `${listing.bathrooms} ห้อง`] as [string, string]] : []),
    ...(listing.floors ? [["จำนวนชั้น", `${listing.floors} ชั้น`] as [string, string]] : []),
    ...(listing.parking ? [["ที่จอดรถ", `${listing.parking} คัน`] as [string, string]] : []),
  ];

  const pricePerSqwa = formatPricePerSqwa(listing.price_per_sqwa);

  return (
    <>
      <ViewTracker listingId={listing.id} />
      <TopBar
        role={session?.role ?? null}
        title="รายละเอียดประกาศ"
        back="/"
        action={
          <FavoriteButton
            listingId={listing.id}
            initialSaved={Boolean(favoriteData)}
            isLoggedIn={Boolean(session)}
          />
        }
      />

      <div className="gallery">
        {listing.images.length > 0 ? (
          <>
            <div className="gallery-scroll">
              {listing.images.map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`รูปที่ ${index + 1} ของ ${listing.title}`} loading={index === 0 ? "eager" : "lazy"} />
              ))}
            </div>
            <span className="gallery-count">{listing.images.length} รูป</span>
          </>
        ) : (
          <div className="gallery-empty" aria-hidden="true">{PROPERTY_TYPE_ICON[listing.property_type]}</div>
        )}
      </div>

      <div className="container" style={{ paddingTop: 14, paddingBottom: 96 }}>
        <div className="stack">
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="badge badge-brand">{DEAL_TYPE_TH[listing.deal_type]}</span>
            <span className="badge">{PROPERTY_TYPE_TH[listing.property_type]}</span>
            {isOwnerOrAdmin ? <span className={STATUS_BADGE[listing.status]}>{STATUS_TH[listing.status]}</span> : null}
            {listing.status === "sold" ? <span className="badge badge-info">ขายแล้ว</span> : null}
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35, margin: 0 }}>{listing.title}</h1>

          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "var(--price)", letterSpacing: "-.02em" }}>
              {formatPriceFull(price)}
              {listing.deal_type === "rent" ? <span style={{ fontSize: 15 }}> /เดือน</span> : null}
            </div>
            {pricePerSqwa ? <div className="small muted">{pricePerSqwa}</div> : null}
          </div>

          <div className="row-between small muted">
            <span>👁 {listing.view_count.toLocaleString("th-TH")} ครั้ง</span>
            <span>ลงประกาศ {formatRelativeTime(listing.posted_at ?? listing.published_at ?? listing.created_at)}</span>
          </div>

          <div className="spec-grid">
            {specs.map(([label, value]) => (
              <div className="spec" key={label}>
                <div className="spec-label">{label}</div>
                <div className="spec-value">{value}</div>
              </div>
            ))}
          </div>

          {listing.amenities.length > 0 ? (
            <div className="row wrap" style={{ gap: 6 }}>
              {listing.amenities.map((item) => <span key={item} className="badge">✓ {item}</span>)}
            </div>
          ) : null}

          <section>
            <h2 style={{ fontSize: 15, margin: "6px 0" }}>ที่ตั้ง</h2>
            <div className="card" style={{ overflow: "hidden" }}>
              <div style={{ height: 220 }}>
                {listing.lat !== null ? (
                  <MapView
                    listings={[mapListing]}
                    center={{ lat: listing.lat, lng: listing.lng! }}
                    zoom={approximate ? 13 : 16}
                    showLocateMe={false}
                  />
                ) : (
                  <div className="map-fallback">
                    <div style={{ fontSize: 28 }}>📍</div>
                    <div className="small">ประกาศนี้ยังไม่มีพิกัดบนแผนที่</div>
                  </div>
                )}
              </div>
              <div className="card-pad stack" style={{ gap: 8 }}>
                <div className="strong">
                  {listing.address_text ?? formatLocation(listing.subdistrict, listing.district, listing.province)}
                </div>
                {listing.landmark ? <div className="small muted">ใกล้ {listing.landmark}</div> : null}

                <div className="row" style={{ gap: 6 }}>
                  <span className={approximate ? "badge badge-warn" : "badge badge-ok"}>
                    {GEO_PRECISION_TH[listing.geo_precision]}
                  </span>
                </div>

                {approximate ? (
                  <div className="notice notice-warn tiny">
                    ตำแหน่งนี้เป็นจุดกึ่งกลางของพื้นที่โดยประมาณ ไม่ใช่ที่ตั้งจริงของทรัพย์
                    วงกลมบนแผนที่คือขอบเขตที่เป็นไปได้ กรุณาสอบถามผู้ขายเพื่อยืนยันตำแหน่ง
                  </div>
                ) : null}

                {listing.lat !== null ? (
                  <a
                    className="btn btn-sm"
                    href={`https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`}
                    target="_blank" rel="noopener noreferrer"
                  >
                    🗺️ เปิดใน Google Maps
                  </a>
                ) : null}
              </div>
            </div>
          </section>

          {listing.description ? (
            <section>
              <h2 style={{ fontSize: 15, margin: "6px 0" }}>รายละเอียดจากผู้ขาย</h2>
              <div className="card card-pad pre-wrap small">{listing.description}</div>
            </section>
          ) : null}

          <section>
            <h2 style={{ fontSize: 15, margin: "6px 0" }}>ที่มาของข้อมูล</h2>
            <div className="card card-pad small stack" style={{ gap: 4 }}>
              <div className="row-between">
                <span className="muted">แหล่งข้อมูล</span>
                <span className="strong">{source?.name ?? "ผู้ขายลงประกาศเอง"}</span>
              </div>
              <div className="row-between">
                <span className="muted">ผู้ติดต่อ</span>
                <span className="strong">{listing.contact_name ?? "-"}</span>
              </div>
              <div className="row-between">
                <span className="muted">บันทึกเข้าระบบ</span>
                <span>{formatThaiDate(listing.created_at)}</span>
              </div>
              <div className="row-between">
                <span className="muted">ความครบถ้วนของข้อมูล</span>
                <span className="strong">{listing.quality_score}/100</span>
              </div>
              <div className="bar"><span style={{ width: `${listing.quality_score}%` }} /></div>
              <p className="tiny muted" style={{ marginTop: 6, marginBottom: 0 }}>
                ข้อมูลนี้รวบรวมจากประกาศสาธารณะ กรุณาตรวจสอบเอกสารสิทธิ์และสภาพทรัพย์จริงกับผู้ขายก่อนวางเงินทุกครั้ง
              </p>
            </div>
          </section>

          {nearby.length > 0 ? (
            <section>
              <h2 style={{ fontSize: 15, margin: "6px 0" }}>ประกาศใกล้เคียง</h2>
              <div className="stack">
                {nearby.map((item) => <ListingCard key={item.id} listing={item} compact />)}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <div className="sticky-cta">
        <div className="grow">
          <ContactButtons
            listingId={listing.id}
            phone={listing.contact_phone}
            lineId={listing.contact_line}
            sourceUrl={listing.contact_url}
            isLoggedIn={Boolean(session)}
          />
        </div>
      </div>
    </>
  );
}
