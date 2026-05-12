"""
Technical indicator confirmation layer.
Uses hourly bars for RSI/EMA, daily bars for ATR.
Bar data via yfinance (Alpaca IEX/SIP not available on paper accounts).
Cached 15 minutes per ticker.
"""
import pandas as pd
import threading
from datetime import datetime, timezone, timedelta
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

_bar_cache: dict = {}
_cache_lock = threading.Lock()
CACHE_TTL_SECONDS = 900


def _get_cached(key: str) -> list[dict] | None:
    with _cache_lock:
        if key in _bar_cache:
            data, fetched_at = _bar_cache[key]
            if (datetime.now(timezone.utc) - fetched_at).total_seconds() < CACHE_TTL_SECONDS:
                return data
    return None


def _set_cached(key: str, data: list[dict]):
    with _cache_lock:
        _bar_cache[key] = (data, datetime.now(timezone.utc))


def clear_bar_cache():
    with _cache_lock:
        _bar_cache.clear()


def _yf_to_bars(df: pd.DataFrame) -> list[dict]:
    """Flatten yfinance DataFrame (handles MultiIndex columns) to bar dicts."""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return [
        {
            "open":   float(row.Open),
            "high":   float(row.High),
            "low":    float(row.Low),
            "close":  float(row.Close),
            "volume": float(row.Volume),
        }
        for row in df.itertuples()
    ]


# ── Bar fetchers ──────────────────────────────────────────────────────────────

def get_daily_bars(ticker: str, days: int = 30) -> list[dict]:
    key = f"{ticker}:day:{days}"
    cached = _get_cached(key)
    if cached is not None:
        return cached
    try:
        import yfinance as yf
        end   = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        df    = yf.download(
            ticker,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True,
        )
        if df.empty:
            logger.warning("indicators.daily_bars.empty", ticker=ticker)
            return []
        result = _yf_to_bars(df)
        _set_cached(key, result)
        logger.info("indicators.daily_bars.fetched", ticker=ticker, count=len(result))
        return result
    except Exception as e:
        logger.error("indicators.daily_bars.error", ticker=ticker, error=str(e))
        return []


def get_hourly_bars(ticker: str, days: int = 10) -> list[dict]:
    key = f"{ticker}:hour:{days}"
    cached = _get_cached(key)
    if cached is not None:
        return cached
    try:
        import yfinance as yf
        end   = datetime.now(timezone.utc)
        start = end - timedelta(days=days)
        df    = yf.download(
            ticker,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            interval="1h",
            progress=False,
            auto_adjust=True,
        )
        if df.empty:
            logger.warning("indicators.hourly_bars.empty", ticker=ticker)
            return []
        result = _yf_to_bars(df)
        _set_cached(key, result)
        logger.info("indicators.hourly_bars.fetched", ticker=ticker, count=len(result))
        return result
    except Exception as e:
        logger.error("indicators.hourly_bars.error", ticker=ticker, error=str(e))
        return []


# ── Indicator math ────────────────────────────────────────────────────────────

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
    return 100 - (100 / (1 + avg_gain / avg_loss))


def compute_ema(closes: list[float], period: int) -> float | None:
    if len(closes) < period:
        return None
    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for price in closes[period:]:
        ema = price * k + ema * (1 - k)
    return ema


def compute_atr(bars: list[dict], period: int = 14) -> float | None:
    if len(bars) < period + 1:
        return None
    true_ranges = []
    for i in range(1, len(bars)):
        high, low, prev_close = bars[i]["high"], bars[i]["low"], bars[i - 1]["close"]
        true_ranges.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))
    return sum(true_ranges[-period:]) / period


def compute_atr_percentile(atr: float, closes: list[float]) -> float:
    if not closes or closes[-1] == 0:
        return 0.0
    return (atr / closes[-1]) * 100


def compute_weighted_avg_price(bars: list[dict]) -> float | None:
    if not bars:
        return None
    total_vol = sum(b["volume"] for b in bars)
    if total_vol == 0:
        return None
    return sum(b["close"] * b["volume"] for b in bars) / total_vol


def check_volume_spike(daily_bars: list[dict], lookback: int = 20) -> bool:
    if len(daily_bars) < lookback + 1:
        return False
    volumes = [b["volume"] for b in daily_bars]
    avg = sum(volumes[-lookback - 1:-1]) / lookback
    return volumes[-1] > avg * 1.5


def compute_buy_pressure(bars: list[dict]) -> float:
    """
    Bar-level buy/sell pressure proxy.
    Close > open = buying bar. Returns buy_pct 0–100.
    """
    if not bars:
        return 50.0
    buy_vol  = sum(b["volume"] for b in bars if b["close"] > b["open"])
    sell_vol = sum(b["volume"] for b in bars if b["close"] < b["open"])
    total = buy_vol + sell_vol
    if total == 0:
        return 50.0
    return round((buy_vol / total) * 100, 1)


# ── Main confirmation function ────────────────────────────────────────────────

def confirm_signal(ticker: str, signal_type: str) -> dict:
    """
    Multi-timeframe signal confirmation.
    Hard fails on any data error — no silent confirmed=True pass-throughs.
    """
    FAIL = {
        "confirmed": False,
        "indicator_score": 0.0,
        "atr": None,
        "atr_pct": None,
        "stop_loss_distance": None,
        "buy_pressure_pct": None,
        "details": {},
    }

    try:
        hourly = get_hourly_bars(ticker, days=10)
        daily  = get_daily_bars(ticker, days=30)

        if not hourly or not daily:
            logger.warning("indicators.no_bars", ticker=ticker)
            FAIL["details"] = {"reason": "no bar data returned"}
            return FAIL

        h_closes      = [b["close"] for b in hourly]
        d_closes      = [b["close"] for b in daily]
        current_price = h_closes[-1]

        rsi       = compute_rsi(h_closes, period=14)
        ema9      = compute_ema(h_closes, 9)
        ema21     = compute_ema(h_closes, 21)
        atr       = compute_atr(daily, period=14)
        atr_pct   = compute_atr_percentile(atr, d_closes) if atr else None
        wav_price = compute_weighted_avg_price(daily[-5:])
        vol_spike = check_volume_spike(daily)
        buy_pct   = compute_buy_pressure(hourly[-24:])

        votes = 0
        total = 0

        rsi_ok = False
        if rsi is not None:
            total += 1
            if signal_type == "BUY"  and rsi < 65: rsi_ok = True; votes += 1
            elif signal_type == "SELL" and rsi > 40: rsi_ok = True; votes += 1

        ema_ok = False
        if ema9 and ema21:
            total += 1
            if signal_type == "BUY"  and ema9 > ema21: ema_ok = True; votes += 1
            elif signal_type == "SELL" and ema9 < ema21: ema_ok = True; votes += 1

        wav_ok = False
        if wav_price:
            total += 1
            if signal_type == "BUY"  and current_price > wav_price: wav_ok = True; votes += 1
            elif signal_type == "SELL" and current_price < wav_price: wav_ok = True; votes += 1

        pressure_ok = False
        total += 1
        if signal_type == "BUY"  and buy_pct >= 55: pressure_ok = True; votes += 1
        elif signal_type == "SELL" and buy_pct <= 45: pressure_ok = True; votes += 1

        if vol_spike:
            votes += 1
            total += 1

        atr_veto        = False
        atr_veto_reason = None
        if atr_pct is not None:
            if atr_pct > 3.0:
                atr_veto = True
                atr_veto_reason = f"ATR {atr_pct:.2f}% too high — panic conditions"
            elif atr_pct < 0.2:
                atr_veto = True
                atr_veto_reason = f"ATR {atr_pct:.2f}% too low — no movement"

        indicator_score     = votes / total if total > 0 else 0.0
        confirmed           = (votes >= 2) and not atr_veto
        stop_loss_distance  = round(atr * 2, 2) if atr else None

        details = {
            "rsi":                round(rsi, 1)        if rsi       else None,
            "rsi_ok":             rsi_ok,
            "ema9_hourly":        round(ema9, 2)        if ema9      else None,
            "ema21_hourly":       round(ema21, 2)       if ema21     else None,
            "ema_ok":             ema_ok,
            "weighted_avg_price": round(wav_price, 2)   if wav_price else None,
            "wav_ok":             wav_ok,
            "buy_pressure_pct":   buy_pct,
            "pressure_ok":        pressure_ok,
            "atr_daily":          round(atr, 3)         if atr       else None,
            "atr_pct":            round(atr_pct, 2)     if atr_pct   else None,
            "atr_veto":           atr_veto,
            "atr_veto_reason":    atr_veto_reason,
            "stop_loss_distance": stop_loss_distance,
            "volume_spike":       vol_spike,
            "votes":              votes,
            "total":              total,
            "indicator_score":    round(indicator_score, 2),
        }

        logger.info(
            "indicators.result",
            ticker=ticker, signal=signal_type,
            confirmed=confirmed, votes=votes, total=total,
            buy_pressure_pct=buy_pct,
            atr_pct=round(atr_pct, 2) if atr_pct else None,
            atr_veto=atr_veto,
        )

        return {
            "confirmed":          confirmed,
            "indicator_score":    indicator_score,
            "atr":                atr,
            "atr_pct":            atr_pct,
            "stop_loss_distance": stop_loss_distance,
            "buy_pressure_pct":   buy_pct,
            "details":            details,
        }

    except Exception as e:
        logger.error("indicators.error", ticker=ticker, error=str(e))
        FAIL["details"] = {"reason": f"exception: {str(e)}"}
        return FAIL