"""
Position monitor — runs every 5 minutes via scheduler.
"""
import asyncio
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.broker.alpaca_client import get_positions
from app.db.session import AsyncSessionLocal
from app.models.market import Trade, TradeStatus, Signal, SignalType
from app.indicators.technical import get_daily_bars, compute_atr
from app.core.logging import logger
from app.core.activity import push_event

STOP_LOSS_PCT     = 0.03
TAKE_PROFIT_PCT   = 0.05
ATR_STOP_MULT     = 2.0
ATR_TP_MULT       = 3.0
TRAILING_TRIGGER_PCT = 0.04
TRAILING_STOP_PCT    = 0.02


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


async def check_positions(db: AsyncSession):
    positions = get_positions()
    if not positions:
        return

    logger.info("position_monitor.checking", count=len(positions))

    # Push monitor heartbeat
    status_parts = []
    for pos in positions:
        pct = float(pos.unrealized_plpc) * 100
        status_parts.append(f"{pos.symbol} {pct:+.1f}%")

    await push_event(
        "position_monitor",
        f"monitoring {len(positions)} position{'s' if len(positions) != 1 else ''} — {', '.join(status_parts)}",
        {"count": len(positions)}
    )

    for pos in positions:
        ticker = pos.symbol
        qty = float(pos.qty)
        entry = float(pos.avg_entry_price)
        current = float(pos.current_price)
        unrealized_plpc = float(pos.unrealized_plpc)

        existing = await db.execute(
            select(Trade).where(
                Trade.ticker == ticker,
                Trade.side == "sell",
                Trade.status == TradeStatus.PENDING,
            )
        )
        if existing.scalar_one_or_none():
            logger.info("position_monitor.sell_already_pending", ticker=ticker)
            continue

        atr = await get_atr_for_ticker(ticker)

        if atr:
            stop_loss_price   = round(entry - (atr * ATR_STOP_MULT), 2)
            take_profit_price = round(entry + (atr * ATR_TP_MULT), 2)
            method = "atr"
        else:
            stop_loss_price   = round(entry * (1 - STOP_LOSS_PCT), 2)
            take_profit_price = round(entry * (1 + TAKE_PROFIT_PCT), 2)
            method = "fixed_pct"

        if unrealized_plpc >= TRAILING_TRIGGER_PCT:
            trailing_stop = round(current * (1 - TRAILING_STOP_PCT), 2)
            if trailing_stop > stop_loss_price:
                stop_loss_price = trailing_stop
                method = "trailing"

        exit_reason = None
        if current <= stop_loss_price:
            exit_reason = f"stop_loss hit — current ${current} <= stop ${stop_loss_price} ({method})"
        elif current >= take_profit_price:
            exit_reason = f"take_profit hit — current ${current} >= target ${take_profit_price}"

        logger.info(
            "position_monitor.status",
            ticker=ticker, entry=entry, current=current,
            stop=stop_loss_price, target=take_profit_price,
            pnl_pct=round(unrealized_plpc * 100, 2),
            method=method, exit_reason=exit_reason,
        )

        if not exit_reason:
            continue

        # Push exit alert
        is_stop = "stop_loss" in exit_reason
        await push_event(
            "stop_loss_triggered" if is_stop else "take_profit_triggered",
            f"EXIT SIGNAL: {ticker} — {exit_reason}",
            {"ticker": ticker, "current": current, "method": method}
        )

        signal = Signal(
            news_article_id=None,
            signal_type=SignalType.SELL,
            ticker=ticker,
            confidence=0.99,
            reasoning=exit_reason,
            llm_model="position_monitor",
            raw_llm_response={
                "trigger": exit_reason,
                "entry": entry,
                "current": current,
                "stop_loss": stop_loss_price,
                "take_profit": take_profit_price,
                "atr_method": method,
                "unrealized_plpc": unrealized_plpc,
            },
        )
        db.add(signal)
        await db.flush()

        trade = Trade(
            signal_id=signal.id,
            ticker=ticker,
            side="sell",
            qty=qty,
            notional=round(qty * current, 2),
            status=TradeStatus.PENDING,
        )
        db.add(trade)

        logger.info(
            "position_monitor.exit_signal_created",
            ticker=ticker, reason=exit_reason,
            qty=qty, notional=round(qty * current, 2),
        )

    await db.commit()