"use client"
import { useQuery } from "@tanstack/react-query"
import { getAccount, getPositions, getPortfolioHistory } from "@/lib/api"
import { fmt$$, fmtPct } from "@/lib/utils"

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "#4a4a6a", textTransform: "uppercase", marginBottom: 12 }}>
      {children}
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
        <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>account overview and open positions</div>
      </div>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "portfolio value", value: fmt$$(account?.portfolio_value ?? 0) },
          { label: "cash available", value: fmt$$(account?.cash ?? 0) },
          { label: "invested", value: fmt$$(totalVal) },
          { label: "unrealized P&L", value: fmt$$(totalPL), color: totalPL >= 0 ? "#22c55e" : "#ef4444" },
        ].map(s => (
          <div key={s.label} className="dash-card">
            <div style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: s.color ?? "#e2e2e8" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e2e" }}>
          <Label>open positions</Label>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
              {["ticker", "qty", "avg entry", "current", "market value", "P&L", "return"].map(h => (
                <th key={h} style={{
                  padding: "10px 20px", textAlign: h === "ticker" ? "left" : "right",
                  fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em",
                  textTransform: "uppercase", fontWeight: 500,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions?.map(p => (
              <tr key={p.ticker} className="dash-table-row" style={{ borderBottom: "1px solid #1e1e2e", transition: "background 0.15s" }}>
                <td style={{ padding: "12px 20px", fontWeight: 600, color: "#a0a0c0" }}>{p.ticker}</td>
                <td style={{ padding: "12px 20px", textAlign: "right", color: "#e2e2e8" }}>{p.qty.toFixed(4)}</td>
                <td style={{ padding: "12px 20px", textAlign: "right" }}>{fmt$$(p.avg_entry_price)}</td>
                <td style={{ padding: "12px 20px", textAlign: "right" }}>{fmt$$(p.current_price)}</td>
                <td style={{ padding: "12px 20px", textAlign: "right" }}>{fmt$$(p.qty * p.current_price)}</td>
                <td style={{ padding: "12px 20px", textAlign: "right", color: p.unrealized_pl >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                  {fmt$$(p.unrealized_pl)}
                </td>
                <td style={{ padding: "12px 20px", textAlign: "right", color: p.unrealized_plpc >= 0 ? "#22c55e" : "#ef4444" }}>
                  {fmtPct(p.unrealized_plpc)}
                </td>
              </tr>
            ))}
            {!positions?.length && (
              <tr>
                <td colSpan={7} style={{ padding: "32px 20px", textAlign: "center", color: "#4a4a6a", fontSize: 12 }}>
                  no open positions — approve a trade to open one
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}