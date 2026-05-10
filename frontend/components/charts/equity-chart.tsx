"use client"
import { useEffect, useRef } from "react"
import { PortfolioHistory } from "@/types"
import { fmt$$ } from "@/lib/utils"

export function EquityChart({ data }: { data: PortfolioHistory }) {
  if (!data.timestamps.length) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        no history yet — check back after market open
      </div>
    )
  }

  const min = Math.min(...data.equity)
  const max = Math.max(...data.equity)
  const range = max - min || 1
  const w = 600
  const h = 160
  const pad = 8

  const points = data.equity.map((v, i) => {
    const x = pad + (i / (data.equity.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  })

  const polyline = points.join(" ")
  const first = data.equity[0]
  const last = data.equity[data.equity.length - 1]
  const isUp = last >= first
  const color = isUp ? "#22c55e" : "#ef4444"

  const firstPt = points[0].split(",")
  const lastPt = points[points.length - 1].split(",")
  const fillPath = `M${firstPt[0]},${h - pad} L${polyline.split(" ").join(" L")} L${lastPt[0]},${h - pad} Z`

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{fmt$$(min)}</span>
        <span className={`text-sm font-medium ${isUp ? "text-green-500" : "text-red-500"}`}>
          {fmt$$(last)} {isUp ? "▲" : "▼"} {fmt$$(last - first)}
        </span>
        <span className="text-xs text-muted-foreground">{fmt$$(max)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 160 }}>
        <path d={fillPath} fill={color} fillOpacity={0.08} />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  )
}