from sqlalchemy import (
    Column,
    String,
    Float,
    DateTime,
    Text,
    Enum,
    JSON,
)
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
    REJECTED = "REJECTED"     # you rejected manually
    EXECUTED = "EXECUTED"     # order submitted to Alpaca
    FILLED = "FILLED"         # confirmed filled by Alpaca
    CANCELLED = "CANCELLED"   # cancelled after approval
    FAILED = "FAILED"         # execution error
    LIQUIDATED = "LIQUIDATED" # position closed via liquidate button


class NewsArticle(Base):
    __tablename__ = "news_articles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source = Column(String(50), nullable=False)
    headline = Column(Text, nullable=False)
    summary = Column(Text)
    url = Column(Text)
    tickers = Column(JSON, default=list)
    sentiment_raw = Column(Float)
    published_at = Column(DateTime(timezone=True), nullable=False)
    ingested_at = Column(DateTime(timezone=True), default=utcnow)
    signal_class = Column(String, nullable=True, default="MONITORING")
    image_url = Column(String, nullable=True)


class Signal(Base):
    __tablename__ = "signals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    news_article_id = Column(UUID(as_uuid=True), nullable=True)
    signal_type = Column(Enum(SignalType), nullable=False)
    ticker = Column(String(20), nullable=False)
    confidence = Column(Float, nullable=False)
    reasoning = Column(Text, nullable=False)
    llm_model = Column(String(50), nullable=False)
    raw_llm_response = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Trade(Base):
    __tablename__ = "trades"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    signal_id = Column(UUID(as_uuid=True), nullable=True)
    ticker = Column(String(20), nullable=False)
    side = Column(String(4), nullable=False)        # buy / sell
    qty = Column(Float, nullable=False)
    notional = Column(Float, nullable=True)          # dollar amount submitted
    status = Column(Enum(TradeStatus), default=TradeStatus.PENDING)
    alpaca_order_id = Column(String(100), nullable=True)
    filled_price = Column(Float, nullable=True)      # avg fill price from Alpaca
    filled_qty = Column(Float, nullable=True)        # actual filled quantity
    filled_at = Column(DateTime(timezone=True), nullable=True)
    stop_loss = Column(Float, nullable=True)         # computed at approval time
    take_profit = Column(Float, nullable=True)       # computed at approval time
    close_reason = Column(String(50), nullable=True) # "liquidated" / "stop_loss" / "take_profit" / "manual"
    closed_price = Column(Float, nullable=True)      # price at close
    closed_at = Column(DateTime(timezone=True), nullable=True)
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