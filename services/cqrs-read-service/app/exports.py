from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle
from xml.sax.saxutils import escape


def export_xlsx(rows: list[dict[str, Any]], headers: list[str] | None = None) -> BytesIO:
    output = BytesIO()
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Candidaturas"
    headers = list(rows[0]) if rows else (headers or [])
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F4E78")
    for row in rows:
        values = []
        for header in headers:
            value = row.get(header)
            if isinstance(value, (dict, list)):
                value = str(value)
            if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
                value = "'" + value
            values.append(value)
        sheet.append(values)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for column in sheet.columns:
        letter_key = column[0].column_letter
        sheet.column_dimensions[letter_key].width = min(max(max(len(str(cell.value or "")) for cell in column) + 2, 12), 40)
    workbook.save(output)
    output.seek(0)
    return output


def export_pdf(rows: list[dict[str, Any]], headers: list[str] | None = None) -> BytesIO:
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=landscape(letter), title="Reporte de candidaturas")
    columns = list(rows[0]) if rows else (headers or [])
    if not columns:
        data = [["Sin resultados"]]
    else:
        data = [[Paragraph(f"<b>{escape(str(value))}</b>", getSampleStyleSheet()["BodyText"]) for value in columns]]
        for row in rows:
            data.append([
                Paragraph(escape(str(row.get(key) if row.get(key) is not None else ""))[:2000],
                          getSampleStyleSheet()["BodyText"])
                for key in columns
            ])
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F4E78")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F6FA")]),
    ]))
    document.build([table])
    output.seek(0)
    return output
