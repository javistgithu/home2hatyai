# ไฟล์ต้นแบบสำหรับ Google Sheet

วิธีใช้:
1. สร้าง Google Sheet ใหม่ 1 ไฟล์ ตั้งชื่อว่า `home2hatyai-crm`
2. สร้างแท็บตามชื่อไฟล์ในโฟลเดอร์นี้ (faq, properties, leads, credit_cases, deals, reno_tasks, sourcing_pipeline, comps, content_calendar)
3. คัดลอกแถวหัวคอลัมน์ของแต่ละไฟล์ไปวางในแถวที่ 1 ของแท็บนั้น
4. **ลบแถวตัวอย่างออกก่อนใช้งานจริง** — ทุกไฟล์มีแถวตัวอย่าง 1 แถวเพื่อให้เห็นรูปแบบข้อมูล

## ⚠️ ข้อควรระวังด้านความปลอดภัย

| แท็บ | ระดับความอ่อนไหว | การแชร์ |
|---|---|---|
| `faq` | ต่ำ | เผยแพร่เป็น CSV สาธารณะได้ (บอทใช้ผ่าน `SHEET_CSV_URL`) |
| `properties` | ปานกลาง | เผยแพร่ได้เฉพาะเมื่อ**ตัดคอลัมน์ต้นทุนออกแล้ว** (buy_price, reno_*, gross_profit, min_price) |
| `comps`, `sourcing_pipeline`, `reno_tasks`, `deals`, `content_calendar` | สูง | แชร์ระบุอีเมลรายบุคคลเท่านั้น |
| **`leads`, `credit_cases`** | **สูงมาก (ข้อมูลการเงินส่วนบุคคล)** | **แชร์เฉพาะคนที่จำเป็นต้องใช้เท่านั้น · ห้ามเผยแพร่ · ห้ามส่งลิงก์ในแชทกลุ่ม** |

ดูข้อกำหนด PDPA เต็มใน [`../03-credit-engine.md`](../03-credit-engine.md) §3.8 และ [`../06-data-and-linebot.md`](../06-data-and-linebot.md) §6.4
