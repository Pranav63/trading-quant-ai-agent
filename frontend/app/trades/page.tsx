"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getPendingTrades, getTradeHistory, approveTrade, rejectTrade, getRecentlyFailed } from "@/lib/api"
import { fmt$$, fmtTime } from "@/lib/utils"
import { useState, useEffect } from "react"
import { Trade } from "@/types"

function useMarketStatus() {
  const [status, setStatus] = useState<{ isOpen: boolean, label: string, nextEvent: string }>({
    isOpen: false, label: "checking...", nextEvent: ""
  })
  useEffect(() => {
    const check = () => {
      const now = new Date()
      const utcH = now.getUTCHours()
      const utcM = now.getUTCMinutes()
      const mins = utcH * 60 + utcM
      // 13:30 UTC = 9:30 AM ET = market open
      // 20:00 UTC = 4:00 PM ET = market close
      const isOpen = mins >= 810 && mins < 1200
      const isPremarket = mins >= 480 && mins < 810  // 8 AM ET
      setStatus({
        isOpen,
        label: isOpen ? "market open" : isPremarket ? "pre-market" : "market closed",
        nextEvent: isOpen
          ? `closes ${new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20, 0)).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`
          : `opens 9:30 PM SGT`,
      })
    }
    check()
    const id = setInterval(check, 60000)
    return () => clearInterval(id)
  }, [])
  return status
}

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

function RiskMeter({ pct }: { pct: number }) {
  const color = pct < 1 ? "#22c55e" : pct < 2 ? "#f59e0b" : "#ef4444"
  const label = pct < 1 ? "low risk" : pct < 2 ? "medium risk" : "high risk"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: "#1e1e2e", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          width: `${Math.min(pct / 3 * 100, 100)}%`,
          height: "100%", background: color, borderRadius: 2,
          transition: "width 0.3s ease",
        }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 600, minWidth: 60 }}>{label}</span>
    </div>
  )
}

function MarketStatusBar({ isOpen, label, nextEvent }: { isOpen: boolean, label: string, nextEvent: string }) {
  return (
    <div style={{
      flexShrink: 0, padding: "8px 14px",
      background: isOpen ? "#0d2e1a" : "#1a1400",
      border: `1px solid ${isOpen ? "#1a4a2a" : "#3a3000"}`,
      borderRadius: 6, display: "flex", alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: isOpen ? "#22c55e" : "#f59e0b",
          display: "inline-block",
          animation: isOpen ? "pulse 2s ease-in-out infinite" : undefined,
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: isOpen ? "#22c55e" : "#f59e0b" }}>
          {label}
        </span>
      </div>
      <span style={{ fontSize: 11, color: "#4a4a6a" }}>
        {isOpen
          ? "orders execute immediately"
          : `market closed — approvals queue and execute when open · ${nextEvent}`
        }
      </span>
      <span style={{ fontSize: 10, color: "#4a4a6a" }}>
        SGT hours: 9:30 PM – 4:00 AM
      </span>
    </div>
  )
}

function PendingCard({
  trade, onApprove, onReject, approving, rejecting, marketOpen
}: {
  trade: Trade,
  onApprove: (id: string) => void,
  onReject: (id: string) => void,
  approving: boolean,
  rejecting: boolean,
  marketOpen: boolean,
}) {
  const isExit = trade.side === "sell"
  const hasRisk = !!(trade.current_price && trade.stop_loss && trade.take_profit)

  return (
    <div style={{
      background: "#0d0d14",
      border: `1px solid ${isExit ? "#4a1a1a" : "#1e1e2e"}`,
      borderRadius: 8, overflow: "hidden",
      transition: "border-color 0.15s",
    }}>
      {/* Market closed warning on card */}
      {!marketOpen && (
        <div style={{
          padding: "5px 16px",
          background: "#1a1400", borderBottom: "1px solid #3a3000",
          fontSize: 10, color: "#a0a020",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span>⏰</span>
          <span>market closed — will execute at next open (9:30 PM SGT)</span>
        </div>
      )}

      {/* Card header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid #1e1e2e",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: isExit ? "rgba(239,68,68,0.04)" : undefined,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#e2e2e8" }}>{trade.ticker}</span>
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
          <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 1 }}>
            notional{trade.current_price ? ` @ ${fmt$$(trade.current_price)}` : ""}
          </div>
        </div>
      </div>

      {/* Risk summary */}
      {hasRisk && (
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid #1e1e2e",
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>stop loss</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#ef4444" }}>{fmt$$(trade.stop_loss!)}</div>
            <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 2 }}>max loss {fmt$$(trade.max_loss!)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>take profit</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#22c55e" }}>{fmt$$(trade.take_profit!)}</div>
            <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 2 }}>max gain {fmt$$(trade.max_gain!)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>risk/reward</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: trade.rr_ratio && trade.rr_ratio >= 1.5 ? "#22c55e" : "#f59e0b" }}>
              {trade.rr_ratio ? `1 : ${trade.rr_ratio}` : "—"}
            </div>
            <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 2 }}>
              {trade.rr_ratio && trade.rr_ratio >= 1.5 ? "favorable" : "marginal"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>account risk</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: (trade.risk_pct_of_account ?? 0) < 1 ? "#22c55e" : (trade.risk_pct_of_account ?? 0) < 2 ? "#f59e0b" : "#ef4444" }}>
              {trade.risk_pct_of_account !== undefined && trade.risk_pct_of_account !== null ? `${trade.risk_pct_of_account}%` : "—"}
            </div>
            <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 2 }}>of portfolio</div>
          </div>
        </div>
      )}

      {/* Risk meter */}
      {trade.risk_pct_of_account !== undefined && trade.risk_pct_of_account !== null && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #1e1e2e" }}>
          <RiskMeter pct={trade.risk_pct_of_account} />
        </div>
      )}

      {/* Range bar */}
      {hasRisk && (
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #1e1e2e" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 9, color: "#ef4444" }}>SL {fmt$$(trade.stop_loss!)}</span>
            <span style={{ fontSize: 9, color: "#7c7c9a" }}>entry {fmt$$(trade.current_price!)}</span>
            <span style={{ fontSize: 9, color: "#22c55e" }}>TP {fmt$$(trade.take_profit!)}</span>
          </div>
          <div style={{ height: 6, background: "#1e1e2e", borderRadius: 3, position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${((trade.current_price! - trade.stop_loss!) / (trade.take_profit! - trade.stop_loss!)) * 100}%`,
              background: "linear-gradient(90deg, #4a1a1a, #2e1a1a)",
              borderRadius: "3px 0 0 3px",
            }} />
            <div style={{
              position: "absolute", top: -1, height: "calc(100% + 2px)", width: 2,
              background: "#7c7cdc", borderRadius: 1,
              left: `calc(${((trade.current_price! - trade.stop_loss!) / (trade.take_profit! - trade.stop_loss!)) * 100}% - 1px)`,
            }} />
            <div style={{
              position: "absolute", top: 0, height: "100%",
              left: `${((trade.current_price! - trade.stop_loss!) / (trade.take_profit! - trade.stop_loss!)) * 100}%`,
              right: 0,
              background: "linear-gradient(90deg, #1a2e1a, #1a4a2a)",
              borderRadius: "0 3px 3px 0",
            }} />
          </div>
        </div>
      )}

      {/* Meta */}
      <div style={{
        padding: "8px 16px", borderBottom: "1px solid #1e1e2e",
        display: "flex", gap: 20, alignItems: "center",
      }}>
        <div>
          <span style={{ fontSize: 9, color: "#4a4a6a", textTransform: "uppercase", letterSpacing: "0.08em" }}>source </span>
          <span style={{ fontSize: 11, color: "#a0a0c0" }}>{isExit ? "position monitor" : "llm signal"}</span>
        </div>
        <div>
          <span style={{ fontSize: 9, color: "#4a4a6a", textTransform: "uppercase", letterSpacing: "0.08em" }}>created </span>
          <span style={{ fontSize: 11, color: "#a0a0c0" }}>{fmtTime(trade.created_at)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#1e1e2e" }}>
        <button
          onClick={() => onReject(trade.id)}
          disabled={rejecting}
          style={{
            padding: "10px 0", fontSize: 12, fontWeight: 600,
            cursor: rejecting ? "not-allowed" : "pointer",
            fontFamily: "inherit", letterSpacing: "0.04em",
            background: "#0d0d14", color: "#6a6a8a",
            border: "none", transition: "all 0.15s",
            opacity: rejecting ? 0.5 : 1,
          }}
          onMouseEnter={e => {
            if (!rejecting) {
              ;(e.currentTarget).style.background = "#2e0d0d"
              ;(e.currentTarget).style.color = "#ef4444"
            }
          }}
          onMouseLeave={e => {
            ;(e.currentTarget).style.background = "#0d0d14"
            ;(e.currentTarget).style.color = "#6a6a8a"
          }}
        >
          ✕ reject
        </button>
        <button
          onClick={() => onApprove(trade.id)}
          disabled={approving}
          style={{
            padding: "10px 0", fontSize: 12, fontWeight: 600,
            cursor: approving ? "not-allowed" : "pointer",
            fontFamily: "inherit", letterSpacing: "0.04em",
            background: isExit ? "#2e0d0d" : "#0d2e1a",
            color: isExit ? "#ef4444" : "#22c55e",
            border: "none", transition: "all 0.15s",
            opacity: approving ? 0.5 : 1,
            boxShadow: isExit ? "0 0 16px rgba(239,68,68,0.1)" : "0 0 16px rgba(34,197,94,0.1)",
          }}
          onMouseEnter={e => {
            if (!approving) {
              ;(e.currentTarget).style.background = isExit ? "#4a1a1a" : "#1a4a2a"
            }
          }}
          onMouseLeave={e => {
            ;(e.currentTarget).style.background = isExit ? "#2e0d0d" : "#0d2e1a"
          }}
        >
          ✓ {marketOpen ? "" : "queue · "}approve {isExit ? "exit" : "entry"}
        </button>
      </div>
    </div>
  )
}

export default function TradesPage() {
  const qc = useQueryClient()
  const market = useMarketStatus()
  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: getPendingTrades, refetchInterval: 15000 })
  const { data: history } = useQuery({ queryKey: ["history_trades"], queryFn: getTradeHistory })
  const { data: recentlyFailed } = useQuery({
    queryKey: ["recently_failed"],
    queryFn: getRecentlyFailed,
    refetchInterval: 30000,
  })
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
      fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 12,
      height: "calc(100vh - 48px)", overflow: "hidden",
    }}>
      <style>{`
        .dash-table-row { transition: background 0.15s; }
        .dash-table-row:hover { background: #111118; }
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}
        .trades-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Header */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>trades</div>
          <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>review and action pending recommendations</div>
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
              {pending.length} trade{pending.length > 1 ? "s" : ""} waiting
            </span>
          </div>
        )}
      </div>

      {/* Market status bar — always visible */}
      <MarketStatusBar {...market} />

      {/* Scrollable content */}
      <div className="trades-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Recently failed */}
        {!!recentlyFailed?.length && (
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: "#ef4444", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              ✕ recently failed — market was closed at time of approval
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recentlyFailed.map(t => (
                <div key={t.id} style={{
                  padding: "10px 16px", borderRadius: 6,
                  background: "#0d0d14", border: "1px solid #3a1a1a",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, color: "#e2e2e8", fontSize: 14 }}>{t.ticker}</span>
                    <SigBadge type={t.side.toUpperCase()} />
                    <StatusBadge status={t.status} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ fontSize: 11, color: "#6a6a8a" }}>{fmt$$(t.notional)}</span>
                    <span style={{ fontSize: 10, color: "#4a4a6a" }}>{fmtTime(t.updated_at)}</span>
                    <span style={{
                      fontSize: 10, color: "#f59e0b",
                      background: "#1a1400", border: "1px solid #3a3000",
                      padding: "2px 8px", borderRadius: 4,
                    }}>
                      re-approve during market hours
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exit signals */}
        {sells.length > 0 && (
          <div style={{ flexShrink: 0 }}>
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
                  marketOpen={market.isOpen}
                />
              ))}
            </div>
          </div>
        )}

        {/* Entry signals */}
        {buys.length > 0 && (
          <div style={{ flexShrink: 0 }}>
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
                  marketOpen={market.isOpen}
                />
              ))}
            </div>
          </div>
        )}

        {/* No pending */}
        {!pending?.length && !recentlyFailed?.length && (
          <div style={{
            padding: "20px", background: "#0d0d14",
            border: "1px solid #1e1e2e", borderRadius: 8,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <span style={{ fontSize: 12, color: "#4a4a6a" }}>
              no pending trades — bot is monitoring, next ingestion in ~15 min
            </span>
          </div>
        )}

        {/* History */}
        <div style={{
          background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 8,
          overflow: "hidden", flexShrink: 0, minHeight: 280,
        }}>
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid #1e1e2e",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase" }}>trade history</span>
            <span style={{ fontSize: 10, color: "#4a4a6a" }}>{history?.length ?? 0} trades</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
                {["ticker", "side", "notional", "filled price", "status", "time"].map((h, i) => (
                  <th key={h} style={{
                    padding: "10px 20px", textAlign: i <= 1 ? "left" : "right",
                    fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em",
                    textTransform: "uppercase", fontWeight: 500,
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
                  <td style={{ padding: "11px 20px", textAlign: "right" }}><StatusBadge status={t.status} /></td>
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

        <div style={{ height: 16, flexShrink: 0 }} />
      </div>
    </div>
  )
}