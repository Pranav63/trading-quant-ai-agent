"use client";
import { useQuery } from "@tanstack/react-query";
import { getMacroStrip, MacroIndicator } from "@/lib/api";

function MacroTile({ ind }: { ind: MacroIndicator }) {
  if (ind.value === null) return null;

  const up = (ind.change ?? 0) > 0;
  const down = (ind.change ?? 0) < 0;
  const flat = (ind.change ?? 0) === 0;

  // VIX: up = bad (red), down = good (green)
  // Spread: negative = bad (red)
  const isVix = ind.id === "VIXCLS";
  const isSpread = ind.id === "T10Y2Y";

  let changeColor = "#4a4a6a";
  if (!flat) {
    if (isVix) changeColor = up ? "#ef4444" : "#22c55e";
    else if (isSpread) changeColor = ind.value < 0 ? "#ef4444" : "#22c55e";
    else changeColor = up ? "#22c55e" : "#ef4444";
  }

  const arrow = flat ? "" : up ? "▲" : "▼";
  const fmt = (v: number) => (ind.unit === "$" ? v.toFixed(2) : v.toFixed(2));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "4px 12px",
        borderRight: "1px solid #1a1a2a",
        minWidth: 90,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 8,
          color: "#3a3a5a",
          letterSpacing: "0.08em",
          fontWeight: 600,
        }}
      >
        {ind.label.toUpperCase()}
        {ind.id && (
          <span style={{ color: "#2a2a4a", marginLeft: 3 }}>{ind.id}</span>
        )}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: changeColor === "#4a4a6a" ? "#c0c0d8" : changeColor,
          }}
        >
          {ind.unit === "$"
            ? `$${fmt(ind.value)}`
            : `${fmt(ind.value)}${ind.unit}`}
        </span>
        {ind.change !== null && ind.change !== 0 && (
          <span style={{ fontSize: 9, color: changeColor }}>
            {arrow}
            {Math.abs(ind.change).toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MacroStrip() {
  const { data, isLoading } = useQuery({
    queryKey: ["macro_strip"],
    queryFn: getMacroStrip,
    refetchInterval: 30 * 60 * 1000, // FRED updates slowly
    staleTime: 15 * 60 * 1000,
  });

  if (isLoading || !data) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "#080810",
        borderBottom: "1px solid #1a1a2a",
        overflowX: "auto",
        flexShrink: 0,
      }}
      className="scroll-hide"
    >
      <span
        style={{
          fontSize: 8,
          fontWeight: 700,
          color: "#3a3a5a",
          letterSpacing: "0.1em",
          padding: "0 12px",
          borderRight: "1px solid #1a1a2a",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        MACRO
      </span>
      {data.indicators.map((ind) => (
        <MacroTile key={ind.id} ind={ind} />
      ))}
      {data.indicators[0]?.date && (
        <span
          style={{
            fontSize: 8,
            color: "#2a2a4a",
            padding: "0 12px",
            flexShrink: 0,
            marginLeft: "auto",
          }}
        >
          FRED · {data.indicators[0].date}
        </span>
      )}
    </div>
  );
}
