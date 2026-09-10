import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TopBar from "@/components/nav/TopBar";
import ListingForm from "@/components/forms/ListingForm";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { updateListing } from "@/app/seller/actions";
import type { Listing } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "แก้ไขประกาศ" };

export default async function EditListingPage({ params }: { params: { id: string } }) {
  const session = await requireRole(["seller", "admin"], `/seller/listings/${params.id}/edit`);
  const supabase = createClient();

  const { data } = await supabase.from("listings").select("*").eq("id", params.id).maybeSingle();
  const listing = data as Listing | null;

  // RLS กันไว้อีกชั้นแล้ว แต่ตรวจซ้ำเพื่อให้ข้อความชัดเจน
  if (!listing) notFound();
  if (session.role !== "admin" && listing.owner_id !== session.userId) notFound();

  return (
    <>
      <TopBar role={session.role} title="แก้ไขประกาศ" back="/seller" />
      <div className="container section">
        {listing.status === "published" ? (
          <div className="notice notice-warn small" style={{ marginBottom: 12 }}>
            ประกาศนี้เผยแพร่อยู่ — หากแก้ราคา พื้นที่ พิกัด หรือเบอร์ติดต่อ
            ระบบจะส่งกลับเข้าคิวให้แอดมินตรวจอีกครั้งโดยอัตโนมัติ
          </div>
        ) : null}
        <ListingForm mode="edit" listing={listing} action={updateListing} />
        <div style={{ height: 24 }} />
      </div>
    </>
  );
}
