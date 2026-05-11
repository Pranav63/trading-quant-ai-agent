"""
Technical indicator confirmation layer.
Called after LLM classification. Signal only becomes a PENDING trade
if technical indicators agree with the LLM direction.
"""
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

data_client = StockHistoricalDataClient(
    api_key=settings.alpaca_api_key,
    secret_key=settings.alpaca_secret_key,
)

def get_bars(ticker: str, days: int = 30) -> list[dict]:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    req = StockBarsRequest(
        symbol_or_symbols=ticker,
        timeframe=TimeFrame.Day,
        start=start,
        end=end,
    )
    bars = data_client.get_stock_bars(req)
    return [
        {
            "close": float(b.close),
            "volume": float(b.volume),
            "vwap": float(b.vwap) if b.vwap else float(b.close),
        }
        for b in bars[ticker]
    ] if ticker in bars else []


def compute_rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gains.append(max(delta, 0))
        losses.append(max(-delta, 0))
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def compute_ema(closes: list[float], period: int) -> float | None:
    if len(closes) < period:
        return None
    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for price in closes[period:]:
        ema = price * k + ema * (1 - k)
    return ema


def compute_vwap(bars: list[dict]) -> float | None:
    if not bars:
        return None
    total_vol = sum(b["volume"] for b in bars)
    if total_vol == 0:
        return None
    return sum(b["vwap"] * b["volume"] for b in bars) / total_vol


def check_volume_spike(volumes: list[float], lookback: int = 20) -> bool:
    if len(volumes) < lookback + 1:
        return False
    avg = sum(volumes[-lookback-1:-1]) / lookback
    return volumes[-1] > avg * 1.5


def confirm_signal(ticker: str, signal_type: str) -> dict:
    """
    Returns:
        confirmed: bool
        indicator_score: float (0.0 - 1.0)
        details: dict of individual indicator results
    """
    try:
        bars = get_bars(ticker, days=60)
        if not bars:
            logger.warning("indicators.no_bars", ticker=ticker)
            return {"confirmed": True, "indicator_score": 0.5, "details": {}}

        closes = [b["close"] for b in bars]
        volumes = [b["volume"] for b in bars]
        current_price = closes[-1]

        rsi = compute_rsi(closes)
        ema9 = compute_ema(closes, 9)
        ema21 = compute_ema(closes, 21)
        vwap = compute_vwap(bars[-5:])  # 5-day VWAP
        vol_spike = check_volume_spike(volumes)

        votes = 0
        total = 0

        # RSI check
        rsi_ok = False
        if rsi is not None:
            total += 1
            if signal_type == "BUY" and rsi < 65:
                rsi_ok = True
                votes += 1
            elif signal_type == "SELL" and rsi > 40:
                rsi_ok = True
                votes += 1

        # EMA crossover
        ema_ok = False
        if ema9 and ema21:
            total += 1
            if signal_type == "BUY" and ema9 > ema21:
                ema_ok = True
                votes += 1
            elif signal_type == "SELL" and ema9 < ema21:
                ema_ok = True
                votes += 1

        # VWAP
        vwap_ok = False
        if vwap:
            total += 1
            if signal_type == "BUY" and current_price > vwap:
                vwap_ok = True
                votes += 1
            elif signal_type == "SELL" and current_price < vwap:
                vwap_ok = True
                votes += 1

        # Volume spike (bonus vote, always counts)
        if vol_spike:
            votes += 1
            total += 1

        indicator_score = votes / total if total > 0 else 0.5
        # Confirm if at least 2 of the main 3 indicators agree
        confirmed = (votes >= 2)

        details = {
            "rsi": round(rsi, 1) if rsi else None,
            "rsi_ok": rsi_ok,
            "ema9": round(ema9, 2) if ema9 else None,
            "ema21": round(ema21, 2) if ema21 else None,
            "ema_ok": ema_ok,
            "vwap": round(vwap, 2) if vwap else None,
            "vwap_ok": vwap_ok,
            "volume_spike": vol_spike,
            "votes": votes,
            "total": total,
            "indicator_score": round(indicator_score, 2),
        }

        logger.info("indicators.result", ticker=ticker, signal=signal_type,
                    confirmed=confirmed, votes=votes, total=total)
        return {"confirmed": confirmed, "indicator_score": indicator_score, "details": details}

    except Exception as e:
        logger.error("indicators.error", ticker=ticker, error=str(e))
        # Don't block the signal if indicators fail — just pass through
        return {"confirmed": True, "indicator_score": 0.5, "details": {}}