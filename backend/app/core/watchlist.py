WATCHLIST = [
    {"ticker": "BTC/USD", "description": "Bitcoin / US Dollar", "type": "crypto"},
    {"ticker": "SPY", "description": "S&P 500 broad market", "type": "etf"},
    {"ticker": "QQQ", "description": "Nasdaq / tech heavy", "type": "etf"},
    {"ticker": "XLE", "description": "Energy sector", "type": "etf"},
    {"ticker": "SLV", "description": "Silver (safe haven)", "type": "etf"},
    {"ticker": "USO", "description": "Crude oil ETF", "type": "etf"},
    {"ticker": "GLD", "description": "Gold (safe haven)", "type": "etf"},
    {"ticker": "TLT", "description": "Long-term treasuries", "type": "etf"},
    {"ticker": "XLK", "description": "Technology sector", "type": "etf"},
    {"ticker": "XLF", "description": "Financial sector", "type": "etf"},
    {"ticker": "XLI", "description": "Industrials sector", "type": "etf"},
    {"ticker": "XLV", "description": "Healthcare sector", "type": "etf"},
]

# Flat list of tickers for loops
TICKER_LIST = [w["ticker"] for w in WATCHLIST]

# ETFs only (for yfinance / stock clients)
ETF_TICKERS = [w["ticker"] for w in WATCHLIST if w["type"] == "etf"]

# Crypto only
CRYPTO_TICKERS = [w["ticker"] for w in WATCHLIST if w["type"] == "crypto"]

# Map ticker -> meta
WATCHLIST_META = {w["ticker"]: w for w in WATCHLIST}


def is_crypto(ticker: str) -> bool:
    return WATCHLIST_META.get(ticker, {}).get("type") == "crypto"


def yf_ticker(ticker: str) -> str:
    """Convert Alpaca crypto format to yfinance format: BTC/USD -> BTC-USD"""
    return ticker.replace("/", "-")


WATCHLIST_CONTEXT = """
Our trading universe is ETFs and crypto:
- SPY: S&P 500 broad market
- QQQ: Nasdaq / tech heavy
- XLK: Technology sector
- XLF: Financial sector
- XLE: Energy sector
- XLV: Healthcare sector
- XLI: Industrials sector
- GLD: Gold (safe haven)
- TLT: Long-term treasuries (safe haven, inverse risk)
- SLV: Silver (safe haven, inflation hedge)
- USO: Crude oil ETF (energy proxy)
- BTC/USD: Bitcoin (risk-on crypto, correlated with QQQ)

Strategy: sector rotation + crypto based on macro events.
When risk-off signals appear (war, recession fears, inflation) → GLD, TLT, SLV.
When tech/crypto optimism → QQQ, XLK, BTC/USD.
When energy supply shock → XLE, USO.
When broad market bullish → SPY.
When dollar weakness → GLD, SLV, BTC/USD.
"""
