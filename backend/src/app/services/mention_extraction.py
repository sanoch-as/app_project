"""Pure, DB-free walk of a Tiptap JSON document (`Page.content`) looking for
mention nodes — no side effects, easy to unit-test in isolation (mirrors
rollup.py/critical_path.py's "pure algorithm" shape, ADR-042).

A mention node's shape is defined by this app's own custom Tiptap extension,
not by Tiptap itself:
    {"type": "mention", "attrs": {"id": "<uuid>", "entityType": "...", "label": "..."}}
`entityType` is one of "project"/"task"/"page".
"""

import contextlib
import uuid
from typing import Any

from app.core.enums import ReferencedEntityType

_VALID_ENTITY_TYPES = {member.value for member in ReferencedEntityType}


def extract_mentions(content: dict[str, Any]) -> set[tuple[ReferencedEntityType, uuid.UUID]]:
    """Never raises — a malformed mention node (missing/invalid `id`, an
    unrecognized `entityType`) is silently skipped rather than failing the
    whole save, since `content` ultimately comes from client-authored JSON."""
    found: set[tuple[ReferencedEntityType, uuid.UUID]] = set()

    def visit(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "mention":
                attrs = node.get("attrs") or {}
                raw_type = attrs.get("entityType")
                raw_id = attrs.get("id")
                if raw_type in _VALID_ENTITY_TYPES and raw_id:
                    with contextlib.suppress(ValueError, AttributeError, TypeError):
                        found.add((ReferencedEntityType(raw_type), uuid.UUID(str(raw_id))))
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    visit(content)
    return found
