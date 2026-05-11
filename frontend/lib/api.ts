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

export const getNews = (): Promise<NewsArticle[]> =>
  api.get("/api/v1/news/recent", { params: { limit: 30 } }).then(r => r.data)

export const getSignals = (): Promise<Signal[]> =>
  api.get("/api/v1/signals/recent", { params: { limit: 30 } }).then(r => r.data)

export const getPendingTrades = (): Promise<Trade[]> =>
  api.get("/api/v1/trades/pending").then(r => r.data)

export const getTradeHistory = (): Promise<Trade[]> =>
  api.get("/api/v1/trades/history", { params: { limit: 50 } }).then(r => r.data)

export const approveTrade = (id: string): Promise<{ status: string; order_id: string }> =>
  api.post(`/api/v1/trades/${id}/approve`).then(r => r.data)

export const rejectTrade = (id: string): Promise<{ status: string }> =>
  api.post(`/api/v1/trades/${id}/reject`).then(r => r.data)

export const triggerIngestion = (): Promise<{ status: string }> =>
  api.post("/api/v1/debug/trigger-ingestion").then(r => r.data)