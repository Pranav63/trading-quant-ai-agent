import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.db.session import get_db
from app.models.market import Trade, TradeStatus
from app.broker.alpaca_client import place_market_order, get_positions
from app.broker.risk_guard import validate_trade, RiskViolation
from app.core.logging import logger
from app.core.activity import push_event

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("/pending")
async def get_pending_trades(db: AsyncSession = Depends(get_db)):
    from app.broker.alpaca_client import data_client, get_account
    from alpaca.data.requests import StockLatestBarRequest
    from alpaca.data.enums import DataFeed
    from app.broker.position_monitor import ATR_STOP_MULT, ATR_TP_MULT, STOP_LOSS_PCT, TAKE_PROFIT_PCT
    from app.indicators.technical import get_daily_bars, compute_atr
    import asyncio

    result = await db.execute(
        select(Trade).where(Trade.status == TradeStatus.PENDING)
        .order_by(Trade.created_at.desc())
    )
    trades = result.scalars().all()
    if not trades:
        return []

    tickers = list(set(t.ticker for t in trades))
    try:
        req = StockLatestBarRequest(symbol_or_symbols=tickers, feed=DataFeed.IEX)
        bars = data_client.get_stock_latest_bar(req)
        prices = {sym: float(b.close) for sym, b in bars.items()}
    except Exception:
        prices = {}

    try:
        acc = get_account()
        equity = float(acc.equity)
    except Exception:
        equity = 100000.0

    output = []
    for t in trades:
        current_price = prices.get(t.ticker, 0)

        try:
            loop = asyncio.get_event_loop()
            daily = await loop.run_in_executor(None, get_daily_bars, t.ticker, 20)
            atr = compute_atr(daily, period=14) if daily else None
        except Exception:
            atr = None

        if atr and current_price:
            stop_loss   = round(current_price - (atr * ATR_STOP_MULT), 2)
            take_profit = round(current_price + (atr * ATR_TP_MULT), 2)
        elif current_price:
            stop_loss   = round(current_price * (1 - STOP_LOSS_PCT), 2)
            take_profit = round(current_price * (1 + TAKE_PROFIT_PCT), 2)
        else:
            stop_loss = None
            take_profit = None

        shares   = round(t.notional / current_price, 4) if current_price and current_price > 0 else None
        max_loss = round(shares * (current_price - stop_loss), 2) if shares and stop_loss and current_price else None
        max_gain = round(shares * (take_profit - current_price), 2) if shares and take_profit and current_price else None
        risk_pct = round((max_loss / equity) * 100, 2) if max_loss and equity else None
        rr_ratio = round(max_gain / max_loss, 2) if max_gain and max_loss and max_loss > 0 else None

        output.append({
            "id": str(t.id),
            "signal_id": str(t.signal_id) if t.signal_id else None,
            "ticker": t.ticker,
            "side": t.side,
            "qty": t.qty,
            "notional": t.notional,
            "status": t.status,
            "alpaca_order_id": t.alpaca_order_id,
            "filled_price": t.filled_price,
            "filled_at": t.filled_at.isoformat() if t.filled_at else None,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat(),
            "current_price": current_price or None,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "shares": shares,
            "max_loss": max_loss,
            "max_gain": max_gain,
            "risk_pct_of_account": risk_pct,
            "rr_ratio": rr_ratio,
        })
    return output


@router.post("/{trade_id}/approve")
async def approve_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.PENDING:
        raise HTTPException(400, f"Trade already {trade.status.value.lower()} — refresh and try a fresh trade")

    positions = get_positions()
    try:
        validate_trade(trade.ticker, trade.notional, len(positions))
    except RiskViolation as e:
        trade.status = TradeStatus.FAILED
        await db.commit()
        await push_event("trade_failed", f"risk guard blocked: {str(e)}", {"ticker": trade.ticker})
        raise HTTPException(400, f"Risk guard blocked: {str(e)}")

    try:
        result_order = place_market_order(trade.ticker, trade.side, trade.notional)
        trade.status = TradeStatus.EXECUTED
        trade.alpaca_order_id = result_order["order_id"]
        trade.filled_at = datetime.now(timezone.utc)
        await db.commit()
        await push_event(
            "trade_approved",
            f"order submitted: {trade.side.upper()} {trade.ticker} ${trade.notional} — queued on Alpaca",
            {"ticker": trade.ticker, "order_id": result_order["order_id"]}
        )
        logger.info("trade.executed", trade_id=str(trade_id), order_id=result_order["order_id"])
        return {"status": "executed", "order_id": result_order["order_id"]}
    except Exception as e:
        error_msg = str(e)
        trade.status = TradeStatus.FAILED
        await db.commit()
        await push_event(
            "trade_failed",
            f"order failed: {trade.side.upper()} {trade.ticker} — {error_msg[:80]}",
            {"ticker": trade.ticker, "error": error_msg}
        )
        logger.error("trade.failed", trade_id=str(trade_id), error=error_msg)
        raise HTTPException(500, f"Alpaca rejected: {error_msg}")


@router.post("/{trade_id}/reject")
async def reject_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    trade.status = TradeStatus.REJECTED
    await db.commit()
    await push_event(
        "trade_rejected",
        f"trade rejected: {trade.side.upper()} {trade.ticker} ${trade.notional}",
        {"ticker": trade.ticker}
    )
    return {"status": "rejected"}


@router.get("/history")
async def get_trade_history(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Trade).order_by(Trade.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


@router.get("/recently-failed")
async def get_recently_failed(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Trade).where(
            and_(
                Trade.status == TradeStatus.FAILED,
                Trade.updated_at > datetime.now(timezone.utc) - timedelta(hours=2)
            )
        ).order_by(Trade.updated_at.desc()).limit(10)
    )
    return result.scalars().all()