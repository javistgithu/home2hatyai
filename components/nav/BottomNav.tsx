"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/lib/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  match: (path: string) => boolean;
}

/** แท็บหลักเปลี่ยนตามบทบาทผู้ใช้ */
function itemsForRole(role: UserRole | null): NavItem[] {
  const base: NavItem[] = [
    { href: "/", label: "ค้นหา", icon: "🔎", match: (p) => p === "/" },
    { href: "/map", label: "แผนที่", icon: "🗺️", match: (p) => p.startsWith("/map") },
    { href: "/favorites", label: "รายการโปรด", icon: "❤️", match: (p) => p.startsWith("/favorites") },
  ];

  if (role === "admin") {
    return [...base, { href: "/admin", label: "แอดมิน", icon: "🛠️", match: (p) => p.startsWith("/admin") }];
  }
  if (role === "seller") {
    return [...base, { href: "/seller", label: "ประกาศของฉัน", icon: "🏷️", match: (p) => p.startsWith("/seller") }];
  }
  return [...base, { href: "/account", label: "บัญชี", icon: "👤", match: (p) => p.startsWith("/account") || p.startsWith("/login") }];
}

export default function BottomNav({ role }: { role: UserRole | null }) {
  const pathname = usePathname() || "/";
  const items = itemsForRole(role);

  return (
    <nav className="bottomnav" aria-label="เมนูหลัก">
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
          >
            <span className="icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
