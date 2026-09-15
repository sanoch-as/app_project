"""add task_progress_snapshots

Revision ID: 3342ac5b8bc9
Revises: 3b2585db1300
Create Date: 2026-09-15 14:19:39.761420

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3342ac5b8bc9"
down_revision: str | None = "3b2585db1300"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "task_progress_snapshots",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("task_id", sa.UUID(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("percent_complete", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "task_id", "snapshot_date", name="uq_task_progress_snapshots_task_date"
        ),
    )
    op.create_index(
        "ix_task_progress_snapshots_project_date",
        "task_progress_snapshots",
        ["project_id", "snapshot_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_task_progress_snapshots_project_date", table_name="task_progress_snapshots")
    op.drop_table("task_progress_snapshots")
