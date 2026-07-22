from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from config import Config


def _local_tz() -> ZoneInfo:
    name = getattr(Config, "TIMEZONE", None) or "Asia/Kolkata"
    try:
        return ZoneInfo(str(name))
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def now_local_naive() -> datetime:
    """
    Return current time in the configured local timezone, but as a *naive* datetime.
    This matches how sqlite stores DateTime fields in this project.
    """
    tz = _local_tz()
    return datetime.now(tz).replace(tzinfo=None)


def now_utc_naive() -> datetime:
    """
    Current UTC time as naive datetime (useful for token expiry calculations only).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)

