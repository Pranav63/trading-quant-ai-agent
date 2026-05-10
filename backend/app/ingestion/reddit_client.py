import asyncpraw
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

SUBREDDITS = ["stocks", "investing", "wallstreetbets", "StockMarket"]

async def get_reddit_sentiment(ticker: str, limit: int = 25) -> list[dict]:
    reddit = asyncpraw.Reddit(
        client_id=settings.reddit_client_id,
        client_secret=settings.reddit_client_secret,
        user_agent=settings.reddit_user_agent,
    )
    posts = []
    try:
        for sub in SUBREDDITS:
            subreddit = await reddit.subreddit(sub)
            async for post in subreddit.search(ticker, limit=limit, sort="new", time_filter="day"):
                posts.append({
                    "title": post.title,
                    "score": post.score,
                    "num_comments": post.num_comments,
                    "url": post.url,
                    "created_utc": post.created_utc,
                    "subreddit": sub,
                })
        logger.info("reddit.posts.fetched", ticker=ticker, count=len(posts))
    except Exception as e:
        logger.error("reddit.error", ticker=ticker, error=str(e))
    finally:
        await reddit.close()
    return posts
