# trading agent

An autonomous AI trading agent that monitors financial news, classifies
market-moving events using an LLM, generates trading signals, and executes
trades on Alpaca paper trading — all with a dark terminal-style dashboard
for manual approval and monitoring.

Built as a personal project. Currently paper trading only.

---

## what it does

1. Every 15 minutes, ingests news from Finnhub, NewsAPI, and Reddit
2. Queues each article into Redis for LLM classification
3. A background worker reads the queue and calls Groq (llama-3.3-70b) to
   classify each article into a trading signal (BUY/SELL/HOLD) with
   confidence score and reasoning
4. High-confidence signals generate PENDING trade recommendations
5. You approve or reject each trade from the dashboard
6. Approved trades fire as real market orders on Alpaca paper account
7. Everything is logged — news, signals, trades, positions — in PostgreSQL

---

## architecture

```
External APIs (Finnhub, NewsAPI, Reddit, Alpaca)
        ↓
Ingestion pipeline (FastAPI + APScheduler, every 15 min)
        ↓
PostgreSQL (news_articles) + Redis (queue:classify)
        ↓
LLM classifier worker (Groq llama-3.3-70b, async background task)
        ↓
PostgreSQL (signals + trades[PENDING])
        ↓
Risk guard (max $100/trade, max 3 positions, kill switch at $400)
        ↓
Manual approval (you) → Alpaca paper API → fills
        ↓
Next.js dashboard (portfolio, signals, trades, news)
```

---

## tech stack

| layer      | technology                              |
|------------|-----------------------------------------|
| backend    | Python 3.11, FastAPI, uvicorn           |
| database   | PostgreSQL 16 (via Docker)              |
| cache      | Redis 7 (via Docker)                   |
| LLM        | Groq API — llama-3.3-70b-versatile     |
| broker     | Alpaca paper trading API               |
| news       | Finnhub, NewsAPI                        |
| sentiment  | Reddit (asyncpraw)                      |
| scheduler  | APScheduler (in-process)               |
| frontend   | Next.js 14, Tailwind, React Query      |
| ORM        | SQLAlchemy async + asyncpg             |

---

## prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop (for Postgres + Redis)
- Accounts and API keys for all services below

---

## api keys needed

Get all of these before running. All free tier.

### Finnhub
- URL: https://finnhub.io
- Sign up → Dashboard → API Key
- Free tier: 60 req/min, US stocks, news, earnings
- Used for: per-ticker news, company data, sentiment scores

### NewsAPI
- URL: https://newsapi.org
- Sign up → Get API Key
- Free tier: 100 req/day, headlines only (no full text)
- Used for: macro business headlines, sector events

### Reddit (optional but recommended)
- URL: https://www.reddit.com/prefs/apps
- Click "create another app" → script type
- Fill any name and redirect URI (http://localhost)
- Gives you: client_id (under app name), client_secret
- Used for: social sentiment on r/stocks, r/investing, r/wallstreetbets

### Alpaca
- URL: https://alpaca.markets
- Sign up → enable MFA → switch to Paper Trading account
- Go to API → Generate API Key
- Copy both Key ID and Secret (secret shown once only)
- Used for: paper trade execution, positions, account data
- Keep ALPACA_BASE_URL as paper-api.alpaca.markets — never change
  this until you want real money on the line

### Groq
- URL: https://console.groq.com
- Sign up → API Keys → Create Key
- Free tier: generous rate limits for llama-3.3-70b
- Used for: LLM classification of every news article

### OpenAI (optional)
- URL: https://platform.openai.com
- Only needed if you want to swap Groq for GPT-4o-mini in production
- Leave blank for now

---

## environment setup

Copy `.env` into `trading-agent/backend/`:

```
# API KEYS
FINNHUB_API_KEY=your_key
NEWSAPI_KEY=your_key
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=trading-agent/0.1

# ALPACA — paper trading only
ALPACA_API_KEY=your_paper_key
ALPACA_SECRET_KEY=your_paper_secret
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# LLM
GROQ_API_KEY=your_key
OPENAI_API_KEY=

# DATABASE
POSTGRES_USER=trader
POSTGRES_PASSWORD=trader_secret
POSTGRES_DB=trading_agent
DATABASE_URL=postgresql+asyncpg://trader:trader_secret@localhost:5433/trading_agent

# REDIS
REDIS_URL=redis://localhost:6379/0

# APP
ENV=development
LOG_LEVEL=INFO
```

Note: Postgres is exposed on port 5433 (not 5432) to avoid conflicts with
any local Postgres installation.

---

## running locally

### 1. start infrastructure

```bash
cd trading-agent
docker compose up -d
```

Starts PostgreSQL on :5433 and Redis on :6379.

### 2. start backend

```bash
cd trading-agent/backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

On startup the app will:
- Create all database tables automatically
- Start the APScheduler (ingestion every 15 min)
- Launch the LLM classifier background worker

### 3. start frontend

```bash
cd trading-agent/frontend
npm install
npm run dev
```

Opens at http://localhost:3000 (or :3001 if 3000 is taken).

### 4. verify everything works

```bash
# backend health
curl http://localhost:8000/health

# Alpaca connected
curl http://localhost:8000/api/v1/portfolio/account

# trigger ingestion manually
curl -X POST http://localhost:8000/api/v1/debug/trigger-ingestion

# wait 20s for classifier to run, then check signals
curl http://localhost:8000/api/v1/signals/recent | python3 -m json.tool

# check pending trades
curl http://localhost:8000/api/v1/trades/pending | python3 -m json.tool
```

---

## project structure

```
trading-agent/
├── docker-compose.yml
├── .env                          ← your keys go here
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py               ← FastAPI app, lifespan, scheduler
│       ├── core/
│       │   ├── config.py         ← pydantic settings
│       │   └── logging.py        ← structlog setup
│       ├── db/
│       │   ├── session.py        ← SQLAlchemy async engine
│       │   └── redis_client.py   ← Redis connection
│       ├── models/
│       │   └── market.py         ← NewsArticle, Signal, Trade, Position
│       ├── ingestion/
│       │   ├── pipeline.py       ← main ingestion cycle
│       │   ├── finnhub_client.py ← rate-limited Finnhub wrapper
│       │   ├── newsapi_client.py ← NewsAPI wrapper
│       │   └── reddit_client.py  ← asyncpraw wrapper
│       ├── llm/
│       │   └── classifier.py     ← Groq classifier, Redis worker
│       ├── broker/
│       │   ├── alpaca_client.py  ← Alpaca trading + data client
│       │   └── risk_guard.py     ← position sizing, kill switch
│       └── api/routes/
│           ├── trades.py         ← approve/reject endpoints
│           ├── portfolio.py      ← account, positions
│           ├── news.py           ← recent articles
│           └── signals.py        ← recent signals
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   ├── dashboard/page.tsx    ← main terminal dashboard
    │   ├── portfolio/page.tsx
    │   ├── signals/page.tsx
    │   ├── trades/page.tsx
    │   └── news/page.tsx
    ├── components/
    │   ├── layout/sidebar.tsx
    │   └── charts/equity-chart.tsx
    ├── lib/
    │   ├── api.ts                ← all API calls
    │   └── utils.ts              ← fmt$$, fmtPct, fmtTime
    └── types/index.ts
```

---

## risk controls (hardcoded)

These live in `backend/app/broker/risk_guard.py`:

- Max $100 notional per trade
- Max 3 open positions at any time
- Kill switch: bot pauses if account equity drops below $400
- All trades require manual approval — bot never executes automatically
- Position sizing scales with LLM confidence (85% conf = ~$93, 60% = ~$66)

---

## API reference

| method | endpoint | description |
|--------|----------|-------------|
| GET  | /health | health check |
| GET  | /api/v1/portfolio/account | Alpaca account summary |
| GET  | /api/v1/portfolio/positions | open positions |
| GET  | /api/v1/portfolio/history | equity curve data |
| GET  | /api/v1/news/recent | recent ingested articles |
| GET  | /api/v1/signals/recent | recent LLM signals |
| GET  | /api/v1/trades/pending | trades awaiting approval |
| GET  | /api/v1/trades/history | all trade history |
| POST | /api/v1/trades/{id}/approve | approve and execute a trade |
| POST | /api/v1/trades/{id}/reject | reject a trade |
| POST | /api/v1/debug/trigger-ingestion | manually trigger ingestion |

Full interactive docs at http://localhost:8000/docs

---

## important notes

- Alpaca paper fills during US market hours only (9:30 AM – 4:00 PM ET)
  DAY orders placed outside hours will fill at next open or expire
- Finnhub free tier: 60 req/min. The client throttles to 50 req/min
  automatically. Do not increase the watchlist beyond ~15 tickers on
  free tier or you will hit 429s
- NewsAPI free tier: 100 req/day. The pipeline makes ~2 calls per
  ingestion cycle. At 15-min intervals that's ~192 calls/day — upgrade
  to developer plan ($449/mo) or reduce ingestion frequency if hitting
  limits
- Reddit API: no rate limit issues at this scale but requires a valid
  app registration. Dummy values in .env will skip Reddit gracefully
- The LLM classifier is conservative by design — confidence threshold
  is 0.5 minimum and HOLD signals are discarded. Expect 2-5 actionable
  signals per ingestion cycle depending on news volume

---

