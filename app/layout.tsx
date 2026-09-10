import "./globals.css";

export const metadata = {
  title: "POS อุปกรณ์ไฟฟ้าและโคมไฟ",
  description: "ระบบขายหน้าร้านและจัดการสต๊อกตามตำแหน่งเก็บ",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
