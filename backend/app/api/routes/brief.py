"""
AI Market Brief — runs after ingestion, summarizes top signals into
a 3-sentence market brief. Stored in Redis, served via GET.
"""
import json
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.redis_client import get_redis
from app.models.market import NewsArticle
from app.core.config import get_settings
from app.core.logging import logger
import httpx
from groq import AsyncGroq, RateLimitError

router = APIRouter(prefix="/brief", tags=["brief"])
settings = get_settings()
groq_client = AsyncGroq(api_key=settings.groq_api_key)

BRIEF_KEY = "market:brief"
BRIEF_TTL = 60 * 60  # 1hr

BRIEF_PROMPT = """You are a senior macro analyst at a quant hedge fund. 
Given these recent news headlines and their signal classifications, write a market brief.

Rules:
- Exactly 3 sentences
- Sentence 1: What is the dominant macro theme right now
- Sentence 2: Which sectors/ETFs are most affected and how
- Sentence 3: Key risk or uncertainty to watch
- Be specific — name ETFs, cite data points from headlines
- No fluff, no "the market is complex" garbage
- Tone: direct, Bloomberg terminal style

Headlines:
{headlines}

Respond with JSON: {{"brief": "...", "dominant_theme": "...", "affected_etfs": ["XLE", "TLT"]}}"""


async def _generate_with_gemini(prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
            headers={"X-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        resp.raise_for_status()
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(raw)


async def generate_brief(db: AsyncSession) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=6)
    result = await db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.published_at >= cutoff,
            NewsArticle.signal_class.in_(["CRITICAL", "ELEVATED"]),
        )
        .order_by(NewsArticle.published_at.desc())
        .limit(15)
    )
    articles = result.scalars().all()

    if not articles:
        return {
            "brief": "No significant market signals in the last 6 hours.",
            "dominant_theme": "quiet",
            "affected_etfs": [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "article_count": 0,
        }

    headlines = "\n".join([
        f"[{a.signal_class}] {a.headline} (source: {a.source})"
        for a in articles
    ])
    prompt = BRIEF_PROMPT.format(headlines=headlines)

    result_data = None

    # Try Groq first
    try:
        resp = await groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        result_data = json.loads(resp.choices[0].message.content)
        provider = "groq"
    except RateLimitError:
        logger.warning("brief.groq.rate_limited — falling back to gemini")
    except Exception as e:
        logger.error("brief.groq.error", error=str(e))

    # Fallback to Gemini
    if not result_data:
        try:
            result_data = await _generate_with_gemini(prompt)
            provider = "gemini"
        except Exception as e:
            logger.error("brief.gemini.error", error=str(e))
            return {
                "brief": "Brief generation failed — check API keys.",
                "dominant_theme": "error",
                "affected_etfs": [],
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "article_count": len(articles),
            }

    output = {
        **result_data,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "article_count": len(articles),
        "provider": provider,
    }
    logger.info("brief.generated", provider=provider, articles=len(articles))
    return output


@router.get("")
async def get_brief():
    redis = await get_redis()
    cached = await redis.get(BRIEF_KEY)
    if cached:
        return json.loads(cached)
    return {
        "brief": "No brief generated yet — trigger ingestion to generate.",
        "dominant_theme": "pending",
        "affected_etfs": [],
        "generated_at": None,
        "article_count": 0,
    }


@router.post("/generate")
async def trigger_brief(db: AsyncSession = Depends(get_db)):
    brief = await generate_brief(db)
    redis = await get_redis()
    await redis.set(BRIEF_KEY, json.dumps(brief), ex=BRIEF_TTL)
    return brief