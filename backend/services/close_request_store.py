from services.time_service import now_local_naive

# Simple in-memory store for "request to close bill" signals.
# This avoids any DB schema changes. Not persistent across server restart.
_requests = {}  # table_number -> iso timestamp


def set_close_request(table_number: int) -> str:
    ts = now_local_naive().isoformat()
    _requests[int(table_number)] = ts
    return ts


def clear_close_request(table_number: int) -> None:
    try:
        _requests.pop(int(table_number), None)
    except Exception:
        pass


def has_close_request(table_number: int) -> bool:
    try:
        return int(table_number) in _requests
    except Exception:
        return False


def get_close_request_time(table_number: int):
    try:
        return _requests.get(int(table_number))
    except Exception:
        return None
