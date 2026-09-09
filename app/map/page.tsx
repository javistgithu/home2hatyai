import type { Metadata } from "next";
import TopBar from "@/components/nav/TopBar";
import ExploreClient from "@/components/explore/ExploreClient";
import SetupNotice from "@/components/ui/SetupNotice";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "แผนที่ประกาศ" };

export default async function MapPage() {
  if (!isSupabaseConfigured) {
    return (<><TopBar role={null} title="แผนที่" /><SetupNotice /></>);
  }
  const session = await getSession().catch(() => null);

  return (
    <>
      <TopBar role={session?.role ?? null} title="แผนที่ประกาศ" subtitle="แตะหมุดเพื่อดูรายละเอียด" />
      <ExploreClient initialView="map" />
    </>
  );
}
