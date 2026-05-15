from app.models.market import NewsArticle

TIER_1_SOURCES = {"rss_reuters_business", "rss_reuters_markets", "rss_wsj_markets", "rss_ft_markets"}
TIER_2_SOURCES = {"finnhub", "newsapi", "rss_investing.com_economy"}
NOISE_SOURCES  = {"reddit"}
WATCHLIST      = {"SPY", "QQQ", "XLE", "GLD", "TLT", "XLK", "XLF", "XLI", "XLV"}


def classify_signal(article: NewsArticle) -> str:
    source     = article.source or ""
    tickers    = set(article.tickers or [])
    s          = article.sentiment_raw
    has_ticker = bool(tickers & WATCHLIST)

    if source == "fred":
        return "CRITICAL" if (s is not None and (s < 0.2 or s > 0.8)) else "ELEVATED"

    if source in TIER_1_SOURCES and s is not None and (s < 0.2 or s > 0.8):
        return "CRITICAL"

    if source in TIER_1_SOURCES or has_ticker:
        return "ELEVATED"

    if source in TIER_2_SOURCES and has_ticker:
        return "MONITORING"

    if source in NOISE_SOURCES or not has_ticker:
        return "NOISE"

    return "MONITORING"