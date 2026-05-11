#!/bin/bash
# setup.sh — run once from wherever you want the project to live

set -e

PROJECT="trading-agent"
mkdir -p $PROJECT && cd $PROJECT

# ── Python backend ──────────────────────────────────────────
mkdir -p backend/{app/{api/routes,core,db,ingestion,llm,broker,models,schemas},alembic/versions,tests}

# ── Root files ───────────────────────────────────────────────
cat > .env << 'EOF'
# === API KEYS ===
FINNHUB_API_KEY=your_finnhub_key
NEWSAPI_KEY=your_newsapi_key
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_USER_AGENT=trading-agent/0.1

# === ALPACA ===
ALPACA_API_KEY=your_alpaca_paper_key
ALPACA_SECRET_KEY=your_alpaca_paper_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# === LLM ===
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key_optional

# === DATABASE ===
POSTGRES_USER=trader
POSTGRES_PASSWORD=trader_secret
POSTGRES_DB=trading_agent
DATABASE_URL=postgresql+asyncpg://trader:trader_secret@localhost:5432/trading_agent

# === REDIS ===
REDIS_URL=redis://localhost:6379/0

# === APP ===
ENV=development
LOG_LEVEL=INFO
EOF

cat > .gitignore << 'EOF'
.env
__pycache__/
*.pyc
.venv/
*.egg-info/
.pytest_cache/
alembic/versions/*.py
EOF

cat > docker-compose.yml << 'EOF'
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: trader
      POSTGRES_PASSWORD: trader_secret
      POSTGRES_DB: trading_agent
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    command: redis-server --appendonly yes

volumes:
  pgdata:
  redisdata:
EOF

# ── Backend files ────────────────────────────────────────────
cat > backend/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy[asyncio]==2.0.35
asyncpg==0.30.0
alembic==1.13.3
redis[hiredis]==5.1.1
pydantic==2.9.2
pydantic-settings==2.5.2
httpx==0.27.2
finnhub-python==2.4.20
newsapi-python==0.2.7
asyncpraw==7.7.1
alpaca-py==0.31.0
groq==0.11.0
openai==1.51.0
python-dotenv==1.0.1
apscheduler==3.10.4
structlog==24.4.0
tenacity==9.0.0
pytest==8.3.3
pytest-asyncio==0.24.0
EOF

cat > backend/app/core/config.py << 'EOF'
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    finnhub_api_key: str
    newsapi_key: str
    reddit_client_id: str
    reddit_client_secret: str
    reddit_user_agent: str

    alpaca_api_key: str
    alpaca_secret_key: str
    alpaca_base_url: str = "https://paper-api.alpaca.markets"

    groq_api_key: str
    openai_api_key: str = ""

    database_url: str
    redis_url: str

    env: str = "development"
    log_level: str = "INFO"

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()
EOF

cat > backend/app/core/logging.py << 'EOF'
import structlog
import logging
from app.core.config import get_settings

def setup_logging():
    settings = get_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level))
    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
    )

logger = structlog.get_logger()
EOF

cat > backend/app/db/session.py << 'EOF'
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    pool_size=10,
    max_overflow=20,
    echo=settings.env == "development",
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
EOF

cat > backend/app/db/redis_client.py << 'EOF'
import redis.asyncio as aioredis
from app.core.config import get_settings

settings = get_settings()
_redis = None

async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis

async def close_redis():
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
EOF

cat > backend/app/models/market.py << 'EOF'
from sqlalchemy import Column, String, Float, DateTime, Integer, Text, Enum, Boolean, JSON
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from datetime import datetime, timezone
from app.db.session import Base

def utcnow():
    return datetime.now(timezone.utc)

class SignalType(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"

class TradeStatus(str, enum.Enum):
    PENDING = "PENDING"       # awaiting your approval
    APPROVED = "APPROVED"     # you approved, pending execution
    REJECTED = "REJECTED"     # you rejected
    EXECUTED = "EXECUTED"     # filled on Alpaca
    CANCELLED = "CANCELLED"   # cancelled after approval
    FAILED = "FAILED"         # execution error

class NewsArticle(Base):
    __tablename__ = "news_articles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(String(50), nullable=False)       # finnhub / newsapi / reddit
    headline = Column(Text, nullable=False)
    summary = Column(Text)
    url = Column(Text)
    tickers = Column(JSON, default=list)              # ["SPY", "QQQ"]
    sentiment_raw = Column(Float)                     # finnhub sentiment score if available
    published_at = Column(DateTime(timezone=True), nullable=False)
    ingested_at = Column(DateTime(timezone=True), default=utcnow)

class Signal(Base):
    __tablename__ = "signals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    news_article_id = Column(UUID(as_uuid=True), nullable=True)
    signal_type = Column(Enum(SignalType), nullable=False)
    ticker = Column(String(20), nullable=False)
    confidence = Column(Float, nullable=False)        # 0.0 - 1.0
    reasoning = Column(Text, nullable=False)          # LLM explanation
    llm_model = Column(String(50), nullable=False)
    raw_llm_response = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=utcnow)

class Trade(Base):
    __tablename__ = "trades"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    signal_id = Column(UUID(as_uuid=True), nullable=True)
    ticker = Column(String(20), nullable=False)
    side = Column(String(4), nullable=False)          # buy / sell
    qty = Column(Float, nullable=False)
    notional = Column(Float, nullable=True)           # dollar amount
    status = Column(Enum(TradeStatus), default=TradeStatus.PENDING)
    alpaca_order_id = Column(String(100), nullable=True)
    filled_price = Column(Float, nullable=True)
    filled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

class Position(Base):
    __tablename__ = "positions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker = Column(String(20), nullable=False, unique=True)
    qty = Column(Float, nullable=False)
    avg_entry_price = Column(Float, nullable=False)
    current_price = Column(Float, nullable=True)
    unrealized_pnl = Column(Float, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
EOF

cat > backend/app/ingestion/finnhub_client.py << 'EOF'
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
EOF

cat > backend/app/ingestion/newsapi_client.py << 'EOF'
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
EOF

cat > backend/app/ingestion/reddit_client.py << 'EOF'
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
EOF

cat > backend/app/ingestion/pipeline.py << 'EOF'
"""
Main ingestion pipeline. Called by the scheduler every N minutes.
Fetches news + sentiment for watchlist tickers, persists to DB,
and queues articles for LLM classification.
"""
import json
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.redis_client import get_redis
from app.models.market import NewsArticle
from app.ingestion.finnhub_client import get_company_news
from app.ingestion.newsapi_client import get_top_business_headlines
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

# Sector ETF watchlist — this is our v1 universe
WATCHLIST = ["SPY", "QQQ", "XLK", "XLF", "XLE", "XLV", "XLI", "GLD", "TLT"]
CLASSIFY_QUEUE_KEY = "queue:classify"

async def run_ingestion_cycle(db: AsyncSession):
    logger.info("ingestion.cycle.start")
    redis = await get_redis()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    # 1. Finnhub per-ticker news
    for ticker in WATCHLIST:
        try:
            articles = await get_company_news(ticker, yesterday, today)
            for a in articles[:5]:  # cap per ticker to protect rate limit
                article = NewsArticle(
                    source="finnhub",
                    headline=a.get("headline", ""),
                    summary=a.get("summary", ""),
                    url=a.get("url", ""),
                    tickers=[ticker],
                    sentiment_raw=a.get("sentiment", {}).get("bullishPercent"),
                    published_at=datetime.fromtimestamp(a["datetime"], tz=timezone.utc),
                )
                db.add(article)
                await db.flush()
                await redis.lpush(CLASSIFY_QUEUE_KEY, json.dumps({
                    "article_id": str(article.id),
                    "headline": article.headline,
                    "summary": article.summary,
                    "ticker": ticker,
                }))
        except Exception as e:
            logger.error("ingestion.finnhub.failed", ticker=ticker, error=str(e))

    # 2. General business headlines (macro events)
    try:
        headlines = await get_top_business_headlines(page_size=10)
        for h in headlines:
            if not h.get("title"):
                continue
            article = NewsArticle(
                source="newsapi",
                headline=h["title"],
                summary=h.get("description", ""),
                url=h.get("url", ""),
                tickers=[],
                published_at=datetime.fromisoformat(
                    h["publishedAt"].replace("Z", "+00:00")
                ) if h.get("publishedAt") else datetime.now(timezone.utc),
            )
            db.add(article)
            await db.flush()
            await redis.lpush(CLASSIFY_QUEUE_KEY, json.dumps({
                "article_id": str(article.id),
                "headline": article.headline,
                "summary": article.summary,
                "ticker": None,
            }))
    except Exception as e:
        logger.error("ingestion.newsapi.failed", error=str(e))

    await db.commit()
    queue_len = await redis.llen(CLASSIFY_QUEUE_KEY)
    logger.info("ingestion.cycle.done", queued_for_classification=queue_len)
EOF

cat > backend/app/broker/alpaca_client.py << 'EOF'
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockLatestQuoteRequest
from app.core.config import get_settings
from app.core.logging import logger

settings = get_settings()

trading_client = TradingClient(
    api_key=settings.alpaca_api_key,
    secret_key=settings.alpaca_secret_key,
    paper=True,
)

data_client = StockHistoricalDataClient(
    api_key=settings.alpaca_api_key,
    secret_key=settings.alpaca_secret_key,
)

def get_account():
    return trading_client.get_account()

def get_positions():
    return trading_client.get_all_positions()

def get_latest_price(ticker: str) -> float:
    req = StockLatestQuoteRequest(symbol_or_symbols=ticker)
    quote = data_client.get_stock_latest_quote(req)
    return float(quote[ticker].ask_price)

def place_market_order(ticker: str, side: str, notional: float) -> dict:
    """
    Place a notional market order (dollar amount, not shares).
    side: "buy" or "sell"
    notional: dollar amount e.g. 100.0
    """
    order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL
    req = MarketOrderRequest(
        symbol=ticker,
        notional=round(notional, 2),
        side=order_side,
        time_in_force=TimeInForce.DAY,
    )
    try:
        order = trading_client.submit_order(req)
        logger.info("alpaca.order.submitted", ticker=ticker, side=side, notional=notional, order_id=str(order.id))
        return {"order_id": str(order.id), "status": str(order.status)}
    except Exception as e:
        logger.error("alpaca.order.failed", ticker=ticker, error=str(e))
        raise

def cancel_order(order_id: str):
    trading_client.cancel_order_by_id(order_id)

def get_portfolio_history():
    return trading_client.get_portfolio_history(period="1M", timeframe="1D")
EOF

cat > backend/app/broker/risk_guard.py << 'EOF'
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
EOF

cat > backend/app/api/routes/trades.py << 'EOF'
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db.session import get_db
from app.models.market import Trade, TradeStatus, Position
from app.broker.alpaca_client import place_market_order, get_positions
from app.broker.risk_guard import validate_trade, RiskViolation
from app.core.logging import logger
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/trades", tags=["trades"])

@router.get("/pending")
async def get_pending_trades(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Trade).where(Trade.status == TradeStatus.PENDING).order_by(Trade.created_at.desc())
    )
    return result.scalars().all()

@router.post("/{trade_id}/approve")
async def approve_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    if trade.status != TradeStatus.PENDING:
        raise HTTPException(400, f"Trade is {trade.status}, not PENDING")

    # Count open positions
    positions = get_positions()
    try:
        validate_trade(trade.ticker, trade.notional, len(positions))
    except RiskViolation as e:
        trade.status = TradeStatus.FAILED
        await db.commit()
        raise HTTPException(400, str(e))

    try:
        result_order = place_market_order(trade.ticker, trade.side, trade.notional)
        trade.status = TradeStatus.EXECUTED
        trade.alpaca_order_id = result_order["order_id"]
        trade.filled_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("trade.approved.executed", trade_id=str(trade_id), order_id=result_order["order_id"])
        return {"status": "executed", "order_id": result_order["order_id"]}
    except Exception as e:
        trade.status = TradeStatus.FAILED
        await db.commit()
        raise HTTPException(500, f"Execution failed: {str(e)}")

@router.post("/{trade_id}/reject")
async def reject_trade(trade_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    trade = result.scalar_one_or_none()
    if not trade:
        raise HTTPException(404, "Trade not found")
    trade.status = TradeStatus.REJECTED
    await db.commit()
    return {"status": "rejected"}

@router.get("/history")
async def get_trade_history(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Trade).order_by(Trade.created_at.desc()).limit(limit)
    )
    return result.scalars().all()
EOF

cat > backend/app/api/routes/portfolio.py << 'EOF'
from fastapi import APIRouter
from app.broker.alpaca_client import get_account, get_positions, get_portfolio_history
from app.core.logging import logger

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

@router.get("/account")
def account_summary():
    acc = get_account()
    return {
        "equity": float(acc.equity),
        "cash": float(acc.cash),
        "buying_power": float(acc.buying_power),
        "portfolio_value": float(acc.portfolio_value),
        "daytrade_count": acc.daytrade_count,
    }

@router.get("/positions")
def positions():
    pos = get_positions()
    return [
        {
            "ticker": p.symbol,
            "qty": float(p.qty),
            "avg_entry_price": float(p.avg_entry_price),
            "current_price": float(p.current_price),
            "unrealized_pl": float(p.unrealized_pl),
            "unrealized_plpc": float(p.unrealized_plpc),
        }
        for p in pos
    ]

@router.get("/history")
def portfolio_history():
    h = get_portfolio_history()
    return {
        "timestamps": h.timestamp,
        "equity": h.equity,
        "profit_loss": h.profit_loss,
        "profit_loss_pct": h.profit_loss_pct,
    }
EOF

cat > backend/app/api/routes/news.py << 'EOF'
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.market import NewsArticle

router = APIRouter(prefix="/news", tags=["news"])

@router.get("/recent")
async def get_recent_news(limit: int = Query(20, le=100), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(NewsArticle).order_by(NewsArticle.ingested_at.desc()).limit(limit)
    )
    return result.scalars().all()
EOF

cat > backend/app/api/routes/signals.py << 'EOF'
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.market import Signal

router = APIRouter(prefix="/signals", tags=["signals"])

@router.get("/recent")
async def get_recent_signals(limit: int = Query(20, le=100), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Signal).order_by(Signal.created_at.desc()).limit(limit)
    )
    return result.scalars().all()
EOF

cat > backend/app/main.py << 'EOF'
from fastapi import FastAPI
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.logging import setup_logging
from app.db.session import engine, Base
from app.db.redis_client import close_redis
from app.api.routes import trades, portfolio, news, signals
from app.ingestion.pipeline import run_ingestion_cycle
from app.db.session import AsyncSessionLocal
import structlog

logger = structlog.get_logger()

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("db.tables.created")

    # Schedule ingestion every 15 minutes
    async def ingestion_job():
        async with AsyncSessionLocal() as db:
            await run_ingestion_cycle(db)

    scheduler.add_job(ingestion_job, "interval", minutes=15, id="ingestion")
    scheduler.start()
    logger.info("scheduler.started")

    yield

    scheduler.shutdown()
    await close_redis()
    logger.info("app.shutdown")

app = FastAPI(title="Trading Agent API", lifespan=lifespan)

app.include_router(trades.router, prefix="/api/v1")
app.include_router(portfolio.router, prefix="/api/v1")
app.include_router(news.router, prefix="/api/v1")
app.include_router(signals.router, prefix="/api/v1")

@app.get("/health")
def health():
    return {"status": "ok"}
EOF

cat > backend/Makefile << 'EOF'
.PHONY: install run migrate test

install:
	pip install -r requirements.txt

run:
	cd app && uvicorn main:app --reload --port 8000

migrate:
	alembic upgrade head

test:
	pytest tests/ -v
EOF

echo ""
echo "✅ Project scaffolded at ./$PROJECT"
echo ""
echo "Next steps:"
echo "  1. Fill in .env with your API keys"
echo "  2. docker compose up -d"
echo "  3. cd $PROJECT/backend"
echo "  4. python -m venv .venv && source .venv/bin/activate"
echo "  5. pip install -r requirements.txt"
echo "  6. uvicorn app.main:app --reload --port 8000"
echo "  7. Hit http://localhost:8000/health"