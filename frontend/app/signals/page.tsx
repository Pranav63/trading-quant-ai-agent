"use client"
import { useQuery } from "@tanstack/react-query"
import { getSignals } from "@/lib/api"
import { fmtTime } from "@/lib/utils"
import { useState, useEffect } from "react"

function SigBadge({ type }: { type: string }) {
  const styles: Record<string, React.CSSProperties> = {
    BUY:  { background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a" },
    SELL: { background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" },
    HOLD: { background: "#2e2a00", color: "#f59e0b", border: "1px solid #4a3a00" },
  }
  return (
    <span style={{ ...styles[type] ?? styles.HOLD, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 3, flexShrink: 0 }}>
      {type}
    </span>
  )
}

function ConfBar({ value }: { value: number }) {
  const pct   = Math.round(value * 100)
  const color = value >= 0.8 ? "#22c55e" : value >= 0.65 ? "#f59e0b" : "#6a6a8a"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 44, height: 3, background: "#1e1e2e", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 28 }}>{pct}%</span>
    </div>
  )
}

function IndicatorPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600,
      background: ok ? "#0d2e1a" : "#1a1a2e",
      color: ok ? "#22c55e" : "#4a4a6a",
      border: `1px solid ${ok ? "#1a4a2a" : "#2a2a4a"}`,
    }}>{label}</span>
  )
}

function BuyPressureBadge({ pct, signalType }: { pct: number; signalType: string }) {
  const bullish = pct >= 55
  const bearish = pct <= 45
  const aligned = (signalType === "BUY" && bullish) || (signalType === "SELL" && bearish)
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 600, flexShrink: 0,
      background: aligned ? (bullish ? "#0d2e1a" : "#2e0d0d") : "#1a1a2e",
      color: aligned ? (bullish ? "#22c55e" : "#ef4444") : "#4a4a6a",
      border: `1px solid ${aligned ? (bullish ? "#1a4a2a" : "#4a1a1a") : "#2a2a4a"}`,
    }}>{pct}% buy</span>
  )
}

export default function SignalsPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { data: signals, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: getSignals,
    refetchInterval: 30000,
  })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter]     = useState<"ALL" | "BUY" | "SELL">("ALL")

  const filtered = signals?.filter(s => filter === "ALL" || s.signal_type === filter)

  return (
    <div suppressHydrationWarning style={{
      fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 16,
      height: "calc(100vh - 48px)", overflow: "hidden",
    }}>
      <style>{`
        .sig-row { cursor:pointer;transition:background 0.15s; }
        .sig-row:hover { background:#111118 !important; }
        .sig-expanded { animation:fadeIn 0.15s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        .filter-btn { padding:4px 12px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.06em;cursor:pointer;transition:all 0.15s;font-family:inherit;border:1px solid #1e1e2e;background:#0d0d14;color:#4a4a6a; }
        .filter-btn.active { background:#13133a;color:#7c7cdc;border-color:#2a2a6a; }
        .filter-btn:hover:not(.active) { border-color:#2a2a4a;color:#a0a0c0; }
        .sig-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>signals</div>
          <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>click any row to expand reasoning + indicator details</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#4a4a6a", marginRight: 4 }}>filter:</span>
          {(["ALL", "BUY", "SELL"] as const).map(f => (
            <button key={f} className={`filter-btn${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
          {mounted && <span style={{ marginLeft: 8, fontSize: 10, color: "#4a4a6a" }}>{filtered?.length ?? 0} signals</span>}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 8, minHeight: 0 }}>

        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "80px 60px 90px 120px 1fr 100px", borderBottom: "1px solid #1e1e2e", padding: "10px 16px", flexShrink: 0, background: "#0d0d14" }}>
          {["signal", "ticker", "conf", "pressure", "reasoning", "time"].map((h, i) => (
            <div key={h} style={{ fontSize: 10, color: "#4a4a6a", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500, textAlign: i === 5 ? "right" : "left" }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        <div className="sig-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {isLoading && <div style={{ padding: "40px 16px", textAlign: "center", color: "#4a4a6a", fontSize: 12 }}>loading signals...</div>}

          {mounted && filtered?.map(s => {
            const isOpen     = expanded === s.id
            const indicators = (s as any).indicators
            const atrPct     = indicators?.atr_pct
            const stopDist   = (s as any).raw_llm_response?.stop_loss_distance ?? indicators?.stop_loss_distance
            const buyPressure = (s as any).buy_pressure_pct

            return (
              <div key={s.id} style={{ borderBottom: "1px solid #1e1e2e" }}>
                <div
                  className="sig-row"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  style={{ display: "grid", gridTemplateColumns: "80px 60px 90px 120px 1fr 100px", padding: "11px 16px", alignItems: "center", background: isOpen ? "#111118" : undefined }}
                >
                  <div><SigBadge type={s.signal_type} /></div>
                  <div style={{ fontWeight: 600, color: "#a0a0c0", fontSize: 12 }}>{s.ticker}</div>
                  <div><ConfBar value={s.confidence} /></div>
                  <div>
                    {buyPressure != null
                      ? <BuyPressureBadge pct={buyPressure} signalType={s.signal_type} />
                      : <span style={{ fontSize: 10, color: "#4a4a6a" }}>—</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ color: "#6a6a8a", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.reasoning}</span>
                    <span style={{ fontSize: 10, color: "#2a2a4a", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  <div style={{ textAlign: "right", color: "#4a4a6a", fontSize: 10 }}>{fmtTime(s.created_at)}</div>
                </div>

                {isOpen && (
                  <div className="sig-expanded" style={{ padding: "14px 16px 16px", background: "#080810", borderTop: "1px solid #1e1e2e", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>full reasoning</div>
                      <div style={{ fontSize: 12, color: "#c0c0d8", lineHeight: 1.6, background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 6, padding: "10px 12px" }}>{s.reasoning}</div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

                      {/* Indicator checks */}
                      <div>
                        <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>indicator checks</div>
                        <div style={{ background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {indicators ? (
                            <>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#4a4a6a" }}>RSI(14)</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: "#e2e2e8" }}>{indicators.rsi ?? "—"}</span>
                                  <IndicatorPill ok={indicators.rsi_ok} label={indicators.rsi_ok ? "pass" : "fail"} />
                                </div>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#4a4a6a" }}>EMA 9/21</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 10, color: "#4a4a6a" }}>{indicators.ema9_hourly ?? "—"} / {indicators.ema21_hourly ?? "—"}</span>
                                  <IndicatorPill ok={indicators.ema_ok} label={indicators.ema_ok ? "pass" : "fail"} />
                                </div>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#4a4a6a" }}>WAP</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: "#e2e2e8" }}>{indicators.weighted_avg_price ?? "—"}</span>
                                  <IndicatorPill ok={indicators.wav_ok} label={indicators.wav_ok ? "pass" : "fail"} />
                                </div>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#4a4a6a" }}>buy pressure</span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: "#e2e2e8" }}>{buyPressure != null ? `${buyPressure}%` : "—"}</span>
                                  <IndicatorPill
                                    ok={buyPressure != null && ((s.signal_type === "BUY" && buyPressure >= 55) || (s.signal_type === "SELL" && buyPressure <= 45))}
                                    label={buyPressure != null ? (buyPressure >= 55 ? "bullish" : "bearish") : "n/a"}
                                  />
                                </div>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#4a4a6a" }}>volume spike</span>
                                <IndicatorPill ok={indicators.volume_spike} label={indicators.volume_spike ? "yes" : "no"} />
                              </div>
                              <div style={{ marginTop: 2, paddingTop: 8, borderTop: "1px solid #1e1e2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#4a4a6a" }}>votes</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e2e8" }}>{indicators.votes} / {indicators.total}</span>
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 11, color: "#4a4a6a" }}>no indicator data</div>
                          )}
                        </div>
                      </div>

                      {/* ATR */}
                      <div>
                        <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>volatility (ATR)</div>
                        <div style={{ background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, color: "#4a4a6a" }}>ATR % of price</span>
                            <span style={{ fontSize: 11, color: atrPct > 3 ? "#ef4444" : atrPct < 0.2 ? "#f59e0b" : "#22c55e" }}>
                              {atrPct ? `${atrPct.toFixed(2)}%` : "—"}
                            </span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, color: "#4a4a6a" }}>stop distance</span>
                            <span style={{ fontSize: 11, color: "#e2e2e8" }}>{stopDist ? `$${stopDist}` : "—"}</span>
                          </div>
                          {indicators?.atr_veto ? (
                            <div style={{ marginTop: 2, padding: "6px 8px", borderRadius: 4, background: "#2e0d0d", border: "1px solid #4a1a1a", fontSize: 10, color: "#ef4444", lineHeight: 1.4 }}>
                              ⚠ {indicators.atr_veto_reason}
                            </div>
                          ) : atrPct ? (
                            <div style={{ marginTop: 2, padding: "6px 8px", borderRadius: 4, background: "#0d2e1a", border: "1px solid #1a4a2a", fontSize: 10, color: "#22c55e" }}>
                              ✓ volatility within normal range
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Confidence */}
                      <div>
                        <div style={{ fontSize: 9, color: "#4a4a6a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>confidence breakdown</div>
                        <div style={{ background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#4a4a6a" }}>LLM weight (60%)</span>
                            <span style={{ fontSize: 11, color: "#7c7cdc" }}>~{Math.min(100, Math.round(s.confidence * 100 / 0.6))}%</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#4a4a6a" }}>indicators (40%)</span>
                            <span style={{ fontSize: 11, color: "#7c7cdc" }}>
                              {indicators?.indicator_score != null ? `${Math.round(indicators.indicator_score * 100)}%` : "—"}
                            </span>
                          </div>
                          <div style={{ height: 1, background: "#1e1e2e" }} />
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#4a4a6a" }}>combined</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: s.confidence >= 0.8 ? "#22c55e" : s.confidence >= 0.65 ? "#f59e0b" : "#6a6a8a" }}>
                              {Math.round(s.confidence * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 1, background: "#1e1e2e" }} />
                          <div>
                            <div style={{ fontSize: 9, color: "#4a4a6a", marginBottom: 3 }}>model</div>
                            <div style={{ fontSize: 10, color: "#4a4a6a" }}>{s.llm_model?.replace("llama-", "llama ")}</div>
                          </div>
                          {(s as any).pending_trade && (
                            <>
                              <div style={{ height: 1, background: "#1e1e2e" }} />
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 11, color: "#4a4a6a" }}>pending trade</span>
                                <span style={{ fontSize: 10, color: "#f59e0b", background: "#2e2a00", border: "1px solid #4a3a00", padding: "1px 6px", borderRadius: 3 }}>
                                  ${(s as any).pending_trade.notional}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {mounted && !isLoading && !filtered?.length && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#4a4a6a", fontSize: 12 }}>
              {filter !== "ALL" ? `no ${filter} signals` : "no signals yet — run ingestion"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}