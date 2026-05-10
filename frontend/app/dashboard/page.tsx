"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getAccount, getPositions, getPortfolioHistory,
  getPendingTrades, getSignals, getNews,
  approveTrade, rejectTrade
} from "@/lib/api"
import { fmt$$, fmtTime } from "@/lib/utils"
import { useEffect, useState } from "react"

function Pulse() {
  return (
    <span style={{
      display: "inline-block", width: 6, height: 6,
      borderRadius: "50%", background: "#22c55e",
      animation: "pulse 2s ease-in-out infinite",
      marginRight: 6,
    }} />
  )
}

function SigBadge({ type }: { type: string }) {
  const styles: Record<string, React.CSSProperties> = {
    BUY:  { background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a" },
    SELL: { background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" },
    HOLD: { background: "#2e2a00", color: "#f59e0b", border: "1px solid #4a3a00" },
  }
  return (
    <span style={{
      ...styles[type] ?? styles.HOLD,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
      padding: "2px 7px", borderRadius: 3, minWidth: 36, textAlign: "center",
    }}>{type}</span>
  )
}

function ConfColor(conf: number) {
  if (conf >= 0.8) return "#22c55e"
  if (conf >= 0.65) return "#f59e0b"
  return "#6b6b8a"
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return (
    <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a4a6a", fontSize: 11 }}>
      accumulating data...
    </div>
  )
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 200, h = 48, pad = 4
  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const poly = pts.join(" ")
  const first = pts[0].split(",")
  const last = pts[pts.length - 1].split(",")
  const fill = `M${first[0]},${h - pad} L${pts.join(" L")} L${last[0]},${h - pad} Z`
  const isUp = values[values.length - 1] >= values[0]
  const color = isUp ? "#22c55e" : "#ef4444"
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 48 }} preserveAspectRatio="none">
      <path d={fill} fill={color} fillOpacity={0.07} stroke="none" />
      <polyline points={poly} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function TickerBar({ positions }: { positions: any[] }) {
  const watchlist = ["SPY", "QQQ", "XLE", "GLD", "TLT", "XLK", "XLF", "XLI", "XLV"]
  const posMap = Object.fromEntries((positions ?? []).map(p => [p.ticker, p]))
  return (
    <div style={{
      background: "#111118", borderBottom: "1px solid #1e1e2e",
      padding: "8px 20px", display: "flex", gap: 24, overflowX: "auto",
      scrollbarWidth: "none",
    }}>
      {watchlist.map(sym => {
        const pos = posMap[sym]
        const pct = pos ? (pos.unrealized_plpc * 100).toFixed(2) : null
        const isUp = pos ? pos.unrealized_plpc >= 0 : true
        return (
          <div key={sym} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            <span style={{ color: "#7c7c9a", fontSize: 11, letterSpacing: "0.05em" }}>{sym}</span>
            {pos ? (
              <>
                <span style={{ color: "#e2e2e8", fontWeight: 500 }}>{fmt$$(pos.current_price)}</span>
                <span style={{ color: isUp ? "#22c55e" : "#ef4444", fontSize: 11 }}>
                  {isUp ? "+" : ""}{pct}%
                </span>
              </>
            ) : (
              <span style={{ color: "#4a4a6a", fontSize: 11 }}>—</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const PANEL: React.CSSProperties = {
  background: "#0d0d14", padding: 16,
}
const LABEL: React.CSSProperties = {
  fontSize: 10, letterSpacing: "0.1em", color: "#4a4a6a",
  textTransform: "uppercase", marginBottom: 12,
  display: "flex", alignItems: "center", gap: 6,
}
const DIVIDER: React.CSSProperties = {
  borderBottom: "1px solid #1e1e2e",
}
const MONO: React.CSSProperties = {
  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
}

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

  const { data: account } = useQuery({ queryKey: ["account"], queryFn: getAccount })
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: getPositions })
  const { data: history } = useQuery({ queryKey: ["history"], queryFn: getPortfolioHistory })
  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: getPendingTrades })
  const { data: signals } = useQuery({ queryKey: ["signals"], queryFn: getSignals })
  const { data: news } = useQuery({ queryKey: ["news"], queryFn: getNews })

  const { mutate: approve } = useMutation({
    mutationFn: approveTrade,
    onSuccess: () => qc.invalidateQueries(),
  })
  const { mutate: reject } = useMutation({
    mutationFn: rejectTrade,
    onSuccess: () => qc.invalidateQueries(),
  })

  const totalPL = positions?.reduce((s, p) => s + p.unrealized_pl, 0) ?? 0
  const equity = account?.portfolio_value ?? 0

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes ticker {
          0%{transform:translateX(0)}
          100%{transform:translateX(-50%)}
        }
        .dash-btn-approve {
          background:#0d2e1a;color:#22c55e;border:1px solid #1a4a2a;
          padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;
          font-family:inherit;letter-spacing:0.04em;transition:background 0.15s;
        }
        .dash-btn-approve:hover{background:#1a4a2a}
        .dash-btn-reject {
          background:#2e0d0d;color:#ef4444;border:1px solid #4a1a1a;
          padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;
          font-family:inherit;letter-spacing:0.04em;margin-left:4px;transition:background 0.15s;
        }
        .dash-btn-reject:hover{background:#4a1a1a}
        .dash-row:hover{background:#111118}
        .dash-news-src-finn{background:#0d1e2e;color:#378add;border:1px solid #1a3a5a}
        .dash-news-src-news{background:#1e0d2e;color:#a855f7;border:1px solid #3a1a5a}
        .dash-news-src-reddit{background:#2e1a0d;color:#f97316;border:1px solid #5a3a1a}
      `}</style>

      <div style={{
        background: "#0a0a0f", color: "#e2e2e8",
        ...MONO,
        fontSize: 13, borderRadius: 12, overflow: "hidden",
        border: "1px solid #1e1e2e", width: "100%",
      }}>

        {/* Header */}
        <div style={{
          background: "#0d0d14", padding: "12px 20px",
          borderBottom: "1px solid #1e1e2e",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#7c7cdc", letterSpacing: "0.04em" }}>
            ⬡ trading agent
          </div>
          <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#4a4a6a" }}>
              <Pulse />live · paper mode
            </span>
            <span style={{ fontSize: 11, color: "#4a4a6a" }}>{now}</span>
          </div>
        </div>

        {/* Ticker */}
        <TickerBar positions={positions ?? []} />

        {/* Body grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "auto auto",
          gap: 1,
          background: "#1e1e2e",
        }}>

          {/* Portfolio panel */}
          <div style={PANEL}>
            <div style={LABEL}>portfolio</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "equity", value: fmt$$(equity) },
                { label: "unrealized P&L", value: fmt$$(totalPL), color: totalPL >= 0 ? "#22c55e" : "#ef4444" },
                { label: "positions", value: `${positions?.length ?? 0} / 3` },
                { label: "cash", value: fmt$$(account?.cash ?? 0) },
              ].map(s => (
                <div key={s.label} style={{
                  background: "#111118", border: "1px solid #1e1e2e",
                  borderRadius: 6, padding: "10px 12px",
                }}>
                  <div style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: s.color ?? "#e2e2e8" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ ...LABEL, marginBottom: 8 }}>open positions</div>
            {positions?.length ? positions.map(p => (
              <div key={p.ticker} className="dash-row" style={{
                ...DIVIDER, display: "flex", alignItems: "center",
                justifyContent: "space-between", padding: "8px 4px",
                transition: "background 0.15s",
              }}>
                <div>
                  <span style={{ fontWeight: 600, color: "#a0a0c0", fontSize: 13 }}>{p.ticker}</span>
                  <span style={{ color: "#4a4a6a", marginLeft: 8, fontSize: 11 }}>{p.qty.toFixed(4)} shares</span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: p.unrealized_pl >= 0 ? "#22c55e" : "#ef4444" }}>
                    {fmt$$(p.unrealized_pl)}
                  </div>
                  <div style={{ fontSize: 11, color: "#4a4a6a" }}>
                    {(p.unrealized_plpc * 100).toFixed(2)}%
                  </div>
                </div>
              </div>
            )) : (
              <div style={{ color: "#4a4a6a", fontSize: 12, padding: "8px 0" }}>no open positions</div>
            )}
          </div>

          {/* Signals panel */}
          <div style={PANEL}>
            <div style={LABEL}><Pulse />live signals</div>
            {signals?.slice(0, 8).map(s => (
              <div key={s.id} className="dash-row" style={{
                ...DIVIDER, display: "flex", alignItems: "center",
                gap: 10, padding: "8px 4px", transition: "background 0.15s",
              }}>
                <SigBadge type={s.signal_type} />
                <span style={{ fontWeight: 600, color: "#a0a0c0", minWidth: 32, fontSize: 12 }}>{s.ticker}</span>
                <span style={{ color: "#4a4a6a", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.reasoning}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: ConfColor(s.confidence), minWidth: 32, textAlign: "right" }}>
                  {(s.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {!signals?.length && (
              <div style={{ color: "#4a4a6a", fontSize: 12 }}>no signals yet — run ingestion</div>
            )}
          </div>

          {/* Approvals panel */}
          <div style={PANEL}>
            <div style={LABEL}>
              pending approvals
              {!!pending?.length && (
                <span style={{
                  background: "#2e2a00", color: "#f59e0b",
                  border: "1px solid #4a3a00", padding: "1px 6px",
                  borderRadius: 3, fontSize: 10, marginLeft: 4,
                }}>
                  {pending.length} waiting
                </span>
              )}
            </div>
            {pending?.slice(0, 6).map(t => (
              <div key={t.id} className="dash-row" style={{
                ...DIVIDER, display: "flex", alignItems: "center",
                justifyContent: "space-between", padding: "9px 4px",
                transition: "background 0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, color: "#a0a0c0", fontSize: 13 }}>{t.ticker}</span>
                  <SigBadge type={t.side.toUpperCase()} />
                </div>
                <span style={{ color: "#e2e2e8", fontSize: 13, fontWeight: 500 }}>{fmt$$(t.notional)}</span>
                <div>
                  <button className="dash-btn-approve" onClick={() => approve(t.id)}>approve</button>
                  <button className="dash-btn-reject" onClick={() => reject(t.id)}>reject</button>
                </div>
              </div>
            ))}
            {!pending?.length && (
              <div style={{ color: "#4a4a6a", fontSize: 12 }}>no pending trades</div>
            )}

            {/* Equity curve */}
            <div style={{ marginTop: 20 }}>
              <div style={LABEL}>equity curve</div>
              <Sparkline values={history?.equity ?? []} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ color: "#4a4a6a", fontSize: 11 }}>30d ago</span>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: totalPL >= 0 ? "#22c55e" : "#ef4444",
                }}>
                  {totalPL >= 0 ? "+" : ""}{fmt$$(totalPL)}
                </span>
                <span style={{ color: "#4a4a6a", fontSize: 11 }}>today</span>
              </div>
            </div>
          </div>

          {/* News panel — spans 3 cols */}
          <div style={{ ...PANEL, gridColumn: "span 3" }}>
            <div style={LABEL}><Pulse />news feed · ingesting every 15 min</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              {news?.slice(0, 9).map(a => (
                <div key={a.id} style={{ ...DIVIDER, paddingBottom: 10, marginBottom: 2 }}>
                  <div style={{ marginBottom: 5 }}>
                    <span className={`dash-news-src-${a.source}`} style={{
                      fontSize: 10, letterSpacing: "0.06em",
                      padding: "1px 6px", borderRadius: 2,
                      display: "inline-block",
                    }}>
                      {a.source}{a.tickers?.length ? ` · ${a.tickers[0]}` : ""}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 12, color: "#c0c0d8", lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {a.headline}
                  </div>
                  <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 4 }}>
                    {fmtTime(a.published_at)}
                  </div>
                </div>
              ))}
              {!news?.length && (
                <div style={{ color: "#4a4a6a", fontSize: 12 }}>no articles yet</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}