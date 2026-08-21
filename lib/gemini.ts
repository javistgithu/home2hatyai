import { GoogleGenAI } from "@google/genai";
import {
  DEFAULT_REPLY,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GEMINI_TIMEOUT_MS,
} from "./constants";

export interface AskGeminiResult {
  text: string;
  finishReason: string;
}

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

function buildPrompt(faqCsv: string, userMessage: string): string {
  return `<role>
คุณคือแอดมินอยากมีบ้านหาดใหญ่ ผู้ดูแลลูกค้าของธุรกิจขายบ้านและที่ดินในหาดใหญ่ ทำหน้าที่ตอบคำถามลูกค้าทาง LINE
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามคิดหรือแต่งราคา/เวลา/ที่ตั้ง/โปรโมชั่นเอง
- ถ้าไม่มีข้อมูลใน <faq> ที่ตอบคำถามนี้ได้ ให้ตอบขอเบอร์โทรลูกค้า พร้อมแจ้งว่าทางร้านจะติดต่อกลับ (ห้ามเดาคำตอบ)
- โทนสุภาพ เป็นกันเอง ใช้คำลงท้าย "ค่ะ/นะคะ" ใส่ emoji ได้เล็กน้อย (ไม่เกิน 1-2 ตัวต่อข้อความ)
- ความยาวคำตอบ 1-3 ประโยค กระชับ ไม่อธิบายยืดเยื้อ
</constraints>

<output_format>
ภาษาไทย ไม่ใช้ markdown ไม่ใช้ bullet point
</output_format>

<faq>
${faqCsv}
</faq>

<question>
${userMessage}
</question>`;
}

// เรียก Gemini พร้อม timeout 8 วิ — คืนค่า DEFAULT_REPLY เสมอเมื่อ error/timeout/finishReason ผิดปกติ
// เพื่อให้ webhook ไม่ต้อง throw กลับไปหา LINE (LINE จะ retry ถ้า route คืน error)
export async function askGemini(
  userMessage: string,
  faqCsv: string
): Promise<AskGeminiResult> {
  if (!ai) {
    console.error("[gemini] GEMINI_API_KEY is not set");
    return { text: DEFAULT_REPLY, finishReason: "ERROR" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(faqCsv, userMessage),
      config: {
        abortSignal: controller.signal,
      },
    });

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason ?? "UNKNOWN";
    const usage = response.usageMetadata;

    console.log("[gemini] result", {
      finishReason,
      thoughtsTokenCount: usage?.thoughtsTokenCount ?? 0,
      candidatesTokenCount: usage?.candidatesTokenCount ?? 0,
    });

    const text = response.text ?? "";

    return { text, finishReason };
  } catch (err) {
    console.error("[gemini] request failed", err);
    return { text: DEFAULT_REPLY, finishReason: "ERROR" };
  } finally {
    clearTimeout(timer);
  }
}
