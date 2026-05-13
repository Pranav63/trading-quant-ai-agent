export interface NewsArticle {
  id: string
  headline: string
  summary: string
  url: string
  source: string
  tickers: string[]
  sentiment_raw: number | null
  published_at: string
  ingested_at: string
}

export interface Signal {
  id: string
  ticker: string
  signal_type: "BUY" | "SELL" | "HOLD"
  confidence: number
  reasoning: string
  llm_model: string
  news_article_id: string
  created_at: string
}

export interface Trade {
  id: string
  ticker: string
  side: string
  qty: number
  notional: number
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED" | "CANCELLED" | "FAILED"
  alpaca_order_id: string | null
  filled_price: number | null
  filled_at: string | null
  created_at: string
  updated_at: string
  signal_id: string | null
  // risk fields (only on pending)
  current_price?: number
  stop_loss?: number
  take_profit?: number
  shares?: number
  max_loss?: number
  max_gain?: number
  risk_pct_of_account?: number
  rr_ratio?: number
}

export interface Position {
  ticker: string
  qty: number
  avg_entry_price: number
  current_price: number
  unrealized_pl: number
  unrealized_plpc: number
  stop_loss: number
  take_profit: number
  pct_to_stop: number
  pct_to_target: number
}

export interface Account {
  equity: number
  cash: number
  buying_power: number
  portfolio_value: number
  daytrade_count: number
}

export interface PortfolioHistory {
  timestamps: number[]
  equity: number[]
  profit_loss: number[]
  profit_loss_pct: number[]
}
