import csv
import io
from datetime import date

import pytest

from app.core.enums import TaskPriority, TaskStatus
from app.core.exceptions import ValidationAppError
from app.services.jira_csv_parser import (
    MAX_IMPORT_ROWS,
    PROJECT_ROOT_ISSUE_KEY,
    JiraTaskNode,
    ParsedJiraCsv,
    build_sequential_dependencies,
    parse_jira_csv,
    parse_jira_date,
    resolve_priority,
    resolve_status,
)
from app.services.rollup import RollupChildInput, compute_rollup
from app.services.working_calendar import WorkingCalendar

CALENDAR = WorkingCalendar(working_days_per_week=5, holidays=frozenset())
PROJECT_NAME = "Test Project"


def _parse(content: bytes) -> ParsedJiraCsv:
    return parse_jira_csv(content, CALENDAR, PROJECT_NAME)


def _real_roots(parsed: ParsedJiraCsv) -> list[JiraTaskNode]:
    """`parsed.roots` is always exactly one synthetic project-summary node
    (ADR-036) — this unwraps to what used to be `parsed.roots` pre-ADR-036:
    the real top-level nodes parsed straight from the CSV."""
    assert len(parsed.roots) == 1
    assert parsed.roots[0].issue_key == PROJECT_ROOT_ISSUE_KEY
    return parsed.roots[0].children


_BASE_ROW = {
    "Clave de incidencia": "",
    "Resumen": "",
    "Categoría de estado": "Por hacer",
    "Estado": "Tareas por hacer",
    "Prioridad": "Medium",
    "Clave principal": "",
    "Campo personalizado (Target start)": "",
    "Campo personalizado (Fecha de inicio)": "",
    "Campo personalizado (Target end)": "",
    "Fecha de vencimiento": "",
    "Presupuesto": "",
    "Campo personalizado (Budget)": "",
    "Estimación original": "",
}


def _make_csv(rows: list[dict], *, bom: bool = False) -> bytes:
    buffer = io.StringIO()
    fieldnames = list(_BASE_ROW.keys())
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        full_row = {**_BASE_ROW, **row}
        writer.writerow(full_row)
    text = buffer.getvalue()
    return text.encode("utf-8-sig") if bom else text.encode("utf-8")


def _row(issue_key: str, **overrides: str) -> dict:
    return {"Clave de incidencia": issue_key, "Resumen": issue_key, **overrides}


# --- parse_jira_date ---------------------------------------------------


@pytest.mark.parametrize(
    ("month_abbr", "month_num"),
    [
        ("ene", 1),
        ("feb", 2),
        ("mar", 3),
        ("abr", 4),
        ("may", 5),
        ("jun", 6),
        ("jul", 7),
        ("ago", 8),
        ("sep", 9),
        ("oct", 10),
        ("nov", 11),
        ("dic", 12),
    ],
)
def test_parse_jira_date_all_spanish_months(month_abbr, month_num):
    assert parse_jira_date(f"15/{month_abbr}/26 10:00 AM") == date(2026, month_num, 15)


def test_parse_jira_date_two_digit_year_becomes_2000s():
    assert parse_jira_date("01/sep/26 12:00 AM") == date(2026, 9, 1)


def test_parse_jira_date_unparseable_returns_none():
    assert parse_jira_date("not a date") is None
    assert parse_jira_date("") is None
    assert parse_jira_date(None) is None


# --- resolve_status / resolve_priority ---------------------------------


def test_resolve_status_maps_category():
    assert resolve_status("Por hacer", "Tareas por hacer") == TaskStatus.NOT_STARTED
    assert resolve_status("En curso", "In Progress") == TaskStatus.IN_PROGRESS
    assert resolve_status("Listo", "Done") == TaskStatus.COMPLETED


def test_resolve_status_literal_blocked_overrides_category():
    assert resolve_status("En curso", "Bloqueado") == TaskStatus.BLOCKED
    assert resolve_status("To Do", "Blocked") == TaskStatus.BLOCKED


def test_resolve_priority_known_values_case_insensitive():
    assert resolve_priority("low") == TaskPriority.LOW
    assert resolve_priority("Medium") == TaskPriority.MEDIUM
    assert resolve_priority("HIGH") == TaskPriority.HIGH
    assert resolve_priority("Highest") == TaskPriority.CRITICAL
    assert resolve_priority("Urgent") == TaskPriority.CRITICAL


def test_resolve_priority_unknown_falls_back_to_medium():
    assert resolve_priority("Whatever") == TaskPriority.MEDIUM
    assert resolve_priority(None) == TaskPriority.MEDIUM


# --- parse_jira_csv: hierarchy ------------------------------------------


def test_parse_jira_csv_builds_four_level_hierarchy_no_hardcoded_depth():
    content = _make_csv(
        [
            _row("A", **{"Fecha de vencimiento": "14/sep/26 12:00 AM"}),
            _row("B", **{"Clave principal": "A", "Fecha de vencimiento": "14/sep/26 12:00 AM"}),
            _row("C", **{"Clave principal": "B", "Fecha de vencimiento": "14/sep/26 12:00 AM"}),
            _row("D", **{"Clave principal": "C", "Fecha de vencimiento": "14/sep/26 12:00 AM"}),
        ]
    )
    parsed = _parse(content)
    roots = _real_roots(parsed)
    assert len(roots) == 1
    a = roots[0]
    assert a.issue_key == "A"
    assert [c.issue_key for c in a.children] == ["B"]
    b = a.children[0]
    assert [c.issue_key for c in b.children] == ["C"]
    c = b.children[0]
    assert [c2.issue_key for c2 in c.children] == ["D"]
    d = c.children[0]
    assert d.children == []


def test_parse_jira_csv_dangling_parent_becomes_root_with_warning():
    content = _make_csv([_row("A", **{"Clave principal": "GHOST"})])
    parsed = _parse(content)
    assert [n.issue_key for n in _real_roots(parsed)] == ["A"]
    assert any("GHOST" in w for w in parsed.warnings)


def test_parse_jira_csv_cycle_becomes_root_with_warning():
    content = _make_csv(
        [
            _row("A", **{"Clave principal": "B"}),
            _row("B", **{"Clave principal": "A"}),
        ]
    )
    parsed = _parse(content)
    # Both can't be root together with the other as parent — the cycle must
    # be broken somewhere, and it should be reported.
    assert any("cycle" in w for w in parsed.warnings)
    assert len(_real_roots(parsed)) >= 1


def test_parse_jira_csv_duplicate_issue_key_keeps_first_and_warns():
    content = _make_csv([_row("A", Resumen="First"), _row("A", Resumen="Second")])
    parsed = _parse(content)
    roots = _real_roots(parsed)
    assert len(roots) == 1
    assert roots[0].name == "First"
    assert any("Duplicate issue key A" in w for w in parsed.warnings)


# --- parse_jira_csv: rollup + percent_complete --------------------------


def test_parse_jira_csv_parent_rollup_matches_compute_rollup():
    content = _make_csv(
        [
            _row(
                "PARENT",
            ),
            _row(
                "C1",
                **{
                    "Clave principal": "PARENT",
                    "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
                    "Fecha de vencimiento": "14/sep/26 12:00 AM",
                    "Categoría de estado": "Listo",
                },
            ),
            _row(
                "C2",
                **{
                    "Clave principal": "PARENT",
                    "Campo personalizado (Fecha de inicio)": "16/sep/26 12:00 AM",
                    "Fecha de vencimiento": "18/sep/26 12:00 AM",
                    "Categoría de estado": "Por hacer",
                },
            ),
        ]
    )
    parsed = _parse(content)
    parent = _real_roots(parsed)[0]
    c1, c2 = parent.children
    assert c1.percent_complete == 100.0  # "Listo" leaf
    assert c2.percent_complete == 0.0  # "Por hacer" leaf

    expected = compute_rollup(
        [
            RollupChildInput(
                c1.start_date,
                c1.end_date,
                c1.duration_days,
                c1.budgeted_cost,
                c1.percent_complete,
                c1.leaf_duration_days,
            ),
            RollupChildInput(
                c2.start_date,
                c2.end_date,
                c2.duration_days,
                c2.budgeted_cost,
                c2.percent_complete,
                c2.leaf_duration_days,
            ),
        ],
        CALENDAR,
    )
    assert parent.start_date == expected.start_date
    assert parent.end_date == expected.end_date
    assert parent.duration_days == expected.duration_days
    assert parent.percent_complete == expected.percent_complete


# --- parse_jira_csv: date fallback chain + defaults ---------------------


def test_parse_jira_csv_prefers_target_dates_over_custom_fields():
    content = _make_csv(
        [
            _row(
                "A",
                **{
                    "Campo personalizado (Target start)": "01/sep/26 12:00 AM",
                    "Campo personalizado (Fecha de inicio)": "20/sep/26 12:00 AM",
                    "Campo personalizado (Target end)": "05/sep/26 12:00 AM",
                    "Fecha de vencimiento": "25/sep/26 12:00 AM",
                },
            )
        ]
    )
    parsed = _parse(content)
    assert _real_roots(parsed)[0].start_date == date(2026, 9, 1)


def test_parse_jira_csv_missing_dates_default_to_today():
    content = _make_csv([_row("A")])
    parsed = _parse(content)
    node = _real_roots(parsed)[0]
    assert node.start_date == date.today()
    assert node.duration_days >= 1


def test_parse_jira_csv_bom_and_plain_utf8_parse_identically():
    rows = [_row("A")]
    plain = _parse(_make_csv(rows, bom=False))
    with_bom = _parse(_make_csv(rows, bom=True))
    assert [n.issue_key for n in _real_roots(plain)] == [n.issue_key for n in _real_roots(with_bom)]


def test_parse_jira_csv_rejects_too_many_rows():
    rows = [_row(f"T{i}") for i in range(MAX_IMPORT_ROWS + 1)]
    with pytest.raises(ValidationAppError):
        _parse(_make_csv(rows))


# --- parse_jira_csv: synthetic project-summary root (ADR-036) ----------


def test_parse_jira_csv_wraps_everything_under_a_project_root():
    content = _make_csv([_row("A"), _row("B", **{"Clave principal": "A"})])
    parsed = _parse(content)
    assert len(parsed.roots) == 1
    project_root = parsed.roots[0]
    assert project_root.issue_key == PROJECT_ROOT_ISSUE_KEY
    assert project_root.name == PROJECT_NAME
    assert [n.issue_key for n in project_root.children] == ["A"]


def test_parse_jira_csv_project_root_rolls_up_from_every_phase():
    content = _make_csv(
        [
            _row(
                "A",
                **{
                    "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
                    "Fecha de vencimiento": "14/sep/26 12:00 AM",
                    "Categoría de estado": "Listo",
                },
            ),
            _row(
                "B",
                **{
                    "Campo personalizado (Fecha de inicio)": "16/sep/26 12:00 AM",
                    "Fecha de vencimiento": "18/sep/26 12:00 AM",
                    "Categoría de estado": "Por hacer",
                },
            ),
        ]
    )
    parsed = _parse(content)
    project_root = parsed.roots[0]
    a, b = project_root.children
    expected = compute_rollup(
        [
            RollupChildInput(
                a.start_date,
                a.end_date,
                a.duration_days,
                a.budgeted_cost,
                a.percent_complete,
                a.leaf_duration_days,
            ),
            RollupChildInput(
                b.start_date,
                b.end_date,
                b.duration_days,
                b.budgeted_cost,
                b.percent_complete,
                b.leaf_duration_days,
            ),
        ],
        CALENDAR,
    )
    assert project_root.start_date == expected.start_date
    assert project_root.end_date == expected.end_date
    assert project_root.percent_complete == expected.percent_complete


def test_parse_jira_csv_gap_inside_nested_parent_matches_flat_leaf_average():
    # SUBPARENT's own calendar span is inflated by a 2-week gap between G1
    # and G2 — before ADR-037, that inflated span (not the true combined
    # duration of G1+G2) would have been used as SUBPARENT's weight one
    # level up at PHASE, giving PHASE a % complete that didn't match a flat
    # duration-weighted average over its real leaf tasks (G1, G2, LEAF3).
    content = _make_csv(
        [
            _row("PHASE"),
            _row("SUBPARENT", **{"Clave principal": "PHASE"}),
            _row(
                "G1",
                **{
                    "Clave principal": "SUBPARENT",
                    "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
                    "Fecha de vencimiento": "14/sep/26 12:00 AM",
                    "Categoría de estado": "Listo",
                },
            ),
            _row(
                "G2",
                **{
                    "Clave principal": "SUBPARENT",
                    "Campo personalizado (Fecha de inicio)": "28/sep/26 12:00 AM",
                    "Fecha de vencimiento": "28/sep/26 12:00 AM",
                    "Categoría de estado": "Por hacer",
                },
            ),
            _row(
                "LEAF3",
                **{
                    "Clave principal": "PHASE",
                    "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
                    "Fecha de vencimiento": "23/sep/26 12:00 AM",
                    "Categoría de estado": "Por hacer",
                },
            ),
        ]
    )
    parsed = _parse(content)
    phase = _real_roots(parsed)[0]
    subparent = next(c for c in phase.children if c.issue_key == "SUBPARENT")
    leaf3 = next(c for c in phase.children if c.issue_key == "LEAF3")
    g1, g2 = subparent.children

    # SUBPARENT's own span IS inflated by the gap...
    assert subparent.duration_days > g1.duration_days + g2.duration_days
    # ...but its leaf_duration_days is the true, gap-free sum.
    assert subparent.leaf_duration_days == g1.duration_days + g2.duration_days

    flat_leaves = [g1, g2, leaf3]
    total = sum(leaf.duration_days for leaf in flat_leaves)
    expected_flat_average = (
        sum(leaf.percent_complete * leaf.duration_days for leaf in flat_leaves) / total
    )

    assert phase.percent_complete == expected_flat_average


def test_parse_jira_csv_project_root_with_no_rows_still_returned():
    content = _make_csv([])
    parsed = _parse(content)
    assert len(parsed.roots) == 1
    project_root = parsed.roots[0]
    assert project_root.name == PROJECT_NAME
    assert project_root.children == []


# --- build_sequential_dependencies ---------------------------------------


def test_build_sequential_dependencies_chains_leaf_siblings_by_start_date():
    content = _make_csv(
        [
            _row("PHASE"),
            _row(
                "C2",
                **{
                    "Clave principal": "PHASE",
                    "Campo personalizado (Fecha de inicio)": "16/sep/26 12:00 AM",
                },
            ),
            _row(
                "C1",
                **{
                    "Clave principal": "PHASE",
                    "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
                },
            ),
            _row(
                "C3",
                **{
                    "Clave principal": "PHASE",
                    "Campo personalizado (Fecha de inicio)": "20/sep/26 12:00 AM",
                },
            ),
        ]
    )
    parsed = _parse(content)
    edges = build_sequential_dependencies(parsed.roots)
    # Chained by start_date regardless of CSV row order: C1 (14th) -> C2
    # (16th) -> C3 (20th).
    assert edges == [("C1", "C2"), ("C2", "C3")]


def test_build_sequential_dependencies_ties_broken_by_csv_row_order():
    content = _make_csv(
        [
            _row("PHASE"),
            _row("C1", **{"Clave principal": "PHASE"}),
            _row("C2", **{"Clave principal": "PHASE"}),
        ]
    )
    parsed = _parse(content)
    edges = build_sequential_dependencies(parsed.roots)
    assert edges == [("C1", "C2")]


def test_build_sequential_dependencies_does_not_chain_root_phases_together():
    content = _make_csv(
        [
            _row("PHASE1"),
            _row("PHASE1_CHILD", **{"Clave principal": "PHASE1"}),
            _row("PHASE2"),
            _row("PHASE2_CHILD", **{"Clave principal": "PHASE2"}),
        ]
    )
    parsed = _parse(content)
    edges = build_sequential_dependencies(parsed.roots)
    assert ("PHASE1", "PHASE2") not in edges
    assert ("PHASE1_CHILD", "PHASE2_CHILD") not in edges
    assert edges == []


def test_build_sequential_dependencies_skips_mixed_leaf_and_parent_siblings():
    content = _make_csv(
        [
            _row("PHASE"),
            _row("LEAF", **{"Clave principal": "PHASE"}),
            _row("PARENT", **{"Clave principal": "PHASE"}),
            _row("GRANDCHILD", **{"Clave principal": "PARENT"}),
        ]
    )
    parsed = _parse(content)
    edges = build_sequential_dependencies(parsed.roots)
    # LEAF and PARENT are siblings but PARENT has its own child, so that
    # sibling group is left unchained entirely — a dependency touching a
    # task with children would be inert under CPM (ADR-030).
    assert edges == []


def test_build_sequential_dependencies_single_child_produces_no_edge():
    content = _make_csv([_row("PHASE"), _row("ONLY_CHILD", **{"Clave principal": "PHASE"})])
    parsed = _parse(content)
    assert build_sequential_dependencies(parsed.roots) == []


def test_build_sequential_dependencies_recurses_into_nested_leaf_groups():
    content = _make_csv(
        [
            _row("PHASE"),
            _row("SUBPHASE", **{"Clave principal": "PHASE"}),
            _row(
                "G1",
                **{
                    "Clave principal": "SUBPHASE",
                    "Campo personalizado (Fecha de inicio)": "14/sep/26 12:00 AM",
                },
            ),
            _row(
                "G2",
                **{
                    "Clave principal": "SUBPHASE",
                    "Campo personalizado (Fecha de inicio)": "16/sep/26 12:00 AM",
                },
            ),
        ]
    )
    parsed = _parse(content)
    edges = build_sequential_dependencies(parsed.roots)
    assert edges == [("G1", "G2")]
