from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.market import NewsArticle

router = APIRouter(prefix="/news", tags=["news"])

@router.get("/recent")
async def get_recent_news(limit: int = Query(20, le=100), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NewsArticle).order_by(NewsArticle.ingested_at.desc()).limit(limit)
    )
    return result.scalars().all()
