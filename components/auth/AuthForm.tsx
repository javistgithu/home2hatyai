"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // บทบาทที่ขอมาจะถูกตรวจซ้ำในฐานข้อมูล — ขอเป็น admin ไม่ได้
          data: { role, full_name: fullName, phone },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });

      if (signUpError) {
        setError(translateAuthError(signUpError.message));
        setBusy(false);
        return;
      }
      if (!data.session) {
        setInfo("สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมลที่ส่งไปให้ แล้วกลับมาเข้าสู่ระบบ");
        setBusy(false);
        return;
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(translateAuthError(signInError.message));
        setBusy(false);
        return;
      }
    }

    router.push(nextPath);
    router.refresh();
  };

  return (
    <form className="stack" onSubmit={submit}>
      {mode === "signup" ? (
        <div className="field">
          <span className="label">คุณต้องการใช้งานแบบไหน</span>
          <div className="chips">
            <button type="button" className={`chip ${role === "buyer" ? "active" : ""}`} onClick={() => setRole("buyer")}>
              🔎 ผู้ซื้อ — ค้นหาบ้าน/ที่ดิน
            </button>
            <button type="button" className={`chip ${role === "seller" ? "active" : ""}`} onClick={() => setRole("seller")}>
              🏷️ ผู้ขาย — ลงประกาศ
            </button>
          </div>
          <span className="hint">
            สิทธิ์ผู้ดูแลระบบต้องให้แอดมินเดิมกำหนดให้จากฐานข้อมูลเท่านั้น
          </span>
        </div>
      ) : null}

      {mode === "signup" ? (
        <>
          <div className="field">
            <label className="label" htmlFor="full_name">ชื่อ-นามสกุล</label>
            <input id="full_name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="เช่น สมชาย ใจดี" autoComplete="name" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="phone">เบอร์โทรติดต่อ</label>
            <input id="phone" className="input" type="tel" inputMode="tel" value={phone}
              onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" autoComplete="tel" />
          </div>
        </>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="email">อีเมล</label>
        <input id="email" className="input" type="email" inputMode="email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </div>

      <div className="field">
        <label className="label" htmlFor="password">รหัสผ่าน</label>
        <input id="password" className="input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
        {mode === "signup" ? <span className="hint">อย่างน้อย 8 ตัวอักษร</span> : null}
      </div>

      {error ? <div className="notice notice-danger">{error}</div> : null}
      {info ? <div className="notice notice-ok">{info}</div> : null}

      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "กำลังดำเนินการ…" : mode === "signup" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
      </button>

      <div className="text-center small muted">
        {mode === "signup" ? (
          <>มีบัญชีอยู่แล้ว? <Link className="link" href={`/login?next=${encodeURIComponent(nextPath)}`}>เข้าสู่ระบบ</Link></>
        ) : (
          <>ยังไม่มีบัญชี? <Link className="link" href={`/signup?next=${encodeURIComponent(nextPath)}`}>สมัครสมาชิก</Link></>
        )}
      </div>
    </form>
  );
}

/** แปลข้อความผิดพลาดของ Supabase Auth เป็นภาษาไทย */
function translateAuthError(message: string): string {
  const map: Array<[RegExp, string]> = [
    [/invalid login credentials/i, "อีเมลหรือรหัสผ่านไม่ถูกต้อง"],
    [/email not confirmed/i, "ยังไม่ได้ยืนยันอีเมล กรุณาตรวจกล่องจดหมาย"],
    [/user already registered/i, "อีเมลนี้ถูกใช้สมัครไปแล้ว"],
    [/password should be at least/i, "รหัสผ่านสั้นเกินไป ต้องมีอย่างน้อย 8 ตัวอักษร"],
    [/rate limit|too many/i, "ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่"],
    [/unable to validate email/i, "รูปแบบอีเมลไม่ถูกต้อง"],
  ];
  for (const [pattern, thai] of map) if (pattern.test(message)) return thai;
  return message;
}
