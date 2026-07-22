from __future__ import annotations

from typing import Dict

# In-memory store (no DB changes). Notes last only while the server is running.
_NOTES_BY_BATCH: Dict[int, str] = {}


def set_order_note(batch_id: int, note: str) -> None:
    try:
        bid = int(batch_id)
    except Exception:
        return
    if bid <= 0:
        return
    if not isinstance(note, str):
        return
    n = note.strip()
    if not n:
        return
    # Keep notes small to avoid memory abuse.
    _NOTES_BY_BATCH[bid] = n[:240]


def get_order_note(batch_id: int) -> str:
    try:
        bid = int(batch_id)
    except Exception:
        return ""
    return _NOTES_BY_BATCH.get(bid, "") or ""


def clear_order_note(batch_id: int) -> None:
    try:
        bid = int(batch_id)
    except Exception:
        return
    _NOTES_BY_BATCH.pop(bid, None)

