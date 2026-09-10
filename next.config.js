/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /**
     * PGlite และ pg ต้องถูกโหลดจาก node_modules ตอนรัน ห้ามให้ webpack รวมเข้า bundle
     *
     * PGlite โหลดไฟล์ WASM ของ Postgres ด้วย path ที่อ้างอิงตำแหน่งไฟล์ตัวเอง
     * พอถูก bundle เข้า chunk เดียว path นั้นชี้ผิดที่ แล้วพังตอน runtime ด้วย
     *   TypeError: The "path" argument must be of type string ... Received an instance of URL
     *
     * pg ก็มี dynamic require (pg-native) ที่ bundler ตามไม่ได้เหมือนกัน
     */
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg"],
  },
};

module.exports = nextConfig;
