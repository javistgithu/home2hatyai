import { redirect } from "next/navigation";
import Link from "next/link";
import Nav from "./Nav";
import LogoutButton from "./LogoutButton";
import { getCurrentUser } from "@/lib/pos/session";
import { db } from "@/lib/pos/api";
import { num } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * นับงานค้างที่ต้องจัดการ ใช้แสดงตัวเลขแดงบนปุ่ม "งานวันนี้"
 *
 * เจตนา: ทำให้ปัญหาสต๊อกมองเห็นได้ตลอดเวลา ไม่ต้องเข้าไปหา
 * ถ้าไม่โชว์ตรงนี้ ใบแจ้งหาไม่เจอจะค้างเป็นเดือนโดยไม่มีใครรู้
 */
async function countAlerts(): Promise<number> {
  try {
    const pool = await db();
    const res = await pool.query<Record<string, unknown>>(
      `SELECT
         (SELECT count(*) FROM not_found_report WHERE status='OPEN')      AS a,
         (SELECT count(*) FROM stock_balance WHERE qty_on_hand < 0)       AS b,
         (SELECT count(*) FROM stock_balance sb
            JOIN location l ON l.id = sb.location_id
           WHERE l.code = 'F-TMP' AND sb.qty_on_hand > 0)                 AS c`
    );
    const r = res.rows[0];
    return num(r?.a) + num(r?.b) + num(r?.c);
  } catch {
    return 0;
  }
}

export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const alerts = await countAlerts();

  return (
    <div className="app">
      <header className="topbar">
        <Link href="/pos" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="title">⚡ ร้านไฟฟ้าและโคมไฟ</span>
        </Link>
        <div className="spacer" />
        <div className="who">
          <strong>{user.name}</strong>
          {user.role === "OWNER" ? "เจ้าของร้าน" : "พนักงาน"}
        </div>
        <LogoutButton />
      </header>

      {children}

      <Nav alerts={alerts} />
    </div>
  );
}
