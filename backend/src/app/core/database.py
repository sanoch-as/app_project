from collections.abc import AsyncGenerator

from sqlalchemy import Enum as SAEnum
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.enums import DependencyType, ProjectStatus, TaskPriority, TaskStatus, UserRole


def _pg_enum(enum_cls: type, name: str) -> SAEnum:
    # Store the Python enum's *value* (e.g. "member"), not its member name
    # ("MEMBER"), as the Postgres enum's labels — matches the lowercase
    # values used throughout the API/schemas/spec.
    return SAEnum(enum_cls, name=name, values_callable=lambda obj: [e.value for e in obj])


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""

    type_annotation_map = {
        UserRole: _pg_enum(UserRole, "user_role"),
        ProjectStatus: _pg_enum(ProjectStatus, "project_status"),
        TaskStatus: _pg_enum(TaskStatus, "task_status"),
        TaskPriority: _pg_enum(TaskPriority, "task_priority"),
        DependencyType: _pg_enum(DependencyType, "dependency_type"),
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
