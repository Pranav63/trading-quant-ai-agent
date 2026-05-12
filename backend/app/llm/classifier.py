"""
Reads from Redis queue:classify, calls Groq LLM to classify each
news article into a trading signal, writes Signal + Trade rows to DB.
"""
import json
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from groq import AsyncGroq
from app.core.config import get_settings
from app.core.logging import logger
from app.core.activity import push_event
from app.db.redis_client import get_redis
from app.db.session import AsyncSessionLocal
from app.models.market import Signal, Trade, SignalType, TradeStatus
from app.broker.risk_guard import compute_notional
from app.indicators.technical import confirm_signal

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

        try:
            loop = asyncio.get_event_loop()
            tech = await loop.run_in_executor(None, confirm_signal, ticker, signal_type)
        except Exception as e:
            logger.error("indicators.executor.error", ticker=ticker, error=str(e))
            tech = {
                "confirmed": True, "indicator_score": 0.5,
                "atr": None, "atr_pct": None,
                "stop_loss_distance": None, "details": {}
            }

        if not tech["confirmed"]:
            veto_reason = tech["details"].get("atr_veto_reason")
            votes = tech["details"].get("votes", 0)
            total = tech["details"].get("total", 0)
            reason = veto_reason or f"{votes}/{total} indicators passed"
            await push_event(
                "signal_rejected",
                f"{signal_type} {ticker} rejected — {reason}",
                {"ticker": ticker, "reason": reason}
            )
            logger.info(
                "signal.rejected_by_indicators",
                ticker=ticker, signal=signal_type,
                atr_veto=tech["details"].get("atr_veto"),
                votes=votes, total=total,
            )
            continue

        combined_confidence = round((confidence * 0.6) + (tech["indicator_score"] * 0.4), 4)

        if combined_confidence < 0.55:
            await push_event(
                "signal_low_confidence",
                f"{signal_type} {ticker} dropped — combined {round(combined_confidence*100)}% below 55% threshold",
                {"ticker": ticker, "confidence": combined_confidence}
            )
            logger.info("signal.low_combined_confidence", ticker=ticker, combined=combined_confidence)
            continue

        signal = Signal(
            news_article_id=article_id,
            signal_type=SignalType(signal_type),
            ticker=ticker,
            confidence=combined_confidence,
            reasoning=reasoning,
            llm_model="llama-3.3-70b-versatile",
            raw_llm_response={
                **result,
                "indicators": tech["details"],
                "atr_pct": tech.get("atr_pct"),
                "stop_loss_distance": tech.get("stop_loss_distance"),
            },
        )
        db.add(signal)
        await db.flush()

        notional = compute_notional(combined_confidence)
        trade = Trade(
            signal_id=signal.id,
            ticker=ticker,
            side=signal_type.lower(),
            qty=0,
            notional=notional,
            status=TradeStatus.PENDING,
        )
        db.add(trade)

        await push_event(
            "signal_created",
            f"{signal_type} {ticker} {round(combined_confidence*100)}% — {reasoning[:70]}",
            {"ticker": ticker, "signal": signal_type, "confidence": combined_confidence, "notional": notional}
        )

        logger.info(
            "signal.created",
            ticker=ticker, signal=signal_type,
            llm_confidence=confidence,
            indicator_score=round(tech["indicator_score"], 2),
            combined_confidence=combined_confidence,
            notional=notional,
            atr_pct=tech.get("atr_pct"),
            stop_loss_distance=tech.get("stop_loss_distance"),
            reasoning=reasoning,
        )

    await db.commit()
    await redis.sadd(PROCESSED_SET_KEY, article_id)


async def run_classifier_worker():
    logger.info("classifier.worker.started")
    redis = await get_redis()

    while True:
        try:
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