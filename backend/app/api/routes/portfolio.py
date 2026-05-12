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
    from app.indicators.technical import get_daily_bars, compute_atr
    from app.broker.position_monitor import ATR_STOP_MULT, ATR_TP_MULT, STOP_LOSS_PCT, TAKE_PROFIT_PCT

    pos_list = get_positions()
    result = []
    for p in pos_list:
        entry = float(p.avg_entry_price)
        current = float(p.current_price)
        unrealized_plpc = float(p.unrealized_plpc)

        # Try ATR-based levels first
        try:
            bars = get_daily_bars(p.symbol, days=20)
            atr = compute_atr(bars, period=14) if bars else None
        except Exception:
            atr = None

        if atr:
            stop_loss  = round(entry - (atr * ATR_STOP_MULT), 2)
            take_profit = round(entry + (atr * ATR_TP_MULT), 2)
        else:
            stop_loss  = round(entry * (1 - STOP_LOSS_PCT), 2)
            take_profit = round(entry * (1 + TAKE_PROFIT_PCT), 2)

        # How far are we from each level (as %)
        pct_to_stop   = round((current - stop_loss) / current * 100, 2)
        pct_to_target = round((take_profit - current) / current * 100, 2)

        result.append({
            "ticker": p.symbol,
            "qty": float(p.qty),
            "avg_entry_price": entry,
            "current_price": current,
            "unrealized_pl": float(p.unrealized_pl),
            "unrealized_plpc": unrealized_plpc,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "pct_to_stop": pct_to_stop,
            "pct_to_target": pct_to_target,
        })
    return result

@router.get("/quotes")
def get_quotes():
    try:
        from alpaca.data.requests import StockLatestBarRequest
        from alpaca.data.enums import DataFeed
        req = StockLatestBarRequest(
            symbol_or_symbols=WATCHLIST,
            feed=DataFeed.IEX,
        )
        bars = data_client.get_stock_latest_bar(req)
        return {sym: float(b.close) for sym, b in bars.items()}
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