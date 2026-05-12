"use client"
import { useQuery } from "@tanstack/react-query"
import { getAccount, getPositions, getPortfolioHistory } from "@/lib/api"
import { fmt$$, fmtPct } from "@/lib/utils"

function RangeBar({ stop, current, target }: { stop: number, current: number, target: number }) {
  const total = target - stop
  if (total <= 0) return null
  const pct = Math.min(Math.max(((current - stop) / total) * 100, 0), 100)
  const color = pct < 25 ? "#ef4444" : pct > 75 ? "#22c55e" : "#f59e0b"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 120 }}>
      <div style={{
        height: 4, background: "#1e1e2e", borderRadius: 2, position: "relative", overflow: "hidden"
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0,
          width: `${pct}%`, height: "100%",
          background: color, borderRadius: 2,
          transition: "width 0.3s ease",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4a4a6a" }}>
        <span style={{ color: "#ef4444" }}>SL {fmt$$(stop)}</span>
        <span style={{ color: "#22c55e" }}>TP {fmt$$(target)}</span>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const { data: account } = useQuery({ queryKey: ["account"], queryFn: getAccount })
  const { data: positions } = useQuery({ queryKey: ["positions"], queryFn: getPositions })
  const { data: history } = useQuery({ queryKey: ["history"], queryFn: getPortfolioHistory })

  const totalPL = positions?.reduce((s, p) => s + p.unrealized_pl, 0) ?? 0
  const totalVal = positions?.reduce((s, p) => s + p.qty * p.current_price, 0) ?? 0

  return (
    <div style={{ fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>portfolio</div>
        <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>positions · stop loss · take profit levels</div>
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
            <div style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: (s as any).color ?? "#e2e2e8" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid #1e1e2e",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <span style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            open positions
          </span>
          <span style={{ fontSize: 10, color: "#4a4a6a" }}>
            stop loss · take profit computed from ATR × 2 / × 3
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
              {["ticker", "qty", "entry", "current", "P&L", "return", "stop loss", "take profit", "range"].map((h, i) => (
                <th key={h} style={{
                  padding: "10px 16px",
                  textAlign: i === 0 ? "left" : "right",
                  fontSize: 10, color: "#4a4a6a",
                  letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
                  whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions?.map(p => {
              const nearStop   = p.pct_to_stop < 1.0
              const nearTarget = p.pct_to_target < 1.0
              return (
                <tr key={p.ticker} className="dash-table-row" style={{
                  borderBottom: "1px solid #1e1e2e",
                  transition: "background 0.15s",
                  background: nearStop ? "rgba(239,68,68,0.04)" : undefined,
                }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "#a0a0c0" }}>
                    {p.ticker}
                    {nearStop && (
                      <span style={{
                        marginLeft: 6, fontSize: 9, background: "#2e0d0d",
                        color: "#ef4444", border: "1px solid #4a1a1a",
                        padding: "1px 5px", borderRadius: 3,
                      }}>near SL</span>
                    )}
                    {nearTarget && (
                      <span style={{
                        marginLeft: 6, fontSize: 9, background: "#0d2e1a",
                        color: "#22c55e", border: "1px solid #1a4a2a",
                        padding: "1px 5px", borderRadius: 3,
                      }}>near TP</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>{p.qty.toFixed(4)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>{fmt$$(p.avg_entry_price)}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600 }}>{fmt$$(p.current_price)}</td>
                  <td style={{
                    padding: "12px 16px", textAlign: "right", fontWeight: 600,
                    color: p.unrealized_pl >= 0 ? "#22c55e" : "#ef4444",
                  }}>
                    {fmt$$(p.unrealized_pl)}
                  </td>
                  <td style={{
                    padding: "12px 16px", textAlign: "right",
                    color: p.unrealized_plpc >= 0 ? "#22c55e" : "#ef4444",
                  }}>
                    {fmtPct(p.unrealized_plpc)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#ef4444" }}>
                    {fmt$$(p.stop_loss)}
                    <div style={{ fontSize: 10, color: "#4a4a6a" }}>
                      {p.pct_to_stop.toFixed(1)}% away
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right", color: "#22c55e" }}>
                    {fmt$$(p.take_profit)}
                    <div style={{ fontSize: 10, color: "#4a4a6a" }}>
                      {p.pct_to_target.toFixed(1)}% away
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <RangeBar stop={p.stop_loss} current={p.current_price} target={p.take_profit} />
                  </td>
                </tr>
              )
            })}
            {!positions?.length && (
              <tr>
                <td colSpan={9} style={{ padding: "32px 16px", textAlign: "center", color: "#4a4a6a", fontSize: 12 }}>
                  no open positions — approve a trade to open one
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", gap: 20, fontSize: 11, color: "#4a4a6a",
        padding: "12px 16px", background: "#0d0d14",
        border: "1px solid #1e1e2e", borderRadius: 8,
      }}>
        <span>range bar: <span style={{ color: "#ef4444" }}>red = near stop loss</span> · <span style={{ color: "#f59e0b" }}>amber = middle</span> · <span style={{ color: "#22c55e" }}>green = near take profit</span></span>
        <span>·</span>
        <span>stop loss = entry − (ATR × 2) · take profit = entry + (ATR × 3)</span>
        <span>·</span>
        <span>position monitor checks every 5 min</span>
      </div>
    </div>
  )
}