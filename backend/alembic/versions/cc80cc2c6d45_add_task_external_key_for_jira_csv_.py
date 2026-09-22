"""add task external_key for jira csv import

Revision ID: cc80cc2c6d45
Revises: edcc91cbe2f0
Create Date: 2026-09-21 20:52:54.352162

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cc80cc2c6d45"
down_revision: str | None = "edcc91cbe2f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("external_key", sa.String(length=64), nullable=True))
    op.create_unique_constraint(
        "uq_tasks_project_external_key", "tasks", ["project_id", "external_key"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_tasks_project_external_key", "tasks", type_="unique")
    op.drop_column("tasks", "external_key")
