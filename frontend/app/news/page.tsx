"use client"
import { useQuery } from "@tanstack/react-query"
import { getNews } from "@/lib/api"
import { fmtTime } from "@/lib/utils"

const srcStyle: Record<string, React.CSSProperties> = {
  finnhub: { background: "#0d1e2e", color: "#378add", border: "1px solid #1a3a5a" },
  newsapi: { background: "#1e0d2e", color: "#a855f7", border: "1px solid #3a1a5a" },
  reddit:  { background: "#2e1a0d", color: "#f97316", border: "1px solid #5a3a1a" },
}

export default function NewsPage() {
  const { data: articles, isLoading } = useQuery({ queryKey: ["news"], queryFn: getNews })

  return (
    <div style={{ fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>news feed</div>
        <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>
          ingested articles · auto-refreshes every 15 min · {articles?.length ?? 0} articles
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {isLoading && <div style={{ color: "#4a4a6a", fontSize: 12 }}>loading...</div>}
        {articles?.map(a => (
          <div key={a.id} className="dash-card" style={{
            display: "flex", flexDirection: "column", gap: 8,
            cursor: "pointer", transition: "border-color 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a2a6a")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "#1e1e2e")}
            onClick={() => a.url && window.open(a.url, "_blank")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                ...srcStyle[a.source] ?? srcStyle.newsapi,
                fontSize: 10, letterSpacing: "0.06em",
                padding: "1px 7px", borderRadius: 3,
              }}>
                {a.source}
              </span>
              {a.tickers?.map(t => (
                <span key={t} style={{
                  background: "#13133a", color: "#7c7cdc",
                  border: "1px solid #2a2a6a",
                  fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 600,
                }}>{t}</span>
              ))}
              {a.sentiment_raw !== null && a.sentiment_raw !== undefined && (
                <span style={{
                  background: a.sentiment_raw > 0.5 ? "#0d2e1a" : "#2e0d0d",
                  color: a.sentiment_raw > 0.5 ? "#22c55e" : "#ef4444",
                  border: `1px solid ${a.sentiment_raw > 0.5 ? "#1a4a2a" : "#4a1a1a"}`,
                  fontSize: 10, padding: "1px 6px", borderRadius: 3,
                }}>
                  {(a.sentiment_raw * 100).toFixed(0)}% bull
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#c0c0d8", lineHeight: 1.5, fontWeight: 500 }}>
              {a.headline}
            </div>
            {a.summary && (
              <div style={{
                fontSize: 11, color: "#6a6a8a", lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {a.summary}
              </div>
            )}
            <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 2 }}>
              {fmtTime(a.published_at)}
            </div>
          </div>
        ))}
        {!isLoading && !articles?.length && (
          <div style={{ color: "#4a4a6a", fontSize: 12 }}>no articles yet — run ingestion</div>
        )}
      </div>
    </div>
  )
}