import Link from "next/link";
import { APP_NAME } from "@/lib/env";
import { ROLE_TH } from "@/lib/format";
import type { UserRole } from "@/lib/types/database";

interface TopBarProps {
  role: UserRole | null;
  title?: string;
  subtitle?: string;
  back?: string;
  action?: React.ReactNode;
}

export default function TopBar({ role, title, subtitle, back, action }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {back ? (
          <Link href={back} className="btn btn-ghost btn-icon" aria-label="ย้อนกลับ">←</Link>
        ) : (
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">บ</span>
          </Link>
        )}

        <div className="grow">
          <div className="topbar-title truncate">{title ?? APP_NAME}</div>
          {subtitle ? <div className="topbar-sub truncate">{subtitle}</div> : null}
        </div>

        {action}

        {!action && role ? (
          <span className="badge badge-brand">{ROLE_TH[role]}</span>
        ) : null}
        {!action && !role ? (
          <Link href="/login" className="btn btn-sm btn-soft">เข้าสู่ระบบ</Link>
        ) : null}
      </div>
    </header>
  );
}
