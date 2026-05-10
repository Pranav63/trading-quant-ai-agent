"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getPendingTrades, getTradeHistory, approveTrade, rejectTrade } from "@/lib/api"
import { fmt$$, fmtTime } from "@/lib/utils"

function SigBadge({ type }: { type: string }) {
  const styles: Record<string, React.CSSProperties> = {
    BUY:  { background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a" },
    SELL: { background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" },
  }
  return (
    <span style={{
      ...styles[type] ?? styles.BUY,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
      padding: "2px 8px", borderRadius: 3,
    }}>{type}</span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    PENDING:   { background: "#2e2a00", color: "#f59e0b", border: "1px solid #4a3a00" },
    EXECUTED:  { background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a" },
    REJECTED:  { background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" },
    FAILED:    { background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" },
    CANCELLED: { background: "#1a1a2e", color: "#6a6a8a", border: "1px solid #2a2a4a" },
    APPROVED:  { background: "#0d1e2e", color: "#378add", border: "1px solid #1a3a5a" },
  }
  return (
    <span style={{
      ...styles[status] ?? styles.CANCELLED,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
      padding: "2px 8px", borderRadius: 3,
    }}>{status.toLowerCase()}</span>
  )
}

export default function TradesPage() {
  const qc = useQueryClient()
  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: getPendingTrades })
  const { data: history } = useQuery({ queryKey: ["history_trades"], queryFn: getTradeHistory })
  const { mutate: approve } = useMutation({ mutationFn: approveTrade, onSuccess: () => qc.invalidateQueries() })
  const { mutate: reject } = useMutation({ mutationFn: rejectTrade, onSuccess: () => qc.invalidateQueries() })

  return (
    <div style={{ fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>trades</div>
        <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>approve or reject pending recommendations</div>
      </div>

      {/* Pending */}
      <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid #1e1e2e",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            pending approvals
          </span>
          {!!pending?.length && (
            <span style={{
              background: "#2e2a00", color: "#f59e0b", border: "1px solid #4a3a00",
              fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 600,
            }}>{pending.length} waiting</span>
          )}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
              {["ticker", "side", "notional", "created", "action"].map((h, i) => (
                <th key={h} style={{
                  padding: "10px 20px",
                  textAlign: i >= 2 ? "right" : "left",
                  fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pending?.map(t => (
              <tr key={t.id} className="dash-table-row" style={{ borderBottom: "1px solid #1e1e2e", transition: "background 0.15s" }}>
                <td style={{ padding: "12px 20px", fontWeight: 600, color: "#a0a0c0" }}>{t.ticker}</td>
                <td style={{ padding: "12px 20px" }}><SigBadge type={t.side.toUpperCase()} /></td>
                <td style={{ padding: "12px 20px", textAlign: "right", color: "#e2e2e8", fontWeight: 600 }}>{fmt$$(t.notional)}</td>
                <td style={{ padding: "12px 20px", textAlign: "right", color: "#4a4a6a", fontSize: 11 }}>{fmtTime(t.created_at)}</td>
                <td style={{ padding: "12px 20px", textAlign: "right" }}>
                  <button className="dash-btn-approve" onClick={() => approve(t.id)}>approve</button>
                  <button className="dash-btn-reject" onClick={() => reject(t.id)}>reject</button>
                </td>
              </tr>
            ))}
            {!pending?.length && (
              <tr><td colSpan={5} style={{ padding: "32px 20px", textAlign: "center", color: "#4a4a6a" }}>
                no pending trades
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* History */}
      <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e2e" }}>
          <span style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase" }}>trade history</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
              {["ticker", "side", "notional", "filled price", "status", "time"].map((h, i) => (
                <th key={h} style={{
                  padding: "10px 20px",
                  textAlign: i === 0 || i === 1 ? "left" : "right",
                  fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history?.map(t => (
              <tr key={t.id} className="dash-table-row" style={{ borderBottom: "1px solid #1e1e2e", transition: "background 0.15s" }}>
                <td style={{ padding: "12px 20px", fontWeight: 600, color: "#a0a0c0" }}>{t.ticker}</td>
                <td style={{ padding: "12px 20px" }}><SigBadge type={t.side.toUpperCase()} /></td>
                <td style={{ padding: "12px 20px", textAlign: "right" }}>{fmt$$(t.notional)}</td>
                <td style={{ padding: "12px 20px", textAlign: "right", color: "#e2e2e8" }}>
                  {t.filled_price ? fmt$$(t.filled_price) : "—"}
                </td>
                <td style={{ padding: "12px 20px", textAlign: "right" }}><StatusBadge status={t.status} /></td>
                <td style={{ padding: "12px 20px", textAlign: "right", color: "#4a4a6a", fontSize: 11 }}>{fmtTime(t.created_at)}</td>
              </tr>
            ))}
            {!history?.length && (
              <tr><td colSpan={6} style={{ padding: "32px 20px", textAlign: "center", color: "#4a4a6a" }}>
                no trade history
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}