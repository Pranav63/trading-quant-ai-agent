"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getAccount, getPositions, getPortfolioHistory,
  getPendingTrades, getSignals, getNews,
  approveTrade, rejectTrade, getQuotes, getActivityFeed,
  liquidateAll, type NewsGroup,
} from "@/lib/api"
import type { ActivityEvent } from "@/lib/api"
import { fmt$$, fmtTime } from "@/lib/utils"
import { useEffect, useState } from "react"

function ActivityFeedInline() {
  const { data: events } = useQuery({
    queryKey: ["activity"],
    queryFn: getActivityFeed,
    refetchInterval: 5000,
  })
  const timeAgo = (iso: string) => {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (secs < 60) return `${secs}s`
    if (secs < 3600) return `${Math.floor(secs / 60)}m`
    return `${Math.floor(secs / 3600)}h`
  }
  return (
    <div style={{ maxHeight: 110, overflowY: "auto", scrollbarWidth: "none" }}>
      {events?.slice(0, 8).map(e => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid #1a1a2a" }}>
          <span style={{ color: e.color, fontSize: 10, flexShrink: 0 }}>{e.icon}</span>
          <span style={{ fontSize: 10, color: "#6a6a8a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.message}</span>
          <span style={{ fontSize: 9, color: "#4a4a6a", flexShrink: 0 }}>{timeAgo(e.ts)}</span>
        </div>
      ))}
      {!events?.length && <div style={{ fontSize: 10, color: "#4a4a6a" }}>waiting for activity...</div>}
    </div>
  )
}

function Pulse() {
  return (
    <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s ease-in-out infinite", marginRight: 6 }} />
  )
}

function SigBadge({ type }: { type: string }) {
  const styles: Record<string, React.CSSProperties> = {
    BUY:  { background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a" },
    SELL: { background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" },
    HOLD: { background: "#2e2a00", color: "#f59e0b", border: "1px solid #4a3a00" },
  }
  return (
    <span style={{ ...styles[type] ?? styles.HOLD, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 3, minWidth: 36, textAlign: "center", flexShrink: 0 }}>
      {type}
    </span>
  )
}

function ConfColor(conf: number) {
  if (conf >= 0.8) return "#22c55e"
  if (conf >= 0.65) return "#f59e0b"
  return "#6b6b8a"
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return (
    <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4a6a", fontSize: 11 }}>accumulating data...</div>
  )
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 200, h = 40, pad = 3
  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const first = pts[0].split(",")
  const last  = pts[pts.length - 1].split(",")
  const fill  = `M${first[0]},${h - pad} L${pts.join(" L")} L${last[0]},${h - pad} Z`
  const isUp  = values[values.length - 1] >= values[0]
  const color = isUp ? "#22c55e" : "#ef4444"
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 40 }} preserveAspectRatio="none">
      <path d={fill} fill={color} fillOpacity={0.07} stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function TickerBar({ quotes }: { quotes: Record<string, number> }) {
  const watchlist = ["SPY", "QQQ", "XLE", "GLD", "TLT", "XLK", "XLF", "XLI", "XLV"]
  return (
    <div style={{ background: "#111118", borderBottom: "1px solid #1e1e2e", padding: "6px 20px", display: "flex", gap: 24, overflowX: "auto", scrollbarWidth: "none", flexShrink: 0 }}>
      {watchlist.map(sym => (
        <div key={sym} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
          <span style={{ color: "#7c7c9a", fontSize: 11, letterSpacing: "0.05em" }}>{sym}</span>
          <span style={{ color: "#e2e2e8", fontWeight: 500, fontSize: 12 }}>
            {quotes[sym] ? `$${quotes[sym].toFixed(2)}` : "—"}
          </span>
        </div>
      ))}
    </div>
  )
}

function MarketStatusBar() {
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState({ isOpen: false, label: "checking..." })
  useEffect(() => {
    setMounted(true)
    const check = () => {
      const now  = new Date()
      const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
      const isOpen = mins >= 810 && mins < 1200
      const isPremarket = mins >= 480 && mins < 810
      setStatus({ isOpen, label: isOpen ? "market open" : isPremarket ? "pre-market" : "market closed" })
    }
    check()
    const id = setInterval(check, 60000)
    return () => clearInterval(id)
  }, [])

  if (!mounted) return <div style={{ height: 27, flexShrink: 0, borderBottom: "1px solid #1e1e2e" }} />

  return (
    <div style={{ padding: "5px 20px", flexShrink: 0, background: status.isOpen ? "#0a1a0a" : "#111108", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.isOpen ? "#22c55e" : "#f59e0b", display: "inline-block", animation: status.isOpen ? "pulse 2s ease-in-out infinite" : undefined }} />
        <span style={{ color: status.isOpen ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>{status.label}</span>
        <span style={{ color: "#4a4a6a" }}>
          {status.isOpen ? "orders execute immediately" : "approved trades queue — execute at 9:30 PM SGT open"}
        </span>
      </div>
      <span style={{ color: "#4a4a6a", fontSize: 10 }}>SGT: 9:30 PM – 4:00 AM</span>
    </div>
  )
}

const srcStyle: Record<string, React.CSSProperties> = {
  finnhub:                    { background: "#0d1e2e", color: "#378add", border: "1px solid #1a3a5a" },
  newsapi:                    { background: "#1e0d2e", color: "#a855f7", border: "1px solid #3a1a5a" },
  reddit:                     { background: "#2e1a0d", color: "#f97316", border: "1px solid #5a3a1a" },
  fred:                       { background: "#0d2e20", color: "#10b981", border: "1px solid #1a5a3a" },
  rss_reuters_business:       { background: "#2e1a00", color: "#fb923c", border: "1px solid #5a3a00" },
  rss_reuters_markets:        { background: "#2e1a00", color: "#fb923c", border: "1px solid #5a3a00" },
  rss_wsj_markets:            { background: "#1a1a0d", color: "#eab308", border: "1px solid #4a4a00" },
  rss_ft_markets:             { background: "#1a0d0d", color: "#f87171", border: "1px solid #4a1a1a" },
  "rss_investing.com_economy":{ background: "#0d1a2e", color: "#60a5fa", border: "1px solid #1a3a5a" },
}

const PANEL: React.CSSProperties = {
  background: "#0d0d14", padding: 14,
  display: "flex", flexDirection: "column",
  overflow: "hidden", minHeight: 0,
}
const LABEL: React.CSSProperties = {
  fontSize: 10, letterSpacing: "0.1em", color: "#4a4a6a",
  textTransform: "uppercase", marginBottom: 10,
  display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
}
const DIVIDER: React.CSSProperties = { borderBottom: "1px solid #1e1e2e" }

export default function DashboardPage() {
  const qc = useQueryClient()
  const [now, setNow] = useState("")

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    }))
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [])

  const { data: account }   = useQuery({ queryKey: ["account"],   queryFn: getAccount })
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: getPositions })
  const { data: history }   = useQuery({ queryKey: ["history"],   queryFn: getPortfolioHistory })
  const { data: pending }   = useQuery({ queryKey: ["pending"],   queryFn: getPendingTrades })
  const { data: signals }   = useQuery({ queryKey: ["signals"],   queryFn: getSignals })
  const { data: news }      = useQuery({ queryKey: ["news"],      queryFn: getNews })
  const { data: quotes }    = useQuery({ queryKey: ["quotes"],    queryFn: getQuotes, refetchInterval: 60000 })

  const { mutate: approve } = useMutation({
    mutationFn: approveTrade,
    onSuccess: () => qc.invalidateQueries(),
    onError:   () => qc.invalidateQueries(),
  })
  const { mutate: reject } = useMutation({
    mutationFn: rejectTrade,
    onSuccess: () => qc.invalidateQueries(),
  })
  const { mutate: doLiquidateAll } = useMutation({
    mutationFn: liquidateAll,
    onSuccess: () => qc.invalidateQueries(),
  })

  const totalPL = positions?.reduce((s, p) => s + p.unrealized_pl, 0) ?? 0
  const equity  = account?.portfolio_value ?? 0

  // Flatten grouped news for dashboard preview
  const newsFlat = news?.flatMap(g => g.articles.slice(0, 2)) ?? []

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .dash-row:hover { background: #111118 !important; }
        .dash-scroll::-webkit-scrollbar { display: none; }
        .approve-btn { padding:7px 0;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;border:none;letter-spacing:0.04em;transition:all 0.15s; }
        .approve-btn:hover { filter: brightness(1.3); }
      `}</style>

      <div suppressHydrationWarning style={{
        background: "#0a0a0f", color: "#e2e2e8",
        fontFamily: "'SF Mono','Fira Code','Cascadia Code',monospace",
        fontSize: 13, borderRadius: 10, overflow: "hidden",
        border: "1px solid #1e1e2e", width: "100%",
        height: "calc(100vh - 48px)",
        display: "flex", flexDirection: "column",
      }}>

        {/* Header */}
        <div style={{ background: "#0d0d14", padding: "10px 20px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#7c7cdc", letterSpacing: "0.04em" }}>⬡ trading agent</div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#4a4a6a" }}>
              <Pulse />live · paper mode
            </span>
            {now && <span style={{ fontSize: 11, color: "#4a4a6a" }}>{now}</span>}
          </div>
        </div>

        <TickerBar quotes={quotes ?? {}} />
        <MarketStatusBar />

        {/* Body grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 160px",
          gap: 1, background: "#1e1e2e",
          flex: 1, minHeight: 0, overflow: "hidden",
        }}>

          {/* ── Portfolio panel ── */}
          <div style={PANEL}>
            <div style={{ ...LABEL, justifyContent: "space-between" }}>
              <span>portfolio</span>
              {!!positions?.length && (
                <button
                  onClick={() => { if (window.confirm("Liquidate all positions?")) doLiquidateAll() }}
                  style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer", background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a", fontFamily: "inherit", fontWeight: 600 }}
                >⚡ liquidate all</button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12, flexShrink: 0 }}>
              {[
                { label: "equity",    value: fmt$$(equity) },
                { label: "P&L",       value: fmt$$(totalPL), color: totalPL >= 0 ? "#22c55e" : "#ef4444" },
                { label: "positions", value: `${positions?.length ?? 0} open` },
                { label: "cash",      value: fmt$$(account?.cash ?? 0) },
              ].map(s => (
                <div key={s.label} style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: (s as any).color ?? "#e2e2e8" }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ ...LABEL, marginBottom: 6 }}>open positions</div>
            <div className="dash-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {positions?.length ? positions.map(p => (
                <div key={p.ticker} className="dash-row" style={{ ...DIVIDER, padding: "7px 4px", transition: "background 0.15s", background: (p as any).pct_to_stop < 1.0 ? "rgba(239,68,68,0.04)" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600, color: "#a0a0c0", fontSize: 12 }}>{p.ticker}</span>
                      <span style={{ color: "#4a4a6a", fontSize: 10 }}>{Math.abs(p.qty).toFixed(3)}sh</span>
                      {(p as any).pct_to_stop < 1.0 && (
                        <span style={{ fontSize: 9, background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a", padding: "1px 4px", borderRadius: 3 }}>⚠ SL</span>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: p.unrealized_pl >= 0 ? "#22c55e" : "#ef4444" }}>{fmt$$(p.unrealized_pl)}</div>
                      <div style={{ fontSize: 10, color: "#4a4a6a" }}>{(p.unrealized_plpc * 100).toFixed(2)}%</div>
                    </div>
                  </div>
                  {(p as any).stop_loss && (
                    <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 9, color: "#ef4444", whiteSpace: "nowrap" }}>SL {fmt$$((p as any).stop_loss)}</span>
                      <div style={{ flex: 1, height: 2, background: "#1e1e2e", borderRadius: 1, position: "relative", overflow: "hidden" }}>
                        <div style={{
                          position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 1,
                          width: `${Math.min(Math.max(((p.current_price - (p as any).stop_loss) / ((p as any).take_profit - (p as any).stop_loss)) * 100, 0), 100)}%`,
                          background: (p as any).pct_to_stop < 1.0 ? "#ef4444" : (p as any).pct_to_target < 1.0 ? "#22c55e" : "#f59e0b",
                        }} />
                      </div>
                      <span style={{ fontSize: 9, color: "#22c55e", whiteSpace: "nowrap" }}>TP {fmt$$((p as any).take_profit)}</span>
                    </div>
                  )}
                </div>
              )) : (
                <div style={{ color: "#4a4a6a", fontSize: 11, padding: "6px 0" }}>no open positions</div>
              )}
            </div>
          </div>

          {/* ── Signals + Activity panel ── */}
          <div style={PANEL}>
            <div style={LABEL}><Pulse />live signals</div>
            <div className="dash-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {signals?.slice(0, 12).map(s => (
                <div key={s.id} className="dash-row" style={{ ...DIVIDER, display: "flex", alignItems: "center", gap: 8, padding: "7px 4px", transition: "background 0.15s" }}>
                  <SigBadge type={s.signal_type} />
                  <span style={{ fontWeight: 600, color: "#a0a0c0", minWidth: 30, fontSize: 11 }}>{s.ticker}</span>
                  <span style={{ color: "#4a4a6a", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.reasoning}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: ConfColor(s.confidence), minWidth: 28, textAlign: "right", flexShrink: 0 }}>
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
              {!signals?.length && <div style={{ color: "#4a4a6a", fontSize: 11 }}>no signals yet — run ingestion</div>}
            </div>
            <div style={{ flexShrink: 0, marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e1e2e" }}>
              <div style={{ ...LABEL, marginBottom: 6 }}><Pulse />activity</div>
              <ActivityFeedInline />
            </div>
          </div>

          {/* ── Approvals + equity curve panel ── */}
          <div style={PANEL}>
            <div style={LABEL}>
              pending approvals
              {!!pending?.length && (
                <span style={{ background: "#2e2a00", color: "#f59e0b", border: "1px solid #4a3a00", padding: "1px 6px", borderRadius: 3, fontSize: 10, marginLeft: 4, animation: "pulse 2s ease-in-out infinite" }}>
                  {pending.length}
                </span>
              )}
            </div>

            <div className="dash-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {pending?.slice(0, 10).map(t => {
                const isExit = t.side === "sell"
                return (
                  <div key={t.id} style={{ marginBottom: 8, borderRadius: 6, overflow: "hidden", border: `1px solid ${isExit ? "#4a1a1a" : "#1e1e2e"}`, background: isExit ? "rgba(239,68,68,0.04)" : "#111118" }}>
                    <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, color: "#e2e2e8", fontSize: 14 }}>{t.ticker}</span>
                        <SigBadge type={t.side.toUpperCase()} />
                        {isExit && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600, background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" }}>EXIT</span>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e2e8" }}>{fmt$$(t.notional)}</div>
                        {(t as any).stop_loss && (
                          <div style={{ fontSize: 9, color: "#4a4a6a", marginTop: 1 }}>
                            SL {fmt$$((t as any).stop_loss)} · TP {fmt$$((t as any).take_profit)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #1e1e2e", gap: 1, background: "#1e1e2e" }}>
                      <button className="approve-btn" onClick={() => reject(t.id)}
                        style={{ background: "#0d0d14", color: "#6a6a8a" }}
                        onMouseEnter={e => { (e.currentTarget).style.background = "#2e0d0d"; (e.currentTarget).style.color = "#ef4444" }}
                        onMouseLeave={e => { (e.currentTarget).style.background = "#0d0d14"; (e.currentTarget).style.color = "#6a6a8a" }}
                      >✕ reject</button>
                      <button className="approve-btn" onClick={() => approve(t.id)}
                        style={{ background: isExit ? "#2e0d0d" : "#0d2e1a", color: isExit ? "#ef4444" : "#22c55e" }}
                        onMouseEnter={e => { (e.currentTarget).style.background = isExit ? "#4a1a1a" : "#1a4a2a" }}
                        onMouseLeave={e => { (e.currentTarget).style.background = isExit ? "#2e0d0d" : "#0d2e1a" }}
                      >✓ {isExit ? "approve exit" : "approve entry"}</button>
                    </div>
                  </div>
                )
              })}
              {!pending?.length && (
                <div style={{ padding: "16px 8px", textAlign: "center", color: "#4a4a6a", fontSize: 11, border: "1px solid #1e1e2e", borderRadius: 6 }}>
                  ✓ no pending trades
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, marginTop: 12, paddingTop: 12, borderTop: "1px solid #1e1e2e" }}>
              <div style={LABEL}>equity curve</div>
              <Sparkline values={history?.equity ?? []} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <span style={{ color: "#4a4a6a", fontSize: 10 }}>30d ago</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: totalPL >= 0 ? "#22c55e" : "#ef4444" }}>
                  {totalPL >= 0 ? "+" : ""}{fmt$$(totalPL)}
                </span>
                <span style={{ color: "#4a4a6a", fontSize: 10 }}>today</span>
              </div>
            </div>
          </div>

          {/* ── News panel — spans 3 cols ── */}
          <div style={{ ...PANEL, gridColumn: "span 3", flexDirection: "row", gap: 0, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", width: "100%" }}>
              <div style={{ ...LABEL, marginBottom: 8 }}><Pulse />news feed</div>
              <div className="dash-scroll" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 16px", overflowY: "auto", flex: 1, minHeight: 0, alignContent: "start" }}>
                {newsFlat.slice(0, 6).map((a, i) => (
                  <div key={`${a.url}-${i}`} style={{ paddingBottom: 8 }}>
                    <div style={{ marginBottom: 3 }}>
                      <span style={{
                        ...srcStyle[a.source] ?? { background: "#1a1a2e", color: "#6a6a8a", border: "1px solid #2a2a4a" },
                        fontSize: 9, letterSpacing: "0.06em", padding: "1px 5px", borderRadius: 2, display: "inline-block",
                      }}>
                        {a.source}{a.tickers?.length ? ` · ${a.tickers[0]}` : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#c0c0d8", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {a.headline}
                    </div>
                  </div>
                ))}
                {!newsFlat.length && <div style={{ color: "#4a4a6a", fontSize: 11 }}>no articles yet</div>}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}