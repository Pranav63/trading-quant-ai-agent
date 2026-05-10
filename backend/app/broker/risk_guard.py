"""
Hard risk rules. Every trade proposal passes through here before
hitting the approval queue. If it fails, it's dead.
"""
from app.broker.alpaca_client import get_account
from app.core.logging import logger

MAX_NOTIONAL_PER_TRADE = 100.0   # max $ per single trade
MAX_OPEN_POSITIONS = 3           # max concurrent positions
STOP_LOSS_PCT = 0.03             # 3% stop loss per position
MIN_ACCOUNT_BALANCE = 400.0      # kill switch threshold (paper: $400 of $500)

class RiskViolation(Exception):
    pass

def validate_trade(ticker: str, notional: float, current_position_count: int):
    account = get_account()
    equity = float(account.equity)

    if equity < MIN_ACCOUNT_BALANCE:
        raise RiskViolation(
            f"Account equity ${equity:.2f} below minimum ${MIN_ACCOUNT_BALANCE}. Bot paused."
        )

    if notional > MAX_NOTIONAL_PER_TRADE:
        raise RiskViolation(
            f"Notional ${notional} exceeds max ${MAX_NOTIONAL_PER_TRADE} per trade."
        )

    if current_position_count >= MAX_OPEN_POSITIONS:
        raise RiskViolation(
            f"Already at max {MAX_OPEN_POSITIONS} open positions."
        )

    logger.info("risk_guard.passed", ticker=ticker, notional=notional, equity=equity)
    return True

def compute_notional(confidence: float) -> float:
    """
    Scale position size by LLM confidence.
    confidence 0.9 → $100, confidence 0.5 → $55
    """
    return round(max(25.0, min(MAX_NOTIONAL_PER_TRADE, confidence * MAX_NOTIONAL_PER_TRADE * 1.1)), 2)
