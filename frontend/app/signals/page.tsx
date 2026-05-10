"use client"
import { useQuery } from "@tanstack/react-query"
import { getSignals } from "@/lib/api"
import { fmtTime } from "@/lib/utils"

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
      padding: "2px 8px", borderRadius: 3,
    }}>{type}</span>
  )
}

export default function SignalsPage() {
  const { data: signals, isLoading } = useQuery({ queryKey: ["signals"], queryFn: getSignals })

  return (
    <div style={{ fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>signals</div>
        <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>llm-generated trading signals from news classification</div>
      </div>

      <div className="dash-card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e1e2e" }}>
              {["signal", "ticker", "reasoning", "confidence", "model", "time"].map((h, i) => (
                <th key={h} style={{
                  padding: "10px 16px",
                  textAlign: i <= 1 ? "left" : i === 2 ? "left" : "right",
                  fontSize: 10, color: "#4a4a6a",
                  letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} style={{ padding: "32px 16px", textAlign: "center", color: "#4a4a6a" }}>loading...</td></tr>
            )}
            {signals?.map(s => (
              <tr key={s.id} className="dash-table-row" style={{ borderBottom: "1px solid #1e1e2e", transition: "background 0.15s" }}>
                <td style={{ padding: "11px 16px" }}><SigBadge type={s.signal_type} /></td>
                <td style={{ padding: "11px 16px", fontWeight: 600, color: "#a0a0c0" }}>{s.ticker}</td>
                <td style={{ padding: "11px 16px", color: "#6a6a8a", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.reasoning}
                </td>
                <td style={{ padding: "11px 16px", textAlign: "right" }}>
                  <span style={{
                    color: s.confidence >= 0.8 ? "#22c55e" : s.confidence >= 0.65 ? "#f59e0b" : "#6a6a8a",
                    fontWeight: 600,
                  }}>
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a4a6a", fontSize: 11 }}>
                  {s.llm_model.replace("llama-", "llama ")}
                </td>
                <td style={{ padding: "11px 16px", textAlign: "right", color: "#4a4a6a", fontSize: 11 }}>
                  {fmtTime(s.created_at)}
                </td>
              </tr>
            ))}
            {!isLoading && !signals?.length && (
              <tr><td colSpan={6} style={{ padding: "32px 16px", textAlign: "center", color: "#4a4a6a" }}>
                no signals yet — run ingestion
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}