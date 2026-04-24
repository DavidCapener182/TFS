from __future__ import annotations

import html
import json
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
INPUT_JSON = ROOT / "tmp/pdfs/store-visit-template-guide.json"
OUTPUT_PDF = ROOT / "output/pdf/store-visit-activity-template-guide.pdf"

SECTION_ORDER = ["what_checked", "findings", "actions"]
SECTION_LABELS = {
    "what_checked": "What Checked",
    "findings": "Findings",
    "actions": "Actions",
}


def safe_text(value: object) -> str:
    return html.escape(str(value or "")).replace("\n", "<br/>")


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="DocTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#1f2a44"),
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="DocSubTitle",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#4a5568"),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="TemplateTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#1d4ed8"),
            spaceBefore=8,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodySmall",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#111827"),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="MetaLabel",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#334155"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="MetaValue",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#111827"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="FieldTitle",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="FieldMeta",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#475569"),
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletLine",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.75,
            leading=11.5,
            textColor=colors.HexColor("#111827"),
            leftIndent=8,
            spaceAfter=1.5,
        )
    )
    return styles


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
    canvas.line(doc.leftMargin, 12 * mm, A4[0] - doc.rightMargin, 12 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#475569"))
    canvas.drawString(doc.leftMargin, 8 * mm, "Store Visit Activity Template Guide")
    canvas.drawRightString(A4[0] - doc.rightMargin, 8 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def card(flowables, width, background, border):
    table = Table([[flowables]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 0.6, border),
                ("INNERPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def meta_table(template, styles, width):
    rows = [
        [
            Paragraph("Template key", styles["MetaLabel"]),
            Paragraph(f"<font name='Courier'>{safe_text(template['key'])}</font>", styles["MetaValue"]),
        ],
        [
            Paragraph("Form variant", styles["MetaLabel"]),
            Paragraph(safe_text(template["formVariant"]), styles["MetaValue"]),
        ],
        [
            Paragraph("Evidence label", styles["MetaLabel"]),
            Paragraph(safe_text(template["evidenceLabel"]), styles["MetaValue"]),
        ],
        [
            Paragraph("Specialist", styles["MetaLabel"]),
            Paragraph("Yes" if template["specialist"] else "No", styles["MetaValue"]),
        ],
        [
            Paragraph("Detail placeholder", styles["MetaLabel"]),
            Paragraph(safe_text(template["detailPlaceholder"]), styles["MetaValue"]),
        ],
    ]
    table = Table(rows, colWidths=[38 * mm, width - (38 * mm)])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
                ("INNERPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def prompt_paragraphs(lines, styles):
    items = []
    for line in lines:
        items.append(Paragraph(f"- {safe_text(line)}", styles["BulletLine"]))
    return items


def guide_card(title, intro, prompts, styles, width):
    flowables = [
        Paragraph(safe_text(title), styles["FieldTitle"]),
        Paragraph(safe_text(intro), styles["BodySmall"]),
    ]
    flowables.extend(prompt_paragraphs(prompts, styles))
    return card(flowables, width, colors.HexColor("#eff6ff"), colors.HexColor("#93c5fd"))


def field_card(field, styles, width):
    flowables = [
        Paragraph(
            f"{safe_text(field['label'])} <font name='Courier' color='#475569'>[{safe_text(field['key'])}]</font>",
            styles["FieldTitle"],
        ),
        Paragraph(
            f"Input: {safe_text(field['input'])} | Section: {safe_text(SECTION_LABELS[field['section']])}",
            styles["FieldMeta"],
        ),
        Paragraph(f"<b>Field prompt:</b> {safe_text(field['placeholder'])}", styles["BodySmall"]),
        Paragraph(f"<b>Capture:</b> {safe_text(field['captureHint'])}", styles["BodySmall"]),
    ]
    if field.get("helperText"):
        flowables.append(Paragraph(f"<b>Helper:</b> {safe_text(field['helperText'])}", styles["BodySmall"]))
    flowables.append(Paragraph("<b>Script questions</b>", styles["FieldMeta"]))
    flowables.extend(prompt_paragraphs(field["scriptLines"], styles))
    return card(flowables, width, colors.white, colors.HexColor("#cbd5e1"))


def template_story(template, styles, width):
    story = [
        Paragraph(safe_text(template["label"]), styles["TemplateTitle"]),
        Paragraph(safe_text(template["description"]), styles["BodySmall"]),
        meta_table(template, styles, width),
        Spacer(1, 5),
    ]

    for section in SECTION_ORDER:
        guide = template["sectionGuides"].get(section)
        section_fields = [field for field in template["fields"] if field["section"] == section]
        if not guide and not section_fields:
            continue

        story.append(Paragraph(SECTION_LABELS[section], styles["SectionHeading"]))
        if guide:
            story.append(
                guide_card(guide["title"], guide["intro"], guide["prompts"], styles, width)
            )
            story.append(Spacer(1, 4))

        for field in section_fields:
            story.append(field_card(field, styles, width))
            story.append(Spacer(1, 4))

    if template.get("countedItemsGuide"):
        guide = template["countedItemsGuide"]
        story.append(Paragraph("Counted Item Prompts", styles["SectionHeading"]))
        story.append(guide_card(guide["title"], guide["intro"], guide["prompts"], styles, width))
        story.append(Spacer(1, 4))

    if template.get("amountChecksGuide"):
        guide = template["amountChecksGuide"]
        story.append(Paragraph("Amount Check Prompts", styles["SectionHeading"]))
        story.append(guide_card(guide["title"], guide["intro"], guide["prompts"], styles, width))
        story.append(Spacer(1, 4))

    return story


def main():
    data = json.loads(INPUT_JSON.read_text())
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="Store Visit Activity Template Guide",
        author="Codex",
    )

    story = [
        Paragraph("Store Visit Activity Template Guide", styles["DocTitle"]),
        Paragraph(
            "Review copy generated from the current live template definitions in lib/visit-needs.ts.",
            styles["DocSubTitle"],
        ),
        Paragraph(
            f"Generated on {date.today().isoformat()} with {len(data)} activity templates.",
            styles["DocSubTitle"],
        ),
        Spacer(1, 8),
        Paragraph("Included Templates", styles["SectionHeading"]),
    ]

    for template in data:
        story.append(
            Paragraph(
                f"- {safe_text(template['label'])} "
                f"<font name='Courier' color='#475569'>[{safe_text(template['key'])}]</font>",
                styles["BodySmall"],
            )
        )

    for template in data:
        story.append(PageBreak())
        story.extend(template_story(template, styles, doc.width))

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT_PDF)


if __name__ == "__main__":
    main()
