"""
Main ingestion pipeline. Called by the scheduler every N minutes.
Fetches news + sentiment for watchlist tickers, persists to DB,
and queues articles for LLM classification.
"""
import json
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.redis_client import get_redis
from app.models.market import NewsArticle
from app.ingestion.finnhub_client import get_company_news
from app.ingestion.newsapi_client import get_top_business_headlines
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

# Sector ETF watchlist — this is our v1 universe
WATCHLIST = ["SPY", "QQQ", "XLK", "XLF", "XLE", "XLV", "XLI", "GLD", "TLT"]
CLASSIFY_QUEUE_KEY = "queue:classify"

async def run_ingestion_cycle(db: AsyncSession):
    logger.info("ingestion.cycle.start")
    redis = await get_redis()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    # 1. Finnhub per-ticker news
    for ticker in WATCHLIST:
        try:
            articles = await get_company_news(ticker, yesterday, today)
            for a in articles[:5]:  # cap per ticker to protect rate limit
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
    logger.info("ingestion.cycle.done", queued_for_classification=queue_len)
