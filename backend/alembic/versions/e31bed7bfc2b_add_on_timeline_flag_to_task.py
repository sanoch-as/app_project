"""add on_timeline flag to task

Revision ID: e31bed7bfc2b
Revises: 152d1762e3f1
Create Date: 2026-09-22 12:41:48.565409

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e31bed7bfc2b"
down_revision: str | None = "152d1762e3f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column(
            "on_timeline",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("tasks", "on_timeline")
