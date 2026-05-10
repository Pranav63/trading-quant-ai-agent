import finnhub
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()
_client = finnhub.Client(api_key=settings.finnhub_api_key)

# Finnhub free = 60 req/min. We stay under 50 to be safe.
_rate_limiter = asyncio.Semaphore(1)
_last_call_time = 0.0
MIN_INTERVAL = 60.0 / 50  # 1.2 seconds between calls

async def _throttled_call(fn, *args, **kwargs):
    global _last_call_time
    async with _rate_limiter:
        now = asyncio.get_event_loop().time()
        wait = MIN_INTERVAL - (now - _last_call_time)
        if wait > 0:
            await asyncio.sleep(wait)
        result = await asyncio.get_event_loop().run_in_executor(None, lambda: fn(*args, **kwargs))
        _last_call_time = asyncio.get_event_loop().time()
        return result

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def get_company_news(ticker: str, from_date: str, to_date: str) -> list[dict]:
    try:
        news = await _throttled_call(_client.company_news, ticker, _from=from_date, to=to_date)
        logger.info("finnhub.news.fetched", ticker=ticker, count=len(news))
        return news
    except Exception as e:
        logger.error("finnhub.news.error", ticker=ticker, error=str(e))
        raise

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def get_quote(ticker: str) -> dict:
    try:
        quote = await _throttled_call(_client.quote, ticker)
        return quote
    except Exception as e:
        logger.error("finnhub.quote.error", ticker=ticker, error=str(e))
        raise

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def get_earnings_surprise(ticker: str) -> list[dict]:
    try:
        return await _throttled_call(_client.company_earnings, ticker, limit=4)
    except Exception as e:
        logger.error("finnhub.earnings.error", ticker=ticker, error=str(e))
        raise
