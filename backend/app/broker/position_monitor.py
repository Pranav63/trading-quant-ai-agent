"""
Position monitor — runs every 5 minutes via scheduler.
Checks every open Alpaca position against stop-loss and take-profit levels.
Generates automatic SELL trades when thresholds are breached.

Stop loss:  entry_price - (ATR × 2)   — dynamic, adapts to volatility
Take profit: entry_price + (ATR × 3)  — 1.5× risk/reward ratio minimum
Fallback:   if no ATR available, use fixed 3% stop / 5% take profit
"""
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.broker.alpaca_client import get_positions, get_latest_price
from app.db.session import AsyncSessionLocal
from app.models.market import Trade, TradeStatus, Signal, SignalType
from app.indicators.technical import get_daily_bars, compute_atr
from app.core.logging import logger

# Fallback percentages if ATR unavailable
STOP_LOSS_PCT    = 0.03   # 3% below entry
TAKE_PROFIT_PCT  = 0.05   # 5% above entry

# ATR multipliers
ATR_STOP_MULT    = 2.0    # stop loss = entry - (ATR × 2)
ATR_TP_MULT      = 3.0    # take profit = entry + (ATR × 3)

# Trailing stop: if position is up > 4%, trail stop up to lock in gains
TRAILING_TRIGGER_PCT = 0.04
TRAILING_STOP_PCT    = 0.02   # trail 2% below current high


async def get_atr_for_ticker(ticker: str) -> float | None:
    try:
        bars = get_daily_bars(ticker, days=20)
        if not bars:
            return None
        return compute_atr(bars, period=14)
    except Exception as e:
        logger.error("position_monitor.atr_error", ticker=ticker, error=str(e))
        return None


async def check_positions(db: AsyncSession):
    """
    Called by scheduler every 5 minutes.
    For each open Alpaca position:
      1. Get current price
      2. Compute stop-loss and take-profit levels
      3. If breached, create PENDING SELL trade
      4. Deduplication: skip if a pending SELL already exists for this ticker
    """
    positions = get_positions()
    if not positions:
        return

    logger.info("position_monitor.checking", count=len(positions))

    for pos in positions:
        ticker = pos.symbol
        qty = float(pos.qty)
        entry = float(pos.avg_entry_price)
        current = float(pos.current_price)
        unrealized_plpc = float(pos.unrealized_plpc)

        # Skip if already have a pending SELL for this ticker
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

        # Get ATR for dynamic levels
        atr = await get_atr_for_ticker(ticker)

        if atr:
            stop_loss_price  = round(entry - (atr * ATR_STOP_MULT), 2)
            take_profit_price = round(entry + (atr * ATR_TP_MULT), 2)
            method = "atr"
        else:
            stop_loss_price  = round(entry * (1 - STOP_LOSS_PCT), 2)
            take_profit_price = round(entry * (1 + TAKE_PROFIT_PCT), 2)
            method = "fixed_pct"

        # Trailing stop: if we're up more than TRAILING_TRIGGER_PCT,
        # raise the stop loss to lock in at least half the gain
        trailing_stop = None
        if unrealized_plpc >= TRAILING_TRIGGER_PCT:
            trailing_stop = round(current * (1 - TRAILING_STOP_PCT), 2)
            # Use trailing stop if it's higher than original stop loss
            if trailing_stop > stop_loss_price:
                stop_loss_price = trailing_stop
                method = "trailing"

        # Determine if we should exit
        exit_reason = None
        if current <= stop_loss_price:
            exit_reason = f"stop_loss hit — current ${current} <= stop ${stop_loss_price} ({method})"
        elif current >= take_profit_price:
            exit_reason = f"take_profit hit — current ${current} >= target ${take_profit_price}"

        logger.info(
            "position_monitor.status",
            ticker=ticker,
            entry=entry,
            current=current,
            stop=stop_loss_price,
            target=take_profit_price,
            pnl_pct=round(unrealized_plpc * 100, 2),
            method=method,
            exit_reason=exit_reason,
        )

        if not exit_reason:
            continue

        # Create exit signal
        signal = Signal(
            news_article_id=None,
            signal_type=SignalType.SELL,
            ticker=ticker,
            confidence=0.99,   # exits are high confidence — rule-based not LLM
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

        # Create PENDING SELL trade — still requires your approval
        trade = Trade(
            signal_id=signal.id,
            ticker=ticker,
            side="sell",
            qty=qty,       # sell full position
            notional=round(qty * current, 2),
            status=TradeStatus.PENDING,
        )
        db.add(trade)

        logger.info(
            "position_monitor.exit_signal_created",
            ticker=ticker,
            reason=exit_reason,
            qty=qty,
            notional=round(qty * current, 2),
        )

    await db.commit()