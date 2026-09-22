"""Parses a Jira Cloud CSV export into an in-memory WBS tree — pure, no DB
(same mold as rollup.py/working_calendar.py). services/jira_import_service.py
turns this tree into real Task rows. See ADR-034 for the design rationale.

Never raises over a single bad row — anything unmappable/missing/dangling
gets a sensible default plus a warning collected on `ParsedJiraCsv.warnings`,
so one messy row never aborts the whole import. The only thing that DOES
raise is a file with more than MAX_IMPORT_ROWS rows (see
jira_import_service.py's Vercel maxDuration reasoning).

`parse_jira_csv` always wraps every parsed root under one synthetic
project-summary node (`PROJECT_ROOT_ISSUE_KEY`, named after the project) so
the Tasks tab shows a single top-level row for the whole project's overall
duration/% complete — see ADR-036."""

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.core.enums import TaskPriority, TaskStatus
from app.core.exceptions import ValidationAppError
from app.services.rollup import RollupChildInput, compute_rollup
from app.services.working_calendar import WorkingCalendar

# Budgeted at ~30ms/row for the bulk importer's per-row DB round trip plus one
# whole-project CPM pass at the end, comfortably inside Vercel Hobby's 10s
# maxDuration (backend/vercel.json) — see jira_import_service.py.
MAX_IMPORT_ROWS = 200

# Sentinel external_key for the synthetic project-summary root task — never
# collides with a real Jira issue key (those always look like "ABC-123").
PROJECT_ROOT_ISSUE_KEY = "__jira_project_root__"

_MONTHS_ES = {
    "ene": 1,
    "feb": 2,
    "mar": 3,
    "abr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dic": 12,
}
_DATETIME_RE = re.compile(
    r"^\s*(?P<day>\d{1,2})/(?P<month>[a-zA-Z]{3})/(?P<year>\d{2,4})"
    r"\s+(?P<hour>\d{1,2}):(?P<minute>\d{2})\s*(?P<ampm>AM|PM)\s*$",
    re.IGNORECASE,
)

_STATUS_CATEGORY_MAP = {
    "por hacer": TaskStatus.NOT_STARTED,
    "to do": TaskStatus.NOT_STARTED,
    "en curso": TaskStatus.IN_PROGRESS,
    "in progress": TaskStatus.IN_PROGRESS,
    "listo": TaskStatus.COMPLETED,
    "done": TaskStatus.COMPLETED,
}
_PRIORITY_MAP = {
    "lowest": TaskPriority.LOW,
    "low": TaskPriority.LOW,
    "medium": TaskPriority.MEDIUM,
    "high": TaskPriority.HIGH,
    "highest": TaskPriority.CRITICAL,
    "urgent": TaskPriority.CRITICAL,
}


def parse_jira_date(raw: str | None) -> date | None:
    """Jira's Spanish-locale export datetime format, e.g. "15/sep/26 12:00 AM"
    — day/abbreviated-Spanish-month/2-or-4-digit-year, hour:minute AM|PM.
    Time of day is discarded (Task dates are calendar dates). Never raises —
    `None` for anything unparseable."""
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        return None
    match = _DATETIME_RE.match(raw)
    if match is None:
        return None
    month = _MONTHS_ES.get(match.group("month").lower())
    if month is None:
        return None
    year = int(match.group("year"))
    if year < 100:
        year += 2000
    try:
        return date(year, month, int(match.group("day")))
    except ValueError:
        return None


def resolve_status(status_category: str, literal_status: str) -> TaskStatus:
    """Jira's 3-bucket "status category" (present on every issue regardless
    of the site's custom workflow) maps directly to our enum — except
    "blocked", which isn't a real Jira category, so it's detected
    heuristically from the literal status name instead."""
    if "bloque" in literal_status.lower() or "block" in literal_status.lower():
        return TaskStatus.BLOCKED
    return _STATUS_CATEGORY_MAP.get(status_category.strip().lower(), TaskStatus.NOT_STARTED)


def resolve_priority(raw: str | None) -> TaskPriority:
    """Falls back to medium for any unrecognized value — an unmapped
    priority should never fail the whole import."""
    if raw is None:
        return TaskPriority.MEDIUM
    return _PRIORITY_MAP.get(raw.strip().lower(), TaskPriority.MEDIUM)


def _first_nonempty(row: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = (row.get(key) or "").strip()
        if value:
            return value
    return None


@dataclass
class JiraTaskNode:
    issue_key: str
    name: str
    status: TaskStatus
    priority: TaskPriority
    start_date: date
    end_date: date
    duration_days: int
    # For a leaf node, equals duration_days. For a parent, the recursive sum
    # of its children's leaf_duration_days — the weight compute_rollup uses
    # to roll percent_complete up the tree without distortion from gaps
    # between sibling tasks (see rollup.py, ADR-037).
    leaf_duration_days: int
    budgeted_cost: float
    percent_complete: float
    estimated_hours: float | None
    sibling_index: int = 0
    wbs_code: str = ""
    children: list["JiraTaskNode"] = field(default_factory=list)


@dataclass(frozen=True)
class ParsedJiraCsv:
    roots: list[JiraTaskNode]
    warnings: list[str]


def _has_cycle(issue_key: str, parent_key: str, raw_parent_of: dict[str, str]) -> bool:
    seen: set[str] = set()
    current: str | None = parent_key
    while current is not None:
        if current == issue_key:
            return True
        if current in seen:
            return False  # a cycle among ancestors that doesn't loop back to issue_key
        seen.add(current)
        current = raw_parent_of.get(current)
    return False


def read_csv_rows(content: bytes) -> list[dict[str, str]]:
    """Decodes + row-count-validates a Jira CSV export without needing a
    project's calendar — lets a caller validate an upload (e.g. before
    creating a new project for it) before any other DB work happens."""
    text = content.decode("utf-8-sig")  # transparently strips a BOM if present
    rows = list(csv.DictReader(io.StringIO(text)))
    if len(rows) > MAX_IMPORT_ROWS:
        raise ValidationAppError(
            f"CSV has {len(rows)} rows, exceeding the {MAX_IMPORT_ROWS}-row import limit",
            code="jira_import_too_many_rows",
        )
    return rows


def parse_jira_csv(content: bytes, calendar: WorkingCalendar, project_name: str) -> ParsedJiraCsv:
    rows = read_csv_rows(content)

    warnings: list[str] = []
    nodes_by_key: dict[str, JiraTaskNode] = {}
    raw_parent_of: dict[str, str] = {}

    for row in rows:
        issue_key = (row.get("Clave de incidencia") or "").strip()
        if not issue_key:
            warnings.append("Row with no issue key (Clave de incidencia) skipped")
            continue
        if issue_key in nodes_by_key:
            warnings.append(f"Duplicate issue key {issue_key} — second occurrence ignored")
            continue

        start_raw = _first_nonempty(
            row, "Campo personalizado (Target start)", "Campo personalizado (Fecha de inicio)"
        )
        due_raw = _first_nonempty(row, "Campo personalizado (Target end)", "Fecha de vencimiento")
        raw_start = parse_jira_date(start_raw) or date.today()
        raw_due = parse_jira_date(due_raw) or (raw_start + timedelta(days=1))
        if raw_due < raw_start:
            warnings.append(f"{issue_key}: due date before start date, clamped")
            raw_due = raw_start
        # Re-derive via the working calendar (ADR-012), same as task_service
        # .create_task, so the 3 date fields are always mutually consistent
        # even if Jira's due date lands on a non-working day.
        duration_days = max(calendar.working_days_between(raw_start, raw_due), 1)
        start_date = raw_start
        end_date = calendar.add_working_days(raw_start, duration_days)

        cost_raw = _first_nonempty(row, "Presupuesto", "Campo personalizado (Budget)")
        try:
            budgeted_cost = float(cost_raw) if cost_raw else 0.0
        except ValueError:
            budgeted_cost = 0.0

        estimate_raw = _first_nonempty(row, "Estimación original")
        try:
            # Jira exports time tracking in seconds.
            estimated_hours = float(estimate_raw) / 3600 if estimate_raw else None
        except ValueError:
            estimated_hours = None

        node = JiraTaskNode(
            issue_key=issue_key,
            name=(row.get("Resumen") or "").strip() or f"(untitled {issue_key})",
            status=resolve_status(row.get("Categoría de estado", ""), row.get("Estado", "")),
            priority=resolve_priority(row.get("Prioridad")),
            start_date=start_date,
            end_date=end_date,
            duration_days=duration_days,
            leaf_duration_days=duration_days,
            budgeted_cost=budgeted_cost,
            percent_complete=0.0,
            estimated_hours=estimated_hours,
        )
        nodes_by_key[issue_key] = node
        parent_key = (row.get("Clave principal") or "").strip()
        if parent_key:
            raw_parent_of[issue_key] = parent_key

    children_of: dict[str | None, list[str]] = {}
    for issue_key in nodes_by_key:
        raw_parent_key = raw_parent_of.get(issue_key)
        resolved_parent: str | None = None
        if raw_parent_key is not None:
            if raw_parent_key not in nodes_by_key:
                warnings.append(
                    f"{issue_key}: parent key {raw_parent_key} not found in this file — "
                    "imported as a root-level task"
                )
            elif _has_cycle(issue_key, raw_parent_key, raw_parent_of):
                warnings.append(
                    f"{issue_key}: parent chain forms a cycle — imported as a root-level task"
                )
            else:
                resolved_parent = raw_parent_key
        children_of.setdefault(resolved_parent, []).append(issue_key)

    def attach(parent_key: str | None) -> list[JiraTaskNode]:
        result = []
        for index, key in enumerate(children_of.get(parent_key, []), start=1):
            node = nodes_by_key[key]
            node.sibling_index = index
            node.children = attach(key)
            result.append(node)
        return result

    roots = attach(None)

    def finalize(node: JiraTaskNode) -> RollupChildInput:
        if node.children:
            child_inputs = [finalize(child) for child in node.children]
            result = compute_rollup(child_inputs, calendar)
            node.start_date = result.start_date
            node.end_date = result.end_date
            node.duration_days = result.duration_days
            node.budgeted_cost = result.budgeted_cost
            node.percent_complete = result.percent_complete
            node.leaf_duration_days = result.leaf_duration_days
        else:
            node.percent_complete = 100.0 if node.status == TaskStatus.COMPLETED else 0.0
            node.leaf_duration_days = node.duration_days
        return RollupChildInput(
            start_date=node.start_date,
            end_date=node.end_date,
            duration_days=node.duration_days,
            budgeted_cost=node.budgeted_cost,
            percent_complete=node.percent_complete,
            leaf_duration_days=node.leaf_duration_days,
        )

    # Every parsed root (each Jira "phase") becomes a child of one synthetic
    # project-summary task instead of a true top-level task itself — this is
    # the single row the Tasks tab shows for the whole project's overall
    # duration/% complete (ADR-036). Its own fields are placeholders:
    # `finalize` immediately overwrites them via the same roll-up path any
    # WBS parent already goes through, since it always has `roots` as
    # children (even an empty CSV still gets this row, just parked at
    # today's date with 0% complete).
    project_root = JiraTaskNode(
        issue_key=PROJECT_ROOT_ISSUE_KEY,
        name=project_name,
        status=TaskStatus.NOT_STARTED,
        priority=TaskPriority.MEDIUM,
        start_date=date.today(),
        end_date=date.today(),
        duration_days=1,
        leaf_duration_days=1,
        budgeted_cost=0.0,
        percent_complete=0.0,
        estimated_hours=None,
        sibling_index=1,
        children=roots,
    )
    finalize(project_root)

    return ParsedJiraCsv(roots=[project_root], warnings=warnings)


def build_sequential_dependencies(roots: list[JiraTaskNode]) -> list[tuple[str, str]]:
    """Jira's CSV export carries no usable predecessor/successor data (its
    "Elementos vinculados" field is empty in every real export seen so far),
    so a freshly imported project would otherwise have no schedule
    dependencies at all — editing one task would never cascade to the next.
    As a stand-in, every group of sibling *leaf* tasks (same parent, and none
    of them have children of their own) is chained Finish-to-Start in CSV
    start-date order (ties broken by their original CSV row order via
    `sibling_index`), independently at every level of the tree. A sibling
    group that mixes leaves and parent tasks is left unchained — parent
    tasks are excluded from CPM entirely (ADR-030), so a dependency touching
    one would be silently inert. See ADR-035."""
    edges: list[tuple[str, str]] = []

    def visit(nodes: list[JiraTaskNode]) -> None:
        if nodes and all(not node.children for node in nodes):
            ordered = sorted(nodes, key=lambda node: (node.start_date, node.sibling_index))
            for predecessor, successor in zip(ordered, ordered[1:], strict=False):
                edges.append((predecessor.issue_key, successor.issue_key))
        for node in nodes:
            if node.children:
                visit(node.children)

    visit(roots)
    return edges
