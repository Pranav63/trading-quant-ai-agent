"use client";
import { useQuery } from "@tanstack/react-query";
import { getActivityFeed, ActivityEvent } from "@/lib/api";

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function ActivityFeed({ maxItems = 20 }: { maxItems?: number }) {
  const { data: events } = useQuery({
    queryKey: ["activity"],
    queryFn: getActivityFeed,
    refetchInterval: 5000,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events?.slice(0, maxItems).map((e) => (
        <div
          key={e.id}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "5px 0",
            borderBottom: "1px solid #1e1e2e",
            animation: "fadeIn 0.2s ease",
          }}
        >
          <span
            style={{
              color: e.color,
              fontSize: 12,
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {e.icon}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: 9,
                color: e.color,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginRight: 6,
                fontWeight: 600,
              }}
            >
              {e.label}
            </span>
            <span style={{ fontSize: 11, color: "#c0c0d8", lineHeight: 1.4 }}>
              {e.message}
            </span>
          </div>
          <span
            style={{
              fontSize: 9,
              color: "#4a4a6a",
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {timeAgo(e.ts)}
          </span>
        </div>
      ))}
      {!events?.length && (
        <div style={{ fontSize: 11, color: "#4a4a6a", padding: "8px 0" }}>
          no activity yet — run ingestion
        </div>
      )}
    </div>
  );
}
