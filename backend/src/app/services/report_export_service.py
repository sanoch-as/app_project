"""CSV/PDF export — spec section 4.1 point 24. Pure formatting functions:
callers (endpoints/reports.py) load the data and hand it to these."""

import csv
import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.project import Project
from app.models.task import Task
from app.repositories.worklog_repository import WorklogExportRow
from app.services.evm import EVMMetrics
from app.services.scurve import SCurvePoint

TASKS_CSV_HEADER = [
    "wbs_code",
    "name",
    "status",
    "priority",
    "start_date",
    "end_date",
    "duration_days",
    "percent_complete",
    "is_milestone",
    "is_critical",
    "total_float",
    "budgeted_cost",
]

WORKLOGS_CSV_HEADER = ["work_date", "user_email", "task_name", "hours", "description"]


def tasks_to_csv(tasks: list[Task]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(TASKS_CSV_HEADER)
    for task in tasks:
        writer.writerow(
            [
                task.wbs_code,
                task.name,
                task.status.value,
                task.priority.value,
                task.start_date.isoformat(),
                task.end_date.isoformat(),
                task.duration_days,
                task.percent_complete,
                task.is_milestone,
                task.is_critical,
                task.total_float if task.total_float is not None else "",
                task.budgeted_cost,
            ]
        )
    return buffer.getvalue()


def worklogs_to_csv(rows: list[WorklogExportRow]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(WORKLOGS_CSV_HEADER)
    for row in rows:
        writer.writerow(
            [
                row.work_date.isoformat(),
                row.user_email,
                row.task_name,
                row.hours,
                row.description or "",
            ]
        )
    return buffer.getvalue()


def project_summary_to_pdf(
    project: Project, metrics: EVMMetrics, scurve: list[SCurvePoint], as_of: date
) -> bytes:
    """A simple one-page PDF: project header, KPI table, and the S-curve's
    numbers as a table (section 4.1 point 24: "PDF simple del resumen de
    proyecto — curva S + KPIs"; no chart rendering, just the figures)."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"Project Summary — {project.name}", styles["Title"]),
        Paragraph(f"Status: {project.status.value} — As of: {as_of.isoformat()}", styles["Normal"]),
        Spacer(1, 0.25 * inch),
        Paragraph("Key Performance Indicators", styles["Heading2"]),
    ]

    kpi_data = [
        ["Metric", "Value"],
        ["Planned Value (PV)", f"{metrics.pv:,.2f}"],
        ["Earned Value (EV)", f"{metrics.ev:,.2f}"],
        ["Actual Cost (AC)", f"{metrics.ac:,.2f}"],
        ["SPI", f"{metrics.spi:.2f}" if metrics.spi is not None else "N/A"],
        ["CPI", f"{metrics.cpi:.2f}" if metrics.cpi is not None else "N/A"],
    ]
    story.append(_styled_table(kpi_data))
    story.append(Spacer(1, 0.25 * inch))

    story.append(Paragraph("S-Curve (weekly)", styles["Heading2"]))
    if scurve:
        curve_data = [["Week Ending", "PV", "EV", "AC", "SPI", "CPI"]]
        for point in scurve:
            curve_data.append(
                [
                    point.week_ending.isoformat(),
                    f"{point.metrics.pv:,.2f}",
                    f"{point.metrics.ev:,.2f}",
                    f"{point.metrics.ac:,.2f}",
                    f"{point.metrics.spi:.2f}" if point.metrics.spi is not None else "N/A",
                    f"{point.metrics.cpi:.2f}" if point.metrics.cpi is not None else "N/A",
                ]
            )
        story.append(_styled_table(curve_data))
    else:
        story.append(Paragraph("No baseline saved yet — nothing to plot.", styles["Normal"]))

    doc.build(story)
    return buffer.getvalue()


def _styled_table(data: list[list[str]]) -> Table:
    table = Table(data)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2E3440")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F0F0F0")]),
            ]
        )
    )
    return table
