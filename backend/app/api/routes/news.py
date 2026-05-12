from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.market import NewsArticle
from collections import defaultdict

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/recent")
async def get_recent_news(
    limit: int = Query(20, le=100), db: AsyncSession = Depends(get_db)
):
    """
    Returns news grouped by ticker — one block per ticker, most recent first.
    Articles with no ticker (macro/RSS/FRED) grouped under 'MACRO'.
    """
    # Fetch more than limit so grouping has enough to work with
    result = await db.execute(
        select(NewsArticle).order_by(NewsArticle.published_at.desc()).limit(limit * 5)
    )
    articles = result.scalars().all()

    # Group by primary ticker (first in tickers list, or MACRO)
    grouped: dict[str, list] = defaultdict(list)
    for a in articles:
        key = a.tickers[0] if a.tickers else "MACRO"
        grouped[key].append(
            {
                "id": str(a.id),
                "source": a.source,
                "headline": a.headline,
                "summary": a.summary,
                "url": a.url,
                "sentiment_raw": a.sentiment_raw,
                "published_at": a.published_at.isoformat() if a.published_at else None,
                "ingested_at": a.ingested_at.isoformat() if a.ingested_at else None,
            }
        )

    # Build output: one entry per ticker, sorted by most recent article
    output = []
    for ticker, items in grouped.items():
        output.append(
            {
                "ticker": ticker,
                "article_count": len(items),
                "latest_at": items[0]["published_at"],  # already sorted desc
                "articles": items,
            }
        )

    # Sort groups by their most recent article
    output.sort(key=lambda x: x["latest_at"] or "", reverse=True)
    return output[:limit]


@router.get("/recent/flat")
async def get_recent_news_flat(
    limit: int = Query(20, le=100), db: AsyncSession = Depends(get_db)
):
    """Flat list for when you just need raw articles — no grouping."""
    result = await db.execute(
        select(NewsArticle).order_by(NewsArticle.published_at.desc()).limit(limit)
    )
    return result.scalars().all()
