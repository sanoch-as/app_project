import uuid

from app.services.dependency_service import _would_create_cycle

A, B, C, D = (uuid.uuid4() for _ in range(4))


def test_no_cycle_on_empty_graph():
    assert not _would_create_cycle([], A, B)


def test_no_cycle_for_independent_chain():
    edges = [(A, B), (B, C)]
    assert not _would_create_cycle(edges, C, D)


def test_direct_cycle_detected():
    # A -> B already exists; adding B -> A would create a 2-node cycle.
    edges = [(A, B)]
    assert _would_create_cycle(edges, B, A)


def test_indirect_cycle_detected():
    # A -> B -> C exists; adding C -> A would close the loop.
    edges = [(A, B), (B, C)]
    assert _would_create_cycle(edges, C, A)


def test_self_dependency_is_a_cycle():
    assert _would_create_cycle([], A, A)


def test_diamond_shape_is_not_a_cycle():
    # A -> B, A -> C, B -> D, C -> D: a diamond, not a cycle.
    edges = [(A, B), (A, C), (B, D), (C, D)]
    assert not _would_create_cycle(edges, A, D)
