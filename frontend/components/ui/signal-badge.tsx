import { cn } from "@/lib/utils"

export function SignalBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
      type === "BUY" && "bg-green-500/10 text-green-500",
      type === "SELL" && "bg-red-500/10 text-red-500",
      type === "HOLD" && "bg-yellow-500/10 text-yellow-500",
    )}>
      {type}
    </span>
  )
}
