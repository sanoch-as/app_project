"""add documentation module spaces pages page references

Revision ID: 68a4660fff12
Revises: e31bed7bfc2b
Create Date: 2026-09-23 13:08:40.246503

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "68a4660fff12"
down_revision: str | None = "e31bed7bfc2b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "spaces",
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=32), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_spaces_organization_id"), "spaces", ["organization_id"], unique=False)
    op.create_index(op.f("ix_spaces_project_id"), "spaces", ["project_id"], unique=False)

    op.create_table(
        "pages",
        sa.Column("space_id", sa.UUID(), nullable=False),
        sa.Column("parent_page_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column(
            "content",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text('\'{"type": "doc", "content": []}\'::jsonb'),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_page_id"], ["pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_pages_space_id"), "pages", ["space_id"], unique=False)
    op.create_index(op.f("ix_pages_parent_page_id"), "pages", ["parent_page_id"], unique=False)

    op.create_table(
        "page_references",
        sa.Column("page_id", sa.UUID(), nullable=False),
        sa.Column(
            "referenced_type",
            sa.Enum("project", "task", "page", name="referenced_entity_type"),
            nullable=False,
        ),
        sa.Column("referenced_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.ForeignKeyConstraint(["page_id"], ["pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "page_id",
            "referenced_type",
            "referenced_id",
            name="uq_page_references_page_type_target",
        ),
    )
    op.create_index(
        op.f("ix_page_references_page_id"), "page_references", ["page_id"], unique=False
    )
    op.create_index(
        "ix_page_references_target",
        "page_references",
        ["referenced_type", "referenced_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_page_references_target", table_name="page_references")
    op.drop_index(op.f("ix_page_references_page_id"), table_name="page_references")
    op.drop_table("page_references")
    op.drop_index(op.f("ix_pages_parent_page_id"), table_name="pages")
    op.drop_index(op.f("ix_pages_space_id"), table_name="pages")
    op.drop_table("pages")
    op.drop_index(op.f("ix_spaces_project_id"), table_name="spaces")
    op.drop_index(op.f("ix_spaces_organization_id"), table_name="spaces")
    op.drop_table("spaces")
    # `op.drop_table` doesn't drop the backing Postgres enum type on its own
    # (unlike the codebase's `3b2585db1300` initial migration, which never
    # needs its downgrade run in practice) — drop it explicitly so this
    # migration is actually re-runnable after a downgrade.
    sa.Enum(name="referenced_entity_type").drop(op.get_bind(), checkfirst=True)
