from fastapi import APIRouter
from app.broker.alpaca_client import get_account, get_positions
from app.core.logging import logger

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

@router.get("/account")
def account_summary():
    acc = get_account()
    return {
        "equity": float(acc.equity),
        "cash": float(acc.cash),
        "buying_power": float(acc.buying_power),
        "portfolio_value": float(acc.portfolio_value),
        "daytrade_count": acc.daytrade_count,
    }

@router.get("/positions")
def positions():
    pos = get_positions()
    return [
        {
            "ticker": p.symbol,
            "qty": float(p.qty),
            "avg_entry_price": float(p.avg_entry_price),
            "current_price": float(p.current_price),
            "unrealized_pl": float(p.unrealized_pl),
            "unrealized_plpc": float(p.unrealized_plpc),
        }
        for p in pos
    ]

@router.get("/history")
def portfolio_history():
    # Returns empty until account has multi-day history
    return {
        "timestamps": [],
        "equity": [],
        "profit_loss": [],
        "profit_loss_pct": [],
    }