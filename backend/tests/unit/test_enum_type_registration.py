"""A StrEnum used as a `Mapped[...]` column type that isn't registered in
`Base.type_annotation_map` (core/database.py) silently gets a different,
auto-derived Postgres enum type name (e.g. `referencedentitytype`) than
whatever name an Alembic migration explicitly gives the real Postgres type
(e.g. `referenced_entity_type`, matching this app's snake_case naming
convention) — works fine against pytest's own `Base.metadata.create_all()`
schema (which derives its name the same auto way the ORM does, so the two
always agree with each other) but breaks with a real INSERT/SELECT against
any Alembic-migrated database, including production. This caught exactly
that bug once already (ADR-042, `ReferencedEntityType`) — this test exists
so the next new enum can't reintroduce it silently."""

import enum
import inspect

from app.core import enums as enums_module
from app.core.database import Base


def test_every_enum_in_core_enums_is_registered_in_type_annotation_map():
    declared_enums = [
        obj
        for _, obj in inspect.getmembers(enums_module)
        if inspect.isclass(obj)
        and issubclass(obj, enum.Enum)
        and obj.__module__ == enums_module.__name__
    ]
    assert declared_enums, "sanity check: app.core.enums should define at least one enum"

    missing = [e.__name__ for e in declared_enums if e not in Base.type_annotation_map]
    assert not missing, (
        f"{missing} defined in app/core/enums.py but missing from "
        "Base.type_annotation_map in app/core/database.py"
    )
