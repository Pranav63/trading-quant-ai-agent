"""
RSS feed ingestion — Reuters, WSJ, FT, Seeking Alpha macro.
No API key needed. Returns normalised article dicts.
"""

import re
import asyncio
import feedparser
from datetime import datetime, timezone
from app.core.logging import logger

RSS_FEEDS = [
    {
        "name": "Reuters Business",
        "url": "https://news.google.com/rss/search?q=reuters+business+economy&hl=en-US&gl=US&ceid=US:en",
        "source_key": "rss_reuters_business",
    },
    {
        "name": "Reuters Markets",
        "url": "https://feeds.reuters.com/reuters/financialNews",
        "source_key": "rss_reuters_markets",
    },
    {
        "name": "WSJ Markets",
        "url": "https://news.google.com/rss/search?q=wall+street+journal+markets+economy&hl=en-US&gl=US&ceid=US:en",
        "source_key": "rss_wsj_markets",
    },
    {
        "name": "FT Markets",
        "url": "https://www.ft.com/rss/home/uk",
        "source_key": "rss_ft_markets",
    },
    {
        "name": "Investing.com Economy",
        "url": "https://www.investing.com/rss/news_14.rss",
        "source_key": "rss_investing.com_economy",
    },
]


def _strip_html(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text).strip()


def _parse_feed(feed_meta: dict) -> list[dict]:
    """Blocking — run in executor."""
    try:
        parsed = feedparser.parse(feed_meta["url"])
        results = []
        for entry in parsed.entries[:10]:
            published = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            results.append(
                {
                    "source": feed_meta["source_key"],
                    "headline": _strip_html(entry.get("title", "")).strip(),
                    "summary": _strip_html(entry.get("summary", ""))[:500],
                    "url": entry.get("link", ""),
                    "published_at": published or datetime.now(timezone.utc),
                }
            )
        logger.info("rss.fetched", feed=feed_meta["name"], count=len(results))
        return results
    except Exception as e:
        logger.error("rss.failed", feed=feed_meta["name"], error=str(e))
        return []


async def get_rss_articles() -> list[dict]:
    """Fetch all RSS feeds in parallel."""
    loop = asyncio.get_event_loop()
    tasks = [loop.run_in_executor(None, _parse_feed, feed) for feed in RSS_FEEDS]
    results = await asyncio.gather(*tasks)
    articles = [a for feed_articles in results for a in feed_articles]
    logger.info("rss.total", count=len(articles))
    return articles