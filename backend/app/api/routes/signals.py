from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.models.market import Signal, Trade, TradeStatus, SignalType

router = APIRouter(prefix="/signals", tags=["signals"])


@router.get("/recent")
async def get_recent_signals(
    limit: int = Query(20, le=100), db: AsyncSession = Depends(get_db)
):
    """
    Returns recent signals deduplicated per ticker.
    If a ticker has both BUY and SELL signals, only the most recent one is shown.
    Attaches pending trade info and indicator details.
    """
    result = await db.execute(
        select(Signal).order_by(Signal.created_at.desc()).limit(limit * 3)
    )
    all_signals = result.scalars().all()

    # Dedup: keep only the latest signal per ticker
    seen: dict[str, Signal] = {}
    for sig in all_signals:
        if sig.ticker not in seen:
            seen[sig.ticker] = sig

    deduped = sorted(seen.values(), key=lambda s: s.created_at, reverse=True)[:limit]

    # Fetch pending trades for these tickers to attach status
    tickers = [s.ticker for s in deduped]
    pending_result = await db.execute(
        select(Trade).where(
            Trade.ticker.in_(tickers),
            Trade.status == TradeStatus.PENDING,
        )
    )
    pending_map: dict[str, Trade] = {}
    for t in pending_result.scalars().all():
        pending_map[t.ticker] = t  # latest pending per ticker

    output = []
    for sig in deduped:
        trade = pending_map.get(sig.ticker)
        indicators = {}
        buy_pressure = None
        if sig.raw_llm_response and isinstance(sig.raw_llm_response, dict):
            indicators = sig.raw_llm_response.get("indicators", {})
            buy_pressure = sig.raw_llm_response.get("buy_pressure_pct")

        output.append(
            {
                "id": str(sig.id),
                "ticker": sig.ticker,
                "signal_type": sig.signal_type,
                "confidence": sig.confidence,
                "reasoning": sig.reasoning,
                "created_at": sig.created_at.isoformat(),
                "llm_model": sig.llm_model,
                "buy_pressure_pct": buy_pressure,
                "indicators": {
                    "rsi": indicators.get("rsi"),
                    "ema_ok": indicators.get("ema_ok"),
                    "atr_pct": indicators.get("atr_pct"),
                    "atr_veto": indicators.get("atr_veto"),
                    "atr_veto_reason": indicators.get("atr_veto_reason"),
                    "votes": indicators.get("votes"),
                    "total": indicators.get("total"),
                    "volume_spike": indicators.get("volume_spike"),
                },
                "pending_trade": (
                    {
                        "id": str(trade.id),
                        "side": trade.side,
                        "notional": trade.notional,
                        "status": trade.status,
                    }
                    if trade
                    else None
                ),
            }
        )

    return output


@router.get("/conflicts")
async def get_signal_conflicts(db: AsyncSession = Depends(get_db)):
    """
    Debug endpoint — shows any tickers that currently have BOTH
    a BUY and SELL pending trade (should be zero after the fix).
    """
    result = await db.execute(
        select(Trade.ticker, Trade.side).where(Trade.status == TradeStatus.PENDING)
    )
    rows = result.all()

    by_ticker: dict[str, set] = {}
    for row in rows:
        by_ticker.setdefault(row.ticker, set()).add(row.side)

    conflicts = [
        {"ticker": t, "sides": list(sides)}
        for t, sides in by_ticker.items()
        if len(sides) > 1
    ]
    return {"conflicts": conflicts, "count": len(conflicts)}
