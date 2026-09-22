"""add created_by_jira_import flag to task_dependencies

Revision ID: 678519ce9120
Revises: cc80cc2c6d45
Create Date: 2026-09-21 21:38:22.243511

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "678519ce9120"
down_revision: str | None = "cc80cc2c6d45"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "task_dependencies",
        sa.Column(
            "created_by_jira_import",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("task_dependencies", "created_by_jira_import")
