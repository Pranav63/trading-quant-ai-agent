import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  sub?: string
  trend?: "up" | "down" | "neutral"
  className?: string
}

export function StatCard({ label, value, sub, trend, className }: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5", className)}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn(
        "text-2xl font-medium mt-1 tabular-nums",
        trend === "up" && "text-green-500",
        trend === "down" && "text-red-500",
      )}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}
