import TopBar from "@/components/nav/TopBar";
import ExploreClient from "@/components/explore/ExploreClient";
import SetupNotice from "@/components/ui/SetupNotice";
import { createClient } from "@/lib/supabase/server";
import { searchListings } from "@/lib/queries";
import { getSession } from "@/lib/auth";
import { APP_TAGLINE, isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <TopBar role={null} subtitle={APP_TAGLINE} />
        <SetupNotice />
      </>
    );
  }

  const supabase = createClient();
  const [session, result] = await Promise.all([
    getSession().catch(() => null),
    searchListings(supabase, { limit: 30 }),
  ]);

  return (
    <>
      <TopBar role={session?.role ?? null} subtitle={APP_TAGLINE} />
      {result.error ? (
        <div className="container" style={{ paddingTop: 12 }}>
          <div className="notice notice-danger">
            เชื่อมต่อฐานข้อมูลไม่สำเร็จ: {result.error}
            <div className="tiny" style={{ marginTop: 4 }}>
              ตรวจว่ารันไฟล์ใน supabase/migrations ครบแล้วหรือยัง
            </div>
          </div>
        </div>
      ) : null}
      <ExploreClient initialView="list" initialItems={result.items} initialTotal={result.total} />
    </>
  );
}
