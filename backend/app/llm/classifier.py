"""
Reads from Redis queue:classify, calls Groq LLM to classify each
news article into a trading signal, writes Signal + Trade rows to DB.
Runs as a background worker alongside the scheduler.
"""
import json
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from groq import AsyncGroq
from app.core.config import get_settings
from app.core.logging import logger
from app.db.redis_client import get_redis
from app.db.session import AsyncSessionLocal
from app.models.market import Signal, Trade, SignalType, TradeStatus
from app.broker.risk_guard import compute_notional
from app.indicators.techincal import confirm_signal


settings = get_settings()
groq_client = AsyncGroq(api_key=settings.groq_api_key)

CLASSIFY_QUEUE_KEY = "queue:classify"
PROCESSED_SET_KEY = "processed:articles"

WATCHLIST_CONTEXT = """
Our trading universe is sector ETFs only:
- SPY: S&P 500 broad market
- QQQ: Nasdaq / tech heavy
- XLK: Technology sector
- XLF: Financial sector
- XLE: Energy sector
- XLV: Healthcare sector
- XLI: Industrials sector
- GLD: Gold (safe haven)
- TLT: Long-term treasuries (safe haven, inverse risk)

Strategy: sector rotation based on macro events.
When risk-off signals appear (war, recession fears, inflation) → GLD, TLT.
When tech optimism → QQQ, XLK.
When energy supply shock → XLE.
When broad market bullish → SPY.
"""

SYSTEM_PROMPT = f"""You are a quantitative trading signal classifier for a sector ETF rotation strategy.

{WATCHLIST_CONTEXT}

Given a news headline and summary, you must:
1. Determine if this news has actionable trading relevance for our ETF watchlist
2. If yes, identify which ETF(s) are most affected
3. Classify the signal direction and confidence

Respond ONLY with valid JSON in this exact format:
{{
  "actionable": true or false,
  "signals": [
    {{
      "ticker": "XLE",
      "signal": "BUY",
      "confidence": 0.75,
      "reasoning": "One sentence max explaining why"
    }}
  ]
}}

Rules:
- If not actionable, return {{"actionable": false, "signals": []}}
- confidence must be between 0.5 and 1.0 — never signal below 0.5
- Maximum 2 tickers per article
- signal must be BUY, SELL, or HOLD
- Never recommend HOLD — if it's HOLD it's not actionable
- Be conservative — only flag HIGH CONVICTION signals
"""

async def classify_article(headline: str, summary: str, ticker_hint: str = None) -> dict:
    user_content = f"Headline: {headline}\nSummary: {summary or 'N/A'}"
    if ticker_hint:
        user_content += f"\nDirect ticker context: {ticker_hint}"

    try:
        response = await groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
            max_tokens=300,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        result = json.loads(raw)
        logger.info("llm.classified", actionable=result.get("actionable"), headline=headline[:60])
        return result
    except Exception as e:
        logger.error("llm.classify.error", error=str(e), headline=headline[:60])
        return {"actionable": False, "signals": []}

async def process_queue_item(item: dict, db: AsyncSession):
    article_id = item.get("article_id")
    headline = item.get("headline", "")
    summary = item.get("summary", "")
    ticker_hint = item.get("ticker")

    redis = await get_redis()

    # Dedup — skip if already processed
    already = await redis.sismember(PROCESSED_SET_KEY, article_id)
    if already:
        return

    result = await classify_article(headline, summary, ticker_hint)

    if not result.get("actionable"):
        await redis.sadd(PROCESSED_SET_KEY, article_id)
        return

    for sig in result.get("signals", []):
        ticker = sig.get("ticker")
        signal_type = sig.get("signal", "HOLD")
        confidence = float(sig.get("confidence", 0.0))
        reasoning = sig.get("reasoning", "")

        if signal_type == "HOLD" or confidence < 0.5:
            continue
        # technical confirmation
        tech = confirm_signal(ticker, signal_type)
        if not tech["confirmed"]:
            logger.info(
                "signal.rejected_by_indicators",
                ticker=ticker,
                signal=signal_type,
                details=tech["details"],
            )
            continue

        # combine confidence scores
        combined_confidence = (confidence * 0.6) + (tech["indicator_score"] * 0.4)
        if combined_confidence < 0.55:
            continue
        # Write Signal row
        signal = Signal(
            news_article_id=article_id,
            signal_type=SignalType(signal_type),
            ticker=ticker,
            confidence=combined_confidence,
            reasoning=reasoning,
            llm_model="llama-3.3-70b-versatile",
            raw_llm_response=result,
        )
        db.add(signal)
        await db.flush()

        # Write Trade row (PENDING — waits for your approval)
        notional = compute_notional(confidence)
        trade = Trade(
            signal_id=signal.id,
            ticker=ticker,
            side=signal_type.lower(),
            qty=0,             # notional order, qty filled by Alpaca
            notional=notional,
            status=TradeStatus.PENDING,
        )
        db.add(trade)
        logger.info(
            "signal.created",
            ticker=ticker,
            signal=signal_type,
            confidence=confidence,
            notional=notional,
            reasoning=reasoning,
        )

    await db.commit()
    await redis.sadd(PROCESSED_SET_KEY, article_id)

async def run_classifier_worker():
    """
    Continuously drains the classify queue.
    Runs as a background task alongside APScheduler.
    """
    logger.info("classifier.worker.started")
    redis = await get_redis()

    while True:
        try:
            # Blocking pop with 5s timeout
            item_raw = await redis.brpop(CLASSIFY_QUEUE_KEY, timeout=5)
            if item_raw is None:
                await asyncio.sleep(1)
                continue

            _, item_json = item_raw
            item = json.loads(item_json)

            async with AsyncSessionLocal() as db:
                await process_queue_item(item, db)

        except asyncio.CancelledError:
            logger.info("classifier.worker.stopped")
            break
        except Exception as e:
            logger.error("classifier.worker.error", error=str(e))
            await asyncio.sleep(5)