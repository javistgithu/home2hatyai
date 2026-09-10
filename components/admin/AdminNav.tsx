"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: Array<{ href: string; label: string; badgeKey?: string }> = [
  { href: "/admin", label: "ภาพรวม" },
  { href: "/admin/moderation", label: "รออนุมัติ", badgeKey: "pending" },
  { href: "/admin/duplicates", label: "รายการซ้ำ", badgeKey: "duplicates" },
  { href: "/admin/ingest", label: "นำเข้าข้อมูล" },
  { href: "/admin/sources", label: "แหล่งข้อมูล" },
  { href: "/admin/users", label: "ผู้ใช้" },
];

export default function AdminNav({ counts = {} }: { counts?: Record<string, number> }) {
  const pathname = usePathname() || "";

  return (
    <div className="container" style={{ paddingTop: 10 }}>
      <div className="chips">
        {LINKS.map((link) => {
          const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
          const count = link.badgeKey ? counts[link.badgeKey] ?? 0 : 0;
          return (
            <Link key={link.href} href={link.href} className={`chip ${active ? "active" : ""}`}>
              {link.label}
              {count > 0 ? <span style={{ marginLeft: 5, opacity: .85 }}>{count}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
