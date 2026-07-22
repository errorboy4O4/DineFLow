from __future__ import annotations

from collections import deque
from datetime import datetime
import threading
from typing import Any, Deque, Dict, List, Optional
from services.time_service import now_local_naive

_lock = threading.Lock()
_events: Deque[Dict[str, Any]] = deque(maxlen=500)
_next_id = 1


def summarize_dishes(items: Any, max_items: int = 2) -> str:
    """
    Create a compact "Dish xQty, Dish2 xQty (+N more)" summary.
    Accepts an iterable of OrderItem-like objects or dicts.
    """
    try:
        max_items = int(max_items or 2)
    except Exception:
        max_items = 2
    max_items = max(1, min(5, max_items))

    if not items:
        return ""

    counts: Dict[str, int] = {}

    def _get(obj: Any, key: str, default=None):
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    for it in (items or []):
        dish = _get(it, "dish", None)
        name = None
        if dish is not None:
            name = _get(dish, "name", None)
        if not name:
            name = _get(it, "custom_name", None) or _get(it, "name", None)
        name = str(name or "").strip() or "Dish"

        qty = _get(it, "quantity", None)
        if qty is None:
            qty = _get(it, "qty", None)
        try:
            qty_i = int(qty or 0)
        except Exception:
            qty_i = 0
        if qty_i <= 0:
            qty_i = 1

        counts[name] = int(counts.get(name, 0)) + qty_i

    if not counts:
        return ""

    parts = [f"{n} x{q}" for n, q in sorted(counts.items(), key=lambda kv: (-int(kv[1]), str(kv[0]).lower()))]
    shown = parts[:max_items]
    remaining = len(parts) - len(shown)
    if remaining > 0:
        shown.append(f"+{remaining} more")
    return ", ".join(shown)


def log_event(
    kind: str,
    message: str,
    *,
    table_number: Optional[int] = None,
    order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    item_id: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    In-memory activity log (temporary; cleared when server restarts).
    """
    global _next_id
    ev = {
        "id": None,
        # Store local-time ISO so dashboards match restaurant clock.
        "ts": now_local_naive().isoformat(),
        "kind": str(kind or "event"),
        "message": str(message or "").strip(),
        "table_number": int(table_number) if table_number is not None else None,
        "order_id": int(order_id) if order_id is not None else None,
        "batch_id": int(batch_id) if batch_id is not None else None,
        "item_id": int(item_id) if item_id is not None else None,
        "meta": meta or {},
    }
    with _lock:
        ev["id"] = _next_id
        _next_id += 1
        _events.append(ev)
    return ev


def list_events(limit: int = 50, since_id: Optional[int] = None) -> List[Dict[str, Any]]:
    try:
        limit = int(limit or 50)
    except Exception:
        limit = 50
    limit = max(1, min(200, limit))

    with _lock:
        items = list(_events)

    if since_id is not None:
        try:
            sid = int(since_id)
        except Exception:
            sid = None
        if sid is not None:
            items = [e for e in items if int(e.get("id") or 0) > sid]

    # Newest first
    items.sort(key=lambda e: int(e.get("id") or 0), reverse=True)
    return items[:limit]
