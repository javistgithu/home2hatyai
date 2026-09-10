/**
 * สร้างบาร์โค้ด Code 128 เป็น SVG
 *
 * เขียนเองแทนการใช้ไลบรารีภายนอก เพราะ
 *   1. หน้าพิมพ์ป้ายต้องทำงานได้แม้ไม่มีอินเทอร์เน็ต (ร้านเน็ตหลุดบ่อย)
 *   2. โค้ดสั้นพอที่จะตรวจสอบได้ทั้งหมด และไม่ต้องตามอัปเดตความปลอดภัย
 *
 * ใช้ Code 128 Subset B รองรับ ASCII 32-126 ซึ่งครอบคลุมรหัสช่องวาง (S-A2-3)
 * และรหัสสินค้าทุกแบบที่ร้านใช้
 */

// ตารางลายเส้นมาตรฐาน Code 128 (107 รหัส) แต่ละตัวคือความกว้าง 6 แถบสลับดำ-ขาว
const PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

const START_B = 104;
const STOP = 106;

/** คำนวณลายเส้นของ Code 128B */
function encodeCode128B(text: string): string {
  const codes: number[] = [START_B];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) {
      throw new Error(`ตัวอักษร "${ch}" ใช้กับบาร์โค้ด Code 128B ไม่ได้`);
    }
    codes.push(c - 32);
  }
  // เช็คซัม = (ค่าเริ่มต้น + ผลรวมของ ค่า x ตำแหน่ง) mod 103
  let sum = START_B;
  for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103);
  codes.push(STOP);
  return codes.map((c) => PATTERNS[c]).join("");
}

export interface BarcodeOptions {
  /** ความกว้างของแถบบางที่สุด (หน่วย px) 2 ขึ้นไปสแกนติดง่าย */
  moduleWidth?: number;
  height?: number;
  /** พิมพ์ตัวอักษรใต้บาร์โค้ดด้วย */
  showText?: boolean;
  fontSize?: number;
}

/**
 * คืนค่า SVG ของบาร์โค้ด ใช้ฝังในหน้าเว็บหรือหน้าพิมพ์ได้เลย
 * ไม่ต้องเรียก API ไม่ต้องโหลดรูป
 */
export function code128Svg(text: string, opts: BarcodeOptions = {}): string {
  const mw = opts.moduleWidth ?? 2;
  const height = opts.height ?? 60;
  const showText = opts.showText ?? true;
  const fontSize = opts.fontSize ?? 12;
  const textGap = showText ? fontSize + 4 : 0;

  const pattern = encodeCode128B(text);
  let x = 0;
  let bars = "";
  let isBar = true; // เริ่มด้วยแถบดำเสมอ

  for (const ch of pattern) {
    const w = Number(ch) * mw;
    if (isBar) {
      bars += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`;
    }
    x += w;
    isBar = !isBar;
  }

  const totalW = x;
  const totalH = height + textGap;
  const label = showText
    ? `<text x="${totalW / 2}" y="${height + fontSize}" font-family="monospace" ` +
      `font-size="${fontSize}" text-anchor="middle" fill="#000">${escapeXml(text)}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" ` +
    `viewBox="0 0 ${totalW} ${totalH}" shape-rendering="crispEdges">` +
    `<rect width="${totalW}" height="${totalH}" fill="#fff"/>${bars}${label}</svg>`
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!
  );
}
