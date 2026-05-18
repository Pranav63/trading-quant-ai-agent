import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.db.session import get_db
from app.models.market import Trade, TradeStatus
from app.broker.alpaca_client import (
    place_market_order,
    get_positions,
    close_position,
    trading_client,  # the alpaca TradingClient instance
)
from app.broker.risk_guard import validate_trade, RiskViolation
from app.core.logging import logger
from app.core.activity import push_event

router = APIRouter(prefix="/trades", tags=["trades"])

# ── how long to poll Alpaca waiting for a fill ────────────────────────────────
FILL_POLL_SECONDS = 15
FILL_POLL_INTERVAL = 1


def _calc_stops(
    side: str,
    entry: float,
    atr: float | None,
    atr_stop_mult: float,
    atr_tp_mult: float,
    stop_pct: float,
    tp_pct: float,
) -> tuple[float | None, float | None]:
    if atr and entry:
        if side == "buy":
            sl = round(entry - (atr * atr_stop_mult), 2)
            tp = round(entry + (atr * atr_tp_mult), 2)
        else:
            sl = round(entry + (atr * atr_stop_mult), 2)
            tp = round(entry - (atr * atr_tp_mult), 2)
    elif entry:
        if side == "buy":
            sl = round(entry * (1 - stop_pct), 2)
            tp = round(entry * (1 + tp_pct), 2)
        else:
            sl = round(entry * (1 + stop_pct), 2)
            tp = round(entry * (1 - tp_pct), 2)
    else:
        sl, tp = None, None
    return sl, tp


async def _poll_fill(order_id: str) -> dict:
    """
    Poll Alpaca until the order is filled or FILL_POLL_SECONDS elapses.
    Returns dict with filled_price, filled_qty, filled (bool).
    """
    for _ in range(FILL_POLL_SECONDS):
        await asyncio.sleep(FILL_POLL_INTERVAL)
        try:
            order = trading_client.get_order_by_id(order_id)
            if order.status.value in ("filled", "partially_filled"):
                return {
                    "filled": True,
                    "filled_price": float(order.filled_avg_price or 0),
                    "filled_qty": float(order.filled_qty or 0),
                }
            if order.status.value in ("canceled", "expired", "rejected"):
                return {"filled": False, "alpaca_status": order.status.value}
        except Exception:
            pass
    # timed out — order may still fill later (e.g. after-hours)
    return {"filled": False, "alpaca_status": "pending_fill"}


# ── GET /pending ──────────────────────────────────────────────────────────────

@router.get("/pending")
async def get_pending_trades(db: AsyncSession = Depends(get_db)):
    from app.broker.alpaca_client import stock_data_client, crypto_data_client, get_account
    from alpaca.data.requests import StockLatestBarRequest, CryptoLatestBarRequest
    from alpaca.data.enums import DataFeed
    from app.broker.position_monitor import ATR_STOP_MULT, ATR_TP_MULT, STOP_LOSS_PCT, TAKE_PROFIT_PCT
    from app.indicators.technical import get_daily_bars, compute_atr
    from app.core.watchlist import is_crypto

    result = await db.execute(
        select(Trade).where(Trade.status == TradeStatus.PENDING).order_by(Trade.created_at.desc())
    )
    trades = result.scalars().all()
    if not trades:
        return []

    tickers = list(set(t.ticker for t in trades))
    stock_tickers = [t for t in tickers if not is_crypto(t)]
    crypto_tickers = [t for t in tickers if is_crypto(t)]

    prices = {}
    try:
        if stock_tickers:
            bars = stock_data_client.get_stock_latest_bar(
                StockLatestBarRequest(symbol_or_symbols=stock_tickers, feed=DataFeed.IEX)
            )
            prices.update({sym: float(b.close) for sym, b in bars.items()})
    except Exception:
        pass
    try:
        if crypto_tickers:
            bars = crypto_data_client.get_crypto_latest_bar(
                CryptoLatestBarRequest(symbol_or_symbols=crypto_tickers)
            )
            prices.update({sym: float(b.close) for sym, b in bars.items()})
    except Exception:
        pass

    try:
        equity = float(get_account().equity)
    except Exception:
        equity = 100_000.0

    output = []
    for t in trades:
        current_price = prices.get(t.ticker, 0)
        try:
            loop = asyncio.get_event_loop()
            daily = await loop.run_in_executor(None, get_daily_bars, t.ticker, 20)
            atr = compute_atr(daily, period=14) if daily else None
        except Exception:
            atr = None

        sl, tp = _calc_stops(t.side, current_price, atr, ATR_STOP_MULT, ATR_TP_MULT, STOP_LOSS_PCT, TAKE_PROFIT_PCT)
        shares = round(t.notional / current_price, 4) if current_price else None
        max_loss = round(abs(shares * (current_price - sl)), 2) if shares and sl and current_price else None
        max_gain = round(abs(shares * (tp - current_price)), 2) if shares and tp and current_price else None
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
            "stop_loss": sl,
            "take_profit": tp,
            "shares": shares,
            "max_loss": max_loss,
            "max_gain": max_gain,
            "risk_pct_of_account": risk_pct,
            "rr_ratio": rr_ratio,
        })
    return output


# ── POST /{id}/approve ────────────────────────────────────────────────────────

@router.post("/{trade_id}/approve")
async def approve_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.PENDING:
        raise HTTPException(400, f"Trade already {trade.status.value.lower()} — refresh")

    # Risk guard
    positions = get_positions()
    open_notional = sum(abs(float(p.qty) * float(p.current_price)) for p in positions)
    try:
        validate_trade(trade.ticker, trade.notional, open_notional)
    except RiskViolation as e:
        trade.status = TradeStatus.FAILED
        await db.commit()
        await push_event("trade_failed", f"risk guard blocked: {str(e)}", {"ticker": trade.ticker})
        raise HTTPException(400, f"Risk guard blocked: {str(e)}")

    # Submit order
    try:
        result_order = place_market_order(trade.ticker, trade.side, trade.notional)
        order_id = result_order["order_id"]
        trade.alpaca_order_id = order_id
        trade.status = TradeStatus.EXECUTED  # submitted, not yet filled
        await db.commit()
        await push_event(
            "trade_approved",
            f"order submitted: {trade.side.upper()} {trade.ticker} ${trade.notional}",
            {"ticker": trade.ticker, "order_id": order_id},
        )
        logger.info("trade.executed", trade_id=str(trade_id), order_id=order_id)
    except Exception as e:
        error_msg = str(e)
        trade.status = TradeStatus.FAILED
        await db.commit()
        await push_event("trade_failed", f"order failed: {trade.side.upper()} {trade.ticker} — {error_msg[:80]}", {"ticker": trade.ticker})
        logger.error("trade.failed", trade_id=str(trade_id), error=error_msg)
        raise HTTPException(500, f"Alpaca rejected: {error_msg}")

    # Poll for fill in background — don't block the HTTP response
    asyncio.create_task(_sync_fill(trade_id, order_id))

    return {"status": "executed", "order_id": order_id}


async def _sync_fill(trade_id: uuid.UUID, order_id: str):
    """Background task: poll Alpaca and update trade to FILLED once confirmed."""
    from app.db.session import AsyncSessionLocal
    fill = await _poll_fill(order_id)
    if not fill.get("filled"):
        logger.info("trade.fill.pending", trade_id=str(trade_id), alpaca_status=fill.get("alpaca_status"))
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Trade).where(Trade.id == trade_id))
        trade = result.scalar_one_or_none()
        if trade and trade.status == TradeStatus.EXECUTED:
            trade.status = TradeStatus.FILLED
            trade.filled_price = fill["filled_price"]
            trade.filled_qty = fill["filled_qty"]
            trade.filled_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info(
                "trade.filled",
                trade_id=str(trade_id),
                filled_price=fill["filled_price"],
                filled_qty=fill["filled_qty"],
            )


# ── POST /{id}/reject ─────────────────────────────────────────────────────────

@router.post("/{trade_id}/reject")
async def reject_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.PENDING:
        raise HTTPException(400, f"Trade is already {trade.status.value.lower()}")
    trade.status = TradeStatus.REJECTED
    await db.commit()
    await push_event("trade_rejected", f"trade rejected: {trade.side.upper()} {trade.ticker}", {"ticker": trade.ticker})
    return {"status": "rejected"}


# ── POST /{id}/liquidate ──────────────────────────────────────────────────────

@router.post("/{trade_id}/liquidate")
async def liquidate_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Close a single position immediately via Alpaca."""
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status not in (TradeStatus.EXECUTED, TradeStatus.FILLED):
        raise HTTPException(400, "Can only liquidate an executed or filled trade")

    try:
        close_result = close_position(trade.ticker)
        trade.status = TradeStatus.LIQUIDATED
        trade.close_reason = "manual"
        trade.closed_at = datetime.now(timezone.utc)
        await db.commit()
        await push_event("trade_liquidated", f"LIQUIDATED {trade.ticker} — manual close", {"ticker": trade.ticker})
        logger.info("trade.liquidated", ticker=trade.ticker, trade_id=str(trade_id))
        return {"status": "liquidated", "detail": close_result}
    except Exception as e:
        logger.error("trade.liquidate.failed", ticker=trade.ticker, error=str(e))
        raise HTTPException(500, f"Liquidate failed: {str(e)}")


# ── POST /liquidate-all ───────────────────────────────────────────────────────

@router.post("/liquidate-all")
async def liquidate_all(db: AsyncSession = Depends(get_db)):
    """Close ALL open positions immediately."""
    positions = get_positions()
    if not positions:
        return {"status": "no_positions", "closed": []}

    results = []
    for pos in positions:
        ticker = pos.symbol
        try:
            close_result = close_position(ticker)
            results.append({"ticker": ticker, "status": "closed", "detail": close_result})
            await push_event("trade_liquidated", f"LIQUIDATED {ticker} — bulk close", {"ticker": ticker})
            logger.info("trade.liquidate_all.closed", ticker=ticker)
        except Exception as e:
            results.append({"ticker": ticker, "status": "failed", "error": str(e)})
            logger.error("trade.liquidate_all.failed", ticker=ticker, error=str(e))

    tickers_closed = [r["ticker"] for r in results if r["status"] == "closed"]
    if tickers_closed:
        executed = await db.execute(
            select(Trade).where(
                and_(
                    Trade.ticker.in_(tickers_closed),
                    Trade.status.in_([TradeStatus.EXECUTED, TradeStatus.FILLED]),
                )
            )
        )
        for t in executed.scalars().all():
            t.status = TradeStatus.LIQUIDATED
            t.close_reason = "bulk_liquidate"
            t.closed_at = datetime.now(timezone.utc)
        await db.commit()

    await push_event("liquidate_all", f"bulk liquidation: {len(tickers_closed)} positions closed", {"count": len(tickers_closed)})
    return {"status": "done", "closed": results}


# ── GET /history ──────────────────────────────────────────────────────────────

@router.get("/history")
async def get_trade_history(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Trade).order_by(Trade.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


# ── GET /recently-failed ──────────────────────────────────────────────────────

@router.get("/recently-failed")
async def get_recently_failed(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Trade)
        .where(
            and_(
                Trade.status == TradeStatus.FAILED,
                Trade.updated_at > datetime.now(timezone.utc) - timedelta(hours=2),
            )
        )
        .order_by(Trade.updated_at.desc())
        .limit(10)
    )
    return result.scalars().all()