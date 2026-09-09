import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/nav/BottomNav";
import { getSession } from "@/lib/auth";
import { APP_NAME, APP_TAGLINE, isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, statusBarStyle: "default", title: APP_NAME },
  formatDetection: { telephone: true },
};

/** ตั้งค่าให้เหมาะกับมือถือ : ไม่ให้ซูมเอง และรองรับพื้นที่ปลอดภัยของจอมีติ่ง */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#101312" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ถ้ายังไม่ได้ตั้งค่า Supabase ต้องไม่ให้แอปพังทั้งหน้า — แสดงคำแนะนำแทน
  const session = isSupabaseConfigured ? await getSession().catch(() => null) : null;

  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-shell">{children}</div>
        <BottomNav role={session?.role ?? null} />
      </body>
    </html>
  );
}
