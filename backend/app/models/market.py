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
