"""
Activity log — writes real-time events to Redis list.
Frontend polls /api/v1/activity/feed every 5 seconds.
Max 50 events stored, auto-expires after 1 hour.
"""

import json
from datetime import datetime, timezone
from app.core.logging import logger

ACTIVITY_KEY = "activity:feed"
MAX_EVENTS = 50

EVENT_META = {
    "ingestion_start": {"icon": "⟳", "color": "#7c7cdc", "label": "ingestion"},
    "ingestion_complete": {"icon": "✓", "color": "#22c55e", "label": "ingestion"},
    "ingestion_error": {"icon": "✕", "color": "#ef4444", "label": "ingestion"},
    "cache_warming": {"icon": "◈", "color": "#4a4a6a", "label": "cache"},
    "cache_warmed": {"icon": "◈", "color": "#22c55e", "label": "cache"},
    "signal_created": {"icon": "▲", "color": "#22c55e", "label": "signal"},
    "signal_rejected": {"icon": "▽", "color": "#4a4a6a", "label": "signal"},
    "signal_low_confidence": {"icon": "▽", "color": "#4a4a6a", "label": "signal"},
    "trade_approved": {"icon": "✓", "color": "#22c55e", "label": "trade"},
    "trade_failed": {"icon": "✕", "color": "#ef4444", "label": "trade"},
    "trade_rejected": {"icon": "—", "color": "#6a6a8a", "label": "trade"},
    "position_monitor": {"icon": "◉", "color": "#7c7cdc", "label": "monitor"},
    "stop_loss_triggered": {"icon": "⚠", "color": "#ef4444", "label": "monitor"},
    "take_profit_triggered": {"icon": "★", "color": "#22c55e", "label": "monitor"},
}


async def push_event(event_type: str, message: str, meta: dict = None):
    try:
        from app.db.redis_client import get_redis

        redis = await get_redis()
        m = EVENT_META.get(
            event_type, {"icon": "·", "color": "#4a4a6a", "label": "system"}
        )
        event = {
            "id": str(datetime.now(timezone.utc).timestamp()),
            "type": event_type,
            "message": message,
            "meta": meta or {},
            "icon": m["icon"],
            "color": m["color"],
            "label": m["label"],
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        await redis.lpush(ACTIVITY_KEY, json.dumps(event))
        await redis.ltrim(ACTIVITY_KEY, 0, MAX_EVENTS - 1)
        await redis.expire(ACTIVITY_KEY, 3600)
    except Exception as e:
        logger.error("activity.push_error", error=str(e))
