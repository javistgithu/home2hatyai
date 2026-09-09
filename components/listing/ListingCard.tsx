import Link from "next/link";
import {
  DEAL_TYPE_TH, PROPERTY_TYPE_ICON, PROPERTY_TYPE_TH, formatAreaShort,
  formatLocation, formatPriceFull, formatPriceShort, formatRelativeTime, isApproximate,
} from "@/lib/format";
import type { SearchListingRow } from "@/lib/types/database";

interface ListingCardProps {
  listing: SearchListingRow;
  /** แบบกะทัดรัดสำหรับการ์ดที่ลอยอยู่บนแผนที่ */
  compact?: boolean;
  showDistance?: boolean;
}

export default function ListingCard({ listing, compact = false, showDistance = false }: ListingCardProps) {
  const price = listing.deal_type === "rent" ? listing.rent_per_month : listing.price;
  const priceLabel =
    listing.deal_type === "rent"
      ? `${formatPriceShort(listing.rent_per_month)} บาท/เดือน`
      : formatPriceShort(price);

  const area = formatAreaShort(listing.land_area_sqwa, listing.usable_area_sqm);
  const approximate = isApproximate(listing.geo_precision);
  const cover = listing.images?.[0];

  return (
    <Link href={`/listing/${listing.id}`} className="card" style={{ display: "block" }}>
      <article className="listing-card">
        <div className="listing-thumb">
          {cover ? (
            // รูปจากแหล่งภายนอก ใช้ img ปกติเพื่อไม่ต้องตั้งค่า remotePatterns ของ next/image
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" loading="lazy" />
          ) : (
            <span aria-hidden="true">{PROPERTY_TYPE_ICON[listing.property_type]}</span>
          )}
        </div>

        <div className="listing-body">
          <div className="row" style={{ gap: 5 }}>
            <span className="badge badge-brand">{DEAL_TYPE_TH[listing.deal_type]}</span>
            <span className="badge">{PROPERTY_TYPE_TH[listing.property_type]}</span>
          </div>

          <h3 className="listing-title">{listing.title}</h3>

          <div className="listing-price" title={formatPriceFull(price)}>{priceLabel}</div>

          <div className="listing-meta">
            {area ? <span>📐 {area}</span> : null}
            {listing.bedrooms ? <span>🛏 {listing.bedrooms}</span> : null}
            {listing.bathrooms ? <span>🚿 {listing.bathrooms}</span> : null}
            {showDistance && listing.distance_km != null ? (
              <span>📍 {listing.distance_km.toFixed(1)} กม.</span>
            ) : null}
          </div>

          {!compact ? (
            <div className="row-between" style={{ marginTop: 2 }}>
              <span className="listing-loc truncate">
                {formatLocation(listing.subdistrict, listing.district, listing.province)}
                {approximate ? <span className="muted tiny"> · ตำแหน่งโดยประมาณ</span> : null}
              </span>
              <span className="tiny muted" style={{ flex: "none" }}>
                {formatRelativeTime(listing.published_at ?? listing.created_at)}
              </span>
            </div>
          ) : (
            <div className="listing-loc truncate">
              {formatLocation(listing.subdistrict, listing.district, listing.province)}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}
