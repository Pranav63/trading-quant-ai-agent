"use client";
import { createNewsStream, getNewsClusters, getWatchlist } from "@/lib/api";
import { fmtTime } from "@/lib/utils";
import { NewsArticle } from "@/types";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MarketBrief from "@/components/MarketBrief";

const srcStyle: Record<string, React.CSSProperties> = {
  finnhub: { background: "#0d1e2e", color: "#378add", border: "1px solid #1a3a5a" },
  newsapi: { background: "#1e0d2e", color: "#a855f7", border: "1px solid #3a1a5a" },
  reddit: { background: "#2e1a0d", color: "#f97316", border: "1px solid #5a3a1a" },
  fred: { background: "#0d2e20", color: "#10b981", border: "1px solid #1a5a3a" },
  rss_reuters_business: { background: "#2e1a00", color: "#fb923c", border: "1px solid #5a3a00" },
  rss_reuters_markets: { background: "#2e1a00", color: "#fb923c", border: "1px solid #5a3a00" },
  rss_wsj_markets: { background: "#1a1a0d", color: "#eab308", border: "1px solid #4a4a00" },
  rss_ft_markets: { background: "#1a0d0d", color: "#f87171", border: "1px solid #4a1a1a" },
  "rss_investing.com_economy": { background: "#0d1a2e", color: "#60a5fa", border: "1px solid #1a3a5a" },
};

const srcLabel: Record<string, string> = {
  finnhub: "finnhub", newsapi: "newsapi", reddit: "reddit", fred: "FRED macro",
  rss_reuters_business: "reuters", rss_reuters_markets: "reuters mkts",
  rss_wsj_markets: "WSJ", rss_ft_markets: "FT", "rss_investing.com_economy": "investing.com",
};

const SIGNAL_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  CRITICAL:   { color: "#ef4444", bg: "#2e0d0d", border: "#4a1a1a" },
  ELEVATED:   { color: "#f97316", bg: "#2e1a0d", border: "#5a3a1a" },
  MONITORING: { color: "#eab308", bg: "#1a1a0d", border: "#4a4a00" },
  NOISE:      { color: "#4a4a6a", bg: "#0d0d14", border: "#1e1e2e" },
};

const ALL_SOURCES = [
  "ALL", "finnhub", "newsapi", "fred",
  "rss_reuters_business", "rss_reuters_markets",
  "rss_wsj_markets", "rss_ft_markets", "rss_investing.com_economy",
];
const SIGNAL_CLASSES = ["ALL", "CRITICAL", "ELEVATED", "MONITORING", "NOISE"];

function SignalBadge({ cls }: { cls: string }) {
  if (!cls || cls === "NOISE") return null;
  const s = SIGNAL_COLOR[cls] ?? SIGNAL_COLOR.MONITORING;
  return <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 8, padding: "1px 5px", borderRadius: 3, letterSpacing: "0.05em" }}>{cls}</span>;
}

function SentimentBadge({ value }: { value: number }) {
  const label = value > 0.6 ? "bull" : value < 0.4 ? "bear" : "neutral";
  const s = { bull: { background: "#0d2e1a", color: "#22c55e", border: "1px solid #1a4a2a" }, bear: { background: "#2e0d0d", color: "#ef4444", border: "1px solid #4a1a1a" }, neutral: { background: "#1a1a1a", color: "#6a6a8a", border: "1px solid #2a2a2a" } }[label];
  return <span style={{ ...s, fontSize: 8, padding: "1px 5px", borderRadius: 3 }}>{label}</span>;
}

function TickerBadge({ ticker }: { ticker: string }) {
  return <span style={{ background: "#13133a", color: "#7c7cdc", border: "1px solid #2a2a6a", fontSize: 8, padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>{ticker}</span>;
}

function SrcBadge({ source, tickers }: { source: string; tickers?: string[] }) {
  return (
    <span style={{ ...(srcStyle[source] ?? { background: "#1a1a2e", color: "#6a6a8a", border: "1px solid #2a2a4a" }), fontSize: 8, letterSpacing: "0.05em", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>
      {srcLabel[source] ?? source}{tickers?.length ? ` · ${tickers[0]}` : ""}
    </span>
  );
}

function CrossSourcePanel() {
  const { data, isLoading } = useQuery({ queryKey: ["news_clusters"], queryFn: () => getNewsClusters(6), refetchInterval: 5 * 60 * 1000 });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#4a4a6a", letterSpacing: "0.1em" }}>CROSS-SOURCE AGGREGATOR</span>
        {data && <span style={{ background: "#13133a", color: "#7c7cdc", border: "1px solid #2a2a6a", fontSize: 8, padding: "1px 4px", borderRadius: 3 }}>{data.total}</span>}
      </div>
      <div className="scroll-hide" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {isLoading && <div style={{ fontSize: 10, color: "#4a4a6a", padding: "20px 0", textAlign: "center" }}>scanning sources...</div>}
        {data?.clusters.map((cluster, i) => {
          const sc = SIGNAL_COLOR[cluster.signal_class] ?? SIGNAL_COLOR.MONITORING;
          return (
            <div key={i} style={{ background: "#0d0d14", border: `1px solid ${cluster.signal_class === "CRITICAL" ? "#3a1a1a" : "#1e1e2e"}`, borderLeft: `2px solid ${sc.color}`, borderRadius: "0 5px 5px 0", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <TickerBadge ticker={cluster.ticker} />
                <span style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontSize: 8, padding: "1px 4px", borderRadius: 3, letterSpacing: "0.05em" }}>{cluster.signal_class}</span>
                <span style={{ marginLeft: "auto", fontSize: 8, color: "#3a3a5a" }}>{cluster.source_count} sources · {cluster.article_count}</span>
              </div>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {cluster.sources.map(s => <span key={s} style={{ ...(srcStyle[s] ?? { background: "#1a1a2e", color: "#6a6a8a", border: "1px solid #2a2a4a" }), fontSize: 8, padding: "1px 4px", borderRadius: 2 }}>{srcLabel[s] ?? s}</span>)}
              </div>
              <div style={{ fontSize: 10, color: "#c0c0d8", lineHeight: 1.4 }}>{cluster.articles[0]?.headline}</div>
              {cluster.articles.slice(1, 3).map((a, j) => (
                <div key={j} style={{ fontSize: 9, color: "#4a4a6a", lineHeight: 1.3, paddingLeft: 6, borderLeft: "1px solid #1e1e2e", cursor: "pointer" }} onClick={() => a.url && window.open(a.url, "_blank")}>
                  {a.headline}
                </div>
              ))}
              <div style={{ fontSize: 8, color: "#3a3a5a" }}>{fmtTime(cluster.latest_at)}</div>
            </div>
          );
        })}
        {!isLoading && !data?.clusters.length && <div style={{ fontSize: 10, color: "#4a4a6a", padding: "20px 0", textAlign: "center" }}>no multi-source clusters yet</div>}
      </div>
    </div>
  );
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [tickerFilter, setTickerFilter] = useState("ALL");
  const [signalFilter, setSignalFilter] = useState("ALL");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const esRef = useRef<EventSource | null>(null);

  const { data: watchlist } = useQuery({ queryKey: ["watchlist"], queryFn: getWatchlist, staleTime: Infinity });
  const tickerList = ["ALL", "MACRO", ...(watchlist?.map(w => w.ticker) ?? ["SPY","QQQ","XLE","GLD","TLT","XLK","XLF","XLI","XLV","SLV","USO","BTC/USD"])];

  useEffect(() => {
    const es = createNewsStream(
      (initial) => { setArticles(initial); setIsLoading(false); setIsLive(true); setLastUpdated(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })); },
      (fresh) => { setArticles((prev) => [...fresh, ...prev].slice(0, 300)); setNewCount((c) => c + fresh.length); setLastUpdated(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })); },
      () => { setIsLive(false); setIsLoading(false); },
    );
    esRef.current = es;
    return () => es.close();
  }, []);

  const filtered = articles.filter((a) => {
    const matchSource = sourceFilter === "ALL" || a.source === sourceFilter;
    const matchTicker = tickerFilter === "ALL" || (tickerFilter === "MACRO" ? !a.tickers?.length : a.tickers?.includes(tickerFilter));
    const matchSignal = signalFilter === "ALL" || (a.signal_class ?? "MONITORING") === signalFilter;
    const matchSearch = !search || a.headline.toLowerCase().includes(search.toLowerCase()) || a.summary?.toLowerCase().includes(search.toLowerCase());
    return matchSource && matchTicker && matchSignal && matchSearch;
  });

  const signalCounts = SIGNAL_CLASSES.reduce((acc, cls) => {
    acc[cls] = cls === "ALL" ? articles.length : articles.filter(a => (a.signal_class ?? "MONITORING") === cls).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ fontFamily: "var(--dash-mono)", display: "flex", flexDirection: "column", gap: 10, height: "calc(100vh - 48px)", overflow: "hidden" }}>
      <style>{`
        .news-card { display:flex;flex-direction:column;gap:6px;cursor:pointer;transition:border-color 0.15s,background 0.15s;background:#0d0d14;border:1px solid #1e1e2e;border-radius:6px;padding:10px; }
        .news-card:hover { border-color:#2a2a6a;background:#111118; }
        .news-card.critical { border-color:#3a1a1a; }
        .news-card.critical:hover { border-color:#ef4444; }
        .news-card-list { display:flex;align-items:flex-start;gap:12px;cursor:pointer;transition:background 0.15s;background:#0d0d14;border-bottom:1px solid #1e1e2e;padding:10px 14px; }
        .news-card-list:hover { background:#111118; }
        .filter-pill { padding:2px 8px;border-radius:3px;font-size:9px;font-weight:600;letter-spacing:0.06em;cursor:pointer;transition:all 0.15s;font-family:inherit;border:1px solid #1e1e2e;background:#0d0d14;color:#3a3a5a; }
        .filter-pill.active { background:#13133a;color:#7c7cdc;border-color:#2a2a6a; }
        .filter-pill:hover:not(.active) { border-color:#2a2a4a;color:#8a8aaa; }
        .ticker-pill { padding:2px 7px;border-radius:3px;font-size:9px;font-weight:600;letter-spacing:0.06em;cursor:pointer;transition:all 0.15s;font-family:inherit;border:1px solid #1e1e2e;background:#0d0d14;color:#3a3a5a;white-space:nowrap; }
        .ticker-pill.active { background:#13133a;color:#7c7cdc;border-color:#2a2a6a; }
        .signal-pill { padding:2px 8px;border-radius:3px;font-size:9px;font-weight:600;letter-spacing:0.06em;cursor:pointer;transition:all 0.15s;font-family:inherit;border:1px solid #1e1e2e;background:#0d0d14;color:#3a3a5a;white-space:nowrap; }
        .signal-pill.active { background:#13133a;color:#7c7cdc;border-color:#2a2a6a; }
        .signal-pill.CRITICAL.active { background:#2e0d0d;color:#ef4444;border-color:#4a1a1a; }
        .signal-pill.ELEVATED.active { background:#2e1a0d;color:#f97316;border-color:#5a3a1a; }
        .signal-pill.MONITORING.active { background:#1a1a0d;color:#eab308;border-color:#4a4a00; }
        .layout-btn { padding:3px 7px;border-radius:3px;font-size:10px;cursor:pointer;transition:all 0.15s;font-family:inherit;border:1px solid #1e1e2e;background:#0d0d14;color:#3a3a5a; }
        .layout-btn.active { background:#13133a;color:#7c7cdc;border-color:#2a2a6a; }
        .search-input { background:#0d0d14;border:1px solid #1e1e2e;border-radius:5px;padding:5px 10px;font-size:10px;color:#e2e2e8;font-family:inherit;outline:none;width:180px;transition:border-color 0.15s; }
        .search-input::placeholder { color:#3a3a5a; }
        .search-input:focus { border-color:#2a2a6a; }
        .scroll-hide::-webkit-scrollbar { display:none; }
        .live-dot { width:5px;height:5px;border-radius:50%;background:#22c55e;display:inline-block;margin-right:4px;animation:pulse 2s infinite; }
        .dead-dot { width:5px;height:5px;border-radius:50%;background:#ef4444;display:inline-block;margin-right:4px; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        .new-badge { background:#13133a;color:#7c7cdc;border:1px solid #2a2a6a;border-radius:3px;font-size:8px;padding:1px 5px;cursor:pointer; }
        .new-badge:hover { background:#1e1e5a; }
        .card-img { width:100%;height:80px;object-fit:cover;border-radius:3px;opacity:0.8;display:block; }
      `}</style>

      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#8b8bef", letterSpacing: "0.02em" }}>news feed</div>
              <span style={{ display: "flex", alignItems: "center", fontSize: 9, color: isLive ? "#22c55e" : "#ef4444", letterSpacing: "0.08em" }}>
                <span className={isLive ? "live-dot" : "dead-dot"} />{isLive ? "live" : "disconnected"}
              </span>
              {newCount > 0 && <span className="new-badge" onClick={() => setNewCount(0)}>+{newCount} new</span>}
            </div>
            <div style={{ fontSize: 10, color: "#3a3a5a", marginTop: 2 }}>
              {filtered.length} articles · finnhub, newsapi, reuters, WSJ, FT, FRED
              {lastUpdated && <span style={{ marginLeft: 6 }}>· updated {lastUpdated}</span>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input className="search-input" placeholder="search headlines..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className={`layout-btn${layout === "grid" ? " active" : ""}`} onClick={() => setLayout("grid")}>⊞</button>
            <button className={`layout-btn${layout === "list" ? " active" : ""}`} onClick={() => setLayout("list")}>≡</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#3a3a5a", letterSpacing: "0.08em", width: 42, flexShrink: 0 }}>signal:</span>
            <div className="scroll-hide" style={{ display: "flex", gap: 4, overflowX: "auto" }}>
              {SIGNAL_CLASSES.map((cls) => (
                <button key={cls} className={`signal-pill ${cls}${signalFilter === cls ? " active" : ""}`} onClick={() => setSignalFilter(cls)}>
                  {cls}{signalCounts[cls] > 0 ? ` (${signalCounts[cls]})` : ""}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#3a3a5a", letterSpacing: "0.08em", width: 42, flexShrink: 0 }}>source:</span>
            <div className="scroll-hide" style={{ display: "flex", gap: 4, overflowX: "auto" }}>
              {ALL_SOURCES.map((s) => (
                <button key={s} className={`filter-pill${sourceFilter === s ? " active" : ""}`} onClick={() => setSourceFilter(s)}>
                  {srcLabel[s] ?? s}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#3a3a5a", letterSpacing: "0.08em", width: 42, flexShrink: 0 }}>ticker:</span>
            <div className="scroll-hide" style={{ display: "flex", gap: 4, overflowX: "auto" }}>
              {tickerList.map((t) => (
                <button key={t} className={`ticker-pill${tickerFilter === t ? " active" : ""}`} onClick={() => setTickerFilter(t)}>{t}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Brief */}
      <MarketBrief />

      {/* Two-column body */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 300px", gap: 12, minHeight: 0 }}>

        {/* LEFT — feed */}
        <div className="scroll-hide" style={{ overflowY: "auto", minHeight: 0 }}>
          {isLoading && <div style={{ padding: "40px 0", textAlign: "center", color: "#3a3a5a", fontSize: 11 }}>connecting to live feed...</div>}

          {!isLoading && layout === "grid" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignContent: "start" }}>
              {filtered.map((a) => (
                <div key={a.id} className={`news-card${a.signal_class === "CRITICAL" ? " critical" : ""}`} onClick={() => a.url && window.open(a.url, "_blank")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    <SrcBadge source={a.source} tickers={a.tickers} />
                    {a.tickers?.map((t) => <TickerBadge key={t} ticker={t} />)}
                    {a.signal_class && <SignalBadge cls={a.signal_class} />}
                    {a.sentiment_raw != null && <SentimentBadge value={a.sentiment_raw} />}
                    <span style={{ marginLeft: "auto", fontSize: 8, color: "#3a3a5a" }}>↗</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#c0c0d8", lineHeight: 1.45, fontWeight: 500 }}>{a.headline}</div>
                  {a.image_url && <img src={a.image_url} alt="" className="card-img" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                  {a.summary && <div style={{ fontSize: 10, color: "#4a4a6a", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.summary}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 9, color: "#3a3a5a" }}>{fmtTime(a.published_at)}</span>
                    {a.url && <span style={{ fontSize: 9, color: "#2a2a6a" }}>click to open →</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && layout === "list" && (
            <div style={{ background: "#0d0d14", border: "1px solid #1e1e2e", borderRadius: 6, overflow: "hidden" }}>
              {filtered.map((a, i) => (
                <div key={a.id} className="news-card-list" onClick={() => a.url && window.open(a.url, "_blank")}
                  style={{ borderBottom: i === filtered.length - 1 ? "none" : "1px solid #1e1e2e", borderLeft: a.signal_class === "CRITICAL" ? "2px solid #ef4444" : a.signal_class === "ELEVATED" ? "2px solid #f97316" : "none" }}>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, minWidth: 80 }}>
                    <SrcBadge source={a.source} />
                    {a.signal_class && <SignalBadge cls={a.signal_class} />}
                    {a.sentiment_raw != null && <SentimentBadge value={a.sentiment_raw} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#c0c0d8", fontWeight: 500, lineHeight: 1.4, marginBottom: 3 }}>{a.headline}</div>
                    {a.summary && <div style={{ fontSize: 10, color: "#4a4a6a", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.summary}</div>}
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, minWidth: 70 }}>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {a.tickers?.map((t) => <TickerBadge key={t} ticker={t} />)}
                    </div>
                    <span style={{ fontSize: 9, color: "#3a3a5a", whiteSpace: "nowrap" }}>{fmtTime(a.published_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && !filtered.length && (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#3a3a5a", fontSize: 11 }}>
              {search || sourceFilter !== "ALL" || tickerFilter !== "ALL" || signalFilter !== "ALL" ? "no articles match your filters" : "no articles yet — run ingestion"}
            </div>
          )}
        </div>

        {/* RIGHT — aggregator */}
        <div style={{ borderLeft: "1px solid #1a1a2a", paddingLeft: 12, minHeight: 0 }}>
          <CrossSourcePanel />
        </div>
      </div>
    </div>
  );
}