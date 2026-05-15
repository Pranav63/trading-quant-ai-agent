from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.historical import StockHistoricalDataClient, CryptoHistoricalDataClient
from alpaca.data.requests import StockLatestBarRequest, CryptoLatestBarRequest
from alpaca.data.enums import DataFeed
from app.core.config import get_settings
from app.core.logging import logger
from app.core.watchlist import is_crypto

settings = get_settings()

trading_client = TradingClient(
    api_key=settings.alpaca_api_key,
    secret_key=settings.alpaca_secret_key,
    paper=True,
)

stock_data_client = StockHistoricalDataClient(
    api_key=settings.alpaca_api_key,
    secret_key=settings.alpaca_secret_key,
)

crypto_data_client = CryptoHistoricalDataClient(
    api_key=settings.alpaca_api_key,
    secret_key=settings.alpaca_secret_key,
)


def get_account():
    return trading_client.get_account()


def get_positions():
    return trading_client.get_all_positions()


def get_latest_price(ticker: str) -> float:
    try:
        if is_crypto(ticker):
            req = CryptoLatestBarRequest(symbol_or_symbols=ticker)
            bars = crypto_data_client.get_crypto_latest_bar(req)
            return float(bars[ticker].close) if ticker in bars else 0.0
        else:
            req = StockLatestBarRequest(symbol_or_symbols=ticker, feed=DataFeed.IEX)
            bars = stock_data_client.get_stock_latest_bar(req)
            return float(bars[ticker].close) if ticker in bars else 0.0
    except Exception as e:
        logger.error("alpaca.get_latest_price.failed", ticker=ticker, error=str(e))
        return 0.0


def place_market_order(ticker: str, side: str, notional: float) -> dict:
    order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL

    price = get_latest_price(ticker)

    if is_crypto(ticker):
        # Crypto: use notional directly — supports fractional
        order_req = MarketOrderRequest(
            symbol=ticker,
            notional=round(notional, 2),
            side=order_side,
            time_in_force=TimeInForce.GTC,  # crypto is 24/7
        )
        logger.info("alpaca.order.crypto_notional", ticker=ticker, notional=notional)
    elif price and price > 0:
        qty = max(1, int(notional / price))
        order_req = MarketOrderRequest(
            symbol=ticker,
            qty=qty,
            side=order_side,
            time_in_force=TimeInForce.DAY,
        )
        logger.info("alpaca.order.whole_shares", ticker=ticker, qty=qty, price=price)
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

    try:
        req = GetPortfolioHistoryRequest(period="1M", timeframe="1D")
        return trading_client.get_portfolio_history(request_params=req)
    except Exception:
        return None


def close_position(ticker: str) -> dict:
    result = trading_client.close_position(ticker)
    return {"order_id": result.id, "status": result.status}
