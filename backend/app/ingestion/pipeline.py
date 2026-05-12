"""
Main ingestion pipeline. Called by the scheduler every N minutes.
Fetches news + sentiment for watchlist tickers, persists to DB,
and queues articles for LLM classification.

Pre-warms the bar cache for all watchlist tickers in parallel
before ingestion — this means the first classify call per ticker
is instant instead of making a live Alpaca API call.
"""
import json
import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.redis_client import get_redis
from app.models.market import NewsArticle
from app.core.activity import push_event

from app.ingestion.finnhub_client import get_company_news
from app.ingestion.newsapi_client import get_top_business_headlines
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

WATCHLIST = ["SPY", "QQQ", "XLK", "XLF", "XLE", "XLV", "XLI", "GLD", "TLT"]
CLASSIFY_QUEUE_KEY = "queue:classify"


async def _warm_ticker_cache(ticker: str):
    """Fetch hourly + daily bars for one ticker into cache."""
    from app.indicators.technical import get_hourly_bars, get_daily_bars
    loop = asyncio.get_event_loop()
    try:
        await asyncio.gather(
            loop.run_in_executor(None, get_hourly_bars, ticker, 10),
            loop.run_in_executor(None, get_daily_bars, ticker, 30),
        )
    except Exception as e:
        logger.warning("ingestion.cache.warm_failed", ticker=ticker, error=str(e))


async def _warm_all_caches():
    """
    Pre-warm bar cache for all 9 watchlist tickers in parallel.
    9 tickers × 2 calls = 18 Alpaca calls running concurrently.
    Takes ~2-3s total instead of 18 × 1.5s = 27s sequential.
    """
    from app.indicators.technical import clear_bar_cache
    clear_bar_cache()
    logger.info("ingestion.cache.warming", tickers=len(WATCHLIST))
    await asyncio.gather(*[_warm_ticker_cache(t) for t in WATCHLIST])
    logger.info("ingestion.cache.warmed")


async def run_ingestion_cycle(db: AsyncSession):
    await push_event("ingestion_start", "fetching news from Finnhub + NewsAPI...")

    logger.info("ingestion.cycle.start")

    # Pre-warm indicator cache — all 9 tickers fetched in parallel
    # so classify worker never waits on Alpaca during this cycle
    await _warm_all_caches()

    redis = await get_redis()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    # 1. Finnhub per-ticker news
    for ticker in WATCHLIST:
        try:
            articles = await get_company_news(ticker, yesterday, today)
            for a in articles[:5]:
                article = NewsArticle(
                    source="finnhub",
                    headline=a.get("headline", ""),
                    summary=a.get("summary", ""),
                    url=a.get("url", ""),
                    tickers=[ticker],
                    sentiment_raw=a.get("sentiment", {}).get("bullishPercent"),
                    published_at=datetime.fromtimestamp(a["datetime"], tz=timezone.utc),
                )
                db.add(article)
                await db.flush()
                await redis.lpush(CLASSIFY_QUEUE_KEY, json.dumps({
                    "article_id": str(article.id),
                    "headline": article.headline,
                    "summary": article.summary,
                    "ticker": ticker,
                }))
        except Exception as e:
            logger.error("ingestion.finnhub.failed", ticker=ticker, error=str(e))

    # 2. General business headlines (macro events)
    try:
        headlines = await get_top_business_headlines(page_size=10)
        for h in headlines:
            if not h.get("title"):
                continue
            article = NewsArticle(
                source="newsapi",
                headline=h["title"],
                summary=h.get("description", ""),
                url=h.get("url", ""),
                tickers=[],
                published_at=datetime.fromisoformat(
                    h["publishedAt"].replace("Z", "+00:00")
                ) if h.get("publishedAt") else datetime.now(timezone.utc),
            )
            db.add(article)
            await db.flush()
            await redis.lpush(CLASSIFY_QUEUE_KEY, json.dumps({
                "article_id": str(article.id),
                "headline": article.headline,
                "summary": article.summary,
                "ticker": None,
            }))
    except Exception as e:
        logger.error("ingestion.newsapi.failed", error=str(e))

    await db.commit()
    queue_len = await redis.llen(CLASSIFY_QUEUE_KEY)
    await push_event("ingestion_complete",
        f"ingested articles — {queue_len} queued for classification",
        {"queued": queue_len})
    logger.info("ingestion.cycle.done", queued_for_classification=queue_len)