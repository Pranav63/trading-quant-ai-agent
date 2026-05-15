"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMarketBrief, triggerBrief } from "@/lib/api";
import { useState, useEffect } from "react";

export default function MarketBrief() {
  const qc = useQueryClient();
  const [spinning, setSpinning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["market_brief"],
    queryFn: getMarketBrief,
    refetchInterval: 15 * 60 * 1000,
  });

  const { mutate: generate, isPending: generating } = useMutation({
    mutationFn: triggerBrief,
    onMutate: () => setSpinning(true),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["market_brief"] });
      setTimeout(() => setSpinning(false), 600);
    },
  });

  useEffect(() => {
    if (!dataUpdatedAt) return;
    const tick = () =>
      setCountdown(
        Math.ceil(
          Math.max(0, 15 * 60 * 1000 - (Date.now() - dataUpdatedAt)) / 60000,
        ),
      );
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  const SIGNAL_COLOR: Record<
    string,
    { color: string; bg: string; border: string }
  > = {
    CRITICAL: { color: "#ef4444", bg: "#2e0d0d", border: "#4a1a1a" },
    ELEVATED: { color: "#f97316", bg: "#2e1a0d", border: "#5a3a1a" },
    MONITORING: { color: "#eab308", bg: "#1a1a0d", border: "#4a4a00" },
    quiet: { color: "#4a4a6a", bg: "#0d0d14", border: "#1e1e2e" },
    pending: { color: "#4a4a6a", bg: "#0d0d14", border: "#1e1e2e" },
    error: { color: "#ef4444", bg: "#2e0d0d", border: "#4a1a1a" },
  };

  const theme = data?.dominant_theme ?? "pending";
  const sc = SIGNAL_COLOR[theme] ?? {
    color: "#7c7cdc",
    bg: "#13133a",
    border: "#2a2a6a",
  };
  const isQuiet =
    !data?.brief ||
    data.article_count === 0 ||
    theme === "pending" ||
    theme === "quiet";
  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      style={{
        background: "#0a0a12",
        border: "1px solid #1e1e2e",
        borderLeft: `2px solid ${sc.color}`,
        borderRadius: "0 6px 6px 0",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
      }}
    >
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        .spin { animation:spin 0.7s linear infinite;display:inline-block; }
        .brief-btn { background:transparent;border:1px solid #1e1e2e;border-radius:3px;padding:2px 8px;font-size:8px;color:#4a4a6a;cursor:pointer;font-family:inherit;letter-spacing:0.05em;transition:all 0.15s;display:flex;align-items:center;gap:4px;white-space:nowrap; }
        .brief-btn:hover:not(:disabled) { border-color:#2a2a6a;color:#7c7cdc; }
        .brief-btn:disabled { opacity:0.35;cursor:not-allowed; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#4a4a6a",
            letterSpacing: "0.1em",
          }}
        >
          AI MARKET BRIEF
        </span>

        {!isQuiet && (
          <span
            style={{
              background: sc.bg,
              color: sc.color,
              border: `1px solid ${sc.border}`,
              fontSize: 8,
              padding: "1px 6px",
              borderRadius: 3,
              letterSpacing: "0.05em",
            }}
          >
            {theme.toUpperCase()}
          </span>
        )}

        {data?.affected_etfs?.map((etf) => (
          <span
            key={etf}
            style={{
              background: "#13133a",
              color: "#7c7cdc",
              border: "1px solid #2a2a6a",
              fontSize: 8,
              padding: "1px 4px",
              borderRadius: 3,
              fontWeight: 700,
            }}
          >
            {etf}
          </span>
        ))}

        {!isQuiet && data?.article_count != null && (
          <span style={{ fontSize: 8, color: "#2a2a4a" }}>
            {data.article_count} signals
          </span>
        )}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 1,
            }}
          >
            {generatedAt && (
              <span style={{ fontSize: 8, color: "#2a2a4a" }}>
                {generatedAt}
                {data?.provider ? ` · ${data.provider}` : ""}
              </span>
            )}
            {countdown !== null && countdown > 0 && !isQuiet && (
              <span style={{ fontSize: 8, color: "#1e1e3a" }}>
                refreshes in {countdown}m
              </span>
            )}
          </div>

          <button
            className="brief-btn"
            onClick={() => generate()}
            disabled={generating}
          >
            <span
              className={spinning ? "spin" : ""}
              style={{ fontSize: 10, lineHeight: 1 }}
            >
              ↻
            </span>
            {generating ? "generating..." : "refresh"}
          </button>
        </div>
      </div>

      <div style={{ height: 1, background: "#1a1a2a" }} />

      {/* Body */}
      {isLoading ? (
        <div style={{ fontSize: 10, color: "#3a3a5a" }}>loading...</div>
      ) : generating ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="spin" style={{ fontSize: 12, color: "#4a4a6a" }}>
            ↻
          </span>
          <span style={{ fontSize: 11, color: "#3a3a5a", fontStyle: "italic" }}>
            analysing signals...
          </span>
        </div>
      ) : isQuiet ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11, color: "#3a3a5a", lineHeight: 1.6 }}>
            Market is quiet — no major signals in the last 6 hours.{" "}
            <span style={{ color: "#2a2a4a" }}>
              Run ingestion from the sidebar to fetch latest news, then hit
              refresh.
            </span>
          </div>
          <button
            className="brief-btn"
            onClick={() => generate()}
            disabled={generating}
            style={{ flexShrink: 0, borderColor: "#2a2a6a", color: "#7c7cdc" }}
          >
            <span className={spinning ? "spin" : ""} style={{ fontSize: 10 }}>
              ↻
            </span>
            refresh
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#a0a0c0", lineHeight: 1.7 }}>
          {data?.brief}
        </div>
      )}
    </div>
  );
}
