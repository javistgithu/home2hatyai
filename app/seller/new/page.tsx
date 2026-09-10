import type { Metadata } from "next";
import TopBar from "@/components/nav/TopBar";
import ListingForm from "@/components/forms/ListingForm";
import { requireRole } from "@/lib/auth";
import { createListing } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ลงประกาศใหม่" };

export default async function NewListingPage() {
  const session = await requireRole(["seller", "admin"], "/seller/new");

  return (
    <>
      <TopBar role={session.role} title="ลงประกาศใหม่" back="/seller" />
      <div className="container section">
        <ListingForm mode="create" action={createListing} />
        <div style={{ height: 24 }} />
      </div>
    </>
  );
}
