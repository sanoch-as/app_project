import uuid

from app.core.enums import ReferencedEntityType
from app.services.mention_extraction import extract_mentions


def _mention(entity_type: str, entity_id: object) -> dict:
    return {"type": "mention", "attrs": {"id": entity_id, "entityType": entity_type}}


def test_empty_content_yields_no_mentions():
    assert extract_mentions({"type": "doc", "content": []}) == set()


def test_finds_mentions_nested_arbitrarily_deep():
    task_id = uuid.uuid4()
    project_id = uuid.uuid4()
    content = {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "See "},
                    _mention("task", str(task_id)),
                ],
            },
            {
                "type": "table",
                "content": [
                    {
                        "type": "tableRow",
                        "content": [
                            {
                                "type": "tableCell",
                                "content": [
                                    {
                                        "type": "paragraph",
                                        "content": [_mention("project", str(project_id))],
                                    }
                                ],
                            }
                        ],
                    }
                ],
            },
        ],
    }
    assert extract_mentions(content) == {
        (ReferencedEntityType.TASK, task_id),
        (ReferencedEntityType.PROJECT, project_id),
    }


def test_dedupes_repeated_mentions_of_the_same_target():
    page_id = uuid.uuid4()
    content = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [_mention("page", str(page_id))]},
            {"type": "paragraph", "content": [_mention("page", str(page_id))]},
        ],
    }
    assert extract_mentions(content) == {(ReferencedEntityType.PAGE, page_id)}


def test_ignores_mention_with_missing_id():
    content = {"type": "doc", "content": [{"type": "mention", "attrs": {"entityType": "task"}}]}
    assert extract_mentions(content) == set()


def test_ignores_mention_with_invalid_uuid():
    content = {
        "type": "doc",
        "content": [{"type": "mention", "attrs": {"id": "not-a-uuid", "entityType": "task"}}],
    }
    assert extract_mentions(content) == set()


def test_ignores_mention_with_unrecognized_entity_type():
    content = {
        "type": "doc",
        "content": [
            {"type": "mention", "attrs": {"id": str(uuid.uuid4()), "entityType": "database"}}
        ],
    }
    assert extract_mentions(content) == set()


def test_ignores_mention_with_no_attrs_at_all():
    content = {"type": "doc", "content": [{"type": "mention"}]}
    assert extract_mentions(content) == set()
