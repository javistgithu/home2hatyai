import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import TopBar from "@/components/nav/TopBar";
import AuthForm from "@/components/auth/AuthForm";
import SetupNotice from "@/components/ui/SetupNotice";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "สมัครสมาชิก" };

export default async function SignupPage() {
  if (!isSupabaseConfigured) return (<><TopBar role={null} title="สมัครสมาชิก" /><SetupNotice /></>);

  const session = await getSession().catch(() => null);
  if (session) redirect("/account");

  return (
    <>
      <TopBar role={null} title="สมัครสมาชิก" back="/login" />
      <div className="container section">
        <div className="card card-pad">
          <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
            <AuthForm mode="signup" />
          </Suspense>
        </div>
      </div>
    </>
  );
}
