"""
Position monitor — runs every 5 minutes via scheduler.
Checks price-based exits (SL/TP/trailing) AND news sentiment
against open positions for early exit before SL is hit.
"""

import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.broker.alpaca_client import get_positions
from app.db.session import AsyncSessionLocal
from app.models.market import Trade, TradeStatus, Signal, SignalType, NewsArticle
from app.indicators.technical import get_daily_bars, compute_atr
from app.core.logging import logger
from app.core.activity import push_event

STOP_LOSS_PCT = 0.03
TAKE_PROFIT_PCT = 0.05
ATR_STOP_MULT = 2.0
ATR_TP_MULT = 3.0
TRAILING_TRIGGER_PCT = 0.04
TRAILING_STOP_PCT = 0.02

# News-based exit: if latest signal for this ticker is SELL with
# confidence above this threshold, exit even before SL is hit
NEWS_EXIT_CONFIDENCE = 0.70


async def get_atr_for_ticker(ticker: str) -> float | None:
    try:
        loop = asyncio.get_event_loop()
        bars = await loop.run_in_executor(None, get_daily_bars, ticker, 20)
        if not bars:
            return None
        return compute_atr(bars, period=14)
    except Exception as e:
        logger.error("position_monitor.atr_error", ticker=ticker, error=str(e))
        return None


def _calc_stops(side: str, entry: float, atr: float | None) -> tuple[float, float, str]:
    """Direction-aware SL/TP. Returns (stop_loss, take_profit, method)."""
    if atr:
        if side == "long":
            sl = round(entry - (atr * ATR_STOP_MULT), 2)
            tp = round(entry + (atr * ATR_TP_MULT), 2)
        else:
            sl = round(entry + (atr * ATR_STOP_MULT), 2)
            tp = round(entry - (atr * ATR_TP_MULT), 2)
        method = "atr"
    else:
        if side == "long":
            sl = round(entry * (1 - STOP_LOSS_PCT), 2)
            tp = round(entry * (1 + TAKE_PROFIT_PCT), 2)
        else:
            sl = round(entry * (1 + STOP_LOSS_PCT), 2)
            tp = round(entry * (1 - TAKE_PROFIT_PCT), 2)
        method = "fixed_pct"
    return sl, tp, method


def _check_price_exit(side: str, current: float, sl: float, tp: float) -> str | None:
    """Returns exit reason string or None. Direction-aware."""
    if side == "long":
        if current <= sl:
            return f"stop_loss hit — ${current} <= stop ${sl}"
        if current >= tp:
            return f"take_profit hit — ${current} >= target ${tp}"
    else:  # short
        if current >= sl:
            return f"stop_loss hit — ${current} >= stop ${sl}"
        if current <= tp:
            return f"take_profit hit — ${current} <= target ${tp}"
    return None


def _apply_trailing(
    side: str, current: float, sl: float, method: str
) -> tuple[float, str]:
    """Ratchet trailing stop up (long) or down (short)."""
    if side == "long":
        trailing = round(current * (1 - TRAILING_STOP_PCT), 2)
        if trailing > sl:
            return trailing, "trailing"
    else:
        trailing = round(current * (1 + TRAILING_STOP_PCT), 2)
        if trailing < sl:
            return trailing, "trailing"
    return sl, method


async def _check_news_exit(
    ticker: str, position_side: str, db: AsyncSession
) -> str | None:
    """
    Look at the most recent LLM signal for this ticker.
    If it contradicts the open position with high confidence → early exit.
    Long position + recent SELL signal above threshold → exit.
    Short position + recent BUY signal above threshold → exit.
    """
    try:
        result = await db.execute(
            select(Signal)
            .where(Signal.ticker == ticker)
            .order_by(desc(Signal.created_at))
            .limit(1)
        )
        latest = result.scalar_one_or_none()
        if not latest:
            return None

        is_contradicting = (
            position_side == "long" and latest.signal_type == SignalType.SELL
        ) or (position_side == "short" and latest.signal_type == SignalType.BUY)

        if is_contradicting and latest.confidence >= NEWS_EXIT_CONFIDENCE:
            return (
                f"news exit — {latest.signal_type.value} signal "
                f"{round(latest.confidence * 100)}% confidence: {latest.reasoning[:80]}"
            )
    except Exception as e:
        logger.error(
            "position_monitor.news_exit_check.error", ticker=ticker, error=str(e)
        )
    return None


async def check_positions(db: AsyncSession):
    positions = get_positions()
    if not positions:
        return

    logger.info("position_monitor.checking", count=len(positions))

    status_parts = []
    for pos in positions:
        pct = float(pos.unrealized_plpc) * 100
        status_parts.append(f"{pos.symbol} {pct:+.1f}%")

    await push_event(
        "position_monitor",
        f"monitoring {len(positions)} position{'s' if len(positions) != 1 else ''} — {', '.join(status_parts)}",
        {"count": len(positions)},
    )

    for pos in positions:
        ticker = pos.symbol
        qty = float(pos.qty)
        entry = float(pos.avg_entry_price)
        current = float(pos.current_price)
        unrealized_plpc = float(pos.unrealized_plpc)

        # Derive direction from qty sign — positive = long, negative = short
        side = "long" if qty > 0 else "short"
        # Exit side is the opposite of position side
        exit_side = "sell" if side == "long" else "buy"

        # Skip if we already have a pending exit for this ticker
        existing = await db.execute(
            select(Trade).where(
                Trade.ticker == ticker,
                Trade.side == exit_side,
                Trade.status == TradeStatus.PENDING,
            )
        )
        if existing.scalar_one_or_none():
            logger.info(
                "position_monitor.exit_already_pending", ticker=ticker, side=exit_side
            )
            continue

        atr = await get_atr_for_ticker(ticker)
        sl, tp, method = _calc_stops(side, entry, atr)

        # Apply trailing stop if position is sufficiently in profit
        trigger_met = (side == "long" and unrealized_plpc >= TRAILING_TRIGGER_PCT) or (
            side == "short" and unrealized_plpc >= TRAILING_TRIGGER_PCT
        )
        if trigger_met:
            sl, method = _apply_trailing(side, current, sl, method)

        # 1. Price-based exit check
        exit_reason = _check_price_exit(side, current, sl, tp)

        # 2. News-based early exit (only if no price exit already triggered)
        if not exit_reason:
            exit_reason = await _check_news_exit(ticker, side, db)

        logger.info(
            "position_monitor.status",
            ticker=ticker,
            side=side,
            entry=entry,
            current=current,
            stop=sl,
            target=tp,
            pnl_pct=round(unrealized_plpc * 100, 2),
            method=method,
            exit_reason=exit_reason,
        )

        if not exit_reason:
            continue

        is_stop = "stop_loss" in exit_reason
        is_news = "news exit" in exit_reason
        event_tag = (
            "stop_loss_triggered"
            if is_stop
            else ("news_exit_triggered" if is_news else "take_profit_triggered")
        )

        await push_event(
            event_tag,
            f"EXIT SIGNAL: {ticker} ({side}) — {exit_reason}",
            {"ticker": ticker, "current": current, "method": method, "side": side},
        )

        signal = Signal(
            news_article_id=None,
            signal_type=SignalType(exit_side.upper()),
            ticker=ticker,
            confidence=0.99,
            reasoning=exit_reason,
            llm_model="position_monitor",
            raw_llm_response={
                "trigger": exit_reason,
                "position_side": side,
                "entry": entry,
                "current": current,
                "stop_loss": sl,
                "take_profit": tp,
                "atr_method": method,
                "unrealized_plpc": unrealized_plpc,
            },
        )
        db.add(signal)
        await db.flush()

        trade = Trade(
            signal_id=signal.id,
            ticker=ticker,
            side=exit_side,  # ← correct: sell to close long, buy to close short
            qty=abs(qty),  # ← always positive qty
            notional=round(abs(qty) * current, 2),
            status=TradeStatus.PENDING,
        )
        db.add(trade)

        logger.info(
            "position_monitor.exit_signal_created",
            ticker=ticker,
            side=side,
            exit_side=exit_side,
            reason=exit_reason,
            qty=abs(qty),
        )

    await db.commit()
