"""
FRED (Federal Reserve Economic Data) client.
Fetches key macro series relevant to ETF sector rotation.
Emits synthetic 'news articles' when data prints so the LLM
classifier can act on macro releases just like news headlines.
"""

import httpx
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

# Series chosen for ETF rotation signals:
# CPI + PCE → GLD, TLT (inflation hedge)
# FEDFUNDS → TLT, XLF (rate sensitive)
# UNRATE → SPY, QQQ (risk sentiment)
# INDPRO → XLI (industrials)
# DCOILWTICO → XLE (energy)
FRED_SERIES = [
    {
        "series_id": "CPIAUCSL",
        "name": "CPI (Inflation)",
        "etf_hint": "GLD",
        "description": "Consumer Price Index — measures inflation",
    },
    {
        "series_id": "PCEPI",
        "name": "PCE Price Index",
        "etf_hint": "GLD",
        "description": "Fed's preferred inflation measure",
    },
    {
        "series_id": "FEDFUNDS",
        "name": "Federal Funds Rate",
        "etf_hint": "TLT",
        "description": "Overnight lending rate set by Fed",
    },
    {
        "series_id": "UNRATE",
        "name": "Unemployment Rate",
        "etf_hint": "SPY",
        "description": "US unemployment rate",
    },
    {
        "series_id": "INDPRO",
        "name": "Industrial Production",
        "etf_hint": "XLI",
        "description": "Industrial output index",
    },
    {
        "series_id": "DCOILWTICO",
        "name": "Crude Oil WTI",
        "etf_hint": "XLE",
        "description": "West Texas Intermediate crude oil price",
    },
    {
        "series_id": "T10YIE",
        "name": "10Y Breakeven Inflation",
        "etf_hint": "TLT",
        "description": "Market-implied 10-year inflation expectation",
    },
    {
    "series_id": "VIXCLS",
    "name": "VIX",
    "etf_hint": "GLD",
    "description": "CBOE Volatility Index — market fear gauge",
},
{
    "series_id": "T10Y2Y",
    "name": "10Y-2Y Spread",
    "etf_hint": "TLT",
    "description": "Treasury yield curve spread — recession indicator",
},
]


def _fetch_series(series_id: str, lookback_days: int = 45) -> list[dict]:
    """Fetch recent observations for one FRED series."""
    observation_start = (
        datetime.now(timezone.utc) - timedelta(days=lookback_days)
    ).strftime("%Y-%m-%d")

    params = {
        "series_id": series_id,
        "api_key": settings.fred_api_key,
        "file_type": "json",
        "observation_start": observation_start,
        "sort_order": "desc",
        "limit": 5,  # last 5 prints
    }
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(FRED_BASE, params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("observations", [])
    except Exception as e:
        logger.error("fred.fetch.failed", series_id=series_id, error=str(e))
        return []


def _obs_to_article(obs: dict, meta: dict) -> dict | None:
    """Convert a FRED observation into a synthetic news article for the classifier."""
    value = obs.get("value", ".")
    if value == ".":  # FRED uses "." for missing data
        return None

    date_str = obs.get("date", "")
    try:
        published_at = datetime.strptime(date_str, "%Y-%m-%d").replace(
            tzinfo=timezone.utc
        )
    except Exception:
        published_at = datetime.now(timezone.utc)

    headline = f"FRED DATA: {meta['name']} = {value} ({date_str})"
    summary = (
        f"{meta['description']}. Latest reading: {value} as of {date_str}. "
        f"Primary ETF impact: {meta['etf_hint']}."
    )

    return {
        "source": "fred",
        "headline": headline,
        "summary": summary,
        "url": f"https://fred.stlouisfed.org/series/{meta['series_id']}",
        "published_at": published_at,
        "ticker_hint": meta["etf_hint"],
    }


async def get_fred_macro_articles() -> list[dict]:
    """
    Fetch latest prints for all FRED series and return as synthetic articles.
    Only returns the MOST RECENT observation per series to avoid spam.
    """
    import asyncio

    loop = asyncio.get_event_loop()
    articles = []

    for meta in FRED_SERIES:
        observations = await loop.run_in_executor(
            None, _fetch_series, meta["series_id"]
        )
        if not observations:
            continue

        # Only take the latest non-missing print
        for obs in observations:
            article = _obs_to_article(obs, meta)
            if article:
                articles.append(article)
                break  # one per series per cycle

    logger.info("fred.articles.generated", count=len(articles))
    return articles
