import { messagingApi, validateSignature } from "@line/bot-sdk";
import { LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET } from "./constants";

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
});

export function isValidLineSignature(
  rawBody: string,
  signature: string | null
): boolean {
  if (!signature || !LINE_CHANNEL_SECRET) return false;
  return validateSignature(rawBody, LINE_CHANNEL_SECRET, signature);
}

// replyToken ใช้ได้ครั้งเดียวและหมดอายุไว — ถ้า reply ล้มเหลว log แล้วปล่อยผ่าน
// ห้าม throw ต่อ เพราะ route ต้องคืน 200 ให้ LINE เสมอ ไม่งั้น LINE จะ retry event ซ้ำ
export async function replyText(
  replyToken: string,
  text: string
): Promise<void> {
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    });
  } catch (err) {
    console.error("[line] replyMessage failed", err);
  }
}
