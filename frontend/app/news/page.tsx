"use client";
import { useQuery } from "@tanstack/react-query";
import { getNewsFlat } from "@/lib/api";
import { fmtTime } from "@/lib/utils";
import { useState } from "react";

const srcStyle: Record<string, React.CSSProperties> = {
  finnhub: {
    background: "#0d1e2e",
    color: "#378add",
    border: "1px solid #1a3a5a",
  },
  newsapi: {
    background: "#1e0d2e",
    color: "#a855f7",
    border: "1px solid #3a1a5a",
  },
  reddit: {
    background: "#2e1a0d",
    color: "#f97316",
    border: "1px solid #5a3a1a",
  },
  fred: {
    background: "#0d2e20",
    color: "#10b981",
    border: "1px solid #1a5a3a",
  },
  rss_reuters_business: {
    background: "#2e1a00",
    color: "#fb923c",
    border: "1px solid #5a3a00",
  },
  rss_reuters_markets: {
    background: "#2e1a00",
    color: "#fb923c",
    border: "1px solid #5a3a00",
  },
  rss_wsj_markets: {
    background: "#1a1a0d",
    color: "#eab308",
    border: "1px solid #4a4a00",
  },
  rss_ft_markets: {
    background: "#1a0d0d",
    color: "#f87171",
    border: "1px solid #4a1a1a",
  },
  "rss_investing.com_economy": {
    background: "#0d1a2e",
    color: "#60a5fa",
    border: "1px solid #1a3a5a",
  },
};

const srcLabel: Record<string, string> = {
  finnhub: "finnhub",
  newsapi: "newsapi",
  reddit: "reddit",
  fred: "FRED macro",
  rss_reuters_business: "reuters",
  rss_reuters_markets: "reuters mkts",
  rss_wsj_markets: "WSJ",
  rss_ft_markets: "FT",
  "rss_investing.com_economy": "investing.com",
};

const WATCHLIST = [
  "SPY",
  "QQQ",
  "XLE",
  "GLD",
  "TLT",
  "XLK",
  "XLF",
  "XLI",
  "XLV",
];
const ALL_SOURCES = [
  "ALL",
  "finnhub",
  "newsapi",
  "fred",
  "rss_reuters_business",
  "rss_reuters_markets",
  "rss_wsj_markets",
  "rss_ft_markets",
  "rss_investing.com_economy",
];

export default function NewsPage() {
  const {
    data: articles,
    isLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["news_flat"],
    queryFn: getNewsFlat,
    refetchInterval: 15 * 60 * 1000,
  });

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [tickerFilter, setTickerFilter] = useState("ALL");
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  const tickers = ["ALL", "MACRO", ...WATCHLIST];

  const filtered = articles?.filter((a) => {
    const matchSource = sourceFilter === "ALL" || a.source === sourceFilter;
    const matchTicker =
      tickerFilter === "ALL" ||
      (tickerFilter === "MACRO"
        ? !a.tickers?.length
        : a.tickers?.includes(tickerFilter));
    const matchSearch =
      !search ||
      a.headline.toLowerCase().includes(search.toLowerCase()) ||
      a.summary?.toLowerCase().includes(search.toLowerCase());
    return matchSource && matchTicker && matchSearch;
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const srcBadge = (source: string, tickers?: string[]) => (
    <span
      style={{
        ...(srcStyle[source] ?? {
          background: "#1a1a2e",
          color: "#6a6a8a",
          border: "1px solid #2a2a4a",
        }),
        fontSize: 9,
        letterSpacing: "0.06em",
        padding: "1px 6px",
        borderRadius: 3,
        flexShrink: 0,
      }}
    >
      {srcLabel[source] ?? source}
      {tickers?.length ? ` · ${tickers[0]}` : ""}
    </span>
  );

  return (
    <div
      style={{
        fontFamily: "var(--dash-mono)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        height: "calc(100vh - 48px)",
        overflow: "hidden",
      }}
    >
      <style>{`
        .news-card { display:flex;flex-direction:column;gap:8;cursor:pointer;transition:border-color 0.15s,background 0.15s;background:#0d0d14;border:1px solid #1e1e2e;border-radius:8px;padding:14px; }
        .news-card:hover { border-color:#2a2a6a;background:#111118; }
        .news-card-list { display:flex;align-items:flex-start;gap:14;cursor:pointer;transition:background 0.15s;background:#0d0d14;border-bottom:1px solid #1e1e2e;padding:12px 16px; }
        .news-card-list:hover { background:#111118; }
        .filter-pill { padding:3px 10px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.06em;cursor:pointer;transition:all 0.15s;font-family:inherit;border:1px solid #1e1e2e;background:#0d0d14;color:#4a4a6a; }
        .filter-pill.active { background:#13133a;color:#7c7cdc;border-color:#2a2a6a; }
        .filter-pill:hover:not(.active) { border-color:#2a2a4a;color:#a0a0c0; }
        .ticker-pill { padding:3px 8px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.06em;cursor:pointer;transition:all 0.15s;font-family:inherit;border:1px solid #1e1e2e;background:#0d0d14;color:#4a4a6a;white-space:nowrap; }
        .ticker-pill.active { background:#13133a;color:#7c7cdc;border-color:#2a2a6a; }
        .layout-btn { padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;transition:all 0.15s;font-family:inherit;border:1px solid #1e1e2e;background:#0d0d14;color:#4a4a6a; }
        .layout-btn.active { background:#13133a;color:#7c7cdc;border-color:#2a2a6a; }
        .search-input { background:#0d0d14;border:1px solid #1e1e2e;border-radius:6px;padding:6px 12px;font-size:11px;color:#e2e2e8;font-family:inherit;outline:none;width:200px;transition:border-color 0.15s; }
        .search-input::placeholder { color:#4a4a6a; }
        .search-input:focus { border-color:#2a2a6a; }
        .scroll-hide::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#7c7cdc" }}>
              news feed
            </div>
            <div style={{ fontSize: 11, color: "#4a4a6a", marginTop: 2 }}>
              {filtered?.length ?? 0} articles · sources: finnhub, newsapi,
              reuters, WSJ, FT, FRED
              {lastUpdated && (
                <span style={{ marginLeft: 8 }}>· updated {lastUpdated}</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              className="search-input"
              placeholder="search headlines..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className={`layout-btn${layout === "grid" ? " active" : ""}`}
              onClick={() => setLayout("grid")}
            >
              ⊞
            </button>
            <button
              className={`layout-btn${layout === "list" ? " active" : ""}`}
              onClick={() => setLayout("list")}
            >
              ≡
            </button>
          </div>
        </div>

        {/* Source filters — scrollable */}
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "#4a4a6a",
              marginRight: 2,
              flexShrink: 0,
            }}
          >
            source:
          </span>
          <div
            className="scroll-hide"
            style={{ display: "flex", gap: 6, overflowX: "auto" }}
          >
            {ALL_SOURCES.map((s) => (
              <button
                key={s}
                className={`filter-pill${sourceFilter === s ? " active" : ""}`}
                onClick={() => setSourceFilter(s)}
              >
                {srcLabel[s] ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* Ticker filters */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            style={{
              fontSize: 10,
              color: "#4a4a6a",
              marginRight: 2,
              flexShrink: 0,
            }}
          >
            ticker:
          </span>
          <div
            className="scroll-hide"
            style={{ display: "flex", gap: 6, overflowX: "auto" }}
          >
            {tickers.map((t) => (
              <button
                key={t}
                className={`ticker-pill${tickerFilter === t ? " active" : ""}`}
                onClick={() => setTickerFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Articles */}
      <div
        className="scroll-hide"
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
      >
        {isLoading && (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "#4a4a6a",
              fontSize: 12,
            }}
          >
            loading articles...
          </div>
        )}

        {!isLoading && layout === "grid" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              alignContent: "start",
            }}
          >
            {filtered?.map((a) => (
              <div
                key={a.id}
                className="news-card"
                onClick={() => a.url && window.open(a.url, "_blank")}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {srcBadge(a.source, a.tickers)}
                  {a.tickers?.map((t) => (
                    <span
                      key={t}
                      style={{
                        background: "#13133a",
                        color: "#7c7cdc",
                        border: "1px solid #2a2a6a",
                        fontSize: 9,
                        padding: "1px 5px",
                        borderRadius: 3,
                        fontWeight: 600,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                  {a.sentiment_raw != null && (
                    <span
                      style={{
                        background:
                          a.sentiment_raw > 0.5 ? "#0d2e1a" : "#2e0d0d",
                        color: a.sentiment_raw > 0.5 ? "#22c55e" : "#ef4444",
                        border: `1px solid ${a.sentiment_raw > 0.5 ? "#1a4a2a" : "#4a1a1a"}`,
                        fontSize: 9,
                        padding: "1px 5px",
                        borderRadius: 3,
                      }}
                    >
                      {(a.sentiment_raw * 100).toFixed(0)}% bull
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 9,
                      color: "#4a4a6a",
                    }}
                  >
                    ↗
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#c0c0d8",
                    lineHeight: 1.5,
                    fontWeight: 500,
                  }}
                >
                  {a.headline}
                </div>
                {a.summary && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#6a6a8a",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {a.summary}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 2,
                  }}
                >
                  <span style={{ fontSize: 10, color: "#4a4a6a" }}>
                    {fmtTime(a.published_at)}
                  </span>
                  {a.url && (
                    <span style={{ fontSize: 10, color: "#2a2a6a" }}>
                      click to open →
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && layout === "list" && (
          <div
            style={{
              background: "#0d0d14",
              border: "1px solid #1e1e2e",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {filtered?.map((a, i) => (
              <div
                key={a.id}
                className="news-card-list"
                onClick={() => a.url && window.open(a.url, "_blank")}
                style={{
                  borderBottom:
                    i === filtered.length - 1 ? "none" : "1px solid #1e1e2e",
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    minWidth: 90,
                  }}
                >
                  {srcBadge(a.source)}
                  {a.sentiment_raw != null && (
                    <span
                      style={{
                        background:
                          a.sentiment_raw > 0.5 ? "#0d2e1a" : "#2e0d0d",
                        color: a.sentiment_raw > 0.5 ? "#22c55e" : "#ef4444",
                        border: `1px solid ${a.sentiment_raw > 0.5 ? "#1a4a2a" : "#4a1a1a"}`,
                        fontSize: 9,
                        padding: "1px 5px",
                        borderRadius: 3,
                        textAlign: "center",
                      }}
                    >
                      {(a.sentiment_raw * 100).toFixed(0)}% bull
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#c0c0d8",
                      fontWeight: 500,
                      lineHeight: 1.4,
                      marginBottom: 4,
                    }}
                  >
                    {a.headline}
                  </div>
                  {a.summary && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6a6a8a",
                        lineHeight: 1.35,
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {a.summary}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                    minWidth: 80,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 4,
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {a.tickers?.map((t) => (
                      <span
                        key={t}
                        style={{
                          background: "#13133a",
                          color: "#7c7cdc",
                          border: "1px solid #2a2a6a",
                          fontSize: 9,
                          padding: "1px 5px",
                          borderRadius: 3,
                          fontWeight: 600,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#4a4a6a",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtTime(a.published_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !filtered?.length && (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "#4a4a6a",
              fontSize: 12,
            }}
          >
            {search || sourceFilter !== "ALL" || tickerFilter !== "ALL"
              ? "no articles match your filters"
              : "no articles yet — run ingestion"}
          </div>
        )}
      </div>
    </div>
  );
}
