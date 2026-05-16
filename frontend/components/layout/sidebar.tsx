"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { triggerIngestion, getPendingTrades } from "@/lib/api";

const nav = [
  { href: "/dashboard", label: "dashboard", icon: "⬜" },
  { href: "/portfolio", label: "portfolio", icon: "◈" },
  { href: "/signals",   label: "signals",   icon: "◎" },
  { href: "/trades",    label: "trades",    icon: "◇" },
  { href: "/news",      label: "news",      icon: "◉" },
];

const INGESTION_STEPS = [
  { label: "fetch news",       detail: "Finnhub, NewsAPI, Reuters, WSJ, FT, FRED" },
  { label: "classify signals", detail: "CRITICAL / ELEVATED / MONITORING / NOISE" },
  { label: "run LLM",          detail: "generates BUY/SELL signals via Groq + Gemini" },
  { label: "create trades",    detail: "pending trades queued for your approval" },
  { label: "update brief",     detail: "AI market brief regenerated" },
];

const handleLogout = async () => {
  await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });
  window.location.href = "/login";
};

export function Sidebar() {
  const path = usePathname();
  const qc = useQueryClient();
  const [showInfo, setShowInfo] = useState(false);

  const { data: pending } = useQuery({ queryKey: ["pending"], queryFn: getPendingTrades });

  const { mutate: runIngestion, isPending } = useMutation({
    mutationFn: triggerIngestion,
    onSuccess: () => setTimeout(() => qc.invalidateQueries(), 15000),
  });

  return (
    <aside style={{ position: "fixed", left: 0, top: 0, height: "100vh", width: 220, background: "#0d0d14", borderRight: "1px solid #1e1e2e", display: "flex", flexDirection: "column", fontFamily: "var(--dash-mono)" }}>
      <style>{`
        .sidebar-nav-link { display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:5px;font-size:11px;color:#4a4a6a;text-decoration:none;transition:all 0.15s;letter-spacing:0.04em; }
        .sidebar-nav-link:hover { background:#111118;color:#8a8ab0; }
        .sidebar-nav-link.active { background:#13133a;color:#7c7cdc; }
        .ingest-btn { width:100%;padding:9px 12px;border-radius:5px;font-size:11px;font-family:var(--dash-mono);letter-spacing:0.06em;cursor:pointer;transition:all 0.15s;border:1px solid #2a2a6a; }
        .ingest-btn:not(:disabled):hover { background:#1a1a4a; }
        .ingest-btn:disabled { cursor:not-allowed; }
        .info-btn { background:transparent;border:none;cursor:pointer;color:#2a2a4a;font-size:11px;padding:0;transition:color 0.15s;line-height:1; }
        .info-btn:hover { color:#7c7cdc; }
        .signout-btn { width:100%;background:transparent;border:none;color:#2a2a4a;font-size:10px;cursor:pointer;font-family:var(--dash-mono);text-align:left;padding:6px 6px;letter-spacing:0.04em;border-radius:4px;transition:all 0.15s; }
        .signout-btn:hover { color:#4a4a6a;background:#111118; }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        .spinning { display:inline-block;animation:spin 1s linear infinite; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.25} }
      `}</style>

      {/* Logo */}
      <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #1e1e2e" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#7c7cdc", letterSpacing: "0.04em" }}>⬡ trading agent</div>
        <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 4, letterSpacing: "0.08em" }}>PAPER MODE · ALPACA</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {nav.map(({ href, label, icon }) => {
          const isActive = path === href;
          const hasBadge = href === "/trades" && !!pending?.length;
          return (
            <Link key={href} href={href} className={`sidebar-nav-link${isActive ? " active" : ""}`}>
              <span style={{ fontSize: 14, opacity: 0.8 }}>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {hasBadge && (
                <span style={{ background: "#2e2a00", color: "#f59e0b", border: "1px solid #4a3a00", fontSize: 10, padding: "1px 6px", borderRadius: 3, fontWeight: 600 }}>
                  {pending!.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Ingestion */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid #1e1e2e", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className="ingest-btn"
            onClick={() => runIngestion()}
            disabled={isPending}
            style={{ flex: 1, background: isPending ? "#111118" : "#13133a", color: isPending ? "#4a4a6a" : "#7c7cdc" }}
          >
            <span className={isPending ? "spinning" : ""} style={{ marginRight: 6 }}>⚡</span>
            {isPending ? "ingesting..." : "run ingestion"}
          </button>
          <button className="info-btn" onClick={() => setShowInfo(v => !v)} title="what does this do?" style={{ color: showInfo ? "#7c7cdc" : undefined }}>
            {showInfo ? "✕" : "?"}
          </button>
        </div>

        {showInfo && (
          <div style={{ background: "#080810", border: "1px solid #1e1e2e", borderRadius: 5, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#4a4a6a", letterSpacing: "0.1em", marginBottom: 2 }}>WHAT INGESTION DOES</div>
            {INGESTION_STEPS.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: "#7c7cdc", background: "#13133a", border: "1px solid #2a2a6a", borderRadius: 2, padding: "1px 4px", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 10, color: "#8a8ab0" }}>{step.label}</div>
                  <div style={{ fontSize: 9, color: "#3a3a5a", marginTop: 1 }}>{step.detail}</div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 9, color: "#2a2a4a", borderTop: "1px solid #1a1a2a", paddingTop: 6, marginTop: 2 }}>
              also runs automatically every 15 min
            </div>
          </div>
        )}

        {!showInfo && <div style={{ fontSize: 10, color: "#2a2a4a", textAlign: "center", letterSpacing: "0.04em" }}>auto every 15 min</div>}
      </div>

      {/* Sign out + status */}
      <div style={{ borderTop: "1px solid #1e1e2e", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <button className="signout-btn" onClick={handleLogout}>↩ sign out</button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#4a4a6a", padding: "2px 6px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s ease-in-out infinite", display: "inline-block" }} />
          backend connected
        </div>
      </div>
    </aside>
  );
}