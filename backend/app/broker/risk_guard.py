"""
Hard risk rules. Every trade proposal passes through here before
hitting the approval queue. If it fails, it's dead.
"""

from app.broker.alpaca_client import get_account
from app.core.logging import logger

# ── Risk parameters ───────────────────────────────────────────────────────────
MAX_POSITION_EQUITY_PCT = 0.10  # max 10% of account equity per single trade
MAX_TOTAL_EXPOSURE_PCT = 0.50  # max 50% of account equity across ALL open positions
MIN_ACCOUNT_BALANCE = 400.0  # kill switch — bot pauses below this
MIN_NOTIONAL_PER_TRADE = 25.0  # floor so we don't submit $1 trades
STOP_LOSS_PCT = 0.03  # used externally by position_monitor


class RiskViolation(Exception):
    pass


def get_equity() -> float:
    account = get_account()
    return float(account.equity)


def validate_trade(ticker: str, notional: float, current_open_notional: float):
    """
    Validate a proposed trade against equity-based risk rules.

    Args:
        ticker:               the instrument being traded
        notional:             dollar amount of this trade
        current_open_notional: total dollar value of all currently open positions
    """
    equity = get_equity()

    # Kill switch
    if equity < MIN_ACCOUNT_BALANCE:
        raise RiskViolation(
            f"Account equity ${equity:.2f} below minimum ${MIN_ACCOUNT_BALANCE}. Bot paused."
        )

    # Floor check
    if notional < MIN_NOTIONAL_PER_TRADE:
        raise RiskViolation(
            f"Notional ${notional} below minimum trade size ${MIN_NOTIONAL_PER_TRADE}."
        )

    # Per-trade cap: this single trade must not exceed X% of account
    max_single = round(equity * MAX_POSITION_EQUITY_PCT, 2)
    if notional > max_single:
        raise RiskViolation(
            f"{ticker}: notional ${notional} exceeds {MAX_POSITION_EQUITY_PCT*100:.0f}% "
            f"of equity (${max_single} max at current equity ${equity:.0f})."
        )

    # Total exposure cap: existing + this trade must not exceed Y% of account
    max_total = round(equity * MAX_TOTAL_EXPOSURE_PCT, 2)
    if current_open_notional + notional > max_total:
        raise RiskViolation(
            f"Total exposure ${current_open_notional + notional:.0f} would exceed "
            f"{MAX_TOTAL_EXPOSURE_PCT*100:.0f}% of equity (${max_total} max). "
            f"Current open: ${current_open_notional:.0f}."
        )

    logger.info(
        "risk_guard.passed",
        ticker=ticker,
        notional=notional,
        equity=equity,
        position_pct=round((notional / equity) * 100, 2),
        total_exposure_pct=round(
            ((current_open_notional + notional) / equity) * 100, 2
        ),
    )
    return True


def compute_notional(confidence: float) -> float:
    """
    Scale position size by combined LLM+indicator confidence, capped at
    MAX_POSITION_EQUITY_PCT of current account equity.

    confidence 1.0 → full 10% of equity
    confidence 0.55 → ~5.5% of equity
    Floor at MIN_NOTIONAL_PER_TRADE.
    """
    equity = get_equity()
    max_notional = round(equity * MAX_POSITION_EQUITY_PCT, 2)
    raw = confidence * max_notional
    return round(max(MIN_NOTIONAL_PER_TRADE, min(max_notional, raw)), 2)
