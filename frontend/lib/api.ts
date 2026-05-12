import axios from "axios"
import { Account, NewsArticle, PortfolioHistory, Position, Signal, Trade } from "@/types"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  timeout: 10000,
})

export const getAccount = (): Promise<Account> =>
  api.get("/api/v1/portfolio/account").then(r => r.data)

export const getPositions = (): Promise<Position[]> =>
  api.get("/api/v1/portfolio/positions").then(r => r.data)

export const getPortfolioHistory = (): Promise<PortfolioHistory> =>
  api.get("/api/v1/portfolio/history").then(r => r.data)

export const getQuotes = (): Promise<Record<string, number>> =>
  api.get("/api/v1/portfolio/quotes").then(r => r.data)

// Returns grouped format: { ticker, article_count, latest_at, articles[] }[]
export const getNews = (): Promise<NewsGroup[]> =>
  api.get("/api/v1/news/recent", { params: { limit: 30 } }).then(r => r.data)

export const getNewsFlat = (): Promise<NewsArticle[]> =>
  api.get("/api/v1/news/recent/flat", { params: { limit: 60 } }).then(r => r.data)

export const getSignals = (): Promise<Signal[]> =>
  api.get("/api/v1/signals/recent", { params: { limit: 30 } }).then(r => r.data)

export const getSignalConflicts = (): Promise<{ conflicts: { ticker: string, sides: string[] }[], count: number }> =>
  api.get("/api/v1/signals/conflicts").then(r => r.data)

export const getPendingTrades = (): Promise<Trade[]> =>
  api.get("/api/v1/trades/pending").then(r => r.data)

export const getTradeHistory = (): Promise<Trade[]> =>
  api.get("/api/v1/trades/history", { params: { limit: 50 } }).then(r => r.data)

export const approveTrade = (id: string): Promise<{ status: string; order_id: string }> =>
  api.post(`/api/v1/trades/${id}/approve`).then(r => r.data)

export const rejectTrade = (id: string): Promise<{ status: string }> =>
  api.post(`/api/v1/trades/${id}/reject`).then(r => r.data)

export const liquidateTrade = (id: string): Promise<{ status: string }> =>
  api.post(`/api/v1/trades/${id}/liquidate`).then(r => r.data)

export const liquidateAll = (): Promise<{ status: string; closed: any[] }> =>
  api.post("/api/v1/trades/liquidate-all").then(r => r.data)

export const triggerIngestion = (): Promise<{ status: string }> =>
  api.post("/api/v1/debug/trigger-ingestion").then(r => r.data)

export const getRecentlyFailed = (): Promise<Trade[]> =>
  api.get("/api/v1/trades/recently-failed").then(r => r.data)

export interface ActivityEvent {
  id: string
  type: string
  message: string
  icon: string
  color: string
  label: string
  ts: string
  meta: Record<string, any>
}

export interface NewsGroup {
  ticker: string
  article_count: number
  latest_at: string
  articles: NewsArticle[]
}

export const getActivityFeed = (): Promise<ActivityEvent[]> =>
  api.get("/api/v1/activity/feed").then(r => r.data)