import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

/**
 * รีเฟรชเซสชันของผู้ใช้ในทุก request และคุมสิทธิ์เข้าถึงหน้าตามบทบาท
 * (จำเป็นสำหรับ @supabase/ssr — ถ้าไม่มี middleware ผู้ใช้จะหลุดล็อกอินเอง)
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const requiresAuth = ["/seller", "/admin", "/favorites", "/account"].some((prefix) =>
    path.startsWith(prefix)
  );

  if (requiresAuth && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  // ตรวจบทบาทสำหรับพื้นที่แอดมินและผู้ขาย
  if (user && (path.startsWith("/admin") || path.startsWith("/seller"))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile as { role?: string } | null)?.role;

    if (path.startsWith("/admin") && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("error", "admin_only");
      return NextResponse.redirect(url);
    }
    if (path.startsWith("/seller") && role !== "seller" && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/account";
      url.searchParams.set("error", "seller_only");
      return NextResponse.redirect(url);
    }
  }

  return response;
}
