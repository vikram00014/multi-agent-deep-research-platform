from __future__ import annotations

import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _inline_markdown_to_html(text: str) -> str:
    cleaned = str(text or "").strip()
    cleaned = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", cleaned)
    cleaned = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", cleaned)
    cleaned = escape(cleaned)
    cleaned = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", cleaned)
    cleaned = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<i>\1</i>", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"<font face=\"Courier\">\1</font>", cleaned)
    return cleaned


def _parse_markdown_table(lines: list[str]) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if cells and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells):
            continue
        rows.append(cells)
    return rows


def _image_from_markdown(line: str, resource_dir: Path) -> Image | None:
    match = re.search(r"!\[[^\]]*\]\(([^)]+)\)", line)
    if not match:
        return None
    raw_path = match.group(1).strip()
    file_name = Path(raw_path).name
    img_path = resource_dir / file_name
    if not img_path.exists():
        return None
    image = Image(str(img_path))
    image._restrictSize(6.2 * inch, 4.5 * inch)
    return image


def _build_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="OrionTitle",
        parent=styles["Title"],
        fontSize=24,
        leading=30,
        alignment=TA_CENTER,
        spaceAfter=18,
    ))
    styles.add(ParagraphStyle(
        name="OrionSection",
        parent=styles["Heading1"],
        fontSize=16,
        leading=21,
        textColor=colors.HexColor("#1d4ed8"),
        spaceBefore=12,
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="OrionSubsection",
        parent=styles["Heading2"],
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=10,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="OrionBody",
        parent=styles["BodyText"],
        fontSize=9.6,
        leading=14,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="OrionCaption",
        parent=styles["Italic"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="OrionMeta",
        parent=styles["BodyText"],
        fontSize=8.5,
        leading=11,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#475569"),
        spaceAfter=14,
    ))
    return styles


def _table_flowable(table_rows: list[list[str]]):
    table = Table(table_rows, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("LEADING", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _markdown_to_story(markdown: str, resource_dir: Path, styles, section_title: str) -> list:
    story: list = [Paragraph(section_title, styles["OrionSection"]), Spacer(1, 0.08 * inch)]
    lines = str(markdown or "").splitlines()
    paragraph_buffer: list[str] = []
    list_buffer: list[str] = []
    table_buffer: list[str] = []
    in_code = False
    code_lines: list[str] = []

    def flush_paragraph():
        nonlocal paragraph_buffer
        if paragraph_buffer:
            text = " ".join(part.strip() for part in paragraph_buffer if part.strip())
            if text:
                story.append(Paragraph(_inline_markdown_to_html(text), styles["OrionBody"]))
            paragraph_buffer = []

    def flush_list():
        nonlocal list_buffer
        if list_buffer:
            items = [
                ListItem(Paragraph(_inline_markdown_to_html(item), styles["OrionBody"]))
                for item in list_buffer
            ]
            story.append(ListFlowable(items, bulletType="bullet", leftIndent=18))
            story.append(Spacer(1, 0.04 * inch))
            list_buffer = []

    def flush_table():
        nonlocal table_buffer
        if table_buffer:
            rows = _parse_markdown_table(table_buffer)
            if rows:
                story.append(_table_flowable(rows))
                story.append(Spacer(1, 0.08 * inch))
            table_buffer = []

    def flush_code():
        nonlocal code_lines
        if code_lines:
            text = "\n".join(code_lines).strip()
            if text and "mermaid" not in text.lower():
                story.append(Preformatted(text, styles["Code"]))
                story.append(Spacer(1, 0.08 * inch))
            code_lines = []

    idx = 0
    while idx < len(lines):
        line = lines[idx]
        stripped = line.strip()

        if stripped.startswith("```"):
            flush_paragraph()
            flush_list()
            flush_table()
            if in_code:
                in_code = False
                flush_code()
            else:
                in_code = True
            idx += 1
            continue

        if in_code:
            code_lines.append(line)
            idx += 1
            continue

        if stripped.startswith("|"):
            flush_paragraph()
            flush_list()
            table_buffer.append(line)
            idx += 1
            while idx < len(lines) and lines[idx].strip().startswith("|"):
                table_buffer.append(lines[idx])
                idx += 1
            flush_table()
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if heading_match:
            flush_paragraph()
            flush_list()
            flush_table()
            level = len(heading_match.group(1))
            heading_text = _inline_markdown_to_html(heading_match.group(2))
            style_name = "OrionSection" if level <= 2 else "OrionSubsection"
            story.append(Paragraph(heading_text, styles[style_name]))
            idx += 1
            continue

        image = _image_from_markdown(stripped, resource_dir)
        if image is not None:
            flush_paragraph()
            flush_list()
            flush_table()
            story.append(image)
            story.append(Spacer(1, 0.06 * inch))
            idx += 1
            if idx < len(lines) and lines[idx].strip().startswith("*Figure:"):
                caption = lines[idx].strip().strip("*")
                story.append(Paragraph(_inline_markdown_to_html(caption), styles["OrionCaption"]))
                idx += 1
            continue

        if re.match(r"^\s*[-*]\s+", line):
            flush_paragraph()
            flush_table()
            list_buffer.append(re.sub(r"^\s*[-*]\s+", "", line).strip())
            idx += 1
            continue

        if stripped.startswith(">"):
            flush_paragraph()
            flush_list()
            flush_table()
            story.append(Paragraph(_inline_markdown_to_html(stripped.lstrip("> ").strip()), styles["OrionCaption"]))
            idx += 1
            continue

        if not stripped:
            flush_paragraph()
            flush_list()
            flush_table()
            idx += 1
            continue

        paragraph_buffer.append(line)
        idx += 1

    flush_paragraph()
    flush_list()
    flush_table()
    flush_code()
    return story


def _page_decor(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748b"))
    canvas.drawString(doc.leftMargin, 0.45 * inch, "ORION Research Report")
    canvas.drawRightString(A4[0] - doc.rightMargin, 0.45 * inch, f"Page {doc.page}")
    canvas.restoreState()


def generate_research_pdf(
    *,
    topic: str,
    session_id: str,
    analysis_markdown: str,
    final_markdown: str,
    out_path: Path,
    resource_dir: Path,
) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    styles = _build_styles()
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.7 * inch,
        title=f"ORION Research Report - {topic}",
        author="ORION",
    )

    story = [
        Paragraph("ORION Research Report", styles["OrionTitle"]),
        Paragraph(_inline_markdown_to_html(topic), styles["OrionSection"]),
        Paragraph(
            _inline_markdown_to_html(f"Session: {session_id}"),
            styles["OrionMeta"],
        ),
        Spacer(1, 0.14 * inch),
    ]
    story.extend(_markdown_to_story(analysis_markdown, resource_dir, styles, "Part A - Intelligence Dossier"))
    story.append(PageBreak())
    story.extend(_markdown_to_story(final_markdown, resource_dir, styles, "Part B - Final Manuscript"))
    doc.build(story, onFirstPage=_page_decor, onLaterPages=_page_decor)
    return out_path
