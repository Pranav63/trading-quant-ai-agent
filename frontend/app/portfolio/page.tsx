"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getAccount, getPositions, getPortfolioHistory, liquidateTrade, liquidateAll } from "@/lib/api"
import { fmt$$, fmtPct } from "@/lib/utils"
import { useState } from "react"

function RangeBar({ stop, current, target, side = "long" }: { stop: number; current: number; target: number; side?: string }) {
  const total = side === "long" ? target - stop : stop - target
  if (total <= 0) return null
  const pct = side === "long"
    ? Math.min(Math.max(((current - stop) / total) * 100, 0), 100)
    : Math.min(Math.max(((stop - current) / total) * 100, 0), 100)
  const color = pct < 25 ? "#ef4444" : pct > 75 ? "#22c55e" : "#f59e0b"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 120 }}>
      <div style={{ height: 4, background: "#1e1e2e", borderRadius: 2, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4a4a6a" }}>
        <span style={{ color: "#ef4444" }}>SL {fmt$$(stop)}</span>
        <span style={{ color: "#22c55e" }}>TP {fmt$$(target)}</span>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const qc = useQueryClient()
  const { data: account } = useQuery({ queryKey: ["account"], queryFn: getAccount })
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: getPositions, refetchInterval: 30000 })
  const { data: history } = useQuery({ queryKey: ["history"], queryFn: getPortfolioHistory })

  const [liquidatingId, setLiquidatingId]   = useState<string | null>(null)
  const [liquidatingAll, setLiquidatingAll] = useState(false)

  const { mutate: doLiquidate } = useMutation({
    mutationFn: (ticker: string) => liquidateTrade(ticker),
    onMutate: id => setLiquidatingId(id),
    onSettled: () => { setLiquidatingId(null); qc.invalidateQueries() },
  })
  const { mutate: doLiquidateAll } = useMutation({
    mutationFn: liquidateAll,
    onMutate: () => setLiquidatingAll(true),
    onSettled: () => { setLiquidatingAll(false); qc.invalidateQueries() },
  })

  const totalPL  = positions?.reduce((s, p) => s + p.unrealized_pl, 0) ?? 0
  const totalVal = positions?.reduce((s, p) => s + p.qty * p.current_price, 0) ?? 0

  return (
    <div style={{ fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`
        .dash-card { background:#0d0d14;border:1px solid #1e1e2e;border-radius:8px;padding:16px; }
        .dash-table-row { transition:background 0.15s; }
        .dash-table-row:hover { background:#111118; }
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}
      `}</style>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>portfolio</div>
          <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>positions · stop loss · take profit · liquidation controls</div>
        </div>
        {!!positions?.length && (
          <button
            onClick={() => { if (window.confirm("Close ALL open positions immediately?")) doLiquidateAll() }}
            disabled={liquidatingAll}
            style={{ padding: "8px 16px", fontSize: 11, fontWeight: 600, cursor: liquidatingAll ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "0.04em", background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a", borderRadius: 6, opacity: liquidatingAll ? 0.5 : 1, transition: "all 0.15s" }}
            onMouseEnter={e => { if (!liquidatingAll) (e.currentTarget).style.background = "#4a1a1a" }}
            onMouseLeave={e => { (e.currentTarget).style.background = "#2e0d0d" }}
          >{liquidatingAll ? "closing all..." : "⚡ liquidate all positions"}</button>
        )}
      </div>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "portfolio value", value: fmt$$(account?.portfolio_value ?? 0) },
          { label: "cash available",  value: fmt$$(account?.cash ?? 0) },
          { label: "invested",        value: fmt$$(totalVal) },
          { label: "unrealized P&L",  value: fmt$$(totalPL), color: totalPL >= 0 ? "#22c55e" : "#ef4444" },
        ].map(s => (
          <div key={s.label} className="dash-card">
            <div style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: (s as any).color ?? "#e2e2e8" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase" }}>open positions</span>
          <span style={{ fontSize: 10, color: "#4a4a6a" }}>SL = entry ∓ (ATR × 2) · TP = entry ∓ (ATR × 3) · direction-aware</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
              {["ticker", "side", "qty", "entry", "current", "P&L", "return", "stop loss", "take profit", "range", "action"].map((h, i) => (
                <th key={h} style={{ padding: "10px 14px", textAlign: i <= 1 ? "left" : "right", fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions?.map(p => {
              const side = (p as any).side ?? (p.qty >= 0 ? "long" : "short")
              const nearStop   = p.pct_to_stop < 1.0
              const nearTarget = p.pct_to_target < 1.0
              const isLiq      = liquidatingId === p.ticker
              return (
                <tr key={p.ticker} className="dash-table-row" style={{ borderBottom: "1px solid #1e1e2e", background: nearStop ? "rgba(239,68,68,0.04)" : undefined }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600, color: "#a0a0c0" }}>
                    {p.ticker}
                    {nearStop && <span style={{ marginLeft: 6, fontSize: 9, background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a", padding: "1px 5px", borderRadius: 3 }}>near SL</span>}
                    {nearTarget && <span style={{ marginLeft: 6, fontSize: 9, background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a", padding: "1px 5px", borderRadius: 3 }}>near TP</span>}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 600, background: side === "long" ? "#0d2e1a" : "#2e0d0d", color: side === "long" ? "#22c55e" : "#ef4444", border: `1px solid ${side === "long" ? "#1a4a2a" : "#4a1a1a"}` }}>
                      {side}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>{Math.abs(p.qty).toFixed(4)}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>{fmt$$(p.avg_entry_price)}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600 }}>{fmt$$(p.current_price)}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600, color: p.unrealized_pl >= 0 ? "#22c55e" : "#ef4444" }}>{fmt$$(p.unrealized_pl)}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", color: p.unrealized_plpc >= 0 ? "#22c55e" : "#ef4444" }}>{fmtPct(p.unrealized_plpc)}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", color: "#ef4444" }}>
                    {fmt$$(p.stop_loss)}
                    <div style={{ fontSize: 10, color: "#4a4a6a" }}>{p.pct_to_stop.toFixed(1)}% away</div>
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right", color: "#22c55e" }}>
                    {fmt$$(p.take_profit)}
                    <div style={{ fontSize: 10, color: "#4a4a6a" }}>{p.pct_to_target.toFixed(1)}% away</div>
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    <RangeBar stop={p.stop_loss} current={p.current_price} target={p.take_profit} side={side} />
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    <button
                      onClick={() => { if (window.confirm(`Liquidate ${p.ticker}?`)) doLiquidate(p.ticker) }}
                      disabled={isLiq}
                      style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, cursor: isLiq ? "not-allowed" : "pointer", fontFamily: "inherit", background: "#1a0d2e", color: "#a855f7", border: "1px solid #3a1a5a", borderRadius: 4, opacity: isLiq ? 0.5 : 1, transition: "all 0.15s", whiteSpace: "nowrap" }}
                      onMouseEnter={e => { if (!isLiq) (e.currentTarget).style.background = "#2e1a4a" }}
                      onMouseLeave={e => { (e.currentTarget).style.background = "#1a0d2e" }}
                    >{isLiq ? "..." : "⚡ close"}</button>
                  </td>
                </tr>
              )
            })}
            {!positions?.length && (
              <tr>
                <td colSpan={11} style={{ padding: "32px 16px", textAlign: "center", color: "#4a4a6a", fontSize: 12 }}>no open positions — approve a trade to open one</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, fontSize: 11, color: "#4a4a6a", padding: "12px 16px", background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 8, flexWrap: "wrap" }}>
        <span>range: <span style={{ color: "#ef4444" }}>red = near SL</span> · <span style={{ color: "#f59e0b" }}>amber = mid</span> · <span style={{ color: "#22c55e" }}>green = near TP</span></span>
        <span>·</span>
        <span>SL/TP direction-aware — shorts invert automatically</span>
        <span>·</span>
        <span>position monitor checks every 5 min · news exit triggers above 70% confidence</span>
      </div>
    </div>
  )
}