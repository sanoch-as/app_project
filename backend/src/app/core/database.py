from collections.abc import AsyncGenerator

from sqlalchemy import Enum as SAEnum
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.enums import (
    DateFormat,
    DependencyType,
    Language,
    ProjectStatus,
    TaskPriority,
    TaskStatus,
    UserRole,
)


def _pg_enum(enum_cls: type, name: str) -> SAEnum:
    # Store the Python enum's *value* (e.g. "member"), not its member name
    # ("MEMBER"), as the Postgres enum's labels — matches the lowercase
    # values used throughout the API/schemas/spec.
    return SAEnum(enum_cls, name=name, values_callable=lambda obj: [e.value for e in obj])


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models.

    `eager_defaults=True`: server-computed columns (`created_at`/`updated_at`'s
    `func.now()`, `id`'s `gen_random_uuid()`) are fetched back via RETURNING
    on the same flush, instead of being marked "expired" for lazy reload on
    next access. Under the async engine, an expired attribute touched outside
    an awaited context (e.g. Pydantic's synchronous `model_validate`) raises
    `MissingGreenlet` rather than transparently awaiting a reload."""

    __mapper_args__ = {"eager_defaults": True}

    type_annotation_map = {
        UserRole: _pg_enum(UserRole, "user_role"),
        ProjectStatus: _pg_enum(ProjectStatus, "project_status"),
        TaskStatus: _pg_enum(TaskStatus, "task_status"),
        TaskPriority: _pg_enum(TaskPriority, "task_priority"),
        DependencyType: _pg_enum(DependencyType, "dependency_type"),
        Language: _pg_enum(Language, "language"),
        DateFormat: _pg_enum(DateFormat, "date_format"),
    }


# Serverless-friendly engine: NullPool (no cross-invocation pooling — Neon's own
# pooled/-pooler connection string, via PgBouncer, does the real pooling) and
# statement_cache_size=0 so asyncpg never issues prepared statements, which
# PgBouncer's transaction pooling mode cannot support. See docs/architecture.md.
engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
    connect_args={"statement_cache_size": 0} if "asyncpg" in settings.database_url else {},
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
