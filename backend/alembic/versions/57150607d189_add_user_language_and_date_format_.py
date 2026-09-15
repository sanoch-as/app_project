"""add user language and date_format preferences

Revision ID: 57150607d189
Revises: 3342ac5b8bc9
Create Date: 2026-09-15 16:22:33.982025

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "57150607d189"
down_revision: str | None = "3342ac5b8bc9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Unlike create_table, add_column on an existing table does not implicitly
    # create the Postgres ENUM type it references — create both explicitly first.
    postgresql.ENUM("es", "en", name="language").create(op.get_bind(), checkfirst=True)
    postgresql.ENUM("iso", "dmy", name="date_format").create(op.get_bind(), checkfirst=True)

    op.add_column(
        "users",
        sa.Column(
            "language", sa.Enum("es", "en", name="language"), server_default="es", nullable=False
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "date_format",
            sa.Enum("iso", "dmy", name="date_format"),
            server_default="dmy",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "date_format")
    op.drop_column("users", "language")
    postgresql.ENUM(name="date_format").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="language").drop(op.get_bind(), checkfirst=True)
