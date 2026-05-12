"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getPendingTrades, getTradeHistory, approveTrade, rejectTrade } from "@/lib/api"
import { fmt$$, fmtTime } from "@/lib/utils"
import { useState } from "react"

function SigBadge({ type }: { type: string }) {
  const styles: Record<string, React.CSSProperties> = {
    BUY:  { background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a" },
    SELL: { background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" },
  }
  return (
    <span style={{
      ...styles[type] ?? styles.BUY,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
      padding: "2px 8px", borderRadius: 3, flexShrink: 0,
    }}>{type}</span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    PENDING:   { background: "#2e2a00", color: "#f59e0b", border: "1px solid #4a3a00" },
    EXECUTED:  { background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a" },
    REJECTED:  { background: "#1a1a2e", color: "#6a6a8a", border: "1px solid #2a2a4a" },
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

function PendingCard({
  trade, onApprove, onReject, approving, rejecting
}: {
  trade: any,
  onApprove: (id: string) => void,
  onReject: (id: string) => void,
  approving: boolean,
  rejecting: boolean,
}) {
  const isExit = trade.side === "sell"
  const reason = trade.signal_id ? "position monitor" : "llm signal"

  return (
    <div style={{
      background: "#0d0d14",
      border: `1px solid ${isExit ? "#4a1a1a" : "#1e1e2e"}`,
      borderRadius: 8,
      overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* Card header */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid #1e1e2e",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: isExit ? "rgba(239,68,68,0.04)" : undefined,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#e2e2e8" }}>{trade.ticker}</span>
          <SigBadge type={trade.side.toUpperCase()} />
          {isExit && (
            <span style={{
              fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 600,
              background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a",
            }}>EXIT</span>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e2e8" }}>{fmt$$(trade.notional)}</div>
          <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 2 }}>notional value</div>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>source</div>
            <div style={{ fontSize: 11, color: "#a0a0c0" }}>{reason}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>created</div>
            <div style={{ fontSize: 11, color: "#a0a0c0" }}>{fmtTime(trade.created_at)}</div>
          </div>
          {trade.qty > 0 && (
            <div>
              <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>qty</div>
              <div style={{ fontSize: 11, color: "#a0a0c0" }}>{trade.qty.toFixed(4)} shares</div>
            </div>
          )}
        </div>

        {/* Action buttons — prominent */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onReject(trade.id)}
            disabled={rejecting}
            style={{
              padding: "8px 20px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: rejecting ? "not-allowed" : "pointer",
              fontFamily: "inherit", letterSpacing: "0.04em",
              background: "#1a1a2e", color: "#6a6a8a",
              border: "1px solid #2a2a4a",
              transition: "all 0.15s",
              opacity: rejecting ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (!rejecting) {
                (e.target as HTMLButtonElement).style.background = "#2e0d0d"
                ;(e.target as HTMLButtonElement).style.color = "#ef4444"
                ;(e.target as HTMLButtonElement).style.borderColor = "#4a1a1a"
              }
            }}
            onMouseLeave={e => {
              ;(e.target as HTMLButtonElement).style.background = "#1a1a2e"
              ;(e.target as HTMLButtonElement).style.color = "#6a6a8a"
              ;(e.target as HTMLButtonElement).style.borderColor = "#2a2a4a"
            }}
          >
            ✕ reject
          </button>
          <button
            onClick={() => onApprove(trade.id)}
            disabled={approving}
            style={{
              padding: "8px 24px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              cursor: approving ? "not-allowed" : "pointer",
              fontFamily: "inherit", letterSpacing: "0.04em",
              background: isExit ? "#2e0d0d" : "#0d2e1a",
              color: isExit ? "#ef4444" : "#22c55e",
              border: `1px solid ${isExit ? "#4a1a1a" : "#1a4a2a"}`,
              transition: "all 0.15s",
              opacity: approving ? 0.5 : 1,
              boxShadow: isExit ? "0 0 12px rgba(239,68,68,0.15)" : "0 0 12px rgba(34,197,94,0.15)",
            }}
            onMouseEnter={e => {
              if (!approving) {
                ;(e.target as HTMLButtonElement).style.background = isExit ? "#4a1a1a" : "#1a4a2a"
              }
            }}
            onMouseLeave={e => {
              ;(e.target as HTMLButtonElement).style.background = isExit ? "#2e0d0d" : "#0d2e1a"
            }}
          >
            ✓ approve {isExit ? "exit" : "entry"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TradesPage() {
  const qc = useQueryClient()
  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: getPendingTrades, refetchInterval: 15000 })
  const { data: history } = useQuery({ queryKey: ["history_trades"], queryFn: getTradeHistory })
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  const { mutate: approve } = useMutation({
    mutationFn: approveTrade,
    onMutate: (id) => setApprovingId(id),
    onSettled: () => { setApprovingId(null); qc.invalidateQueries() },
  })
  const { mutate: reject } = useMutation({
    mutationFn: rejectTrade,
    onMutate: (id) => setRejectingId(id),
    onSettled: () => { setRejectingId(null); qc.invalidateQueries() },
  })

  const buys = pending?.filter(t => t.side === "buy") ?? []
  const sells = pending?.filter(t => t.side === "sell") ?? []

  return (
    <div style={{
      fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 16,
      height: "calc(100vh - 48px)", overflow: "hidden",
    }}>
      <style>{`
        .dash-table-row { transition: background 0.15s; }
        .dash-table-row:hover { background: #111118; }
      `}</style>

      {/* Header */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>trades</div>
          <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>
            review and action pending recommendations
          </div>
        </div>
        {!!pending?.length && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#2e2a00", border: "1px solid #4a3a00",
            padding: "6px 12px", borderRadius: 6,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#f59e0b",
              animation: "pulse 2s ease-in-out infinite", display: "inline-block",
            }} />
            <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
              {pending.length} trade{pending.length > 1 ? "s" : ""} waiting for your decision
            </span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>

        {/* Pending section */}
        {!!pending?.length && (
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 16, flexDirection: "column" }}>
              {/* Exit trades first — more urgent */}
              {sells.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: "#ef4444", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    ⚠ exit signals — stop loss / take profit
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {sells.map(t => (
                      <PendingCard
                        key={t.id} trade={t}
                        onApprove={approve} onReject={reject}
                        approving={approvingId === t.id}
                        rejecting={rejectingId === t.id}
                      />
                    ))}
                  </div>
                </div>
              )}
              {/* Entry trades */}
              {buys.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    entry signals
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {buys.map(t => (
                      <PendingCard
                        key={t.id} trade={t}
                        onApprove={approve} onReject={reject}
                        approving={approvingId === t.id}
                        rejecting={rejectingId === t.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!pending?.length && (
          <div style={{
            padding: "20px 20px", background: "#0d0d14",
            border: "1px solid #1e1e2e", borderRadius: 8,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <span style={{ fontSize: 12, color: "#4a4a6a" }}>
              no pending trades — bot is monitoring markets, next ingestion in ~15 min
            </span>
          </div>
        )}

        {/* History table */}
        <div style={{
          flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
          background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 8, minHeight: 0,
        }}>
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid #1e1e2e", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              trade history
            </span>
            <span style={{ fontSize: 10, color: "#4a4a6a" }}>
              {history?.length ?? 0} trades
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: "#0d0d14", zIndex: 1 }}>
                <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
                  {["ticker", "side", "notional", "filled price", "status", "time"].map((h, i) => (
                    <th key={h} style={{
                      padding: "10px 20px",
                      textAlign: i <= 1 ? "left" : "right",
                      fontSize: 10, color: "#4a4a6a",
                      letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history?.map(t => (
                  <tr key={t.id} className="dash-table-row" style={{ borderBottom: "1px solid #1e1e2e" }}>
                    <td style={{ padding: "11px 20px", fontWeight: 600, color: "#a0a0c0" }}>{t.ticker}</td>
                    <td style={{ padding: "11px 20px" }}><SigBadge type={t.side.toUpperCase()} /></td>
                    <td style={{ padding: "11px 20px", textAlign: "right" }}>{fmt$$(t.notional)}</td>
                    <td style={{ padding: "11px 20px", textAlign: "right", color: "#e2e2e8" }}>
                      {t.filled_price ? fmt$$(t.filled_price) : "—"}
                    </td>
                    <td style={{ padding: "11px 20px", textAlign: "right" }}>
                      <StatusBadge status={t.status} />
                    </td>
                    <td style={{ padding: "11px 20px", textAlign: "right", color: "#4a4a6a", fontSize: 11 }}>
                      {fmtTime(t.created_at)}
                    </td>
                  </tr>
                ))}
                {!history?.length && (
                  <tr>
                    <td colSpan={6} style={{ padding: "32px 20px", textAlign: "center", color: "#4a4a6a", fontSize: 12 }}>
                      no trade history yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
    </div>
  )
}