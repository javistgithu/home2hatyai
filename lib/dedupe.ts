import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DuplicateCandidateRow } from "@/lib/types/database";

/**
 * เกณฑ์ตัดสินความซ้ำ (คะแนน 0-100 คำนวณในฐานข้อมูลโดย find_duplicate_candidates)
 *
 *   >= 85  ซ้ำแน่นอน  -> รวมอัตโนมัติ ผู้ซื้อเห็นรายการเดียว
 *   60-84  น่าจะซ้ำ   -> เข้าคิวให้แอดมินตัดสิน ยังแสดงทั้งคู่ไว้ก่อน
 *   < 60   ไม่ซ้ำ     -> ไม่ทำอะไร
 *
 * ตั้งค่าให้ "รวมอัตโนมัติ" เข้มไว้ก่อน เพราะการรวมผิดทำให้ประกาศจริงหายไปจากระบบ
 * ซึ่งเสียหายกว่าการปล่อยให้มีรายการซ้ำหลุดมาให้แอดมินเก็บทีหลัง
 */
export const AUTO_MERGE_THRESHOLD = 85;
export const REVIEW_THRESHOLD = 60;

export interface DedupeOutcome {
  status: "merged" | "flagged" | "unique";
  primaryId?: string;
  score?: number;
  reasons?: Record<string, unknown>;
  candidates: DuplicateCandidateRow[];
}

/** ดึงรายการที่อาจซ้ำกับประกาศนี้ พร้อมคะแนนและเหตุผล */
export async function findDuplicateCandidates(
  supabase: SupabaseClient,
  listingId: string,
  minScore = REVIEW_THRESHOLD,
  limit = 10
): Promise<DuplicateCandidateRow[]> {
  const { data, error } = await supabase.rpc("find_duplicate_candidates", {
    p_listing_id: listingId,
    p_min_score: minScore,
    p_limit: limit,
  });
  if (error) {
    console.error("[dedupe] find_duplicate_candidates ล้มเหลว", error);
    return [];
  }
  return (data ?? []) as DuplicateCandidateRow[];
}

/**
 * ตรวจและจัดการความซ้ำของประกาศที่เพิ่งเข้ามา
 * ตัวที่เก่ากว่าจะถูกยกให้เป็น "ประกาศหลัก" เสมอ เพราะเป็นคนโพสต์ก่อน
 */
export async function autoDedupe(
  supabase: SupabaseClient,
  listingId: string
): Promise<DedupeOutcome> {
  const candidates = await findDuplicateCandidates(supabase, listingId);
  if (candidates.length === 0) return { status: "unique", candidates };

  const best = candidates[0];

  if (Number(best.score) >= AUTO_MERGE_THRESHOLD) {
    const { error } = await supabase.rpc("merge_duplicate", {
      p_primary_id: best.candidate_id,     // รายการเดิมที่มีอยู่ก่อน = ตัวหลัก
      p_duplicate_id: listingId,           // รายการใหม่ = ตัวซ้ำ
      p_score: best.score,
      p_reasons: best.reasons,
      p_decision: "auto",
    });
    if (error) {
      console.error("[dedupe] รวมรายการซ้ำอัตโนมัติไม่สำเร็จ", error);
      return { status: "unique", candidates };
    }
    return { status: "merged", primaryId: best.candidate_id, score: Number(best.score), reasons: best.reasons, candidates };
  }

  // คะแนนกลาง ๆ : บันทึกไว้ให้แอดมินตัดสิน ไม่ซ่อนประกาศ
  const { error } = await supabase.from("listing_duplicates").upsert(
    {
      primary_id: best.candidate_id,
      duplicate_id: listingId,
      score: best.score,
      reasons: best.reasons,
      decision: "pending",
    },
    { onConflict: "primary_id,duplicate_id" }
  );
  if (error) console.error("[dedupe] บันทึกคิวตรวจสอบไม่สำเร็จ", error);

  return { status: "flagged", primaryId: best.candidate_id, score: Number(best.score), reasons: best.reasons, candidates };
}
