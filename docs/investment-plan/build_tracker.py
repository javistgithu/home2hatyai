#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
สร้างไฟล์ .xlsx "แผนธุรกิจ + การลงทุน home2hatyai"
สำหรับอัปโหลดเข้า Google Drive แล้วแปลงเป็น Google Sheet

รันด้วย:  python3 build_tracker.py
"""
import datetime as dt
import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule, CellIsRule

OUT = os.environ.get("TRACKER_OUT", "home2hatyai-plan-tracker.xlsx")
# วันเริ่มบันทึก และจำนวนวันที่เตรียมแถวไว้ (ตั้งทับได้ด้วย env var)
START = dt.date.fromisoformat(os.environ.get("TRACKER_START", "2026-08-26"))
NDAYS = int(os.environ.get("TRACKER_DAYS", "370"))
FIRST, LAST = 3, 2 + NDAYS        # แถวข้อมูล 3..372

F = "Arial"
INK, TEAL, SKY, AMBER = "1F2937", "0F766E", "0EA5E9", "B45309"
GREEN, RED, GREY = "047857", "B91C1C", "6B7280"
H_FILL   = PatternFill("solid", fgColor="0F766E")   # หัวตาราง
S_FILL   = PatternFill("solid", fgColor="CCFBF1")   # แถบหัวข้อ
IN_FILL  = PatternFill("solid", fgColor="FEF9C3")   # ช่องกรอก
CALC_FILL= PatternFill("solid", fgColor="F1F5F9")   # ช่องคำนวณ
BAND     = PatternFill("solid", fgColor="F8FAFC")

BAHT, NUM, PCT, PCT2, DATE, MULT = '#,##0', '#,##0', '0.0%', '0%', 'dd/mm/yyyy', '0.00"x"'
THIN = Side(style="thin", color="CBD5E1")
BOX  = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

wb = Workbook()
wb.remove(wb.active)


# ---------- helpers ----------
def sheet(name, color=TEAL, grid=True):
    ws = wb.create_sheet(name)
    ws.sheet_properties.tabColor = color
    ws.sheet_view.showGridLines = grid
    return ws


def widths(ws, spec):
    for col, w in spec.items():
        ws.column_dimensions[col].width = w


def put(ws, addr, value, *, bold=False, size=11, color=INK, fill=None,
        fmt=None, align=None, wrap=False, border=False, italic=False):
    c = ws[addr]
    c.value = value
    c.font = Font(name=F, bold=bold, size=size, color=color, italic=italic)
    if fill:
        c.fill = fill
    if fmt:
        c.number_format = fmt
    c.alignment = Alignment(horizontal=align or "left", vertical="center", wrap_text=wrap)
    if border:
        c.border = BOX
    return c


def title(ws, text, sub, span="A1:H1", span2="A2:H2"):
    ws.merge_cells(span)
    put(ws, span.split(":")[0], text, bold=True, size=16, color="FFFFFF", fill=H_FILL, align="left")
    ws.row_dimensions[1].height = 34
    ws.merge_cells(span2)
    put(ws, span2.split(":")[0], sub, size=10, color=GREY, wrap=True)
    ws.row_dimensions[2].height = 30


def band(ws, row, text, span):
    ws.merge_cells(f"A{row}:{span}{row}")
    put(ws, f"A{row}", text, bold=True, size=12, color=TEAL, fill=S_FILL)
    ws.row_dimensions[row].height = 24


def table_head(ws, row, headers, start_col=1):
    for i, h in enumerate(headers):
        put(ws, f"{get_column_letter(start_col + i)}{row}", h, bold=True, size=10,
            color="FFFFFF", fill=H_FILL, align="center", wrap=True, border=True)
    ws.row_dimensions[row].height = 32


# =====================================================================
# 1) เริ่มที่นี่
# =====================================================================
ws = sheet("เริ่มที่นี่", "0F766E", grid=False)
widths(ws, {"A": 3, "B": 30, "C": 108})
title(ws, "🏠 home2hatyai — แผนทำเงิน + แผนเก็บเงิน",
      "อ่านแท็บนี้ครั้งเดียว 5 นาที แล้วใช้เวลาแค่ 3 นาที/วัน ตลอดทั้งปี",
      "A1:C1", "A2:C2")

blocks = [
    ("⚠️ ความจริงข้อแรก",
     "ไม่มีอะไรที่ 'ผลตอบแทนสูงสุด + ความเสี่ยงต่ำสุด' ในตัวเดียวกัน — นั่นคือกฎของการเงิน ไม่ใช่ความเห็น\n"
     "ใครก็ตามที่เสนอผลตอบแทนการันตี 10-20% ต่อเดือน คือแชร์ลูกโซ่ 100% ให้ปฏิเสธทันทีโดยไม่ต้องคิด\n"
     "สิ่งที่ทำได้จริงคือ 'แยกหน้าที่' — ให้ธุรกิจสร้างผลตอบแทนสูง ให้พอร์ตลงทุนทำหน้าที่ปลอดภัย"),

    ("✨ ปาฏิหาริย์ที่มีจริง",
     "ธุรกิจนายหน้าอสังหาฯ ของคุณคือธุรกิจ 'ทุนต่ำ ไม่มีสต๊อก' — ความเสี่ยงถูกจำกัดที่ค่าโฆษณาเท่านั้น\n"
     "ตัวอย่าง: ลงโฆษณา 15,000 บาท/เดือน → ปิดได้ 1 ดีล บ้าน 2.8 ล้าน คอม 3% = 84,000 บาท\n"
     "= ผลตอบแทน 5.6 เท่าของเงินที่เสี่ยง (ROAS 460%) โดยขาดทุนสูงสุดที่เป็นไปได้คือ 15,000 บาท\n"
     "ไม่มีหุ้น ไม่มีคริปโต ไม่มีกองทุนไหนให้แบบนี้ — เพราะมันต้องแลกด้วยฝีมือและแรงของคุณ นั่นคือ 'ขอบ' ของคุณ"),

    ("🔧 เครื่องยนต์ 2 ตัว",
     "เครื่องที่ 1 — ธุรกิจ (ผลตอบแทนสูง เสี่ยงจำกัด): ปั่นเงินสดจากค่าคอมมิชชัน วัดผลทุกวัน\n"
     "เครื่องที่ 2 — พอร์ตลงทุน (ผลตอบแทนพอประมาณ เสี่ยงต่ำจริง): รับกำไรจากเครื่องที่ 1 มาเก็บ\n"
     "เงินไหลทางเดียว: ธุรกิจ ➜ พอร์ต   ห้ามไหลกลับ (ห้ามถอนพอร์ตมาเติมโฆษณาเด็ดขาด)"),

    ("💧 กฎแบ่งเงิน 30/20/30/20",
     "ทุกบาทที่ได้จากค่าคอมมิชชัน แบ่งทันทีในวันที่ได้รับ ไม่ต้องคิด:\n"
     "30% → บัญชีภาษี + เงินสำรอง   |   20% → เติมกลับเข้าโฆษณา (ขยายธุรกิจ)\n"
     "30% → พอร์ตลงทุน   |   20% → ใช้จ่ายส่วนตัว (ให้รางวัลตัวเอง จะได้ทำต่อได้นาน)\n"
     "แยกบัญชีธนาคาร 4 ใบจริง ๆ — วินัยที่ใช้ 'ระบบ' ชนะวินัยที่ใช้ 'ใจ' เสมอ"),

    ("⏱️ ใช้ยังไง — 3 นาที/วัน",
     "1. เปิดแท็บ 'บันทึกรายวัน' หาแถววันนี้ (ไฮไลต์อัตโนมัติ) กรอกช่องสีเหลือง 8 ช่อง\n"
     "2. เปิดแท็บ 'แดชบอร์ด' ดูไฟสัญญาณ 3 ดวง — เขียวคือเดินต่อ แดงคือหยุดแก้ก่อนใช้เงินเพิ่ม\n"
     "3. วันที่ 1 และ 16 ของเดือน: โอนเงินเข้าพอร์ตตามกฎ แล้วบันทึกในแท็บ 'มูลค่าพอร์ตรายวัน'\n"
     "แค่นี้ ไม่ต้องทำอะไรมากกว่านี้ — ความสม่ำเสมอสำคัญกว่าความสมบูรณ์แบบ"),

    ("📑 แต่ละแท็บคืออะไร",
     "แดชบอร์ด — สรุปทุกอย่างหน้าเดียว ดูวันนี้ / 7 วัน / 30 วัน / เดือนนี้\n"
     "บันทึกรายวัน — ที่เดียวที่คุณต้องกรอกทุกวัน (เตรียมวันที่ไว้ให้ 370 วันแล้ว)\n"
     "ดีลในมือ — ท่อการขาย ใส่ลูกค้าทุกคนที่ยังไม่ปิด ระบบคำนวณมูลค่าถ่วงน้ำหนักให้\n"
     "พอร์ตลงทุน — สินทรัพย์ที่ถืออยู่ + บอกว่าต้องซื้อ/ขายอะไรเพื่อให้ตรงเป้า\n"
     "มูลค่าพอร์ตรายวัน — จดมูลค่าพอร์ต ระบบคำนวณกำไรและ Drawdown ให้\n"
     "ตั้งค่า — ตัวเลขสมมติฐานทั้งหมด แก้ที่เดียว ทั้งไฟล์เปลี่ยนตาม\n"
     "กฎเหล็ก — 15 กฎกันเจ๊ง อ่านซ้ำทุกต้นเดือน\n"
     "แผน 12 เดือน — เส้นทางเดือนต่อเดือน จากวันนี้ถึงปีหน้า"),

    ("🎨 อ่านสียังไง",
     "ช่องสีเหลือง = คุณกรอกเอง   |   ช่องสีเทา = ระบบคำนวณให้ ห้ามพิมพ์ทับ\n"
     "ตัวเลขสีน้ำเงิน = สมมติฐานที่แก้ได้   |   สีเขียว = ดี   |   สีแดง = ต้องแก้ก่อนใช้เงินเพิ่ม"),

    ("📌 ข้อควรทราบ",
     "ตัวเลขตั้งต้นทั้งหมดเป็น 'สมมติฐาน' เพื่อให้เริ่มได้ทันที — ภายใน 30 วันแรก ตัวเลขจริงของคุณ\n"
     "จะเข้ามาแทนที่ และแผนนี้จะกลายเป็นแผนของคุณจริง ๆ ไม่ใช่ของใคร\n"
     "เอกสารนี้เป็นเครื่องมือวางแผนและติดตามผล ไม่ใช่คำแนะนำการลงทุนเฉพาะบุคคล\n"
     "ก่อนซื้อผลิตภัณฑ์การเงินใด ๆ ตรวจสอบใบอนุญาตผู้ขายที่ www.sec.or.th (SEC Check First)"),
]

r = 4
for head, body in blocks:
    put(ws, f"B{r}", head, bold=True, size=12, color=TEAL, align="left", wrap=True)
    put(ws, f"C{r}", body, size=11, wrap=True)
    ws.row_dimensions[r].height = 16 * (body.count("\n") + 1) + 12
    ws[f"B{r}"].alignment = Alignment(vertical="top", wrap_text=True)
    ws[f"C{r}"].alignment = Alignment(vertical="top", wrap_text=True)
    r += 1


# =====================================================================
# 2) ตั้งค่า  (แหล่งความจริงเดียวของทั้งไฟล์)
# =====================================================================
st = sheet("ตั้งค่า", "B45309", grid=False)
widths(st, {"A": 3, "B": 46, "C": 18, "D": 62})
title(st, "⚙️ ตั้งค่าและสมมติฐาน",
      "แก้เฉพาะช่องสีเหลือง (ตัวเลขสีน้ำเงิน) — ช่องสีเทาคือสูตรคำนวณ ห้ามพิมพ์ทับ · "
      "ตัวอย่างการกรอก: ราคาทรัพย์เฉลี่ย = 2800000 , ค่าคอม = 0.03 (หมายถึง 3%)",
      "A1:D1", "A2:D2")

S = {}
row = [3]


def sec(text):
    row[0] += 1
    st.merge_cells(f"B{row[0]}:D{row[0]}")
    put(st, f"B{row[0]}", text, bold=True, size=12, color=TEAL, fill=S_FILL)
    st.row_dimensions[row[0]].height = 24


def setting(key, label, value, note="", fmt=BAHT, formula=False):
    row[0] += 1
    r_ = row[0]
    put(st, f"B{r_}", label, size=11, border=True)
    if formula:
        put(st, f"C{r_}", value, bold=True, fmt=fmt, align="right",
            fill=CALC_FILL, color=INK, border=True)
    else:
        put(st, f"C{r_}", value, bold=True, fmt=fmt, align="right",
            fill=IN_FILL, color="0000FF", border=True)
    put(st, f"D{r_}", note, size=9, color=GREY, wrap=True, border=True)
    S[key] = f"'ตั้งค่า'!$C${r_}"
    return f"$C${r_}"


sec("1 · ตัวเลขธุรกิจ (นายหน้า / lead-gen อสังหาฯ หาดใหญ่)")
c_price = setting("price", "ราคาทรัพย์เฉลี่ยต่อดีล (บาท)", 2800000,
                  "ราคาบ้าน/ทาวน์โฮมที่คุณปิดได้บ่อยที่สุดในหาดใหญ่")
c_comm = setting("comm", "อัตราค่าคอมมิชชันที่ได้รับ (%)", 0.03,
                 "ขายบ้านมือสอง 3% · โครงการจัดสรรมักได้ 2-3% · เช่า 1 เดือน", PCT)
c_share = setting("share", "ส่วนแบ่งให้ co-agent / ทีม (%)", 0.00,
                  "ถ้าแบ่งครึ่งกับนายหน้าอีกฝั่ง ใส่ 0.50", PCT)
c_net = setting("net", "➜ คอมมิชชันสุทธิต่อ 1 ดีล (บาท)",
                f"={c_price}*{c_comm}*(1-{c_share})", "คำนวณอัตโนมัติ", BAHT, True)
c_ad = setting("ad", "งบโฆษณาต่อวัน (บาท)", 500,
               "เงินก้อนเดียวที่คุณเสี่ยงจริง ๆ — ขาดทุนสูงสุดต่อเดือนคือตัวเลขนี้ x30")
c_fix = setting("fix", "ต้นทุนคงที่ต่อเดือน (บาท)", 15000,
                "ค่าน้ำมัน ค่าเน็ต ค่าเครื่องมือ ค่าจ้างแอดมิน ค่าเซิร์ฟเวอร์ LINE bot")
c_cvr = setting("cvr", "อัตราปิด: lead คุณภาพ ➜ โอน (%)", 0.03,
                "เริ่มที่ 3% ถ้ายังไม่รู้ตัวเลขจริง · แก้เป็นของจริงหลังครบ 30 วัน", PCT)
c_cpql = setting("cpql", "CPQL จริง — ค่าโฆษณาต่อ lead คุณภาพ 1 คน (บาท)", 400,
                 "แดชบอร์ดจะบอกตัวเลขจริงให้หลังบันทึกไป 7 วัน")
c_lv = setting("lv", "➜ มูลค่าของ lead คุณภาพ 1 คน (บาท)",
               f"={c_net}*{c_cvr}", "คอมสุทธิ x อัตราปิด = เงินที่ lead 1 คนมีค่าเฉลี่ย", BAHT, True)
c_cpqlmax = setting("cpqlmax", "➜ เพดาน CPQL ที่ยอมจ่ายได้ (บาท)",
                    f"={c_lv}*0.25", "จ่ายไม่เกิน 25% ของมูลค่า lead · เกินเพดาน = หยุดแอดทันที", BAHT, True)
c_days = setting("days", "จำนวนวันเฉลี่ย: lead ➜ โอนเงิน", 75,
                 "อสังหาฯ ไทยใช้เวลายื่นกู้+โอนราว 60-90 วัน — วางแผนเงินสดเผื่อไว้", NUM)

sec("2 · เป้าหมายและผลที่คาดว่าจะได้")
c_goal = setting("goal", "เป้ารายได้ค่าคอมต่อเดือน (บาท)", 150000, "ตั้งให้ท้าทายแต่เป็นไปได้")
c_ndeal = setting("ndeal", "➜ ต้องปิดกี่ดีลต่อเดือน", f"=IFERROR({c_goal}/{c_net},0)",
                  "", '0.0" ดีล"', True)
c_nlead = setting("nlead", "➜ ต้องมี lead คุณภาพกี่คนต่อเดือน",
                  f"=IFERROR({c_ndeal}/{c_cvr},0)", "", '0" คน"', True)
c_nday = setting("nday", "➜ ต้องมี lead คุณภาพกี่คนต่อวัน",
                 f"=IFERROR({c_nlead}/30,0)", "ตัวเลขนี้คือ KPI เดียวที่ต้องดูทุกวัน", '0.0" คน"', True)
c_admo = setting("admo", "➜ งบโฆษณาต่อเดือน (บาท)", f"={c_ad}*30", "", BAHT, True)
c_leadexp = setting("leadexp", "➜ lead คุณภาพที่งบนี้ควรได้ (คน/เดือน)",
                    f"=IFERROR({c_admo}/{c_cpql},0)", "", '0" คน"', True)
c_revexp = setting("revexp", "➜ รายได้ที่คาดว่าจะได้ (บาท/เดือน)",
                   f"=IFERROR({c_leadexp}*{c_cvr}*{c_net},0)", "", BAHT, True)
c_profexp = setting("profexp", "➜ กำไรสุทธิที่คาดว่าจะได้ (บาท/เดือน)",
                    f"={c_revexp}-{c_admo}-{c_fix}", "หักค่าโฆษณาและต้นทุนคงที่แล้ว", BAHT, True)
c_roas = setting("roas", "➜ ROAS — ได้กี่เท่าของค่าโฆษณา",
                 f"=IFERROR({c_revexp}/{c_admo},0)", "ต่ำกว่า 2 เท่า = ยังไม่ควรเพิ่มงบ", MULT, True)
c_budgap = setting("budgap", "➜ งบโฆษณาที่ควรใช้เพื่อถึงเป้า (บาท/เดือน)",
                   f"=IFERROR({c_nlead}*{c_cpql},0)", "ถ้าตัวเลขนี้สูงกว่างบจริงมาก แปลว่าเป้าสูงเกินกำลังทุน", BAHT, True)

sec("3 · การเงินส่วนตัวและเงินสำรอง")
c_cap = setting("cap", "ทุนตั้งต้นที่มีตอนนี้ (บาท)", 100000, "เงินเย็นที่ไม่ต้องใช้ใน 12 เดือน")
c_exp = setting("exp", "รายจ่ายจำเป็นส่วนตัวต่อเดือน (บาท)", 25000, "ค่ากิน ค่าผ่อน ค่าเทอม ค่ารักษา")
c_mon = setting("mon", "จำนวนเดือนที่ต้องมีเงินสำรอง", 6,
                "อาชีพรายได้ไม่แน่นอนอย่างนายหน้า ควร 6-12 เดือน", NUM)
c_efund = setting("efund", "➜ เงินสำรองฉุกเฉินเป้าหมาย (บาท)",
                  f"=({c_exp}+{c_fix})*{c_mon}", "ต้องเต็มก้อนนี้ก่อน ถึงจะซื้อสินทรัพย์เสี่ยงได้", BAHT, True)
c_tax = setting("tax", "ฐานภาษีเงินได้สูงสุดของคุณ (%)", 0.20,
                "ใช้คำนวณผลตอบแทนจากกองลดหย่อนภาษี · ดูขั้นบันไดที่ rd.go.th", PCT)

sec("4 · กฎแบ่งเงิน — ทุกบาทที่ได้รับ แบ่งทันที")
c_pR = setting("pR", "% เข้าบัญชีภาษี + เงินสำรอง", 0.30,
               "นายหน้าถูกหัก ณ ที่จ่าย 3-5% แต่ต้องยื่นเพิ่มตอนปลายปี กันไว้ก่อนปลอดภัยกว่า", PCT)
c_pA = setting("pA", "% เติมกลับเข้าโฆษณา (ขยายธุรกิจ)", 0.20, "ส่วนที่ทำให้เดือนหน้าโตกว่าเดือนนี้", PCT)
c_pI = setting("pI", "% เข้าพอร์ตลงทุน", 0.30, "ส่วนที่ทำให้คุณรวยแม้วันที่ไม่ได้ทำงาน", PCT)
c_pP = setting("pP", "% ใช้จ่ายส่วนตัว", 0.20, "ต้องมี ไม่งั้นทำได้ไม่เกิน 6 เดือนแล้วเลิก", PCT)
c_psum = setting("psum", "➜ รวม (ต้องได้ 100%)",
                 f"={c_pR}+{c_pA}+{c_pI}+{c_pP}", "ถ้าไม่ใช่ 100% ให้กลับไปแก้ 4 ช่องบน", PCT, True)

sec("5 · สัดส่วนพอร์ตลงทุนเป้าหมาย (ของเงินที่เหลือหลังกันเงินสำรองแล้ว)")
c_t1 = setting("t1", "ชั้น 1 · ปลอดภัย (พันธบัตร / กองตราสารหนี้ / ฝากดอกสูง)", 0.40,
               "แทบไม่ขาดทุน · คาดหวัง 1.5-3% ต่อปี", PCT)
c_t2 = setting("t2", "ชั้น 2 · รายได้ประจำ (หุ้นกู้เรตติ้งดี / REIT / กองปันผล)", 0.25,
               "ผันผวนน้อย มีกระแสเงินสด · คาดหวัง 4-6% ต่อปี", PCT)
c_t3 = setting("t3", "ชั้น 3 · เติบโต (กองทุนดัชนีหุ้นโลก ทยอยซื้อ DCA)", 0.25,
               "ผันผวนแรง ติดลบ 30% ได้ · แต่ระยะ 10 ปีขึ้นไปคาดหวัง 7-8% ต่อปี", PCT)
c_t4 = setting("t4", "ชั้น 4 · ลดหย่อนภาษี (Thai ESG / SSF / RMF)", 0.10,
               "ผลตอบแทนจากภาษีคืนเท่ากับฐานภาษีคุณ = ของจริงที่ใกล้เคียง 'ฟรี' ที่สุด", PCT)
c_tsum = setting("tsum", "➜ รวม (ต้องได้ 100%)", f"={c_t1}+{c_t2}+{c_t3}+{c_t4}", "", PCT, True)
c_r1 = setting("r1", "ผลตอบแทนคาดหวังชั้น 1 (%/ปี)", 0.025, "", PCT)
c_r2 = setting("r2", "ผลตอบแทนคาดหวังชั้น 2 (%/ปี)", 0.050, "", PCT)
c_r3 = setting("r3", "ผลตอบแทนคาดหวังชั้น 3 (%/ปี)", 0.075, "", PCT)
c_r4 = setting("r4", "ผลตอบแทนคาดหวังชั้น 4 (%/ปี)", 0.070, "ยังไม่รวมภาษีคืน", PCT)
c_blend = setting("blend", "➜ ผลตอบแทนพอร์ตรวมที่คาดหวัง (%/ปี)",
                  f"=({c_t1}*{c_r1})+({c_t2}*{c_r2})+({c_t3}*{c_r3})+({c_t4}*{c_r4})",
                  "ตัวเลขจริงที่ยั่งยืน — ถ้าใครบอกว่าได้มากกว่านี้แบบไม่เสี่ยง คือหลอก", PCT, True)
c_blendtax = setting("blendtax", "➜ บวกผลจากภาษีคืนปีแรก (%/ปี)",
                     f"={c_blend}+({c_t4}*{c_tax})",
                     "เฉพาะปีที่ซื้อกองลดหย่อน · นี่คือ 'ปาฏิหาริย์' ที่คำนวณได้จริง", PCT, True)

# เตือนถ้าสัดส่วนไม่ครบ 100%
for cell in (c_psum, c_tsum):
    st.conditional_formatting.add(
        cell.replace("$", ""),
        CellIsRule(operator="notEqual", formula=["1"],
                   fill=PatternFill("solid", fgColor="FEE2E2"),
                   font=Font(name=F, bold=True, color=RED)))


# =====================================================================
# 3) บันทึกรายวัน
# =====================================================================
R0 = 4
R1 = R0 + NDAYS - 1          # 4..373
dl = sheet("บันทึกรายวัน", "0EA5E9")
widths(dl, {"A": 12, "B": 11, "C": 10, "D": 11, "E": 10, "F": 9, "G": 10, "H": 9,
            "I": 13, "J": 11, "K": 13, "L": 10, "M": 11, "N": 13, "O": 16, "P": 30,
            "R": 24, "S": 12})
title(dl, "📅 บันทึกรายวัน — กรอกแค่ช่องสีเหลือง 3 นาที/วัน",
      "แถวของวันนี้จะไฮไลต์สีส้มอัตโนมัติ · ช่องสีเทาคือสูตร ห้ามพิมพ์ทับ · "
      "ตัวอย่าง 1 วัน: ค่าโฆษณา 500 | ทักใหม่ 6 | lead คุณภาพ 2 | นัดดู 1 | ยื่นกู้ 0 | อนุมัติ 0 | โอน 0 | รายได้ 0",
      "A1:P1", "A2:P2")

DHEAD = ["วันที่", "ค่าโฆษณา\n(บาท)", "ทักใหม่\n(คน)", "lead คุณภาพ\n(คน)", "นัดดูบ้าน\n(ครั้ง)",
         "ยื่นกู้\n(ราย)", "อนุมัติกู้\n(ราย)", "โอน/ปิดดีล\n(ดีล)", "รายได้รับจริง\n(บาท)",
         "ต้นทุนอื่น\n(บาท)", "กำไรวันนี้\n(บาท)", "CPL\n(บาท/ทัก)", "CPQL\n(บาท/lead)",
         "ควรโอนเข้าพอร์ต\n(บาท)", "สถานะวินัย", "หมายเหตุ / บทเรียนวันนี้"]
table_head(dl, 3, DHEAD)

# บล็อกค่าอ้างอิง (ใช้กับ conditional formatting ซึ่งอ้างข้ามชีตไม่ได้ใน Google Sheets)
put(dl, "R3", "ค่าอ้างอิงอัตโนมัติ — อย่าลบ", bold=True, size=10, color="FFFFFF", fill=H_FILL, border=True)
put(dl, "S3", "ค่า", bold=True, size=10, color="FFFFFF", fill=H_FILL, align="center", border=True)
for i, (lab, ref, fmt) in enumerate([
        ("เป้า lead คุณภาพ/วัน", S["nday"], '0.0'),
        ("เพดาน CPQL (บาท)", S["cpqlmax"], BAHT),
        ("% กำไรเข้าพอร์ต", S["pI"], PCT)]):
    rr = 4 + i
    put(dl, f"R{rr}", lab, size=10, border=True)
    put(dl, f"S{rr}", f"={ref}", bold=True, fmt=fmt, align="right",
        color=GREEN, fill=CALC_FILL, border=True)

IN_COLS = "BCDEFGHIJP"
for i in range(NDAYS):
    r = R0 + i
    d = START + dt.timedelta(days=i)
    put(dl, f"A{r}", d, fmt=DATE, align="center", border=True, size=10,
        bold=(d.day == 1), fill=IN_FILL if False else None)
    for col in IN_COLS:
        put(dl, f"{col}{r}", None, fmt=(BAHT if col in "BIJ" else NUM) if col != "P" else None,
            align="right" if col != "P" else "left", fill=IN_FILL, border=True, size=10)
    put(dl, f"K{r}", f"=I{r}-B{r}-J{r}", fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(dl, f"L{r}", f'=IFERROR(B{r}/C{r},"")', fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(dl, f"M{r}", f'=IFERROR(B{r}/D{r},"")', fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(dl, f"N{r}", f"=ROUND(I{r}*$S$6,0)", fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(dl, f"O{r}",
        f'=IF(A{r}>TODAY(),"—",'
        f'IF(SUM(B{r}:J{r})=0,"⬜ ยังไม่บันทึก",'
        f'IF(AND(D{r}>=$S$4,IFERROR(B{r}/D{r},0)<=$S$5),"✅ ผ่าน","⚠️ ต้องปรับ")))',
        align="center", fill=CALC_FILL, border=True, size=10)

dl.freeze_panes = "B4"
dl.auto_filter.ref = f"A3:P{R1}"

rng_all = f"A{R0}:P{R1}"
dl.conditional_formatting.add(rng_all, FormulaRule(
    formula=[f"$A{R0}=TODAY()"], fill=PatternFill("solid", fgColor="FEF3C7"), stopIfTrue=False))
dl.conditional_formatting.add(rng_all, FormulaRule(
    formula=[f"WEEKDAY($A{R0},2)>5"], fill=PatternFill("solid", fgColor="F1F5F9")))
dl.conditional_formatting.add(f"M{R0}:M{R1}", FormulaRule(
    formula=[f'AND($M{R0}<>"",$M{R0}>$S$5)'], font=Font(name=F, bold=True, color=RED)))
dl.conditional_formatting.add(f"M{R0}:M{R1}", FormulaRule(
    formula=[f'AND($M{R0}<>"",$M{R0}<=$S$5)'], font=Font(name=F, bold=True, color=GREEN)))
dl.conditional_formatting.add(f"K{R0}:K{R1}", CellIsRule(
    operator="lessThan", formula=["0"], font=Font(name=F, color=RED)))
dl.conditional_formatting.add(f"O{R0}:O{R1}", FormulaRule(
    formula=[f'ISNUMBER(SEARCH("✅",$O{R0}))'], font=Font(name=F, bold=True, color=GREEN)))
dl.conditional_formatting.add(f"O{R0}:O{R1}", FormulaRule(
    formula=[f'ISNUMBER(SEARCH("⚠️",$O{R0}))'], font=Font(name=F, bold=True, color=RED)))


# =====================================================================
# 4) แดชบอร์ด
# =====================================================================
DL, PD, PF = "'บันทึกรายวัน'", "'มูลค่าพอร์ตรายวัน'", "'พอร์ตลงทุน'"
DATES = f"{DL}!$A${R0}:$A${R1}"
CC = lambda x: f"{DL}!${x}${R0}:${x}${R1}"
PERIODS = [
    ("วันนี้",   lambda c: f"=SUMIFS({CC(c)},{DATES},TODAY())"),
    ("7 วันล่าสุด", lambda c: f'=SUMIFS({CC(c)},{DATES},">="&TODAY()-6,{DATES},"<="&TODAY())'),
    ("30 วันล่าสุด", lambda c: f'=SUMIFS({CC(c)},{DATES},">="&TODAY()-29,{DATES},"<="&TODAY())'),
    ("เดือนนี้",  lambda c: f'=SUMIFS({CC(c)},{DATES},">="&EOMONTH(TODAY(),-1)+1,{DATES},"<="&TODAY())'),
    ("ตั้งแต่เริ่ม", lambda c: f'=SUMIFS({CC(c)},{DATES},"<="&TODAY())'),
]

db = sheet("แดชบอร์ด", "047857", grid=False)
widths(db, {"A": 38, "B": 15, "C": 15, "D": 15, "E": 15, "F": 15, "G": 46})
title(db, "📊 แดชบอร์ด — ดูวันละ 30 วินาที",
      "ทุกตัวเลขคำนวณจากแท็บ 'บันทึกรายวัน' และ 'มูลค่าพอร์ตรายวัน' อัตโนมัติ · ไม่ต้องกรอกอะไรในหน้านี้",
      "A1:G1", "A2:G2")

d = [3]
def nxt():
    d[0] += 1
    return d[0]

# --- ไฟสัญญาณ ---
sig_row = nxt()
band(db, sig_row, "🚦 ไฟสัญญาณ 3 ดวง", "G")
h = nxt()
for i, t in enumerate(["ด้าน", "สถานะ", "", "", "", "", "ทำอะไรต่อ"]):
    if t:
        put(db, f"{get_column_letter(1+i)}{h}", t, bold=True, size=10, color="FFFFFF",
            fill=H_FILL, border=True)
sig = {}
for label in ["1) เครื่องยนต์ธุรกิจ", "2) พอร์ตลงทุน", "3) วินัยการบันทึก"]:
    rr = nxt()
    put(db, f"A{rr}", label, bold=True, size=11, border=True)
    db.merge_cells(f"B{rr}:F{rr}")
    sig[label] = rr
    db.row_dimensions[rr].height = 22

# --- ตารางตัวชี้วัด ---
nxt()
mt = nxt()
band(db, mt, "📈 ตัวชี้วัดหลัก", "G")
hh = nxt()
put(db, f"A{hh}", "ตัวชี้วัด", bold=True, size=10, color="FFFFFF", fill=H_FILL, border=True)
for i, (nm, _) in enumerate(PERIODS):
    put(db, f"{get_column_letter(2+i)}{hh}", nm, bold=True, size=10, color="FFFFFF",
        fill=H_FILL, align="center", border=True)
put(db, f"G{hh}", "เป้าหมาย / เกณฑ์", bold=True, size=10, color="FFFFFF", fill=H_FILL, border=True)

M = {}
METRICS = [
    ("ad",    "ค่าโฆษณาที่ใช้ (บาท)", "B", BAHT, ""),
    ("chat",  "คนทักเข้ามาใหม่ (คน)", "C", NUM, ""),
    ("lead",  "lead คุณภาพ (คน)", "D", NUM, "เป้า/วัน อยู่ในแท็บ ตั้งค่า"),
    ("visit", "นัดดูบ้าน (ครั้ง)", "E", NUM, ""),
    ("loan",  "ยื่นกู้ (ราย)", "F", NUM, ""),
    ("appr",  "อนุมัติกู้ (ราย)", "G", NUM, ""),
    ("deal",  "โอน / ปิดดีล (ดีล)", "H", NUM, ""),
    ("rev",   "รายได้ค่าคอมที่รับจริง (บาท)", "I", BAHT, ""),
    ("prof",  "กำไรสุทธิ (บาท)", "K", BAHT, "รายได้ − ค่าโฆษณา − ต้นทุนอื่น"),
]
for key, label, col, fmt, note in METRICS:
    rr = nxt()
    M[key] = rr
    put(db, f"A{rr}", label, size=11, border=True)
    for i, (_, fn) in enumerate(PERIODS):
        put(db, f"{get_column_letter(2+i)}{rr}", fn(col), fmt=fmt, align="right",
            fill=CALC_FILL, border=True, size=10)
    put(db, f"G{rr}", note, size=9, color=GREY, border=True)

DER = [
    ("cpql", "CPQL — ค่าโฆษณาต่อ lead คุณภาพ (บาท)",
     lambda c: f"=IFERROR({c}{M['ad']}/{c}{M['lead']},0)", BAHT,
     f"ต้องต่ำกว่าเพดานในแท็บ ตั้งค่า"),
    ("roas", "ROAS — รายได้ต่อค่าโฆษณา 1 บาท",
     lambda c: f"=IFERROR({c}{M['rev']}/{c}{M['ad']},0)", MULT,
     "≥ 3 เท่า = เพิ่มงบได้ · < 1.5 เท่า = หยุดแก้ก่อน"),
    ("cvr", "อัตราปิด: lead คุณภาพ ➜ โอน",
     lambda c: f"=IFERROR({c}{M['deal']}/{c}{M['lead']},0)", PCT,
     "ตัวเลขจริงของคุณ — เอาไปแก้ในแท็บ ตั้งค่า หลังครบ 30 วัน"),
]
for key, label, fn, fmt, note in DER:
    rr = nxt()
    M[key] = rr
    put(db, f"A{rr}", label, size=11, bold=True, border=True)
    for i in range(len(PERIODS)):
        c = get_column_letter(2+i)
        put(db, f"{c}{rr}", fn(c), fmt=fmt, align="right", fill=CALC_FILL, border=True, size=10)
    put(db, f"G{rr}", note, size=9, color=GREY, border=True)

db.conditional_formatting.add(f"B{M['roas']}:F{M['roas']}", CellIsRule(
    operator="greaterThanOrEqual", formula=["3"], font=Font(name=F, bold=True, color=GREEN)))
db.conditional_formatting.add(f"B{M['roas']}:F{M['roas']}", CellIsRule(
    operator="between", formula=["0.0001", "1.5"], font=Font(name=F, bold=True, color=RED)))

# --- ท่อการขาย 30 วัน ---
nxt()
fr = nxt()
band(db, fr, "🔻 ท่อการขาย 30 วันล่าสุด — ตรงไหนรั่วมากที่สุด", "G")
FUNNEL = [
    ("ทักเข้ามา ➜ lead คุณภาพ", "lead", "chat", "ต่ำกว่า 25% = คอนเทนต์ดึงคนผิดกลุ่ม"),
    ("lead คุณภาพ ➜ นัดดูบ้าน", "visit", "lead", "ต่ำกว่า 40% = ตอบช้า หรือคัดกรองไม่ตรงงบลูกค้า"),
    ("นัดดูบ้าน ➜ ยื่นกู้", "loan", "visit", "ต่ำกว่า 30% = ทรัพย์ไม่ตรงความต้องการ"),
    ("ยื่นกู้ ➜ อนุมัติ", "appr", "loan", "ต่ำกว่า 50% = ต้องพรีเช็คเครดิตลูกค้าก่อนพาดู"),
    ("อนุมัติ ➜ โอน", "deal", "appr", "ต่ำกว่า 80% = ปัญหาเอกสาร/ผู้ขาย ต้องตามใกล้ชิด"),
]
for label, num, den, note in FUNNEL:
    rr = nxt()
    put(db, f"A{rr}", label, size=11, border=True)
    db.merge_cells(f"B{rr}:C{rr}")
    put(db, f"B{rr}", f"=IFERROR(D{M[num]}/D{M[den]},0)", fmt=PCT, bold=True,
        align="center", fill=CALC_FILL, border=True)
    db.merge_cells(f"D{rr}:F{rr}")
    put(db, f"D{rr}", f'=IF(D{M[den]}=0,"ยังไม่มีข้อมูล",D{M[num]}&" จาก "&D{M[den]})',
        size=10, align="center", color=GREY, border=True)
    put(db, f"G{rr}", note, size=9, color=GREY, wrap=True, border=True)

# --- เป้าหมายเดือนนี้ ---
nxt()
gr = nxt()
band(db, gr, "🎯 เป้าหมายเดือนนี้", "G")
GOALS = [
    ("เป้ารายได้ค่าคอมเดือนนี้ (บาท)", f"={S['goal']}", BAHT, ""),
    ("ทำได้แล้ว (บาท)", f"=E{M['rev']}", BAHT, ""),
    ("ความคืบหน้า", f"=IFERROR(E{M['rev']}/{S['goal']},0)", PCT, "แถบสีเขียวเมื่อถึง 100%"),
    ("ยังขาดอีก (บาท)", f"=MAX(0,{S['goal']}-E{M['rev']})", BAHT, ""),
    ("เหลืออีกกี่วันในเดือนนี้", "=EOMONTH(TODAY(),0)-TODAY()", '0" วัน"', ""),
    ("ต้องหา lead คุณภาพอีก (คน)",
     f"=MAX(0,ROUND(IFERROR(MAX(0,{S['goal']}-E{M['rev']})/({S['net']}*{S['cvr']}),0),0))",
     '#,##0" คน"', "คำนวณจากคอมสุทธิต่อดีล x อัตราปิด ในแท็บ ตั้งค่า"),
    ("งบโฆษณาที่ต้องใช้เพื่อปิดช่องว่าง (บาท)",
     f"=MAX(0,ROUND(IFERROR(MAX(0,{S['goal']}-E{M['rev']})/({S['net']}*{S['cvr']}),0)*{S['cpql']},0))",
     BAHT, "ถ้าเกินเงินที่มี = ลดเป้า อย่ากู้มาเติม"),
]
gp = None
for label, fml, fmt, note in GOALS:
    rr = nxt()
    put(db, f"A{rr}", label, size=11, border=True)
    db.merge_cells(f"B{rr}:C{rr}")
    put(db, f"B{rr}", fml, fmt=fmt, bold=True, align="center", fill=CALC_FILL, border=True)
    db.merge_cells(f"D{rr}:F{rr}")
    put(db, f"D{rr}", "", border=True)
    put(db, f"G{rr}", note, size=9, color=GREY, wrap=True, border=True)
    if label == "ความคืบหน้า":
        gp = rr
db.conditional_formatting.add(f"B{gp}:C{gp}", CellIsRule(
    operator="greaterThanOrEqual", formula=["1"], font=Font(name=F, bold=True, color=GREEN)))

# --- สุขภาพการเงิน + พอร์ต ---
nxt()
hr = nxt()
band(db, hr, "🛡️ สุขภาพการเงินและพอร์ตลงทุน", "G")
PVAL = f'IFERROR(LOOKUP(2,1/({PD}!$B${R0}:$B${R1}<>""),{PD}!$B${R0}:$B${R1}),0)'
PCOST = f'IFERROR(LOOKUP(2,1/({PD}!$B${R0}:$B${R1}<>""),{PD}!$D${R0}:$D${R1}),0)'
PDD = f'IFERROR(LOOKUP(2,1/({PD}!$B${R0}:$B${R1}<>""),{PD}!$G${R0}:$G${R1}),0)'
EFUND_NOW = f"SUMIF({PF}!$A$4:$A$23,0,{PF}!$F$4:$F$23)"
HEALTH = [
    ("efnow", "เงินสำรองฉุกเฉินที่มีตอนนี้ (บาท)", f"={EFUND_NOW}", BAHT,
     "= ผลรวมชั้น 0 ในแท็บ พอร์ตลงทุน"),
    ("eftar", "เงินสำรองฉุกเฉินเป้าหมาย (บาท)", f"={S['efund']}", BAHT, ""),
    ("efpct", "เงินสำรองเต็มแล้วกี่ %", f"=IFERROR({EFUND_NOW}/{S['efund']},0)", PCT,
     "ต้องถึง 100% ก่อนซื้อสินทรัพย์ชั้น 3"),
    ("runway", "อยู่ได้กี่เดือนถ้ารายได้เป็นศูนย์",
     f"=IFERROR({EFUND_NOW}/({S['exp']}+{S['fix']}),0)", '0.0" เดือน"', "ต่ำกว่า 3 เดือน = อันตราย"),
    ("pval", "มูลค่าพอร์ตลงทุนปัจจุบัน (บาท)", f"={PVAL}", BAHT, "จากแท็บ มูลค่าพอร์ตรายวัน"),
    ("pcost", "เงินต้นที่ใส่เข้าพอร์ตสะสม (บาท)", f"={PCOST}", BAHT, ""),
    ("ppl", "กำไร / ขาดทุนพอร์ต (บาท)", f"={PVAL}-{PCOST}", BAHT, ""),
    ("pplp", "กำไร / ขาดทุนพอร์ต (%)", f"=IFERROR(({PVAL}-{PCOST})/{PCOST},0)", PCT, ""),
    ("pdd", "Drawdown จากจุดสูงสุด", f"={PDD}", PCT,
     "ติดลบเกิน 20% ถือเป็นเรื่องปกติของชั้น 3 — ห้ามขาย ให้ซื้อต่อตามแผน"),
    ("pin", "ควรโอนเข้าพอร์ตเดือนนี้ (บาท)", f"=ROUND(E{M['rev']}*{S['pI']},0)", BAHT,
     "โอนวันที่ 1 และ 16 ครั้งละครึ่ง"),
    ("proj", "ประมาณการมูลค่าพอร์ตอีก 12 เดือน (บาท)",
     f"=ROUND({PVAL}*(1+{S['blend']})+({S['revexp']}*{S['pI']})*12*(1+{S['blend']}/2),0)", BAHT,
     "ประมาณการจากสมมติฐาน ไม่ใช่คำรับประกัน"),
]
H = {}
for key, label, fml, fmt, note in HEALTH:
    rr = nxt()
    H[key] = rr
    put(db, f"A{rr}", label, size=11, border=True)
    db.merge_cells(f"B{rr}:C{rr}")
    put(db, f"B{rr}", fml, fmt=fmt, bold=True, align="center", fill=CALC_FILL, border=True)
    db.merge_cells(f"D{rr}:F{rr}")
    put(db, f"D{rr}", "", border=True)
    put(db, f"G{rr}", note, size=9, color=GREY, wrap=True, border=True)
for k, good, bad in [("efpct", "1", "0.5"), ("runway", "6", "3")]:
    db.conditional_formatting.add(f"B{H[k]}:C{H[k]}", CellIsRule(
        operator="greaterThanOrEqual", formula=[good], font=Font(name=F, bold=True, color=GREEN)))
    db.conditional_formatting.add(f"B{H[k]}:C{H[k]}", CellIsRule(
        operator="lessThan", formula=[bad], font=Font(name=F, bold=True, color=RED)))

# --- เติมไฟสัญญาณ (อ้างถึงแถวด้านล่างที่สร้างเสร็จแล้ว) ---
r_biz = sig["1) เครื่องยนต์ธุรกิจ"]
put(db, f"B{r_biz}",
    f'=IF(D{M["ad"]}=0,"⬜ ยังไม่มีข้อมูล — เริ่มบันทึกก่อน",'
    f'IF(D{M["roas"]}>=3,"🟢 แข็งแรง — เพิ่มงบโฆษณาได้ไม่เกิน 20%",'
    f'IF(D{M["roas"]}>=1.5,"🟡 พอไปได้ — คงงบเดิม ปรับคอนเทนต์ก่อน",'
    f'"🔴 หยุด — อย่าเพิ่งเพิ่มงบ แก้กลุ่มเป้าหมาย/คอนเทนต์ก่อน")))',
    bold=True, size=12, align="center", fill=CALC_FILL, border=True)
put(db, f"G{r_biz}", "วัดจาก ROAS 30 วันล่าสุด", size=9, color=GREY, border=True)

r_pf = sig["2) พอร์ตลงทุน"]
put(db, f"B{r_pf}",
    f'=IF({PVAL}=0,"⬜ ยังไม่มีพอร์ต — เริ่มที่เงินสำรองก่อน",'
    f'IF({PDD}>=-0.05,"🟢 ปกติ — ทำตามแผน DCA ต่อ",'
    f'IF({PDD}>=-0.15,"🟡 ย่อตัวตามปกติ — ห้ามขาย ซื้อต่อตามแผน",'
    f'"🔴 ตลาดลงแรง — นี่คือช่วงที่ต้องซื้อ ไม่ใช่ขาย")))',
    bold=True, size=12, align="center", fill=CALC_FILL, border=True)
put(db, f"G{r_pf}", "วัดจาก Drawdown ปัจจุบัน", size=9, color=GREY, border=True)

r_dis = sig["3) วินัยการบันทึก"]
DISC = (f'IFERROR(COUNTIFS({DATES},">="&TODAY()-6,{DATES},"<="&TODAY(),'
        f'{DL}!$O${R0}:$O${R1},"✅*")/7,0)')
put(db, f"B{r_dis}",
    f'=IF({DISC}>=0.85,"🟢 ยอดเยี่ยม — บันทึกครบเกือบทุกวัน",'
    f'IF({DISC}>=0.5,"🟡 ยังขาดบางวัน — ตั้งเตือน 21:00 น.",'
    f'"🔴 ขาดวินัย — แผนดีแค่ไหนก็ไม่ช่วย ถ้าไม่วัดผล"))',
    bold=True, size=12, align="center", fill=CALC_FILL, border=True)
put(db, f"G{r_dis}", "นับจาก 7 วันล่าสุดที่สถานะ = ผ่าน", size=9, color=GREY, border=True)


# =====================================================================
# 5) ดีลในมือ (ท่อการขาย)
# =====================================================================
dp = sheet("ดีลในมือ", "7C3AED")
widths(dp, {"A": 10, "B": 20, "C": 16, "D": 26, "E": 14, "F": 15, "G": 11, "H": 14,
            "I": 16, "J": 12, "K": 12, "L": 10, "M": 30, "N": 12, "P": 16, "Q": 10})
title(dp, "📦 ดีลในมือ — ท่อการขาย",
      "ใส่ลูกค้าทุกคนที่ยังไม่ปิด · เลือกสถานะจากเมนู ระบบคำนวณโอกาสสำเร็จและมูลค่าถ่วงน้ำหนักให้ · "
      "ตัวอย่างแถว: D001 | คุณเอ | LINE OA | บ้านกลางเมือง ซอย 9 | 2900000 | นัดดูแล้ว | 26/08/2026",
      "A1:N1", "A2:N2")
band(dp, 3, "สรุปท่อการขาย ณ วันนี้", "N")
DR0, DR1 = 7, 66
SUMM = [
    ("A4", "ดีลที่ยังเปิดอยู่", "B4",
     f'=COUNTIFS($F${DR0}:$F${DR1},"<>",$F${DR0}:$F${DR1},"<>โอนแล้ว",$F${DR0}:$F${DR1},"<>หลุด/ปิด")',
     '#,##0" ดีล"'),
    ("C4", "มูลค่าคอมรวมในท่อ (บาท)", "D4",
     f'=SUMIFS($H${DR0}:$H${DR1},$F${DR0}:$F${DR1},"<>โอนแล้ว",$F${DR0}:$F${DR1},"<>หลุด/ปิด")', BAHT),
    ("E4", "คาดว่าจะได้จริง — ถ่วงน้ำหนัก (บาท)", "F4",
     f'=SUMIFS($I${DR0}:$I${DR1},$F${DR0}:$F${DR1},"<>โอนแล้ว",$F${DR0}:$F${DR1},"<>หลุด/ปิด")', BAHT),
    ("G4", "ปิดได้แล้วรวม (บาท)", "H4",
     f'=SUMIFS($H${DR0}:$H${DR1},$F${DR0}:$F${DR1},"โอนแล้ว")', BAHT),
]
for lab_a, lab, val_a, fml, fmt in SUMM:
    put(dp, lab_a, lab, size=10, color=GREY, border=True)
    put(dp, val_a, fml, bold=True, size=12, fmt=fmt, align="right", fill=CALC_FILL, border=True)
dp.row_dimensions[4].height = 24

PHEAD = ["รหัสดีล", "ชื่อลูกค้า", "ช่องทางที่มา", "ทรัพย์ / โครงการ", "ราคาทรัพย์\n(บาท)", "สถานะ",
         "โอกาส\nสำเร็จ", "คอมคาดหวัง\n(บาท)", "มูลค่าถ่วงน้ำหนัก\n(บาท)", "วันที่เริ่มคุย",
         "คาดว่าจะโอน", "อายุดีล\n(วัน)", "ต้องทำอะไรต่อ", "อัปเดตล่าสุด"]
table_head(dp, 6, PHEAD)
put(dp, "P6", "สถานะ", bold=True, size=10, color="FFFFFF", fill=H_FILL, border=True)
put(dp, "Q6", "โอกาส", bold=True, size=10, color="FFFFFF", fill=H_FILL, align="center", border=True)
STATUS = [("ทักเข้ามา", 0.05), ("คัดกรองแล้ว", 0.15), ("นัดดูแล้ว", 0.30), ("สนใจจริง", 0.45),
          ("ยื่นกู้แล้ว", 0.65), ("อนุมัติแล้ว", 0.85), ("โอนแล้ว", 1.00), ("หลุด/ปิด", 0.00)]
for i, (nm, p) in enumerate(STATUS):
    put(dp, f"P{7+i}", nm, size=10, border=True)
    put(dp, f"Q{7+i}", p, fmt=PCT2, align="center", border=True, size=10)

dv_st = DataValidation(type="list", formula1=f"=$P$7:$P${6+len(STATUS)}", allow_blank=True,
                       showDropDown=False)
dp.add_data_validation(dv_st)
for r in range(DR0, DR1 + 1):
    for col in "ABCDJMN":
        put(dp, f"{col}{r}", None, fill=IN_FILL, border=True, size=10,
            fmt=DATE if col in "JN" else None, align="center" if col in "AJN" else "left")
    put(dp, f"E{r}", None, fmt=BAHT, align="right", fill=IN_FILL, border=True, size=10)
    put(dp, f"F{r}", None, fill=IN_FILL, border=True, size=10, align="center")
    put(dp, f"G{r}", f'=IFERROR(INDEX($Q$7:$Q${6+len(STATUS)},MATCH($F{r},$P$7:$P${6+len(STATUS)},0)),"")',
        fmt=PCT2, align="center", fill=CALC_FILL, border=True, size=10)
    put(dp, f"H{r}", f'=IF($E{r}="","",ROUND($E{r}*{S["comm"]}*(1-{S["share"]}),0))',
        fmt=BAHT, align="right", fill=CALC_FILL, border=True, size=10)
    put(dp, f"I{r}", f'=IFERROR(ROUND($H{r}*$G{r},0),"")', fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(dp, f"K{r}", f'=IF($J{r}="","",$J{r}+{S["days"]})', fmt=DATE, align="center",
        fill=CALC_FILL, border=True, size=10)
    put(dp, f"L{r}", f'=IF($J{r}="","",TODAY()-$J{r})', fmt=NUM, align="center",
        fill=CALC_FILL, border=True, size=10)
    dv_st.add(dp[f"F{r}"])
dp.freeze_panes = "C7"
dp.conditional_formatting.add(f"A{DR0}:N{DR1}", FormulaRule(
    formula=[f'$F{DR0}="โอนแล้ว"'], fill=PatternFill("solid", fgColor="DCFCE7")))
dp.conditional_formatting.add(f"A{DR0}:N{DR1}", FormulaRule(
    formula=[f'$F{DR0}="หลุด/ปิด"'], font=Font(name=F, color="9CA3AF", strike=True)))
# ค่าอ้างอิงในชีตเดียวกัน — Google Sheets ไม่รองรับการอ้างข้ามชีตใน conditional formatting
put(dp, "P16", "เกณฑ์ดีลค้างนาน (วัน)", size=10, color=GREY, border=True)
put(dp, "Q16", f"=ROUND({S['days']}*1.5,0)", fmt=NUM, bold=True, align="center",
    color=GREEN, fill=CALC_FILL, border=True)
dp.conditional_formatting.add(f"L{DR0}:L{DR1}", CellIsRule(
    operator="greaterThan", formula=["$Q$16"],
    fill=PatternFill("solid", fgColor="FEE2E2"), font=Font(name=F, bold=True, color=RED)))


# =====================================================================
# 6) พอร์ตลงทุน
# =====================================================================
pf = sheet("พอร์ตลงทุน", "1D4ED8")
widths(pf, {"A": 8, "B": 40, "C": 20, "D": 16, "E": 15, "F": 15, "G": 14, "H": 11,
            "I": 12, "J": 14, "K": 46})
title(pf, "💰 พอร์ตลงทุน — ชั้นความเสี่ยง 0-4",
      "แถว 4-13 คือ 'เมนูสินทรัพย์' ที่เตรียมไว้ให้ (ยอดเป็น 0 อยู่) — ใส่ยอดจริงลงไป หรือลบทิ้งแล้วพิมพ์ของคุณเอง · "
      "ชั้น 0 = เงินสำรองฉุกเฉิน ต้องเต็มก่อนถึงจะขึ้นชั้น 3 ได้",
      "A1:K1", "A2:K2")
FHEAD = ["ชั้น", "ชื่อสินทรัพย์", "ประเภท", "ระดับความเสี่ยง", "เงินต้นที่ลง\n(บาท)",
         "มูลค่าปัจจุบัน\n(บาท)", "กำไร/ขาดทุน\n(บาท)", "% กำไร", "% ของพอร์ต",
         "ผลตอบแทน\nคาดหวัง/ปี", "หมายเหตุ / ข้อควรระวัง"]
table_head(pf, 3, FHEAD)
FR0, FR1 = 4, 23
ASSETS = [
    (0, "บัญชีเงินฝากดอกเบี้ยสูง / e-Savings", "เงินสด", "ต่ำมาก", 0.015,
     "เงินสำรองฉุกเฉิน ถอนได้ทันที · เลือกธนาคารในความคุ้มครองของสถาบันคุ้มครองเงินฝาก"),
    (0, "กองทุนตลาดเงิน (Money Market)", "กองทุนรวม", "ต่ำมาก", 0.018,
     "สภาพคล่องสูง ขายได้เงินวันทำการถัดไป · ใช้พักเงินก้อนที่รอโอกาส"),
    (1, "พันธบัตรออมทรัพย์รัฐบาล", "ตราสารหนี้ภาครัฐ", "ต่ำมาก", 0.025,
     "ความเสี่ยงต่ำที่สุดในประเทศ · เปิดขายเป็นรอบ ซื้อผ่านแอปธนาคารตัวแทน"),
    (1, "กองทุนตราสารหนี้ระยะสั้น", "กองทุนรวม", "ต่ำ", 0.022,
     "เลือกกองที่ค่าธรรมเนียมต่ำ · ค่าธรรมเนียมคือสิ่งเดียวที่คุณควบคุมได้ 100%"),
    (2, "หุ้นกู้เอกชนเรตติ้ง A ขึ้นไป", "ตราสารหนี้เอกชน", "ปานกลาง", 0.045,
     "ห้ามซื้อหุ้นกู้ไม่มีเรตติ้ง หรือ High Yield เด็ดขาด · กระจายอย่างน้อย 5 บริษัท"),
    (2, "กองทุนอสังหาฯ / โครงสร้างพื้นฐาน (REIT, Infra)", "กองทุนรวม", "ปานกลาง", 0.055,
     "ปันผลสม่ำเสมอ และเป็นสายที่คุณเข้าใจดีอยู่แล้วจากงานอสังหาฯ"),
    (3, "กองทุนดัชนีหุ้นโลก (MSCI World / S&P 500)", "กองทุนรวม", "สูง", 0.075,
     "ทยอยซื้อทุกวันที่ 1 เท่านั้น · ห้ามลงครั้งเดียวทั้งก้อน · ติดลบ 30% ถือเป็นเรื่องปกติ"),
    (3, "กองทุนดัชนีหุ้นไทย (SET50)", "กองทุนรวม", "สูง", 0.060,
     "สัดส่วนไม่ควรเกินครึ่งของชั้น 3 · อย่ากระจุกในประเทศเดียวกับที่คุณทำมาหากิน"),
    (4, "กองทุน Thai ESG", "กองทุนลดหย่อนภาษี", "ปานกลาง-สูง", 0.070,
     "ลดหย่อนภาษีได้ = ผลตอบแทนแน่นอนเท่าฐานภาษีคุณในปีแรก · ตรวจเงื่อนไข/วงเงินล่าสุดที่ rd.go.th"),
    (4, "SSF / RMF", "กองทุนลดหย่อนภาษี", "ปรับได้", 0.070,
     "RMF ต้องถือถึงอายุ 55 ปี · เลือกนโยบายกองให้เติมเต็มชั้นที่ยังขาด"),
]
dv_tier = DataValidation(type="list", formula1='"0,1,2,3,4"', allow_blank=True, showDropDown=False)
pf.add_data_validation(dv_tier)
for i in range(FR0, FR1 + 1):
    a = ASSETS[i - FR0] if i - FR0 < len(ASSETS) else None
    put(pf, f"A{i}", a[0] if a else None, align="center", fill=IN_FILL, border=True, size=10, bold=True)
    put(pf, f"B{i}", a[1] if a else None, fill=IN_FILL, border=True, size=10)
    put(pf, f"C{i}", a[2] if a else None, fill=IN_FILL, border=True, size=10)
    put(pf, f"D{i}", a[3] if a else None, fill=IN_FILL, border=True, size=10, align="center")
    put(pf, f"E{i}", 0 if a else None, fmt=BAHT, align="right", fill=IN_FILL, border=True, size=10)
    put(pf, f"F{i}", 0 if a else None, fmt=BAHT, align="right", fill=IN_FILL, border=True, size=10)
    put(pf, f"G{i}", f'=IF($F{i}="","",$F{i}-$E{i})', fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(pf, f"H{i}", f'=IFERROR($G{i}/$E{i},"")', fmt=PCT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(pf, f"I{i}", f'=IFERROR($F{i}/$F${FR1+1},"")', fmt=PCT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(pf, f"J{i}", a[4] if a else None, fmt=PCT, align="center", fill=IN_FILL, border=True, size=10)
    put(pf, f"K{i}", a[5] if a else None, size=9, color=GREY, wrap=True, border=True)
    dv_tier.add(pf[f"A{i}"])

TOT = FR1 + 1
put(pf, f"A{TOT}", "รวม", bold=True, color="FFFFFF", fill=H_FILL, align="center", border=True)
put(pf, f"B{TOT}", "พอร์ตทั้งหมด", bold=True, color="FFFFFF", fill=H_FILL, border=True)
for col in "CD":
    put(pf, f"{col}{TOT}", None, fill=H_FILL, border=True)
put(pf, f"E{TOT}", f"=SUM(E{FR0}:E{FR1})", bold=True, fmt=BAHT, align="right",
    color="FFFFFF", fill=H_FILL, border=True)
put(pf, f"F{TOT}", f"=SUM(F{FR0}:F{FR1})", bold=True, fmt=BAHT, align="right",
    color="FFFFFF", fill=H_FILL, border=True)
put(pf, f"G{TOT}", f"=F{TOT}-E{TOT}", bold=True, fmt=BAHT, align="right",
    color="FFFFFF", fill=H_FILL, border=True)
put(pf, f"H{TOT}", f'=IFERROR(G{TOT}/E{TOT},"")', bold=True, fmt=PCT, align="right",
    color="FFFFFF", fill=H_FILL, border=True)
put(pf, f"I{TOT}", f'=IFERROR(F{TOT}/F{TOT},"")', bold=True, fmt=PCT, align="right",
    color="FFFFFF", fill=H_FILL, border=True)
put(pf, f"J{TOT}", f"=IFERROR(SUMPRODUCT($F${FR0}:$F${FR1},$J${FR0}:$J${FR1})/$F${TOT},0)",
    bold=True, fmt=PCT, align="center", color="FFFFFF", fill=H_FILL, border=True)
put(pf, f"K{TOT}", "ผลตอบแทนคาดหวังถ่วงน้ำหนักของพอร์ตจริง", size=9, color="FFFFFF",
    fill=H_FILL, border=True)

RB = TOT + 2
band(pf, RB, "⚖️ ต้องซื้อ/ขายอะไรบ้างให้ตรงเป้า (Rebalance)", "K")
table_head(pf, RB + 1, ["ชั้น", "ชื่อชั้น", "มูลค่าตอนนี้\n(บาท)", "% จริง",
                        "เป้าหมาย\n(บาท)", "ส่วนต่าง\n(บาท)", "ต้องทำอะไร"])
TIERS = [(0, "เงินสำรองฉุกเฉิน (เงินสด)", None),
         (1, "ปลอดภัย — พันธบัตร/ตราสารหนี้", S["t1"]),
         (2, "รายได้ประจำ — หุ้นกู้/REIT", S["t2"]),
         (3, "เติบโต — กองดัชนีหุ้น (DCA)", S["t3"]),
         (4, "ลดหย่อนภาษี — Thai ESG/SSF/RMF", S["t4"])]
TB0 = RB + 2
TBT = TB0 + len(TIERS)
for i, (tier, nm, pct) in enumerate(TIERS):
    r = TB0 + i
    put(pf, f"A{r}", tier, bold=True, align="center", border=True)
    put(pf, f"B{r}", nm, size=11, border=True)
    put(pf, f"C{r}", f"=SUMIF($A${FR0}:$A${FR1},{tier},$F${FR0}:$F${FR1})", fmt=BAHT,
        align="right", fill=CALC_FILL, border=True)
    put(pf, f"D{r}", f'=IFERROR(C{r}/$C${TBT},"")', fmt=PCT, align="right",
        fill=CALC_FILL, border=True)
    tgt = f"={S['efund']}" if pct is None else f"=MAX(0,$C${TBT}-$E${TB0})*{pct}"
    put(pf, f"E{r}", tgt, fmt=BAHT, align="right", fill=CALC_FILL, border=True)
    put(pf, f"F{r}", f"=E{r}-C{r}", fmt=BAHT, align="right", fill=CALC_FILL, border=True)
    put(pf, f"G{r}",
        f'=IF(F{r}>1000,"➕ เติมอีก "&TEXT(F{r},"#,##0")&" บาท",'
        f'IF(F{r}<-1000,"➖ เกินเป้า "&TEXT(-F{r},"#,##0")&" บาท","✅ พอดีแล้ว"))',
        size=10, border=True)
put(pf, f"A{TBT}", "", fill=H_FILL, border=True)
put(pf, f"B{TBT}", "รวมทุกชั้น", bold=True, color="FFFFFF", fill=H_FILL, border=True)
put(pf, f"C{TBT}", f"=SUM(C{TB0}:C{TBT-1})", bold=True, fmt=BAHT, align="right",
    color="FFFFFF", fill=H_FILL, border=True)
for col in "DEFG":
    put(pf, f"{col}{TBT}", None, fill=H_FILL, border=True)
pf.conditional_formatting.add(f"G{TB0}:G{TBT-1}", FormulaRule(
    formula=[f'ISNUMBER(SEARCH("✅",$G{TB0}))'], font=Font(name=F, bold=True, color=GREEN)))
pf.conditional_formatting.add(f"G{TB0}:G{TBT-1}", FormulaRule(
    formula=[f'ISNUMBER(SEARCH("➕",$G{TB0}))'], font=Font(name=F, bold=True, color=AMBER)))


# =====================================================================
# 7) มูลค่าพอร์ตรายวัน
# =====================================================================
pv = sheet("มูลค่าพอร์ตรายวัน", "0369A1")
widths(pv, {"A": 12, "B": 18, "C": 18, "D": 18, "E": 18, "F": 16, "G": 14, "H": 40})
title(pv, "📈 มูลค่าพอร์ตรายวัน",
      "กรอกแค่ 2 ช่อง: มูลค่าพอร์ตรวม กับ เงินที่เติมเข้าวันนี้ · ไม่ต้องกรอกครบทุกวันก็ได้ "
      "แต่ต้องกรอกทุกวันที่ 1 และ 16 · ตัวอย่างวันแรก: มูลค่าพอร์ตรวม 100,000 | เติมเข้าวันนี้ 100,000",
      "A1:H1", "A2:H2")
table_head(pv, 3, ["วันที่", "มูลค่าพอร์ตรวม\n(บาท)", "เติมเข้าวันนี้\n(บาท)",
                   "เงินต้นสะสม\n(บาท)", "กำไร/ขาดทุนสะสม\n(บาท)", "จุดสูงสุด\n(บาท)",
                   "Drawdown", "หมายเหตุ"])
for i in range(NDAYS):
    r = R0 + i
    dte = START + dt.timedelta(days=i)
    put(pv, f"A{r}", dte, fmt=DATE, align="center", border=True, size=10, bold=(dte.day in (1, 16)))
    for col in ("B", "C"):
        put(pv, f"{col}{r}", None, fmt=BAHT, align="right", fill=IN_FILL, border=True, size=10)
    put(pv, f"D{r}", f'=IF($B{r}="","",SUM($C${R0}:$C{r}))', fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(pv, f"E{r}", f'=IF($B{r}="","",$B{r}-$D{r})', fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(pv, f"F{r}", f'=IF($B{r}="","",MAX($B${R0}:$B{r}))', fmt=BAHT, align="right",
        fill=CALC_FILL, border=True, size=10)
    put(pv, f"G{r}", f'=IF($B{r}="","",IFERROR($B{r}/MAX($B${R0}:$B{r})-1,0))', fmt=PCT,
        align="right", fill=CALC_FILL, border=True, size=10)
    put(pv, f"H{r}", None, fill=IN_FILL, border=True, size=10)
pv.freeze_panes = "B4"
pv.conditional_formatting.add(f"A{R0}:H{R1}", FormulaRule(
    formula=[f"$A{R0}=TODAY()"], fill=PatternFill("solid", fgColor="FEF3C7")))
pv.conditional_formatting.add(f"E{R0}:E{R1}", CellIsRule(
    operator="lessThan", formula=["0"], font=Font(name=F, color=RED)))
pv.conditional_formatting.add(f"G{R0}:G{R1}", CellIsRule(
    operator="lessThan", formula=["-0.1"], font=Font(name=F, bold=True, color=RED)))


# =====================================================================
# 8) กฎเหล็ก
# =====================================================================
rl = sheet("กฎเหล็ก", "B91C1C", grid=False)
widths(rl, {"A": 6, "B": 62, "C": 74, "D": 18})
title(rl, "🚦 กฎเหล็ก 15 ข้อ — อ่านซ้ำทุกวันที่ 1 ของเดือน",
      "กฎพวกนี้คือสิ่งที่ทำให้ 'ความเสี่ยงต่ำ' เป็นจริง — ไม่ใช่การเลือกสินทรัพย์ · "
      "คนส่วนใหญ่ไม่ได้เจ๊งเพราะเลือกกองผิด แต่เจ๊งเพราะทำผิดกฎพวกนี้",
      "A1:D1", "A2:D2")
table_head(rl, 3, ["ข้อ", "กฎ", "ทำไมต้องมีกฎนี้", "สถานะ"])
RULES = [
    ("ห้ามลงทุนด้วยเงินที่ต้องใช้ภายใน 12 เดือน",
     "การถูกบังคับให้ขายตอนตลาดลง คือสาเหตุอันดับ 1 ของการขาดทุนถาวร"),
    ("เงินสำรอง 6 เดือนต้องเต็มก่อน จึงจะซื้อสินทรัพย์ชั้น 3 ได้",
     "รายได้นายหน้าไม่สม่ำเสมอ · เงินสำรองคือสิ่งที่ทำให้คุณไม่ต้องขายของถูก"),
    ("ห้ามใช้เงินกู้ บัตรเครดิต หรือมาร์จิ้น มาลงทุนหรือมาเติมค่าโฆษณา",
     "หนี้เปลี่ยนการขาดทุนชั่วคราวให้กลายเป็นการล้มละลายถาวร"),
    ("ห้ามใส่เงินเกิน 10% ของพอร์ตในสินทรัพย์ตัวเดียว (ยกเว้นชั้น 0-1)",
     "บริษัทเดียวล้มได้ · ตลาดทั้งตลาดล้มยากกว่ามาก"),
    ("เพิ่มงบโฆษณาได้เฉพาะเมื่อ ROAS 30 วัน ≥ 3 เท่า และเพิ่มครั้งละไม่เกิน 20%",
     "การเพิ่มงบตอนตัวเลขยังไม่นิ่ง คือการเร่งเผาเงินให้เร็วขึ้น"),
    ("ถ้า CPQL 7 วันเกินเพดาน 2 วันติด ให้หยุดแอด แล้วแก้คอนเทนต์/กลุ่มเป้าหมายก่อน",
     "เพดานคือเบรกที่คำนวณจากกำไรจริง ไม่ใช่ความรู้สึก"),
    ("ห้ามซื้อ-ขายตามข่าว กลุ่มไลน์ หรือคนแนะนำ — ซื้อตามแผน DCA เท่านั้น",
     "การจับจังหวะตลาดแพ้ DCA ในระยะยาวเกือบทุกกรณี และกินเวลาสมองที่ควรใช้กับธุรกิจ"),
    ("Rebalance ปีละ 2 ครั้ง (มิ.ย. และ ธ.ค.) หรือเมื่อชั้นใดเบี่ยงเกิน 5%",
     "บังคับให้ 'ขายของที่ขึ้น ซื้อของที่ลง' โดยอัตโนมัติ โดยไม่ต้องใช้อารมณ์"),
    ("อะไรที่การันตีผลตอบแทนเกิน 10% ต่อเดือน = แชร์ลูกโซ่ 100% ปฏิเสธทันที",
     "ไม่มีข้อยกเว้น ไม่มี 'รอบนี้พิเศษ' · ตรวจใบอนุญาตที่ SEC Check First ก่อนโอนเงินทุกครั้ง"),
    ("บันทึกตัวเลขทุกวันก่อน 21:00 น. ไม่มีข้อยกเว้น",
     "สิ่งที่ไม่ได้วัด จะไม่มีทางดีขึ้น · 3 นาที/วัน คือราคาที่ถูกที่สุดของความสำเร็จ"),
    ("โอนกำไรเข้าพอร์ตทุกวันที่ 1 และ 16 — ก่อนใช้จ่ายอย่างอื่น",
     "จ่ายให้ตัวเองก่อนเสมอ · เงินที่เหลือค่อยใช้ ไม่ใช่ใช้แล้วค่อยเหลือ"),
    ("แยกบัญชีธนาคาร 4 ใบจริง: ธุรกิจ / ภาษี+สำรอง / ลงทุน / ใช้จ่าย",
     "ระบบชนะวินัย · ถ้าเงินอยู่กองเดียวกัน มันจะถูกใช้หมดเสมอ"),
    ("กันภาษี 30% ของค่าคอมทันทีที่ได้รับ",
     "นายหน้าถูกหัก ณ ที่จ่ายไม่ครบ ต้องยื่นเพิ่มปลายปี · คนที่ลืมกันภาษีคือคนที่เจ็บที่สุดในเดือนมีนาคม"),
    ("ตรวจเอกสารสิทธิ์ ผู้ขาย และใบอนุญาตโครงการทุกดีล ก่อนพาลูกค้าดู",
     "ดีลเดียวที่มีปัญหาทางกฎหมาย ลบกำไรทั้งปีได้ และเสียชื่อถาวรในตลาดเล็กอย่างหาดใหญ่"),
    ("พอร์ตติดลบเกิน 20% → ห้ามขาย ห้ามหยุด DCA ให้ซื้อต่อตามแผนเดิม",
     "ช่วงที่เจ็บที่สุด คือช่วงที่ราคาถูกที่สุด · แผนเขียนไว้ตอนใจนิ่ง ให้เชื่อแผน ไม่ใช่เชื่อใจตอนตกใจ"),
]
dv_rule = DataValidation(type="list", formula1='"✅ ทำแล้ว,🔄 กำลังทำ,⬜ ยังไม่ทำ"',
                         allow_blank=True, showDropDown=False)
rl.add_data_validation(dv_rule)
for i, (rule, why) in enumerate(RULES):
    r = 4 + i
    put(rl, f"A{r}", i + 1, bold=True, align="center", border=True)
    put(rl, f"B{r}", rule, size=11, wrap=True, border=True)
    put(rl, f"C{r}", why, size=10, color=GREY, wrap=True, border=True)
    put(rl, f"D{r}", "⬜ ยังไม่ทำ", align="center", fill=IN_FILL, border=True, size=10)
    rl.row_dimensions[r].height = 34
    dv_rule.add(rl[f"D{r}"])
rl.conditional_formatting.add(f"D4:D{3+len(RULES)}", FormulaRule(
    formula=['ISNUMBER(SEARCH("✅",$D4))'], font=Font(name=F, bold=True, color=GREEN)))
rl.freeze_panes = "A4"


# =====================================================================
# 9) แผน 12 เดือน
# =====================================================================
pl = sheet("แผน12เดือน", "7C2D12", grid=False)
widths(pl, {"A": 14, "B": 12, "C": 16, "D": 15, "E": 15, "F": 16, "G": 16, "H": 18, "I": 62})
title(pl, "🗓️ แผน 12 เดือน — จากวันนี้ถึงเดือนสิงหาคม 2570",
      "ตัวเลขทั้งหมดคำนวณจากแท็บ 'ตั้งค่า' · เป็นประมาณการเพื่อวางแผน ไม่ใช่คำรับประกันผลตอบแทน · "
      "ทุกสิ้นเดือน ให้เอาตัวเลขจริงจากแดชบอร์ดไปแก้สมมติฐาน แล้วแผนนี้จะแม่นขึ้นเอง",
      "A1:I1", "A2:I2")
table_head(pl, 3, ["เดือน", "เป้าดีล\nที่ต้องโอน", "เป้ารายได้ค่าคอม\n(บาท)", "งบโฆษณา\n(บาท)",
                   "ต้นทุนคงที่\n(บาท)", "กำไรสุทธิคาด\n(บาท)", "เข้าพอร์ต\n(บาท)",
                   "มูลค่าพอร์ตสะสม\n(บาท)", "โฟกัสหลักของเดือนนี้"])
DEALS = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5]
FOCUS = [
    "ตั้งระบบ: แยกบัญชี 4 ใบ · เริ่มบันทึกทุกวัน · เติมเงินสำรองเป็นอันดับแรก",
    "หา CPQL จริงของตัวเอง: ทดสอบคอนเทนต์ 3 แบบ วัดผลครบ 30 วัน แล้วแก้สมมติฐาน",
    "เติม FAQ ใน Google Sheet ของ LINE bot ให้ครบ 50 คำถาม — ลดเวลาตอบ เพิ่มจำนวน lead ที่รับไหว",
    "เงินสำรองควรเต็มครึ่งทาง · เริ่มซื้อชั้น 1 (พันธบัตร/กองตราสารหนี้)",
    "เก็บรีวิวลูกค้าจริง 5 ราย ทำเป็นคอนเทนต์ — รีวิวจริงคือสิ่งที่ลด CPQL ได้มากที่สุด",
    "ทบทวนครึ่งปี: แก้ทุกสมมติฐานด้วยตัวเลขจริง · Rebalance ครั้งที่ 1",
    "เงินสำรองเต็ม 100% → เริ่มชั้น 2 (หุ้นกู้เรตติ้งดี / REIT)",
    "ขยายทรัพย์ในมือ: เซ็นสัญญานายหน้ากับเจ้าของบ้าน/โครงการเพิ่มอีก 10 รายการ",
    "เริ่ม DCA ชั้น 3 (กองดัชนีหุ้นโลก) ทุกวันที่ 1 · ตั้งคำสั่งซื้ออัตโนมัติ จะได้ไม่ต้องใช้ใจ",
    "หาผู้ช่วยตอบแชท 1 คน — คอขวดของธุรกิจนี้คือเวลาตอบ ไม่ใช่จำนวน lead",
    "วางแผนภาษีปลายปี: ซื้อกองลดหย่อน (ชั้น 4) ให้เต็มสิทธิ์ก่อน 31 ธ.ค.",
    "ปิดปี: สรุปตัวเลขจริงทั้งปี · Rebalance ครั้งที่ 2 · ตั้งเป้าปีหน้าจากของจริง ไม่ใช่จากความหวัง",
]
m0 = dt.date(START.year, START.month, 1) + dt.timedelta(days=32)
m0 = dt.date(m0.year, m0.month, 1)
for i in range(12):
    r = 4 + i
    mm = m0.month + i
    yy = m0.year + (mm - 1) // 12
    mm = (mm - 1) % 12 + 1
    put(pl, f"A{r}", dt.date(yy, mm, 1), fmt='mmm yyyy', align="center", bold=True, border=True)
    put(pl, f"B{r}", DEALS[i], fmt='0" ดีล"', align="center", fill=IN_FILL,
        color="0000FF", border=True)
    put(pl, f"C{r}", f"=ROUND(B{r}*{S['net']},0)", fmt=BAHT, align="right",
        fill=CALC_FILL, border=True)
    put(pl, f"D{r}", f"=ROUND(MAX({S['admo']},C{r}*0.15),0)", fmt=BAHT, align="right",
        fill=CALC_FILL, border=True)
    put(pl, f"E{r}", f"={S['fix']}", fmt=BAHT, align="right", fill=CALC_FILL, border=True)
    put(pl, f"F{r}", f"=C{r}-D{r}-E{r}", fmt=BAHT, align="right", fill=CALC_FILL, border=True)
    put(pl, f"G{r}", f"=ROUND(C{r}*{S['pI']},0)", fmt=BAHT, align="right",
        fill=CALC_FILL, border=True)
    prev = f"{S['cap']}" if i == 0 else f"H{r-1}"
    put(pl, f"H{r}", f"=ROUND({prev}*(1+{S['blend']}/12)+G{r},0)", fmt=BAHT, align="right",
        bold=True, fill=CALC_FILL, border=True)
    put(pl, f"I{r}", FOCUS[i], size=10, wrap=True, border=True)
    pl.row_dimensions[r].height = 30
TR = 16
put(pl, f"A{TR}", "รวม 12 เดือน", bold=True, color="FFFFFF", fill=H_FILL, border=True)
put(pl, f"B{TR}", "=SUM(B4:B15)", bold=True, fmt='0" ดีล"', align="center",
    color="FFFFFF", fill=H_FILL, border=True)
for col in "CDEFG":
    put(pl, f"{col}{TR}", f"=SUM({col}4:{col}15)", bold=True, fmt=BAHT, align="right",
        color="FFFFFF", fill=H_FILL, border=True)
put(pl, f"H{TR}", "=H15", bold=True, fmt=BAHT, align="right", color="FFFFFF",
    fill=H_FILL, border=True)
put(pl, f"I{TR}", "มูลค่าพอร์ตปลายปีที่ 1 (ประมาณการ)", size=10, color="FFFFFF",
    fill=H_FILL, border=True)
pl.freeze_panes = "A4"

# ---------- จัดลำดับแท็บและบันทึก ----------
ORDER = ["เริ่มที่นี่", "แดชบอร์ด", "บันทึกรายวัน", "ดีลในมือ", "พอร์ตลงทุน",
         "มูลค่าพอร์ตรายวัน", "ตั้งค่า", "กฎเหล็ก", "แผน12เดือน"]
wb._sheets = [wb[n] for n in ORDER]
wb.active = 0
wb.save(OUT)
print("saved:", OUT)
