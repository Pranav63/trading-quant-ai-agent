"""
Reads from Redis queue:classify, calls Groq LLM to classify each
news article into a trading signal, writes Signal + Trade rows to DB.
Falls back to Gemini if Groq is rate limited.
"""

import json
import asyncio
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from groq import AsyncGroq, RateLimitError
from app.core.config import get_settings
from app.core.logging import logger
from app.core.activity import push_event
from app.db.redis_client import get_redis
from app.db.session import AsyncSessionLocal
from app.models.market import Signal, Trade, SignalType, TradeStatus
from app.broker.risk_guard import compute_notional
from app.indicators.technical import confirm_signal
from app.core.watchlist import WATCHLIST_CONTEXT


settings = get_settings()
groq_client = AsyncGroq(api_key=settings.groq_api_key)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

CLASSIFY_QUEUE_KEY = "queue:classify"
PROCESSED_SET_KEY = "processed:articles"

SYSTEM_PROMPT = f"""You are a brutally honest quantitative trading signal classifier for a sector ETF and crypto rotation strategy.

{WATCHLIST_CONTEXT}

Your job is to protect capital first, generate returns second. You must be ruthlessly critical of every headline — most news is noise and should be ignored.

HONESTY RULES — non-negotiable:
- Never force a signal. If the news is ambiguous, vague, or only loosely related to our assets, return actionable: false.
- Never round up confidence. If you are 60% sure, say 0.60 — not 0.75.
- Never signal just because a headline sounds dramatic. Wars, politics, and CEO drama are usually priced in.
- A signal must have a DIRECT, MECHANISTIC link to one of our assets. "General uncertainty" is not a reason to buy GLD — only if the article explicitly describes inflation, safe-haven flows, or dollar weakness.
- BTC/USD signals require macro crypto catalysts (ETF flows, regulatory news, Fed rate decisions) — not generic "crypto rises" headlines.
- If two assets are equally affected, pick the more directly exposed one.

Given a news headline and summary, you must:
1. Ask yourself: would a senior portfolio manager at a quant fund act on this? If not, return actionable: false.
2. If yes, identify which single asset is MOST directly affected.
3. Assign confidence based only on how clear and direct the causal link is.

Respond ONLY with valid JSON in this exact format:
{{
  "actionable": true or false,
  "signals": [
    {{
      "ticker": "XLE",
      "signal": "BUY",
      "confidence": 0.75,
      "reasoning": "One sentence — state the exact causal mechanism"
    }}
  ]
}}

Rules:
- If not actionable, return {{"actionable": false, "signals": []}}
- confidence must be between 0.5 and 1.0
- Maximum 2 tickers per article
- signal must be BUY or SELL only
- Never emit BUY and SELL for the same ticker in one response
- Be conservative — if in doubt, do not signal
"""


async def _classify_with_gemini(user_content: str) -> dict:
    prompt = f"{SYSTEM_PROMPT}\n\nUser: {user_content}\n\nRespond only with valid JSON."
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GEMINI_URL,
            headers={
                "X-goog-api-key": settings.gemini_api_key,
                "Content-Type": "application/json",
            },
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        resp.raise_for_status()
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(raw)


async def classify_article(
    headline: str, summary: str, ticker_hint: str = None
) -> dict:
    user_content = f"Headline: {headline}\nSummary: {summary or 'N/A'}"
    if ticker_hint:
        user_content += f"\nDirect ticker context: {ticker_hint}"

    # Try Groq first
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
        logger.info(
            "llm.classified",
            provider="groq",
            actionable=result.get("actionable"),
            headline=headline[:60],
        )
        return result

    except RateLimitError:
        logger.warning(
            "llm.groq.rate_limited — falling back to gemini",
            headline=headline[:60],
        )

    except Exception as e:
        logger.error("llm.groq.error", error=str(e), headline=headline[:60])

    # Fallback to Gemini
    try:
        result = await _classify_with_gemini(user_content)
        logger.info(
            "llm.classified",
            provider="gemini",
            actionable=result.get("actionable"),
            headline=headline[:60],
        )
        return result

    except Exception as e:
        logger.error("llm.gemini.error", error=str(e), headline=headline[:60])
        return {"actionable": False, "signals": []}


async def _get_pending_signal_directions(
    db: AsyncSession, tickers: list[str]
) -> dict[str, str]:
    if not tickers:
        return {}
    result = await db.execute(
        select(Trade.ticker, Trade.side).where(
            Trade.ticker.in_(tickers),
            Trade.status == TradeStatus.PENDING,
        )
    )
    return {row.ticker: row.side for row in result.all()}


async def process_queue_item(item: dict, db: AsyncSession):
    article_id = item.get("article_id")
    headline = item.get("headline", "")
    summary = item.get("summary", "")
    ticker_hint = item.get("ticker")

    redis = await get_redis()

    if await redis.sismember(PROCESSED_SET_KEY, article_id):
        return

    result = await classify_article(headline, summary, ticker_hint)

    if not result.get("actionable"):
        await redis.sadd(PROCESSED_SET_KEY, article_id)
        return

    signals = result.get("signals", [])

    seen_in_article: dict[str, str] = {}
    deduped_signals = []
    for sig in signals:
        t = sig.get("ticker")
        s = sig.get("signal", "")
        if not t or s not in ("BUY", "SELL"):
            continue
        if t in seen_in_article:
            logger.warning(
                "classifier.intra_article_conflict",
                ticker=t,
                first=seen_in_article[t],
                second=s,
            )
            continue
        seen_in_article[t] = s
        deduped_signals.append(sig)

    if not deduped_signals:
        await redis.sadd(PROCESSED_SET_KEY, article_id)
        return

    pending_directions = await _get_pending_signal_directions(
        db, [s["ticker"] for s in deduped_signals]
    )

    for sig in deduped_signals:
        ticker = sig.get("ticker")
        signal_type = sig.get("signal")
        confidence = float(sig.get("confidence", 0.0))
        reasoning = sig.get("reasoning", "")

        if confidence < 0.5:
            continue

        existing_side = pending_directions.get(ticker)
        if existing_side:
            existing_signal = "BUY" if existing_side == "buy" else "SELL"
            if existing_signal != signal_type:
                await push_event(
                    "signal_conflict_blocked",
                    f"{signal_type} {ticker} blocked — opposing {existing_signal} already pending",
                    {
                        "ticker": ticker,
                        "blocked": signal_type,
                        "existing": existing_signal,
                    },
                )
                logger.warning(
                    "signal.conflict_blocked",
                    ticker=ticker,
                    blocked=signal_type,
                    existing=existing_signal,
                )
                continue

        try:
            loop = asyncio.get_event_loop()
            tech = await loop.run_in_executor(None, confirm_signal, ticker, signal_type)
        except Exception as e:
            logger.error("indicators.executor.error", ticker=ticker, error=str(e))
            await push_event(
                "signal_rejected",
                f"{signal_type} {ticker} rejected — indicator executor crashed: {str(e)[:60]}",
                {"ticker": ticker},
            )
            continue

        if not tech["confirmed"]:
            veto_reason = tech["details"].get("atr_veto_reason")
            votes = tech["details"].get("votes", 0)
            total = tech["details"].get("total", 0)
            reason = veto_reason or f"{votes}/{total} indicators passed"
            await push_event(
                "signal_rejected",
                f"{signal_type} {ticker} rejected — {reason}",
                {"ticker": ticker, "reason": reason},
            )
            logger.info(
                "signal.rejected_by_indicators",
                ticker=ticker,
                signal=signal_type,
                reason=reason,
            )
            continue

        combined_confidence = round(
            (confidence * 0.6) + (tech["indicator_score"] * 0.4), 4
        )

        if combined_confidence < 0.55:
            await push_event(
                "signal_low_confidence",
                f"{signal_type} {ticker} dropped — combined {round(combined_confidence*100)}% below 55%",
                {"ticker": ticker, "confidence": combined_confidence},
            )
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
                "buy_pressure_pct": tech.get("buy_pressure_pct"),
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
            f"{signal_type} {ticker} {round(combined_confidence*100)}% "
            f"| buy pressure {tech.get('buy_pressure_pct', '?')}% — {reasoning[:70]}",
            {
                "ticker": ticker,
                "signal": signal_type,
                "confidence": combined_confidence,
                "notional": notional,
                "buy_pressure_pct": tech.get("buy_pressure_pct"),
            },
        )

        logger.info(
            "signal.created",
            ticker=ticker,
            signal=signal_type,
            llm_confidence=confidence,
            indicator_score=round(tech["indicator_score"], 2),
            combined_confidence=combined_confidence,
            notional=notional,
            buy_pressure_pct=tech.get("buy_pressure_pct"),
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