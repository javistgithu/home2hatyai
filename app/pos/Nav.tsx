"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * แถบเมนูล่าง 6 ปุ่ม
 *
 * จำกัดไว้ 6 ปุ่มโดยตั้งใจ: ทุกงานที่พนักงานทำประจำต้องถึงได้ใน 1 แตะ
 * ถ้ามีมากกว่านี้จะต้องซ่อนในเมนูย่อย แล้วของที่ซ่อนจะไม่มีใครใช้
 */
const ITEMS = [
  { href: "/pos",         ico: "📋", label: "งานวันนี้" },
  { href: "/pos/sell",    ico: "🧾", label: "ขายของ" },
  { href: "/pos/find",    ico: "🔍", label: "ของอยู่ไหน" },
  { href: "/pos/count",   ico: "📦", label: "นับสต๊อก" },
  { href: "/pos/receive", ico: "🚚", label: "รับของ" },
  { href: "/pos/display", ico: "💡", label: "ตัวโชว์" },
];

export default function Nav({ alerts = 0 }: { alerts?: number }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map((it) => {
        const active = it.href === "/pos" ? path === "/pos" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""}>
            <span className="ico">{it.ico}</span>
            <span>{it.label}</span>
            {it.href === "/pos" && alerts > 0 && (
              <span className="badge">{alerts > 99 ? "99+" : alerts}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
