import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import TopBar from "@/components/nav/TopBar";
import AuthForm from "@/components/auth/AuthForm";
import SetupNotice from "@/components/ui/SetupNotice";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage() {
  if (!isSupabaseConfigured) return (<><TopBar role={null} title="เข้าสู่ระบบ" /><SetupNotice /></>);

  const session = await getSession().catch(() => null);
  if (session) redirect("/account");

  return (
    <>
      <TopBar role={null} title="เข้าสู่ระบบ" back="/" />
      <div className="container section">
        <div className="card card-pad">
          <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}>
            <AuthForm mode="login" />
          </Suspense>
        </div>
      </div>
    </>
  );
}
