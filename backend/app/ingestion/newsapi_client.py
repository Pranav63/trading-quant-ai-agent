import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()
BASE_URL = "https://newsapi.org/v2"

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def get_top_business_headlines(query: str = None, page_size: int = 20) -> list[dict]:
    params = {
        "apiKey": settings.newsapi_key,
        "category": "business",
        "language": "en",
        "pageSize": page_size,
        "country": "us",
    }
    if query:
        params["q"] = query

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{BASE_URL}/top-headlines", params=params)
            r.raise_for_status()
            articles = r.json().get("articles", [])
            logger.info("newsapi.headlines.fetched", count=len(articles))
            return articles
        except Exception as e:
            logger.error("newsapi.headlines.error", error=str(e))
            raise

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
async def search_news(query: str, page_size: int = 10) -> list[dict]:
    params = {
        "apiKey": settings.newsapi_key,
        "q": query,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": page_size,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{BASE_URL}/everything", params=params)
            r.raise_for_status()
            return r.json().get("articles", [])
        except Exception as e:
            logger.error("newsapi.search.error", query=query, error=str(e))
            raise
