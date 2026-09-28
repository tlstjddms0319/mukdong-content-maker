"""Render the Korean app operation guide to a readable A4 PDF."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "APP_OPERATION_GUIDE.ko.md"
TARGET = ROOT / "output" / "pdf" / "mukdong-content-maker-operation-guide.ko.pdf"
FONT = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")

pdfmetrics.registerFont(TTFont("Malgun", str(FONT)))
pdfmetrics.registerFont(TTFont("Malgun-Bold", str(FONT_BOLD)))
pdfmetrics.registerFontFamily("Malgun", normal="Malgun", bold="Malgun-Bold")

INK = colors.HexColor("#17302D")
MUTED = colors.HexColor("#52615E")
GREEN = colors.HexColor("#1F6253")
PALE = colors.HexColor("#F0F6F2")
LINE = colors.HexColor("#D9E6DE")
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 45
CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

styles = {
    "title": ParagraphStyle(
        "TitleKo", fontName="Malgun-Bold", fontSize=19, leading=27,
        textColor=INK, spaceAfter=13, wordWrap="CJK",
    ),
    "h2": ParagraphStyle(
        "SectionKo", fontName="Malgun-Bold", fontSize=12.5, leading=19,
        textColor=GREEN, spaceBefore=18, spaceAfter=7, keepWithNext=True,
        wordWrap="CJK",
    ),
    "h3": ParagraphStyle(
        "SubsectionKo", fontName="Malgun-Bold", fontSize=10.2, leading=16,
        textColor=INK, spaceBefore=11, spaceAfter=5, keepWithNext=True,
        wordWrap="CJK",
    ),
    "body": ParagraphStyle(
        "BodyKo", fontName="Malgun", fontSize=9.1, leading=15.3,
        textColor=INK, spaceAfter=7, wordWrap="CJK", allowWidows=0,
        allowOrphans=0,
    ),
    "bullet": ParagraphStyle(
        "BulletKo", fontName="Malgun", fontSize=9.1, leading=15.3,
        textColor=INK, leftIndent=13, firstLineIndent=-10, spaceAfter=5,
        wordWrap="CJK",
    ),
    "note": ParagraphStyle(
        "NoteKo", fontName="Malgun", fontSize=8.6, leading=14.1,
        textColor=MUTED, wordWrap="CJK",
    ),
    "card": ParagraphStyle(
        "CardKo", fontName="Malgun", fontSize=8.8, leading=14.6,
        textColor=INK, wordWrap="CJK",
    ),
    "footer": ParagraphStyle(
        "FooterKo", fontName="Malgun", fontSize=7.3, leading=10,
        textColor=MUTED, alignment=TA_CENTER,
    ),
}


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`([^`]+)`", r'<font color="#1F6253">\1</font>', text)
    text = re.sub(
        r"&lt;(https?://[^&]+)&gt;",
        r'<link href="\1" color="#1F6253">\1</link>',
        text,
    )
    return text


def card(headers: list[str], values: list[str]) -> Table:
    content = []
    for index, (label, value) in enumerate(zip(headers, values)):
        if index:
            content.append(Spacer(1, 3))
        content.append(Paragraph(f"<b>{inline(label)}</b>  {inline(value)}", styles["card"]))
    table = Table([[content]], colWidths=[CONTENT_WIDTH], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE),
        ("BOX", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def render_markdown(markdown: str):
    story = []
    lines = markdown.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        if not line:
            continue
        if line.startswith("|"):
            table_lines = [line]
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index].strip())
                index += 1
            parsed = [[cell.strip() for cell in row.strip("|").split("|")] for row in table_lines]
            headers = parsed[0]
            for row in parsed[2:]:
                if len(row) != len(headers):
                    continue
                story.append(card(headers, row))
                story.append(Spacer(1, 6))
            continue
        if line.startswith("# "):
            story.append(Paragraph(inline(line[2:]), styles["title"]))
            story.append(HRFlowable(width="100%", thickness=1.5, color=GREEN))
            story.append(Spacer(1, 12))
            continue
        if line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), styles["h2"]))
            continue
        if line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), styles["h3"]))
            continue
        if line.startswith("> "):
            story.append(card(["문서 기준"], [re.sub(r"^기준:\s*", "", line[2:])]))
            story.append(Spacer(1, 8))
            continue
        if line.startswith("- "):
            story.append(Paragraph("- " + inline(line[2:]), styles["bullet"]))
            continue
        if re.match(r"^\d+\. ", line):
            number, body = line.split(". ", 1)
            story.append(Paragraph(f"<b>{number}.</b> {inline(body)}", styles["bullet"]))
            continue
        story.append(Paragraph(inline(line), styles["body"]))
    return story


def page_decoration(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, PAGE_HEIGHT - 31, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 31)
    canvas.setFont("Malgun-Bold", 7.6)
    canvas.setFillColor(GREEN)
    canvas.drawString(MARGIN, PAGE_HEIGHT - 23, "묵동 콘텐츠 메이커")
    canvas.line(MARGIN, 32, PAGE_WIDTH - MARGIN, 32)
    canvas.setFont("Malgun", 7.4)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 20, "사용법과 실제 동작 · 2026-09-24")
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 20, f"{doc.page}")
    canvas.restoreState()


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(TARGET), pagesize=A4, rightMargin=MARGIN, leftMargin=MARGIN,
        topMargin=47, bottomMargin=49, title="묵동 콘텐츠 메이커: 사용법과 실제 동작",
        author="묵동 콘텐츠 메이커", subject="사용자 안내와 구현 상태",
    )
    doc.build(render_markdown(SOURCE.read_text(encoding="utf-8")),
              onFirstPage=page_decoration, onLaterPages=page_decoration)
    print(TARGET)


if __name__ == "__main__":
    main()
