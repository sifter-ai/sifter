from typing import Any, Optional


def paginated(
    items: list[Any],
    total: int,
    limit: int,
    offset: int,
    next_cursor: Optional[str] = None,
) -> dict:
    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "next_cursor": next_cursor,
    }
