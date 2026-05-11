from fastapi import APIRouter
from app.broker.alpaca_client import get_account, get_positions, data_client
from app.core.logging import logger
from alpaca.data.requests import StockLatestQuoteRequest

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

WATCHLIST = ["SPY", "QQQ", "XLE", "GLD", "TLT", "XLK", "XLF", "XLI", "XLV"]

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

@router.get("/quotes")
def get_quotes():
    try:
        req = StockLatestQuoteRequest(symbol_or_symbols=WATCHLIST)
        quotes = data_client.get_stock_latest_quote(req)
        result = {}
        for sym, q in quotes.items():
            price = q.ask_price or q.bid_price
            if price:
                result[sym] = float(price)
        return result
    except Exception as e:
        logger.error("quotes.error", error=str(e))
        return {}

@router.get("/history")
def portfolio_history():
    return {
        "timestamps": [],
        "equity": [],
        "profit_loss": [],
        "profit_loss_pct": [],
    }