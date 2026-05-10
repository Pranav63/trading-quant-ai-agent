from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db.session import get_db
from app.models.market import Trade, TradeStatus, Position
from app.broker.alpaca_client import place_market_order, get_positions
from app.broker.risk_guard import validate_trade, RiskViolation
from app.core.logging import logger
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/trades", tags=["trades"])

@router.get("/pending")
async def get_pending_trades(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Trade).where(Trade.status == TradeStatus.PENDING).order_by(Trade.created_at.desc())
    )
    return result.scalars().all()

@router.post("/{trade_id}/approve")
async def approve_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.PENDING:
        raise HTTPException(400, f"Trade is {trade.status}, not PENDING")

    # Count open positions
    positions = get_positions()
    try:
        validate_trade(trade.ticker, trade.notional, len(positions))
    except RiskViolation as e:
        trade.status = TradeStatus.FAILED
        await db.commit()
        raise HTTPException(400, str(e))

    try:
        result_order = place_market_order(trade.ticker, trade.side, trade.notional)
        trade.status = TradeStatus.EXECUTED
        trade.alpaca_order_id = result_order["order_id"]
        trade.filled_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("trade.approved.executed", trade_id=str(trade_id), order_id=result_order["order_id"])
        return {"status": "executed", "order_id": result_order["order_id"]}
    except Exception as e:
        trade.status = TradeStatus.FAILED
        await db.commit()
        raise HTTPException(500, f"Execution failed: {str(e)}")

@router.post("/{trade_id}/reject")
async def reject_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    trade.status = TradeStatus.REJECTED
    await db.commit()
    return {"status": "rejected"}

@router.get("/history")
async def get_trade_history(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Trade).order_by(Trade.created_at.desc()).limit(limit)
    )
    return result.scalars().all()
