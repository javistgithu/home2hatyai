import { webhook } from "@line/bot-sdk";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_REPLY } from "@/lib/constants";
import { askGemini } from "@/lib/gemini";
import { isValidLineSignature, replyText } from "@/lib/line";
import { getFaqFromSheet } from "@/lib/sheet";

// ต้องใช้ Node.js runtime เพราะ @line/bot-sdk ใช้ node:crypto สำหรับ validateSignature
export const runtime = "nodejs";

async function handleTextMessageEvent(
  event: webhook.MessageEvent
): Promise<void> {
  const replyToken = event.replyToken;
  const message = event.message as webhook.TextMessageContent;

  if (!replyToken) return;

  let faqCsv: string;
  try {
    faqCsv = await getFaqFromSheet();
  } catch (err) {
    console.error("[line-webhook] getFaqFromSheet failed", err);
    await replyText(replyToken, DEFAULT_REPLY);
    return;
  }

  const result = await askGemini(message.text, faqCsv);

  console.log("[line-webhook] gemini result", {
    finishReason: result.finishReason,
  });

  const text = result.finishReason === "STOP" && result.text.trim()
    ? result.text
    : DEFAULT_REPLY;

  await replyText(replyToken, text);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!isValidLineSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: webhook.CallbackRequest;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    console.error("[line-webhook] invalid JSON body", err);
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const textMessageEvents = (body.events ?? []).filter(
    (event): event is webhook.MessageEvent =>
      event.type === "message" && event.message?.type === "text"
  );

  // ประมวลผลทุก event แล้วคืน 200 เสมอ เพื่อไม่ให้ LINE retry event ซ้ำ
  // (ข้อผิดพลาดระหว่าง reply ถูก catch และ log ไว้ในแต่ละ handler แล้ว)
  await Promise.all(
    textMessageEvents.map((event) =>
      handleTextMessageEvent(event).catch((err) =>
        console.error("[line-webhook] unhandled event error", err)
      )
    )
  );

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
