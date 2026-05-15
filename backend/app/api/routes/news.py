import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.market import NewsArticle

router = APIRouter(prefix="/news", tags=["news"])


def _serialize_article(a: NewsArticle) -> dict:
    return {
        "id": str(a.id),
        "source": a.source,
        "headline": a.headline,
        "summary": a.summary,
        "url": a.url,
        "sentiment_raw": a.sentiment_raw,
        "tickers": a.tickers or [],
        "signal_class": a.signal_class or "MONITORING",
        "image_url": a.image_url or None,
        "published_at": a.published_at.isoformat() if a.published_at else None,
        "ingested_at": a.ingested_at.isoformat() if a.ingested_at else None,
    }


@router.get("/recent")
async def get_recent_news(
    limit: int = Query(20, le=100),
    before: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(NewsArticle).order_by(NewsArticle.published_at.desc())
    if before:
        query = query.where(NewsArticle.published_at < before)

    result = await db.execute(query.limit(limit * 3))
    articles = result.scalars().all()

    grouped: dict[str, list] = defaultdict(list)
    for a in articles:
        key = a.tickers[0] if a.tickers else "MACRO"
        grouped[key].append(_serialize_article(a))

    output = [
        {
            "ticker": ticker,
            "article_count": len(items),
            "latest_at": items[0]["published_at"],
            "articles": items,
        }
        for ticker, items in grouped.items()
    ]
    output.sort(key=lambda x: x["latest_at"] or "", reverse=True)
    page = output[:limit]

    all_flat = [a for g in page for a in g["articles"]]
    next_cursor = min(
        (a["published_at"] for a in all_flat if a["published_at"]), default=None
    )

    return {"groups": page, "next_cursor": next_cursor, "has_more": len(output) > limit}


@router.get("/recent/flat")
async def get_recent_news_flat(
    limit: int = Query(50, le=200),
    before: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(NewsArticle).order_by(NewsArticle.published_at.desc())
    if before:
        query = query.where(NewsArticle.published_at < before)

    result = await db.execute(query.limit(limit))
    articles = result.scalars().all()

    return {
        "articles": [_serialize_article(a) for a in articles],
        "next_cursor": articles[-1].published_at.isoformat() if articles else None,
        "has_more": len(articles) == limit,
    }


@router.get("/stream")
async def stream_news(db: AsyncSession = Depends(get_db)):
    async def event_generator():
        last_seen_id: Optional[str] = None

        result = await db.execute(
            select(NewsArticle).order_by(NewsArticle.published_at.desc()).limit(30)
        )
        initial = result.scalars().all()
        if initial:
            last_seen_id = str(initial[0].id)
            payload = [_serialize_article(a) for a in reversed(initial)]
            yield f"event: init\ndata: {json.dumps(payload)}\n\n"

        while True:
            await asyncio.sleep(30)
            try:
                result = await db.execute(
                    select(NewsArticle).order_by(NewsArticle.ingested_at.desc()).limit(20)
                )
                recent = result.scalars().all()

                truly_new = []
                for a in recent:
                    if str(a.id) == last_seen_id:
                        break
                    truly_new.append(a)

                if truly_new:
                    last_seen_id = str(truly_new[0].id)
                    payload = [_serialize_article(a) for a in reversed(truly_new)]
                    yield f"event: articles\ndata: {json.dumps(payload)}\n\n"

                yield f"event: heartbeat\ndata: {json.dumps({'ts': datetime.now(timezone.utc).isoformat()})}\n\n"

            except asyncio.CancelledError:
                break
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'msg': str(e)})}\n\n"
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )

@router.get("/clusters")
async def get_news_clusters(
    hours: int = Query(6, le=24),
    min_sources: int = Query(2, le=10),
    db: AsyncSession = Depends(get_db),
):
    """
    Groups articles covering the same story.
    Same ticker + within time window = same cluster.
    Returns only clusters with 2+ sources (real signal).
    """
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    result = await db.execute(
        select(NewsArticle)
        .where(NewsArticle.published_at >= cutoff)
        .order_by(NewsArticle.published_at.desc())
    )
    articles = result.scalars().all()

    # Cluster by ticker + 6hr bucket
    clusters: dict[str, list] = {}
    for a in articles:
        tickers = a.tickers or []
        if not tickers:
            continue
        for ticker in tickers:
            # bucket = ticker + hour bucket (floor to 6hr window)
            if a.published_at:
                bucket_hour = (a.published_at.hour // hours) * hours
                bucket_key = f"{ticker}_{a.published_at.date()}_{bucket_hour}"
            else:
                bucket_key = f"{ticker}_unknown"

            if bucket_key not in clusters:
                clusters[bucket_key] = []
            clusters[bucket_key].append(_serialize_article(a))

    # Filter to clusters with min_sources unique sources
    output = []
    for key, items in clusters.items():
        unique_sources = list({a["source"] for a in items})
        if len(unique_sources) < min_sources:
            continue
        ticker = key.split("_")[0]
        # Pick highest signal_class in cluster
        priority = {"CRITICAL": 0, "ELEVATED": 1, "MONITORING": 2, "NOISE": 3}
        top_class = min(
            (a.get("signal_class", "MONITORING") for a in items),
            key=lambda x: priority.get(x, 2)
        )
        output.append({
            "ticker": ticker,
            "signal_class": top_class,
            "source_count": len(unique_sources),
            "sources": unique_sources,
            "article_count": len(items),
            "latest_at": items[0]["published_at"],
            "articles": items[:5],  # cap at 5 per cluster
        })

    output.sort(key=lambda x: (
        {"CRITICAL": 0, "ELEVATED": 1, "MONITORING": 2, "NOISE": 3}.get(x["signal_class"], 2),
        x["latest_at"] or ""
    ))

    return {"clusters": output, "total": len(output)}