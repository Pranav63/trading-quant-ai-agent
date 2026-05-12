"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { triggerIngestion, getPendingTrades } from "@/lib/api";

const nav = [
  { href: "/dashboard", label: "dashboard", icon: "⬜" },
  { href: "/portfolio", label: "portfolio", icon: "◈" },
  { href: "/signals", label: "signals", icon: "◎" },
  { href: "/trades", label: "trades", icon: "◇" },
  { href: "/news", label: "news", icon: "◉" },
];

export function Sidebar() {
  const path = usePathname();
  const qc = useQueryClient();
  const { data: pending } = useQuery({
    queryKey: ["pending"],
    queryFn: getPendingTrades,
  });

  const { mutate: runIngestion, isPending } = useMutation({
    mutationFn: triggerIngestion,
    onSuccess: () => setTimeout(() => qc.invalidateQueries(), 15000),
  });

  return (
    <aside
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: 220,
        background: "#0d0d14",
        borderRight: "1px solid #1e1e2e",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--dash-mono)",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "20px 16px 16px",
          borderBottom: "1px solid #1e1e2e",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#7c7cdc",
            letterSpacing: "0.04em",
          }}
        >
          ⬡ trading agent
        </div>
        <div
          style={{
            fontSize: 10,
            color: "#4a4a6a",
            marginTop: 4,
            letterSpacing: "0.08em",
          }}
        >
          PAPER MODE · ALPACA
        </div>
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: "12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {nav.map(({ href, label, icon }) => {
          const isActive = path === href;
          const hasBadge = href === "/trades" && !!pending?.length;
          return (
            <Link
              key={href}
              href={href}
              className={`dash-nav-link${isActive ? " active" : ""}`}
            >
              <span style={{ fontSize: 14, opacity: 0.8 }}>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {hasBadge && (
                <span
                  style={{
                    background: "#2e2a00",
                    color: "#f59e0b",
                    border: "1px solid #4a3a00",
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 3,
                    fontWeight: 600,
                  }}
                >
                  {pending!.length}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Ingestion trigger */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid #1e1e2e" }}>
        <button
          onClick={() => runIngestion()}
          disabled={isPending}
          style={{
            width: "100%",
            padding: "9px 12px",
            background: isPending ? "#111118" : "#13133a",
            color: isPending ? "#4a4a6a" : "#7c7cdc",
            border: "1px solid #2a2a6a",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "var(--dash-mono)",
            letterSpacing: "0.06em",
            cursor: isPending ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          {isPending ? "⟳ ingesting..." : "⚡ run ingestion"}
        </button>
        <div
          style={{
            fontSize: 10,
            color: "#4a4a6a",
            textAlign: "center",
            marginTop: 8,
            letterSpacing: "0.04em",
          }}
        >
          auto every 15 min
        </div>
      </div>

      {/* Status bar */}
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid #1e1e2e",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          color: "#4a4a6a",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#22c55e",
            animation: "pulse 2s ease-in-out infinite",
            display: "inline-block",
          }}
        />
        backend connected
      </div>
    </aside>
  );
}
