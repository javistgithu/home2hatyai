import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ingestPosts, type IngestPostInput, type IngestSourceInput } from "@/lib/ingest";
import { verifyIngestSignature } from "@/lib/ingest-auth";
import { isServiceRoleConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_SOURCE_KINDS = new Set([
  "facebook_group", "facebook_page", "manual", "csv", "webhook", "seller_app",
]);

/** จำกัดจำนวนโพสต์ต่อคำขอ กันคำขอใหญ่เกินจน timeout */
const MAX_POSTS_PER_REQUEST = 200;

interface IngestBody {
  source: IngestSourceInput;
  posts: IngestPostInput[];
  options?: { autoPublish?: boolean; useGeocoding?: boolean; dedupe?: boolean };
}

/** ผู้เรียกต้องเป็นแอดมินที่ล็อกอินอยู่ หรือมีลายเซ็น HMAC ที่ถูกต้อง */
async function authorize(request: NextRequest, rawBody: string): Promise<{ ok: boolean; actor: string; reason?: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((profile as { role?: string } | null)?.role === "admin") {
      return { ok: true, actor: `admin:${user.id}` };
    }
  }

  const verdict = verifyIngestSignature(
    rawBody,
    request.headers.get("x-ingest-signature"),
    request.headers.get("x-ingest-timestamp")
  );
  if (verdict.ok) return { ok: true, actor: "collector" };

  return { ok: false, actor: "unknown", reason: verdict.reason };
}

export async function POST(request: NextRequest) {
  if (!isServiceRoleConfigured) {
    return NextResponse.json(
      { error: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const auth = await authorize(request, rawBody);
  if (!auth.ok) {
    return NextResponse.json({ error: "ไม่ได้รับอนุญาต", reason: auth.reason }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "รูปแบบ JSON ไม่ถูกต้อง" }, { status: 400 });
  }

  if (!body?.source?.kind || !VALID_SOURCE_KINDS.has(body.source.kind)) {
    return NextResponse.json({ error: "source.kind ไม่ถูกต้อง" }, { status: 400 });
  }
  if (!body.source.name?.trim()) {
    return NextResponse.json({ error: "ต้องระบุ source.name" }, { status: 400 });
  }
  if (!Array.isArray(body.posts) || body.posts.length === 0) {
    return NextResponse.json({ error: "ต้องส่ง posts อย่างน้อย 1 รายการ" }, { status: 400 });
  }
  if (body.posts.length > MAX_POSTS_PER_REQUEST) {
    return NextResponse.json(
      { error: `ส่งได้สูงสุด ${MAX_POSTS_PER_REQUEST} โพสต์ต่อครั้ง (ส่งมา ${body.posts.length})` },
      { status: 413 }
    );
  }

  const validPosts = body.posts.filter((p) => typeof p?.content === "string" && p.content.trim().length >= 20);
  if (validPosts.length === 0) {
    return NextResponse.json({ error: "ไม่มีโพสต์ที่มีเนื้อหาเพียงพอ (อย่างน้อย 20 ตัวอักษร)" }, { status: 400 });
  }

  const admin = createAdminClient();
  const report = await ingestPosts(admin, body.source, validPosts, {
    autoPublish: body.options?.autoPublish ?? false,
    useGeocoding: body.options?.useGeocoding ?? true,
    dedupe: body.options?.dedupe ?? true,
    actor: auth.actor,
  });

  return NextResponse.json(report, { status: 200 });
}
