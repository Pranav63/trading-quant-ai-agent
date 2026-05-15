import json
import asyncio
import hashlib
import httpx
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from bs4 import BeautifulSoup
from app.db.redis_client import get_redis
from app.models.market import NewsArticle
from app.core.activity import push_event
from app.ingestion.finnhub_client import get_company_news
from app.ingestion.newsapi_client import get_top_business_headlines
from app.ingestion.rss_client import get_rss_articles
from app.ingestion.fred_client import get_fred_macro_articles
from app.ingestion.signal_classifier import classify_signal
from app.core.watchlist import ETF_TICKERS, TICKER_LIST
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

WATCHLIST = TICKER_LIST
CLASSIFY_QUEUE_KEY = "queue:classify"
SEEN_URLS_KEY = "ingestion:seen_urls"
SEEN_URLS_TTL = 60 * 60 * 24


def _url_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


async def _is_seen(redis, url: str) -> bool:
    return bool(await redis.sismember(SEEN_URLS_KEY, _url_hash(url)))


async def _mark_seen(redis, url: str):
    h = _url_hash(url)
    await redis.sadd(SEEN_URLS_KEY, h)
    await redis.expire(SEEN_URLS_KEY, SEEN_URLS_TTL)


async def _fetch_og_image(url: str) -> str | None:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            soup = BeautifulSoup(r.text, "html.parser")
            tag = (soup.find("meta", property="og:image")
                   or soup.find("meta", attrs={"name": "twitter:image"}))
            return tag["content"] if tag and tag.get("content") else None
    except Exception:
        return None


async def _queue_article(
    db: AsyncSession, redis, *, source: str, headline: str, summary: str,
    url: str, published_at: datetime, tickers: list[str],
    ticker_hint: str | None = None, sentiment_raw: float | None = None,
) -> bool:
    if not headline:
        return False
    if url and await _is_seen(redis, url):
        return False

    image_url = await _fetch_og_image(url) if url else None

    article = NewsArticle(
        source=source, headline=headline, summary=summary, url=url,
        tickers=tickers, sentiment_raw=sentiment_raw,
        published_at=published_at, image_url=image_url,
    )
    article.signal_class = classify_signal(article)
    db.add(article)
    await db.flush()

    if url:
        await _mark_seen(redis, url)

    await redis.lpush(CLASSIFY_QUEUE_KEY, json.dumps({
        "article_id": str(article.id),
        "headline": headline,
        "summary": summary,
        "ticker": ticker_hint or (tickers[0] if tickers else None),
    }))
    return True


async def _warm_ticker_cache(ticker: str):
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
    from app.indicators.technical import clear_bar_cache
    clear_bar_cache()
    logger.info("ingestion.cache.warming", tickers=len(WATCHLIST))
    sem = asyncio.Semaphore(4)
    async def _warm_with_sem(ticker):
        async with sem:
            await _warm_ticker_cache(ticker)
    await asyncio.gather(*[_warm_with_sem(t) for t in WATCHLIST])
    logger.info("ingestion.cache.warmed")


async def run_ingestion_cycle(db: AsyncSession):
    await push_event("ingestion_start", "fetching news — Finnhub, NewsAPI, RSS, FRED...")
    logger.info("ingestion.cycle.start")
    await _warm_all_caches()

    redis = await get_redis()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    queued = 0
    skipped = 0

    # Finnhub — ETFs only (no crypto coverage)
    for ticker in ETF_TICKERS:
        try:
            articles = await get_company_news(ticker, yesterday, today)
            for a in articles[:5]:
                ok = await _queue_article(
                    db, redis, source="finnhub",
                    headline=a.get("headline", ""), summary=a.get("summary", ""),
                    url=a.get("url", ""),
                    published_at=datetime.fromtimestamp(a["datetime"], tz=timezone.utc),
                    tickers=[ticker], ticker_hint=ticker,
                    sentiment_raw=a.get("sentiment", {}).get("bullishPercent"),
                )
                queued += ok; skipped += not ok
        except Exception as e:
            logger.error("ingestion.finnhub.failed", ticker=ticker, error=str(e))

    # NewsAPI
    try:
        headlines = await get_top_business_headlines(page_size=10)
        for h in headlines:
            pub = None
            if h.get("publishedAt"):
                try:
                    pub = datetime.fromisoformat(h["publishedAt"].replace("Z", "+00:00"))
                except Exception:
                    pass
            ok = await _queue_article(
                db, redis, source="newsapi",
                headline=h.get("title", ""), summary=h.get("description", ""),
                url=h.get("url", ""),
                published_at=pub or datetime.now(timezone.utc), tickers=[],
            )
            queued += ok; skipped += not ok
    except Exception as e:
        logger.error("ingestion.newsapi.failed", error=str(e))

    # RSS
    try:
        for a in await get_rss_articles():
            ok = await _queue_article(
                db, redis, source=a["source"], headline=a["headline"],
                summary=a["summary"], url=a["url"],
                published_at=a["published_at"], tickers=[],
            )
            queued += ok; skipped += not ok
    except Exception as e:
        logger.error("ingestion.rss.failed", error=str(e))

    # FRED
    try:
        for a in await get_fred_macro_articles():
            ok = await _queue_article(
                db, redis, source="fred", headline=a["headline"],
                summary=a["summary"], url=a["url"],
                published_at=a["published_at"],
                tickers=[a["ticker_hint"]] if a.get("ticker_hint") else [],
                ticker_hint=a.get("ticker_hint"),
            )
            queued += ok; skipped += not ok
    except Exception as e:
        logger.error("ingestion.fred.failed", error=str(e))

    await db.commit()
    queue_len = await redis.llen(CLASSIFY_QUEUE_KEY)

    try:
        from app.api.routes.brief import generate_brief
        import json as _json
        brief_data = await generate_brief(db)
        redis_client = await get_redis()
        await redis_client.set("market:brief", _json.dumps(brief_data), ex=3600)
    except Exception as e:
        logger.error("brief.auto_generate.failed", error=str(e))

    await push_event(
        "ingestion_complete",
        f"ingestion done — {queued} new articles queued, {skipped} duplicates skipped",
        {"queued": queued, "skipped": skipped, "queue_total": queue_len},
    )
    logger.info("ingestion.cycle.done", queued=queued, skipped=skipped, queue_total=queue_len)