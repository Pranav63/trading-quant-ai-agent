import { cn } from "@/lib/utils"

const styles: Record<string, string> = {
  PENDING:   "bg-yellow-500/10 text-yellow-500",
  APPROVED:  "bg-blue-500/10 text-blue-500",
  EXECUTED:  "bg-green-500/10 text-green-500",
  REJECTED:  "bg-red-500/10 text-red-400",
  CANCELLED: "bg-zinc-500/10 text-zinc-400",
  FAILED:    "bg-red-700/10 text-red-600",
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
      styles[status] ?? "bg-zinc-500/10 text-zinc-400"
    )}>
      {status.toLowerCase()}
    </span>
  )
}
