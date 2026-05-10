#!/bin/bash
# run from trading-agent/frontend/

set -e

mkdir -p app/{dashboard,news,signals,trades,portfolio}
mkdir -p components/{ui,charts,layout}
mkdir -p lib
mkdir -p types

# ── Types ──────────────────────────────────────────────────
cat > types/index.ts << 'EOF'
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
  signal_id: string
}

export interface Position {
  ticker: string
  qty: number
  avg_entry_price: number
  current_price: number
  unrealized_pl: number
  unrealized_plpc: number
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
EOF

# ── API client ──────────────────────────────────────────────
cat > lib/api.ts << 'EOF'
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

export const getNews = (limit = 30): Promise<NewsArticle[]> =>
  api.get(`/api/v1/news/recent?limit=${limit}`).then(r => r.data)

export const getSignals = (limit = 30): Promise<Signal[]> =>
  api.get(`/api/v1/signals/recent?limit=${limit}`).then(r => r.data)

export const getPendingTrades = (): Promise<Trade[]> =>
  api.get("/api/v1/trades/pending").then(r => r.data)

export const getTradeHistory = (limit = 50): Promise<Trade[]> =>
  api.get(`/api/v1/trades/history?limit=${limit}`).then(r => r.data)

export const approveTrade = (id: string): Promise<{ status: string; order_id: string }> =>
  api.post(`/api/v1/trades/${id}/approve`).then(r => r.data)

export const rejectTrade = (id: string): Promise<{ status: string }> =>
  api.post(`/api/v1/trades/${id}/reject`).then(r => r.data)

export const triggerIngestion = (): Promise<{ status: string }> =>
  api.post("/api/v1/debug/trigger-ingestion").then(r => r.data)
EOF

# ── React Query provider ────────────────────────────────────
cat > lib/query-client.ts << 'EOF'
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchInterval: 30 * 1000,
      retry: 2,
    },
  },
})
EOF

# ── Utils ───────────────────────────────────────────────────
cat > lib/utils.ts << 'EOF'
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmt$$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

export function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}
EOF

# ── Providers ───────────────────────────────────────────────
cat > components/layout/providers.tsx << 'EOF'
"use client"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { queryClient } from "@/lib/query-client"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
EOF

# ── Sidebar ─────────────────────────────────────────────────
cat > components/layout/sidebar.tsx << 'EOF'
"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Newspaper, TrendingUp,
  ClipboardList, Briefcase, Zap
} from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { triggerIngestion } from "@/lib/api"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/signals", label: "Signals", icon: TrendingUp },
  { href: "/trades", label: "Trades", icon: ClipboardList },
  { href: "/news", label: "News", icon: Newspaper },
]

export function Sidebar() {
  const path = usePathname()
  const qc = useQueryClient()
  const { mutate: runIngestion, isPending } = useMutation({
    mutationFn: triggerIngestion,
    onSuccess: () => {
      setTimeout(() => {
        qc.invalidateQueries()
      }, 15000)
    },
  })

  return (
    <aside className="fixed left-0 top-0 h-full w-56 border-r border-border bg-background flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-lg font-medium tracking-tight">trading agent</h1>
        <p className="text-xs text-muted-foreground mt-1">paper mode</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              path === href
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-border">
        <button
          onClick={() => runIngestion()}
          disabled={isPending}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            isPending && "opacity-50 cursor-not-allowed"
          )}
        >
          <Zap size={14} />
          {isPending ? "running..." : "run ingestion"}
        </button>
      </div>
    </aside>
  )
}
EOF

# ── Layout ──────────────────────────────────────────────────
cat > app/layout.tsx << 'EOF'
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/layout/providers"
import { Sidebar } from "@/components/layout/sidebar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Trading Agent",
  description: "Autonomous trading agent dashboard",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="ml-56 flex-1 p-8 bg-background min-h-screen">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
EOF

# ── Root redirect ───────────────────────────────────────────
cat > app/page.tsx << 'EOF'
import { redirect } from "next/navigation"
export default function Home() {
  redirect("/dashboard")
}
EOF

# ── Stat card component ─────────────────────────────────────
cat > components/ui/stat-card.tsx << 'EOF'
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  sub?: string
  trend?: "up" | "down" | "neutral"
  className?: string
}

export function StatCard({ label, value, sub, trend, className }: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5", className)}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn(
        "text-2xl font-medium mt-1 tabular-nums",
        trend === "up" && "text-green-500",
        trend === "down" && "text-red-500",
      )}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
EOF

# ── Signal badge ────────────────────────────────────────────
cat > components/ui/signal-badge.tsx << 'EOF'
import { cn } from "@/lib/utils"

export function SignalBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
      type === "BUY" && "bg-green-500/10 text-green-500",
      type === "SELL" && "bg-red-500/10 text-red-500",
      type === "HOLD" && "bg-yellow-500/10 text-yellow-500",
    )}>
      {type}
    </span>
  )
}
EOF

# ── Status badge ────────────────────────────────────────────
cat > components/ui/status-badge.tsx << 'EOF'
import { cn } from "@/lib/utils"

const styles: Record<string, string> = {
  PENDING:   "bg-yellow-500/10 text-yellow-500",
  APPROVED:  "bg-blue-500/10 text-blue-500",
  EXECUTED:  "bg-green-500/10 text-green-500",
  REJECTED:  "bg-red-500/10 text-red-400",
  CANCELLED: "bg-zinc-500/10 text-zinc-400",
  FAILED:    "bg-red-700/10 text-red-600",
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
      styles[status] ?? "bg-zinc-500/10 text-zinc-400"
    )}>
      {status.toLowerCase()}
    </span>
  )
}
EOF

# ── Equity chart ────────────────────────────────────────────
cat > components/charts/equity-chart.tsx << 'EOF'
"use client"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { PortfolioHistory } from "@/types"
import { fmt$$ } from "@/lib/utils"

export function EquityChart({ data }: { data: PortfolioHistory }) {
  const chartData = data.timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    equity: data.equity[i],
    pl: data.profit_loss[i],
  }))

  const isUp = chartData.length > 1
    ? chartData[chartData.length - 1].equity >= chartData[0].equity
    : true

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity={0.15} />
            <stop offset="95%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          formatter={(v: number) => [fmt$$(v), "Equity"]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Area
          type="monotone"
          dataKey="equity"
          stroke={isUp ? "#22c55e" : "#ef4444"}
          strokeWidth={1.5}
          fill="url(#eq)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
EOF

# ── Dashboard page ──────────────────────────────────────────
cat > app/dashboard/page.tsx << 'EOF'
"use client"
import { useQuery } from "@tanstack/react-query"
import { getAccount, getPositions, getPortfolioHistory, getPendingTrades, getSignals } from "@/lib/api"
import { StatCard } from "@/components/ui/stat-card"
import { EquityChart } from "@/components/charts/equity-chart"
import { SignalBadge } from "@/components/ui/signal-badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { fmt$$, fmtPct, fmtTime } from "@/lib/utils"

export default function DashboardPage() {
  const { data: account } = useQuery({ queryKey: ["account"], queryFn: getAccount })
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: getPositions })
  const { data: history } = useQuery({ queryKey: ["history"], queryFn: getPortfolioHistory })
  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: getPendingTrades })
  const { data: signals } = useQuery({ queryKey: ["signals"], queryFn: getSignals })

  const totalPL = positions?.reduce((s, p) => s + p.unrealized_pl, 0) ?? 0

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-medium">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Live paper trading overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Portfolio value"
          value={fmt$$(account?.portfolio_value ?? 0)}
          sub={`Cash: ${fmt$$(account?.cash ?? 0)}`}
        />
        <StatCard
          label="Unrealized P&L"
          value={fmt$$(totalPL)}
          trend={totalPL >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Open positions"
          value={String(positions?.length ?? 0)}
          sub="max 3 allowed"
        />
        <StatCard
          label="Pending approvals"
          value={String(pending?.length ?? 0)}
          sub="awaiting your action"
          trend={pending?.length ? "neutral" : undefined}
        />
      </div>

      {/* Equity chart */}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm font-medium mb-4">Equity curve</p>
        {history ? <EquityChart data={history} /> : (
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
            loading chart...
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Positions */}
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm font-medium mb-4">Open positions</p>
          {positions?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left pb-2">ticker</th>
                  <th className="text-right pb-2">qty</th>
                  <th className="text-right pb-2">entry</th>
                  <th className="text-right pb-2">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions.map(p => (
                  <tr key={p.ticker}>
                    <td className="py-2 font-medium">{p.ticker}</td>
                    <td className="py-2 text-right tabular-nums">{p.qty.toFixed(4)}</td>
                    <td className="py-2 text-right tabular-nums">{fmt$$(p.avg_entry_price)}</td>
                    <td className={`py-2 text-right tabular-nums ${p.unrealized_pl >= 0 ? "text-green-500" : "text-red-500"}`}>
                      {fmt$$(p.unrealized_pl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">no open positions</p>
          )}
        </div>

        {/* Recent signals */}
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm font-medium mb-4">Recent signals</p>
          <div className="space-y-3">
            {signals?.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <SignalBadge type={s.signal_type} />
                  <span className="font-medium text-sm">{s.ticker}</span>
                  <span className="text-xs text-muted-foreground truncate">{s.reasoning}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {(s.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {!signals?.length && (
              <p className="text-sm text-muted-foreground">no signals yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
EOF

# ── Portfolio page ──────────────────────────────────────────
cat > app/portfolio/page.tsx << 'EOF'
"use client"
import { useQuery } from "@tanstack/react-query"
import { getAccount, getPositions, getPortfolioHistory } from "@/lib/api"
import { StatCard } from "@/components/ui/stat-card"
import { EquityChart } from "@/components/charts/equity-chart"
import { fmt$$, fmtPct } from "@/lib/utils"

export default function PortfolioPage() {
  const { data: account } = useQuery({ queryKey: ["account"], queryFn: getAccount })
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: getPositions })
  const { data: history } = useQuery({ queryKey: ["history"], queryFn: getPortfolioHistory })

  const totalPL = positions?.reduce((s, p) => s + p.unrealized_pl, 0) ?? 0
  const totalValue = positions?.reduce((s, p) => s + p.qty * p.current_price, 0) ?? 0

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-medium">Portfolio</h2>
        <p className="text-sm text-muted-foreground mt-1">Positions and account overview</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Equity" value={fmt$$(account?.portfolio_value ?? 0)} />
        <StatCard label="Cash" value={fmt$$(account?.cash ?? 0)} sub="available to deploy" />
        <StatCard label="Invested" value={fmt$$(totalValue)} />
        <StatCard
          label="Unrealized P&L"
          value={fmt$$(totalPL)}
          trend={totalPL >= 0 ? "up" : "down"}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm font-medium mb-4">Equity curve (1 month)</p>
        {history ? <EquityChart data={history} /> : (
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
            loading...
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="p-6 border-b border-border">
          <p className="text-sm font-medium">Open positions</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left px-6 py-3">ticker</th>
              <th className="text-right px-6 py-3">qty</th>
              <th className="text-right px-6 py-3">avg entry</th>
              <th className="text-right px-6 py-3">current price</th>
              <th className="text-right px-6 py-3">market value</th>
              <th className="text-right px-6 py-3">unrealized P&L</th>
              <th className="text-right px-6 py-3">return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {positions?.map(p => (
              <tr key={p.ticker} className="hover:bg-accent/30 transition-colors">
                <td className="px-6 py-3 font-medium">{p.ticker}</td>
                <td className="px-6 py-3 text-right tabular-nums">{p.qty.toFixed(4)}</td>
                <td className="px-6 py-3 text-right tabular-nums">{fmt$$(p.avg_entry_price)}</td>
                <td className="px-6 py-3 text-right tabular-nums">{fmt$$(p.current_price)}</td>
                <td className="px-6 py-3 text-right tabular-nums">{fmt$$(p.qty * p.current_price)}</td>
                <td className={`px-6 py-3 text-right tabular-nums ${p.unrealized_pl >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {fmt$$(p.unrealized_pl)}
                </td>
                <td className={`px-6 py-3 text-right tabular-nums ${p.unrealized_plpc >= 0 ? "text-green-500" : "text-red-500"}`}>
                  {fmtPct(p.unrealized_plpc)}
                </td>
              </tr>
            ))}
            {!positions?.length && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  no open positions
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
EOF

# ── Signals page ────────────────────────────────────────────
cat > app/signals/page.tsx << 'EOF'
"use client"
import { useQuery } from "@tanstack/react-query"
import { getSignals } from "@/lib/api"
import { SignalBadge } from "@/components/ui/signal-badge"
import { fmtTime } from "@/lib/utils"

export default function SignalsPage() {
  const { data: signals, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: getSignals,
  })

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-medium">Signals</h2>
        <p className="text-sm text-muted-foreground mt-1">LLM-generated trading signals from news</p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left px-6 py-3">signal</th>
              <th className="text-left px-6 py-3">ticker</th>
              <th className="text-left px-6 py-3">reasoning</th>
              <th className="text-right px-6 py-3">confidence</th>
              <th className="text-left px-6 py-3">model</th>
              <th className="text-right px-6 py-3">time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  loading...
                </td>
              </tr>
            )}
            {signals?.map(s => (
              <tr key={s.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-6 py-3"><SignalBadge type={s.signal_type} /></td>
                <td className="px-6 py-3 font-medium">{s.ticker}</td>
                <td className="px-6 py-3 text-muted-foreground max-w-xs truncate">{s.reasoning}</td>
                <td className="px-6 py-3 text-right tabular-nums">
                  <span className={s.confidence >= 0.8 ? "text-green-500" : s.confidence >= 0.65 ? "text-yellow-500" : "text-muted-foreground"}>
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-6 py-3 text-xs text-muted-foreground">{s.llm_model}</td>
                <td className="px-6 py-3 text-right text-xs text-muted-foreground">{fmtTime(s.created_at)}</td>
              </tr>
            ))}
            {!isLoading && !signals?.length && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  no signals yet — run ingestion to generate
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
EOF

# ── Trades page ─────────────────────────────────────────────
cat > app/trades/page.tsx << 'EOF'
"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getPendingTrades, getTradeHistory, approveTrade, rejectTrade } from "@/lib/api"
import { StatusBadge } from "@/components/ui/status-badge"
import { SignalBadge } from "@/components/ui/signal-badge"
import { fmt$$, fmtTime } from "@/lib/utils"
import { CheckCircle, XCircle } from "lucide-react"

export default function TradesPage() {
  const qc = useQueryClient()
  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: getPendingTrades })
  const { data: history } = useQuery({ queryKey: ["history"], queryFn: getTradeHistory })

  const { mutate: approve, isPending: approving } = useMutation({
    mutationFn: approveTrade,
    onSuccess: () => qc.invalidateQueries(),
  })

  const { mutate: reject, isPending: rejecting } = useMutation({
    mutationFn: rejectTrade,
    onSuccess: () => qc.invalidateQueries(),
  })

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-medium">Trades</h2>
        <p className="text-sm text-muted-foreground mt-1">Approve or reject pending trade recommendations</p>
      </div>

      {/* Pending approvals */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium">Pending approvals</p>
          {pending?.length ? (
            <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded">
              {pending.length} waiting
            </span>
          ) : null}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left px-6 py-3">ticker</th>
              <th className="text-left px-6 py-3">side</th>
              <th className="text-right px-6 py-3">notional</th>
              <th className="text-right px-6 py-3">created</th>
              <th className="text-right px-6 py-3">action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pending?.map(t => (
              <tr key={t.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-6 py-3 font-medium">{t.ticker}</td>
                <td className="px-6 py-3">
                  <SignalBadge type={t.side.toUpperCase()} />
                </td>
                <td className="px-6 py-3 text-right tabular-nums">{fmt$$(t.notional)}</td>
                <td className="px-6 py-3 text-right text-xs text-muted-foreground">{fmtTime(t.created_at)}</td>
                <td className="px-6 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => approve(t.id)}
                      disabled={approving}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={12} /> approve
                    </button>
                    <button
                      onClick={() => reject(t.id)}
                      disabled={rejecting}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      <XCircle size={12} /> reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!pending?.length && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  no pending trades
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* History */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-6 border-b border-border">
          <p className="text-sm font-medium">Trade history</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left px-6 py-3">ticker</th>
              <th className="text-left px-6 py-3">side</th>
              <th className="text-right px-6 py-3">notional</th>
              <th className="text-right px-6 py-3">filled price</th>
              <th className="text-left px-6 py-3">status</th>
              <th className="text-right px-6 py-3">time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history?.map(t => (
              <tr key={t.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-6 py-3 font-medium">{t.ticker}</td>
                <td className="px-6 py-3">
                  <SignalBadge type={t.side.toUpperCase()} />
                </td>
                <td className="px-6 py-3 text-right tabular-nums">{fmt$$(t.notional)}</td>
                <td className="px-6 py-3 text-right tabular-nums">
                  {t.filled_price ? fmt$$(t.filled_price) : "—"}
                </td>
                <td className="px-6 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-6 py-3 text-right text-xs text-muted-foreground">{fmtTime(t.created_at)}</td>
              </tr>
            ))}
            {!history?.length && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  no trade history
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
EOF

# ── News page ───────────────────────────────────────────────
cat > app/news/page.tsx << 'EOF'
"use client"
import { useQuery } from "@tanstack/react-query"
import { getNews } from "@/lib/api"
import { fmtTime } from "@/lib/utils"
import { ExternalLink } from "lucide-react"

const sourceColors: Record<string, string> = {
  finnhub: "bg-blue-500/10 text-blue-400",
  newsapi: "bg-purple-500/10 text-purple-400",
  reddit:  "bg-orange-500/10 text-orange-400",
}

export default function NewsPage() {
  const { data: articles, isLoading } = useQuery({
    queryKey: ["news"],
    queryFn: getNews,
  })

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-medium">News feed</h2>
        <p className="text-sm text-muted-foreground mt-1">Ingested articles — refreshes every 15 min</p>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <p className="text-sm text-muted-foreground">loading...</p>
        )}
        {articles?.map(a => (
          <div
            key={a.id}
            className="rounded-lg border border-border bg-card p-5 hover:border-border/80 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${sourceColors[a.source] ?? "bg-zinc-500/10 text-zinc-400"}`}>
                    {a.source}
                  </span>
                  {a.tickers?.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground">
                      {t}
                    </span>
                  ))}
                  {a.sentiment_raw !== null && (
                    <span className={`text-xs px-2 py-0.5 rounded ${a.sentiment_raw > 0.5 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-400"}`}>
                      {(a.sentiment_raw * 100).toFixed(0)}% bull
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium leading-snug">{a.headline}</p>
                {a.summary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <p className="text-xs text-muted-foreground">{fmtTime(a.published_at)}</p>
                {a.url && (
                  
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
        {!isLoading && !articles?.length && (
          <p className="text-sm text-muted-foreground">no articles yet — run ingestion</p>
        )}
      </div>
    </div>
  )
}
EOF

# ── env ─────────────────────────────────────────────────────
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF

echo "✅ All frontend files created"