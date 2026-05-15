import asyncio
import httpx
from fastapi import APIRouter
from app.core.config import get_settings
from app.core.logging import logger

router = APIRouter(prefix="/macro", tags=["macro"])
settings = get_settings()

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

STRIP_SERIES = [
    {"id": "VIXCLS",   "label": "VIX",          "unit": "",    "invert": False},
    {"id": "FEDFUNDS", "label": "Fed Funds",     "unit": "%",   "invert": False},
    {"id": "T10Y2Y",   "label": "10Y-2Y",        "unit": "%",   "invert": False},
    {"id": "UNRATE",   "label": "Unemployment",  "unit": "%",   "invert": False},
    {"id": "DCOILWTICO","label": "WTI Oil",      "unit": "$",   "invert": False},
    {"id": "T10YIE",   "label": "10Y Breakeven", "unit": "%",   "invert": False},
]


def _fetch_latest(series_id: str) -> dict | None:
    try:
        with httpx.Client(timeout=8) as client:
            resp = client.get(FRED_BASE, params={
                "series_id": series_id,
                "api_key": settings.fred_api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 2,
            })
            resp.raise_for_status()
            obs = resp.json().get("observations", [])
            # find latest non-missing
            latest = next((o for o in obs if o["value"] != "."), None)
            prev   = next((o for o in obs[1:] if o["value"] != "."), None)
            if not latest:
                return None
            val  = float(latest["value"])
            prev_val = float(prev["value"]) if prev else val
            return {
                "value": val,
                "prev": prev_val,
                "change": round(val - prev_val, 4),
                "date": latest["date"],
            }
    except Exception as e:
        logger.error("macro.strip.fetch_failed", series=series_id, error=str(e))
        return None


@router.get("/strip")
async def get_macro_strip():
    loop = asyncio.get_event_loop()
    results = []
    for s in STRIP_SERIES:
        data = await loop.run_in_executor(None, _fetch_latest, s["id"])
        results.append({
            "id":     s["id"],
            "label":  s["label"],
            "unit":   s["unit"],
            "value":  data["value"]  if data else None,
            "prev":   data["prev"]   if data else None,
            "change": data["change"] if data else None,
            "date":   data["date"]   if data else None,
        })
    return {"indicators": results}