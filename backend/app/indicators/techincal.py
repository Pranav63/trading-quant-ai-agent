"""
Technical indicator confirmation layer.
Uses hourly bars for RSI and EMA (relevant for same-day news entries).
Uses daily bars for ATR (volatility context over recent sessions).
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

def get_hourly_bars(ticker: str, days: int = 10) -> list[dict]:
    """Hourly bars — relevant for same-day signal entries."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    req = StockBarsRequest(
        symbol_or_symbols=ticker,
        timeframe=TimeFrame.Hour,
        start=start,
        end=end,
    )
    bars = data_client.get_stock_bars(req)
    return [
        {
            "open": float(b.open),
            "high": float(b.high),
            "low": float(b.low),
            "close": float(b.close),
            "volume": float(b.volume),
        }
        for b in bars[ticker]
    ] if ticker in bars else []


def get_daily_bars(ticker: str, days: int = 30) -> list[dict]:
    """Daily bars — for ATR and volume spike context."""
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
            "open": float(b.open),
            "high": float(b.high),
            "low": float(b.low),
            "close": float(b.close),
            "volume": float(b.volume),
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


def compute_atr(bars: list[dict], period: int = 14) -> float | None:
    """
    Average True Range over daily bars.
    True Range = max(high-low, abs(high-prev_close), abs(low-prev_close))
    """
    if len(bars) < period + 1:
        return None
    true_ranges = []
    for i in range(1, len(bars)):
        high = bars[i]["high"]
        low = bars[i]["low"]
        prev_close = bars[i - 1]["close"]
        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close),
        )
        true_ranges.append(tr)
    # Simple average of last N true ranges
    return sum(true_ranges[-period:]) / period


def compute_atr_percentile(atr: float, closes: list[float]) -> float:
    """
    ATR as % of current price — normalizes across different-priced ETFs.
    XLE at $88 and SPY at $521 have very different raw ATR values.
    """
    if not closes or closes[-1] == 0:
        return 0.0
    return (atr / closes[-1]) * 100


def compute_weighted_avg_price(bars: list[dict]) -> float | None:
    """
    Volume-weighted average price over supplied bars.
    Not intraday VWAP — honest name for what this actually computes.
    """
    if not bars:
        return None
    total_vol = sum(b["volume"] for b in bars)
    if total_vol == 0:
        return None
    return sum(b["close"] * b["volume"] for b in bars) / total_vol


def check_volume_spike(daily_bars: list[dict], lookback: int = 20) -> bool:
    """
    Checks if the most recent COMPLETED day had a volume spike.
    Note: current day volume not included until market close.
    """
    if len(daily_bars) < lookback + 1:
        return False
    volumes = [b["volume"] for b in daily_bars]
    avg = sum(volumes[-lookback-1:-1]) / lookback
    return volumes[-1] > avg * 1.5


def confirm_signal(ticker: str, signal_type: str) -> dict:
    """
    Multi-timeframe signal confirmation.

    Hourly bars → RSI(14), EMA 9/21 (fast, relevant for news entries)
    Daily bars → ATR volatility filter, volume spike, weighted avg price

    Returns:
        confirmed: bool
        indicator_score: float (0.0 - 1.0)
        atr: float | None (for dynamic stop-loss sizing)
        atr_pct: float | None (ATR as % of price)
        details: dict
    """
    try:
        hourly = get_hourly_bars(ticker, days=10)
        daily = get_daily_bars(ticker, days=30)

        if not hourly or not daily:
            logger.warning("indicators.no_bars", ticker=ticker)
            return {
                "confirmed": True,
                "indicator_score": 0.5,
                "atr": None,
                "atr_pct": None,
                "details": {},
            }

        h_closes = [b["close"] for b in hourly]
        d_closes = [b["close"] for b in daily]
        current_price = h_closes[-1]

        # --- Hourly indicators (fast signal confirmation) ---
        rsi = compute_rsi(h_closes, period=14)
        ema9 = compute_ema(h_closes, 9)
        ema21 = compute_ema(h_closes, 21)

        # --- Daily indicators (context) ---
        atr = compute_atr(daily, period=14)
        atr_pct = compute_atr_percentile(atr, d_closes) if atr else None
        wav_price = compute_weighted_avg_price(daily[-5:])
        vol_spike = check_volume_spike(daily)

        votes = 0
        total = 0

        # RSI — hourly
        rsi_ok = False
        if rsi is not None:
            total += 1
            if signal_type == "BUY" and rsi < 65:
                rsi_ok = True
                votes += 1
            elif signal_type == "SELL" and rsi > 40:
                rsi_ok = True
                votes += 1

        # EMA crossover — hourly
        ema_ok = False
        if ema9 and ema21:
            total += 1
            if signal_type == "BUY" and ema9 > ema21:
                ema_ok = True
                votes += 1
            elif signal_type == "SELL" and ema9 < ema21:
                ema_ok = True
                votes += 1

        # Weighted average price — daily
        wav_ok = False
        if wav_price:
            total += 1
            if signal_type == "BUY" and current_price > wav_price:
                wav_ok = True
                votes += 1
            elif signal_type == "SELL" and current_price < wav_price:
                wav_ok = True
                votes += 1

        # Volume spike — bonus
        if vol_spike:
            votes += 1
            total += 1

        # ATR volatility filter — hard veto, not a vote
        # If ATR > 3% of price: market is in panic, skip entry
        # If ATR < 0.2% of price: market is dead, news won't move it
        atr_veto = False
        atr_veto_reason = None
        if atr_pct is not None:
            if atr_pct > 3.0:
                atr_veto = True
                atr_veto_reason = f"ATR {atr_pct:.2f}% too high — panic conditions"
            elif atr_pct < 0.2:
                atr_veto = True
                atr_veto_reason = f"ATR {atr_pct:.2f}% too low — no movement"

        indicator_score = votes / total if total > 0 else 0.5
        confirmed = (votes >= 2) and not atr_veto

        # Dynamic stop-loss: 2× ATR from entry
        stop_loss_distance = round(atr * 2, 2) if atr else None

        details = {
            "rsi": round(rsi, 1) if rsi else None,
            "rsi_ok": rsi_ok,
            "ema9_hourly": round(ema9, 2) if ema9 else None,
            "ema21_hourly": round(ema21, 2) if ema21 else None,
            "ema_ok": ema_ok,
            "weighted_avg_price": round(wav_price, 2) if wav_price else None,
            "wav_ok": wav_ok,
            "atr_daily": round(atr, 3) if atr else None,
            "atr_pct": round(atr_pct, 2) if atr_pct else None,
            "atr_veto": atr_veto,
            "atr_veto_reason": atr_veto_reason,
            "stop_loss_distance": stop_loss_distance,
            "volume_spike": vol_spike,
            "votes": votes,
            "total": total,
            "indicator_score": round(indicator_score, 2),
        }

        logger.info(
            "indicators.result",
            ticker=ticker,
            signal=signal_type,
            confirmed=confirmed,
            votes=votes,
            total=total,
            atr_pct=round(atr_pct, 2) if atr_pct else None,
            atr_veto=atr_veto,
        )

        return {
            "confirmed": confirmed,
            "indicator_score": indicator_score,
            "atr": atr,
            "atr_pct": atr_pct,
            "stop_loss_distance": stop_loss_distance,
            "details": details,
        }

    except Exception as e:
        logger.error("indicators.error", ticker=ticker, error=str(e))
        return {
            "confirmed": True,
            "indicator_score": 0.5,
            "atr": None,
            "atr_pct": None,
            "stop_loss_distance": None,
            "details": {},
        }