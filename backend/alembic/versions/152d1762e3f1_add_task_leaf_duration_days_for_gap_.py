"""add task leaf_duration_days for gap-corrected rollup weighting

Revision ID: 152d1762e3f1
Revises: 678519ce9120
Create Date: 2026-09-22 00:05:41.649213

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "152d1762e3f1"
down_revision: str | None = "678519ce9120"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("leaf_duration_days", sa.Integer(), nullable=True))

    # Backfill for existing rows (see ADR-037). A leaf's leaf_duration_days
    # is its own duration_days, and its percent_complete is already correct
    # (never touched by the bug this migration fixes). A parent's
    # leaf_duration_days is the recursive sum of its children's, and its
    # percent_complete is recomputed at the same time using that corrected
    # weight (Σ(child.percent × child.leaf_duration) / Σ(child.leaf_duration),
    # falling back to a plain average when every child has zero leaf
    # duration — same formula as rollup.compute_rollup) — this is the field
    # the original bug actually got wrong, so it must be corrected here too,
    # not just its supporting weight; otherwise every existing project would
    # keep showing its old, wrong % complete until something happened to
    # touch it. Resolved bottom-up: repeated passes (bounded, well beyond any
    # realistic WBS depth) resolve one more complete tree level each time; a
    # parent is only finalized once ALL of its children already have a
    # non-null leaf_duration_days, so a partial/premature result is never
    # written.
    op.execute("""
        UPDATE tasks
        SET leaf_duration_days = duration_days
        WHERE id NOT IN (
            SELECT DISTINCT parent_task_id FROM tasks WHERE parent_task_id IS NOT NULL
        )
        """)
    for _ in range(15):
        op.execute("""
            UPDATE tasks p
            SET leaf_duration_days = sub.total_leaf,
                percent_complete = CASE
                    WHEN sub.total_leaf > 0 THEN sub.weighted_sum / sub.total_leaf
                    ELSE sub.plain_avg
                END
            FROM (
                SELECT
                    parent_task_id AS id,
                    SUM(leaf_duration_days) AS total_leaf,
                    SUM(percent_complete * leaf_duration_days) AS weighted_sum,
                    AVG(percent_complete) AS plain_avg
                FROM tasks c
                WHERE c.parent_task_id IS NOT NULL
                GROUP BY parent_task_id
                HAVING COUNT(*) FILTER (WHERE leaf_duration_days IS NULL) = 0
            ) sub
            WHERE p.id = sub.id AND p.leaf_duration_days IS NULL
            """)
    # Defensive fallback only (should never fire for a valid, acyclic WBS
    # tree): anything still unresolved falls back to its own span, keeping
    # its already-stored percent_complete untouched.
    op.execute(
        "UPDATE tasks SET leaf_duration_days = duration_days WHERE leaf_duration_days IS NULL"
    )

    op.alter_column("tasks", "leaf_duration_days", nullable=False)


def downgrade() -> None:
    op.drop_column("tasks", "leaf_duration_days")
