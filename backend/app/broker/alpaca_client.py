from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockLatestQuoteRequest, StockLatestBarRequest
from alpaca.data.enums import DataFeed
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

trading_client = TradingClient(
    api_key=settings.alpaca_api_key,
    secret_key=settings.alpaca_secret_key,
    paper=True,
)

data_client = StockHistoricalDataClient(
    api_key=settings.alpaca_api_key,
    secret_key=settings.alpaca_secret_key,
)


def get_account():
    return trading_client.get_account()


def get_positions():
    return trading_client.get_all_positions()


def get_latest_price(ticker: str) -> float:
    req = StockLatestBarRequest(symbol_or_symbols=ticker, feed=DataFeed.IEX)
    bars = data_client.get_stock_latest_bar(req)
    return float(bars[ticker].close) if ticker in bars else 0.0


def place_market_order(ticker: str, side: str, notional: float) -> dict:
    order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL

    try:
        req = StockLatestBarRequest(symbol_or_symbols=ticker, feed=DataFeed.IEX)
        bars = data_client.get_stock_latest_bar(req)
        price = float(bars[ticker].close) if ticker in bars else None
    except Exception:
        price = None

    if price and price > 0:
        qty = max(1, int(notional / price))
        order_req = MarketOrderRequest(
            symbol=ticker,
            qty=qty,
            side=order_side,
            time_in_force=TimeInForce.DAY,  # ← was GTC, paper trading needs DAY
        )
        logger.info(
            "alpaca.order.whole_shares",
            ticker=ticker,
            qty=qty,
            price=price,
            notional=notional,
        )
    else:
        order_req = MarketOrderRequest(
            symbol=ticker,
            notional=round(notional, 2),
            side=order_side,
            time_in_force=TimeInForce.DAY,
        )
        logger.info("alpaca.order.notional_fallback", ticker=ticker, notional=notional)

    try:
        order = trading_client.submit_order(order_req)
        logger.info(
            "alpaca.order.submitted", ticker=ticker, side=side, order_id=str(order.id)
        )
        return {"order_id": str(order.id), "status": str(order.status)}
    except Exception as e:
        logger.error("alpaca.order.failed", ticker=ticker, error=str(e))
        raise


def cancel_order(order_id: str):
    trading_client.cancel_order_by_id(order_id)


def get_portfolio_history():
    from alpaca.trading.requests import GetPortfolioHistoryRequest
    from alpaca.trading.enums import TimeFrame, PortfolioHistoryTimeframe

    try:
        req = GetPortfolioHistoryRequest(period="1M", timeframe="1D")
        return trading_client.get_portfolio_history(request_params=req)
    except Exception:
        # Paper accounts with no history return empty — handle gracefully
        return None


def close_position(ticker: str) -> dict:
    """Market-close an entire position."""

    result = trading_client.close_position(ticker)
    return {"order_id": result.id, "status": result.status}
