import asyncio
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.logging import setup_logging
from app.db.session import AsyncSessionLocal, engine, Base, get_db
from app.db.redis_client import close_redis
from app.api.routes import trades, portfolio, news, signals
from app.ingestion.pipeline import run_ingestion_cycle
from app.llm.classifier import run_classifier_worker
from app.broker.position_monitor import check_positions

from sqlalchemy.ext.asyncio import AsyncSession
import structlog

logger = structlog.get_logger()
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("db.tables.created")

    async def ingestion_job():
        async with AsyncSessionLocal() as db:
            await run_ingestion_cycle(db)

    async def position_monitor_job():
        async with AsyncSessionLocal() as db:
            await check_positions(db)

    scheduler.add_job(ingestion_job, "interval", minutes=15, id="ingestion")
    scheduler.add_job(
        position_monitor_job, "interval", minutes=5, id="position_monitor"
    )
    scheduler.start()
    logger.info("scheduler.started")

    classifier_task = asyncio.create_task(run_classifier_worker())
    logger.info("classifier.worker.launched")

    yield

    classifier_task.cancel()
    try:
        await classifier_task
    except asyncio.CancelledError:
        pass
    scheduler.shutdown()
    await close_redis()
    logger.info("app.shutdown")


app = FastAPI(title="Trading Agent API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trades.router, prefix="/api/v1")
app.include_router(portfolio.router, prefix="/api/v1")
app.include_router(news.router, prefix="/api/v1")
app.include_router(signals.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/v1/debug/trigger-ingestion")
async def trigger_ingestion(db: AsyncSession = Depends(get_db)):
    await run_ingestion_cycle(db)
    return {"status": "done"}


@app.get("/api/v1/activity/feed")
async def activity_feed():
    from app.db.redis_client import get_redis
    import json

    redis = await get_redis()
    raw = await redis.lrange("activity:feed", 0, 49)
    return [json.loads(r) for r in raw]
