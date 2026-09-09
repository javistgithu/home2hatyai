import type { Metadata } from "next";
import Link from "next/link";
import TopBar from "@/components/nav/TopBar";
import ListingCard from "@/components/listing/ListingCard";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { Listing, SearchListingRow } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "รายการโปรด" };

export default async function FavoritesPage() {
  const session = await getSession();
  const supabase = createClient();

  const { data } = await supabase
    .from("favorites")
    .select("created_at, listings:listing_id(*)")
    .order("created_at", { ascending: false });

  // Supabase มองความสัมพันธ์ที่ join มาเป็นอาร์เรย์เสมอ จึงต้องแปลงชนิดผ่าน unknown
  const rows = (data ?? []) as unknown as Array<{ created_at: string; listings: Listing | null }>;
  const listings = rows
    .map((row) => row.listings)
    .filter((item): item is Listing => Boolean(item))
    .map((item) => ({ ...item, distance_km: null, total_count: 0 }) as unknown as SearchListingRow);

  return (
    <>
      <TopBar role={session?.role ?? null} title="รายการโปรด" subtitle={`บันทึกไว้ ${listings.length} ประกาศ`} />
      <div className="container section">
        {listings.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">❤️</div>
            <div className="strong">ยังไม่มีประกาศที่บันทึกไว้</div>
            <p className="small">กดรูปหัวใจที่มุมขวาบนของหน้าประกาศเพื่อเก็บไว้ดูภายหลัง</p>
            <Link href="/" className="btn btn-soft btn-sm">เริ่มค้นหาประกาศ</Link>
          </div>
        ) : (
          <div className="stack listing-grid">
            {listings.map((item) => <ListingCard key={item.id} listing={item} />)}
          </div>
        )}
      </div>
    </>
  );
}
