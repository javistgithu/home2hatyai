/**
 * ส่งสรุปประจำวันจากชีตเข้า LINE (ตัวเลือกเสริม)
 * ใช้ LINE Messaging API ตัวเดียวกับ LINE bot ของ home2hatyai
 *
 * วิธีติดตั้ง
 * 1. เปิด Google Sheet > Extensions > Apps Script
 * 2. วางไฟล์นี้ทับ Code.gs แล้วกด Save
 * 3. Project Settings > Script properties > เพิ่ม 2 ค่า
 *      LINE_CHANNEL_ACCESS_TOKEN = <token เดียวกับใน .env ของ LINE bot>
 *      LINE_USER_ID              = <userId ของคุณเอง (ขึ้นต้นด้วย U...)>
 *    หา userId ได้จาก log ของ /api/line-webhook ตอนคุณทักเข้า OA
 * 4. กลับมาที่ชีต > เมนู "📊 รายงาน" > "ตั้งเตือนอัตโนมัติ 20:00 น."
 */

var SHEET_DASH = 'แดชบอร์ด';
var SHEET_LOG = 'บันทึกรายวัน';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 รายงาน')
    .addItem('ส่งสรุปเข้า LINE ตอนนี้', 'sendDailyReport')
    .addItem('ตั้งเตือนอัตโนมัติ 20:00 น.', 'setupDailyTrigger')
    .addItem('ยกเลิกการเตือนอัตโนมัติ', 'removeDailyTrigger')
    .addToUi();
}

/** หาค่าจากแดชบอร์ดโดยอ้างจากข้อความในคอลัมน์ A (ทนต่อการแทรก/ลบแถว) */
function valueByLabel_(sheet, label, colIndex) {
  var labels = sheet.getRange(1, 1, sheet.getLastRow(), 1).getDisplayValues();
  for (var i = 0; i < labels.length; i++) {
    if (String(labels[i][0]).trim() === label) {
      return sheet.getRange(i + 1, colIndex).getDisplayValue();
    }
  }
  return '-';
}

function buildReport_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName(SHEET_DASH);
  if (!dash) throw new Error('ไม่พบแท็บ ' + SHEET_DASH);

  // คอลัมน์: B=วันนี้ C=7วัน D=30วัน E=เดือนนี้ F=ทั้งหมด
  var TODAY = 2, D30 = 4, MTD = 5;

  var lines = [
    '📊 สรุปวันนี้ ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy'),
    '',
    '🚦 ไฟสัญญาณ',
    valueByLabel_(dash, '1) เครื่องยนต์ธุรกิจ', TODAY),
    valueByLabel_(dash, '2) พอร์ตลงทุน', TODAY),
    valueByLabel_(dash, '3) วินัยการบันทึก', TODAY),
    '',
    '📅 วันนี้',
    '• ค่าโฆษณา ' + valueByLabel_(dash, 'ค่าโฆษณาที่ใช้ (บาท)', TODAY) + ' บาท',
    '• ทักใหม่ ' + valueByLabel_(dash, 'คนทักเข้ามาใหม่ (คน)', TODAY) + ' คน',
    '• lead คุณภาพ ' + valueByLabel_(dash, 'lead คุณภาพ (คน)', TODAY) + ' คน',
    '',
    '📈 30 วันล่าสุด',
    '• CPQL ' + valueByLabel_(dash, 'CPQL — ค่าโฆษณาต่อ lead คุณภาพ (บาท)', D30) + ' บาท',
    '• ROAS ' + valueByLabel_(dash, 'ROAS — รายได้ต่อค่าโฆษณา 1 บาท', D30),
    '• อัตราปิด ' + valueByLabel_(dash, 'อัตราปิด: lead คุณภาพ ➜ โอน', D30),
    '',
    '🎯 เป้าเดือนนี้',
    '• ทำได้แล้ว ' + valueByLabel_(dash, 'ทำได้แล้ว (บาท)', TODAY) + ' บาท',
    '• คืบหน้า ' + valueByLabel_(dash, 'ความคืบหน้า', TODAY),
    '• ขาดอีก ' + valueByLabel_(dash, 'ยังขาดอีก (บาท)', TODAY) + ' บาท',
    '• เหลือ ' + valueByLabel_(dash, 'เหลืออีกกี่วันในเดือนนี้', TODAY)
  ];

  if (!isLoggedToday_(ss)) {
    lines.push('', '⚠️ วันนี้ยังไม่ได้บันทึก — เปิดชีตกรอก 3 นาทีก่อนนอน');
  }
  return lines.join('\n');
}

function isLoggedToday_(ss) {
  var log = ss.getSheetByName(SHEET_LOG);
  if (!log) return true;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var n = log.getLastRow() - 3;
  if (n <= 0) return true;
  var rows = log.getRange(4, 1, n, 10).getValues();
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i][0];
    if (!(d instanceof Date)) continue;
    var cur = new Date(d.getTime());
    cur.setHours(0, 0, 0, 0);
    if (cur.getTime() === today.getTime()) {
      for (var c = 1; c <= 9; c++) {
        if (rows[i][c] !== '' && rows[i][c] !== null && rows[i][c] !== 0) return true;
      }
      return false;
    }
  }
  return true;
}

function sendDailyReport() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var userId = props.getProperty('LINE_USER_ID');
  var text = buildReport_();

  if (!token || !userId) {
    SpreadsheetApp.getUi().alert(
      'ยังไม่ได้ตั้งค่า Script properties\n\n' +
      'ต้องมี LINE_CHANNEL_ACCESS_TOKEN และ LINE_USER_ID\n\n' +
      'ตัวอย่างข้อความที่จะส่ง:\n\n' + text);
    return;
  }

  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: text }] }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error('LINE push failed', res.getResponseCode(), res.getContentText());
  }
}

function setupDailyTrigger() {
  removeDailyTrigger();
  ScriptApp.newTrigger('sendDailyReport')
    .timeBased().atHour(20).nearMinute(0).everyDays(1)
    .inTimezone('Asia/Bangkok').create();
  SpreadsheetApp.getUi().alert('ตั้งเตือนแล้ว — จะส่งสรุปเข้า LINE ทุกวันประมาณ 20:00 น.');
}

function removeDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyReport') ScriptApp.deleteTrigger(t);
  });
}
