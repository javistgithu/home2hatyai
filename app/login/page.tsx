"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/pos/client";
import type { AppUser } from "@/lib/pos/types";

/**
 * เข้าสู่ระบบด้วยรหัสพนักงาน + PIN
 *
 * ใช้แป้นตัวเลขบนจอ ไม่ใช่คีย์บอร์ด เพราะ
 *   - เครื่องหน้าร้านเป็นจอสัมผัส
 *   - ล็อกอินใหม่วันละหลายสิบครั้ง ต้องใช้เวลาไม่เกิน 3 วินาที
 * ถ้าล็อกอินช้า พนักงานจะเปิดค้างไว้ใช้ร่วมกัน แล้วระบบจะไม่รู้ว่าใครทำอะไร
 */
export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    codeRef.current?.focus();
    // จำรหัสพนักงานคนล่าสุดไว้ เพราะเครื่องหนึ่งมักมีคนใช้ประจำ 1-2 คน
    const last = localStorage.getItem("pos_last_user");
    if (last) setCode(last);
  }, []);

  async function submit() {
    if (!code.trim() || pin.length < 4) {
      setErr("กรอกรหัสพนักงานและ PIN อย่างน้อย 4 หลัก");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const user = await post<AppUser>("/api/pos/auth/login", {
        code: code.trim(),
        pin,
      });
      localStorage.setItem("pos_last_user", user.code);
      router.replace("/pos");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "ลบ", "0", "เข้า"];

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 380 }}>
        <div className="card-body stack">
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2.4rem", lineHeight: 1 }}>⚡</div>
            <h1 style={{ marginTop: 6 }}>ร้านไฟฟ้าและโคมไฟ</h1>
            <p className="muted small">เข้าสู่ระบบขายหน้าร้าน</p>
          </div>

          <div className="stack-sm">
            <label htmlFor="code">รหัสพนักงาน</label>
            <input
              id="code"
              ref={codeRef}
              value={code}
              autoComplete="off"
              placeholder="เช่น S01"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          <div className="stack-sm">
            <label>PIN</label>
            <div
              className="row"
              style={{
                justifyContent: "center",
                gap: 10,
                minHeight: 48,
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-2)",
              }}
            >
              {pin.length === 0 ? (
                <span className="muted2">กดตัวเลขด้านล่าง</span>
              ) : (
                Array.from({ length: pin.length }).map((_, i) => (
                  <span key={i} style={{ fontSize: "1.5rem", lineHeight: 1 }}>
                    ●
                  </span>
                ))
              )}
            </div>
          </div>

          {err && <div className="alert alert-danger">{err}</div>}

          <div className="keypad">
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                disabled={busy}
                className={k === "เข้า" ? "btn-primary" : undefined}
                onClick={() => {
                  if (k === "ลบ") setPin((p) => p.slice(0, -1));
                  else if (k === "เข้า") void submit();
                  else setPin((p) => (p.length >= 6 ? p : p + k));
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
