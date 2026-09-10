"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth";
import { ingestPosts, type IngestReport } from "@/lib/ingest";
import type { UserRole } from "@/lib/types/database";

async function assertAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") throw new Error("ต้องเป็นแอดมินเท่านั้น");
  return session;
}

/** บันทึกการกระทำของแอดมินทุกครั้ง เพื่อให้ตรวจสอบย้อนหลังได้ */
async function writeAudit(action: string, entity: string, entityId: string, meta: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const session = await getSession();
  await admin.from("audit_logs").insert({
    actor_id: session?.userId ?? null,
    actor_role: session?.role ?? null,
    action, entity, entity_id: entityId, meta,
  });
}

export async function approveListing(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = createClient();
  await supabase
    .from("listings")
    .update({ status: "published", reject_reason: null, published_at: new Date().toISOString() })
    .eq("id", id);

  await writeAudit("approve_listing", "listing", id);
  revalidatePath("/admin/moderation");
  revalidatePath("/admin");
}

export async function rejectListing(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "ข้อมูลไม่ครบถ้วนหรือไม่ใช่ประกาศขาย";
  if (!id) return;

  const supabase = createClient();
  await supabase.from("listings").update({ status: "rejected", reject_reason: reason }).eq("id", id);

  await writeAudit("reject_listing", "listing", id, { reason });
  revalidatePath("/admin/moderation");
  revalidatePath("/admin");
}

/** อนุมัติหลายรายการพร้อมกัน */
export async function approveMany(formData: FormData): Promise<void> {
  await assertAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createClient();
  await supabase
    .from("listings")
    .update({ status: "published", published_at: new Date().toISOString() })
    .in("id", ids);

  await writeAudit("approve_listing_bulk", "listing", ids.join(","), { count: ids.length });
  revalidatePath("/admin/moderation");
  revalidatePath("/admin");
}

/** ยืนยันว่าเป็นรายการซ้ำจริง แล้วรวมเข้ากับประกาศหลัก */
export async function confirmDuplicate(formData: FormData): Promise<void> {
  await assertAdmin();
  const primaryId = String(formData.get("primary_id") ?? "");
  const duplicateId = String(formData.get("duplicate_id") ?? "");
  const score = Number.parseFloat(String(formData.get("score") ?? "0"));
  if (!primaryId || !duplicateId) return;

  const supabase = createClient();
  const { error } = await supabase.rpc("merge_duplicate", {
    p_primary_id: primaryId,
    p_duplicate_id: duplicateId,
    p_score: Number.isFinite(score) ? score : 0,
    p_reasons: {},
    p_decision: "confirmed",
  });
  if (error) console.error("[admin] merge_duplicate ล้มเหลว", error);

  revalidatePath("/admin/duplicates");
  revalidatePath("/admin");
}

/** ตัดสินว่าไม่ซ้ำ — คืนประกาศกลับเข้าระบบ */
export async function rejectDuplicate(formData: FormData): Promise<void> {
  await assertAdmin();
  const duplicateId = String(formData.get("duplicate_id") ?? "");
  const primaryId = String(formData.get("primary_id") ?? "");
  if (!duplicateId) return;

  const supabase = createClient();
  const { error } = await supabase.rpc("unmerge_duplicate", { p_duplicate_id: duplicateId });
  if (error) console.error("[admin] unmerge_duplicate ล้มเหลว", error);

  if (primaryId) {
    await supabase
      .from("listing_duplicates")
      .update({ decision: "rejected", decided_at: new Date().toISOString() })
      .eq("primary_id", primaryId)
      .eq("duplicate_id", duplicateId);
  }

  revalidatePath("/admin/duplicates");
  revalidatePath("/admin");
}

export async function toggleSource(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const enable = String(formData.get("enable") ?? "") === "1";
  if (!id) return;

  const supabase = createClient();
  await supabase.from("sources").update({ is_enabled: enable }).eq("id", id);

  await writeAudit(enable ? "enable_source" : "disable_source", "source", id);
  revalidatePath("/admin/sources");
}

export async function createSource(formData: FormData): Promise<void> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "facebook_group");
  const externalId = String(formData.get("external_id") ?? "").trim() || null;
  const url = String(formData.get("url") ?? "").trim() || null;
  if (!name) return;

  const supabase = createClient();
  await supabase.from("sources").insert({ name, kind, external_id: externalId, url });
  revalidatePath("/admin/sources");
}

/** เปลี่ยนบทบาทผู้ใช้ — ทางเดียวที่จะตั้งแอดมินคนใหม่ผ่านหน้าเว็บ */
export async function setUserRole(formData: FormData): Promise<void> {
  const session = await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;
  if (!userId || !["admin", "seller", "buyer"].includes(role)) return;

  // กันแอดมินลดสิทธิ์ตัวเองจนไม่เหลือแอดมินในระบบ
  if (userId === session.userId && role !== "admin") {
    const admin = createAdminClient();
    const { count } = await admin
      .from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) return;
  }

  const supabase = createClient();
  await supabase.from("profiles").update({ role }).eq("id", userId);

  await writeAudit("set_user_role", "profile", userId, { role });
  revalidatePath("/admin/users");
}

export async function setUserVerified(formData: FormData): Promise<void> {
  await assertAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const verified = String(formData.get("verified") ?? "") === "1";
  if (!userId) return;

  const supabase = createClient();
  await supabase.from("profiles").update({ is_verified: verified }).eq("id", userId);

  await writeAudit("set_user_verified", "profile", userId, { verified });
  revalidatePath("/admin/users");
}

export interface IngestActionState {
  ok: boolean;
  error?: string;
  report?: IngestReport;
}

/**
 * นำเข้าโพสต์ที่แอดมินคัดลอกมาวาง
 * คั่นแต่ละโพสต์ด้วยบรรทัด --- (สามขีดขึ้นไป)
 */
export async function ingestPastedPosts(
  _prev: IngestActionState | null,
  formData: FormData
): Promise<IngestActionState> {
  try {
    await assertAdmin();
  } catch {
    return { ok: false, error: "ต้องเป็นแอดมินเท่านั้น" };
  }

  const sourceName = String(formData.get("source_name") ?? "").trim();
  const sourceKind = String(formData.get("source_kind") ?? "manual");
  const sourceUrl = String(formData.get("source_url") ?? "").trim() || null;
  const autoPublish = String(formData.get("auto_publish") ?? "") === "on";
  const raw = String(formData.get("posts") ?? "");

  if (!sourceName) return { ok: false, error: "กรุณาระบุชื่อแหล่งข้อมูล" };

  const chunks = raw
    .split(/^\s*-{3,}\s*$/m)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 20);

  if (chunks.length === 0) {
    return { ok: false, error: "ไม่พบข้อความโพสต์ที่ยาวพอ (อย่างน้อย 20 ตัวอักษรต่อโพสต์)" };
  }
  if (chunks.length > 100) {
    return { ok: false, error: `นำเข้าได้สูงสุด 100 โพสต์ต่อครั้ง (วางมา ${chunks.length})` };
  }

  try {
    const admin = createAdminClient();
    const report = await ingestPosts(
      admin,
      { kind: sourceKind as never, name: sourceName, url: sourceUrl },
      chunks.map((content) => ({ content })),
      { autoPublish, useGeocoding: true, dedupe: true, actor: "admin_console" }
    );

    revalidatePath("/admin");
    revalidatePath("/admin/moderation");
    return { ok: true, report };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "นำเข้าไม่สำเร็จ" };
  }
}
